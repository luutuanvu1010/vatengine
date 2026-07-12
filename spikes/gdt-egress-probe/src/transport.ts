// GdtTransport — trừu tượng hóa đường ra (egress) tới GDT.
// Mọi lời gọi GDT phải đi qua interface này để có thể hoán đổi đường ra
// (Cloudflare trực tiếp ↔ relay đặt tại Việt Nam) mà không đụng logic nghiệp vụ.
// Xem ADR-0001 mục 5B.

import { connect } from "cloudflare:sockets";

export type ProbeVerdict = "OK" | "GEO_BLOCKED" | "RATE_LIMITED" | "TIMEOUT" | "ERROR";

export interface ProbeResult {
  transport: string;
  verdict: ProbeVerdict;
  httpStatus?: number;
  egressIp?: string;
  egressCountry?: string;
  latencyMs: number;
  note?: string;
}

export interface GdtTransport {
  readonly name: string;
  fetch(url: string, init?: RequestInit): Promise<Response>;
  probe(opts: ProbeOptions): Promise<ProbeResult>;
}

export interface ProbeOptions {
  // Endpoint công khai, nhẹ của GDT để thử với (KHÔNG cần đăng nhập).
  gdtProbeUrl: string;
  // Dịch vụ echo để lấy IP + quốc gia egress (Cloudflare trace).
  traceUrl: string;
  timeoutMs: number;
}

// Phân loại kết quả một lần gọi thành ProbeVerdict.
export function classify(
  status: number | undefined,
  timedOut: boolean,
  errored: boolean,
): ProbeVerdict {
  if (timedOut) return "TIMEOUT";
  if (errored) return "ERROR";
  if (status === undefined) return "ERROR";
  if (status === 403 || status === 451) return "GEO_BLOCKED"; // 451 = Unavailable For Legal Reasons
  if (status === 429) return "RATE_LIMITED";
  if (status >= 200 && status < 500) return "OK"; // 4xx nghiệp vụ vẫn nghĩa là "tới được máy chủ"
  return "ERROR";
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// Đọc IP + quốc gia egress từ endpoint dạng Cloudflare trace (key=value theo dòng).
async function readEgress(
  traceUrl: string,
  timeoutMs: number,
): Promise<{ ip?: string; country?: string }> {
  try {
    const res = await fetchWithTimeout(traceUrl, { method: "GET" }, timeoutMs);
    const text = await res.text();
    const map = Object.fromEntries(
      text
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const i = line.indexOf("=");
          return [line.slice(0, i), line.slice(i + 1)];
        }),
    );
    return { ip: map.ip, country: map.loc };
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// T0 — Đường ra trực tiếp từ biên Cloudflare (thuần Cloudflare).
// ---------------------------------------------------------------------------
export class DirectTransport implements GdtTransport {
  readonly name = "direct-cf";

  async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    return fetch(url, init);
  }

  async probe(opts: ProbeOptions): Promise<ProbeResult> {
    const started = Date.now();
    const egress = await readEgress(opts.traceUrl, opts.timeoutMs);
    let status: number | undefined;
    let timedOut = false;
    let errored = false;
    try {
      const res = await fetchWithTimeout(opts.gdtProbeUrl, { method: "GET" }, opts.timeoutMs);
      status = res.status;
      // Giải phóng body nếu không đọc.
      res.body?.cancel();
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") timedOut = true;
      else errored = true;
    }
    return {
      transport: this.name,
      verdict: classify(status, timedOut, errored),
      httpStatus: status,
      egressIp: egress.ip,
      egressCountry: egress.country,
      latencyMs: Date.now() - started,
    };
  }
}

// ---------------------------------------------------------------------------
// T1 — Relay đặt tại Việt Nam. Worker POST gói request tới relay (mTLS + secret),
// relay chuyển tiếp tới GDT rồi trả nguyên response. Relay STATELESS, chỉ forward.
// Ở spike này chỉ minh hoạ hợp đồng; endpoint relay khai báo qua biến môi trường.
// ---------------------------------------------------------------------------
export class VnRelayTransport implements GdtTransport {
  readonly name = "vn-relay";
  constructor(
    private relayUrl: string,
    private relaySecret: string,
  ) {}

  async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    return fetch(this.relayUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-relay-secret": this.relaySecret, // production: dùng mTLS thay/bổ sung
      },
      body: JSON.stringify({
        method: init.method ?? "GET",
        url,
        headers: init.headers ?? {},
        body: init.body ?? null,
      }),
    });
  }

  async probe(opts: ProbeOptions): Promise<ProbeResult> {
    const started = Date.now();
    let status: number | undefined;
    let timedOut = false;
    let errored = false;
    let egressCountry: string | undefined;
    let egressIp: string | undefined;
    try {
      const res = await fetchWithTimeout(
        this.relayUrl,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-relay-secret": this.relaySecret },
          body: JSON.stringify({
            method: "GET",
            url: opts.gdtProbeUrl,
            headers: {},
            body: null,
            wantEgress: true,
          }),
        },
        opts.timeoutMs,
      );
      status = res.status;
      // Quy ước: relay trả header cho biết IP/quốc gia egress của chính nó.
      egressIp = res.headers.get("x-relay-egress-ip") ?? undefined;
      egressCountry = res.headers.get("x-relay-egress-country") ?? undefined;
      res.body?.cancel();
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") timedOut = true;
      else errored = true;
    }
    return {
      transport: this.name,
      verdict: classify(status, timedOut, errored),
      httpStatus: status,
      egressIp,
      egressCountry,
      latencyMs: Date.now() - started,
      note: "Cần relay VN đang chạy; nếu chưa dựng sẽ ra ERROR/TIMEOUT.",
    };
  }
}

// ---------------------------------------------------------------------------
// T-origin — Thử gọi THẲNG origin IP của GDT (bỏ qua phân giải tên miền, vốn
// hiện route vào lớp fronting/CDN phía trước GDT), giữ nguyên Host + SNI TLS =
// hoadondientu.gdt.gov.vn. Chỉ dùng để đo khả năng kết nối trực tiếp origin
// cho spike này — KHÔNG phải một GdtTransport dùng trong production.
// Chỉ gọi endpoint công khai /captcha, một lần, không đăng nhập.
// ---------------------------------------------------------------------------
export interface OriginProbeOptions {
  originIp: string;
  originPort: number;
  sniHost: string;
  path: string;
  timeoutMs: number;
}

export interface OriginProbeResult {
  transport: "direct-origin";
  method: "fetch-resolveOverride" | "tcp-raw" | "none";
  verdict: ProbeVerdict;
  httpStatus?: number;
  latencyMs: number;
  bodyPreview?: string;
  note?: string;
}

export class DirectOriginTransport {
  readonly name = "direct-origin" as const;

  // (a) fetch() với cf.resolveOverride — ghi đè phân giải DNS về IP origin,
  // giữ nguyên Host/SNI. Chỉ hoạt động nếu origin nằm trong mạng Cloudflare;
  // nếu không, runtime sẽ báo lỗi và ta rơi xuống (b).
  private async tryFetchResolveOverride(
    opts: OriginProbeOptions,
    started: number,
  ): Promise<OriginProbeResult | null> {
    const url = `https://${opts.sniHost}:${opts.originPort}${opts.path}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), opts.timeoutMs);
    try {
      const res = await fetch(url, {
        method: "GET",
        signal: ctrl.signal,
        // `cf` là mở rộng riêng của Workers runtime, không có trong lib.dom types.
        cf: { resolveOverride: opts.originIp } as unknown as RequestInitCfProperties,
      } as RequestInit);
      const text = await res.text();
      return {
        transport: this.name,
        method: "fetch-resolveOverride",
        verdict: classify(res.status, false, false),
        httpStatus: res.status,
        latencyMs: Date.now() - started,
        bodyPreview: text.slice(0, 200),
      };
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        return {
          transport: this.name,
          method: "fetch-resolveOverride",
          verdict: "TIMEOUT",
          latencyMs: Date.now() - started,
          note: `fetch(resolveOverride) timeout sau ${opts.timeoutMs}ms`,
        };
      }
      // Có thể là lỗi "resolveOverride chỉ áp dụng cho origin trong mạng Cloudflare"
      // hoặc lỗi runtime khác — trả về null để thử (b), nhưng giữ note lại.
      return null;
    } finally {
      clearTimeout(t);
    }
  }

  // (b) TCP connect() thô (Workers TCP Sockets API) — mở kết nối TCP trực tiếp
  // tới IP origin, bật TLS, tự gửi request dòng lệnh HTTP/1.1 với Host = SNI.
  private async tryTcpRaw(opts: OriginProbeOptions, started: number): Promise<OriginProbeResult> {
    let socket: ReturnType<typeof connect> | undefined;
    let closeReason: string | undefined;
    try {
      socket = connect(
        { hostname: opts.originIp, port: opts.originPort },
        { secureTransport: "on", allowHalfOpen: false },
      );
      // Bắt lý do đóng sớm (VD: kết nối bị reset/refused) để chẩn đoán khi read() trả done ngay.
      socket.closed
        .then(() => {
          closeReason = closeReason ?? "closed bình thường";
        })
        .catch((e) => {
          closeReason = String(e instanceof Error ? e.message : e);
        });
      await socket.opened; // chờ TLS handshake xong trước khi ghi — ném lỗi ngay nếu bị reset/refused.

      const writer = socket.writable.getWriter();
      const req = `GET ${opts.path} HTTP/1.1\r\nHost: ${opts.sniHost}\r\nConnection: close\r\n\r\n`;
      await writer.write(new TextEncoder().encode(req));
      await writer.close();

      const reader = socket.readable.getReader();
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("tcp-raw timeout")), opts.timeoutMs);
      });
      let raw = "";
      const decoder = new TextDecoder();
      while (raw.length < 4096) {
        const { value, done } = await Promise.race([reader.read(), timeoutPromise]);
        if (done) break;
        raw += decoder.decode(value, { stream: true });
      }
      await socket.close().catch(() => {});

      const statusMatch = raw.match(/^HTTP\/1\.[01] (\d{3})/);
      const status = statusMatch ? Number(statusMatch[1]) : undefined;
      return {
        transport: this.name,
        method: "tcp-raw",
        verdict: classify(status, false, status === undefined),
        httpStatus: status,
        latencyMs: Date.now() - started,
        bodyPreview: raw.slice(0, 300),
        note:
          status === undefined
            ? `Không đọc được status line HTTP từ response thô.${closeReason ? ` closeReason=${closeReason}` : ""}`
            : undefined,
      };
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e);
      const timedOut = msg.includes("timeout");
      return {
        transport: this.name,
        method: "tcp-raw",
        verdict: timedOut ? "TIMEOUT" : "ERROR",
        latencyMs: Date.now() - started,
        note: `TCP connect() thất bại: ${msg}${closeReason ? ` closeReason=${closeReason}` : ""}`,
      };
    }
  }

  // force: bỏ qua bước (a), chỉ dùng để đối chiếu bằng chứng cho cơ chế (b) khi debug spike.
  async probeOrigin(opts: OriginProbeOptions, force?: "fetch" | "tcp"): Promise<OriginProbeResult> {
    const started = Date.now();
    if (force !== "tcp") {
      const viaFetch = await this.tryFetchResolveOverride(opts, started);
      if (viaFetch) return viaFetch;
    }
    return this.tryTcpRaw(opts, started);
  }
}

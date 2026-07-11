// GdtTransport — trừu tượng hóa đường ra (egress) tới GDT.
// Mọi lời gọi GDT phải đi qua interface này để có thể hoán đổi đường ra
// (Cloudflare trực tiếp ↔ relay đặt tại Việt Nam) mà không đụng logic nghiệp vụ.
// Xem ADR-0001 mục 5B.

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
export function classify(status: number | undefined, timedOut: boolean, errored: boolean): ProbeVerdict {
  if (timedOut) return "TIMEOUT";
  if (errored) return "ERROR";
  if (status === undefined) return "ERROR";
  if (status === 403 || status === 451) return "GEO_BLOCKED"; // 451 = Unavailable For Legal Reasons
  if (status === 429) return "RATE_LIMITED";
  if (status >= 200 && status < 500) return "OK"; // 4xx nghiệp vụ vẫn nghĩa là "tới được máy chủ"
  return "ERROR";
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// Đọc IP + quốc gia egress từ endpoint dạng Cloudflare trace (key=value theo dòng).
async function readEgress(traceUrl: string, timeoutMs: number): Promise<{ ip?: string; country?: string }> {
  try {
    const res = await fetchWithTimeout(traceUrl, { method: "GET" }, timeoutMs);
    const text = await res.text();
    const map = Object.fromEntries(
      text.split("\n").filter(Boolean).map((line) => {
        const i = line.indexOf("=");
        return [line.slice(0, i), line.slice(i + 1)];
      }),
    );
    return { ip: map["ip"], country: map["loc"] };
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
          body: JSON.stringify({ method: "GET", url: opts.gdtProbeUrl, headers: {}, body: null, wantEgress: true }),
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

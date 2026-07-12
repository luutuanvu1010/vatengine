// Spike: gọi thử đường ra (egress) tới GDT và phân loại kết quả.
// Mục tiêu: xác minh THỰC TẾ liệu Workers (IP biên Cloudflare) có gọi được
// hoadondientu.gdt.gov.vn hay bị chặn theo địa lý — trước khi chốt ADR-0001.
//
// Chạy:  npx wrangler dev   rồi mở http://localhost:8787/
//        (hoặc deploy rồi gọi qua HTTPS để test IP egress thật của biên CF)
//
// KHÔNG phá captcha, KHÔNG đăng nhập — chỉ gọi endpoint công khai để đo khả năng tới máy chủ.

import {
  DirectOriginTransport,
  DirectTransport,
  type GdtTransport,
  type OriginProbeResult,
  type ProbeOptions,
  type ProbeResult,
  VnRelayTransport,
} from "./transport";

export interface Env {
  // Endpoint công khai, nhẹ của GDT dùng để thử. Cấu hình qua wrangler vars.
  GDT_PROBE_URL: string;
  // Cloudflare trace để đọc IP + quốc gia egress.
  TRACE_URL: string;
  PROBE_TIMEOUT_MS: string;
  // (Tùy chọn) relay VN — nếu đã dựng.
  VN_RELAY_URL?: string;
  VN_RELAY_SECRET?: string;
  // Thử gọi thẳng origin IP của GDT (bỏ qua phân giải tên, giữ Host+SNI).
  GDT_ORIGIN_IP: string;
  GDT_ORIGIN_PORT: string;
  GDT_ORIGIN_SNI_HOST: string;
  GDT_ORIGIN_PATH: string;
}

function transportsFor(env: Env): GdtTransport[] {
  const list: GdtTransport[] = [new DirectTransport()];
  if (env.VN_RELAY_URL && env.VN_RELAY_SECRET) {
    list.push(new VnRelayTransport(env.VN_RELAY_URL, env.VN_RELAY_SECRET));
  }
  return list;
}

async function runProbe(
  env: Env,
): Promise<{ decidedTransport: string | null; results: ProbeResult[] }> {
  const opts: ProbeOptions = {
    gdtProbeUrl: env.GDT_PROBE_URL,
    traceUrl: env.TRACE_URL,
    timeoutMs: Number(env.PROBE_TIMEOUT_MS ?? "8000"),
  };
  const results: ProbeResult[] = [];
  for (const t of transportsFor(env)) {
    results.push(await t.probe(opts));
  }
  // Quyết định: chọn transport đầu tiên có verdict OK theo thứ tự ưu tiên (T0 trước T1).
  const decided = results.find((r) => r.verdict === "OK")?.transport ?? null;
  return { decidedTransport: decided, results };
}

// Thử riêng: gọi thẳng origin IP của GDT, giữ Host+SNI, bỏ qua phân giải tên
// (vốn hiện route vào lớp fronting/CDN phía trước GDT). Chỉ /captcha, một lần.
async function runOriginProbe(env: Env, force?: "fetch" | "tcp"): Promise<OriginProbeResult> {
  const t = new DirectOriginTransport();
  return t.probeOrigin(
    {
      originIp: env.GDT_ORIGIN_IP,
      originPort: Number(env.GDT_ORIGIN_PORT ?? "30000"),
      sniHost: env.GDT_ORIGIN_SNI_HOST,
      path: env.GDT_ORIGIN_PATH ?? "/captcha",
      timeoutMs: Number(env.PROBE_TIMEOUT_MS ?? "8000"),
    },
    force,
  );
}

export default {
  // Gọi thử theo yêu cầu (HTTP) — tiện xem kết quả trên trình duyệt.
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/origin") {
      const force = url.searchParams.get("force");
      const originResult = await runOriginProbe(
        env,
        force === "tcp" || force === "fetch" ? force : undefined,
      );
      const advice =
        originResult.verdict === "OK"
          ? `✅ Origin GDT nhận kết nối trực tiếp qua ${originResult.method} — cần đối chiếu bodyPreview để chắc là JSON captcha thật.`
          : originResult.verdict === "GEO_BLOCKED"
            ? `⚠️ Origin từ chối theo địa lý/HTTP (403/451) qua ${originResult.method}.`
            : originResult.verdict === "TIMEOUT"
              ? `❌ Origin không phản hồi trong timeout qua ${originResult.method}.`
              : `❌ Không kết nối được origin qua ${originResult.method} (httpStatus=${originResult.httpStatus ?? "n/a"}). Thử '?force=tcp' để kiểm cơ chế còn lại.`;
      return Response.json({ advice, ...originResult }, { status: 200 });
    }

    const report = await runProbe(env);
    const advice =
      report.decidedTransport === "direct-cf"
        ? "✅ T0 (thuần Cloudflare) gọi được GDT — có thể giữ kiến trúc thuần Cloudflare."
        : report.decidedTransport === "vn-relay"
          ? "⚠️ T0 bị chặn, phải dùng T1 (relay VN) — KHÔNG còn thuần Cloudflare."
          : "❌ Cả T0 và T1 đều không tới được GDT — xem lại endpoint/relay/timeout.";
    return Response.json({ advice, ...report }, { status: 200 });
  },

  // Gọi thử định kỳ (Cron) — trong production sẽ ghi trạng thái vào Durable Object/KV
  // và đẩy metric sang Analytics Engine; ở spike chỉ log.
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const report = await runProbe(env);
    console.log("gdt-egress-probe", JSON.stringify(report));
  },
} satisfies ExportedHandler<Env>;

// Spike: gọi thử đường ra (egress) tới GDT và phân loại kết quả.
// Mục tiêu: xác minh THỰC TẾ liệu Workers (IP biên Cloudflare) có gọi được
// hoadondientu.gdt.gov.vn hay bị chặn theo địa lý — trước khi chốt ADR-0001.
//
// Chạy:  npx wrangler dev   rồi mở http://localhost:8787/
//        (hoặc deploy rồi gọi qua HTTPS để test IP egress thật của biên CF)
//
// KHÔNG phá captcha, KHÔNG đăng nhập — chỉ gọi endpoint công khai để đo khả năng tới máy chủ.

import {
  DirectTransport,
  type GdtTransport,
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

export default {
  // Gọi thử theo yêu cầu (HTTP) — tiện xem kết quả trên trình duyệt.
  async fetch(_req: Request, env: Env): Promise<Response> {
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

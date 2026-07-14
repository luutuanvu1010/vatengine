// GIÁM SÁT (mục C) — Durable Object singleton giữ health-state probe egress
// (gdt-adapter.md: "lưu trạng thái sức khỏe trong Durable Object"). WIRING MỎNG:
// chỉ nạp/lưu HealthState; logic gộp verdict thuần ở health.ts (đã test). Toàn hệ
// thống, không theo tenant → dùng MỘT id cố định ("egress"). KHÔNG test-cover (cần
// runtime DO thật; logic đã phủ ở unit health.test.ts/egressProbe.test.ts).
import { HEALTHY, type HealthState } from "./health";

const STATE_KEY = "state";
const SINGLETON_NAME = "egress";

export class EgressHealth {
  private readonly ctx: DurableObjectState;

  constructor(ctx: DurableObjectState) {
    this.ctx = ctx;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/load") {
      const stored = await this.ctx.storage.get<HealthState>(STATE_KEY);
      return Response.json(stored ?? HEALTHY);
    }
    if (url.pathname === "/save") {
      const state = (await req.json()) as HealthState;
      await this.ctx.storage.put(STATE_KEY, state);
      return Response.json({ ok: true });
    }
    return new Response("not found", { status: 404 });
  }
}

/** Adapter DO singleton → { loadHealth, saveHealth } cho runEgressProbe. */
export function egressHealthClient(ns: DurableObjectNamespace) {
  const stub = ns.get(ns.idFromName(SINGLETON_NAME));
  return {
    async loadHealth(): Promise<HealthState> {
      const res = await stub.fetch("https://egress-health/load");
      return (await res.json()) as HealthState;
    },
    async saveHealth(state: HealthState): Promise<void> {
      await stub.fetch("https://egress-health/save", {
        method: "POST",
        body: JSON.stringify(state),
      });
    },
  };
}

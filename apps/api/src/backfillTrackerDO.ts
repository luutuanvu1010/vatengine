// U22 B4 — Durable Object theo dõi một backfill (docs/plans/U22-plan.md §4C PA-A,
// ADR-0001: trạng thái phối hợp ở DO). WIRING MỎNG: chỉ nạp/lưu ĐỊNH NGHĨA backfill +
// ủy quyền cho logic THUẦN đã test ở backfillTracker.ts. Đơn luồng theo thiết kế DO →
// không cần khóa. KHÔNG test-cover (cần runtime DO thật; logic đã phủ ở
// backfillTracker.test.ts — giống loginLimiterDO/tenantLimiter). Tiến độ từng tháng
// SUY từ lan_dong_bo ở tầng GET (B6), DO chỉ giữ danh sách tháng của backfill này.
import { type BackfillDef, initDef, readDef } from "./backfillTracker";
import type { BackfillTrackerClient, Env } from "./types";

const DEF_KEY = "def";

export class BackfillTracker {
  private readonly ctx: DurableObjectState;

  constructor(ctx: DurableObjectState, _env: Env) {
    this.ctx = ctx;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    // Khởi tạo store-once (idempotent): producer B5 gọi khi tạo backfill. Trả `created`
    // để producer biết đây có phải lần đầu (quyết định enqueue) — AC5. Trùng backfillId
    // của TENANT KHÁC → 409, KHÔNG echo def tenant kia (cách ly, nhất quán với /def).
    if (url.pathname === "/init" && req.method === "POST") {
      const incoming = (await req.json()) as BackfillDef;
      const existing = await this.ctx.storage.get<BackfillDef>(DEF_KEY);
      const r = initDef(existing, incoming);
      if (r.status === "conflict") return new Response("conflict", { status: 409 });
      if (r.status === "created") await this.ctx.storage.put(DEF_KEY, r.def);
      return Response.json({ def: r.def, created: r.status === "created" });
    }

    // Đọc def có kiểm phạm vi tenant (x-tenant-id: KHÔNG đặt định danh vào URL). Def của
    // tenant khác / chưa init → 404 (readDef trả null, không rò tồn tại chéo tenant).
    if (url.pathname === "/def") {
      const tenantId = req.headers.get("x-tenant-id") ?? "";
      const stored = await this.ctx.storage.get<BackfillDef>(DEF_KEY);
      const def = readDef(stored, tenantId);
      if (!def) return new Response("not found", { status: 404 });
      return Response.json({ def });
    }

    return new Response("not found", { status: 404 });
  }
}

/** Adapter DO stub → BackfillTrackerClient. Khóa theo backfillId (UUID) ⇒ mỗi backfill
 * một DO. Thiếu namespace (binding chưa bật) → client NÉM rõ khi dùng: backfill KHÔNG
 * fail-open (không tracker thì không theo dõi được); producer B5 tự trả 503 khi thiếu. */
export function backfillTrackerClient(
  ns: DurableObjectNamespace | undefined,
  backfillId: string,
): BackfillTrackerClient {
  if (!ns) {
    const unavailable = (): never => {
      throw new Error("BACKFILL_TRACKER binding không khả dụng");
    };
    return { init: unavailable, get: unavailable };
  }
  const stub = ns.get(ns.idFromName(backfillId));
  return {
    async init(def) {
      const res = await stub.fetch("https://backfill/init", {
        method: "POST",
        body: JSON.stringify(def),
      });
      // 409 = backfillId trùng của tenant khác (va chạm UUID / lỗi sinh id ở B5). Ném để
      // producer xử lý rõ, KHÔNG nuốt lặng — không đọc def của tenant kia.
      if (!res.ok) throw new Error(`backfill init không thành công (HTTP ${res.status})`);
      return (await res.json()) as { def: BackfillDef; created: boolean };
    },
    async get(tenantId) {
      const res = await stub.fetch("https://backfill/def", {
        headers: { "x-tenant-id": tenantId },
      });
      if (res.status === 404) return null;
      return ((await res.json()) as { def: BackfillDef }).def;
    },
  };
}

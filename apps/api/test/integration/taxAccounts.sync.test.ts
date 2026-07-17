// "Đồng bộ ngay" — POST /tax-accounts/:id/sync: đẩy job (purchase+sold, kỳ hiện tại) vào
// SYNC_QUEUE để sync-worker kéo hóa đơn. API chỉ PRODUCER (stateless). RBAC + cách ly tenant
// như các route tax-account khác. Token phải CÒN HẠN (job nền không tự đăng nhập).
import { type SyncJobMessage, currentPeriodWindow } from "@vat/sync";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import {
  type Db,
  bearer,
  freshDb,
  injectDb,
  makeEnv,
  makeTenant,
  seedTaxAccount,
  tokenFor,
} from "../helpers";

function fakeQueue() {
  const batches: { body: SyncJobMessage }[] = [];
  const queue = {
    send: async () => {},
    sendBatch: async (msgs: Iterable<{ body: SyncJobMessage }>) => {
      for (const m of msgs) batches.push(m);
    },
  };
  return { queue: queue as unknown as Queue<SyncJobMessage>, batches };
}

// Queue 429: Cloudflare Queues ném khi vượt 5000 msg/giây/queue (sự cố bão backfill).
function rateLimitedQueue() {
  return {
    send: async () => {},
    sendBatch: async () => {
      throw new Error("Queue sendBatch failed: Too Many Requests");
    },
  } as unknown as Queue<SyncJobMessage>;
}

describe("POST /tax-accounts/:id/sync — Đồng bộ ngay", () => {
  let db: Db;
  beforeEach(async () => {
    db = await freshDb();
  });

  it("token còn hạn → enqueue 2 job (purchase+sold) kỳ hiện tại, 202", async () => {
    const t = await makeTenant(db, "DN A", "0100000001");
    const acc = await seedTaxAccount(db, t, {
      username: "0311772540",
      uyQuyenLuc: new Date("2026-07-01T00:00:00Z"),
      tokenHetHan: new Date(Date.now() + 3_600_000),
      tokenHienTai: "v1$aesgcm$secret",
    });
    const { queue, batches } = fakeQueue();
    const app = createApp(injectDb(db));
    const res = await app.request(
      `/tax-accounts/${acc}/sync`,
      { method: "POST", headers: bearer(await tokenFor(t, { role: "quan_tri" })) },
      makeEnv({ SYNC_QUEUE: queue }),
    );
    expect(res.status).toBe(202);
    const w = currentPeriodWindow(Date.now());
    expect(await res.json()).toEqual({ enqueued: 2, period: w.period });
    expect(batches).toHaveLength(2);
    const msgs = batches.map((b) => b.body);
    expect(msgs.map((m) => m.direction).sort()).toEqual(["purchase", "sold"]);
    for (const m of msgs) {
      expect(m.tenantId).toBe(t);
      expect(m.taikhoanId).toBe(acc);
      expect(m.period).toBe(w.period);
      expect(m.dateFrom).toBe(w.dateFrom);
    }
  });

  it("khác tenant → 404, KHÔNG enqueue (cách ly)", async () => {
    const a = await makeTenant(db, "DN A", "0100000001");
    const b = await makeTenant(db, "DN B", "0100000002");
    const accA = await seedTaxAccount(db, a, {
      username: "0311772540",
      tokenHetHan: new Date(Date.now() + 3_600_000),
      tokenHienTai: "v1$aesgcm$secret",
    });
    const { queue, batches } = fakeQueue();
    const app = createApp(injectDb(db));
    const res = await app.request(
      `/tax-accounts/${accA}/sync`,
      { method: "POST", headers: bearer(await tokenFor(b, { role: "quan_tri" })) },
      makeEnv({ SYNC_QUEUE: queue }),
    );
    expect(res.status).toBe(404);
    expect(batches).toHaveLength(0);
  });

  it("token hết hạn → 409 token_het_han, KHÔNG enqueue", async () => {
    const t = await makeTenant(db, "DN A", "0100000001");
    const acc = await seedTaxAccount(db, t, {
      username: "0311772540",
      tokenHetHan: new Date(Date.now() - 1_000),
      tokenHienTai: "v1$aesgcm$secret",
    });
    const { queue, batches } = fakeQueue();
    const app = createApp(injectDb(db));
    const res = await app.request(
      `/tax-accounts/${acc}/sync`,
      { method: "POST", headers: bearer(await tokenFor(t, { role: "quan_tri" })) },
      makeEnv({ SYNC_QUEUE: queue }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()) as Record<string, unknown>).toEqual({ error: "token_het_han" });
    expect(batches).toHaveLength(0);
  });

  it("queue 429 (Too Many Requests) → 503 sync_busy, KHÔNG 500", async () => {
    const t = await makeTenant(db, "DN A", "0100000001");
    const acc = await seedTaxAccount(db, t, {
      username: "0311772540",
      tokenHetHan: new Date(Date.now() + 3_600_000),
      tokenHienTai: "v1$aesgcm$secret",
    });
    const app = createApp(injectDb(db));
    const res = await app.request(
      `/tax-accounts/${acc}/sync`,
      { method: "POST", headers: bearer(await tokenFor(t, { role: "quan_tri" })) },
      makeEnv({ SYNC_QUEUE: rateLimitedQueue() }),
    );
    expect(res.status).toBe(503);
    expect((await res.json()) as Record<string, unknown>).toEqual({ error: "sync_busy" });
  });

  it("thiếu binding SYNC_QUEUE (dev/chưa cấu hình) → 503", async () => {
    const t = await makeTenant(db, "DN A", "0100000001");
    const acc = await seedTaxAccount(db, t, {
      username: "0311772540",
      tokenHetHan: new Date(Date.now() + 3_600_000),
      tokenHienTai: "v1$aesgcm$secret",
    });
    const app = createApp(injectDb(db));
    const res = await app.request(
      `/tax-accounts/${acc}/sync`,
      { method: "POST", headers: bearer(await tokenFor(t, { role: "quan_tri" })) },
      makeEnv(),
    );
    expect(res.status).toBe(503);
  });
});

// U26 (backfill dòng hàng) — POST /tax-accounts/:id/backfill-lines: enqueue 1 message
// chi tiết (`kind:"detail"`) / hóa đơn ĐANG THIẾU dòng hàng của tài khoản, dùng lại y
// hệt consumer pha 2 (BACKLOG [2026-07-16] Hướng A — trả nợ 2029 HĐ prod 0 dòng hàng).
// API chỉ PRODUCER (stateless). RBAC + cách ly tenant + token còn hạn: mirror
// /tax-accounts/:id/sync. Idempotent khi gọi lại (persist pha 2 xóa-chèn).
import { auditLog, withTenant } from "@vat/db";
import type { DetailSyncMessage } from "@vat/sync";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import {
  type Db,
  bearer,
  freshDb,
  injectDb,
  makeEnv,
  makeTenant,
  seedInvoice,
  seedTaxAccount,
  tokenFor,
} from "../helpers";

const MST = "0311772540"; // username tài khoản thuế = MST bên-mình

function fakeQueue() {
  const batches: { body: DetailSyncMessage }[] = [];
  const queue = {
    send: async () => {},
    sendBatch: async (msgs: Iterable<{ body: DetailSyncMessage }>) => {
      for (const m of msgs) batches.push(m);
    },
  };
  return { queue: queue as unknown as Queue<DetailSyncMessage>, batches };
}

// Queue 429: producer chạm trần 5000 msg/giây/queue khi enqueue hàng loạt (bão backfill).
function rateLimitedQueue() {
  return {
    send: async () => {},
    sendBatch: async () => {
      throw new Error("Queue sendBatch failed: Too Many Requests");
    },
  } as unknown as Queue<DetailSyncMessage>;
}

async function seedAccount(db: Db, tenantId: string, tokenOk = true): Promise<string> {
  return seedTaxAccount(db, tenantId, {
    username: MST,
    uyQuyenLuc: new Date("2026-07-01T00:00:00Z"),
    tokenHetHan: new Date(Date.now() + (tokenOk ? 3_600_000 : -1_000)),
    tokenHienTai: "v1$aesgcm$secret",
  });
}

describe("POST /tax-accounts/:id/backfill-lines — backfill dòng hàng (U26)", () => {
  let db: Db;
  beforeEach(async () => {
    db = await freshDb();
  });

  it("202: enqueue đúng 1 message detail / HĐ thiếu dòng hàng (mua→nmmst, bán→nbmst, sco giữ nguồn); audit ghi", async () => {
    const t = await makeTenant(db, "DN A", "0100000001");
    const acc = await seedAccount(db, t);
    const idMua = await seedInvoice(db, t, { shdon: "1", chieu: "purchase", nmmst: MST });
    const idBan = await seedInvoice(db, t, { shdon: "2", chieu: "sold", nbmst: MST });
    const idSco = await seedInvoice(db, t, {
      shdon: "3",
      chieu: "purchase",
      nmmst: MST,
      nguon: "sco",
    });
    await seedInvoice(db, t, { shdon: "4", chieu: "purchase", nmmst: "9999999999" }); // MST khác — ngoài phạm vi

    const { queue, batches } = fakeQueue();
    const app = createApp(injectDb(db));
    const res = await app.request(
      `/tax-accounts/${acc}/backfill-lines`,
      { method: "POST", headers: bearer(await tokenFor(t, { role: "quan_tri" })) },
      makeEnv({ SYNC_QUEUE: queue }),
    );
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ soHoaDonThieu: 3, soDaXepHang: 3, conLai: 0 });

    expect(batches).toHaveLength(3);
    const byHoaDon = new Map(batches.map((b) => [b.body.hoaDonId, b.body]));
    expect(byHoaDon.size).toBe(3);
    for (const m of batches.map((b) => b.body)) {
      expect(m.kind).toBe("detail");
      expect(m.tenantId).toBe(t);
      expect(m.taikhoanId).toBe(acc);
    }
    expect(byHoaDon.get(idMua)?.ref).toMatchObject({ shdon: "1", source: "normal" });
    expect(byHoaDon.get(idBan)?.ref).toMatchObject({ shdon: "2", source: "normal" });
    expect(byHoaDon.get(idSco)?.ref).toMatchObject({ shdon: "3", source: "sco" });

    await withTenant(db, t, async (tx) => {
      const audits = await tx.select().from(auditLog);
      expect(audits.some((a) => a.hanhDong === "backfill_dong_hang")).toBe(true);
    });
  });

  it("không còn HĐ thiếu → 202 {soHoaDonThieu:0}, KHÔNG enqueue", async () => {
    const t = await makeTenant(db, "DN A", "0100000001");
    const acc = await seedAccount(db, t);
    const { queue, batches } = fakeQueue();
    const app = createApp(injectDb(db));
    const res = await app.request(
      `/tax-accounts/${acc}/backfill-lines`,
      { method: "POST", headers: bearer(await tokenFor(t, { role: "quan_tri" })) },
      makeEnv({ SYNC_QUEUE: queue }),
    );
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ soHoaDonThieu: 0, soDaXepHang: 0, conLai: 0 });
    expect(batches).toHaveLength(0);
  });

  it("khác tenant → 404, KHÔNG enqueue (cách ly)", async () => {
    const a = await makeTenant(db, "DN A", "0100000001");
    const b = await makeTenant(db, "DN B", "0100000002");
    const accA = await seedAccount(db, a);
    await seedInvoice(db, a, { shdon: "1", chieu: "purchase", nmmst: MST });
    const { queue, batches } = fakeQueue();
    const app = createApp(injectDb(db));
    const res = await app.request(
      `/tax-accounts/${accA}/backfill-lines`,
      { method: "POST", headers: bearer(await tokenFor(b, { role: "quan_tri" })) },
      makeEnv({ SYNC_QUEUE: queue }),
    );
    expect(res.status).toBe(404);
    expect(batches).toHaveLength(0);
  });

  it("token hết hạn → 409 token_het_han, KHÔNG enqueue (message pha 2 cần token sống)", async () => {
    const t = await makeTenant(db, "DN A", "0100000001");
    const acc = await seedAccount(db, t, false);
    await seedInvoice(db, t, { shdon: "1", chieu: "purchase", nmmst: MST });
    const { queue, batches } = fakeQueue();
    const app = createApp(injectDb(db));
    const res = await app.request(
      `/tax-accounts/${acc}/backfill-lines`,
      { method: "POST", headers: bearer(await tokenFor(t, { role: "quan_tri" })) },
      makeEnv({ SYNC_QUEUE: queue }),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "token_het_han" });
    expect(batches).toHaveLength(0);
  });

  it("queue 429 (Too Many Requests) → 503 sync_busy, KHÔNG 500", async () => {
    const t = await makeTenant(db, "DN A", "0100000001");
    const acc = await seedAccount(db, t);
    await seedInvoice(db, t, { shdon: "1", chieu: "purchase", nmmst: MST });
    const app = createApp(injectDb(db));
    const res = await app.request(
      `/tax-accounts/${acc}/backfill-lines`,
      { method: "POST", headers: bearer(await tokenFor(t, { role: "quan_tri" })) },
      makeEnv({ SYNC_QUEUE: rateLimitedQueue(), BACKFILL_LINES_PACE_MS: "0" }),
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "sync_busy" });
  });

  it("thiếu binding SYNC_QUEUE → 503; vai ke_toan → 403 (RBAC như các route tax-account)", async () => {
    const t = await makeTenant(db, "DN A", "0100000001");
    const acc = await seedAccount(db, t);
    const app = createApp(injectDb(db));
    const res503 = await app.request(
      `/tax-accounts/${acc}/backfill-lines`,
      { method: "POST", headers: bearer(await tokenFor(t, { role: "quan_tri" })) },
      makeEnv(),
    );
    expect(res503.status).toBe(503);

    const { queue } = fakeQueue();
    const res403 = await app.request(
      `/tax-accounts/${acc}/backfill-lines`,
      { method: "POST", headers: bearer(await tokenFor(t, { role: "ke_toan" })) },
      makeEnv({ SYNC_QUEUE: queue }),
    );
    expect(res403.status).toBe(403);
  });
});

// U22 B5 — POST /tax-accounts/:id/backfill: producer backfill khoảng lọc quá khứ. Tính
// tháng CÒN THIẾU (mỗi chiều) trong khoảng → enqueue job (SyncJobMessage) + tạo
// BackfillTracker DO để theo dõi. Token phải CÒN HẠN (409); cách ly tenant (404); audit
// (AC7); idempotent: khoảng đã phủ → 0 job (AC5). Offline (PGlite + queue/tracker giả).
import { TRANG_THAI_LAN_DONG_BO, auditLog, lanDongBo } from "@vat/db";
import type { InvoiceDirection } from "@vat/gdt-client";
import type { SyncJobMessage } from "@vat/sync";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { type BackfillDef, initDef, readDef } from "../../src/backfillTracker";
import type { BackfillTrackerClient, Env } from "../../src/types";
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

// Queue 429: producer chạm trần 5000 msg/giây/queue (bão backfill dồn dập).
function rateLimitedQueue() {
  return {
    send: async () => {},
    sendBatch: async () => {
      throw new Error("Queue sendBatch failed: Too Many Requests");
    },
  } as unknown as Queue<SyncJobMessage>;
}

/** Tracker giả in-memory dùng ĐÚNG logic thuần initDef/readDef (như DO thật); phơi
 * `store` để test đối chiếu def đã lưu. */
function fakeTracker() {
  const store = new Map<string, BackfillDef>();
  const factory = (_env: Env, backfillId: string): BackfillTrackerClient => ({
    init: async (def) => {
      const r = initDef(store.get(backfillId), def);
      if (r.status === "conflict") throw new Error("backfill init conflict");
      if (r.status === "created") store.set(backfillId, r.def);
      return { def: r.def, created: r.status === "created" };
    },
    get: async (tenantId) => readDef(store.get(backfillId), tenantId),
  });
  return { factory, store };
}

async function seedRun(
  db: Db,
  o: { tenantId: string; taikhoanId: string; chieu: InvoiceDirection; period: string },
): Promise<void> {
  const m = /^(\d{4})-(\d{2})$/.exec(o.period);
  if (!m) throw new Error("period YYYY-MM");
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  await db.insert(lanDongBo).values({
    tenantId: o.tenantId,
    taikhoanId: o.taikhoanId,
    chieu: o.chieu,
    tuNgay: new Date(Date.UTC(y, mo - 1, 1)),
    denNgay: new Date(Date.UTC(y, mo - 1, lastDay)),
    soHdMoi: 0,
    soHdCapNhat: 0,
    trangThai: TRANG_THAI_LAN_DONG_BO.HOAN_THANH,
    batDau: new Date(Date.UTC(y, mo - 1, 1)),
    ketThuc: new Date(Date.UTC(y, mo - 1, lastDay)),
  });
}

const VALID_TOKEN = {
  tokenHetHan: new Date(Date.now() + 3_600_000),
  tokenHienTai: "v1$aesgcm$secret",
};
const BODY = { tuNgay: "2026-01-01", denNgay: "2026-03-31" }; // 3 tháng: 01,02,03

async function post(
  app: ReturnType<typeof createApp>,
  id: string,
  tenantId: string,
  env: Env,
  body: unknown = BODY,
) {
  return app.request(
    `/tax-accounts/${id}/backfill`,
    {
      method: "POST",
      headers: {
        ...bearer(await tokenFor(tenantId, { role: "quan_tri" })),
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
    env,
  );
}

describe("POST /tax-accounts/:id/backfill — producer backfill (U22 B5)", () => {
  let db: Db;
  beforeEach(async () => {
    db = await freshDb();
  });

  it("queue 429 (Too Many Requests) → 503 sync_busy, KHÔNG 500, KHÔNG tạo tracker", async () => {
    const t = await makeTenant(db, "DN A", "0100000001");
    const acc = await seedTaxAccount(db, t, { username: "0311772540", ...VALID_TOKEN });
    const { factory, store } = fakeTracker();
    const app = createApp(injectDb(db, undefined, undefined, undefined, factory));
    const res = await post(
      app,
      acc,
      t,
      makeEnv({ SYNC_QUEUE: rateLimitedQueue(), BACKFILL_TRACKER: {} as DurableObjectNamespace }),
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "sync_busy" });
    expect(store.size).toBe(0); // enqueue lỗi trước init → không để tracker mồ côi
  });

  it("chưa phủ tháng nào → enqueue N tháng × 2 chiều, tạo backfillId, lưu def tracker, 202", async () => {
    const t = await makeTenant(db, "DN A", "0100000001");
    const acc = await seedTaxAccount(db, t, { username: "0311772540", ...VALID_TOKEN });
    const { queue, batches } = fakeQueue();
    const { factory, store } = fakeTracker();
    const app = createApp(injectDb(db, undefined, undefined, undefined, factory));

    const res = await post(
      app,
      acc,
      t,
      makeEnv({ SYNC_QUEUE: queue, BACKFILL_TRACKER: {} as DurableObjectNamespace }),
    );

    expect(res.status).toBe(202);
    const b = (await res.json()) as {
      backfillId: string;
      thangCanLay: string[];
      tongSoThang: number;
    };
    expect(b.thangCanLay).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(b.tongSoThang).toBe(3);
    expect(typeof b.backfillId).toBe("string");

    expect(batches).toHaveLength(6); // 3 tháng × 2 chiều
    const msgs = batches.map((x) => x.body);
    expect(msgs.every((m) => m.tenantId === t && m.taikhoanId === acc)).toBe(true);
    expect(new Set(msgs.map((m) => m.direction))).toEqual(new Set(["purchase", "sold"]));
    expect(new Set(msgs.map((m) => m.period))).toEqual(new Set(["2026-01", "2026-02", "2026-03"]));

    // Tracker đã lưu ĐÚNG def cho backfillId trả về.
    const def = store.get(b.backfillId);
    expect(def).toMatchObject({
      tenantId: t,
      taikhoanId: acc,
      months: ["2026-01", "2026-02", "2026-03"],
    });
    expect(new Set(def?.directions)).toEqual(new Set(["purchase", "sold"]));

    // Audit ghi hành động khởi tạo backfill (AC7).
    const audits = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.tenantId, t), eq(auditLog.hanhDong, "backfill_khoi_tao")));
    expect(audits).toHaveLength(1);
  });

  it("(AC5 idempotent) tháng đã phủ (completed cả 2 chiều) → CHỈ enqueue tháng còn thiếu", async () => {
    const t = await makeTenant(db, "DN A", "0100000001");
    const acc = await seedTaxAccount(db, t, { username: "0311772540", ...VALID_TOKEN });
    // 2026-01 đã đồng bộ đủ 2 chiều → không backfill lại.
    await seedRun(db, { tenantId: t, taikhoanId: acc, chieu: "purchase", period: "2026-01" });
    await seedRun(db, { tenantId: t, taikhoanId: acc, chieu: "sold", period: "2026-01" });

    const { queue, batches } = fakeQueue();
    const { factory } = fakeTracker();
    const app = createApp(injectDb(db, undefined, undefined, undefined, factory));
    const res = await post(
      app,
      acc,
      t,
      makeEnv({ SYNC_QUEUE: queue, BACKFILL_TRACKER: {} as DurableObjectNamespace }),
    );

    expect(res.status).toBe(202);
    const b = (await res.json()) as { thangCanLay: string[]; tongSoThang: number };
    expect(b.thangCanLay).toEqual(["2026-02", "2026-03"]); // 2026-01 bị loại
    expect(b.tongSoThang).toBe(2);
    expect(batches).toHaveLength(4); // 2 tháng × 2 chiều
  });

  it("khoảng ĐÃ phủ hết → 202 {backfillId:null, tongSoThang:0}, KHÔNG enqueue, KHÔNG tạo tracker", async () => {
    const t = await makeTenant(db, "DN A", "0100000001");
    const acc = await seedTaxAccount(db, t, { username: "0311772540", ...VALID_TOKEN });
    for (const p of ["2026-01", "2026-02", "2026-03"]) {
      await seedRun(db, { tenantId: t, taikhoanId: acc, chieu: "purchase", period: p });
      await seedRun(db, { tenantId: t, taikhoanId: acc, chieu: "sold", period: p });
    }
    const { queue, batches } = fakeQueue();
    const { factory, store } = fakeTracker();
    const app = createApp(injectDb(db, undefined, undefined, undefined, factory));
    const res = await post(
      app,
      acc,
      t,
      makeEnv({ SYNC_QUEUE: queue, BACKFILL_TRACKER: {} as DurableObjectNamespace }),
    );

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ backfillId: null, thangCanLay: [], tongSoThang: 0 });
    expect(batches).toHaveLength(0);
    expect(store.size).toBe(0); // không tạo tracker khi không có gì để lấy
  });

  it("khác tenant → 404, KHÔNG enqueue (cách ly AC3)", async () => {
    const a = await makeTenant(db, "DN A", "0100000001");
    const bTen = await makeTenant(db, "DN B", "0100000002");
    const accA = await seedTaxAccount(db, a, { username: "0311772540", ...VALID_TOKEN });
    const { queue, batches } = fakeQueue();
    const { factory } = fakeTracker();
    const app = createApp(injectDb(db, undefined, undefined, undefined, factory));
    const res = await post(
      app,
      accA,
      bTen,
      makeEnv({ SYNC_QUEUE: queue, BACKFILL_TRACKER: {} as DurableObjectNamespace }),
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
    const { factory } = fakeTracker();
    const app = createApp(injectDb(db, undefined, undefined, undefined, factory));
    const res = await post(
      app,
      acc,
      t,
      makeEnv({ SYNC_QUEUE: queue, BACKFILL_TRACKER: {} as DurableObjectNamespace }),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "token_het_han" });
    expect(batches).toHaveLength(0);
  });

  it("thiếu SYNC_QUEUE → 503", async () => {
    const t = await makeTenant(db, "DN A", "0100000001");
    const acc = await seedTaxAccount(db, t, { username: "0311772540", ...VALID_TOKEN });
    const app = createApp(injectDb(db));
    const res = await post(
      app,
      acc,
      t,
      makeEnv({ BACKFILL_TRACKER: {} as DurableObjectNamespace }),
    );
    expect(res.status).toBe(503);
  });

  it("thiếu BACKFILL_TRACKER → 503", async () => {
    const t = await makeTenant(db, "DN A", "0100000001");
    const acc = await seedTaxAccount(db, t, { username: "0311772540", ...VALID_TOKEN });
    const { queue } = fakeQueue();
    const app = createApp(injectDb(db));
    const res = await post(app, acc, t, makeEnv({ SYNC_QUEUE: queue }));
    expect(res.status).toBe(503);
  });

  it("enqueue lỗi giữa chừng → 500, KHÔNG để lại tracker mồ côi (thứ tự enqueue trước init)", async () => {
    const t = await makeTenant(db, "DN A", "0100000001");
    const acc = await seedTaxAccount(db, t, { username: "0311772540", ...VALID_TOKEN });
    const throwingQueue = {
      send: async () => {},
      sendBatch: async () => {
        throw new Error("queue down");
      },
    } as unknown as Queue<SyncJobMessage>;
    const { factory, store } = fakeTracker();
    const app = createApp(injectDb(db, undefined, undefined, undefined, factory));
    const res = await post(
      app,
      acc,
      t,
      makeEnv({ SYNC_QUEUE: throwingQueue, BACKFILL_TRACKER: {} as DurableObjectNamespace }),
    );
    expect(res.status).toBe(500); // lỗi hạ tầng nổi lên, KHÔNG nuốt lặng
    expect(store.size).toBe(0); // enqueue TRƯỚC init → không có tracker "mồ côi không job"
  });

  it("body sai định dạng ngày → 400 (fail-loud, không đoán)", async () => {
    const t = await makeTenant(db, "DN A", "0100000001");
    const acc = await seedTaxAccount(db, t, { username: "0311772540", ...VALID_TOKEN });
    const { queue } = fakeQueue();
    const app = createApp(injectDb(db));
    const env = makeEnv({ SYNC_QUEUE: queue, BACKFILL_TRACKER: {} as DurableObjectNamespace });
    expect(
      (await post(app, acc, t, env, { tuNgay: "01/01/2026", denNgay: "2026-03-31" })).status,
    ).toBe(400);
    // khoảng đảo ngược cũng 400
    expect(
      (await post(app, acc, t, env, { tuNgay: "2026-03-01", denNgay: "2026-01-01" })).status,
    ).toBe(400);
  });
});

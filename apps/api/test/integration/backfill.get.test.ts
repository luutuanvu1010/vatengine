// U22 B6 — GET /backfill/:id: đọc def từ tracker (phạm vi tenant → 404) + suy trạng thái
// từng tháng từ lan_dong_bo. Offline (PGlite + tracker giả). Cách ly tenant (404 khi def
// thuộc tenant khác), 400 id sai, 503 thiếu binding.
import { TRANG_THAI_LAN_DONG_BO, lanDongBo } from "@vat/db";
import type { InvoiceDirection } from "@vat/gdt-client";
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

function fakeTracker() {
  const store = new Map<string, BackfillDef>();
  const factory = (_env: Env, backfillId: string): BackfillTrackerClient => ({
    init: async (def) => {
      const r = initDef(store.get(backfillId), def);
      if (r.status === "conflict") throw new Error("conflict");
      if (r.status === "created") store.set(backfillId, r.def);
      return { def: r.def, created: r.status === "created" };
    },
    get: async (tenantId) => readDef(store.get(backfillId), tenantId),
  });
  return { factory, store };
}

async function seedRun(
  db: Db,
  o: {
    tenantId: string;
    taikhoanId: string;
    chieu: InvoiceDirection;
    period: string;
    trangThai: string;
    /** Ghi đè bat_dau (mặc định: đầu tháng của period) — cho ca kiểm sinceMs. */
    batDau?: Date;
  },
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
    trangThai: o.trangThai,
    batDau: o.batDau ?? new Date(Date.UTC(y, mo - 1, 1)),
    ketThuc: new Date(Date.UTC(y, mo - 1, lastDay)),
  });
}

const BFID = "11111111-1111-4111-8111-111111111111";

async function get(app: ReturnType<typeof createApp>, id: string, tenantId: string, env: Env) {
  return app.request(
    `/backfill/${id}`,
    { headers: bearer(await tokenFor(tenantId, { role: "quan_tri" })) },
    env,
  );
}

describe("GET /backfill/:id — theo dõi tiến độ (U22 B6)", () => {
  let db: Db;
  beforeEach(async () => {
    db = await freshDb();
  });

  it("def hợp lệ → 200 + trạng thái từng tháng suy từ lan_dong_bo", async () => {
    const t = await makeTenant(db, "DN A", "0100000001");
    const acc = await seedTaxAccount(db, t, { username: "0311772540" });
    await seedRun(db, {
      tenantId: t,
      taikhoanId: acc,
      chieu: "purchase",
      period: "2026-01",
      trangThai: TRANG_THAI_LAN_DONG_BO.HOAN_THANH,
    });
    await seedRun(db, {
      tenantId: t,
      taikhoanId: acc,
      chieu: "sold",
      period: "2026-01",
      trangThai: TRANG_THAI_LAN_DONG_BO.HOAN_THANH,
    });
    await seedRun(db, {
      tenantId: t,
      taikhoanId: acc,
      chieu: "purchase",
      period: "2026-02",
      trangThai: TRANG_THAI_LAN_DONG_BO.DANG_CHAY,
    });

    const { factory, store } = fakeTracker();
    store.set(BFID, {
      tenantId: t,
      taikhoanId: acc,
      months: ["2026-01", "2026-02", "2026-03"],
      directions: ["purchase", "sold"],
      createdAtMs: 1,
    });
    const app = createApp(injectDb(db, undefined, undefined, factory));

    const res = await get(
      app,
      BFID,
      t,
      makeEnv({ BACKFILL_TRACKER: {} as DurableObjectNamespace }),
    );
    expect(res.status).toBe(200);
    const b = (await res.json()) as {
      backfillId: string;
      thang: { period: string; trangThai: string }[];
      soXong: number;
      tongSoThang: number;
      trangThaiTong: string;
    };
    expect(b.backfillId).toBe(BFID);
    expect(b.thang.map((x) => x.trangThai)).toEqual(["xong", "dang_chay", "cho"]);
    expect(b.soXong).toBe(1);
    expect(b.tongSoThang).toBe(3);
    expect(b.trangThaiTong).toBe("dang_chay");
  });

  // SỰ CỐ 2026-07-18: bản ghi failed CŨ (trước khi backfill này được tạo) làm banner
  // báo "loi" NGAY khi bấm. Route phải truyền def.createdAtMs (trừ biên đua 5s) xuống
  // monthlyBackfillStatus — ca này bắt đúng WIRING đó (review chéo Finding 3: test
  // trước đây dùng createdAtMs=1 nên filter luôn no-op, quên truyền cũng không lộ).
  it("failed CŨ hơn createdAtMs → KHÔNG 'co_loi'; failed MỚI sau createdAtMs → 'co_loi'", async () => {
    const t = await makeTenant(db, "DN A", "0100000001");
    const acc = await seedTaxAccount(db, t, { username: "0311772540" });
    const createdAt = Date.UTC(2026, 6, 18, 15, 7, 0); // backfill tạo 15:07Z 18/07

    // Lỗi CŨ (job của các lần bấm trước — 10:58Z cùng ngày, TRƯỚC createdAtMs).
    await seedRun(db, {
      tenantId: t,
      taikhoanId: acc,
      chieu: "purchase",
      period: "2026-05",
      trangThai: TRANG_THAI_LAN_DONG_BO.THAT_BAI,
      batDau: new Date(Date.UTC(2026, 6, 18, 10, 58, 0)),
    });

    const { factory, store } = fakeTracker();
    store.set(BFID, {
      tenantId: t,
      taikhoanId: acc,
      months: ["2026-05"],
      directions: ["purchase"],
      createdAtMs: createdAt,
    });
    const app = createApp(injectDb(db, undefined, undefined, factory));
    const env = makeEnv({ BACKFILL_TRACKER: {} as DurableObjectNamespace });

    const res1 = await get(app, BFID, t, env);
    expect(res1.status).toBe(200);
    const b1 = (await res1.json()) as { thang: { trangThai: string }[]; trangThaiTong: string };
    // Lỗi cũ bị bỏ qua → tháng còn 'cho', tổng 'dang_chay' (KHÔNG terminal co_loi).
    expect(b1.thang[0]?.trangThai).toBe("cho");
    expect(b1.trangThaiTong).toBe("dang_chay");

    // Job MỚI của chính backfill này thất bại (sau createdAtMs) → lỗi THẬT, phải hiện.
    await seedRun(db, {
      tenantId: t,
      taikhoanId: acc,
      chieu: "purchase",
      period: "2026-05",
      trangThai: TRANG_THAI_LAN_DONG_BO.THAT_BAI,
      batDau: new Date(createdAt + 60_000),
    });
    const res2 = await get(app, BFID, t, env);
    const b2 = (await res2.json()) as { thang: { trangThai: string }[]; trangThaiTong: string };
    expect(b2.thang[0]?.trangThai).toBe("loi");
    expect(b2.trangThaiTong).toBe("co_loi");
  });

  it("backfillId không tồn tại → 404", async () => {
    const t = await makeTenant(db, "DN A", "0100000001");
    const { factory } = fakeTracker();
    const app = createApp(injectDb(db, undefined, undefined, factory));
    const res = await get(
      app,
      BFID,
      t,
      makeEnv({ BACKFILL_TRACKER: {} as DurableObjectNamespace }),
    );
    expect(res.status).toBe(404);
  });

  it("def của tenant KHÁC → 404 (cách ly, không rò tồn tại chéo tenant)", async () => {
    const a = await makeTenant(db, "DN A", "0100000001");
    const bTen = await makeTenant(db, "DN B", "0100000002");
    const accA = await seedTaxAccount(db, a, { username: "0311772540" });
    const { factory, store } = fakeTracker();
    store.set(BFID, {
      tenantId: a,
      taikhoanId: accA,
      months: ["2026-01"],
      directions: ["purchase", "sold"],
      createdAtMs: 1,
    });
    const app = createApp(injectDb(db, undefined, undefined, factory));

    // Hỏi dưới ngữ cảnh tenant B → 404 (def thuộc tenant A).
    const res = await get(
      app,
      BFID,
      bTen,
      makeEnv({ BACKFILL_TRACKER: {} as DurableObjectNamespace }),
    );
    expect(res.status).toBe(404);
  });

  it("id không phải UUID → 400", async () => {
    const t = await makeTenant(db, "DN A", "0100000001");
    const { factory } = fakeTracker();
    const app = createApp(injectDb(db, undefined, undefined, factory));
    const res = await get(
      app,
      "khong-phai-uuid",
      t,
      makeEnv({ BACKFILL_TRACKER: {} as DurableObjectNamespace }),
    );
    expect(res.status).toBe(400);
  });

  it("thiếu binding BACKFILL_TRACKER → 503", async () => {
    const t = await makeTenant(db, "DN A", "0100000001");
    const { factory } = fakeTracker();
    const app = createApp(injectDb(db, undefined, undefined, factory));
    const res = await get(app, BFID, t, makeEnv());
    expect(res.status).toBe(503);
  });
});

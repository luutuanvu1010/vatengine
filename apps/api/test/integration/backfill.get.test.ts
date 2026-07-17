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
    batDau: new Date(Date.UTC(y, mo - 1, 1)),
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
    const app = createApp(injectDb(db, undefined, undefined, undefined, factory));

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

  it("backfillId không tồn tại → 404", async () => {
    const t = await makeTenant(db, "DN A", "0100000001");
    const { factory } = fakeTracker();
    const app = createApp(injectDb(db, undefined, undefined, undefined, factory));
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
    const app = createApp(injectDb(db, undefined, undefined, undefined, factory));

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
    const app = createApp(injectDb(db, undefined, undefined, undefined, factory));
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
    const app = createApp(injectDb(db, undefined, undefined, undefined, factory));
    const res = await get(app, BFID, t, makeEnv());
    expect(res.status).toBe(503);
  });
});

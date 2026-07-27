// Minh bạch tác vụ nền (hệ quả sự cố livelock 2026-07-27): người dùng không thấy
// phiên đồng bộ đang chạy nên bấm "Đồng bộ" lặp lại, tự gây bão trùng lặp.
//  - GET /tax-accounts/:id/sync-status: đếm chuỗi kéo delta đang chạy (run loai='sync'
//    trạng thái 'running' tươi) để UI hiển thị "x tác vụ nền".
//  - POST /tax-accounts/:id/backfill: response thêm `thangDangChay` — các kỳ trong
//    khoảng lọc ĐÃ có chuỗi chạy (audit trùng sẽ bị guard consumer ack, không tạo mới).
// Offline (PGlite + queue/tracker giả) — mirror taxAccounts.backfill.test.ts.
import { TRANG_THAI_LAN_DONG_BO, lanDongBo } from "@vat/db";
import type { InvoiceDirection } from "@vat/gdt-client";
import type { VatSyncQueueMessage } from "@vat/sync";
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
  const batches: { body: VatSyncQueueMessage }[] = [];
  const queue = {
    send: async () => {},
    sendBatch: async (msgs: Iterable<{ body: VatSyncQueueMessage }>) => {
      for (const m of msgs) batches.push(m);
    },
  };
  return { queue: queue as unknown as Queue<VatSyncQueueMessage>, batches };
}

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

/** Gieo một run `lan_dong_bo` với trạng thái/loại/tuổi tùy chọn (mặc định: chuỗi kéo
 * ĐANG CHẠY tươi — đúng hình dạng moDeltaRun tạo ra). */
async function seedRun(
  db: Db,
  o: {
    tenantId: string;
    taikhoanId: string;
    chieu: InvoiceDirection;
    period: string;
    trangThai?: string;
    loai?: string;
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
    trangThai: o.trangThai ?? TRANG_THAI_LAN_DONG_BO.DANG_CHAY,
    loai: o.loai ?? "sync",
    checkpoint: {},
    batDau: o.batDau ?? new Date(),
  });
}

const VALID_TOKEN = {
  tokenHetHan: new Date(Date.now() + 3_600_000),
  tokenHienTai: "v1$aesgcm$secret",
};

async function getStatus(
  app: ReturnType<typeof createApp>,
  id: string,
  tenantId: string,
  env: Env,
) {
  return app.request(
    `/tax-accounts/${id}/sync-status`,
    { headers: bearer(await tokenFor(tenantId, { role: "quan_tri" })) },
    env,
  );
}

describe("GET /tax-accounts/:id/sync-status — đếm tác vụ đồng bộ nền đang chạy", () => {
  let db: Db;
  let tenantId: string;
  let taikhoanId: string;

  beforeEach(async () => {
    db = await freshDb();
    tenantId = await makeTenant(db, "Cty A", "0100000001");
    taikhoanId = await seedTaxAccount(db, tenantId, { username: "0100000001", ...VALID_TOKEN });
  });

  it("không có run nào → {soTacVu: 0, thang: []}", async () => {
    const app = createApp(injectDb(db));
    const res = await getStatus(app, taikhoanId, tenantId, makeEnv());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ soTacVu: 0, thang: [] });
  });

  it("chuỗi đang chạy tươi → liệt kê; completed / audit / quá tuổi KHÔNG tính", async () => {
    await seedRun(db, { tenantId, taikhoanId, chieu: "purchase", period: "2026-07" });
    await seedRun(db, {
      tenantId,
      taikhoanId,
      chieu: "sold",
      period: "2026-07",
      trangThai: TRANG_THAI_LAN_DONG_BO.HOAN_THANH,
    });
    await seedRun(db, {
      tenantId,
      taikhoanId,
      chieu: "sold",
      period: "2026-06",
      trangThai: TRANG_THAI_LAN_DONG_BO.HOAN_THANH,
      loai: "audit",
    });
    await seedRun(db, {
      tenantId,
      taikhoanId,
      chieu: "sold",
      period: "2026-05",
      batDau: new Date(Date.now() - 3 * 3_600_000), // quá trần tuổi 2h → mồ côi, không tính
    });
    const app = createApp(injectDb(db));
    const res = await getStatus(app, taikhoanId, tenantId, makeEnv());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      soTacVu: number;
      thang: { period: string; chieu: string }[];
    };
    expect(body.soTacVu).toBe(1);
    expect(body.thang).toEqual([expect.objectContaining({ period: "2026-07", chieu: "purchase" })]);
  });

  it("tài khoản của tenant khác → 404 (cách ly, không rò tồn tại)", async () => {
    const tenantB = await makeTenant(db, "Cty B", "0100000002");
    const app = createApp(injectDb(db));
    const res = await getStatus(app, taikhoanId, tenantB, makeEnv());
    expect(res.status).toBe(404);
  });

  it("id không phải uuid → 400", async () => {
    const app = createApp(injectDb(db));
    const res = await getStatus(app, "khong-phai-uuid", tenantId, makeEnv());
    expect(res.status).toBe(400);
  });
});

describe("POST /tax-accounts/:id/backfill — response thêm thangDangChay", () => {
  let db: Db;
  let tenantId: string;
  let taikhoanId: string;

  beforeEach(async () => {
    db = await freshDb();
    tenantId = await makeTenant(db, "Cty A", "0100000001");
    taikhoanId = await seedTaxAccount(db, tenantId, { username: "0100000001", ...VALID_TOKEN });
  });

  async function post(app: ReturnType<typeof createApp>, env: Env) {
    return app.request(
      `/tax-accounts/${taikhoanId}/backfill`,
      {
        method: "POST",
        headers: {
          ...bearer(await tokenFor(tenantId, { role: "quan_tri" })),
          "content-type": "application/json",
        },
        body: JSON.stringify({ tuNgay: "2026-01-01", denNgay: "2026-03-31" }),
      },
      env,
    );
  }

  it("có chuỗi đang chạy cho 2026-02 trong khoảng → thangDangChay ['2026-02'], vẫn enqueue đủ audit (guard consumer lo khử trùng)", async () => {
    await seedRun(db, { tenantId, taikhoanId, chieu: "purchase", period: "2026-02" });
    await seedRun(db, { tenantId, taikhoanId, chieu: "sold", period: "2026-07" }); // ngoài khoảng — không tính
    const { queue, batches } = fakeQueue();
    const { factory } = fakeTracker();
    const app = createApp({ ...injectDb(db), getBackfillTracker: factory });
    const res = await post(app, makeEnv({ SYNC_QUEUE: queue, BACKFILL_TRACKER: {} as never }));
    expect(res.status).toBe(202);
    const body = (await res.json()) as {
      thangCanLay: string[];
      thangDangChay: string[];
    };
    expect(body.thangCanLay).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(body.thangDangChay).toEqual(["2026-02"]);
    // KHÔNG bỏ enqueue: audit trùng bị guard consumer ack rẻ; tracker giữ nguyên ngữ nghĩa.
    expect(batches.length).toBe(6); // 3 tháng × 2 chiều
  });

  it("không có chuỗi nào đang chạy → thangDangChay []", async () => {
    const { queue } = fakeQueue();
    const { factory } = fakeTracker();
    const app = createApp({ ...injectDb(db), getBackfillTracker: factory });
    const res = await post(app, makeEnv({ SYNC_QUEUE: queue, BACKFILL_TRACKER: {} as never }));
    expect(res.status).toBe(202);
    const body = (await res.json()) as { thangDangChay: string[] };
    expect(body.thangDangChay).toEqual([]);
  });
});

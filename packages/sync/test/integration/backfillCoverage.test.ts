// U22 B3 — Test (integration, PGlite) cho `coveredMonths`/`missingMonths`
// (docs/plans/U22-plan.md §4B, AC2). Suy từ `lan_dong_bo` (nguồn chân lý B1) xem
// tháng nào ĐÃ đồng bộ THÀNH CÔNG (completed) trong khoảng hỏi, phân biệt với "chưa
// từng". Offline hoàn toàn — không mock mạng (không gọi GDT); chỉ đọc DB thật (PGlite).
import { PGlite } from "@electric-sql/pglite";
import { TRANG_THAI_LAN_DONG_BO, lanDongBo, taiKhoanThue, tenants, withTenant } from "@vat/db";
import type { InvoiceDirection } from "@vat/gdt-client";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { coveredMonths, missingMonths } from "../../src/coverage";
import { monthlyWindows } from "../../src/syncJob";

const MIGRATIONS = new URL("../../../db/migrations", import.meta.url).pathname;

type Db = ReturnType<typeof drizzle>;

async function freshDb(): Promise<Db> {
  const db = drizzle(new PGlite());
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

async function makeTenant(db: Db, ten: string, mst: string): Promise<string> {
  const rows = await db.insert(tenants).values({ ten, mst }).returning({ id: tenants.id });
  const row = rows[0];
  if (!row) throw new Error("insert tenant không trả về id");
  return row.id;
}

async function makeTaxAccount(db: Db, tenantId: string, username: string): Promise<string> {
  const rows = await db
    .insert(taiKhoanThue)
    .values({ tenantId, username })
    .returning({ id: taiKhoanThue.id });
  const row = rows[0];
  if (!row) throw new Error("insert tai_khoan_thue không trả về id");
  return row.id;
}

/** Gieo MỘT bản ghi lan_dong_bo cho một kỳ (tu_ngay/den_ngay căn tháng đầy đủ như mọi
 * producer thật). `period` = "YYYY-MM". */
async function seedRun(
  db: Db,
  opts: {
    tenantId: string;
    taikhoanId: string;
    chieu: InvoiceDirection;
    period: string;
    trangThai: string;
    soHdMoi?: number;
  },
): Promise<void> {
  const pm = /^(\d{4})-(\d{2})$/.exec(opts.period);
  if (!pm) throw new Error(`period test phải YYYY-MM: ${opts.period}`);
  const y = Number(pm[1]);
  const m = Number(pm[2]);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const tuNgay = new Date(Date.UTC(y, m - 1, 1));
  const denNgay = new Date(Date.UTC(y, m - 1, lastDay));
  await db.insert(lanDongBo).values({
    tenantId: opts.tenantId,
    taikhoanId: opts.taikhoanId,
    chieu: opts.chieu,
    tuNgay,
    denNgay,
    soHdMoi: opts.soHdMoi ?? 0,
    soHdCapNhat: 0,
    trangThai: opts.trangThai,
    batDau: tuNgay,
    ketThuc: denNgay,
  });
}

// Khoảng hỏi dùng chung: Q1/2026 + tháng 4 = 4 cửa sổ.
const WINDOWS = monthlyWindows("2026-01-01", "2026-04-30"); // 2026-01..2026-04
const periods = (ws: { period: string }[]) => ws.map((w) => w.period);

describe("coveredMonths / missingMonths — suy phạm vi đã phủ từ lan_dong_bo (AC2)", () => {
  let db: Db;
  let tenantId: string;
  let taikhoanId: string;

  beforeEach(async () => {
    db = await freshDb();
    tenantId = await makeTenant(db, "Cty A", "0100000001");
    taikhoanId = await makeTaxAccount(db, tenantId, "0100000001-user");
  });

  const covered = (chieu: InvoiceDirection) =>
    withTenant(db, tenantId, (tx) => coveredMonths(tx, tenantId, taikhoanId, chieu, WINDOWS));
  const missing = (chieu: InvoiceDirection) =>
    withTenant(db, tenantId, (tx) => missingMonths(tx, tenantId, taikhoanId, chieu, WINDOWS));

  it("chưa có lan_dong_bo nào → không tháng nào phủ; MỌI tháng còn thiếu", async () => {
    expect([...(await covered("purchase"))]).toEqual([]);
    expect(periods(await missing("purchase"))).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
    ]);
  });

  it("có phiên 'completed' → đúng các tháng đó được phủ; missing = phần còn lại", async () => {
    await seedRun(db, {
      tenantId,
      taikhoanId,
      chieu: "purchase",
      period: "2026-01",
      trangThai: TRANG_THAI_LAN_DONG_BO.HOAN_THANH,
      soHdMoi: 5,
    });
    await seedRun(db, {
      tenantId,
      taikhoanId,
      chieu: "purchase",
      period: "2026-03",
      trangThai: TRANG_THAI_LAN_DONG_BO.HOAN_THANH,
      soHdMoi: 2,
    });

    expect([...(await covered("purchase"))].sort()).toEqual(["2026-01", "2026-03"]);
    expect(periods(await missing("purchase"))).toEqual(["2026-02", "2026-04"]);
  });

  it("(nối B1) tháng RỖNG THẬT completed (soHdMoi=0) VẪN tính là ĐÃ PHỦ (không backfill lại)", async () => {
    await seedRun(db, {
      tenantId,
      taikhoanId,
      chieu: "purchase",
      period: "2026-02",
      trangThai: TRANG_THAI_LAN_DONG_BO.HOAN_THANH,
      soHdMoi: 0,
    });
    expect([...(await covered("purchase"))]).toEqual(["2026-02"]);
    expect(periods(await missing("purchase"))).not.toContain("2026-02");
  });

  it("trạng thái KHÔNG thành công (running/failed/can_dang_nhap_lai/hoan_thanh_mot_phan) → CHƯA phủ", async () => {
    await seedRun(db, {
      tenantId,
      taikhoanId,
      chieu: "purchase",
      period: "2026-01",
      trangThai: TRANG_THAI_LAN_DONG_BO.DANG_CHAY,
    });
    await seedRun(db, {
      tenantId,
      taikhoanId,
      chieu: "purchase",
      period: "2026-02",
      trangThai: TRANG_THAI_LAN_DONG_BO.THAT_BAI,
    });
    await seedRun(db, {
      tenantId,
      taikhoanId,
      chieu: "purchase",
      period: "2026-03",
      trangThai: TRANG_THAI_LAN_DONG_BO.CAN_DANG_NHAP_LAI,
    });
    await seedRun(db, {
      tenantId,
      taikhoanId,
      chieu: "purchase",
      period: "2026-04",
      trangThai: TRANG_THAI_LAN_DONG_BO.HOAN_THANH_MOT_PHAN,
    });

    // Chỉ 'completed' tính là phủ → tất cả các tháng trên đều còn thiếu.
    expect([...(await covered("purchase"))]).toEqual([]);
    expect(periods(await missing("purchase"))).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
    ]);
  });

  it("cách ly CHIỀU: phiên 'completed' chiều purchase KHÔNG phủ cho chiều sold", async () => {
    await seedRun(db, {
      tenantId,
      taikhoanId,
      chieu: "purchase",
      period: "2026-01",
      trangThai: TRANG_THAI_LAN_DONG_BO.HOAN_THANH,
    });

    expect([...(await covered("purchase"))]).toEqual(["2026-01"]);
    expect([...(await covered("sold"))]).toEqual([]); // sold vẫn chưa phủ
    expect(periods(await missing("sold"))).toContain("2026-01");
  });

  it("cách ly TÀI KHOẢN: phiên 'completed' của tài khoản khác cùng tenant KHÔNG phủ", async () => {
    const acc2 = await makeTaxAccount(db, tenantId, "0100000001-user2");
    await seedRun(db, {
      tenantId,
      taikhoanId: acc2,
      chieu: "purchase",
      period: "2026-01",
      trangThai: TRANG_THAI_LAN_DONG_BO.HOAN_THANH,
    });

    expect([...(await covered("purchase"))]).toEqual([]); // taikhoanId (acc1) chưa phủ
  });

  // Test này chứng minh LỚP 1 (lọc `tenant_id` tường minh trong coveredMonths).
  // LỚP 2 (RLS FORCE chặn cả role owner non-superuser) dùng CÙNG cơ chế `withTenant` +
  // `tenantIsolationPolicy` và ĐÃ được chứng minh trực tiếp dưới role non-superuser ở
  // `sync.test.ts` (ca "(7) cách ly tenant … RLS FORCE, role non-superuser") — coverage
  // query đi qua đúng `withTenant` đó nên không lặp lại ca role ở đây (multi-tenant.md).
  it("cách ly TENANT: phiên 'completed' của tenant B KHÔNG phủ cho tenant A (lọc tenant_id tường minh)", async () => {
    const tenantB = await makeTenant(db, "Cty B", "0100000002");
    const accB = await makeTaxAccount(db, tenantB, "0100000002-user");
    await seedRun(db, {
      tenantId: tenantB,
      taikhoanId: accB,
      chieu: "purchase",
      period: "2026-02",
      trangThai: TRANG_THAI_LAN_DONG_BO.HOAN_THANH,
    });

    // Hỏi dưới ngữ cảnh tenant A → không thấy dữ liệu tenant B.
    expect([...(await covered("purchase"))]).toEqual([]);
    // Tenant B thấy đúng của mình.
    const coveredB = await withTenant(db, tenantB, (tx) =>
      coveredMonths(tx, tenantB, accB, "purchase", WINDOWS),
    );
    expect([...coveredB]).toEqual(["2026-02"]);
  });

  it("phiên 'completed' NGOÀI khoảng hỏi → không lẫn vào kết quả (bound đúng)", async () => {
    await seedRun(db, {
      tenantId,
      taikhoanId,
      chieu: "purchase",
      period: "2025-12",
      trangThai: TRANG_THAI_LAN_DONG_BO.HOAN_THANH,
    });
    await seedRun(db, {
      tenantId,
      taikhoanId,
      chieu: "purchase",
      period: "2026-05",
      trangThai: TRANG_THAI_LAN_DONG_BO.HOAN_THANH,
    });

    expect([...(await covered("purchase"))]).toEqual([]); // 2025-12 & 2026-05 ngoài [2026-01..04]
    expect(periods(await missing("purchase"))).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
    ]);
  });

  it("windows rỗng → covered rỗng, missing rỗng (biên an toàn, không truy vấn thừa)", async () => {
    const c = await withTenant(db, tenantId, (tx) =>
      coveredMonths(tx, tenantId, taikhoanId, "purchase", []),
    );
    const m = await withTenant(db, tenantId, (tx) =>
      missingMonths(tx, tenantId, taikhoanId, "purchase", []),
    );
    expect([...c]).toEqual([]);
    expect(m).toEqual([]);
  });
});

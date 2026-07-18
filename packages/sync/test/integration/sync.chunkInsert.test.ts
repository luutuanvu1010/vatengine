// SỰ CỐ 2026-07-18 (production, kỳ 2026-07 purchase): tháng nhiều hóa đơn (hàng nghìn
// sco) → upsertBatch INSERT TẤT CẢ trong MỘT câu lệnh → "Failed query: insert into
// hoa_don ..." (21 tham số/hàng; ~3.100 hàng là vượt trần 65.535 tham số của giao thức
// Postgres — CHƯA KIỂM CHỨNG con số chính xác vì cause không được lưu, nhưng chia lô
// chặn cả 3 họ nguyên nhân: trần tham số / kích thước câu lệnh / thời gian). Test chốt:
// lô LỚN HƠN INSERT_CHUNK_SIZE vẫn đồng bộ trọn vẹn, đếm đúng, idempotent khi chạy lại.
import { PGlite } from "@electric-sql/pglite";
import { TRANG_THAI_LAN_DONG_BO, hoaDon, taiKhoanThue, tenants } from "@vat/db";
import type { GdtTransport } from "@vat/gdt-client";
import { count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { INSERT_CHUNK_SIZE, sync } from "../../src/sync";

const MIGRATIONS = new URL("../../../db/migrations", import.meta.url).pathname;

type Db = ReturnType<typeof drizzle>;

async function freshDb(): Promise<Db> {
  const db = drizzle(new PGlite());
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

async function makeTenant(db: Db): Promise<string> {
  const rows = await db
    .insert(tenants)
    .values({ ten: "Tenant chia lô", mst: "0100000009" })
    .returning({ id: tenants.id });
  const row = rows[0];
  if (!row) throw new Error("insert tenant không trả về id");
  return row.id;
}

async function makeTaxAccount(db: Db, tenantId: string): Promise<string> {
  const rows = await db
    .insert(taiKhoanThue)
    .values({ tenantId, username: "0100000009" })
    .returning({ id: taiKhoanThue.id });
  const row = rows[0];
  if (!row) throw new Error("insert tai_khoan_thue không trả về id");
  return row.id;
}

// N hóa đơn hợp lệ (dạng THÔ như GDT trả trong `datas` — adapter tự gắn _source/_direction),
// shdon khác nhau (khóa tự nhiên khác nhau), raw nhỏ — test nhắm TẦNG INSERT, không nhắm
// phân trang (đã có test riêng ở gdt-client).
function invoices(n: number): Record<string, unknown>[] {
  return Array.from({ length: n }, (_, i) => ({
    nbmst: "0100000001",
    nbten: "Cty Bán X",
    nmmst: "0100000009",
    nmten: "Tenant chia lô",
    khmshdon: "1",
    khhdon: "C26TAA",
    shdon: String(i + 1),
    tdlap: "2026-07-05T03:00:00Z",
    ncnhat: "2026-07-06T09:00:00.000Z",
    tgtcthue: 100,
    tgtthue: 8,
    tgtttbso: 108,
    ttxly: 8,
    tthai: 1,
  }));
}

/** Trang duy nhất chứa toàn bộ `rows` (không `state` → hết trang). */
function transportReturning(rows: Record<string, unknown>[]): GdtTransport {
  return {
    name: "mock",
    async fetch() {
      return new Response(JSON.stringify({ datas: rows }), { status: 200 });
    },
    async probe() {
      throw new Error("test không dùng probe");
    },
  };
}

describe("sync — INSERT chia lô cho tháng nhiều hóa đơn (sự cố 2026-07-18)", () => {
  let db: Db;
  let tenantId: string;
  let taikhoanId: string;
  beforeEach(async () => {
    db = await freshDb();
    tenantId = await makeTenant(db);
    taikhoanId = await makeTaxAccount(db, tenantId);
  });

  it(`lô ${INSERT_CHUNK_SIZE + 50} hóa đơn (> INSERT_CHUNK_SIZE) → completed, đủ hàng, chạy lại không nhân đôi`, async () => {
    const n = INSERT_CHUNK_SIZE + 50;
    const chungOpts = {
      db,
      token: "jwt-test",
      tenantId,
      taikhoanId,
      direction: "purchase" as const,
      dateFrom: "01/07/2026",
      dateTo: "31/07/2026",
      includeSco: false,
    };

    const result = await sync({ ...chungOpts, transport: transportReturning(invoices(n)) });
    expect(result.thongDiepLoi).toBeUndefined();
    expect(result.trangThai).toBe(TRANG_THAI_LAN_DONG_BO.HOAN_THANH);
    expect(result.soHdMoi).toBe(n);
    const [c] = await db.select({ n: count() }).from(hoaDon).where(eq(hoaDon.tenantId, tenantId));
    expect(Number(c?.n)).toBe(n);

    // Idempotent (U5): chạy lại cùng kỳ → không "mới" nào nữa, không nhân đôi hàng.
    const again = await sync({ ...chungOpts, transport: transportReturning(invoices(n)) });
    expect(again.trangThai).toBe(TRANG_THAI_LAN_DONG_BO.HOAN_THANH);
    expect(again.soHdMoi).toBe(0);
    const [c2] = await db.select({ n: count() }).from(hoaDon).where(eq(hoaDon.tenantId, tenantId));
    expect(Number(c2?.n)).toBe(n);
  });
});

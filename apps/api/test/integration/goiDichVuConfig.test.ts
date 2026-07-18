// U17a — Đọc hạn mức theo GÓI thay hardcode. Fail-safe-to-DEFAULT: DB hỏng/thiếu hàng →
// rơi về hằng trong mã, KHÔNG fail-open (không mở toang hạn mức) và KHÔNG fail-closed
// (không khóa sạch khách). Đây là hạng thứ ba mã trước đây chưa có.
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { HAN_MUC_MAC_DINH, docCauHinhToanCuc, docHanMucGoi } from "../../src/goiDichVuConfig";
import { type Db, freshDb } from "../helpers";

describe("U17a — docHanMucGoi", () => {
  let db: Db;
  beforeEach(async () => {
    db = await freshDb();
  });

  it("gói free → hạn mức từ bảng, KHÔNG hardcode", async () => {
    const h = await docHanMucGoi(db, "free");
    expect(h.soMstToiDa).toBe(1);
    expect(h.choTaiKhoanCon).toBe(false);
    expect(h.ghInvoicesMoiPhut).toBe(120);
  });

  it("Admin đổi ngưỡng trong bảng → hạn mức đổi theo, KHÔNG cần deploy lại", async () => {
    await db.execute(
      sql`update goi_dich_vu set so_mst_toi_da = 5, gh_invoices_moi_phut = 300 where ma = 'free'`,
    );
    const h = await docHanMucGoi(db, "free");
    expect(h.soMstToiDa).toBe(5);
    expect(h.ghInvoicesMoiPhut).toBe(300);
  });

  it("giá trị phi lý trong DB → KẸP BIÊN, không khóa sạch khách", async () => {
    await db.execute(sql`update goi_dich_vu set so_mst_toi_da = 0 where ma = 'free'`);
    const h = await docHanMucGoi(db, "free");
    expect(h.soMstToiDa).toBeGreaterThanOrEqual(1);
  });

  it("giá trị phi lý lớn → KẸP BIÊN, không vô hiệu hóa chống lạm dụng", async () => {
    await db.execute(sql`update goi_dich_vu set gh_invoices_moi_phut = 9999999 where ma = 'free'`);
    const h = await docHanMucGoi(db, "free");
    expect(h.ghInvoicesMoiPhut).toBeLessThanOrEqual(10_000);
  });

  it("gói không tồn tại → rơi về mặc định trong mã (fail-safe-to-DEFAULT)", async () => {
    const h = await docHanMucGoi(db, "goi_khong_co");
    expect(h).toEqual(HAN_MUC_MAC_DINH);
  });

  it("DB hỏng (bảng bị xóa) → rơi về mặc định, KHÔNG ném ra ngoài", async () => {
    await db.execute(sql`drop table goi_dich_vu cascade`);
    const h = await docHanMucGoi(db, "free");
    expect(h).toEqual(HAN_MUC_MAC_DINH);
  });
});

describe("U17a — docCauHinhToanCuc (thứ tự DB → env → DEFAULT)", () => {
  let db: Db;
  const BIEN = { min: 1, max: 50 };
  beforeEach(async () => {
    db = await freshDb();
  });

  it("có trong DB → dùng giá trị DB (Admin thắng env)", async () => {
    await db.execute(
      sql`update cau_hinh_he_thong set gia_tri = '12' where khoa = 'dangky_max_moi_ip_gio'`,
    );
    const n = await docCauHinhToanCuc(
      db,
      "dangky_max_moi_ip_gio",
      { DANGKY_MAX_MOI_IP_GIO: "7" },
      "DANGKY_MAX_MOI_IP_GIO",
      BIEN,
      5,
    );
    expect(n).toBe(12);
  });

  it("không có trong DB → rơi xuống env", async () => {
    await db.execute(sql`delete from cau_hinh_he_thong where khoa = 'dangky_max_moi_ip_gio'`);
    const n = await docCauHinhToanCuc(
      db,
      "dangky_max_moi_ip_gio",
      { DANGKY_MAX_MOI_IP_GIO: "7" },
      "DANGKY_MAX_MOI_IP_GIO",
      BIEN,
      5,
    );
    expect(n).toBe(7);
  });

  it("không DB, không env → DEFAULT trong mã", async () => {
    await db.execute(sql`delete from cau_hinh_he_thong where khoa = 'dangky_max_moi_ip_gio'`);
    const n = await docCauHinhToanCuc(
      db,
      "dangky_max_moi_ip_gio",
      {},
      "DANGKY_MAX_MOI_IP_GIO",
      BIEN,
      5,
    );
    expect(n).toBe(5);
  });

  it("giá trị DB ngoài biên → KẸP, không để admin tắt chống spam", async () => {
    await db.execute(
      sql`update cau_hinh_he_thong set gia_tri = '99999' where khoa = 'dangky_max_moi_ip_gio'`,
    );
    const n = await docCauHinhToanCuc(
      db,
      "dangky_max_moi_ip_gio",
      {},
      "DANGKY_MAX_MOI_IP_GIO",
      BIEN,
      5,
    );
    expect(n).toBe(50);
  });

  it("DB hỏng → DEFAULT, không ném (fail-safe-to-DEFAULT)", async () => {
    await db.execute(sql`drop table cau_hinh_he_thong cascade`);
    const n = await docCauHinhToanCuc(
      db,
      "dangky_max_moi_ip_gio",
      {},
      "DANGKY_MAX_MOI_IP_GIO",
      BIEN,
      5,
    );
    expect(n).toBe(5);
  });
});

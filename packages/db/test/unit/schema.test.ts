// U4 — Test lược đồ (nhóm unit, OFFLINE): introspect object Drizzle bằng
// getTableConfig, KHÔNG cần DB. Bắt các luật mô hình hóa của Hiến pháp/Luật:
// tenant_id NOT NULL mọi bảng nghiệp vụ; khóa tự nhiên 6 trường đúng thứ tự;
// KHÔNG cột mật khẩu thô; raw_json JSONB; thuế suất dòng giữ kép.
import { SQL, getTableName, is } from "drizzle-orm";
import { PgDialect, getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { HOA_DON_NATURAL_KEY, HOA_DON_NATURAL_KEY_CONSTRAINT } from "../../src/naturalKey";
import {
  auditLog,
  dongHangHoa,
  hoaDon,
  lanDongBo,
  nguoiDung,
  taiKhoanThue,
  tenants,
} from "../../src/schema";
import { TRANG_THAI_LAN_DONG_BO } from "../../src/schema/lanDongBo";

/** Bảng nghiệp vụ bắt buộc có cột `tenant_id` NOT NULL (multi-tenant.md). */
const TENANT_SCOPED = {
  hoa_don: hoaDon,
  dong_hang_hoa: dongHangHoa,
  lan_dong_bo: lanDongBo,
  tai_khoan_thue: taiKhoanThue,
  nguoi_dung: nguoiDung,
  audit_log: auditLog,
} as const;

function columnNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table).columns.map((c) => c.name);
}

describe("U4 lược đồ — ràng buộc mô hình hóa (unit, offline)", () => {
  it("(1) mọi bảng nghiệp vụ có cột tenant_id NOT NULL", () => {
    for (const [name, table] of Object.entries(TENANT_SCOPED)) {
      const col = getTableConfig(table).columns.find((c) => c.name === "tenant_id");
      expect(col, `bảng ${name} phải có cột tenant_id`).toBeDefined();
      expect(col?.notNull, `tenant_id của ${name} phải NOT NULL`).toBe(true);
    }
  });

  it("(2) khóa tự nhiên hóa đơn = UNIQUE đúng 6 trường, đúng thứ tự (gồm tenant_id)", () => {
    const cfg = getTableConfig(hoaDon);
    const uc = cfg.uniqueConstraints.find((u) => u.name === HOA_DON_NATURAL_KEY_CONSTRAINT);
    expect(uc, `phải có ràng buộc unique tên ${HOA_DON_NATURAL_KEY_CONSTRAINT}`).toBeDefined();
    expect(uc?.columns.map((c) => c.name)).toEqual([
      "tenant_id",
      "nbmst",
      "khmshdon",
      "khhdon",
      "shdon",
      "tdlap",
    ]);
    // Hằng dùng chung phải khớp đúng khóa tự nhiên (nguồn chân lý ở tầng DB).
    expect([...HOA_DON_NATURAL_KEY]).toEqual([
      "tenant_id",
      "nbmst",
      "khmshdon",
      "khhdon",
      "shdon",
      "tdlap",
    ]);
  });

  it("(3) tai_khoan_thue KHÔNG có cột mật khẩu thô; có secret_ref + token mã hóa + hạn", () => {
    const names = columnNames(taiKhoanThue);
    expect(names).toContain("secret_ref");
    expect(names).toContain("token_hien_tai");
    expect(names).toContain("token_het_han");
    // Ranh giới pháp lý: không lưu mật khẩu thuế thô (security.md + Hiến pháp).
    expect(names.some((n) => /pass|matkhau|password|pwd/i.test(n))).toBe(false);
  });

  it("(4) hoa_don.raw_json là JSONB NOT NULL và có đủ cột nghiệp vụ mục 7.1", () => {
    const cols = getTableConfig(hoaDon).columns;
    const rawJson = cols.find((c) => c.name === "raw_json");
    expect(rawJson?.getSQLType()).toBe("jsonb");
    expect(rawJson?.notNull).toBe(true);
    const names = cols.map((c) => c.name);
    for (const n of [
      "nbmst",
      "nbten",
      "nmmst",
      "nmten",
      "khmshdon",
      "khhdon",
      "shdon",
      "tdlap",
      "ncnhat",
      "tgtcthue",
      "tgtthue",
      "tgtttbso",
      "ttcktmai",
      "dvtte",
      "tgia",
      "ttxly",
      "tthai",
      "chieu",
      "nguon",
    ]) {
      expect(names, `hoa_don phải có cột ${n}`).toContain(n);
    }
  });

  it("(5) dong_hang_hoa giữ thuế suất KÉP (ltsuat chuỗi + tsuat số) + tiền thuế dòng + raw_json JSONB", () => {
    const cols = getTableConfig(dongHangHoa).columns;
    const names = cols.map((c) => c.name);
    expect(names).toContain("ltsuat"); // chuỗi hiển thị "8%"/"KCT"/"KKKNT"
    expect(names).toContain("tsuat"); // số thập phân 0.08
    expect(names).toContain("tsuat_tien"); // tiền thuế dòng (≡ tthue của adapter U3)
    const rawJson = cols.find((c) => c.name === "raw_json");
    expect(rawJson?.getSQLType()).toBe("jsonb");
  });

  it("(6) lan_dong_bo có đủ trường nhật ký đồng bộ", () => {
    const names = columnNames(lanDongBo);
    for (const n of [
      "tenant_id",
      "taikhoan_id",
      "chieu",
      "tu_ngay",
      "den_ngay",
      "so_hd_moi",
      "so_hd_cap_nhat",
      "trang_thai",
      "thong_diep_loi",
      "bat_dau",
      "ket_thuc",
    ]) {
      expect(names, `lan_dong_bo phải có cột ${n}`).toContain(n);
    }
  });

  it("(7) lan_dong_bo.trang_thai: hằng dùng chung có 'hoan_thanh_mot_phan' + khớp default cột", () => {
    // Cột `trang_thai` là text (không enum cứng) — TRANG_THAI_LAN_DONG_BO là
    // nguồn chân lý DÙNG CHUNG cho tập trạng thái hợp lệ (packages/sync + worker).
    expect(TRANG_THAI_LAN_DONG_BO.HOAN_THANH_MOT_PHAN).toBe("hoan_thanh_mot_phan");
    // Tập giá trị đầy đủ được tài liệu hoá (migration 0004 gắn COMMENT cùng tập này).
    expect(new Set(Object.values(TRANG_THAI_LAN_DONG_BO))).toEqual(
      new Set(["running", "completed", "hoan_thanh_mot_phan", "failed", "can_dang_nhap_lai"]),
    );
    // Default cột phải là một giá trị hợp lệ trong tập (running / đang chạy).
    const col = getTableConfig(lanDongBo).columns.find((c) => c.name === "trang_thai");
    expect(col?.default).toBe(TRANG_THAI_LAN_DONG_BO.DANG_CHAY);
  });

  it("(U8) nguoi_dung có password_hash (nullable), email UNIQUE toàn cục, vai_tro default 'ke_toan'", () => {
    const cfg = getTableConfig(nguoiDung);
    const pw = cfg.columns.find((c) => c.name === "password_hash");
    expect(pw, "phải có cột password_hash").toBeDefined();
    expect(pw?.notNull, "password_hash nullable (không chặn hàng cũ)").toBe(false);

    // Email UNIQUE toàn cục (không kèm tenant_id) — login xảy ra trước khi biết tenant.
    // U17b (Task 5b, F4) — chỉ mục PHẢI là BIỂU THỨC lower(email), KHÔNG PHẢI cột "email"
    // trần: byte-exact để "Boss@Corp.vn" và "BOSS@CORP.VN" lọt qua như hai người khác nhau
    // (migration 0010_email_khong_phan_biet_hoa_thuong.sql thay chỉ mục cũ bằng đúng cái
    // này trên DB thật — test này khoá lại HÌNH DẠNG khai báo Drizzle khớp migration đó).
    const emailIdx = cfg.indexes.find((i) => i.config.name === "nguoi_dung_email_unique");
    expect(emailIdx, "phải có unique index nguoi_dung_email_unique").toBeDefined();
    expect(emailIdx?.config.unique).toBe(true);
    const emailIdxCol = emailIdx?.config.columns[0];
    expect(emailIdx?.config.columns).toHaveLength(1);
    expect(
      emailIdxCol && "name" in emailIdxCol,
      "cột chỉ mục PHẢI là biểu thức SQL, không phải cột email trần (mới lại byte-exact)",
    ).toBe(false);
    expect(is(emailIdxCol, SQL), "cột chỉ mục phải là một SQL expression").toBe(true);
    const emailIdxSql = new PgDialect().sqlToQuery(emailIdxCol as SQL).sql;
    expect(emailIdxSql.toLowerCase()).toContain("lower(");
    expect(emailIdxSql).toContain('"email"');

    const vaiTro = cfg.columns.find((c) => c.name === "vai_tro");
    expect(vaiTro?.default, "vai_tro default = ke_toan (vai ít quyền nhất)").toBe("ke_toan");
  });

  it("(FK) khóa ngoại trỏ đúng bảng đích (cột nội bộ → bảng ngoài)", () => {
    const cases: Array<[Parameters<typeof getTableConfig>[0], Record<string, string>]> = [
      [taiKhoanThue, { tenant_id: "tenants" }],
      [hoaDon, { tenant_id: "tenants" }],
      [dongHangHoa, { tenant_id: "tenants", hoadon_id: "hoa_don" }],
      [lanDongBo, { tenant_id: "tenants", taikhoan_id: "tai_khoan_thue" }],
      [nguoiDung, { tenant_id: "tenants" }],
      [auditLog, { tenant_id: "tenants" }],
    ];
    for (const [table, expected] of cases) {
      for (const fk of getTableConfig(table).foreignKeys) {
        const ref = fk.reference(); // resolve thunk () => bảng đích
        const localCol = ref.columns[0]?.name ?? "";
        expect(expected[localCol], `FK cột ${localCol}`).toBe(getTableName(ref.foreignTable));
      }
    }
  });

  it("(U-a) tenants có ghi_chu (nullable) + ban_quyen (NOT NULL, default 'Mặc định')", () => {
    const cols = getTableConfig(tenants).columns;
    const ghiChu = cols.find((c) => c.name === "ghi_chu");
    expect(ghiChu, "tenants phải có cột ghi_chu").toBeDefined();
    expect(ghiChu?.notNull, "ghi_chu phải nullable").toBe(false);
    const banQuyen = cols.find((c) => c.name === "ban_quyen");
    expect(banQuyen, "tenants phải có cột ban_quyen").toBeDefined();
    expect(banQuyen?.notNull, "ban_quyen phải NOT NULL").toBe(true);
    expect(banQuyen?.hasDefault, "ban_quyen phải có default").toBe(true);
    expect(banQuyen?.default).toBe("Mặc định");
  });
});

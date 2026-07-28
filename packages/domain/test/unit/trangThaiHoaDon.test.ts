// U36.1 unit — nhãn `tthai` + quy tắc "tính vào tổng", nguồn sự thật DUY NHẤT cho cả web
// lẫn file kết xuất (ui.md "Nhãn một nguồn").
//
// Bằng chứng cho mã 1–5: docs/BANG-CHUNG-ma-trang-thai-hoa-don-2026-07-28.md §3 (20 cặp
// hóa đơn gốc↔mới thật, 0 ngoại lệ). Mã "hủy" thật và ý nghĩa `ttxly` CHƯA có bằng chứng
// (biên bản §5.1, §4) ⇒ test dưới KHÔNG được khẳng định nhãn cho chúng.
import { describe, expect, it } from "vitest";
import {
  TTHAI_LOAI_KHOI_TONG,
  TTHAI_NHAN,
  daKiemChungTthai,
  nhanTthai,
  tinhVaoTong,
} from "../../src/trangThaiHoaDon";

describe("nhanTthai — nhãn mã trạng thái hóa đơn", () => {
  it("mã 1–5 đã kiểm chứng → nhãn tiếng Việt (biên bản §3)", () => {
    expect(nhanTthai(1)).toBe("Gốc");
    expect(nhanTthai(2)).toBe("Thay thế");
    expect(nhanTthai(3)).toBe("Điều chỉnh");
    expect(nhanTthai(4)).toBe("Bị thay thế");
    expect(nhanTthai(5)).toBe("Bị điều chỉnh");
  });

  it("mã ngoài tập đã kiểm chứng → '<mã> (chưa rõ)', KHÔNG đoán nhãn", () => {
    expect(nhanTthai(6)).toBe("6 (chưa rõ)");
    expect(nhanTthai(23)).toBe("23 (chưa rõ)");
  });

  it("null/undefined → chuỗi rỗng (06-BINDING_MAP: null → trống)", () => {
    expect(nhanTthai(null)).toBe("");
    expect(nhanTthai(undefined)).toBe("");
  });

  it("bảng nhãn chỉ chứa đúng 5 mã đã kiểm chứng — cổng chống suy đoán", () => {
    expect(Object.keys(TTHAI_NHAN).map(Number).sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("daKiemChungTthai", () => {
  it("mã 1–5 → true", () => {
    for (const c of [1, 2, 3, 4, 5]) expect(daKiemChungTthai(c)).toBe(true);
  });
  it("mã lạ / null / undefined → false", () => {
    expect(daKiemChungTthai(6)).toBe(false);
    expect(daKiemChungTthai(null)).toBe(false);
    expect(daKiemChungTthai(undefined)).toBe(false);
  });
});

describe("tinhVaoTong — QĐ-3/QĐ-4: CHỈ loại mã 4", () => {
  it("mã 4 (bị thay thế) → KHÔNG cộng vào tổng tiền", () => {
    expect(tinhVaoTong(4)).toBe(false);
  });

  it("mã 5 (bị điều chỉnh) VẪN cộng — bản gốc còn hiệu lực (biên bản §7)", () => {
    expect(tinhVaoTong(5)).toBe(true);
  });

  it("mã 1/2/3 vẫn cộng", () => {
    for (const c of [1, 2, 3]) expect(tinhVaoTong(c)).toBe(true);
  });

  it("null/undefined và mã lạ vẫn cộng — không tự ý loại (QĐ-6)", () => {
    expect(tinhVaoTong(null)).toBe(true);
    expect(tinhVaoTong(undefined)).toBe(true);
    expect(tinhVaoTong(9)).toBe(true);
  });

  it("hằng số chỉ chốt mã 4 — mã 'hủy' thật CHƯA có bằng chứng, không được thêm", () => {
    expect([...TTHAI_LOAI_KHOI_TONG]).toEqual([4]);
  });

  it("dẫn xuất TỪ hằng số, không hardcode: đúng với mọi mã 0..10, kể cả khi danh sách rỗng", () => {
    for (let c = 0; c <= 10; c++) {
      expect(tinhVaoTong(c)).toBe(!TTHAI_LOAI_KHOI_TONG.includes(c));
    }
  });
});

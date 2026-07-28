import { nhanTthai } from "@vat/domain";
import { describe, expect, it } from "vitest";
import { labelChieu, labelNguon, labelTthai, labelTtxly } from "../../src/lib/statusLabels";

describe("labelTthai — chỉ mã đã kiểm chứng (Nguyên tắc bằng chứng)", () => {
  // Mã 1–5 đã kiểm chứng ngày 2026-07-28 trên 20 cặp hóa đơn thật, 0 ngoại lệ
  // (docs/BANG-CHUNG-ma-trang-thai-hoa-don-2026-07-28.md §3).
  it("mã 1–5 đã kiểm chứng → nhãn tiếng Việt, verified", () => {
    expect(labelTthai(1)).toEqual({ text: "Gốc", verified: true });
    expect(labelTthai(2)).toEqual({ text: "Thay thế", verified: true });
    expect(labelTthai(3)).toEqual({ text: "Điều chỉnh", verified: true });
    expect(labelTthai(4)).toEqual({ text: "Bị thay thế", verified: true });
    expect(labelTthai(5)).toEqual({ text: "Bị điều chỉnh", verified: true });
  });
  it("mã ngoài tập 1–5 → 'số (chưa rõ)', KHÔNG đoán nhãn", () => {
    expect(labelTthai(6)).toEqual({ text: "6 (chưa rõ)", verified: false });
    expect(labelTthai(23)).toEqual({ text: "23 (chưa rõ)", verified: false });
  });
  it("null → '—' (chỗ trống trên bảng, khác chuỗi rỗng của file xuất)", () => {
    expect(labelTthai(null)).toEqual({ text: "—", verified: false });
  });
  it("nhãn dẫn xuất TỪ @vat/domain — một nguồn sự thật (ui.md)", () => {
    for (const c of [1, 2, 3, 4, 5, 6, 23]) {
      expect(labelTthai(c).text).toBe(nhanTthai(c));
    }
  });
});

describe("labelTtxly — chưa mã nào kiểm chứng → luôn '(chưa rõ)'", () => {
  it("mọi mã → 'số (chưa rõ)'", () => {
    expect(labelTtxly(1)).toEqual({ text: "1 (chưa rõ)", verified: false });
    expect(labelTtxly(8)).toEqual({ text: "8 (chưa rõ)", verified: false });
  });
  it("null → '—'", () => {
    expect(labelTtxly(null)).toEqual({ text: "—", verified: false });
  });
});

describe("labelChieu / labelNguon — enum cố định", () => {
  it("chiều", () => {
    expect(labelChieu("purchase")).toBe("Mua vào");
    expect(labelChieu("sold")).toBe("Bán ra");
  });
  it("nguồn", () => {
    expect(labelNguon("normal")).toBe("HĐĐT thường");
    expect(labelNguon("sco")).toBe("Máy tính tiền");
  });
});

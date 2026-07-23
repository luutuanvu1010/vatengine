import { describe, expect, it } from "vitest";
import {
  monthRange,
  monthRangeOf,
  quarterRange,
  quarterRangeOf,
  yearRange,
  yearRangeOf,
} from "../../src/lib/period";

// Ref cố định để test xác định (không phụ thuộc Date.now). 15/04/2026 giờ VN.
const ref = new Date("2026-04-15T03:00:00Z");

describe("period — quy kỳ nhanh ra tuNgay/denNgay (giờ VN)", () => {
  it("tháng", () => {
    expect(monthRange(ref)).toEqual({ tuNgay: "2026-04-01", denNgay: "2026-04-30" });
  });
  it("quý (Q2 cho tháng 4)", () => {
    expect(quarterRange(ref)).toEqual({ tuNgay: "2026-04-01", denNgay: "2026-06-30" });
  });
  it("năm", () => {
    expect(yearRange(ref)).toEqual({ tuNgay: "2026-01-01", denNgay: "2026-12-31" });
  });
  it("tháng 2 năm nhuận → 29 ngày; thường → 28", () => {
    expect(monthRange(new Date("2024-02-10T05:00:00Z")).denNgay).toBe("2024-02-29");
    expect(monthRange(new Date("2026-02-10T05:00:00Z")).denNgay).toBe("2026-02-28");
  });
  it("biên VN: 30/04 23:00Z (tức 01/05 06:00 VN) → tháng 5", () => {
    expect(monthRange(new Date("2026-04-30T23:00:00Z"))).toEqual({
      tuNgay: "2026-05-01",
      denNgay: "2026-05-31",
    });
  });
});

// ---------------------------------------------------------------------------
// U-K3 — hàm nhận KỲ TƯỜNG MINH (không suy từ "hôm nay"). Đây là lõi của yêu cầu
// "chọn tháng/quý/năm CỤ THỂ": người dùng chọn kỳ QUÁ KHỨ, không chỉ kỳ hiện tại.
// ---------------------------------------------------------------------------
describe("U-K3 — monthRangeOf / quarterRangeOf / yearRangeOf (kỳ tường minh)", () => {
  it("tháng cụ thể trong quá khứ: 3/2025", () => {
    expect(monthRangeOf(2025, 3)).toEqual({ tuNgay: "2025-03-01", denNgay: "2025-03-31" });
  });

  it("tháng có 30 ngày và tháng 2 (nhuận/không nhuận) đều đúng ngày cuối", () => {
    expect(monthRangeOf(2025, 4).denNgay).toBe("2025-04-30");
    expect(monthRangeOf(2024, 2).denNgay).toBe("2024-02-29");
    expect(monthRangeOf(2025, 2).denNgay).toBe("2025-02-28");
  });

  it("bốn quý của một năm", () => {
    expect(quarterRangeOf(2025, 1)).toEqual({ tuNgay: "2025-01-01", denNgay: "2025-03-31" });
    expect(quarterRangeOf(2025, 2)).toEqual({ tuNgay: "2025-04-01", denNgay: "2025-06-30" });
    expect(quarterRangeOf(2025, 3)).toEqual({ tuNgay: "2025-07-01", denNgay: "2025-09-30" });
    expect(quarterRangeOf(2025, 4)).toEqual({ tuNgay: "2025-10-01", denNgay: "2025-12-31" });
  });

  it("năm cụ thể", () => {
    expect(yearRangeOf(2025)).toEqual({ tuNgay: "2025-01-01", denNgay: "2025-12-31" });
  });

  // MỘT hiện thực, không hai: hàm cũ (nhận `ref`) phải cho kết quả y hệt hàm mới khi
  // trỏ vào cùng kỳ — nếu tách đôi hiện thực thì hai đường sẽ trôi khỏi nhau.
  it("hàm cũ theo `ref` = hàm mới theo kỳ tường minh (không nhân đôi logic)", () => {
    const r = new Date("2026-04-15T03:00:00Z"); // 15/04/2026 giờ VN
    expect(monthRange(r)).toEqual(monthRangeOf(2026, 4));
    expect(quarterRange(r)).toEqual(quarterRangeOf(2026, 2));
    expect(yearRange(r)).toEqual(yearRangeOf(2026));
  });

  it("kỳ phi lý bị từ chối (không đoán, không cuộn âm thầm sang kỳ khác)", () => {
    expect(() => monthRangeOf(2025, 0)).toThrow();
    expect(() => monthRangeOf(2025, 13)).toThrow();
    expect(() => quarterRangeOf(2025, 0)).toThrow();
    expect(() => quarterRangeOf(2025, 5)).toThrow();
  });
});

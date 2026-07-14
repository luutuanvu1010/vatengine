import { describe, expect, it } from "vitest";
import { monthRange, quarterRange, yearRange } from "../../src/lib/period";

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

// Lưới lịch tháng cho DateField (2026-07-30): tuần bắt đầu THỨ HAI (quy ước lịch VN),
// mỗi tuần 7 ô, ô ngoài tháng là null. Hàm thuần — tính bằng Date.UTC (số học lịch,
// không parse chuỗi nên không dính locale).
import { describe, expect, it } from "vitest";
import { luoiThang } from "../../src/lib/dateVn";

describe("luoiThang — lưới tuần Thứ Hai → Chủ Nhật", () => {
  it("tháng 7/2026: ngày 1 rơi Thứ Tư → tuần đầu [null,null,1,2,3,4,5]", () => {
    const luoi = luoiThang(2026, 7);
    expect(luoi[0]).toEqual([null, null, 1, 2, 3, 4, 5]);
    expect(luoi.at(-1)).toEqual([27, 28, 29, 30, 31, null, null]);
  });

  it("mỗi tuần đủ 7 ô và đủ số ngày của tháng", () => {
    const luoi = luoiThang(2026, 2); // 28 ngày
    for (const tuan of luoi) expect(tuan).toHaveLength(7);
    const ngay = luoi.flat().filter((d) => d !== null);
    expect(ngay).toEqual(Array.from({ length: 28 }, (_, i) => i + 1));
  });

  it("tháng bắt đầu Chủ Nhật (3/2026, ngày 1 là CN) → tuần đầu 6 ô null", () => {
    expect(luoiThang(2026, 3)[0]).toEqual([null, null, null, null, null, null, 1]);
  });

  it("tháng phi lý → ném (fail-loud như monthRangeOf)", () => {
    expect(() => luoiThang(2026, 0)).toThrow();
    expect(() => luoiThang(2026, 13)).toThrow();
  });
});

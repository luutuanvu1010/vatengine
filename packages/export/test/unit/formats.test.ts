// U7 unit — định dạng kết xuất hợp lệ (formats.ts) là nguồn sự thật duy nhất; route dùng
// isExportFormat để validate (không hardcode lại).
import { describe, expect, it } from "vitest";
import { EXPORT_FORMATS, isExportFormat } from "../../src/formats";

describe("EXPORT_FORMATS / isExportFormat", () => {
  it("gồm đúng xlsx + csv", () => {
    expect([...EXPORT_FORMATS]).toEqual(["xlsx", "csv"]);
  });

  it("nhận định dạng hợp lệ", () => {
    expect(isExportFormat("xlsx")).toBe(true);
    expect(isExportFormat("csv")).toBe(true);
  });

  it("từ chối định dạng lạ / thiếu / phi chuỗi", () => {
    expect(isExportFormat("pdf")).toBe(false);
    expect(isExportFormat(undefined)).toBe(false);
    expect(isExportFormat("")).toBe(false);
    expect(isExportFormat(123)).toBe(false);
  });
});

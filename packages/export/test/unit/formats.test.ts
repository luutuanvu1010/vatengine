// U7 unit — định dạng kết xuất hợp lệ (formats.ts) là nguồn sự thật duy nhất; route dùng
// isExportFormat để validate (không hardcode lại).
import { describe, expect, it } from "vitest";
import { EXPORT_FORMATS, isExportFormat } from "../../src/formats";

describe("EXPORT_FORMATS / isExportFormat", () => {
  it("gồm đúng xlsx + csv + xml.zip + html.zip", () => {
    expect([...EXPORT_FORMATS]).toEqual(["xlsx", "csv", "xml.zip", "html.zip"]);
  });

  it("nhận định dạng hợp lệ", () => {
    expect(isExportFormat("xlsx")).toBe(true);
    expect(isExportFormat("csv")).toBe(true);
    expect(isExportFormat("xml.zip")).toBe(true);
    expect(isExportFormat("html.zip")).toBe(true);
  });

  it("từ chối định dạng lạ / thiếu / phi chuỗi", () => {
    expect(isExportFormat("pdf")).toBe(false);
    expect(isExportFormat(undefined)).toBe(false);
    expect(isExportFormat("")).toBe(false);
    expect(isExportFormat(123)).toBe(false);
  });
});

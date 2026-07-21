// Tên file tải về (quyết định chủ dự án 2026-07-21): vatengine-export-<khoảng ngày>.<đuôi>.
// Ví dụ vatengine-export-01062026-02062026.xlsx. Thuần, offline.
import { describe, expect, it } from "vitest";
import { tenFileXuat } from "../../src/features/invoices/exportFilename";

describe("tenFileXuat", () => {
  it("có khoảng ngày → vatengine-export-<ddmmyyyy>-<ddmmyyyy>.<đuôi>", () => {
    expect(tenFileXuat({ tuNgay: "2026-06-01", denNgay: "2026-06-02" }, "xlsx")).toBe(
      "vatengine-export-01062026-02062026.xlsx",
    );
    expect(tenFileXuat({ tuNgay: "2026-06-01", denNgay: "2026-06-02" }, "csv")).toBe(
      "vatengine-export-01062026-02062026.csv",
    );
  });

  it("chỉ có ngày đầu → chỉ gắn một ngày", () => {
    expect(tenFileXuat({ tuNgay: "2026-06-01" }, "xlsx")).toBe("vatengine-export-01062026.xlsx");
  });

  it("chỉ có ngày cuối → chỉ gắn một ngày", () => {
    expect(tenFileXuat({ denNgay: "2026-12-31" }, "xlsx")).toBe("vatengine-export-31122026.xlsx");
  });

  it("không có ngày → chỉ vatengine-export.<đuôi> (không đuôi ngày rác)", () => {
    expect(tenFileXuat({}, "xlsx")).toBe("vatengine-export.xlsx");
  });

  it("đuôi khớp ĐỊNH DẠNG THẬT (.xlsx cho xlsx), KHÔNG dùng .xls sai định dạng", () => {
    // File là OOXML; đặt .xls sẽ khiến Excel cảnh báo 'định dạng và phần mở rộng không khớp'.
    expect(tenFileXuat({}, "xlsx").endsWith(".xlsx")).toBe(true);
  });
});

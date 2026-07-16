import { afterEach, describe, expect, it } from "vitest";
import {
  clearInvoiceFilter,
  loadInvoiceFilter,
  saveInvoiceFilter,
} from "../../src/lib/filterStore";

// H-B.3 — bộ lọc lưu localStorage chứa MST của chính tenant (nbmst/nmmst) + kỳ. Đăng
// xuất PHẢI xóa để người dùng kế tiếp trên máy dùng chung không thừa hưởng (rò dữ liệu).
describe("filterStore — dọn bộ lọc phiên", () => {
  afterEach(() => localStorage.clear());

  it("clearInvoiceFilter xóa hẳn bộ lọc đã lưu (không để lại MST tenant cũ)", () => {
    saveInvoiceFilter({ nbmst: "4201568932", tuNgay: "2026-01-01" });
    expect(loadInvoiceFilter()).toEqual({ nbmst: "4201568932", tuNgay: "2026-01-01" });

    clearInvoiceFilter();

    expect(loadInvoiceFilter()).toEqual({});
    expect(localStorage.getItem("vat.invoiceFilter")).toBeNull();
  });

  it("clearInvoiceFilter an toàn khi chưa có gì để xóa", () => {
    expect(() => clearInvoiceFilter()).not.toThrow();
    expect(loadInvoiceFilter()).toEqual({});
  });
});

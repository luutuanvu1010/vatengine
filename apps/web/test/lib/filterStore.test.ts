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
    saveInvoiceFilter({ nbmst: "4201568932", chieu: "purchase" });
    expect(loadInvoiceFilter()).toEqual({ nbmst: "4201568932", chieu: "purchase" });

    clearInvoiceFilter();

    expect(loadInvoiceFilter()).toEqual({});
    expect(localStorage.getItem("vat.invoiceFilter")).toBeNull();
  });

  // U-K4 (yêu cầu 2) — KHÔNG nhớ kỳ giữa các phiên: mở màn LUÔN mặc định tháng hiện tại
  // (InvoicesPage ghi đè kỳ), nên nhớ tuNgay/denNgay cũ vừa thừa vừa gây lệch với ý "tháng
  // này". Vẫn nhớ chiều/nguồn/MST như trước.
  it("KHÔNG lưu tuNgay/denNgay (bỏ nhớ kỳ) nhưng vẫn nhớ chiều/nguồn/MST", () => {
    saveInvoiceFilter({
      chieu: "sold",
      nguon: "sco",
      nbmst: "0100000001",
      nmmst: "0100000002",
      tuNgay: "2026-01-01",
      denNgay: "2026-01-31",
    });
    expect(loadInvoiceFilter()).toEqual({
      chieu: "sold",
      nguon: "sco",
      nbmst: "0100000001",
      nmmst: "0100000002",
    });
  });

  it("clearInvoiceFilter an toàn khi chưa có gì để xóa", () => {
    expect(() => clearInvoiceFilter()).not.toThrow();
    expect(loadInvoiceFilter()).toEqual({});
  });
});

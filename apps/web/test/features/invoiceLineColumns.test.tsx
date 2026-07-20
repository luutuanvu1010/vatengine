// Quyết định chủ dự án 2026-07-17 (thay U23-A): DANH SÁCH hóa đơn hiện Tên hàng hóa
// + Số lượng (tóm tắt dòng hàng từ listInvoices: tenHangDau/soDongHang/tongSoLuong).
// HĐ nhiều dòng → "tên dòng đầu +N"; chưa đồng bộ chi tiết → "—".
import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvoicesPage } from "../../src/features/invoices/InvoicesPage";
import type { InvoiceListRow } from "../../src/types/api";
import { renderWithProviders } from "../helpers/renderApp";

function row(over: Partial<InvoiceListRow>): InvoiceListRow {
  return {
    id: "r1",
    tenantId: "t",
    nbmst: "0311772540",
    nbten: "Cty Bán",
    nmmst: "4201568932",
    nmten: "Cty Mua",
    khmshdon: "1",
    khhdon: "C26TDA",
    shdon: "0001284",
    tdlap: "2026-04-02T17:00:00.000Z",
    ncnhat: null,
    tgtcthue: "1000000",
    tgtthue: "80000",
    tgtttbso: "1080000",
    ttcktmai: null,
    dvtte: "VND",
    tgia: null,
    ttxly: 8,
    tthai: 1,
    chieu: "purchase",
    nguon: "normal",
    rawJson: {},
    createdAt: "2026-04-03T00:00:00.000Z",
    updatedAt: "2026-04-03T00:00:00.000Z",
    tenHangDau: null,
    hangHoa: [],
    soDongHang: 0,
    tongSoLuong: null,
    ...over,
  };
}

function mockList(rows: InvoiceListRow[]) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/invoices/summary")) {
      return new Response(
        JSON.stringify({
          byChieu: [],
          total: { count: rows.length, tongTcthue: null, tongTthue: null, tongTtbso: null },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ rows, total: rows.length, limit: 50, offset: 0 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
}

describe("Danh sách hóa đơn — cột Hàng hóa, dịch vụ + Số lượng (2026-07-17)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ĐỔI HÀNH VI 2026-07-20 (nghiệm thu): trước đây ô chỉ hiện tên dòng đầu + "+N dòng
  // khác". Chủ dự án bác bỏ: kế toán cần đọc ĐỦ mặt hàng thẳng trên bảng, không phải mở
  // từng hóa đơn. Test cũ canh hành vi rút gọn nay được thay bằng test canh hiển thị đủ.
  it("HĐ nhiều dòng: hiện ĐỦ mọi tên hàng, KHÔNG rút gọn '+N dòng khác'", async () => {
    mockList([
      row({
        id: "r1",
        tenHangDau: "VW tiêu chuẩn NL",
        hangHoa: [
          { ten: "VW tiêu chuẩn NL", sluong: "1", dvtinh: "cái" },
          { ten: "Phí giao hàng", sluong: "1", dvtinh: "cái" },
          { ten: "Bao bì", sluong: "1", dvtinh: "cái" },
        ],
        soDongHang: 3,
        tongSoLuong: "15",
      }),
    ]);
    renderWithProviders(<InvoicesPage />);
    expect(await screen.findByText("VW tiêu chuẩn NL")).toBeTruthy();
    expect(screen.getByText("Phí giao hàng")).toBeTruthy();
    expect(screen.getByText("Bao bì")).toBeTruthy();
    expect(screen.queryByText(/\+\d+ dòng khác/)).toBeNull();
    expect(screen.getByText("15")).toBeTruthy();
    expect(screen.getByText("Hàng hóa, dịch vụ")).toBeTruthy();
    expect(screen.getByText("Số lượng")).toBeTruthy();
  });

  it("HĐ một dòng: hiện đúng một tên hàng", async () => {
    mockList([
      row({
        id: "r1",
        tenHangDau: "Xăng RON 95",
        hangHoa: [{ ten: "Xăng RON 95", sluong: "1", dvtinh: "cái" }],
        soDongHang: 1,
        tongSoLuong: "40",
      }),
    ]);
    renderWithProviders(<InvoicesPage />);
    expect(await screen.findByText("Xăng RON 95")).toBeTruthy();
    expect(screen.queryByText(/\+\d+ dòng khác/)).toBeNull();
  });

  it("HĐ chưa đồng bộ chi tiết (0 dòng) → ô hiện '—'", async () => {
    mockList([row({ id: "r1" })]);
    renderWithProviders(<InvoicesPage />);
    await screen.findByText("0001284");
    // 2 ô mới (hàng hóa + số lượng) đều "—"; các cột khác có giá trị nên tổng "—" ≥ 2.
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });
});

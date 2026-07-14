import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvoicesPage } from "../../src/features/invoices/InvoicesPage";
import { clearToken, setToken } from "../../src/lib/apiClient";
import type { InvoiceRow } from "../../src/types/api";
import { renderWithProviders } from "../helpers/renderApp";

const bigRow: InvoiceRow = {
  id: "r1",
  tenantId: "t",
  nbmst: "0311772540",
  nbten: "Cty CP Nhiên liệu Sài Gòn",
  nmmst: "4201568932",
  nmten: "Cty TNHH Tour Đảo",
  khmshdon: "1",
  khhdon: "C26TDA",
  shdon: "0001284",
  tdlap: "2026-04-02T17:00:00.000Z",
  ncnhat: null,
  tgtcthue: "9007199254740993", // > 2^53 — không được ép float
  tgtthue: "4500000",
  tgtttbso: "49500000",
  ttcktmai: null,
  dvtte: "VND",
  tgia: null,
  ttxly: 8, // chưa kiểm chứng
  tthai: 1, // đã kiểm chứng → "Gốc"
  chieu: "purchase",
  nguon: "normal",
  rawJson: {},
  createdAt: "2026-04-03T00:00:00.000Z",
  updatedAt: "2026-04-03T00:00:00.000Z",
};

let fetchMock: { mock: { calls: unknown[][] } };

function mockList(rows: InvoiceRow[], total: number) {
  fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/invoices/summary")) {
      return new Response(
        JSON.stringify({
          byChieu: [],
          total: { count: total, tongTcthue: null, tongTthue: null, tongTtbso: "2471142000" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ rows, total, limit: 50, offset: 0 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
}

describe("U15.2 — tra cứu + lọc + tổng hợp", () => {
  beforeEach(() => setToken("t"));
  afterEach(() => {
    clearToken();
    vi.restoreAllMocks();
  });

  it("ánh xạ trường: tiền >2^53 chính xác, ngày VN, nhãn mã, chiều", async () => {
    mockList([bigRow], 1);
    renderWithProviders(<InvoicesPage />);
    // Tiền lớn giữ nguyên (Number sẽ ra …992).
    expect(await screen.findByText("9.007.199.254.740.993")).toBeInTheDocument();
    // Ngày UTC 17:00Z → 03/04 giờ VN (không lệch ngày).
    expect(screen.getByText("03/04/2026")).toBeInTheDocument();
    // tthai=1 → "Gốc"; ttxly=8 → "8 (chưa rõ)".
    expect(screen.getByText("Gốc")).toBeInTheDocument();
    expect(screen.getByText("8 (chưa rõ)")).toBeInTheDocument();
    // "Mua vào" xuất hiện ở cả <option> lẫn chip → chỉ định chip (span).
    expect(screen.getByText("Mua vào", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("VND")).toBeInTheDocument();
    // Tổng thanh toán từ summary.
    expect(screen.getByText("2.471.142.000")).toBeInTheDocument();
  });

  it("B4: KHÔNG có ô tìm tự do 'tên đối tác/số HĐ' — chỉ MST bán/mua", async () => {
    mockList([bigRow], 1);
    renderWithProviders(<InvoicesPage />);
    await screen.findByText("VND");
    expect(screen.queryByPlaceholderText(/tên đối tác/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText("MST người bán")).toBeInTheDocument();
    expect(screen.getByLabelText("MST người mua")).toBeInTheDocument();
  });

  it("chọn kỳ 'Năm' → gọi /invoices kèm tuNgay/denNgay", async () => {
    mockList([bigRow], 1);
    renderWithProviders(<InvoicesPage />);
    await screen.findByText("VND");
    await userEvent.click(screen.getByRole("button", { name: "Năm" }));
    await waitFor(() => {
      const called = fetchMock.mock.calls.some((c) => {
        const u = String(c[0]);
        return u.includes("/invoices?") && u.includes("tuNgay=") && u.includes("denNgay=");
      });
      expect(called).toBe(true);
    });
  });

  it("trạng thái rỗng khi không có hóa đơn", async () => {
    mockList([], 0);
    renderWithProviders(<InvoicesPage />);
    expect(await screen.findByText(/Không có hóa đơn khớp bộ lọc/)).toBeInTheDocument();
  });

  it("phân trang: bấm 'Sau' → gọi offset=50", async () => {
    mockList([bigRow], 120);
    renderWithProviders(<InvoicesPage />);
    await screen.findByText("VND");
    const nav = screen.getByText(/Trang 1\/3/);
    expect(nav).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Sau" }));
    await waitFor(() => {
      const called = fetchMock.mock.calls.some((c) => String(c[0]).includes("offset=50"));
      expect(called).toBe(true);
    });
  });
});

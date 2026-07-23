// Chủ dự án 2026-07-23: Danh sách hóa đơn KHÔNG còn hiện bảng — chỉ SỐ ĐẾM hóa đơn +
// nút Xuất/Đồng bộ. Số đếm lấy từ GET /invoices/summary (total.count); bỏ "Tổng thanh
// toán". Bộ chọn ngày (Từ/Đến ngày) trả lại ở FilterBar (test riêng: filterBarDatePicker).
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InvoicesPage } from "../../src/features/invoices/InvoicesPage";
import { renderWithProviders } from "../helpers/renderApp";

let fetchMock: { mock: { calls: unknown[][] } };

/** Mock summary với `count` cho trước (bảng đã bỏ nên không cần mock danh sách). */
function mockCount(count: number) {
  fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/invoices/summary")) {
      return new Response(
        JSON.stringify({
          byChieu: [],
          total: { count, tongTcthue: null, tongTthue: null, tongTtbso: "2471142000" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    // Không màn nào gọi /invoices (list) nữa; trả rỗng an toàn nếu có.
    return new Response(JSON.stringify({ rows: [], total: 0, limit: 50, offset: 0 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
}

describe("Danh sách hóa đơn — chỉ số đếm (2026-07-23)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hiện SỐ ĐẾM từ summary; KHÔNG hiện 'Tổng thanh toán'; KHÔNG có bảng", async () => {
    mockCount(3);
    renderWithProviders(<InvoicesPage />);
    expect(await screen.findByText("Có 3 hóa đơn")).toBeInTheDocument();
    expect(screen.queryByText(/Tổng thanh toán/)).toBeNull();
    // Không render bảng → không có tiêu đề cột đặc trưng của bảng.
    expect(screen.queryByText("Hàng hóa, dịch vụ")).toBeNull();
  });

  it("B4: KHÔNG có ô tìm tự do 'tên đối tác/số HĐ' — chỉ MST bán/mua", async () => {
    mockCount(1);
    renderWithProviders(<InvoicesPage />);
    await screen.findByText("Có 1 hóa đơn");
    expect(screen.queryByPlaceholderText(/tên đối tác/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText("MST người bán")).toBeInTheDocument();
    expect(screen.getByLabelText("MST người mua")).toBeInTheDocument();
  });

  it("chọn kỳ 'Năm' → gọi /invoices/summary kèm tuNgay/denNgay", async () => {
    mockCount(1);
    renderWithProviders(<InvoicesPage />);
    await screen.findByText("Có 1 hóa đơn");
    await userEvent.click(screen.getByRole("button", { name: "Năm" }));
    await waitFor(() => {
      const called = fetchMock.mock.calls.some((c) => {
        const u = String(c[0]);
        return u.includes("/invoices/summary?") && u.includes("tuNgay=") && u.includes("denNgay=");
      });
      expect(called).toBe(true);
    });
  });

  it("trạng thái rỗng khi không có hóa đơn (count 0)", async () => {
    mockCount(0);
    renderWithProviders(<InvoicesPage />);
    expect(await screen.findByText(/Không có hóa đơn khớp bộ lọc/)).toBeInTheDocument();
  });
});

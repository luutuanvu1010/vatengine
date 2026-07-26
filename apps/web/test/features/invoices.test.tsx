// Chủ dự án 2026-07-23: Danh sách hóa đơn KHÔNG còn hiện bảng — chỉ SỐ ĐẾM hóa đơn +
// nút Xuất/Đồng bộ. Số đếm lấy từ GET /invoices/summary (total.count). Bộ chọn ngày
// (Từ/Đến ngày) trả lại ở FilterBar (test riêng: filterBarDatePicker).
// Task 13 (2026-07-26): thẻ Kết quả nay hiện đủ 4 số (đếm + 3 tổng tiền), "Tổng thanh
// toán" QUAY LẠI làm nhãn Stat (từ Registry) — test riêng: invoiceSummaryStats.test.tsx.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InvoicesPage, nhanBadgeKy } from "../../src/features/invoices/InvoicesPage";
import { renderWithProviders } from "../helpers/renderApp";

describe("nhanBadgeKy — nhãn kỳ đang xem (thuần, suy từ filter)", () => {
  it("format 'dd/MM – dd/MM/yyyy'", () => {
    expect(nhanBadgeKy("2026-07-01", "2026-07-31")).toBe("01/07 – 31/07/2026");
  });
  it("thiếu kỳ → null (không hiện badge)", () => {
    expect(nhanBadgeKy(undefined, "2026-07-31")).toBeNull();
    expect(nhanBadgeKy("2026-07-01", undefined)).toBeNull();
  });
});

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

  it("hiện SỐ ĐẾM (Stat) từ summary; 'Tổng thanh toán' là nhãn Stat (Task 13), KHÔNG có bảng", async () => {
    mockCount(3);
    renderWithProviders(<InvoicesPage />);
    // Số đếm nay là Stat: số lớn "3" + nhãn phụ "hóa đơn khớp bộ lọc".
    expect(await screen.findByText("hóa đơn khớp bộ lọc")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    // Task 13 — "Tổng thanh toán" nay là NHÃN của Stat tiền (labelOf("tgtttbso")), không
    // còn là tiêu đề cột bảng đã bỏ ở Task 12 — hai bối cảnh khác nhau, không mâu thuẫn.
    expect(screen.getByText("Tổng thanh toán")).toBeInTheDocument();
    // Không render bảng → không có tiêu đề cột đặc trưng của bảng.
    expect(screen.queryByText("Hàng hóa, dịch vụ")).toBeNull();
    // Badge kỳ đang xem (mặc định BẬT) — suy từ filter, không gọi thêm API.
    // Khớp RIÊNG badge ("Kỳ dd/MM…"), không dính nhãn "Kỳ nhanh" của segmented control.
    expect(screen.getByText(/^Kỳ \d{2}\//)).toBeInTheDocument();
  });

  it("B4: KHÔNG có ô tìm tự do 'tên đối tác/số HĐ' — chỉ MST bán/mua", async () => {
    mockCount(1);
    renderWithProviders(<InvoicesPage />);
    await screen.findByText("hóa đơn khớp bộ lọc");
    expect(screen.queryByPlaceholderText(/tên đối tác/i)).not.toBeInTheDocument();
    // Mặc định Mua vào (2026-07-23) → chỉ MST người bán liên quan; MST người mua ẩn.
    expect(screen.getByLabelText("MST người bán")).toBeInTheDocument();
    expect(screen.queryByLabelText("MST người mua")).toBeNull();
  });

  // Hợp đồng tương tác nhất quán (ui.md/CHUAN §D5): chọn kỳ chỉ CẬP NHẬT BẢN NHÁP, KHÔNG
  // fetch tức thì; phải bấm "Lọc dữ liệu" mới áp — giống mọi ô lọc khác.
  it("chọn kỳ 'Năm' KHÔNG fetch ngay; bấm 'Lọc dữ liệu' mới gọi summary với kỳ NĂM", async () => {
    mockCount(1);
    renderWithProviders(<InvoicesPage />);
    await screen.findByText("hóa đơn khớp bộ lọc");

    // Query kỳ-năm = tuNgay=YYYY-01-01 & denNgay=YYYY-12-31 (khoảng tháng không thể có cả hai).
    const laKyNam = (c: unknown[]) => /tuNgay=\d{4}-01-01&denNgay=\d{4}-12-31/.test(String(c[0]));

    // Bấm "Năm" nhưng CHƯA bấm Lọc dữ liệu → chưa được có truy vấn kỳ-năm nào.
    await userEvent.click(screen.getByRole("button", { name: "Năm" }));
    expect(fetchMock.mock.calls.some(laKyNam)).toBe(false);

    // Bấm "Lọc dữ liệu" → nay mới áp bản nháp → summary gọi với kỳ NĂM.
    await userEvent.click(screen.getByRole("button", { name: "Lọc dữ liệu" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(laKyNam)).toBe(true));
  });

  it("trạng thái rỗng khi không có hóa đơn (count 0)", async () => {
    mockCount(0);
    renderWithProviders(<InvoicesPage />);
    expect(await screen.findByText(/Không có hóa đơn khớp bộ lọc/)).toBeInTheDocument();
  });
});

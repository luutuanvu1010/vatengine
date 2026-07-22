import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppRouter } from "../../src/routes/AppRouter";
import { json, mockFetch, renderWithProviders } from "../helpers/renderApp";

// Cờ SHOW_RECONCILE tắt (quyết định chủ dự án 2026-07-22): trang "Đối chiếu" ẩn khỏi bảng
// điều khiển, module @vat/reconcile + GET /reconcile giữ nguyên. Hai ca dưới khoá ĐÚNG hai
// điểm nối dây — mục menu (Sidebar) và route (AppRouter) — để việc bật lại phải là một
// thay đổi có chủ đích, không xảy ra do vô tình.

/** Phiên đã có cookie hợp lệ: mockFetch KHÔNG khai `login` ⇒ /me trả hồ sơ ngay. */
function moPhienDaDangNhap() {
  mockFetch({
    me: () =>
      json(200, {
        ten: "Công ty TNHH Tour Đảo",
        mst: "4201568932",
        goiDichVu: "Miễn phí",
        role: "ke_toan_truong",
      }),
  });
}

describe("Ẩn trang Đối chiếu (SHOW_RECONCILE tắt)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sidebar KHÔNG có mục 'Đối chiếu'", async () => {
    moPhienDaDangNhap();
    renderWithProviders(<AppRouter />, "/");
    // Chờ app vào được bên trong rồi mới khẳng định thiếu mục menu — nếu khẳng định sớm,
    // test xanh giả vì lúc đó còn đang ở màn "Đang kiểm tra phiên".
    await screen.findByRole("link", { name: "Danh sách hóa đơn" });
    expect(screen.queryByRole("link", { name: "Đối chiếu" })).not.toBeInTheDocument();
  });

  it("vào thẳng /reconcile → tiếp đất ở Tổng quan (catch-all), không phải trang Đối chiếu", async () => {
    moPhienDaDangNhap();
    renderWithProviders(<AppRouter />, "/reconcile");
    expect(await screen.findByRole("heading", { level: 1, name: "Tổng quan" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: "Đối chiếu" })).not.toBeInTheDocument();
  });
});

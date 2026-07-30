import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppRouter } from "../../src/routes/AppRouter";
import { json, mockFetch, renderWithProviders } from "../helpers/renderApp";

// Cờ SHOW_EXPORTS — trang "Kết xuất & Convert" (S3).
//
// LỊCH SỬ: tắt 2026-07-30 — chủ dự án ẩn khỏi giao diện người dùng, giữ nguyên mã.
//
// Ba ca dưới khoá ĐÚNG ba điểm nối dây của trang này: mục menu (Sidebar), route (AppRouter)
// và lối tắt ở Tổng quan (DashboardPage). Cả ba dùng vai `ke_toan_truong` — vai CÓ quyền kết
// xuất — để chứng minh việc ẩn đến từ CỜ, không phải từ RBAC. Bật lại phải đảo kỳ vọng ở đây;
// đỏ khi sửa một chỗ mà quên chỗ khác là hành vi đúng, không phải hồi quy.

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

describe("Trang Kết xuất & Convert (SHOW_EXPORTS tắt)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sidebar KHÔNG có mục 'Kết xuất & Convert'", async () => {
    moPhienDaDangNhap();
    renderWithProviders(<AppRouter />, "/");
    // Chờ app vào được bên trong rồi mới khẳng định — khẳng định sớm sẽ đọc nhầm lúc còn ở
    // màn "Đang kiểm tra phiên" (khi đó chưa link nào tồn tại, ca test xanh giả).
    // U41: Footer bốn cột cũng có liên kết "Danh sách hóa đơn" ⇒ tìm toàn trang sẽ mơ hồ.
    // Khoanh vào đúng thanh điều hướng — vốn là thứ ca này nói tới.
    const thanhBen = await screen.findByRole("navigation", { name: "Điều hướng chính" });
    await within(thanhBen).findByRole("link", { name: "Danh sách hóa đơn" });
    // Khẳng định vắng mặt vẫn quét TOÀN TRANG (mạnh hơn): "Kết xuất & Convert" không được
    // xuất hiện ở bất kỳ bề mặt nào — kể cả cột "Sản phẩm" của Footer, nơi bản thiết kế
    // 30/07 đã vẽ nhầm nó vào.
    expect(screen.queryByRole("link", { name: "Kết xuất & Convert" })).not.toBeInTheDocument();
  });

  it("vào thẳng /exports → rơi về Tổng quan, không vào được trang Kết xuất", async () => {
    moPhienDaDangNhap();
    renderWithProviders(<AppRouter />, "/exports");
    expect(await screen.findByRole("heading", { level: 1, name: "Tổng quan" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 1, name: "Kết xuất & Convert" }),
    ).not.toBeInTheDocument();
  });

  it("Tổng quan KHÔNG còn lối tắt 'Kết xuất'", async () => {
    moPhienDaDangNhap();
    renderWithProviders(<AppRouter />, "/");
    // Chờ khối Lối tắt hiện — Dashboard còn đang tải thì chưa lối tắt nào tồn tại, khẳng
    // định lúc đó là xanh giả. (U41: nhãn lối tắt nay lấy từ `lib/nav.ts` nên "Xem hóa đơn"
    // đã thành "Danh sách hóa đơn"; chờ chính tiêu đề khối thì không phụ thuộc nhãn.)
    await screen.findByText("Lối tắt");
    expect(screen.queryByText("Kết xuất & Convert")).not.toBeInTheDocument();
  });
});

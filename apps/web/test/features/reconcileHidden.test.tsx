import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppRouter } from "../../src/routes/AppRouter";
import { json, mockFetch, renderWithProviders } from "../helpers/renderApp";

// Cờ SHOW_RECONCILE — trang "Đối chiếu".
//
// LỊCH SỬ: tắt 2026-07-22 ("chức năng Lệch thuế chưa cần thiết"); bật 2026-07-29 sau khi đo
// trên production (15/31.807 hóa đơn lệch thuế, 11 ca > 100.000 đ); TẮT LẠI 2026-07-29 —
// chủ dự án tạm ẩn khỏi trang người dùng để nghiên cứu thêm. Số đo cũ KHÔNG bị bác bỏ:
// docs/RA-SOAT-thong-bao-lech-hoa-don-2026-07-28.md §2, điều kiện bật lại ghi ở
// docs/BACKLOG-y-tuong-va-de-xuat.md mục "Đối chiếu — tạm ẩn 2026-07-29".
//
// Hai ca dưới khoá ĐÚNG hai điểm nối dây — mục menu (Sidebar) và route (AppRouter). Chúng đã
// đảo kỳ vọng theo cờ hai lần; ý đồ KHÔNG đổi qua các lần đó: bật/tắt trang này phải là thay
// đổi CÓ CHỦ ĐÍCH, không xảy ra do sửa một chỗ mà quên chỗ kia.

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

describe("Trang Đối chiếu (SHOW_RECONCILE tắt)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sidebar KHÔNG có mục 'Đối chiếu'", async () => {
    moPhienDaDangNhap();
    renderWithProviders(<AppRouter />, "/");
    // Chờ app vào được bên trong rồi mới khẳng định — khẳng định sớm sẽ đọc nhầm lúc còn ở
    // màn "Đang kiểm tra phiên" (khi đó chưa link nào tồn tại, ca test xanh giả).
    // U41: Footer bốn cột cũng có liên kết "Danh sách hóa đơn" ⇒ tìm toàn trang sẽ mơ hồ.
    // Khoanh vào đúng thanh điều hướng — vốn là thứ ca này nói tới.
    const thanhBen = await screen.findByRole("navigation", { name: "Điều hướng chính" });
    await within(thanhBen).findByRole("link", { name: "Danh sách hóa đơn" });
    // Khẳng định vắng mặt vẫn quét TOÀN TRANG (mạnh hơn): mục "Đối chiếu" không được xuất
    // hiện ở bất kỳ bề mặt nào, kể cả Footer.
    expect(screen.queryByRole("link", { name: "Đối chiếu" })).not.toBeInTheDocument();
  });

  it("vào thẳng /reconcile → rơi về Tổng quan, không vào được trang Đối chiếu", async () => {
    moPhienDaDangNhap();
    renderWithProviders(<AppRouter />, "/reconcile");
    expect(await screen.findByRole("heading", { level: 1, name: "Tổng quan" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: "Đối chiếu" })).not.toBeInTheDocument();
  });
});

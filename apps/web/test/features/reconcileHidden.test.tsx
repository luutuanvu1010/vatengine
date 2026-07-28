import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppRouter } from "../../src/routes/AppRouter";
import { json, mockFetch, renderWithProviders } from "../helpers/renderApp";

// Cờ SHOW_RECONCILE — trang "Đối chiếu".
//
// LỊCH SỬ: tắt 2026-07-22 ("chức năng Lệch thuế chưa cần thiết"); BẬT LẠI 2026-07-29 sau khi
// đo trên production — 15/31.807 hóa đơn đang lệch thuế (0,047%, không nhiễu), trong đó 11 ca
// lệch > 100.000 đ. Số đo + lập luận: docs/RA-SOAT-thong-bao-lech-hoa-don-2026-07-28.md §2.
//
// Hai ca dưới khoá ĐÚNG hai điểm nối dây — mục menu (Sidebar) và route (AppRouter). Trước đây
// chúng khoá trạng thái ẨN, nay khoá trạng thái HIỆN; ý đồ KHÔNG đổi: bật/tắt trang này phải
// là thay đổi CÓ CHỦ ĐÍCH, không xảy ra do sửa một chỗ mà quên chỗ kia.

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

describe("Trang Đối chiếu (SHOW_RECONCILE bật)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sidebar CÓ mục 'Đối chiếu'", async () => {
    moPhienDaDangNhap();
    renderWithProviders(<AppRouter />, "/");
    // Chờ app vào được bên trong rồi mới khẳng định — khẳng định sớm sẽ đọc nhầm lúc còn ở
    // màn "Đang kiểm tra phiên".
    await screen.findByRole("link", { name: "Danh sách hóa đơn" });
    expect(screen.getByRole("link", { name: "Đối chiếu" })).toBeInTheDocument();
  });

  it("vào thẳng /reconcile → tiếp đất ĐÚNG trang Đối chiếu, không rơi về Tổng quan", async () => {
    moPhienDaDangNhap();
    renderWithProviders(<AppRouter />, "/reconcile");
    expect(await screen.findByRole("heading", { level: 1, name: "Đối chiếu" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: "Tổng quan" })).not.toBeInTheDocument();
  });
});

import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppRouter } from "../../src/routes/AppRouter";
import type { MeResponse } from "../../src/types/api";
import { json, mockFetch, renderWithProviders } from "../helpers/renderApp";

// U17a-7 (bugfix hiển thị) — mã và nhãn TÁCH RỜI trong hợp đồng thật: `goiDichVu` là MÃ
// ("free"), `goiDichVuTen` là nhãn tiếng Việt ("Miễn phí"). Gán kiểu MeResponse tường minh
// để tsc ép mock đồng bộ với hợp đồng — trước đây mock để "Miễn phí" vào goiDichVu (mã cũ),
// không gán kiểu, nên tsc không bắt được lệch hợp đồng khi GET /me đổi sang có goiDichVuTen.
const ME_ADMIN: MeResponse = {
  ten: "Tên cũ",
  mst: "4201568932",
  goiDichVu: "free",
  goiDichVuTen: "Miễn phí",
  banQuyen: "Mặc định",
  ghiChu: null,
  role: "quan_tri",
};

async function loginTo(path: string) {
  renderWithProviders(<AppRouter />, "/");
  await userEvent.type(await screen.findByLabelText("Email công việc"), "qt@tourdao.vn");
  await userEvent.type(screen.getByLabelText("Mật khẩu"), "pw");
  await userEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
  await userEvent.click(await screen.findByRole("link", { name: "Cài đặt chung" }));
}

describe("Cài đặt — sửa hồ sơ (quan_tri)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("quan_tri sửa Tên → Lưu gọi PATCH + cập nhật hiển thị", async () => {
    mockFetch({
      login: () => json(200, { token: "jwt" }),
      me: () => json(200, ME_ADMIN),
      patchMe: (body) => json(200, { ...ME_ADMIN, ...(body as object) }),
    });
    await loginTo("/settings");
    const input = await screen.findByLabelText("Tên cá nhân / doanh nghiệp");
    await userEvent.clear(input);
    await userEvent.type(input, "Tên mới");
    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));
    // Pill header phản ánh tên mới sau applyMe.
    expect(await screen.findAllByText("Tên mới")).not.toHaveLength(0);
    // U17a-7 (bugfix hiển thị) — sau khi Lưu, ô "Gói dịch vụ" PHẢI vẫn hiện nhãn tiếng
    // Việt "Miễn phí", KHÔNG được rơi về mã thô "free" (đúng bug Task 7 sinh ra: PATCH
    // /me thiếu goiDichVuTen → applyMe ghi đè `me` bằng response thiếu nhãn).
    expect(screen.getByText("Miễn phí")).toBeInTheDocument();
    expect(screen.queryByText("free")).not.toBeInTheDocument();
  });

  it("vai ke_toan → form chỉ đọc (không có nút Lưu)", async () => {
    mockFetch({
      login: () => json(200, { token: "jwt" }),
      me: () => json(200, { ...ME_ADMIN, role: "ke_toan" }),
    });
    await loginTo("/settings");
    expect(await screen.findByText("Mã số thuế")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lưu" })).not.toBeInTheDocument();
  });
});

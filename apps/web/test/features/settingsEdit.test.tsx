import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearToken } from "../../src/lib/apiClient";
import { AppRouter } from "../../src/routes/AppRouter";
import { json, mockFetch, renderWithProviders } from "../helpers/renderApp";

const ME_ADMIN = {
  ten: "Tên cũ",
  mst: "4201568932",
  goiDichVu: "Miễn phí",
  banQuyen: "Mặc định",
  ghiChu: null,
  role: "quan_tri" as const,
};

async function loginTo(path: string) {
  renderWithProviders(<AppRouter />, "/");
  await userEvent.type(screen.getByLabelText("Email công việc"), "qt@tourdao.vn");
  await userEvent.type(screen.getByLabelText("Mật khẩu"), "pw");
  await userEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
  await userEvent.click(await screen.findByRole("link", { name: "Cài đặt chung" }));
}

describe("Cài đặt — sửa hồ sơ (quan_tri)", () => {
  beforeEach(() => clearToken());
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

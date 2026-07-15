import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearToken } from "../../src/lib/apiClient";
import { AppRouter } from "../../src/routes/AppRouter";
import { json, mockFetch, renderWithProviders } from "../helpers/renderApp";

const ME = {
  ten: "Công ty TNHH Tour Đảo",
  mst: "4201568932",
  goiDichVu: "Miễn phí",
  banQuyen: "Mặc định",
  ghiChu: "ghi chú test",
  role: "quan_tri" as const,
};

async function login() {
  renderWithProviders(<AppRouter />, "/");
  await userEvent.type(screen.getByLabelText("Email công việc"), "qt@tourdao.vn");
  await userEvent.type(screen.getByLabelText("Mật khẩu"), "pw");
  await userEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
  await screen.findByRole("link", { name: "Cài đặt chung" }); // vào app xong
}

describe("ProfileMenu — dropdown avatar", () => {
  beforeEach(() => clearToken());
  afterEach(() => vi.restoreAllMocks());

  it("mở menu → hiện email/bản quyền/ghi chú + Sửa hồ sơ + Đăng xuất; Esc đóng", async () => {
    mockFetch({ login: () => json(200, { token: "jwt" }), me: () => json(200, ME) });
    await login();
    await userEvent.click(screen.getByRole("button", { name: "Mở hồ sơ" }));
    expect(await screen.findByText("qt@tourdao.vn")).toBeInTheDocument();
    expect(screen.getByText("ghi chú test")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sửa hồ sơ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đăng xuất" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("link", { name: "Sửa hồ sơ" })).not.toBeInTheDocument();
  });
});

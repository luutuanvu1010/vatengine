import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppRouter } from "../../src/routes/AppRouter";
import { json, mockFetch, renderWithProviders } from "../helpers/renderApp";

// Ép useMediaQuery báo MOBILE (matches=true) để hiện drawer + hamburger.
function forceMobile() {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

async function loginMobile() {
  mockFetch({
    login: () => json(200, { token: "jwt" }),
    me: () =>
      json(200, {
        ten: "Công ty TNHH Tour Đảo",
        mst: "4201568932",
        goiDichVu: "Miễn phí",
        role: "ke_toan_truong",
      }),
  });
  renderWithProviders(<AppRouter />, "/");
  await userEvent.type(await screen.findByLabelText("Email công việc"), "ketoan@tourdao.vn");
  await userEvent.type(screen.getByLabelText("Mật khẩu"), "matkhau");
  await userEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
}

describe("Điều hướng responsive — drawer trên mobile", () => {
  beforeEach(() => {
    forceMobile();
  });
  afterEach(() => vi.restoreAllMocks());

  it("mobile: hiện hamburger, drawer đóng mặc định, bấm → mở", async () => {
    await loginMobile();
    const burger = await screen.findByRole("button", { name: "Mở menu" });
    // Đóng mặc định.
    expect(burger).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(burger);
    // Mở sau khi bấm.
    expect(burger).toHaveAttribute("aria-expanded", "true");
  });

  it("mobile: bấm một mục điều hướng → drawer tự đóng", async () => {
    await loginMobile();
    const burger = await screen.findByRole("button", { name: "Mở menu" });
    await userEvent.click(burger);
    expect(burger).toHaveAttribute("aria-expanded", "true");
    // Điều hướng sang Danh sách hóa đơn (mục trong drawer) → đóng drawer.
    // U41: cùng nhãn có ở Footer ⇒ phải bấm ĐÚNG liên kết trong drawer, nếu không ca này
    // sẽ bấm vào Footer và drawer đương nhiên không đóng.
    await userEvent.click(
      within(screen.getByRole("navigation", { name: "Điều hướng chính" })).getByRole("link", {
        name: "Danh sách hóa đơn",
      }),
    );
    await waitFor(() => expect(burger).toHaveAttribute("aria-expanded", "false"));
  });
});

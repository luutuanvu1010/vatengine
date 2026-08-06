// `/gioi-thieu` mở ra CÔNG KHAI (QĐ-1, chủ dự án 2026-08-06).
//
// Trước thay đổi này route nằm trong `ProtectedLayout`, nên ba liên kết trong cột "Hỗ trợ" của
// Footer — "Giới thiệu & Hỗ trợ", "Câu hỏi thường gặp", "Lịch sử cập nhật" — đều bật ngược về
// màn Đăng nhập với khách chưa có tài khoản, không báo lỗi gì. Đó là liên kết chết.
//
// Ca "đã đăng nhập vẫn thấy sidebar" là ca CHỐNG HỒI QUY quan trọng nhất ở đây: chuyển route
// ra ngoài `ProtectedLayout` rất dễ làm người đang dùng app mất khung điều hướng.
import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppRouter } from "../../src/routes/AppRouter";
import { json, mockFetch, renderWithProviders } from "../helpers/renderApp";

function chuaDangNhap() {
  mockFetch({ login: () => json(401, { error: "unauthorized" }) });
}

function daDangNhap() {
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

describe("Trang Giới thiệu & Hỗ trợ — công khai", () => {
  afterEach(() => vi.restoreAllMocks());

  it("chưa đăng nhập: đọc được nội dung, KHÔNG bị đá về màn Đăng nhập", async () => {
    chuaDangNhap();
    renderWithProviders(<AppRouter />, "/gioi-thieu");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Giới thiệu & Hỗ trợ" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: "Đăng nhập" })).toBeNull();
  });

  it("chưa đăng nhập: có Footer và lối quay lại Đăng nhập", async () => {
    chuaDangNhap();
    const { container } = renderWithProviders(<AppRouter />, "/gioi-thieu");
    await screen.findByRole("heading", { level: 1, name: "Giới thiệu & Hỗ trợ" });
    expect(container.querySelector("footer")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Đăng nhập" })).toHaveAttribute("href", "/login");
  });

  it("chưa đăng nhập: KHÔNG có thanh điều hướng của ứng dụng", async () => {
    chuaDangNhap();
    renderWithProviders(<AppRouter />, "/gioi-thieu");
    await screen.findByRole("heading", { level: 1, name: "Giới thiệu & Hỗ trợ" });
    expect(screen.queryByRole("navigation", { name: "Điều hướng chính" })).toBeNull();
  });

  it("đã đăng nhập: vẫn thấy thanh điều hướng như cũ", async () => {
    daDangNhap();
    renderWithProviders(<AppRouter />, "/gioi-thieu");
    expect(await screen.findByRole("navigation", { name: "Điều hướng chính" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Giới thiệu & Hỗ trợ" }),
    ).toBeInTheDocument();
  });
});

describe("Neo #faq và #lich-su cuộn tới đúng mục", () => {
  let daCuonToi: string[] = [];
  let goc: PropertyDescriptor | undefined;

  beforeEach(() => {
    daCuonToi = [];
    goc = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: function (this: Element) {
        daCuonToi.push(this.id);
      },
    });
  });

  afterEach(() => {
    if (goc) Object.defineProperty(Element.prototype, "scrollIntoView", goc);
    else Reflect.deleteProperty(Element.prototype, "scrollIntoView");
    vi.restoreAllMocks();
  });

  it("chưa đăng nhập: /gioi-thieu#faq cuộn tới mục FAQ", async () => {
    chuaDangNhap();
    renderWithProviders(<AppRouter />, "/gioi-thieu#faq");
    await screen.findByRole("heading", { level: 1, name: "Giới thiệu & Hỗ trợ" });
    expect(daCuonToi).toContain("faq");
  });

  it("đã đăng nhập: /gioi-thieu#lich-su cuộn tới mục Lịch sử", async () => {
    daDangNhap();
    renderWithProviders(<AppRouter />, "/gioi-thieu#lich-su");
    await screen.findByRole("navigation", { name: "Điều hướng chính" });
    expect(daCuonToi).toContain("lich-su");
  });
});

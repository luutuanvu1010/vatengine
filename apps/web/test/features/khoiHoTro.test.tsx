// Khối "Cần hỗ trợ?" — kênh liên hệ trên các trang CÔNG KHAI.
//
// VÌ SAO nằm ở cột trái chứ không ở panel giới thiệu bên phải: `LoginPage` đặt
// `hidden={isMobile}` cho <aside>, tức panel phải BIẾN MẤT trên điện thoại. Đặt kênh hỗ trợ
// vào đó là giấu nó khỏi một nửa người dùng.
import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KhoiHoTro } from "../../src/components/KhoiHoTro";
import { CONTACT_PHONE, GIO_HO_TRO } from "../../src/lib/contact";
import { hienThiSoDienThoai, telUrl, whatsappUrl, zaloUrl } from "../../src/lib/contactLinks";
import { AppRouter } from "../../src/routes/AppRouter";
import { json, mockFetch, renderWithProviders } from "../helpers/renderApp";

/** Kịch bản "chưa đăng nhập": mockFetch CÓ khai `login` ⇒ `/me` trả 401 cho tới khi đăng
 * nhập thật. Khai `me` mà không khai `login` là kịch bản đã-có-cookie, sai đời cho ca này. */
function chuaDangNhap() {
  mockFetch({ login: () => json(401, { error: "unauthorized" }) });
}

describe("Khối Cần hỗ trợ?", () => {
  afterEach(() => vi.restoreAllMocks());

  it("đủ ba kênh liên hệ, tất cả dẫn xuất từ hàm dựng liên kết", () => {
    renderWithProviders(<KhoiHoTro />);
    expect(screen.getByRole("link", { name: "Nhắn qua Zalo" })).toHaveAttribute(
      "href",
      zaloUrl(CONTACT_PHONE),
    );
    expect(screen.getByRole("link", { name: "Nhắn qua WhatsApp" })).toHaveAttribute(
      "href",
      whatsappUrl(CONTACT_PHONE),
    );
    expect(screen.getByRole("link", { name: hienThiSoDienThoai(CONTACT_PHONE) })).toHaveAttribute(
      "href",
      telUrl(CONTACT_PHONE),
    );
  });

  it("hiện giờ hỗ trợ đọc từ nguồn chung", () => {
    renderWithProviders(<KhoiHoTro />);
    expect(screen.getByText(new RegExp(GIO_HO_TRO))).toBeInTheDocument();
  });

  // CHỐNG BỊA SỐ: ca trên so với `hienThiSoDienThoai(CONTACT_PHONE)` nên một chuỗi gõ tay
  // TRÙNG khớp vẫn lọt. Ca này quét toàn bộ chữ trên khối: không được có dãy số nào khác.
  it("không có dãy số nào khác số liên hệ lọt vào khối", () => {
    const { container } = renderWithProviders(<KhoiHoTro />);
    const cacDay = (container.textContent ?? "").match(/\d[\d ]{8,}\d/g) ?? [];
    expect(cacDay).toHaveLength(1);
    expect(cacDay[0]?.replace(/\s/g, "")).toBe(CONTACT_PHONE);
  });

  it("Zalo và WhatsApp mở tab mới, chống tabnabbing; nút gọi thì không", () => {
    renderWithProviders(<KhoiHoTro />);
    const zalo = screen.getByRole("link", { name: "Nhắn qua Zalo" });
    expect(zalo).toHaveAttribute("target", "_blank");
    expect(zalo.getAttribute("rel")).toContain("noopener");
    // `tel:` không rời trang — mở tab mới chỉ để lại một tab trắng.
    expect(
      screen.getByRole("link", { name: hienThiSoDienThoai(CONTACT_PHONE) }),
    ).not.toHaveAttribute("target");
  });

  it("có mặt ở màn Đăng nhập", async () => {
    chuaDangNhap();
    renderWithProviders(<AppRouter />, "/login");
    expect(await screen.findByRole("heading", { name: "Cần hỗ trợ?" })).toBeInTheDocument();
  });

  // QĐ-6 (chủ dự án, 2026-08-06): trang Đăng ký KHÔNG thêm Footer. Ca này khóa quyết định
  // lại, để lần sau không ai "sửa cho đồng bộ" mà vô tình lật nó.
  it("có mặt ở trang Đăng ký, và trang đó vẫn không có Footer", async () => {
    chuaDangNhap();
    const { container } = renderWithProviders(<AppRouter />, "/dang-ky");
    expect(await screen.findByRole("heading", { name: "Cần hỗ trợ?" })).toBeInTheDocument();
    expect(container.querySelector("footer")).toBeNull();
  });
});

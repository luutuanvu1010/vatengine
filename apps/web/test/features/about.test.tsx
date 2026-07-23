import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AboutPage } from "../../src/features/about/AboutPage";
import { renderWithProviders } from "../helpers/renderApp";

describe("Trang Giới thiệu & Hỗ trợ (U16b)", () => {
  it("hiện tiêu đề mới + mục đích phần mềm", () => {
    renderWithProviders(<AboutPage />);
    expect(screen.getByRole("heading", { name: "Giới thiệu & Hỗ trợ" })).toBeInTheDocument();
    expect(screen.getByText(/tiết kiệm cả chi phí phần mềm/i)).toBeInTheDocument();
  });

  it("FAQ: bấm câu hỏi → câu trả lời hiện, aria-expanded đổi", async () => {
    renderWithProviders(<AboutPage />);
    const question = screen.getByRole("button", {
      name: /Phần mềm có lưu mật khẩu tài khoản thuế của tôi không/,
    });
    expect(question).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(question);
    expect(question).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/không lưu mật khẩu thô/i)).toBeInTheDocument();
  });

  it("Lịch sử cập nhật: hiện phiên bản mới nhất", () => {
    renderWithProviders(<AboutPage />);
    expect(screen.getByText(/v1\.6/)).toBeInTheDocument();
  });

  it("nút Zalo/WhatsApp: đúng liên kết, mở tab mới, chống tabnabbing + giờ hỗ trợ", () => {
    renderWithProviders(<AboutPage />);
    const zalo = screen.getByRole("link", { name: /Zalo/ });
    const wa = screen.getByRole("link", { name: /WhatsApp/ });
    expect(zalo).toHaveAttribute("href", "https://zalo.me/0989929373");
    expect(wa).toHaveAttribute("href", "https://wa.me/84989929373");
    expect(zalo).toHaveAttribute("target", "_blank");
    expect(zalo.getAttribute("rel")).toContain("noopener");
    expect(screen.getByText(/08:00 – 17:00/)).toBeInTheDocument();
  });

  it("Đóng góp: khối QR KHÔNG render khi SHOW_DONATION tắt", () => {
    renderWithProviders(<AboutPage />);
    expect(screen.queryByTestId("donation-qr")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /100\.000/ })).not.toBeInTheDocument();
  });
});

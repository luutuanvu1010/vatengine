import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AboutPage } from "../../src/features/about/AboutPage";
import { CHANGELOG } from "../../src/lib/changelog";
import { renderWithProviders } from "../helpers/renderApp";

/** Số hiệu phiên bản chứa dấu chấm — thoát trước khi dựng RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

  // Khẳng định DẪN XUẤT từ CHANGELOG, không gõ cứng số hiệu: bản trước ghim `/v1\.6/` —
  // đúng vì v1.6 tình cờ là mục thứ 5 (đúng trần hiển thị mặc định). Thêm BẤT KỲ mục
  // changelog nào cũng đẩy nó ra ngoài trần và làm test đỏ vì lý do chẳng liên quan gì tới
  // điều nó muốn kiểm (đã xảy ra 28/07 khi v1.10 và v2.0 cùng được thêm).
  it("Lịch sử cập nhật: hiện phiên bản mới nhất, ẩn bớt phiên bản cũ", () => {
    renderWithProviders(<AboutPage />);
    const moiNhat = CHANGELOG[0];
    const cuNhat = CHANGELOG[CHANGELOG.length - 1];
    expect(moiNhat).toBeDefined();
    expect(screen.getByText(new RegExp(escapeRegExp(moiNhat?.version ?? "")))).toBeInTheDocument();
    // Danh sách bị cắt bớt (có nút "xem thêm") → mục cũ nhất KHÔNG hiện sẵn.
    expect(screen.queryByText(new RegExp(escapeRegExp(cuNhat?.version ?? "")))).toBeNull();
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

import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AboutPage } from "../../src/features/about/AboutPage";
import { renderWithProviders } from "../helpers/renderApp";

describe("Trang Giới thiệu & Ủng hộ (U16)", () => {
  it("hiện mục đích + 2 phần góp ý/đóng góp", () => {
    renderWithProviders(<AboutPage />);
    expect(screen.getByRole("heading", { name: "Giới thiệu & Ủng hộ" })).toBeInTheDocument();
    expect(screen.getByText(/tiết kiệm cả chi phí phần mềm/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Góp ý/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Đóng góp/ })).toBeInTheDocument();
    expect(screen.getByText(/Cảm ơn bạn đã đồng hành/)).toBeInTheDocument();
  });

  it("nút Zalo/WhatsApp: đúng liên kết, mở tab mới, chống tabnabbing", () => {
    renderWithProviders(<AboutPage />);
    const zalo = screen.getByRole("link", { name: /Zalo/ });
    const wa = screen.getByRole("link", { name: /WhatsApp/ });
    expect(zalo).toHaveAttribute("href", "https://zalo.me/0989929373");
    expect(wa).toHaveAttribute("href", "https://wa.me/84989929373");
    expect(zalo).toHaveAttribute("target", "_blank");
    expect(zalo.getAttribute("rel")).toContain("noopener");
  });

  it("mặc định mức 50.000 → QR chứa số tiền tương ứng", () => {
    renderWithProviders(<AboutPage />);
    const fig = screen.getByTestId("donation-qr");
    expect(fig.getAttribute("data-payload")).toContain("540550000");
    expect(screen.getByText(/Số tiền: 50\.000 ₫/)).toBeInTheDocument();
  });

  it("chọn mức khác → QR đổi tương ứng", async () => {
    renderWithProviders(<AboutPage />);
    await userEvent.click(screen.getByRole("button", { name: /100\.000/ }));
    expect(screen.getByTestId("donation-qr").getAttribute("data-payload")).toContain("5406100000");
  });

  it("Số khác: nhập số tiền tùy ý → QR cập nhật; rỗng → QR tĩnh", async () => {
    renderWithProviders(<AboutPage />);
    await userEvent.click(screen.getByRole("button", { name: "Số khác" }));
    // rỗng → tĩnh (01=11)
    expect(
      (screen.getByTestId("donation-qr").getAttribute("data-payload") ?? "").slice(6, 12),
    ).toBe("010211");
    await userEvent.type(screen.getByLabelText(/Nhập số tiền/), "25000");
    expect(screen.getByTestId("donation-qr").getAttribute("data-payload")).toContain("540525000");
  });

  it("Số khác: ký tự không phải số bị loại, chỉ chữ số vào QR", async () => {
    renderWithProviders(<AboutPage />);
    await userEvent.click(screen.getByRole("button", { name: "Số khác" }));
    await userEvent.type(screen.getByLabelText(/Nhập số tiền/), "1a2b3c000");
    expect(screen.getByTestId("donation-qr").getAttribute("data-payload")).toContain("5406123000");
  });
});

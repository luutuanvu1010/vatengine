// U41 — Footer bốn cột, có mặt ở MỌI trang.
//
// Trước U41, `Footer` chỉ được render ở `LoginPage`; mọi trang sau khi đăng nhập không có
// footer nào. Nay nó nằm trong `AppLayout` nên xuất hiện khắp nơi.
//
// HAI BIẾN THỂ — khác nhau đúng một cột:
//   • có `role`  → trong ứng dụng: hiện cột "Sản phẩm", lọc theo vai.
//   • không role → màn Đăng nhập: ẨN cột "Sản phẩm". Chưa đăng nhập thì mọi liên kết đó đều
//     bật về màn đăng nhập ⇒ liên kết chết.
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Footer } from "../../src/components/layout/Footer";
import { SHOW_EXPORTS } from "../../src/lib/featureFlags";
import { ORG } from "../../src/lib/orgInfo";
import { renderWithProviders } from "../helpers/renderApp";

/** `renderWithProviders` đã bọc sẵn MemoryRouter — KHÔNG lồng thêm router nữa. */
function ve(role?: "ke_toan" | "ke_toan_truong" | "quan_tri") {
  return renderWithProviders(role ? <Footer role={role} /> : <Footer />);
}

/** Vùng một cột, khoanh theo tiêu đề cột — tránh bắt nhầm chữ trùng ở cột khác. */
function cot(ten: string): HTMLElement {
  const tieuDe = screen.getByRole("heading", { name: ten });
  const vung = tieuDe.closest("div");
  if (!vung) throw new Error(`Không tìm được vùng của cột "${ten}"`);
  return vung;
}

describe("Footer bốn cột", () => {
  it("trong ứng dụng: đủ bốn cột", () => {
    ve("quan_tri");
    for (const ten of ["Sản phẩm", "Hỗ trợ", "Pháp nhân"]) {
      expect(screen.getByRole("heading", { name: ten })).toBeInTheDocument();
    }
  });

  // ---- Pháp nhân: sai một chữ là sai pháp lý ------------------------------------------
  // `lib/orgInfo.ts` là nguồn DUY NHẤT. Ca này so với chính hằng đó, nên chép chuỗi vào JSX
  // sẽ không làm test đỏ — vì vậy có thêm ca chống-bịa ngay bên dưới.
  it("thông tin pháp nhân đọc từ ORG, không gõ chuỗi rời", () => {
    ve("ke_toan");
    const v = cot("Pháp nhân");
    expect(within(v).getByText(ORG.congTy)).toBeInTheDocument();
    expect(within(v).getByText(new RegExp(ORG.mst))).toBeInTheDocument();
    expect(within(v).getByText(new RegExp(ORG.diaChi.slice(0, 24)))).toBeInTheDocument();
  });

  // CHỐNG HỒI QUY THẬT: bản mockup ngày 30/07 ghi địa chỉ "Số 12 đường Trần Phú, phường Vĩnh
  // Nguyên..." — HOÀN TOÀN BỊA, không trùng một chữ với địa chỉ thật. Mã số thuế thì lại
  // đúng, nên nhìn lướt qua rất giống thật. Ca này bắt đúng cái bẫy đó.
  it("KHÔNG chứa địa chỉ bịa trong mockup thiết kế", () => {
    const { container } = ve("ke_toan");
    expect(container.textContent).not.toMatch(/Trần Phú/);
    expect(container.textContent).not.toMatch(/Vĩnh Nguyên/);
  });

  // ---- Cột Sản phẩm: theo vai VÀ theo cờ ----------------------------------------------
  it("vai ke_toan không thấy liên kết Kết nối tài khoản thuế", () => {
    ve("ke_toan");
    const v = cot("Sản phẩm");
    expect(within(v).getByRole("link", { name: "Danh sách hóa đơn" })).toBeInTheDocument();
    expect(within(v).queryByRole("link", { name: "Kết nối tài khoản thuế" })).toBeNull();
  });

  it("vai ke_toan_truong thấy Kết nối tài khoản thuế", () => {
    ve("ke_toan_truong");
    expect(
      within(cot("Sản phẩm")).getByRole("link", { name: "Kết nối tài khoản thuế" }),
    ).toBeInTheDocument();
  });

  // Bản thiết kế 30/07 vẽ "Kết xuất & Convert" trong cột Sản phẩm, trong khi cờ đã tắt cùng
  // ngày. Footer đọc từ `lib/nav.ts` nên tự hưởng — ca này khoá điều đó.
  it("SHOW_EXPORTS tắt ⇒ không có Kết xuất & Convert, kể cả vai quản trị", () => {
    expect(SHOW_EXPORTS).toBe(false);
    const { container } = ve("quan_tri");
    expect(container.textContent).not.toMatch(/Kết xuất/);
  });

  // ---- Biến thể màn Đăng nhập ---------------------------------------------------------
  it("không có vai (màn Đăng nhập) ⇒ ẩn hẳn cột Sản phẩm", () => {
    ve();
    expect(screen.queryByRole("heading", { name: "Sản phẩm" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Danh sách hóa đơn" })).toBeNull();
    // Ba cột còn lại vẫn đủ.
    expect(screen.getByRole("heading", { name: "Hỗ trợ" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pháp nhân" })).toBeInTheDocument();
  });

  // ---- Cột Hỗ trợ ---------------------------------------------------------------------
  it("liên kết hỗ trợ trỏ đúng neo, Zalo dựng từ số dùng chung", () => {
    ve("ke_toan");
    const v = cot("Hỗ trợ");
    expect(within(v).getByRole("link", { name: "Câu hỏi thường gặp" })).toHaveAttribute(
      "href",
      "/gioi-thieu#faq",
    );
    expect(within(v).getByRole("link", { name: "Lịch sử cập nhật" })).toHaveAttribute(
      "href",
      "/gioi-thieu#lich-su",
    );
    expect(within(v).getByRole("link", { name: "Góp ý qua Zalo" })).toHaveAttribute(
      "href",
      "https://zalo.me/0989929373",
    );
  });

  // QĐ chủ dự án 2026-08-06: gỡ WhatsApp khỏi mọi bề mặt — kế toán viên VN hầu như không
  // dùng kênh này. Ca này khoá sự vắng mặt, để một sửa đổi sau không âm thầm thêm lại.
  it("KHÔNG còn liên kết Góp ý qua WhatsApp", () => {
    ve("ke_toan");
    const v = cot("Hỗ trợ");
    expect(within(v).queryByRole("link", { name: /WhatsApp/ })).toBeNull();
  });

  // ---- Dải đáy ------------------------------------------------------------------------
  it("dải đáy có bản quyền theo năm hiện tại và ghi chú hạ tầng", () => {
    const { container } = ve("ke_toan");
    const nam = new Date().getFullYear();
    expect(container.textContent).toMatch(new RegExp(`© ${nam} ${ORG.congTy}`));
    expect(container.textContent).toMatch(/Cloudflare/);
  });

  it("dùng thẻ <footer> để trình đọc màn hình nhận đúng vùng", () => {
    const { container } = ve("ke_toan");
    expect(container.querySelector("footer")).not.toBeNull();
  });
});

// U20 §5 — Bốn card thông tin sản phẩm / pháp lý trong trang Cài đặt.
//
// Đây là văn bản PHÁP LÝ hiển thị cho doanh nghiệp thật. Test ở đây không kiểm "có render
// không" — chúng canh những câu mà nếu sai thì thành tuyên bố sai lệch với khách hàng.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ThongTinSanPham } from "../../src/features/settings/ThongTinSanPham";
import { ORG } from "../../src/lib/orgInfo";

describe("Bốn card thông tin sản phẩm", () => {
  it("render 3 card tự viết + khối danh tính tác giả dùng lại", () => {
    render(<ThongTinSanPham />);
    for (const t of [/Về phần mềm/i, /Chính sách sử dụng/i, /Quyền lợi tài khoản/i]) {
      expect(screen.getByRole("heading", { name: t })).toBeInTheDocument();
    }
    // Danh tính tác giả KHÔNG phải card tự viết — nó là <OrgIdentity /> (U32) dùng lại,
    // nên nhận diện qua nội dung chứ không qua tiêu đề card.
    expect(screen.getByText(new RegExp(ORG.congTy, "i"))).toBeInTheDocument();
  });

  it("lấy danh tính pháp nhân từ ORG — không chép chuỗi vào JSX", () => {
    // ORG là nguồn sự thật DUY NHẤT (lib/orgInfo.ts) và OrgIdentity là nguồn HIỂN THỊ duy
    // nhất. Chép tay tên/địa chỉ/MST vào trang là tạo nguồn thứ hai — hai nơi sẽ lệch khi
    // công ty đổi thông tin, và sai một chữ ở đây là sai pháp lý.
    const { container } = render(<ThongTinSanPham />);
    const chu = container.textContent ?? "";
    expect(chu).toContain(ORG.congTy);
    expect(chu).toContain(ORG.mst);
    expect(chu).toContain(ORG.diaChi.slice(0, 25));
  });
});

describe("🔴 QĐ-8 — câu chữ pháp lý phải nói ĐÚNG hành vi thật", () => {
  it("nói rõ KHÔNG lưu mật khẩu thuế", () => {
    render(<ThongTinSanPham />);
    expect(screen.getByText(/không lưu mật khẩu tài khoản thuế/i)).toBeInTheDocument();
  });

  it("🔴 nói token ĐƯỢC MÃ HOÁ KHI LƯU — không tuyên bố 'không lưu thông tin kết nối'", () => {
    // Bản gốc chủ dự án viết "không lưu thông tin kết nối đã cung cấp". Thực tế U14: hệ
    // thống CÓ lưu token GDT (đã mã hoá) để chạy đồng bộ nền. Nếu ai đó "sửa lại cho gọn"
    // về câu gốc, đây là chỗ duy nhất phát hiện — và nó là tuyên bố sai với khách hàng,
    // không phải chuyện chữ nghĩa.
    const { container } = render(<ThongTinSanPham />);
    const chu = container.textContent ?? "";
    expect(chu).toMatch(/mã hoá khi lưu trữ|mã hóa khi lưu trữ/i);
    expect(chu).not.toMatch(/không lưu thông tin kết nối/i);
  });

  it("có cam kết ủy quyền hợp pháp — ranh giới pháp lý của cả sản phẩm", () => {
    render(<ThongTinSanPham />);
    expect(screen.getByText(/được ủy quyền hợp pháp/i)).toBeInTheDocument();
  });

  it("nêu cách ly dữ liệu theo mã số thuế", () => {
    const { container } = render(<ThongTinSanPham />);
    expect(container.textContent ?? "").toMatch(/cách ly hoàn toàn theo mã số thuế/i);
  });
});

describe("QĐ-9 — văn bản để ĐỌC không dùng cỡ chữ nhỏ", () => {
  it("mọi đoạn văn dùng --fs-base, không đoạn nào --fs-sm", () => {
    // Gốc của phàn nàn "chữ nhỏ khó đọc" là `--fs-sm` (13px) bị dùng cho văn bản đọc chứ
    // không phải `--fs-base` sai. Trang pháp lý là nơi người dùng đọc kỹ nhất — nếu chỗ
    // này lọt 13px thì cả nỗ lực sửa cỡ chữ trở nên vô nghĩa.
    const { container } = render(<ThongTinSanPham />);
    const doan = container.querySelectorAll("p, li");
    expect(doan.length).toBeGreaterThan(5);
    for (const el of doan) {
      const fs = (el as HTMLElement).style.fontSize;
      // Thẻ <li> thừa hưởng cỡ từ <ul> nên có thể rỗng — chỉ cấm khai tường minh fs-sm.
      expect(fs).not.toContain("--fs-sm");
    }
  });
});

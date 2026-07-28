// U36 Gói 4 — thông báo "hóa đơn bị thay thế đã bị loại khỏi tổng" trên trang Danh sách.
//
// Vì sao BẮT BUỘC có thông báo (§7.2): tổng của các kỳ ĐÃ QUA sẽ khác con số người dùng
// từng thấy và từng xuất file. Đổi số mà không giải thích thì kế toán sẽ tưởng phần mềm hỏng
// — hoặc tệ hơn, tưởng nghĩa vụ thuế của họ thay đổi.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ThongBaoTrangThai, deltaThuePhaiNop } from "../../src/features/invoices/ThongBaoTrangThai";
import type { ChieuSummary } from "../../src/types/api";

function chieu(over: Partial<ChieuSummary> & { chieu: string }): ChieuSummary {
  return {
    count: 0,
    countTinhTong: 0,
    soLoaiKhoiTong: 0,
    tongTcthue: null,
    tongTthue: null,
    tongTtbso: null,
    soDuocDieuChinh: 0,
    soHdThayThe: 0,
    soHdDieuChinh: 0,
    soMaLa: 0,
    thueDaLoai: "0",
    ttbsoDaLoai: "0",
    thueThayTheDieuChinh: "0",
    ttbsoThayTheDieuChinh: "0",
    ...over,
  };
}

const KY = "01/07 – 31/07/2026";

describe("deltaThuePhaiNop — QĐ-12, HAI CHIỀU NGƯỢC DẤU", () => {
  it("loại mã 4 ở BÁN RA → thuế đầu ra giảm → thuế phải nộp GIẢM (âm)", () => {
    const ds = [chieu({ chieu: "sold", soLoaiKhoiTong: 3, thueDaLoai: "1711111" })];
    expect(deltaThuePhaiNop(ds)).toBe("-1711111");
  });

  it("loại mã 4 ở MUA VÀO → thuế được khấu trừ giảm → thuế phải nộp TĂNG (dương)", () => {
    // Chiều mua vào hiện chưa quan sát được mã 4, nhưng biên bản §6.5 ĐÃ RÚT kết luận
    // "GDT không trả bản gốc cho bên mua" (cỡ mẫu = 1) ⇒ phải xử lý hai chiều như nhau.
    const ds = [chieu({ chieu: "purchase", soLoaiKhoiTong: 2, thueDaLoai: "500000" })];
    expect(deltaThuePhaiNop(ds)).toBe("500000");
  });

  it("cả hai chiều → trừ nhau đúng dấu (mua vào − bán ra)", () => {
    const ds = [
      chieu({ chieu: "sold", soLoaiKhoiTong: 1, thueDaLoai: "1711111" }),
      chieu({ chieu: "purchase", soLoaiKhoiTong: 1, thueDaLoai: "711111" }),
    ];
    expect(deltaThuePhaiNop(ds)).toBe("-1000000");
  });

  it("số > 2^53 vẫn chính xác — BigInt, KHÔNG Number()/parseFloat", () => {
    const ds = [
      chieu({ chieu: "sold", soLoaiKhoiTong: 1, thueDaLoai: "9007199254740993" }),
      chieu({ chieu: "purchase", soLoaiKhoiTong: 1, thueDaLoai: "1" }),
    ];
    expect(deltaThuePhaiNop(ds)).toBe("-9007199254740992");
  });

  it("#17c cả hai chiều KHÔNG có mã 4 → null (ẩn dòng)", () => {
    expect(deltaThuePhaiNop([chieu({ chieu: "sold", soHdThayThe: 5 })])).toBeNull();
    expect(deltaThuePhaiNop([])).toBeNull();
  });

  it("#8 chịu được shape CŨ (thiếu trường) — không ném", () => {
    const cu = { chieu: "sold", count: 3, tongTcthue: null, tongTthue: null, tongTtbso: null };
    expect(() => deltaThuePhaiNop([cu as ChieuSummary])).not.toThrow();
    expect(deltaThuePhaiNop([cu as ChieuSummary])).toBeNull();
  });
});

describe("ThongBaoTrangThai — nội dung theo từng chiều", () => {
  it("#15 nêu đúng số hóa đơn + tiền đã loại, tách theo chiều", () => {
    render(
      <ThongBaoTrangThai
        badgeKy={KY}
        byChieu={[
          chieu({
            chieu: "sold",
            soLoaiKhoiTong: 3,
            thueDaLoai: "1711111",
            ttbsoDaLoai: "23100000",
            soHdThayThe: 3,
            soHdDieuChinh: 1,
            thueThayTheDieuChinh: "900000",
          }),
        ]}
      />,
    );
    const noiDung = screen.getByRole("status").textContent ?? "";
    expect(noiDung).toContain("Bán ra");
    expect(noiDung).toContain("3 hóa đơn bị thay thế");
    expect(noiDung).toContain("-1.711.111 ₫");
    expect(noiDung).toContain("-23.100.000 ₫");
    expect(noiDung).toContain("3 hóa đơn thay thế");
    expect(noiDung).toContain("1 hóa đơn điều chỉnh");
  });

  it("chiều KHÔNG có thay đổi thì KHÔNG có khối riêng cho nó", () => {
    render(
      <ThongBaoTrangThai
        badgeKy={KY}
        byChieu={[
          chieu({ chieu: "sold", soLoaiKhoiTong: 1, thueDaLoai: "100" }),
          chieu({ chieu: "purchase", count: 50 }),
        ]}
      />,
    );
    const noiDung = screen.getByRole("status").textContent ?? "";
    expect(noiDung).toContain("Bán ra");
    expect(noiDung).not.toContain("Mua vào");
  });

  it("#15 LUÔN kèm dòng giải thích mốc đổi cách tính (§7.2 — bắt buộc)", () => {
    render(
      <ThongBaoTrangThai
        badgeKy={KY}
        byChieu={[chieu({ chieu: "sold", soLoaiKhoiTong: 1, thueDaLoai: "100" })]}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain(
      "Từ 28/07/2026, hóa đơn bị thay thế không còn được cộng vào tổng.",
    );
  });

  it("QĐ-12 — dòng thuế phải nộp xuất hiện ĐÚNG MỘT LẦN dù có hai chiều", () => {
    render(
      <ThongBaoTrangThai
        badgeKy={KY}
        byChieu={[
          chieu({ chieu: "sold", soLoaiKhoiTong: 1, thueDaLoai: "1711111" }),
          chieu({ chieu: "purchase", soLoaiKhoiTong: 1, thueDaLoai: "0" }),
        ]}
      />,
    );
    const noiDung = screen.getByRole("status").textContent ?? "";
    expect(noiDung.match(/Thuế phải nộp trên báo cáo/g)).toHaveLength(1);
    expect(noiDung).toContain("giảm 1.711.111 ₫");
    // Cách đọc phải ghi rõ, nếu không kế toán tưởng nghĩa vụ thuế đổi.
    expect(noiDung).toContain("số thuế phải nộp thật không đổi");
  });

  it("mua vào có mã 4 → dòng thuế phải nộp nói TĂNG", () => {
    render(
      <ThongBaoTrangThai
        badgeKy={KY}
        byChieu={[chieu({ chieu: "purchase", soLoaiKhoiTong: 1, thueDaLoai: "500000" })]}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain("tăng 500.000 ₫");
  });

  it("#17c không chiều nào có mã 4 → KHÔNG có dòng thuế phải nộp", () => {
    render(
      <ThongBaoTrangThai
        badgeKy={KY}
        byChieu={[chieu({ chieu: "sold", soHdThayThe: 2, thueThayTheDieuChinh: "5000" })]}
      />,
    );
    expect(screen.getByRole("status").textContent).not.toContain("Thuế phải nộp trên báo cáo");
  });

  it("#16 QĐ-6 — soMaLa > 0 → cảnh báo mã chưa xác định", () => {
    render(
      <ThongBaoTrangThai badgeKy={KY} byChieu={[chieu({ chieu: "sold", soMaLa: 2, count: 2 })]} />,
    );
    const noiDung = document.body.textContent ?? "";
    expect(noiDung).toContain("2 hóa đơn mang mã trạng thái chưa xác định");
  });

  it("#7 tenant chưa có dữ liệu (byChieu rỗng) → không hiện gì, KHÔNG crash", () => {
    const { container } = render(<ThongBaoTrangThai badgeKy={KY} byChieu={[]} />);
    expect(container.textContent).toBe("");
  });

  it("#8 shape CŨ trong cache (thiếu mọi trường mới) → không hiện gì, KHÔNG ném", () => {
    const cu = { chieu: "sold", count: 12, tongTcthue: "1", tongTthue: "1", tongTtbso: "1" };
    const { container } = render(<ThongBaoTrangThai badgeKy={KY} byChieu={[cu as ChieuSummary]} />);
    expect(container.textContent).toBe("");
  });

  it("không có kỳ (badgeKy null) → vẫn hiện thông báo, không ném", () => {
    render(
      <ThongBaoTrangThai
        badgeKy={null}
        byChieu={[chieu({ chieu: "sold", soLoaiKhoiTong: 1, thueDaLoai: "100" })]}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain("1 hóa đơn bị thay thế");
  });
});

// U41 — đọc bộ lọc từ tham số URL.
//
// VÌ SAO CẦN: `InvoicesPage` khởi tạo bộ lọc từ localStorage rồi LUÔN ghi đè kỳ = tháng hiện
// tại. Nó không đọc tham số URL. Vì vậy mọi nút "Xem danh sách" ở khối "Cần xử lý" sẽ đổ về
// danh sách KHÔNG lọc — cảnh báo biến thành ngõ cụt, đúng lỗi U37c từng phải đi sửa.
//
// PHẠM VI HẸP CÓ CHỦ ĐÍCH: chỉ bốn khoá mà Tổng quan thật sự phát sinh liên kết. Mở rộng
// bừa ra toàn bộ `InvoiceFilter` là dựng một mặt tiếp nhận đầu vào không tin cậy mà chưa ai
// cần tới.
import { describe, expect, it } from "vitest";
import { filterTuUrl } from "../../src/lib/filterTuUrl";
import type { InvoiceFilter } from "../../src/types/api";

const MAC_DINH: InvoiceFilter = {
  chieu: "purchase",
  tuNgay: "2026-07-01",
  denNgay: "2026-07-31",
  nbmst: "4201234567",
};

const doc = (qs: string, macDinh: InvoiceFilter = MAC_DINH) =>
  filterTuUrl(new URLSearchParams(qs), macDinh);

describe("filterTuUrl", () => {
  // CA HỒI QUY QUAN TRỌNG NHẤT: không tham số ⇒ hành vi cũ giữ NGUYÊN Y HỆT. Mọi lần mở
  // /invoices bình thường (từ menu, từ lối tắt) đều đi qua nhánh này.
  it("không tham số ⇒ trả đúng bộ lọc mặc định, không thêm không bớt", () => {
    expect(doc("")).toEqual(MAC_DINH);
  });

  it("biSua=true ⇒ bật cờ, giữ nguyên phần còn lại", () => {
    expect(doc("biSua=true")).toEqual({ ...MAC_DINH, biSua: true });
  });

  it("khoảng ngày trong URL GHI ĐÈ kỳ mặc định", () => {
    expect(doc("tuNgay=2026-06-01&denNgay=2026-06-30")).toEqual({
      ...MAC_DINH,
      tuNgay: "2026-06-01",
      denNgay: "2026-06-30",
    });
  });

  it("chieu hợp lệ được nhận", () => {
    expect(doc("chieu=sold").chieu).toBe("sold");
  });

  // Đầu vào từ URL là KHÔNG TIN CẬY — người dùng gõ tay, dán nhầm, hoặc bị chỉnh cố ý. Giá
  // trị lạ phải bị bỏ qua tại đây thay vì đẩy lên API rồi ăn 400 kèm màn lỗi khó hiểu.
  it("chieu lạ ⇒ bỏ qua, giữ mặc định", () => {
    expect(doc("chieu=xyz").chieu).toBe("purchase");
  });

  it("ngày sai định dạng ⇒ bỏ qua, giữ kỳ mặc định", () => {
    expect(doc("tuNgay=01/06/2026")).toEqual(MAC_DINH);
    expect(doc("tuNgay=2026-6-1")).toEqual(MAC_DINH);
    expect(doc("denNgay=hôm-qua")).toEqual(MAC_DINH);
  });

  it("biSua giá trị khác 'true' ⇒ KHÔNG bật cờ", () => {
    expect(doc("biSua=1").biSua).toBeUndefined();
    expect(doc("biSua=false").biSua).toBeUndefined();
  });

  it("tham số lạ ⇒ lờ đi hoàn toàn, không lọt vào bộ lọc", () => {
    const kq = doc("nbmst=9999999999&limit=5000&nguon=sco") as Record<string, unknown>;
    expect(kq.nbmst).toBe(MAC_DINH.nbmst); // KHÔNG bị URL ghi đè
    expect(kq.limit).toBeUndefined();
    expect(kq.nguon).toBeUndefined();
  });

  it("chỉ một trong hai đầu khoảng ngày ⇒ vẫn áp đầu có mặt", () => {
    expect(doc("tuNgay=2026-05-01")).toEqual({ ...MAC_DINH, tuNgay: "2026-05-01" });
  });

  it("không làm biến đổi bộ lọc mặc định truyền vào", () => {
    const goc = { ...MAC_DINH };
    doc("biSua=true&chieu=sold", goc);
    expect(goc).toEqual(MAC_DINH);
  });
});

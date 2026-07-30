// Chủ dự án 2026-07-23: trả lại BỘ CHỌN NGÀY trong Danh sách hóa đơn (trước chỉ còn
// Tháng/Quý/Năm sau U-K3). Thêm 2 ô "Từ ngày"/"Đến ngày" (day-level) BÊN CẠNH nút kỳ nhanh;
// sửa xong → bấm "Lọc dữ liệu" áp vào tuNgay/denNgay (theo hợp đồng "sửa nháp → bấm Lọc").
//
// 2026-07-30: đổi từ input type="date" gốc sang primitive DateField — ngày hiển thị và gõ
// ĐỒNG NHẤT dd/mm/yyyy trên mọi thiết bị (input gốc hiển thị theo locale hệ điều hành nên
// mỗi máy một kiểu 01/07 vs 07/01; giá trị áp vào bộ lọc vẫn là ISO YYYY-MM-DD cho API).
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FilterBar } from "../../src/features/invoices/FilterBar";
import type { InvoiceFilter } from "../../src/types/api";

describe("FilterBar — bộ chọn ngày (2026-07-23, dd/mm/yyyy 2026-07-30)", () => {
  it("có ô Từ ngày / Đến ngày dạng chữ dd/mm/yyyy (không phụ thuộc locale thiết bị)", () => {
    render(<FilterBar value={{}} onApply={() => {}} />);
    const tu = screen.getByLabelText("Từ ngày") as HTMLInputElement;
    const den = screen.getByLabelText("Đến ngày") as HTMLInputElement;
    expect(tu.type).toBe("text");
    expect(den.type).toBe("text");
    expect(tu.placeholder).toBe("dd/mm/yyyy");
    expect(den.placeholder).toBe("dd/mm/yyyy");
  });

  it("gõ ngày dd/mm/yyyy rồi bấm 'Lọc dữ liệu' → áp tuNgay/denNgay dạng ISO", async () => {
    const onApply = vi.fn();
    render(<FilterBar value={{}} onApply={onApply} />);
    fireEvent.change(screen.getByLabelText("Từ ngày"), { target: { value: "05/07/2026" } });
    fireEvent.change(screen.getByLabelText("Đến ngày"), { target: { value: "20/07/2026" } });
    await userEvent.click(screen.getByRole("button", { name: "Lọc dữ liệu" }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining<Partial<InvoiceFilter>>({
        tuNgay: "2026-07-05",
        denNgay: "2026-07-20",
      }),
    );
  });

  it("hiển thị ngày từ value đang có dưới dạng dd/mm/yyyy", () => {
    render(
      <FilterBar value={{ tuNgay: "2026-01-01", denNgay: "2026-01-31" }} onApply={() => {}} />,
    );
    expect((screen.getByLabelText("Từ ngày") as HTMLInputElement).value).toBe("01/01/2026");
    expect((screen.getByLabelText("Đến ngày") as HTMLInputElement).value).toBe("31/01/2026");
  });
});

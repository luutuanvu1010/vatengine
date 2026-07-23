// Chủ dự án 2026-07-23: trả lại BỘ CHỌN NGÀY trong Danh sách hóa đơn (trước chỉ còn
// Tháng/Quý/Năm sau U-K3). Thêm 2 ô "Từ ngày"/"Đến ngày" (day-level) BÊN CẠNH nút kỳ nhanh;
// sửa xong → bấm "Lọc dữ liệu" áp vào tuNgay/denNgay (theo hợp đồng "sửa nháp → bấm Lọc").
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FilterBar } from "../../src/features/invoices/FilterBar";
import type { InvoiceFilter } from "../../src/types/api";

describe("FilterBar — bộ chọn ngày (2026-07-23)", () => {
  it("có ô Từ ngày / Đến ngày dạng date", () => {
    render(<FilterBar value={{}} onApply={() => {}} />);
    const tu = screen.getByLabelText("Từ ngày") as HTMLInputElement;
    const den = screen.getByLabelText("Đến ngày") as HTMLInputElement;
    expect(tu.type).toBe("date");
    expect(den.type).toBe("date");
  });

  it("sửa ngày rồi bấm 'Lọc dữ liệu' → áp tuNgay/denNgay", async () => {
    const onApply = vi.fn();
    render(<FilterBar value={{}} onApply={onApply} />);
    fireEvent.change(screen.getByLabelText("Từ ngày"), { target: { value: "2026-07-05" } });
    fireEvent.change(screen.getByLabelText("Đến ngày"), { target: { value: "2026-07-20" } });
    await userEvent.click(screen.getByRole("button", { name: "Lọc dữ liệu" }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining<Partial<InvoiceFilter>>({
        tuNgay: "2026-07-05",
        denNgay: "2026-07-20",
      }),
    );
  });

  it("hiển thị ngày từ value đang có", () => {
    render(
      <FilterBar value={{ tuNgay: "2026-01-01", denNgay: "2026-01-31" }} onApply={() => {}} />,
    );
    expect((screen.getByLabelText("Từ ngày") as HTMLInputElement).value).toBe("2026-01-01");
    expect((screen.getByLabelText("Đến ngày") as HTMLInputElement).value).toBe("2026-01-31");
  });
});

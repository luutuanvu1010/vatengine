// Primitive DateField (2026-07-30) — ô nhập ngày hiển thị ĐỒNG NHẤT dd/mm/yyyy trên mọi
// thiết bị, thay input type="date" gốc (hiển thị theo locale hệ điều hành nên mỗi máy một
// kiểu; trình duyệt không hỗ trợ còn rơi về ô chữ tự do đẩy dd/mm/yyyy thẳng lên API → 400).
// Hợp đồng: value/onChangeIso giao tiếp bằng ISO YYYY-MM-DD; hiển thị + gõ là dd/mm/yyyy.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DateField } from "../../src/components/ui/primitives";

describe("DateField — nhập/hiển thị dd/mm/yyyy, giao tiếp ISO", () => {
  it("hiển thị value ISO dưới dạng dd/mm/yyyy", () => {
    render(<DateField label="Từ ngày" value="2026-07-01" onChangeIso={() => {}} />);
    expect((screen.getByLabelText("Từ ngày") as HTMLInputElement).value).toBe("01/07/2026");
  });

  it("gõ đủ dd/mm/yyyy hợp lệ → phát ISO", () => {
    const onChangeIso = vi.fn();
    render(<DateField label="Từ ngày" onChangeIso={onChangeIso} />);
    fireEvent.change(screen.getByLabelText("Từ ngày"), { target: { value: "05/07/2026" } });
    expect(onChangeIso).toHaveBeenLastCalledWith("2026-07-05");
  });

  it("xóa rỗng → phát undefined (bỏ lọc ngày)", () => {
    const onChangeIso = vi.fn();
    render(<DateField label="Từ ngày" value="2026-07-01" onChangeIso={onChangeIso} />);
    fireEvent.change(screen.getByLabelText("Từ ngày"), { target: { value: "" } });
    expect(onChangeIso).toHaveBeenLastCalledWith(undefined);
  });

  it("đang gõ dở → KHÔNG phát (giữ giá trị áp gần nhất)", () => {
    const onChangeIso = vi.fn();
    render(<DateField label="Từ ngày" onChangeIso={onChangeIso} />);
    fireEvent.change(screen.getByLabelText("Từ ngày"), { target: { value: "05/0" } });
    expect(onChangeIso).not.toHaveBeenCalled();
  });

  it("rời ô khi chuỗi dở/không hợp lệ → trả về hiển thị của value đang áp", () => {
    render(<DateField label="Từ ngày" value="2026-07-01" onChangeIso={() => {}} />);
    const o = screen.getByLabelText("Từ ngày") as HTMLInputElement;
    fireEvent.change(o, { target: { value: "31/02/20" } });
    fireEvent.blur(o);
    expect(o.value).toBe("01/07/2026");
  });

  it("value đổi từ ngoài (vd chọn kỳ nhanh) → hiển thị cập nhật theo", () => {
    const { rerender } = render(
      <DateField label="Từ ngày" value="2026-07-01" onChangeIso={() => {}} />,
    );
    rerender(<DateField label="Từ ngày" value="2026-06-01" onChangeIso={() => {}} />);
    expect((screen.getByLabelText("Từ ngày") as HTMLInputElement).value).toBe("01/06/2026");
  });
});

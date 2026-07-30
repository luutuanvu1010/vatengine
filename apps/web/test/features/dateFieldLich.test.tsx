// DateField — LỊCH CHỌN NGÀY tiếng Việt (2026-07-30, yêu cầu chủ dự án): ngoài gõ tay
// dd/mm/yyyy, bấm vào ô mở lịch tháng (tuần Thứ Hai → Chủ Nhật, nhãn tiếng Việt) để chọn.
// Chọn ngày → phát ISO + đóng lịch; điều hướng tháng trước/sau; Escape đóng.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DateField } from "../../src/components/ui/primitives";

function moLich() {
  fireEvent.focus(screen.getByLabelText("Từ ngày"));
}

describe("DateField — lịch chọn ngày tiếng Việt", () => {
  it("focus vào ô → mở lịch đúng tháng của value, nhãn tiếng Việt", () => {
    render(<DateField label="Từ ngày" value="2026-07-01" onChangeIso={() => {}} />);
    moLich();
    const lich = screen.getByRole("dialog", { name: "Chọn ngày trên lịch" });
    expect(lich).toBeTruthy();
    expect(screen.getByText("Tháng 7/2026")).toBeTruthy();
    // Hàng thứ trong tuần tiếng Việt, bắt đầu Thứ Hai
    for (const thu of ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]) {
      expect(screen.getByText(thu)).toBeTruthy();
    }
  });

  it("bấm một ngày → phát ISO, ô hiển thị dd/mm/yyyy, lịch đóng", () => {
    const onChangeIso = vi.fn();
    render(<DateField label="Từ ngày" value="2026-07-01" onChangeIso={onChangeIso} />);
    moLich();
    fireEvent.mouseDown(screen.getByRole("button", { name: "Chọn ngày 15/07/2026" }));
    expect(onChangeIso).toHaveBeenLastCalledWith("2026-07-15");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("nút tháng trước / tháng sau đổi tháng hiển thị (qua cả ranh giới năm)", () => {
    render(<DateField label="Từ ngày" value="2026-01-15" onChangeIso={() => {}} />);
    moLich();
    fireEvent.mouseDown(screen.getByRole("button", { name: "Tháng trước" }));
    expect(screen.getByText("Tháng 12/2025")).toBeTruthy();
    fireEvent.mouseDown(screen.getByRole("button", { name: "Tháng sau" }));
    fireEvent.mouseDown(screen.getByRole("button", { name: "Tháng sau" }));
    expect(screen.getByText("Tháng 2/2026")).toBeTruthy();
  });

  it("Escape đóng lịch", () => {
    render(<DateField label="Từ ngày" value="2026-07-01" onChangeIso={() => {}} />);
    moLich();
    fireEvent.keyDown(screen.getByLabelText("Từ ngày"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("blur ra ngoài đóng lịch (và vẫn phục hồi chuỗi gõ dở như cũ)", () => {
    render(<DateField label="Từ ngày" value="2026-07-01" onChangeIso={() => {}} />);
    const o = screen.getByLabelText("Từ ngày") as HTMLInputElement;
    moLich();
    fireEvent.change(o, { target: { value: "31/02/20" } });
    fireEvent.blur(o);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(o.value).toBe("01/07/2026");
  });

  it("không có value → lịch mở ở tháng hiện tại (không vỡ), gõ tay vẫn hoạt động", () => {
    const onChangeIso = vi.fn();
    render(<DateField label="Từ ngày" onChangeIso={onChangeIso} />);
    moLich();
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Từ ngày"), { target: { value: "05/07/2026" } });
    expect(onChangeIso).toHaveBeenLastCalledWith("2026-07-05");
  });
});

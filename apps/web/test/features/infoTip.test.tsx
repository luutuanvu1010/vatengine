// Task 11 — primitive InfoTip (icon ⓘ + tooltip). Ghi chú giải thích KHÔNG chiếm mặt tiền:
// icon nhỏ, hover/focus mới hiện tooltip. a11y: trigger focus được, aria-describedby ↔
// role="tooltip".
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InfoTip } from "../../src/components/ui/primitives";

describe("InfoTip — icon ⓘ + tooltip", () => {
  it("ẩn mặc định, hiện khi focus, aria nối đúng", () => {
    render(<InfoTip text="Kiểm tra và kéo phần còn thiếu" label="Giải thích đồng bộ" />);
    const trigger = screen.getByLabelText("Giải thích đồng bộ");
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.focus(trigger);
    const tip = screen.getByRole("tooltip");
    expect(tip.textContent).toContain("Kiểm tra và kéo phần còn thiếu");
    expect(trigger.getAttribute("aria-describedby")).toBe(tip.id);
    fireEvent.blur(trigger);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("focus được bằng bàn phím (tabIndex 0)", () => {
    render(<InfoTip text="Chi tiết" label="Giải thích" />);
    const trigger = screen.getByLabelText("Giải thích");
    expect(trigger.getAttribute("tabindex")).toBe("0");
  });

  it("hiện khi hover (mouse enter), ẩn khi mouse leave", () => {
    render(<InfoTip text="Chi tiết hover" label="Giải thích" />);
    const trigger = screen.getByLabelText("Giải thích");
    const wrapper = trigger.parentElement as HTMLElement;
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.mouseEnter(wrapper);
    expect(screen.getByRole("tooltip").textContent).toContain("Chi tiết hover");
    fireEvent.mouseLeave(wrapper);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});

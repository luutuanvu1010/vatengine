// U35 — primitive Popover (nút bật/tắt + panel nổi), trích khuôn từ ColumnMenu. Đóng khi
// bấm ra ngoài hoặc Esc; trigger tự vẽ trạng thái qua {open, toggle}.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Popover } from "../../src/components/ui/primitives";

function Demo() {
  return (
    <Popover
      ariaLabel="Bảng thử"
      trigger={({ open, toggle }) => (
        <button type="button" onClick={toggle}>
          {open ? "Đóng" : "Mở"}
        </button>
      )}
    >
      <div>Nội dung panel</div>
    </Popover>
  );
}

describe("Popover — nút bật/tắt + panel nổi", () => {
  it("ẩn mặc định; bấm trigger → hiện panel + đổi nhãn nút", () => {
    render(<Demo />);
    expect(screen.queryByText("Nội dung panel")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mở" }));
    expect(screen.getByText("Nội dung panel")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đóng" })).toBeInTheDocument();
  });

  it("panel mang đúng aria-label (role=group)", () => {
    render(<Demo />);
    fireEvent.click(screen.getByRole("button", { name: "Mở" }));
    expect(screen.getByRole("group", { name: "Bảng thử" })).toBeInTheDocument();
  });

  it("bấm ra ngoài → đóng panel", () => {
    render(<Demo />);
    fireEvent.click(screen.getByRole("button", { name: "Mở" }));
    expect(screen.getByText("Nội dung panel")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText("Nội dung panel")).toBeNull();
  });

  it("nhấn Esc → đóng panel", () => {
    render(<Demo />);
    fireEvent.click(screen.getByRole("button", { name: "Mở" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Nội dung panel")).toBeNull();
  });

  it("bấm BÊN TRONG panel → không đóng", () => {
    render(<Demo />);
    fireEvent.click(screen.getByRole("button", { name: "Mở" }));
    fireEvent.mouseDown(screen.getByText("Nội dung panel"));
    expect(screen.getByText("Nội dung panel")).toBeInTheDocument();
  });
});

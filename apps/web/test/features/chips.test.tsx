// U36.1 — QĐ-11: chip trạng thái hóa đơn.
//
// Trước U36 mọi mã `verified` đều tô `--success-*`. Sau khi điền nhãn 1–5, "Bị thay thế"
// (mã 4) sẽ hiện màu "tốt" — sai nghiệp vụ và lệch `07-DESIGN_TOKENS` (`--success-*` mang
// nghĩa số dương / trạng thái tốt). QĐ-11: CHỈ mã 1 (Gốc) giữ success; 2,3,4,5 và mọi mã
// chưa xác định dùng token trung tính.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TthaiChip, TtxlyChip } from "../../src/features/invoices/chips";

function bgCua(text: string): string {
  const el = screen.getByText(text);
  return el.style.background;
}

describe("TthaiChip — màu theo QĐ-11", () => {
  it("mã 1 (Gốc) → nền success", () => {
    render(<TthaiChip code={1} />);
    expect(bgCua("Gốc")).toBe("var(--success-50)");
  });

  it("mã 4 (Bị thay thế) KHÔNG tô xanh — dùng token trung tính", () => {
    render(<TthaiChip code={4} />);
    expect(bgCua("Bị thay thế")).toBe("var(--neutral-chip-bg)");
  });

  it("mã 5 (Bị điều chỉnh) KHÔNG tô xanh — dùng token trung tính", () => {
    render(<TthaiChip code={5} />);
    expect(bgCua("Bị điều chỉnh")).toBe("var(--neutral-chip-bg)");
  });

  it("mã 2 và 3 (Thay thế / Điều chỉnh) cũng trung tính", () => {
    render(<TthaiChip code={2} />);
    render(<TthaiChip code={3} />);
    expect(bgCua("Thay thế")).toBe("var(--neutral-chip-bg)");
    expect(bgCua("Điều chỉnh")).toBe("var(--neutral-chip-bg)");
  });

  it("mã ngoài 1–5 → '(chưa rõ)', trung tính, có chú giải cảnh báo", () => {
    render(<TthaiChip code={9} />);
    const el = screen.getByText("9 (chưa rõ)");
    expect(el.style.background).toBe("var(--neutral-chip-bg)");
    expect(el.getAttribute("title")).toBe("Mã trạng thái chưa được kiểm chứng");
  });

  it("mã đã kiểm chứng KHÔNG mang chú giải 'chưa được kiểm chứng'", () => {
    render(<TthaiChip code={4} />);
    expect(screen.getByText("Bị thay thế").getAttribute("title")).toBeNull();
  });

  it("null → '—', trung tính", () => {
    render(<TthaiChip code={null} />);
    expect(bgCua("—")).toBe("var(--neutral-chip-bg)");
  });
});

describe("TtxlyChip — ý nghĩa ttxly VẪN chưa kiểm chứng (biên bản §4)", () => {
  it("mọi mã → '(chưa rõ)' + trung tính", () => {
    render(<TtxlyChip code={8} />);
    const el = screen.getByText("8 (chưa rõ)");
    expect(el.style.background).toBe("var(--neutral-chip-bg)");
    expect(el.getAttribute("title")).toBe("Mã trạng thái chưa được kiểm chứng");
  });
});

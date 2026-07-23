// B1 (U27) — Ẩn ô MST không liên quan theo CHIỀU lọc, và dọn giá trị ô đã ẩn để không lọc
// ngầm bằng trường đã ẩn. 2026-07-23: Chiều là SEGMENTED [Mua vào | Bán ra] (bỏ "Tất cả"),
// MẶC ĐỊNH Mua vào. Mua vào ẩn nmmst (người mua); Bán ra ẩn nbmst (người bán).
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FilterBar } from "../../src/features/invoices/FilterBar";
import type { InvoiceFilter } from "../../src/types/api";

function setup(value: InvoiceFilter = {}) {
  const onApply = vi.fn();
  render(<FilterBar value={value} onApply={onApply} />);
  return { onApply };
}

describe("B1 — ẩn ô MST theo chiều lọc (segmented, mặc định Mua vào)", () => {
  it("MẶC ĐỊNH Mua vào → chỉ hiện MST người bán (ẩn MST người mua)", () => {
    setup({});
    expect(screen.getByLabelText("MST người bán")).toBeInTheDocument();
    expect(screen.queryByLabelText("MST người mua")).toBeNull();
  });

  it("bấm 'Bán ra' → KHÔNG render MST người bán, giữ MST người mua", async () => {
    setup({});
    await userEvent.click(screen.getByRole("button", { name: "Bán ra" }));
    expect(screen.queryByLabelText("MST người bán")).toBeNull();
    expect(screen.getByLabelText("MST người mua")).toBeInTheDocument();
  });

  it("Bán ra rồi bấm 'Mua vào' → quay lại chỉ MST người bán", async () => {
    setup({ chieu: "sold" });
    expect(screen.getByLabelText("MST người mua")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Mua vào" }));
    expect(screen.queryByLabelText("MST người mua")).toBeNull();
    expect(screen.getByLabelText("MST người bán")).toBeInTheDocument();
  });

  it("đang Bán ra có MST người mua → bấm 'Mua vào' → nmmst bị xóa khi Lọc dữ liệu", async () => {
    const { onApply } = setup({ chieu: "sold", nmmst: "4201568932" });
    await userEvent.click(screen.getByRole("button", { name: "Mua vào" }));
    await userEvent.click(screen.getByRole("button", { name: "Lọc dữ liệu" }));
    expect(onApply).toHaveBeenCalledTimes(1);
    const arg = onApply.mock.calls[0]?.[0] as InvoiceFilter;
    expect(arg.nmmst).toBeUndefined();
    expect(arg.chieu).toBe("purchase");
  });

  it("đang Mua vào có MST người bán → bấm 'Bán ra' → nbmst bị xóa khi Lọc dữ liệu", async () => {
    const { onApply } = setup({ chieu: "purchase", nbmst: "0311772540" });
    await userEvent.click(screen.getByRole("button", { name: "Bán ra" }));
    await userEvent.click(screen.getByRole("button", { name: "Lọc dữ liệu" }));
    const arg = onApply.mock.calls[0]?.[0] as InvoiceFilter;
    expect(arg.nbmst).toBeUndefined();
    expect(arg.chieu).toBe("sold");
  });
});

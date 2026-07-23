// B1 (U27) — Ẩn ô MST không liên quan theo CHIỀU lọc, và dọn giá trị ô đã ẩn để không
// lọc ngầm bằng trường đã ẩn. purchase (mua vào) ẩn nmmst (người mua); sold (bán ra) ẩn
// nbmst (người bán); chiều rỗng hiện cả hai. FilterBar là component thuần — render trực tiếp.
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

describe("B1 — ẩn ô MST theo chiều lọc", () => {
  it("Chiều 'Tất cả' (rỗng) → hiện cả hai ô MST", () => {
    setup({});
    expect(screen.getByLabelText("MST người bán")).toBeInTheDocument();
    expect(screen.getByLabelText("MST người mua")).toBeInTheDocument();
  });

  it("Mua vào → KHÔNG render ô MST người mua, giữ ô MST người bán", async () => {
    setup({});
    await userEvent.selectOptions(screen.getByLabelText("Chiều"), "purchase");
    expect(screen.queryByLabelText("MST người mua")).toBeNull();
    expect(screen.getByLabelText("MST người bán")).toBeInTheDocument();
  });

  it("Bán ra → KHÔNG render ô MST người bán, giữ ô MST người mua", async () => {
    setup({});
    await userEvent.selectOptions(screen.getByLabelText("Chiều"), "sold");
    expect(screen.queryByLabelText("MST người bán")).toBeNull();
    expect(screen.getByLabelText("MST người mua")).toBeInTheDocument();
  });

  it("đã nhập MST người mua rồi đổi sang Mua vào → nmmst bị xóa khỏi filter khi Lọc dữ liệu", async () => {
    const { onApply } = setup({ nmmst: "4201568932" });
    await userEvent.selectOptions(screen.getByLabelText("Chiều"), "purchase");
    await userEvent.click(screen.getByRole("button", { name: "Lọc dữ liệu" }));
    expect(onApply).toHaveBeenCalledTimes(1);
    const arg = onApply.mock.calls[0]?.[0] as InvoiceFilter;
    expect(arg.nmmst).toBeUndefined();
    expect(arg.chieu).toBe("purchase");
  });

  it("đã nhập MST người bán rồi đổi sang Bán ra → nbmst bị xóa khỏi filter khi Lọc dữ liệu", async () => {
    const { onApply } = setup({ nbmst: "0311772540" });
    await userEvent.selectOptions(screen.getByLabelText("Chiều"), "sold");
    await userEvent.click(screen.getByRole("button", { name: "Lọc dữ liệu" }));
    const arg = onApply.mock.calls[0]?.[0] as InvoiceFilter;
    expect(arg.nbmst).toBeUndefined();
    expect(arg.chieu).toBe("sold");
  });
});

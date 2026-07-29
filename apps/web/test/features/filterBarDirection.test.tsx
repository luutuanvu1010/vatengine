// B1 (U27) — Ẩn ô MST không liên quan theo CHIỀU lọc, và dọn giá trị ô đã ẩn để không lọc
// ngầm bằng trường đã ẩn. 2026-07-23: Chiều là SEGMENTED [Mua vào | Bán ra] (bỏ "Tất cả"),
// MẶC ĐỊNH Mua vào. Mua vào ẩn nmmst (người mua); Bán ra ẩn nbmst (người bán).
//
// GOLDEN ĐỔI CÓ CHỦ ĐÍCH (U37b Gói 1, 2026-07-29) — hai thay đổi, cả hai đều cố ý:
//  1. Ô lọc bên MUA đổi từ `Field` nhập MST thô (nhãn "MST người mua") sang ô TÌM LIVE
//     `ChonKhachHang` (nhãn "Khách hàng"). Người dùng nhớ TÊN khách chứ không nhớ MST;
//     thứ ràng vào bộ lọc vẫn là `nmmst` khớp chính xác. Xem docs/plans/U37b-plan.md §4 Gói 1.
//  2. `FilterBar` từ nay CẦN `QueryClientProvider` (ChonKhachHang tự nạp danh sách khách).
//     Ứng dụng thật đã có provider ở gốc; test phải bọc thêm.
// Ý ĐỊNH GỐC của bộ test này KHÔNG đổi: chiều quyết định ô MST nào hiển thị, và đổi chiều
// phải DỌN giá trị của ô đã ẩn để không lọc ngầm.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FilterBar } from "../../src/features/invoices/FilterBar";
import type { InvoiceFilter } from "../../src/types/api";

function setup(value: InvoiceFilter = {}) {
  const onApply = vi.fn();
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ items: [], biCatBot: false }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }) as Response,
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <FilterBar value={value} onApply={onApply} />
    </QueryClientProvider>,
  );
  return { onApply };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("B1 — ẩn ô MST theo chiều lọc (segmented, mặc định Mua vào)", () => {
  it("MẶC ĐỊNH Mua vào → chỉ hiện MST người bán (ẩn ô chọn Khách hàng)", () => {
    setup({});
    expect(screen.getByLabelText("Mã số thuế người bán")).toBeInTheDocument();
    expect(screen.queryByLabelText("Người mua")).toBeNull();
  });

  it("bấm 'Bán ra' → KHÔNG render MST người bán, hiện ô chọn Khách hàng", async () => {
    setup({});
    await userEvent.click(screen.getByRole("button", { name: "Bán ra" }));
    expect(screen.queryByLabelText("Mã số thuế người bán")).toBeNull();
    expect(screen.getByLabelText("Người mua")).toBeInTheDocument();
  });

  it("Bán ra rồi bấm 'Mua vào' → quay lại chỉ MST người bán", async () => {
    setup({ chieu: "sold" });
    expect(screen.getByLabelText("Người mua")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Mua vào" }));
    expect(screen.queryByLabelText("Người mua")).toBeNull();
    expect(screen.getByLabelText("Mã số thuế người bán")).toBeInTheDocument();
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

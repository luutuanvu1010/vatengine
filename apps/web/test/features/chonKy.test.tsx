// U-K3 — bộ chọn kỳ dạng dropdown (yêu cầu 1 của chủ dự án): chọn tháng/quý/năm CỤ THỂ,
// kể cả kỳ QUÁ KHỨ, bằng <select> gốc (thân thiện cảm ứng) thay vì gõ tay hai ô ngày.
//
// PARITY: ba nút Tháng/Quý/Năm (kỳ hiện tại) PHẢI còn nguyên và vẫn áp dụng ngay —
// đó là hành vi đang chạy, U-K3 chỉ THÊM khả năng chọn kỳ bất kỳ, không lấy đi gì.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChonKy } from "../../src/features/invoices/ChonKy";
import type { DateRange } from "../../src/lib/period";

/** Ngày tham chiếu cố định (15/04/2026 giờ VN) — test không phụ thuộc "hôm nay". */
const HOM_NAY = new Date("2026-04-15T03:00:00Z");

function dung(onChon: (r: DateRange) => void = vi.fn()) {
  return render(<ChonKy onChon={onChon} homNay={HOM_NAY} />);
}

describe("ChonKy — chọn kỳ cụ thể bằng dropdown (yêu cầu 1)", () => {
  it("chọn Năm=2025 + Tháng=3 → khoảng đúng tháng 3/2025 (kỳ QUÁ KHỨ)", async () => {
    const onChon = vi.fn();
    dung(onChon);
    const u = userEvent.setup();

    await u.selectOptions(screen.getByLabelText("Năm"), "2025");
    await u.selectOptions(screen.getByLabelText("Tháng"), "3");

    expect(onChon).toHaveBeenLastCalledWith({ tuNgay: "2025-03-01", denNgay: "2025-03-31" });
  });

  it("độ chi tiết Quý: chọn Năm=2025 + Quý=4 → 01/10–31/12/2025", async () => {
    const onChon = vi.fn();
    dung(onChon);
    const u = userEvent.setup();

    await u.click(screen.getByRole("button", { name: "Quý" }));
    await u.selectOptions(screen.getByLabelText("Năm"), "2025");
    await u.selectOptions(screen.getByLabelText("Quý"), "4");

    expect(onChon).toHaveBeenLastCalledWith({ tuNgay: "2025-10-01", denNgay: "2025-12-31" });
  });

  it("độ chi tiết Năm: chọn Năm=2024 → trọn năm 2024, KHÔNG còn ô tháng/quý", async () => {
    const onChon = vi.fn();
    dung(onChon);
    const u = userEvent.setup();

    await u.click(screen.getByRole("button", { name: "Năm" }));
    await u.selectOptions(screen.getByLabelText("Năm"), "2024");

    expect(onChon).toHaveBeenLastCalledWith({ tuNgay: "2024-01-01", denNgay: "2024-12-31" });
    expect(screen.queryByLabelText("Tháng")).toBeNull();
    expect(screen.queryByLabelText("Quý")).toBeNull();
  });

  it("PARITY — ba nút kỳ hiện tại còn nguyên và áp dụng NGAY khi bấm", async () => {
    const onChon = vi.fn();
    dung(onChon);
    const u = userEvent.setup();

    await u.click(screen.getByRole("button", { name: "Tháng" }));
    expect(onChon).toHaveBeenLastCalledWith({ tuNgay: "2026-04-01", denNgay: "2026-04-30" });

    await u.click(screen.getByRole("button", { name: "Quý" }));
    expect(onChon).toHaveBeenLastCalledWith({ tuNgay: "2026-04-01", denNgay: "2026-06-30" });

    await u.click(screen.getByRole("button", { name: "Năm" }));
    expect(onChon).toHaveBeenLastCalledWith({ tuNgay: "2026-01-01", denNgay: "2026-12-31" });
  });

  it("mặc định trỏ đúng kỳ chứa `homNay` (không bịa kỳ khác)", () => {
    dung();
    expect((screen.getByLabelText("Năm") as HTMLSelectElement).value).toBe("2026");
    expect((screen.getByLabelText("Tháng") as HTMLSelectElement).value).toBe("4");
  });

  it("danh sách năm gồm 5 năm gần nhất tính từ `homNay`", () => {
    dung();
    const nam = Array.from((screen.getByLabelText("Năm") as HTMLSelectElement).options).map(
      (o) => o.value,
    );
    expect(nam).toEqual(["2026", "2025", "2024", "2023", "2022"]);
  });

  it("a11y — mọi ô chọn có nhãn gắn đúng id, dùng <select> gốc (cảm ứng tốt)", () => {
    dung();
    for (const nhan of ["Năm", "Tháng"]) {
      const el = screen.getByLabelText(nhan);
      expect(el.tagName).toBe("SELECT");
      expect(el.id).toBeTruthy();
      const label = document.querySelector(`label[for="${el.id}"]`);
      expect(label, `thiếu <label for> cho ô '${nhan}'`).not.toBeNull();
    }
  });
});

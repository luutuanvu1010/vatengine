// U-K3 — primitive Select + Field (còn thiếu trong thư viện; FilterBar/ColumnMenu vốn tự tô
// kiểu nội tuyến). Chỉ token, có <label htmlFor> gắn đúng id, dùng thẻ gốc cho a11y + cảm ứng.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Field, Select } from "../../src/components/ui/primitives";

describe("Select — ô chọn primitive", () => {
  it("render <select> gốc, nhãn gắn đúng id", () => {
    render(
      <Select label="Chiều" value="" onChange={() => {}}>
        <option value="">Tất cả</option>
        <option value="purchase">Mua vào</option>
      </Select>,
    );
    const el = screen.getByLabelText("Chiều");
    expect(el.tagName).toBe("SELECT");
    expect(document.querySelector(`label[for="${el.id}"]`)).not.toBeNull();
  });

  it("nhãn ẩn (chỉ cho trình đọc màn hình) vẫn gắn được — không mất a11y khi giao diện gọn", () => {
    render(
      <Select label="Nguồn" hideLabel value="" onChange={() => {}}>
        <option value="">Mọi nguồn</option>
      </Select>,
    );
    expect(screen.getByLabelText("Nguồn").tagName).toBe("SELECT");
  });
});

describe("Field — ô nhập primitive (nhãn tuỳ chọn ẩn)", () => {
  it("render <input> gốc với nhãn gắn đúng id", () => {
    render(<Field label="Mã số thuế người bán" value="" onChange={() => {}} />);
    const el = screen.getByLabelText("Mã số thuế người bán");
    expect(el.tagName).toBe("INPUT");
    expect(document.querySelector(`label[for="${el.id}"]`)).not.toBeNull();
  });

  it("truyền type (vd date) xuống input gốc", () => {
    render(<Field label="Từ ngày" type="date" value="" onChange={() => {}} />);
    expect((screen.getByLabelText("Từ ngày") as HTMLInputElement).type).toBe("date");
  });
});

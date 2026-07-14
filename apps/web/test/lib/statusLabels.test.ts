import { describe, expect, it } from "vitest";
import { labelChieu, labelNguon, labelTthai, labelTtxly } from "../../src/lib/statusLabels";

describe("labelTthai — chỉ mã đã kiểm chứng (Nguyên tắc bằng chứng)", () => {
  it("tthai=1 (đã quan sát — ADR-0001) → nhãn 'Gốc', verified", () => {
    expect(labelTthai(1)).toEqual({ text: "Gốc", verified: true });
  });
  it("mã chưa probe → 'số (chưa rõ)', KHÔNG đoán nhãn", () => {
    expect(labelTthai(5)).toEqual({ text: "5 (chưa rõ)", verified: false });
    expect(labelTthai(23)).toEqual({ text: "23 (chưa rõ)", verified: false });
  });
  it("null → '—'", () => {
    expect(labelTthai(null)).toEqual({ text: "—", verified: false });
  });
});

describe("labelTtxly — chưa mã nào kiểm chứng → luôn '(chưa rõ)'", () => {
  it("mọi mã → 'số (chưa rõ)'", () => {
    expect(labelTtxly(1)).toEqual({ text: "1 (chưa rõ)", verified: false });
    expect(labelTtxly(8)).toEqual({ text: "8 (chưa rõ)", verified: false });
  });
  it("null → '—'", () => {
    expect(labelTtxly(null)).toEqual({ text: "—", verified: false });
  });
});

describe("labelChieu / labelNguon — enum cố định", () => {
  it("chiều", () => {
    expect(labelChieu("purchase")).toBe("Mua vào");
    expect(labelChieu("sold")).toBe("Bán ra");
  });
  it("nguồn", () => {
    expect(labelNguon("normal")).toBe("HĐĐT thường");
    expect(labelNguon("sco")).toBe("Máy tính tiền");
  });
});

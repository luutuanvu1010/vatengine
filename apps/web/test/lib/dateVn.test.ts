// Hiển thị ngày ĐỒNG NHẤT dd/mm/yyyy trên mọi thiết bị (sự cố 2026-07-30: input type="date"
// gốc hiển thị theo locale hệ điều hành — máy này 01/07/2026, máy khác 07/01/2026 — và trên
// trình duyệt không hỗ trợ thì chuỗi dd/mm/yyyy đi thẳng lên API bị Zod YYYY-MM-DD từ chối).
// Hai hàm thuần đổi chiều ISO ↔ dd/mm/yyyy, KHÔNG dùng Date parsing (tránh mọi locale).
import { describe, expect, it } from "vitest";
import { dmyToIso, isoToDmy } from "../../src/lib/dateVn";

describe("isoToDmy — ISO → dd/mm/yyyy", () => {
  it("đổi đúng thứ tự ngày/tháng/năm", () => {
    expect(isoToDmy("2026-07-01")).toBe("01/07/2026");
    expect(isoToDmy("2026-12-31")).toBe("31/12/2026");
  });
  it("rỗng/undefined → chuỗi rỗng", () => {
    expect(isoToDmy(undefined)).toBe("");
    expect(isoToDmy("")).toBe("");
  });
  it("chuỗi không phải ISO → chuỗi rỗng (không đoán)", () => {
    expect(isoToDmy("01/07/2026")).toBe("");
    expect(isoToDmy("2026-7-1")).toBe("");
  });
});

describe("dmyToIso — dd/mm/yyyy → ISO", () => {
  it("đổi đúng, chấp nhận cả d/m/yyyy thiếu số 0", () => {
    expect(dmyToIso("01/07/2026")).toBe("2026-07-01");
    expect(dmyToIso("1/7/2026")).toBe("2026-07-01");
    expect(dmyToIso("31/12/2026")).toBe("2026-12-31");
  });
  it("ngày phi thực tế → null (fail-loud, không cuộn)", () => {
    expect(dmyToIso("31/02/2026")).toBeNull();
    expect(dmyToIso("00/07/2026")).toBeNull();
    expect(dmyToIso("01/13/2026")).toBeNull();
    expect(dmyToIso("29/02/2025")).toBeNull(); // 2025 không nhuận
  });
  it("năm nhuận 29/02 hợp lệ", () => {
    expect(dmyToIso("29/02/2024")).toBe("2024-02-29");
  });
  it("định dạng lạ → null", () => {
    expect(dmyToIso("2026-07-01")).toBeNull();
    expect(dmyToIso("01072026")).toBeNull();
    expect(dmyToIso("abc")).toBeNull();
    expect(dmyToIso("")).toBeNull();
  });
});

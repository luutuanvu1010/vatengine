// SỰ CỐ 2026-07-18 — nhận diện TRẦN NỀN TẢNG Workers (không phải sức khỏe GDT).
// Đây là chỗ dò chuỗi DUY NHẤT của hệ thống: nếu nó sai, lỗi cục bộ lại bị quy kết
// cho GDT và mở circuit breaker oan (chặn sạch đồng bộ, che mất lỗi thật). Vì vậy
// khoá hành vi bằng test trực tiếp, không chỉ qua fixture đã phân loại sẵn.
import { describe, expect, it } from "vitest";
import { laTranNenTangCucBo } from "../../src/sync";

describe("laTranNenTangCucBo — nhận diện trần nền tảng Workers", () => {
  it("KHỚP chuỗi THẬT quan sát ở production (lan_dong_bo n=61, 2026-07-18)", () => {
    const that = new Error(
      "Too many subrequests by single Worker invocation. To configure this limit, refer to https://developers.cloudflare.com/workers/platform/limits/",
    );
    expect(laTranNenTangCucBo(that)).toBe(true);
  });

  it("KHỚP cả khi thông điệp chỉ có phần cốt lõi (Cloudflare rút gọn câu chữ)", () => {
    expect(laTranNenTangCucBo(new Error("Too many subrequests"))).toBe(true);
  });

  it("KHÔNG khớp lỗi GDT thật — 429/5xx phải giữ nguyên đường tính vào breaker", () => {
    expect(
      laTranNenTangCucBo(new Error("Truy vấn /api/query/invoices/purchase lỗi (HTTP 429).")),
    ).toBe(false);
    expect(laTranNenTangCucBo(new Error("HTTP 500"))).toBe(false);
  });

  it("KHÔNG khớp 'The operation was aborted' — CHƯA KIỂM CHỨNG đó là lỗi nền tảng hay GDT chậm; không đoán (xem BACKLOG 2026-07-18)", () => {
    expect(laTranNenTangCucBo(new Error("The operation was aborted"))).toBe(false);
  });

  it("an toàn với đầu vào KHÔNG phải Error (không ném)", () => {
    expect(laTranNenTangCucBo("Too many subrequests")).toBe(false);
    expect(laTranNenTangCucBo(null)).toBe(false);
    expect(laTranNenTangCucBo(undefined)).toBe(false);
    expect(laTranNenTangCucBo({ message: "Too many subrequests" })).toBe(false);
  });
});

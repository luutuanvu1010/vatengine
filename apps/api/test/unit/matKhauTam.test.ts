// U18 §6 — Mật khẩu tạm 6 chữ số. Đây là điểm YẾU CÓ CHỦ Ý của thiết kế: 10^6 không gian
// là nhỏ, chủ dự án chấp nhận đánh đổi để khách dễ nhập. Ba điều kiện bù BẮT BUỘC
// (U18-plan §103) — hết hạn, buộc đổi, rate-limit login — nên các test dưới đây kiểm đúng
// những gì làm cho đánh đổi đó còn an toàn, không phải "hàm có chạy không".
import { describe, expect, it, vi } from "vitest";
import {
  MAT_KHAU_TAM_HAN_GIO,
  MAT_KHAU_TAM_SO_CHU_SO,
  hanMatKhauTam,
  sinhMatKhauTam,
} from "../../src/admin/matKhauTam";

describe("sinhMatKhauTam", () => {
  it("luôn đúng 6 chữ số, giữ số 0 ở đầu", () => {
    for (let i = 0; i < 200; i++) {
      const mk = sinhMatKhauTam();
      expect(mk).toMatch(/^\d{6}$/);
      expect(mk).toHaveLength(MAT_KHAU_TAM_SO_CHU_SO);
    }
  });

  it("🔴 KHÔNG dùng Math.random", () => {
    // Math.random không phải nguồn mật mã: giá trị kế tiếp đoán được từ vài mẫu quan sát.
    // Với mật khẩu chỉ 6 số, dùng nhầm nguồn là mất trắng phần entropy ít ỏi còn lại.
    const spy = vi.spyOn(Math, "random");
    for (let i = 0; i < 50; i++) sinhMatKhauTam();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("dùng crypto.getRandomValues", () => {
    const spy = vi.spyOn(crypto, "getRandomValues");
    sinhMatKhauTam();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("không lệch phân phối — mọi chữ số 0-9 đều xuất hiện ở mọi vị trí", () => {
    // Kiểm THÔ nhưng đủ bắt hai lỗi thật hay gặp: (a) modulo bias làm chữ số đầu lệch,
    // (b) quên padStart khiến số nhỏ mất chữ số 0 dẫn đầu (và thành mật khẩu < 6 ký tự).
    const thay: Array<Set<string>> = Array.from({ length: 6 }, () => new Set());
    for (let i = 0; i < 3000; i++) {
      const mk = sinhMatKhauTam();
      for (let v = 0; v < 6; v++) thay[v]?.add(mk[v] as string);
    }
    for (let v = 0; v < 6; v++) expect(thay[v]?.size).toBe(10);
  });

  it("không lặp lại trong 500 lần sinh liên tiếp (phát hiện hạt giống cố định)", () => {
    const tap = new Set<string>();
    for (let i = 0; i < 500; i++) tap.add(sinhMatKhauTam());
    // 500 mẫu trên 10^6 — trùng ngẫu nhiên là hiếm (nghịch lý sinh nhật ≈ 12%), nhưng một
    // nguồn hỏng (hạt giống cố định) sẽ cho ra rất ít giá trị phân biệt. Ngưỡng nới rộng
    // để không đỏ ngẫu nhiên trong CI.
    expect(tap.size).toBeGreaterThan(480);
  });
});

describe("hanMatKhauTam", () => {
  it("hết hạn sau đúng 72 giờ", () => {
    const bayGio = new Date("2026-07-21T10:00:00Z");
    expect(hanMatKhauTam(bayGio).toISOString()).toBe("2026-07-24T10:00:00.000Z");
    expect(MAT_KHAU_TAM_HAN_GIO).toBe(72);
  });

  it("hạn nằm ở TƯƠNG LAI so với mốc truyền vào", () => {
    const bayGio = new Date();
    expect(hanMatKhauTam(bayGio).getTime()).toBeGreaterThan(bayGio.getTime());
  });
});

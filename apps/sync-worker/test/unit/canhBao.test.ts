// U43 — Sink Telegram cho cảnh báo giám sát: FAIL-SILENT (thiếu cấu hình/Telegram sập →
// không ném), nội dung KHÔNG chứa bot token, gọi đúng endpoint sendMessage.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guiCanhBaoTelegram } from "../../src/canhBao";

const fetchGia = vi.fn();
const ENV = { TELEGRAM_BOT_TOKEN: "123456:TOKEN_GIA", TELEGRAM_CHAT_ID: "-100123" };
const SU_KIEN = {
  loai: "chan" as const,
  verdict: "WAF_BLOCKED",
  httpStatus: 403,
  message: "Hệ thống phát hiện hành vi không hợp lệ.",
  thoiDiem: new Date("2026-09-24T05:00:00.000Z"),
};

beforeEach(() => {
  fetchGia.mockReset();
  vi.stubGlobal("fetch", fetchGia);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("guiCanhBaoTelegram", () => {
  it("đủ cấu hình → POST sendMessage với chat_id + nội dung tin; trả daGui true", async () => {
    fetchGia.mockResolvedValue(new Response("{}", { status: 200 }));
    const kq = await guiCanhBaoTelegram(ENV, SU_KIEN);
    expect(kq).toEqual({ daGui: true });
    const [url, init] = fetchGia.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/sendMessage");
    const body = JSON.parse(String(init.body));
    expect(body.chat_id).toBe("-100123");
    expect(body.text).toContain("GDT đang CHẶN");
    expect(body.text).not.toContain("TOKEN_GIA");
  });

  it("thiếu cấu hình → chua_cau_hinh, không gọi mạng, không ném", async () => {
    const kq = await guiCanhBaoTelegram({}, SU_KIEN);
    expect(kq).toEqual({ daGui: false, lyDo: "chua_cau_hinh" });
    expect(fetchGia).not.toHaveBeenCalled();
  });

  // "Thông báo không chạy" mà không biết THIẾU CÁI GÌ là kiểu hỏng tốn nhiều giờ nhất để
  // tìm ra — cấu hình khuyết MỘT mảnh phải nêu ĐÚNG tên mảnh đó, không nêu mảnh đã có.
  it("thiếu ĐÚNG một mảnh → console.warn nêu đúng tên mảnh thiếu, không nêu mảnh đã có", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await guiCanhBaoTelegram({ TELEGRAM_BOT_TOKEN: "123456:TOKEN_GIA" }, SU_KIEN);
      const dong = warn.mock.calls.map((c) => String(c[0])).join("\n");
      expect(dong).toContain("TELEGRAM_CHAT_ID");
      expect(dong).not.toContain("TELEGRAM_BOT_TOKEN");
      // Và KHÔNG rò giá trị bot token vào log.
      expect(dong).not.toContain("TOKEN_GIA");
    } finally {
      warn.mockRestore();
    }
  });

  it("Telegram trả 400 → telegram_tu_choi, không ném", async () => {
    fetchGia.mockResolvedValue(new Response("{}", { status: 400 }));
    await expect(guiCanhBaoTelegram(ENV, SU_KIEN)).resolves.toEqual({
      daGui: false,
      lyDo: "telegram_tu_choi",
    });
  });

  it("mạng hỏng → khong_goi_duoc, không ném", async () => {
    fetchGia.mockRejectedValue(new Error("ECONNRESET"));
    await expect(guiCanhBaoTelegram(ENV, SU_KIEN)).resolves.toEqual({
      daGui: false,
      lyDo: "khong_goi_duoc",
    });
  });
});

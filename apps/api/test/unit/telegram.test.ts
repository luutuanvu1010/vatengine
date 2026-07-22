// U34a — Báo super-admin qua Telegram khi có đăng ký mới.
//
// Ba tính chất được canh ở đây, theo thứ tự quan trọng:
//   1. FAIL-SILENT — không cấu hình, Telegram từ chối, mạng chết: đều KHÔNG ném.
//   2. KHÔNG rò PII — email bị che; tin nhắn nằm trên máy chủ Telegram, ngoài tầm kiểm
//      soát tenant, nên `security.md` không cho đặt dữ liệu nhạy cảm ở đó.
//   3. KHÔNG có URL duyệt trong tin (QĐ-12) — đây là ca canh ranh giới kiến trúc, không
//      phải canh chuỗi ký tự: nếu ai đó thêm link duyệt "cho tiện", ca này phải ĐỎ.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  baoDangKyMoi,
  cheEmail,
  guiTinTelegram,
  kiemTraCauHinhTelegram,
  soanTinDangKyMoi,
  thoatHtml,
} from "../../src/thongBao/telegram";

const fetchGia = vi.fn();
const ENV_DU = {
  TELEGRAM_BOT_TOKEN: "123456:TOKEN_GIA_KHONG_PHAI_THAT",
  TELEGRAM_CHAT_ID: "-1001234567890",
  URL_CONG_ADMIN: "https://adminvatengine.example",
};
const TT = {
  tenantId: "11111111-1111-1111-1111-111111111111",
  tenDoanhNghiep: "Công ty TNHH ABC",
  mst: "0101234567",
  email: "ketoan@congty.vn",
};

beforeEach(() => {
  fetchGia.mockReset();
  vi.stubGlobal("fetch", fetchGia);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.unstubAllGlobals());

describe("cheEmail", () => {
  it("giữ đủ để nhận ra người quen, che phần còn lại", () => {
    expect(cheEmail("ketoan@congty.vn")).toBe("ke***n@congty.vn");
  });

  it("🔴 tên quá ngắn → che SẠCH, không hé lộ gần hết", () => {
    // `an@x.vn` mà hiện `a***n` thì phần che còn ít hơn phần lộ — vô nghĩa.
    expect(cheEmail("an@x.vn")).toBe("***@x.vn");
    expect(cheEmail("abc@x.vn")).toBe("***@x.vn");
  });

  it("chuỗi không phải email → không vỡ, che sạch", () => {
    expect(cheEmail("khong-co-a-còng")).toBe("***");
    expect(cheEmail("@chi-co-mien.vn")).toBe("***");
  });
});

describe("thoatHtml", () => {
  it("🔴 tên doanh nghiệp chứa dấu ngoặc nhọn KHÔNG phá cấu trúc HTML của tin", () => {
    // Telegram parse_mode=HTML: một `<` lạc chỗ làm Telegram trả 400 ⇒ thông báo im lặng
    // biến mất đúng lúc cần nhất. Đây cũng là đường tiêm: tên DN do NGƯỜI LẠ nhập vào.
    expect(thoatHtml('Cty <b>ABC</b> & "XYZ"')).toBe('Cty &lt;b&gt;ABC&lt;/b&gt; &amp; "XYZ"');
  });
});

describe("soanTinDangKyMoi", () => {
  it("có tên DN và MST nguyên vẹn (thứ admin cần để quyết), email thì che", () => {
    const tin = soanTinDangKyMoi(TT, ENV_DU.URL_CONG_ADMIN);
    expect(tin).toContain("Công ty TNHH ABC");
    expect(tin).toContain("0101234567");
    expect(tin).toContain("ke***n@congty.vn");
    expect(tin).not.toContain("ketoan@congty.vn");
  });

  it("🔴 QĐ-12 — tin CHỈ có link mở Cổng Admin, TUYỆT ĐỐI không có URL duyệt", async () => {
    const tin = soanTinDangKyMoi(TT, ENV_DU.URL_CONG_ADMIN);
    expect(tin).toContain("https://adminvatengine.example/tenants");
    // Một URL bấm-là-duyệt sẽ bị email client / Telegram / phần mềm quét link TỰ FETCH ⇒
    // tenant được duyệt trước khi người kịp đọc. Cùng lớp lỗi với sự cố Hyperdrive.
    expect(tin).not.toMatch(/duyet|duyệt.*http|approve/i);
    expect(tin).not.toContain(TT.tenantId); // không có id để ghép thành URL thao tác
  });

  it("URL Cổng Admin có dấu / ở cuối không tạo ra link //tenants", () => {
    expect(soanTinDangKyMoi(TT, "https://a.example/")).toContain("https://a.example/tenants");
  });
});

describe("kiemTraCauHinhTelegram", () => {
  it("đủ ba biến → ok", () => {
    const kq = kiemTraCauHinhTelegram(ENV_DU);
    expect(kq.ok).toBe(true);
  });

  it("🔴 khoảng trắng thừa quanh giá trị bị CẮT — lỗi thật gặp ngày 2026-07-22", () => {
    // `TELEGRAM_CHAT_ID` bị dán dư một khoảng trắng đầu chuỗi ⇒ Telegram trả "chat not
    // found". Vì module này FAIL-SILENT, kênh báo chết CÂM: không lỗi, không 5xx, chỉ là
    // tin nhắn không bao giờ tới. Dán vào `wrangler secret put` càng dễ dính vì shell giữ
    // nguyên khoảng trắng và mắt thường không thấy.
    const kq = kiemTraCauHinhTelegram({
      TELEGRAM_BOT_TOKEN: " 123:ABC ",
      TELEGRAM_CHAT_ID: " -1001234567890\n",
      URL_CONG_ADMIN: "  https://a.example  ",
    });
    expect(kq.ok).toBe(true);
    if (kq.ok)
      expect(kq.cauHinh).toEqual({
        botToken: "123:ABC",
        chatId: "-1001234567890",
        urlCongAdmin: "https://a.example",
      });
  });

  it("🔴 giá trị TOÀN khoảng trắng bị coi là THIẾU, không phải là có", () => {
    const kq = kiemTraCauHinhTelegram({
      TELEGRAM_BOT_TOKEN: "   ",
      TELEGRAM_CHAT_ID: "x",
      URL_CONG_ADMIN: "y",
    });
    expect(kq.ok).toBe(false);
    if (!kq.ok) expect(kq.thieu).toEqual(["TELEGRAM_BOT_TOKEN"]);
  });

  it("🔴 thiếu biến nào thì NÓI RA biến đó — 'thông báo không chạy' mà không biết vì sao là kiểu hỏng tốn giờ nhất", () => {
    const kq = kiemTraCauHinhTelegram({ TELEGRAM_BOT_TOKEN: "x" });
    expect(kq.ok).toBe(false);
    if (!kq.ok) expect(kq.thieu).toEqual(["TELEGRAM_CHAT_ID", "URL_CONG_ADMIN"]);
  });
});

describe("guiTinTelegram", () => {
  it("gọi đúng endpoint sendMessage của bot, tắt xem trước link", async () => {
    fetchGia.mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const kq = await guiTinTelegram(
      { botToken: "T", chatId: "C", urlCongAdmin: "https://a.example" },
      "xin chao",
    );
    expect(kq).toEqual({ daGui: true });
    const [url, init] = fetchGia.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.telegram.org/botT/sendMessage");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ chat_id: "C", text: "xin chao", parse_mode: "HTML" });
    expect(body.link_preview_options).toEqual({ is_disabled: true });
    // Hiến pháp: mọi lời gọi mạng ra ngoài phải có timeout. Ở đây còn quan trọng hơn vì
    // lời gọi này nằm TRÊN đường trả lời của khách.
    expect(init.signal).toBeDefined();
  });

  it("🔴 Telegram trả 4xx → KHÔNG ném, trả lý do", async () => {
    fetchGia.mockResolvedValueOnce(new Response("{}", { status: 403 }));
    await expect(
      guiTinTelegram({ botToken: "T", chatId: "C", urlCongAdmin: "u" }, "x"),
    ).resolves.toEqual({ daGui: false, lyDo: "telegram_tu_choi" });
  });

  it("🔴 mạng chết / quá hạn → KHÔNG ném, trả lý do", async () => {
    fetchGia.mockRejectedValueOnce(new Error("network down"));
    await expect(
      guiTinTelegram({ botToken: "T", chatId: "C", urlCongAdmin: "u" }, "x"),
    ).resolves.toEqual({ daGui: false, lyDo: "khong_goi_duoc" });
  });
});

describe("🔴 baoDangKyMoi — FAIL-SILENT ở mọi nhánh", () => {
  it("CHƯA cấu hình → không gọi mạng, không ném", async () => {
    await expect(baoDangKyMoi({}, TT)).resolves.toEqual({
      daGui: false,
      lyDo: "chua_cau_hinh",
    });
    expect(fetchGia).not.toHaveBeenCalled();
  });

  it("cấu hình đủ + Telegram ok → đã gửi", async () => {
    fetchGia.mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await expect(baoDangKyMoi(ENV_DU, TT)).resolves.toEqual({ daGui: true });
  });

  it("Telegram sập → vẫn KHÔNG ném", async () => {
    fetchGia.mockRejectedValueOnce(new Error("sap"));
    await expect(baoDangKyMoi(ENV_DU, TT)).resolves.toEqual({
      daGui: false,
      lyDo: "khong_goi_duoc",
    });
  });

  it("🔴 log vận hành KHÔNG chứa email hay MST của khách", async () => {
    const warn = vi.mocked(console.warn);
    fetchGia.mockRejectedValueOnce(new Error("sap"));
    await baoDangKyMoi(ENV_DU, TT);
    const daLog = warn.mock.calls.flat().join(" ");
    // Truy vết đầy đủ đã có ở audit_log (nơi có kiểm soát tenant); log vận hành thì không.
    expect(daLog).not.toContain("ketoan@congty.vn");
    expect(daLog).not.toContain("0101234567");
  });
});

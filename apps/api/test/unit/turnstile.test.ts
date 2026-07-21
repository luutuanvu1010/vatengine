// U33 — Xác minh token Turnstile ở PHÍA MÁY CHỦ.
//
// Vì sao bước này bắt buộc: widget ở trình duyệt chỉ SINH ra token. Nếu máy chủ không
// kiểm, kẻ tấn công gọi thẳng `POST /dang-ky` bằng curl và bỏ qua widget hoàn toàn — lúc
// đó captcha chỉ là trang trí. Tài liệu Cloudflare nói thẳng: "Server-side validation is
// required because tokens can be forged, expire, and are single-use."
//
// Sau khi U33 gỡ SignupLimiter và LoginLimiter, đây là lớp bảo vệ DUY NHẤT còn lại ở tầng
// ứng dụng cho cổng ghi công khai. Test ở đây canh đúng chỗ đó.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SITEVERIFY_URL, kiemTraCauHinhTurnstile, xacMinhTurnstile } from "../../src/turnstile";

const fetchGia = vi.fn();
const SECRET = "0xTEST_SECRET_KHONG_PHAI_THAT";

function traVe(body: unknown, status = 200) {
  fetchGia.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchGia);
  fetchGia.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("xacMinhTurnstile — gọi đúng hợp đồng siteverify", () => {
  it("POST tới đúng endpoint, gửi secret + response", async () => {
    traVe({ success: true });
    await xacMinhTurnstile(SECRET, "token-tu-widget");

    const [url, init] = fetchGia.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(SITEVERIFY_URL);
    expect(init.method).toBe("POST");
    const body = init.body as URLSearchParams;
    expect(body.get("secret")).toBe(SECRET);
    expect(body.get("response")).toBe("token-tu-widget");
  });

  it("gửi kèm remoteip khi biết IP người gọi", async () => {
    traVe({ success: true });
    await xacMinhTurnstile(SECRET, "tok", "203.0.113.9");
    const body = (fetchGia.mock.calls[0] as [string, RequestInit])[1].body as URLSearchParams;
    expect(body.get("remoteip")).toBe("203.0.113.9");
  });

  it("KHÔNG gửi remoteip rỗng — tham số vô nghĩa làm nhiễu chẩn đoán về sau", async () => {
    traVe({ success: true });
    await xacMinhTurnstile(SECRET, "tok");
    const body = (fetchGia.mock.calls[0] as [string, RequestInit])[1].body as URLSearchParams;
    expect(body.has("remoteip")).toBe(false);
  });
});

describe("Kết quả xác minh", () => {
  it("success:true → hợp lệ", async () => {
    traVe({ success: true, hostname: "vatengine.tourdao.vn" });
    expect(await xacMinhTurnstile(SECRET, "tok")).toEqual({ ok: true });
  });

  it("🔴 token đã dùng / quá hạn → mã riêng để UI bảo người dùng thử lại", async () => {
    // Token Turnstile dùng MỘT LẦN và chỉ sống 300 giây. Người dùng mở form, đi pha cà
    // phê, quay lại bấm gửi — đây là ca THƯỜNG XUYÊN nhất, không phải ca hiếm. Gộp nó vào
    // "captcha sai" sẽ khiến người dùng tưởng mình làm gì đó sai.
    traVe({ success: false, "error-codes": ["timeout-or-duplicate"] });
    expect(await xacMinhTurnstile(SECRET, "tok")).toEqual({ ok: false, ly_do: "het_han" });
  });

  it("token rác/giả → captcha_sai", async () => {
    traVe({ success: false, "error-codes": ["invalid-input-response"] });
    expect(await xacMinhTurnstile(SECRET, "rac")).toEqual({ ok: false, ly_do: "captcha_sai" });
  });

  it("🔴 secret sai → lỗi CẤU HÌNH, không phải lỗi người dùng", async () => {
    // Nếu gộp vào "captcha sai", người dùng sẽ bấm lại vô hạn trong khi vấn đề nằm ở máy
    // chủ. Phân biệt để route trả 503 chứ không phải 400.
    traVe({ success: false, "error-codes": ["invalid-input-secret"] });
    expect(await xacMinhTurnstile(SECRET, "tok")).toEqual({ ok: false, ly_do: "cau_hinh_sai" });
  });

  it("Cloudflare lỗi/không gọi được → KHÔNG cho qua (fail-closed)", async () => {
    fetchGia.mockRejectedValueOnce(new Error("mạng hỏng"));
    expect(await xacMinhTurnstile(SECRET, "tok")).toEqual({ ok: false, ly_do: "khong_kiem_duoc" });
  });

  it("phản hồi không phải JSON → fail-closed, không ném", async () => {
    fetchGia.mockResolvedValueOnce(new Response("<html>lỗi</html>", { status: 502 }));
    expect(await xacMinhTurnstile(SECRET, "tok")).toEqual({ ok: false, ly_do: "khong_kiem_duoc" });
  });

  it("mã lỗi lạ (Cloudflare thêm sau này) → không vỡ, vẫn từ chối", async () => {
    traVe({ success: false, "error-codes": ["mot-ma-moi-toanh"] });
    const r = await xacMinhTurnstile(SECRET, "tok");
    expect(r.ok).toBe(false);
  });

  it("token rỗng → từ chối NGAY, không tốn một lượt gọi mạng", async () => {
    expect(await xacMinhTurnstile(SECRET, "")).toEqual({ ok: false, ly_do: "thieu_captcha" });
    expect(fetchGia).not.toHaveBeenCalled();
  });
});

describe("🔴 kiemTraCauHinhTurnstile — FAIL-CLOSED", () => {
  it("thiếu secret → không hợp lệ", () => {
    expect(kiemTraCauHinhTurnstile({})).toEqual({ ok: false });
  });

  it("secret rỗng → không hợp lệ (chuỗi rỗng là chưa đặt)", () => {
    expect(kiemTraCauHinhTurnstile({ TURNSTILE_SECRET_KEY: "" })).toEqual({ ok: false });
  });

  it("có secret → hợp lệ", () => {
    expect(kiemTraCauHinhTurnstile({ TURNSTILE_SECRET_KEY: SECRET })).toEqual({
      ok: true,
      secret: SECRET,
    });
  });
});

// U34b — Gửi thư qua Amazon SES API v2 (ADR-0007 §1).
//
// Ba mối lo, xếp theo mức thiệt hại nếu sai:
//   1. PHÂN BIỆT LỖI. `tai_khoan_bi_khoa` và `cau_hinh_sai` nghĩa là TOÀN BỘ đường thư đã
//      chết. Gộp chúng với lỗi mạng thoáng qua sẽ khiến sự cố nghiêm trọng nhất trôi qua
//      dưới dạng một dòng cảnh báo giống hệt hàng trăm dòng khác.
//   2. CHẶN TRƯỚC KHI GỌI SES. Bounce mới là thứ giết tài khoản, không phải lỗi lúc gửi.
//   3. HỢP ĐỒNG GỬI ĐI. Sai `Charset` thì thư vẫn "gửi thành công" nhưng tới nơi là ký tự hỏng.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  anhXaLoiSes,
  kiemTraCauHinhSes,
  layTenLoi,
  taoEmailTransport,
  taoSesTransport,
} from "../../src/email/ses";

const fetchGia = vi.fn();
const CAU_HINH = {
  accessKeyId: "AKIA_GIA_KHONG_PHAI_THAT",
  secretAccessKey: "secret_gia_khong_phai_that",
  region: "ap-southeast-1",
  emailFrom: "no-reply@vatengine.example",
};
const THU = {
  den: "ketoan@congty.vn",
  tieuDe: "Xác thực địa chỉ email",
  html: "<p>Chào bạn</p>",
  text: "Chào bạn",
};

/** DoH trả "có MX" để phần kiểm tên miền cho qua, rồi tới lượt SES. */
const DNS_CO_MX = () =>
  new Response(JSON.stringify({ Status: 0, Answer: [{ type: 15, data: "10 mx.congty.vn." }] }), {
    status: 200,
  });

beforeEach(() => {
  fetchGia.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("kiemTraCauHinhSes", () => {
  it("đủ bốn biến → ok", () => {
    expect(
      kiemTraCauHinhSes({
        AWS_ACCESS_KEY_ID: "a",
        AWS_SECRET_ACCESS_KEY: "b",
        AWS_REGION: "c",
        EMAIL_FROM: "d@e.vn",
      }).ok,
    ).toBe(true);
  });

  it("🔴 nói ra ĐÚNG biến nào thiếu", () => {
    const kq = kiemTraCauHinhSes({ AWS_ACCESS_KEY_ID: "a" });
    expect(kq.ok).toBe(false);
    if (!kq.ok) expect(kq.thieu).toEqual(["AWS_SECRET_ACCESS_KEY", "AWS_REGION", "EMAIL_FROM"]);
  });

  it("🔴 cắt khoảng trắng thừa — cùng lỗi đã gặp thật với TELEGRAM_CHAT_ID ngày 22-07", () => {
    // Khoá AWS dán từ Console rất dễ kèm ký tự thừa. Chữ ký SigV4 sai vì một khoảng trắng
    // sẽ biểu hiện thành "403 không rõ lý do" — kiểu lỗi tốn nhiều giờ nhất để lần ra.
    const kq = kiemTraCauHinhSes({
      AWS_ACCESS_KEY_ID: "  AKIA123  ",
      AWS_SECRET_ACCESS_KEY: "sec\n",
      AWS_REGION: " ap-southeast-1 ",
      EMAIL_FROM: " a@b.vn ",
    });
    expect(kq.ok).toBe(true);
    if (kq.ok)
      expect(kq.cauHinh).toEqual({
        accessKeyId: "AKIA123",
        secretAccessKey: "sec",
        region: "ap-southeast-1",
        emailFrom: "a@b.vn",
      });
  });

  it("giá trị TOÀN khoảng trắng bị coi là THIẾU", () => {
    const kq = kiemTraCauHinhSes({
      AWS_ACCESS_KEY_ID: "   ",
      AWS_SECRET_ACCESS_KEY: "b",
      AWS_REGION: "c",
      EMAIL_FROM: "d@e.vn",
    });
    expect(kq.ok).toBe(false);
  });
});

describe("🔴 anhXaLoiSes — phân biệt 'một lá thư hỏng' với 'cả đường thư chết'", () => {
  it.each([
    ["AccountSuspendedException", 400, "tai_khoan_bi_khoa"],
    ["SendingPausedException", 400, "tai_khoan_bi_khoa"],
    ["MailFromDomainNotVerifiedException", 400, "cau_hinh_sai"],
    ["TooManyRequestsException", 429, "qua_nhip"],
    ["MessageRejected", 400, "dia_chi_bi_tu_choi"],
  ])("%s → %s", (ten, status, mong) => {
    expect(anhXaLoiSes(status, ten)).toBe(mong);
  });

  it("403 (chữ ký sai hoặc IAM thiếu ses:SendEmail) → cau_hinh_sai, không phải lỗi thư", () => {
    expect(anhXaLoiSes(403, "")).toBe("cau_hinh_sai");
  });

  it("5xx của AWS → khong_goi_duoc (đáng thử lại), không đổ cho địa chỉ người nhận", () => {
    expect(anhXaLoiSes(503, "")).toBe("khong_goi_duoc");
  });
});

describe("layTenLoi — AWS không nhất quán chỗ đặt tên lỗi", () => {
  it("ưu tiên header x-amzn-errortype, cắt phần sau dấu hai chấm", () => {
    const h = new Headers({ "x-amzn-errortype": "MessageRejected:http://internal" });
    expect(layTenLoi(h, null)).toBe("MessageRejected");
  });
  it("không có header thì đọc __type trong thân", () => {
    expect(layTenLoi(new Headers(), { __type: "AccountSuspendedException" })).toBe(
      "AccountSuspendedException",
    );
  });
  it("không có gì → chuỗi rỗng, không ném", () => {
    expect(layTenLoi(new Headers(), null)).toBe("");
  });
});

describe("gui — hợp đồng gửi đi", () => {
  it("gọi đúng endpoint SES v2 với Charset UTF-8 ở CẢ ba chỗ", async () => {
    fetchGia
      .mockResolvedValueOnce(DNS_CO_MX())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ MessageId: "abc-123" }), { status: 200 }),
      );

    const kq = await taoSesTransport(CAU_HINH, fetchGia).gui(THU);
    expect(kq).toEqual({ daGui: true, messageId: "abc-123" });

    const [req] = fetchGia.mock.calls[1] as [Request];
    expect(req.url).toBe("https://email.ap-southeast-1.amazonaws.com/v2/email/outbound-emails");
    // aws4fetch đã ký ⇒ phải có Authorization dạng AWS4-HMAC-SHA256. Không kiểm chữ ký
    // (đó là việc của thư viện), chỉ kiểm rằng việc ký ĐÃ xảy ra.
    expect(req.headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256/);

    const than = JSON.parse(await req.text());
    expect(than.FromEmailAddress).toBe(CAU_HINH.emailFrom);
    expect(than.Destination.ToAddresses).toEqual([THU.den]);
    // Thiếu Charset thì thư vẫn "gửi thành công" nhưng tiếng Việt tới nơi là ký tự hỏng —
    // hỏng kiểu im lặng, chỉ người nhận mới thấy.
    expect(than.Content.Simple.Subject).toEqual({ Data: THU.tieuDe, Charset: "UTF-8" });
    expect(than.Content.Simple.Body.Html).toEqual({ Data: THU.html, Charset: "UTF-8" });
    expect(than.Content.Simple.Body.Text).toEqual({ Data: THU.text, Charset: "UTF-8" });
  });

  it("🔴 tên miền không nhận thư → KHÔNG gọi SES lần nào", async () => {
    // Cả điểm của U34b nằm ở thứ tự này: bounce mới là thứ giết tài khoản SES, nên phải
    // chặn TRƯỚC khi lá thư kịp rời khỏi hệ thống.
    fetchGia.mockResolvedValueOnce(new Response(JSON.stringify({ Status: 3 }), { status: 200 }));
    const kq = await taoSesTransport(CAU_HINH, fetchGia).gui(THU);
    expect(kq).toEqual({ daGui: false, lyDo: "mien_khong_nhan_thu", chiTiet: "khong_ton_tai" });
    expect(fetchGia).toHaveBeenCalledTimes(1); // chỉ có lời gọi DoH
  });

  it("SES trả lỗi → ánh xạ đúng lý do, KHÔNG ném", async () => {
    fetchGia
      .mockResolvedValueOnce(DNS_CO_MX())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ __type: "AccountSuspendedException" }), { status: 400 }),
      );
    const kq = await taoSesTransport(CAU_HINH, fetchGia).gui(THU);
    expect(kq).toMatchObject({ daGui: false, lyDo: "tai_khoan_bi_khoa" });
  });

  it("mạng chết → khong_goi_duoc, KHÔNG ném", async () => {
    fetchGia.mockResolvedValueOnce(DNS_CO_MX()).mockRejectedValueOnce(new Error("mat mang"));
    await expect(taoSesTransport(CAU_HINH, fetchGia).gui(THU)).resolves.toEqual({
      daGui: false,
      lyDo: "khong_goi_duoc",
    });
  });

  it("200 nhưng thân không có MessageId → vẫn coi là đã gửi, messageId rỗng", async () => {
    fetchGia
      .mockResolvedValueOnce(DNS_CO_MX())
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    expect(await taoSesTransport(CAU_HINH, fetchGia).gui(THU)).toEqual({
      daGui: true,
      messageId: "",
    });
  });
});

describe("taoEmailTransport — chưa cấu hình", () => {
  it("🔴 thiếu env → transport luôn từ chối, KHÔNG gọi mạng, KHÔNG ném", async () => {
    vi.stubGlobal("fetch", fetchGia);
    const kq = await taoEmailTransport({}).gui(THU);
    expect(kq).toMatchObject({ daGui: false, lyDo: "chua_cau_hinh" });
    expect(fetchGia).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

// U34b — Kiểm tên miền người nhận trước khi gửi thư.
//
// Đây là chốt giữ tỉ lệ bounce thấp, tức giữ cho tài khoản SES không bị AWS đình chỉ
// (ADR-0007 §1.5). Hai nhóm ca quan trọng nhất, và chúng kéo ngược chiều nhau:
//   • CHẶN đúng thứ chắc chắn bounce (tên miền không tồn tại, null MX).
//   • KHÔNG chặn nhầm tên miền hợp lệ — đặc biệt ca "không có MX nhưng có A", vốn rất phổ
//     biến ở tên miền nhỏ. Chặn nhầm thì khách thật bị đuổi đi mà không ai biết.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { diaChiNhanDuocThu, layMien, mienNhanDuocThu } from "../../src/email/kiemTraMien";

const fetchGia = vi.fn();

/** Dựng phản hồi DoH. `Status` 0 = ok, 3 = NXDOMAIN. */
function dns(Status: number, Answer?: Array<{ type: number; data: string }>) {
  return new Response(JSON.stringify({ Status, Answer }), { status: 200 });
}
const MX = (data: string) => ({ type: 15, data });
const A = (data: string) => ({ type: 1, data });

beforeEach(() => {
  fetchGia.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("layMien", () => {
  it("tách đúng, đưa về chữ thường", () => {
    expect(layMien("KeToan@CongTy.VN")).toBe("congty.vn");
  });
  it("địa chỉ hỏng → null", () => {
    expect(layMien("khong-co-a-cong")).toBeNull();
    expect(layMien("@chi-co-mien.vn")).toBeNull();
    expect(layMien("thieu-mien@")).toBeNull();
  });
});

describe("mienNhanDuocThu — CHẶN thứ chắc chắn bounce", () => {
  it("🔴 tên miền KHÔNG TỒN TẠI (NXDOMAIN) → chặn", async () => {
    fetchGia.mockResolvedValueOnce(dns(3));
    expect(await mienNhanDuocThu("khong-he-ton-tai.invalid", fetchGia)).toEqual({
      nhanDuoc: false,
      vi: "khong_ton_tai",
    });
    expect(fetchGia).toHaveBeenCalledTimes(1); // NXDOMAIN thì khỏi hỏi tiếp A
  });

  it("🔴 null MX (RFC 7505) → chặn: chủ tên miền TUYÊN BỐ không nhận thư", async () => {
    fetchGia.mockResolvedValueOnce(dns(0, [MX("0 .")]));
    expect(await mienNhanDuocThu("khong-nhan-thu.vn", fetchGia)).toEqual({
      nhanDuoc: false,
      vi: "tu_choi_nhan_thu",
    });
  });

  it("tồn tại nhưng KHÔNG có MX lẫn A → chặn", async () => {
    fetchGia.mockResolvedValueOnce(dns(0, [])).mockResolvedValueOnce(dns(0, []));
    expect(await mienNhanDuocThu("trong-rong.vn", fetchGia)).toEqual({
      nhanDuoc: false,
      vi: "khong_co_ban_ghi",
    });
  });
});

describe("mienNhanDuocThu — KHÔNG chặn nhầm tên miền hợp lệ", () => {
  it("có MX → cho qua", async () => {
    fetchGia.mockResolvedValueOnce(dns(0, [MX("10 mx.congty.vn.")]));
    expect(await mienNhanDuocThu("congty.vn", fetchGia)).toEqual({ nhanDuoc: true, vi: "co_mx" });
  });

  it("🔴 KHÔNG có MX nhưng CÓ A → vẫn cho qua (implicit MX, RFC 5321 §5.1)", async () => {
    // Cái bẫy chính của cả module này. Rất nhiều tên miền nhỏ ở Việt Nam chạy đúng kiểu
    // này. Nếu chặn chỉ dựa trên MX, khách hàng HOÀN TOÀN HỢP LỆ bị từ chối — và họ chỉ
    // thấy "email không hợp lệ" rồi bỏ đi, không ai biết đã mất khách.
    fetchGia.mockResolvedValueOnce(dns(0, [])).mockResolvedValueOnce(dns(0, [A("203.0.113.7")]));
    expect(await mienNhanDuocThu("nho-le.vn", fetchGia)).toEqual({
      nhanDuoc: true,
      vi: "co_a_ngam_dinh",
    });
  });

  it("nhiều MX, trong đó có một cái đích là '.' → KHÔNG phải null MX, vẫn cho qua", async () => {
    // Null MX chỉ có nghĩa khi nó là bản ghi DUY NHẤT. Nhận diện lỏng tay ở đây sẽ chặn
    // nhầm tên miền có cấu hình DNS luộm thuộm nhưng vẫn nhận thư bình thường.
    fetchGia.mockResolvedValueOnce(dns(0, [MX("0 ."), MX("10 mx.that.vn.")]));
    expect(await mienNhanDuocThu("hon-hop.vn", fetchGia)).toEqual({ nhanDuoc: true, vi: "co_mx" });
  });
});

describe("🔴 mienNhanDuocThu — FAIL-OPEN khi không hỏi được DNS", () => {
  // Ngược chiều Turnstile, và ngược có chủ ý. Đây là chốt bảo vệ UY TÍN GỬI THƯ, không phải
  // cổng bảo mật. DoH hỏng mà fail-closed thì KHÔNG AI đăng ký được — thiệt hại chắc chắn
  // và tức thì, đổi lấy việc tránh một thiệt hại chỉ CÓ THỂ xảy ra.
  it("DoH trả lỗi HTTP → cho qua", async () => {
    fetchGia.mockResolvedValueOnce(new Response("", { status: 502 }));
    expect(await mienNhanDuocThu("congty.vn", fetchGia)).toEqual({
      nhanDuoc: true,
      vi: "khong_kiem_duoc",
    });
  });

  it("mạng chết / quá hạn → cho qua, KHÔNG ném", async () => {
    fetchGia.mockRejectedValueOnce(new Error("timeout"));
    expect(await mienNhanDuocThu("congty.vn", fetchGia)).toEqual({
      nhanDuoc: true,
      vi: "khong_kiem_duoc",
    });
  });

  it("JSON rác → cho qua", async () => {
    fetchGia.mockResolvedValueOnce(new Response("khong-phai-json", { status: 200 }));
    expect((await mienNhanDuocThu("congty.vn", fetchGia)).nhanDuoc).toBe(true);
  });
});

describe("gọi DoH đúng cách", () => {
  it("hỏi cloudflare-dns với accept dns-json và CÓ timeout", async () => {
    fetchGia.mockResolvedValueOnce(dns(0, [MX("10 mx.vn.")]));
    await mienNhanDuocThu("congty.vn", fetchGia);
    const [url, init] = fetchGia.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("https://cloudflare-dns.com/dns-query?name=congty.vn&type=MX");
    expect((init.headers as Record<string, string>).accept).toBe("application/dns-json");
    expect(init.signal).toBeDefined();
  });
});

describe("diaChiNhanDuocThu", () => {
  it("địa chỉ không tách được miền → chặn, KHÔNG gọi mạng", async () => {
    expect(await diaChiNhanDuocThu("hong", fetchGia)).toEqual({
      nhanDuoc: false,
      vi: "khong_co_ban_ghi",
    });
    expect(fetchGia).not.toHaveBeenCalled();
  });
});

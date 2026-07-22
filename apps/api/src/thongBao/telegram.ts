// U34a (QĐ-12, QĐ-15) — Báo cho super-admin qua Telegram khi có hồ sơ đăng ký mới.
//
// ── HƯỚNG HỎNG NGƯỢC VỚI TURNSTILE, VÀ ĐÓ LÀ CHỦ Ý ────────────────────────────────────
// `turnstile.ts` FAIL-CLOSED: thiếu cấu hình ⇒ từ chối phục vụ. Module này FAIL-SILENT:
// thiếu cấu hình hoặc Telegram sập ⇒ bỏ qua, khách vẫn đăng ký được bình thường.
// Khác nhau vì vai trò khác nhau: captcha BẢO VỆ hệ thống (mở toang là lỗ hổng), còn
// thông báo chỉ BÁO cho một con người (không gửi được thì phiền, nhưng chặn đăng ký của
// khách vì bot Telegram của ta chết thì tệ hơn nhiều). Đây đúng lớp lỗi F9 đã gặp: một
// nhánh phụ trợ không được ném đè lên kết quả chính.
//
// ── VÌ SAO CHỈ CÓ LINK MỞ HỒ SƠ, KHÔNG CÓ NÚT DUYỆT (QĐ-12) ───────────────────────────
// Một URL bấm-là-duyệt là THAO TÁC GHI DIỄN ĐẠT NHƯ CÂU ĐỌC — cùng lớp lỗi với sự cố
// Hyperdrive: ở đó `SELECT ... FROM admin_*()` bị cache vì trông như câu đọc; ở đây
// `GET /duyet?token=` sẽ bị email client, Telegram, phần mềm diệt virus và bộ quét link
// doanh nghiệp TỰ ĐỘNG FETCH, tức tenant được duyệt trước khi người kịp đọc tin. Thêm
// nữa URL chính là chìa khoá duy nhất: chuyển tiếp tin nhắn = trao quyền duyệt.
// Vì vậy tin nhắn chỉ mang deep link mở Cổng Admin (đã sau Cloudflare Access); thao tác
// Duyệt vẫn là POST sau requireSuperAdmin. Nút inline `callback_query` (Telegram KHÔNG
// prefetch) là U34e.

/** Thời gian chờ tối đa khi gọi Telegram. Hiến pháp: mọi lời gọi mạng ra ngoài phải có
 * timeout. Ở đây nó còn quan trọng hơn bình thường vì lời gọi này nằm TRÊN đường trả lời
 * của khách — Telegram treo mà không có timeout thì khách ngồi nhìn nút "Đang gửi…".
 * KHÔNG retry: đây là thông báo, thử lại chỉ nhân đôi độ trễ mà khách phải chịu. */
export const TIMEOUT_MS = 5_000;

export interface ThongTinDangKyMoi {
  tenantId: string;
  tenDoanhNghiep: string;
  mst: string;
  email: string;
}

export type KetQuaThongBao =
  | { daGui: true }
  | { daGui: false; lyDo: "chua_cau_hinh" | "telegram_tu_choi" | "khong_goi_duoc" };

/**
 * Che phần định danh của email, giữ lại đủ để nhận ra người quen.
 * `ketoan@congty.vn` → `ke***n@congty.vn`
 *
 * Tin nhắn Telegram nằm NGOÀI tầm kiểm soát tenant (lưu trên máy chủ Telegram, đồng bộ
 * sang mọi thiết bị đã đăng nhập, không xoá triệt để được) — `security.md` coi đó là nơi
 * không được đặt dữ liệu nhạy cảm. Tên doanh nghiệp và MST thì GIỮ NGUYÊN: chúng là dữ
 * liệu đăng ký kinh doanh công khai, và chính là thứ admin cần để quyết có duyệt hay không.
 * Muốn xem email đầy đủ thì mở Cổng Admin — sau Access, có kiểm soát.
 */
export function cheEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  const ten = email.slice(0, at);
  const mien = email.slice(at);
  // Tên quá ngắn thì che sạch: `an@x.vn` mà hiện `a***n` là lộ gần hết.
  if (ten.length <= 3) return `***${mien}`;
  return `${ten.slice(0, 2)}***${ten.slice(-1)}${mien}`;
}

/** Thoát ký tự cho chế độ HTML của Telegram. KHÔNG dùng MarkdownV2: nó đòi thoát 18 ký
 * tự, và một tên doanh nghiệp có dấu chấm hay gạch ngang là đủ làm Telegram trả 400 —
 * tức thông báo im lặng biến mất đúng lúc cần nhất. */
export function thoatHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Soạn nội dung tin. Tách khỏi phần gửi để test được mà không đụng mạng. */
export function soanTinDangKyMoi(tt: ThongTinDangKyMoi, urlCongAdmin: string): string {
  const link = `${urlCongAdmin.replace(/\/+$/, "")}/tenants`;
  return [
    "🆕 <b>Đăng ký mới đang chờ duyệt</b>",
    "",
    `🏢 ${thoatHtml(tt.tenDoanhNghiep)}`,
    `🔢 MST: <code>${thoatHtml(tt.mst)}</code>`,
    `✉️ ${thoatHtml(cheEmail(tt.email))}`,
    "",
    `<a href="${thoatHtml(link)}">Mở Cổng Admin để duyệt</a>`,
  ].join("\n");
}

export interface CauHinhTelegram {
  botToken: string;
  chatId: string;
  urlCongAdmin: string;
}

/**
 * Đọc cấu hình. Thiếu bất kỳ mảnh nào ⇒ coi như TẮT thông báo (không phải lỗi).
 * Trả về `thieu` để chỗ gọi log ĐÚNG mảnh nào vắng — "thông báo không chạy" mà không biết
 * vì sao là kiểu hỏng tốn nhiều giờ nhất để tìm ra.
 */
export function kiemTraCauHinhTelegram(env: {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  URL_CONG_ADMIN?: string;
}): { ok: true; cauHinh: CauHinhTelegram } | { ok: false; thieu: string[] } {
  // TRIM mọi giá trị. Không phải sạch sẽ hình thức — đây là chốt chặn một lỗi ĐÃ XẢY RA
  // (2026-07-22): `TELEGRAM_CHAT_ID` bị dán dư một khoảng trắng đầu chuỗi, Telegram trả
  // "chat not found", và vì module này FAIL-SILENT nên kênh báo chết CÂM: không lỗi, không
  // 5xx, không gì cả — chỉ là tin nhắn không bao giờ tới. Dán vào `wrangler secret put`
  // càng dễ dính (shell giữ nguyên khoảng trắng, không ai nhìn thấy nó).
  const botToken = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.TELEGRAM_CHAT_ID?.trim();
  const urlCongAdmin = env.URL_CONG_ADMIN?.trim();

  const thieu: string[] = [];
  if (!botToken) thieu.push("TELEGRAM_BOT_TOKEN");
  if (!chatId) thieu.push("TELEGRAM_CHAT_ID");
  if (!urlCongAdmin) thieu.push("URL_CONG_ADMIN");
  if (thieu.length > 0) return { ok: false, thieu };
  return {
    ok: true,
    cauHinh: {
      botToken: botToken as string,
      chatId: chatId as string,
      urlCongAdmin: urlCongAdmin as string,
    },
  };
}

/** Gửi tin. KHÔNG ném — mọi hỏng hóc trả về dưới dạng giá trị để chỗ gọi không cần
 * try/catch và không thể vô tình để lọt một exception lên luồng chính. */
export async function guiTinTelegram(
  cauHinh: CauHinhTelegram,
  noiDung: string,
): Promise<KetQuaThongBao> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${cauHinh.botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: cauHinh.chatId,
        text: noiDung,
        parse_mode: "HTML",
        // Bản xem trước của link Cổng Admin vô dụng (trang sau Access chỉ trả về màn đăng
        // nhập) và làm tin dài ra — tắt đi.
        link_preview_options: { is_disabled: true },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { daGui: false, lyDo: "telegram_tu_choi" };
    return { daGui: true };
  } catch {
    // Mạng hỏng, DNS hỏng, quá hạn timeout — gộp làm một. Chỗ gọi không xử lý khác nhau,
    // và phân biệt chi tiết ở đây chỉ tạo cảm giác chính xác giả.
    return { daGui: false, lyDo: "khong_goi_duoc" };
  }
}

/**
 * Đường vào dùng cho route: đọc cấu hình → soạn → gửi. Luôn trả về giá trị, không bao giờ ném.
 *
 * ⚠️ HIỆN GỌI Ở BƯỚC ĐĂNG KÝ. Theo QĐ-15 nó phải chuyển sang bước SAU KHI KHÁCH XÁC THỰC
 * EMAIL — nhưng trạng thái `cho_xac_thuc_email` chỉ ra đời ở U34c. Tới U34c, chuyển lời gọi
 * này từ `routes/dangKy.ts` sang chỗ xử lý xác thực email; nội dung tin không phải sửa.
 * Trong lúc chờ, thứ chặn spam tới kênh Telegram chỉ có Turnstile.
 */
export async function baoDangKyMoi(
  env: { TELEGRAM_BOT_TOKEN?: string; TELEGRAM_CHAT_ID?: string; URL_CONG_ADMIN?: string },
  tt: ThongTinDangKyMoi,
): Promise<KetQuaThongBao> {
  const ch = kiemTraCauHinhTelegram(env);
  if (!ch.ok) {
    console.warn(`[thongBao] Telegram TẮT — thiếu: ${ch.thieu.join(", ")}`);
    return { daGui: false, lyDo: "chua_cau_hinh" };
  }
  const kq = await guiTinTelegram(ch.cauHinh, soanTinDangKyMoi(tt, ch.cauHinh.urlCongAdmin));
  // Log KHÔNG kèm email/MST: đây là log vận hành, không phải audit. Muốn truy vết đầy đủ
  // thì đã có hàng `dang_ky` trong audit_log, nơi có kiểm soát tenant.
  if (!kq.daGui) console.warn(`[thongBao] không gửi được Telegram: ${kq.lyDo}`);
  return kq;
}

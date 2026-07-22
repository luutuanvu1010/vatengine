// U34b (ADR-0007 §1) — Hiện thực `EmailTransport` bằng Amazon SES API v2.
//
// Hợp đồng lấy từ tài liệu chính thức của AWS (tra 2026-07-22), không từ trí nhớ:
//   POST https://email.<region>.amazonaws.com/v2/email/outbound-emails
//   → 200 { "MessageId": "..." }
// Tên service khi ký SigV4: `ses`.
//
// SMTP không phải lựa chọn: Workers không mở được kết nối SMTP/STARTTLS. HTTPS là đường duy
// nhất — và may là đường tốt hơn (không giữ kết nối, hợp với môi trường phi trạng thái).
import { AwsClient } from "aws4fetch";
import { diaChiNhanDuocThu } from "./kiemTraMien";
import type { EmailTransport, KetQuaGuiThu, LyDoKhongGui, ThuCanGui } from "./types";

/** Hiến pháp: mọi lời gọi mạng ra ngoài phải có timeout. */
export const TIMEOUT_MS = 10_000;

export interface CauHinhSes {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  /** Địa chỉ gửi. PHẢI là danh tính đã xác minh trong SES, nếu không mọi lá thư đều hỏng
   * với `MailFromDomainNotVerified`. */
  emailFrom: string;
}

export function kiemTraCauHinhSes(env: {
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  AWS_REGION?: string;
  EMAIL_FROM?: string;
}): { ok: true; cauHinh: CauHinhSes } | { ok: false; thieu: string[] } {
  // TRIM — bài học 2026-07-22: một khoảng trắng dán lẫn vào `TELEGRAM_CHAT_ID` làm cả kênh
  // báo chết câm. Khoá AWS dán từ Console lại càng dễ dính ký tự thừa.
  const accessKeyId = env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.AWS_SECRET_ACCESS_KEY?.trim();
  const region = env.AWS_REGION?.trim();
  const emailFrom = env.EMAIL_FROM?.trim();

  const thieu: string[] = [];
  if (!accessKeyId) thieu.push("AWS_ACCESS_KEY_ID");
  if (!secretAccessKey) thieu.push("AWS_SECRET_ACCESS_KEY");
  if (!region) thieu.push("AWS_REGION");
  if (!emailFrom) thieu.push("EMAIL_FROM");
  if (thieu.length > 0) return { ok: false, thieu };

  return {
    ok: true,
    cauHinh: {
      accessKeyId: accessKeyId as string,
      secretAccessKey: secretAccessKey as string,
      region: region as string,
      emailFrom: emailFrom as string,
    },
  };
}

/**
 * Ánh xạ lỗi SES sang lý do của ta.
 *
 * Vì sao không gộp hết thành "gửi thất bại": ba trong số này (`cau_hinh_sai`,
 * `tai_khoan_bi_khoa`) nghĩa là TOÀN BỘ đường thư đã chết chứ không phải một lá hỏng. Gộp
 * chúng với lỗi mạng thoáng qua sẽ khiến sự cố nghiêm trọng nhất trôi qua dưới dạng một
 * dòng cảnh báo giống hệt hàng trăm dòng khác.
 *
 * Tên lỗi có thể nằm ở header `x-amzn-errortype` hoặc ở trường `__type` trong thân JSON —
 * đọc cả hai, vì AWS không nhất quán giữa các API.
 */
export function anhXaLoiSes(status: number, tenLoi: string): LyDoKhongGui {
  const t = tenLoi.toLowerCase();
  if (t.includes("accountsuspended") || t.includes("sendingpaused")) return "tai_khoan_bi_khoa";
  if (t.includes("mailfromdomainnotverified")) return "cau_hinh_sai";
  if (t.includes("toomanyrequests") || status === 429) return "qua_nhip";
  if (t.includes("messagerejected")) return "dia_chi_bi_tu_choi";
  // 403 = chữ ký sai hoặc IAM thiếu quyền `ses:SendEmail` — đều là lỗi cấu hình phía ta,
  // và đều làm mọi lá thư hỏng như nhau.
  if (status === 403) return "cau_hinh_sai";
  if (status >= 500) return "khong_goi_duoc";
  return "dia_chi_bi_tu_choi";
}

/** Lấy tên lỗi từ phản hồi, chịu được cả hai kiểu AWS trả về. */
export function layTenLoi(headers: Headers, than: unknown): string {
  const h = headers.get("x-amzn-errortype");
  if (h) return h.split(":")[0] as string;
  if (than && typeof than === "object") {
    const o = than as Record<string, unknown>;
    const t = o.__type ?? o.type ?? o.message;
    if (typeof t === "string") return t;
  }
  return "";
}

export function taoSesTransport(
  cauHinh: CauHinhSes,
  fetchFn: typeof fetch = fetch,
): EmailTransport {
  // Dùng `sign()` rồi TỰ gọi fetch, thay vì `aws.fetch()`.
  //
  // Lý do không phải sở thích: `AwsClient` KHÔNG có tuỳ chọn `fetch` (đã đọc
  // `node_modules/aws4fetch/dist/main.d.ts`). Truyền vào thì nó bị bỏ qua LẶNG LẼ và
  // `aws.fetch()` dùng `fetch` toàn cục — nghĩa là test sẽ gọi mạng THẬT tới AWS mà không
  // báo gì. Tách ra như thế này còn thu hẹp việc của thư viện xuống đúng phần nó giỏi
  // nhất: ký. Phần vận chuyển do ta giữ, nên timeout và tiêm-để-test đều nằm trong tầm.
  const aws = new AwsClient({
    accessKeyId: cauHinh.accessKeyId,
    secretAccessKey: cauHinh.secretAccessKey,
    region: cauHinh.region,
    service: "ses",
  });
  const url = `https://email.${cauHinh.region}.amazonaws.com/v2/email/outbound-emails`;

  return {
    async gui(thu: ThuCanGui): Promise<KetQuaGuiThu> {
      // CHẶN TRƯỚC KHI GỌI SES. Thứ tự này là cả điểm của U34b: mỗi lá thư gửi tới tên miền
      // chết là một bounce, và bounce mới là thứ giết tài khoản — không phải lỗi lúc gửi.
      const mien = await diaChiNhanDuocThu(thu.den, fetchFn);
      if (!mien.nhanDuoc) {
        return { daGui: false, lyDo: "mien_khong_nhan_thu", chiTiet: mien.vi };
      }

      try {
        const daKy = await aws.sign(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            FromEmailAddress: cauHinh.emailFrom,
            Destination: { ToAddresses: [thu.den] },
            Content: {
              Simple: {
                // Charset BẮT BUỘC khai UTF-8: nội dung tiếng Việt có dấu, thiếu nó thì thư
                // tới nơi thành một mớ ký tự hỏng — mà lá thư vẫn "gửi thành công".
                Subject: { Data: thu.tieuDe, Charset: "UTF-8" },
                Body: {
                  Html: { Data: thu.html, Charset: "UTF-8" },
                  Text: { Data: thu.text, Charset: "UTF-8" },
                },
              },
            },
          }),
        });
        const res = await fetchFn(daKy, { signal: AbortSignal.timeout(TIMEOUT_MS) });

        const than = await res.json().catch(() => null);
        if (!res.ok) {
          const ten = layTenLoi(res.headers, than);
          return {
            daGui: false,
            lyDo: anhXaLoiSes(res.status, ten),
            chiTiet: ten || `HTTP ${res.status}`,
          };
        }
        const messageId = (than as { MessageId?: string } | null)?.MessageId ?? "";
        return { daGui: true, messageId };
      } catch {
        return { daGui: false, lyDo: "khong_goi_duoc" };
      }
    },
  };
}

/** Đường vào cho production: đọc env → dựng transport. Thiếu cấu hình thì trả transport
 * luôn từ chối, thay vì `null` — chỗ gọi không phải rẽ nhánh, và nhánh "chưa cấu hình" vẫn
 * được nói ra rõ ràng thay vì biểu hiện thành một lỗi khó hiểu ở tận nơi khác. */
export function taoEmailTransport(env: {
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  AWS_REGION?: string;
  EMAIL_FROM?: string;
}): EmailTransport {
  const ch = kiemTraCauHinhSes(env);
  if (!ch.ok) {
    return {
      async gui() {
        console.warn(`[email] SES TẮT — thiếu: ${ch.thieu.join(", ")}`);
        return { daGui: false, lyDo: "chua_cau_hinh", chiTiet: ch.thieu.join(",") };
      },
    };
  }
  return taoSesTransport(ch.cauHinh);
}

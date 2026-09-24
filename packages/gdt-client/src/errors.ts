// Lỗi của lớp adapter GDT. Xem .claude/rules/gdt-adapter.md.

/**
 * Lỗi nghiệp vụ khi gọi GDT (đăng nhập sai, hết phiên, HTTP lỗi chung).
 *
 * `NO_SOURCE_DOCUMENT` (U37): hóa đơn KHÔNG có hồ sơ gốc để tải. Đây là lỗi **vĩnh
 * viễn** — gọi lại bao nhiêu lần cũng vậy — dù GDT trả mã **500**. Tầng gọi phải
 * dừng, ghi vào báo cáo, KHÔNG retry và KHÔNG đẩy vào DLQ như lỗi hạ tầng.
 */
export class GdtError extends Error {
  constructor(
    message: string,
    readonly code: "SESSION_EXPIRED" | "HTTP_ERROR" | "NO_SOURCE_DOCUMENT" = "HTTP_ERROR",
    /**
     * Mã trạng thái HTTP gốc (nếu lỗi phát sinh từ phản hồi HTTP không thành công).
     * Cho phép tầng gọi phân biệt lỗi (vd 404 "endpoint không áp dụng" với 5xx/4xx
     * lỗi thật) mà không phải parse thông điệp. Undefined nếu lỗi không từ HTTP.
     */
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "GdtError";
  }
}

/** Phản hồi GDT lệch hợp đồng đã biết (gdt-contract-schema.json) — có thể GDT đã đổi API. */
export class GdtContractDriftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GdtContractDriftError";
  }
}

/**
 * Chữ ký WAF của GDT — KIỂM CHỨNG 2026-09-24 (curl thật, sự cố 10/09→24/09/2026):
 * WAF (cookie TS*, F5 BIG-IP) trả HTTP 403 kèm
 * {"status":403,"message":"Hệ thống phát hiện hành vi không hợp lệ. Yêu cầu đã bị chặn."}
 * cho POST /api/security-taxpayer/authenticate thiếu header `request-id`. Đây là chuỗi
 * do GDT kiểm soát; nếu họ đổi chữ ngữ, 403 rơi về GEO_BLOCKED (vẫn báo, chỉ sai nhãn —
 * xem docs/runbooks/gdt-doi-phuong-thuc.md). Nguồn chân lý DUY NHẤT — không so chuỗi ở
 * nơi khác.
 */
export const WAF_BLOCK_SIGNATURE = "hành vi không hợp lệ";

/** Thân phản hồi/thông điệp có mang chữ ký WAF không. So sau chuẩn hoá NFC + chữ thường.
 * Hạ chữ thường CẢ HAI vế: hằng hiện toàn chữ thường, nhưng ai đó sửa nó thành có chữ hoa
 * (vd chép nguyên văn từ phản hồi GDT) sẽ làm phép so hỏng CÂM nếu chỉ hạ vế `text`. */
export function coChuKyWaf(text: string | undefined): boolean {
  if (!text) return false;
  return text
    .normalize("NFC")
    .toLowerCase()
    .includes(WAF_BLOCK_SIGNATURE.normalize("NFC").toLowerCase());
}

/** Lỗi adapter có phải "WAF GDT chặn" không: GdtError, HTTP 403, thông điệp mang chữ ký.
 * Type predicate để chỗ gọi đọc thẳng `err.httpStatus`/`err.message` mà không phải ép kiểu. */
export function isWafBlocked(err: unknown): err is GdtError {
  return err instanceof GdtError && err.httpStatus === 403 && coChuKyWaf(err.message);
}

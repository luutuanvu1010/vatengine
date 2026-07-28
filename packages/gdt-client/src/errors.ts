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

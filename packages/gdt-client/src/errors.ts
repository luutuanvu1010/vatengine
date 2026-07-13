// Lỗi của lớp adapter GDT. Xem .claude/rules/gdt-adapter.md.

/** Lỗi nghiệp vụ khi gọi GDT (đăng nhập sai, hết phiên, HTTP lỗi chung). */
export class GdtError extends Error {
  constructor(
    message: string,
    readonly code: "SESSION_EXPIRED" | "HTTP_ERROR" = "HTTP_ERROR",
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

// Package adapter GDT — điểm cô lập DUY NHẤT mọi phụ thuộc API thuế (ADR-0001).
// U0: mới export interface + hằng số endpoint; hiện thực transport/login/query
// port từ backend/gdt_client.py ở U1–U3.

export { BASE, INVOICE_ENDPOINTS, PUBLIC_PROBE_PATH } from "./endpoints";
export { type GdtTransport, type ProbeResult, type ProbeVerdict, classify } from "./transport";

/** Lỗi nghiệp vụ GDT (ví dụ 401 hết phiên). Không retry bằng credential cũ. */
export class GdtError extends Error {
  constructor(
    message: string,
    readonly code: "SESSION_EXPIRED" | "HTTP_ERROR" | "CONTRACT_DRIFT" = "HTTP_ERROR",
  ) {
    super(message);
    this.name = "GdtError";
  }
}

// Package adapter GDT — điểm cô lập DUY NHẤT mọi phụ thuộc API thuế (ADR-0001).
// U1: getCaptcha() + authenticate(). U2: queryInvoices() (query + phân trang +
// gộp sco + khử trùng). U3: getInvoiceDetail() + mapDetailLines() (chi tiết dòng hàng).

export { authenticate, type AuthCredentials, type AuthResult } from "./auth";
export { getCaptcha, type Captcha } from "./captcha";
export { createDirectCfTransport } from "./directTransport";
export {
  getInvoiceDetail,
  mapDetailLines,
  toDetailRef,
  type InvoiceDetail,
  type InvoiceDetailRef,
  type InvoiceLine,
} from "./detail";
export {
  AUTH_PATH,
  BASE,
  CAPTCHA_PATH,
  DETAIL_ENDPOINTS,
  INVOICE_ENDPOINTS,
  PUBLIC_PROBE_PATH,
} from "./endpoints";
export { GdtContractDriftError, GdtError } from "./errors";
export { type RetryOptions, fetchWithRetry } from "./http";
export {
  buildSearch,
  queryInvoices,
  type InvoiceDirection,
  type InvoiceQueryParams,
  type InvoiceRow,
} from "./query";
export { type GdtTransport, type ProbeResult, type ProbeVerdict, classify } from "./transport";

// Package adapter GDT — điểm cô lập DUY NHẤT mọi phụ thuộc API thuế (ADR-0001).
// U1: hiện thực getCaptcha() + authenticate(); query hóa đơn port ở U2–U3.

export { authenticate, type AuthCredentials, type AuthResult } from "./auth";
export { getCaptcha, type Captcha } from "./captcha";
export { AUTH_PATH, BASE, CAPTCHA_PATH, INVOICE_ENDPOINTS, PUBLIC_PROBE_PATH } from "./endpoints";
export { GdtContractDriftError, GdtError } from "./errors";
export { type RetryOptions, fetchWithRetry } from "./http";
export { type GdtTransport, type ProbeResult, type ProbeVerdict, classify } from "./transport";

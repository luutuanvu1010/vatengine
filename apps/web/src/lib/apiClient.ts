// API client gõ kiểu — NƠI DUY NHẤT gọi apps/api (U15-plan §4A). JWT giữ TRONG BỘ NHỚ
// (ADR-0003 #3 — không localStorage, chống XSS-exfil). Ánh xạ mã lỗi → hành vi UI:
// 401 (hết hạn) → onUnauthorized (về đăng nhập); 403 (sai vai) / 400 / 404 → ApiError
// mang status để UI xử. KHÔNG log token. tenant_id KHÔNG bao giờ gửi từ client (từ token).
import type {
  BackfillProgress,
  CaptchaResponse,
  ConvertResult,
  ExportFormat,
  ExportResult,
  InvoiceDetailResponse,
  InvoiceFilter,
  InvoiceListResult,
  InvoiceSummary,
  MeResponse,
  Page,
  ReconcileReport,
  TaxAccountView,
  TaxLoginResult,
} from "../types/api";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(status: number, code?: string) {
    super(`API ${status}${code ? ` (${code})` : ""}`);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

// --- Token in-memory (không bền qua reload — đăng nhập lại; ADR-0003 #3) -------------
let accessToken: string | null = null;
export function setToken(t: string): void {
  accessToken = t;
}
export function clearToken(): void {
  accessToken = null;
}
export function getToken(): string | null {
  return accessToken;
}

// --- Cấu hình hành vi (callback 401) -----------------------------------------------
interface ApiConfig {
  onUnauthorized?: (() => void) | undefined;
}
let config: ApiConfig = {};
export function configureApi(next: ApiConfig): void {
  config = next;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

interface RequestOpts {
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  auth?: boolean;
}

async function request<T>(method: string, path: string, opts: RequestOpts = {}): Promise<T> {
  const { query, body, auth = true } = opts;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}${buildQuery(query ?? {})}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // Lỗi mạng (offline/timeout) → status 0 để UI báo "không kết nối được".
    throw new ApiError(0, "network_error");
  }

  if (!res.ok) {
    let code: string | undefined;
    try {
      const j = (await res.json()) as { error?: string };
      code = j.error;
    } catch {
      /* body không phải JSON — bỏ qua */
    }
    if (res.status === 401) config.onUnauthorized?.();
    throw new ApiError(res.status, code);
  }
  return (await res.json()) as T;
}

async function requestBlob(path: string): Promise<Blob> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { headers });
  } catch {
    throw new ApiError(0, "network_error");
  }
  if (!res.ok) {
    if (res.status === 401) config.onUnauthorized?.();
    throw new ApiError(res.status);
  }
  return res.blob();
}

function filterQuery(f: InvoiceFilter, p?: Page): Record<string, string | number | undefined> {
  return {
    chieu: f.chieu,
    nguon: f.nguon,
    tuNgay: f.tuNgay,
    denNgay: f.denNgay,
    ttxly: f.ttxly,
    tthai: f.tthai,
    nbmst: f.nbmst,
    nmmst: f.nmmst,
    limit: p?.limit,
    offset: p?.offset,
  };
}

// --- Bề mặt gõ kiểu (đúng hợp đồng apps/api) ---------------------------------------
export const api = {
  // Auth nội bộ (công khai — không Authorization).
  login(email: string, password: string): Promise<{ token: string }> {
    return request("POST", "/auth/login", { body: { email, password }, auth: false });
  },

  // Tra cứu (3 vai).
  getInvoices(filter: InvoiceFilter, page: Page): Promise<InvoiceListResult> {
    return request("GET", "/invoices", { query: filterQuery(filter, page) });
  },
  getSummary(filter: InvoiceFilter): Promise<InvoiceSummary> {
    return request("GET", "/invoices/summary", { query: filterQuery(filter) });
  },
  getInvoice(id: string): Promise<InvoiceDetailResponse> {
    return request("GET", `/invoices/${id}`);
  },
  getReconcile(filter: InvoiceFilter): Promise<ReconcileReport> {
    return request("GET", "/reconcile", { query: filterQuery(filter) });
  },

  // Kết xuất (ke_toan_truong + quan_tri).
  createExport(format: ExportFormat, filter: InvoiceFilter): Promise<ExportResult> {
    return request("POST", "/exports", { query: { format, ...filterQuery(filter) } });
  },
  convertExport(
    profile: string,
    format: ExportFormat,
    filter: InvoiceFilter,
  ): Promise<ConvertResult> {
    return request("POST", "/exports/convert", {
      query: { profile, format, ...filterQuery(filter) },
    });
  },
  downloadExport(id: string): Promise<Blob> {
    return requestBlob(`/exports/${id}`);
  },

  // A1 — hồ sơ tenant + vai.
  getMe(): Promise<MeResponse> {
    return request("GET", "/me");
  },
  patchMe(body: { ten?: string; ghiChu?: string | null }): Promise<MeResponse> {
    return request("PATCH", "/me", { body });
  },

  // A2 — đọc trạng thái tài khoản thuế + S5 (U14).
  listTaxAccounts(): Promise<TaxAccountView[]> {
    return request("GET", "/tax-accounts");
  },
  getTaxAccount(id: string): Promise<TaxAccountView> {
    return request("GET", `/tax-accounts/${id}`);
  },
  // U23-D2: tài khoản chính KHÔNG cần username (backend auto = MST gốc). `username` chỉ dùng
  // cho tài khoản con (khi module bật). Đăng ký chính: gọi không tham số.
  registerTaxAccount(
    body: { username?: string; loai?: "chinh" | "con" } = {},
  ): Promise<{ id: string }> {
    return request("POST", "/tax-accounts", { body });
  },
  // U23-D3: ngắt kết nối — xóa token đã lưu (giữ bản ghi MST).
  disconnectTaxAccount(id: string): Promise<{ ok: true }> {
    return request("POST", `/tax-accounts/${id}/disconnect`);
  },
  authorizeTaxAccount(id: string): Promise<{ ok: true }> {
    return request("POST", `/tax-accounts/${id}/authorize`);
  },
  getCaptcha(id: string): Promise<CaptchaResponse> {
    return request("GET", `/tax-accounts/${id}/captcha`);
  },
  loginTaxAccount(
    id: string,
    password: string,
    ckey: string,
    cvalue: string,
  ): Promise<TaxLoginResult> {
    return request("POST", `/tax-accounts/${id}/login`, { body: { password, ckey, cvalue } });
  },
  // "Đồng bộ ngay": đẩy job kéo hóa đơn (kỳ hiện tại) vào hàng đợi nền.
  syncTaxAccount(id: string): Promise<{ enqueued: number; period: string }> {
    return request("POST", `/tax-accounts/${id}/sync`);
  },
  // U22 — đồng bộ theo KHOẢNG đã chọn: enqueue các THÁNG còn thiếu trong khoảng.
  backfillTaxAccount(
    id: string,
    range: { tuNgay: string; denNgay: string },
  ): Promise<{ backfillId: string | null; thangCanLay: string[]; tongSoThang: number }> {
    return request("POST", `/tax-accounts/${id}/backfill`, { body: range });
  },
  // U26 — đổ dòng hàng cho hóa đơn ĐANG THIẾU (chạy nền; conLai>0 → gọi lại).
  backfillInvoiceLines(
    id: string,
  ): Promise<{ soHoaDonThieu: number; soDaXepHang: number; conLai: number }> {
    return request("POST", `/tax-accounts/${id}/backfill-lines`);
  },
  // U22 B7 — theo dõi tiến độ backfill header theo tháng (poll).
  getBackfill(backfillId: string): Promise<BackfillProgress> {
    return request("GET", `/backfill/${backfillId}`);
  },
};

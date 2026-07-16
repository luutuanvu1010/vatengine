// Kiểu hợp đồng API — PHẢN CHIẾU JSON trên đường truyền (nguồn: apps/api routes +
// packages/*). LƯU Ý: qua JSON, cột `numeric` Postgres → CHUỖI; `timestamp` → ISO
// string. Vì vậy tiền là `string|null` và ngày là `string|null` (KHÁC HoaDonRow phía
// server dùng Date/number). Đây là NƠI DUY NHẤT cập nhật khi backend đổi shape
// (U15-plan §rủi ro). KHÔNG bịa trường ngoài hợp đồng.

export type Role = "ke_toan" | "ke_toan_truong" | "quan_tri";
export type Chieu = "purchase" | "sold";
export type Nguon = "normal" | "sco";

/** Một hàng hóa đơn (header) như apps/api trả (GET /invoices, /invoices/:id). */
export interface InvoiceRow {
  id: string;
  tenantId: string;
  nbmst: string;
  nbten: string | null;
  nmmst: string | null;
  nmten: string | null;
  khmshdon: string;
  khhdon: string;
  shdon: string;
  tdlap: string; // ISO UTC
  ncnhat: string | null;
  tgtcthue: string | null;
  tgtthue: string | null;
  tgtttbso: string | null;
  ttcktmai: string | null;
  dvtte: string | null;
  tgia: string | null;
  ttxly: number | null;
  tthai: number | null;
  chieu: Chieu;
  nguon: Nguon;
  rawJson: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceListResult {
  rows: InvoiceRow[];
  total: number;
  limit: number;
  offset: number;
}

/** Một dòng hàng của hóa đơn (dong_hang_hoa). Qua JSON: numeric → chuỗi. Thuế suất
 * giữ KÉP: `ltsuat` chuỗi hiển thị ("8%") + `tsuat` số dạng chuỗi. */
export interface InvoiceLineRow {
  id: string;
  hoaDonId: string;
  tenantId: string;
  stt: number | null;
  ten: string | null;
  dvtinh: string | null;
  sluong: string | null;
  dgia: string | null;
  thtien: string | null;
  ltsuat: string | null;
  tsuat: string | null;
  tsuatTien: string | null;
  rawJson: unknown;
}

/** GET /invoices/:id — header + mảng dòng hàng (ĐV4). */
export type InvoiceDetailResponse = InvoiceRow & { dongHangHoa: InvoiceLineRow[] };

export interface MoneyTotals {
  count: number;
  tongTcthue: string | null;
  tongTthue: string | null;
  tongTtbso: string | null;
}
export interface ChieuSummary extends MoneyTotals {
  chieu: string;
}
export interface InvoiceSummary {
  byChieu: ChieuSummary[];
  total: MoneyTotals;
}

// Đối chiếu — mirror packages/reconcile/src/types.ts (không Date, an toàn JSON).
export interface TaxMismatchFinding {
  kind: "lech_thue";
  hoaDonId: string;
  shdon: string;
  tgtcthue: string | null;
  ttcktmai: string | null;
  tgtthue: string | null;
  tgtttbso: string | null;
  lech: string;
}
export interface SequenceGapFinding {
  kind: "thieu_so_dau_ra";
  nbmst: string;
  khhdon: string;
  shdonThieu: number;
}
export interface StatusFinding {
  kind: "huy" | "thay_the";
  hoaDonId: string;
  shdon: string;
  tthai: number | null;
  ttxly: number | null;
}
export type Finding = TaxMismatchFinding | SequenceGapFinding | StatusFinding;
export interface ReconcileSummary {
  lechThue: number;
  thieuSoDauRa: number;
  huy: number;
  thayThe: number;
}
export interface ReconcileReport {
  findings: Finding[];
  summary: ReconcileSummary;
}

/** Bộ lọc chuẩn — mirror packages/query/src/filters.ts (chỉ các trường backend chấp nhận). */
export interface InvoiceFilter {
  chieu?: Chieu;
  nguon?: Nguon;
  tuNgay?: string; // YYYY-MM-DD
  denNgay?: string;
  ttxly?: number;
  tthai?: number;
  nbmst?: string;
  nmmst?: string;
}
export interface Page {
  limit?: number; // ≤200
  offset?: number;
}

export type ExportFormat = "xlsx" | "csv";
export interface ExportResult {
  id: string;
  key: string;
  url: string;
}
export interface ConvertResult extends ExportResult {
  profile: string;
}

// A1 — GET /me (đơn vị backend bổ sung; xem U15-buoc4 §4). Chỉ hồ sơ tenant + vai.
// Email KHÔNG cần từ server: client biết email từ lúc đăng nhập (S0).
export interface MeResponse {
  ten: string;
  mst: string;
  goiDichVu: string | null;
  banQuyen: string;
  ghiChu: string | null;
  role: Role;
}

// A2 — GET /tax-accounts (đơn vị backend bổ sung). KHÔNG lộ token/secret; username che.
export interface TaxAccountView {
  id: string;
  username: string; // MST đầy đủ (của chính tenant); UI tự che khi hiển thị (maskMst)
  loai: "chinh" | "con";
  uyQuyenLuc: string | null;
  tokenHetHan: string | null;
  ngayTao: string;
}

// S5 — captcha + login GDT (endpoint U14 đã có).
export interface CaptchaResponse {
  key: string;
  content: string; // SVG thô
}
export interface TaxLoginResult {
  ok: true;
  tokenHetHan: string;
}

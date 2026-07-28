// Kiểu hợp đồng API — PHẢN CHIẾU JSON trên đường truyền (nguồn: apps/api routes +// packages/*). LƯU Ý: qua JSON, cột `numeric` Postgres → CHUỖI; `timestamp` → ISO
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

/** Hàng DANH SÁCH (GET /invoices) = header + tóm tắt dòng hàng (2026-07-17, thay
 * U23-A). GET /invoices/:id KHÔNG có 3 trường này (chi tiết trả mảng dongHangHoa). */
export interface InvoiceListRow extends InvoiceRow {
  /** Tên hàng dòng đầu (stt nhỏ nhất); null khi chưa đồng bộ chi tiết. */
  tenHangDau: string | null;
  /** Mọi mặt hàng kèm số lượng + đơn vị CỦA CHÍNH NÓ, theo thứ tự stt (nghiệm thu
   * 2026-07-20). Một cấu trúc chung để tên và số lượng không thể lệch nhau. */
  hangHoa: { ten: string | null; sluong: string | null; dvtinh: string | null }[];
  soDongHang: number;
}

export interface InvoiceListResult {
  rows: InvoiceListRow[];
  total: number;
  limit: number;
  offset: number;
}

/** U35 — một lần thay đổi trạng thái hóa đơn (GET /invoices/changes), kèm định danh hóa
 * đơn qua join server-side (panel không cần gọi thêm API). */
export interface InvoiceChangeRow {
  id: string;
  hoaDonId: string;
  truong: "ttxly" | "tthai";
  giaTriCu: number | null;
  giaTriMoi: number | null;
  lanDongBoId: string | null;
  phatHienLuc: string; // ISO UTC
  daDoc: boolean;
  khmshdon: string;
  khhdon: string;
  shdon: string;
  nbten: string | null;
}

export interface InvoiceChangeListResult {
  rows: InvoiceChangeRow[];
  total: number;
  limit: number;
  offset: number;
  /** Số chưa đọc CỦA TENANT — nguồn cho badge, không phụ thuộc filter hiện tại. */
  unreadCount: number;
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

// Gương của `packages/query/src/summarize.ts` — sửa một bên phải sửa bên kia.
//
// U36 — mọi trường MỚI khai `?` (tùy chọn) có chủ đích: `queryKey: ["invoices-summary", …]`
// KHÔNG đổi sau khi deploy, nên một tab đang mở vẫn giữ dữ liệu shape CŨ trong cache tới
// lần refetch kế. Giao diện phải chịu được `undefined`, không chỉ mảng rỗng.
export interface MoneyTotals {
  /** Hóa đơn khớp bộ lọc — QĐ-7: KHÔNG trừ mã 4 (trừ đi sẽ kích hoạt tự đồng bộ GDT). */
  count: number;
  countTinhTong?: number;
  soLoaiKhoiTong?: number;
  tongTcthue: string | null; // đã loại hóa đơn bị thay thế
  tongTthue: string | null;
  tongTtbso: string | null;
}
export interface ChieuSummary extends MoneyTotals {
  chieu: string;
  soDuocDieuChinh?: number;
  soHdThayThe?: number;
  soHdDieuChinh?: number;
  soMaLa?: number;
  /** Số DƯƠNG (QĐ-8) — giao diện tự thêm dấu trừ ASCII. */
  thueDaLoai?: string;
  ttbsoDaLoai?: string;
  thueThayTheDieuChinh?: string;
  ttbsoThayTheDieuChinh?: string;
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
  // U31 — lọc theo cột (văn bản "chứa", không phân biệt hoa thường).
  shdon?: string;
  nbten?: string;
  nmten?: string;
  dvtte?: string;
  ttbsoTu?: string;
  ttbsoDen?: string;
}

/** U31 — sắp xếp theo cột. `sortBy` phải khớp ALLOWLIST của server (packages/query). */
export type SortBy =
  | "tdlap"
  | "shdon"
  | "nbten"
  | "nmten"
  | "tgtcthue"
  | "tgtthue"
  | "tgtttbso"
  | "dvtte"
  | "ttxly"
  | "tthai"
  | "chieu"
  | "nguon";
export interface InvoiceSort {
  sortBy?: SortBy;
  sortDir?: "asc" | "desc";
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
  // U17a (QĐ-7) — nhãn tiếng Việt của gói; `goiDichVu` nay là MÃ ('free').
  goiDichVuTen: string | null;
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

// Minh bạch tác vụ nền (2026-07-27) — mirror apps/api GET /tax-accounts/:id/sync-status:
// chuỗi kéo delta đang chạy nền, để UI nói rõ "có x tác vụ đang chạy, bấm thêm không tạo trùng".
export interface SyncStatusView {
  soTacVu: number;
  thang: { period: string; chieu: string; batDau: string }[];
}

// U22 B7 — theo dõi tiến độ backfill header theo tháng (mirror apps/api GET /backfill/:id).
export type BackfillMonthStatus = "cho" | "dang_chay" | "xong" | "du" | "loi";
export interface BackfillProgress {
  backfillId: string;
  thang: { period: string; trangThai: BackfillMonthStatus }[];
  soXong: number;
  tongSoThang: number;
  trangThaiTong: "dang_chay" | "hoan_thanh" | "co_loi" | "can_dang_nhap_lai";
}

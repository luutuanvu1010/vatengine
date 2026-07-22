// U-K1 — Registry miền hoá đơn (nguồn sự thật duy nhất). Bám Phần C của
// docs/design/CHUAN-giao-dien-va-anh-xa-du-lieu.md: mọi trường hoá đơn khai MỘT LẦN ở đây;
// bảng, thanh lọc, allowlist sắp xếp và file xuất đều DẪN XUẤT từ đây thay vì tự khai lại.
//
// U-K1 chỉ dùng phần dẫn xuất cho file xuất (`tren.fileXuat` → EXPORT_COLUMNS). `locDuoc`/
// `sapDuoc`/`enum`/`canh` khai sẵn kiểu (chưa gán giá trị thật) cho U-K2 — một lần một đơn vị.

/** Kiểu trình bày của một trường — gộp/kế thừa `ColumnKind` cũ của @vat/export. */
export type InvoiceFieldKind = "text" | "ngay" | "tien" | "ma" | "enum" | "list";

export interface InvoiceField {
  /** Mã kỹ thuật — khớp cột DB + `ExportRow`/`api.ts`. */
  key: string;
  /** Nhãn VN DUY NHẤT — hết cảnh "Tổng TT" vs "Tổng thanh toán". */
  nhan: string;
  nhanNgan?: string;
  kieu: InvoiceFieldKind;
  canh?: "trai" | "phai";

  // Khai sẵn kiểu cho U-K2 (bảng/thanh lọc/allowlist) — CHƯA dùng ở U-K1.
  locDuoc?: false | "text" | "range" | "enum" | "ngay";
  sapDuoc?: boolean;
  enum?: ReadonlyArray<readonly [ma: string, nhan: string]>;

  /** Xuất hiện ở đâu — thay cho việc khai 4 nơi. */
  tren: {
    bang?: boolean;
    fileXuat?: boolean;
    chiTiet?: boolean;
  };
}

// Tái tạo CHÍNH XÁC `EXPORT_COLUMNS` hiện có ở packages/export/src/columns.ts (đúng key,
// đúng nhãn, đúng thứ tự, kind cũ ↔ kieu mới) — đầu ra file xuất phải bất biến (U-K1 §Thiết
// kế Registry). KHÔNG "cải thiện" nhãn ở đơn vị này (nguyên tắc bằng chứng).
export const INVOICE_FIELDS: readonly InvoiceField[] = [
  { key: "tdlap", nhan: "Ngày lập", kieu: "ngay", tren: { fileXuat: true } },
  { key: "ncnhat", nhan: "Ngày cập nhật", kieu: "ngay", tren: { fileXuat: true } },
  { key: "khmshdon", nhan: "Ký hiệu mẫu số", kieu: "text", tren: { fileXuat: true } },
  { key: "khhdon", nhan: "Ký hiệu HĐ", kieu: "text", tren: { fileXuat: true } },
  { key: "shdon", nhan: "Số HĐ", kieu: "text", tren: { fileXuat: true } },
  { key: "nbmst", nhan: "MST người bán", kieu: "text", tren: { fileXuat: true } },
  { key: "nbten", nhan: "Tên người bán", kieu: "text", tren: { fileXuat: true } },
  { key: "nmmst", nhan: "MST người mua", kieu: "text", tren: { fileXuat: true } },
  { key: "nmten", nhan: "Tên người mua", kieu: "text", tren: { fileXuat: true } },
  {
    key: "hangHoa",
    nhan: "Hàng hóa, dịch vụ (số lượng)",
    kieu: "list",
    tren: { fileXuat: true },
  },
  { key: "tgtcthue", nhan: "Tiền chưa thuế", kieu: "tien", canh: "phai", tren: { fileXuat: true } },
  { key: "ttcktmai", nhan: "Chiết khấu", kieu: "tien", canh: "phai", tren: { fileXuat: true } },
  { key: "tgtthue", nhan: "Tiền thuế", kieu: "tien", canh: "phai", tren: { fileXuat: true } },
  {
    key: "tgtttbso",
    nhan: "Tổng thanh toán",
    kieu: "tien",
    canh: "phai",
    tren: { fileXuat: true },
  },
  { key: "dvtte", nhan: "Tiền tệ", kieu: "text", tren: { fileXuat: true } },
  { key: "ttxly", nhan: "Trạng thái xử lý (mã)", kieu: "ma", tren: { fileXuat: true } },
  { key: "tthai", nhan: "Trạng thái HĐ (mã)", kieu: "ma", tren: { fileXuat: true } },
  { key: "chieu", nhan: "Chiều", kieu: "text", tren: { fileXuat: true } },
  { key: "nguon", nhan: "Nguồn", kieu: "text", tren: { fileXuat: true } },
];

/** Trường vào file xuất, ĐÚNG thứ tự khai báo (thứ tự nghiệp vụ — không nối đuôi). */
export function fieldsForExport(): InvoiceField[] {
  return INVOICE_FIELDS.filter((f) => f.tren.fileXuat === true);
}

/** Trường lên bảng (U-K2 sẽ dùng — khai sẵn để không phải sửa chữ ký hàm sau này). */
export function fieldsForTable(): InvoiceField[] {
  return INVOICE_FIELDS.filter((f) => f.tren.bang === true);
}

/** Khóa vào allowlist ORDER BY (U-K2 sẽ dùng). Registry chỉ SINH RA allowlist, không thay
 * Zod `invoiceFilterSchema` phía server. */
export function sortableKeys(): string[] {
  return INVOICE_FIELDS.filter((f) => f.sapDuoc === true).map((f) => f.key);
}

/** Nhãn VN của một trường theo `key`. Ném lỗi khi trường chưa khai báo — thà đỏ ngay còn
 * hơn hiện `undefined` im lặng lên màn hoặc file xuất. */
export function labelOf(key: string): string {
  const f = INVOICE_FIELDS.find((x) => x.key === key);
  if (!f) throw new Error(`INVOICE_FIELDS: chưa khai báo trường '${key}'`);
  return f.nhan;
}

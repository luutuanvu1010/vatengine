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
  /** Nhãn rút gọn cho cột hẹp. Bảng hiện `nhanNgan ?? nhan`; file xuất LUÔN dùng `nhan`.
   * Hai chữ khác nhau nhưng CÙNG một khai báo ⇒ không thể trôi khỏi nhau. */
  nhanNgan?: string;
  kieu: InvoiceFieldKind;
  canh?: "trai" | "phai";

  /** Sinh ô lọc kiểu gì trên bảng. `false`/bỏ trống = không lọc được. */
  locDuoc?: false | "text" | "range" | "enum" | "ngay";
  /** Tên tham số lọc gửi lên server khi KHÁC `key` (vd tổng thanh toán lọc bằng `ttbso`
   * → cặp `ttbsoTu`/`ttbsoDen` trong Zod). Bỏ trống ⇒ dùng `key`. */
  khoaLoc?: string;
  /** Có vào allowlist ORDER BY phía server không (chống SQL injection — nguồn của
   * `SORT_COLUMNS`). RỘNG HƠN những gì bảng phơi ra: xem `sapTrenBang`. */
  sapDuoc?: boolean;
  /** Bảng có phơi menu SẮP cho cột này không. Tách khỏi `sapDuoc` vì server sắp được 12
   * cột trong khi bảng chỉ mời sắp 9 — khoảng lệch có sẵn từ U31, nay thành dữ liệu
   * thấy được thay vì ẩn trong JSX. Bật thêm là quyết định sản phẩm, không phải refactor. */
  sapTrenBang?: boolean;
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
// THỨ TỰ KHAI BÁO = thứ tự FILE XUẤT (nghiệp vụ, đã chốt U29). Thứ tự BẢNG là hình chiếu
// của cùng danh sách này qua `tren.bang` — trùng khớp vì bảng và file cùng trật tự nghiệp
// vụ; trường chỉ-bảng (`soLuong`) chèn đúng chỗ nó đứng trên bảng.
//
// Enum chiều/nguồn: giá trị do SERVER định nghĩa (INVOICE_DIRECTIONS/INVOICE_SOURCES trong
// @vat/query) — chép nhãn VN sang đây là để TRÌNH BÀY, không phải nguồn giá trị hợp lệ.
export const INVOICE_FIELDS: readonly InvoiceField[] = [
  {
    key: "tdlap",
    nhan: "Ngày lập",
    kieu: "ngay",
    sapDuoc: true,
    sapTrenBang: true,
    tren: { fileXuat: true, bang: true },
  },
  { key: "ncnhat", nhan: "Ngày cập nhật", kieu: "ngay", tren: { fileXuat: true } },
  { key: "khmshdon", nhan: "Ký hiệu mẫu số", kieu: "text", tren: { fileXuat: true } },
  { key: "khhdon", nhan: "Ký hiệu HĐ", kieu: "text", tren: { fileXuat: true } },
  {
    key: "shdon",
    nhan: "Số HĐ",
    // Ô bảng gộp số HĐ (link) + ký hiệu mẫu số/ký hiệu HĐ ở dòng phụ → nhãn nói cả hai.
    nhanNgan: "Ký hiệu · Số HĐ",
    kieu: "text",
    locDuoc: "text",
    sapDuoc: true,
    sapTrenBang: true,
    tren: { fileXuat: true, bang: true },
  },
  { key: "nbmst", nhan: "MST người bán", kieu: "text", tren: { fileXuat: true } },
  {
    key: "nbten",
    nhan: "Tên người bán",
    nhanNgan: "Người bán",
    kieu: "text",
    locDuoc: "text",
    sapDuoc: true,
    sapTrenBang: true,
    tren: { fileXuat: true, bang: true },
  },
  { key: "nmmst", nhan: "MST người mua", kieu: "text", tren: { fileXuat: true } },
  {
    key: "nmten",
    nhan: "Tên người mua",
    nhanNgan: "Người mua",
    kieu: "text",
    locDuoc: "text",
    sapDuoc: true,
    sapTrenBang: true,
    tren: { fileXuat: true, bang: true },
  },
  {
    key: "hangHoa",
    nhan: "Hàng hóa, dịch vụ (số lượng)",
    // Bảng có cột "Số lượng" riêng đứng cạnh nên nhãn bảng không cần đuôi "(số lượng)".
    nhanNgan: "Hàng hóa, dịch vụ",
    kieu: "list",
    tren: { fileXuat: true, bang: true },
  },
  // CHỈ trên bảng: số lượng từng mặt hàng hiện thành danh sách ngang hàng với cột tên hàng.
  // Không vào file xuất — file đã có cột ĐVT/Số lượng riêng ở sheet phẳng dòng hàng.
  // Là sub-select (lineSummarySelect) nên KHÔNG lọc/sắp được: cần HAVING hoặc bảng dẫn xuất.
  { key: "soLuong", nhan: "Số lượng", kieu: "list", canh: "phai", tren: { bang: true } },
  {
    key: "tgtcthue",
    nhan: "Tiền chưa thuế",
    nhanNgan: "Chưa thuế",
    kieu: "tien",
    canh: "phai",
    sapDuoc: true,
    sapTrenBang: true,
    tren: { fileXuat: true, bang: true },
  },
  { key: "ttcktmai", nhan: "Chiết khấu", kieu: "tien", canh: "phai", tren: { fileXuat: true } },
  {
    key: "tgtthue",
    nhan: "Tiền thuế",
    kieu: "tien",
    canh: "phai",
    sapDuoc: true,
    sapTrenBang: true,
    tren: { fileXuat: true, bang: true },
  },
  {
    key: "tgtttbso",
    nhan: "Tổng thanh toán",
    nhanNgan: "Tổng TT",
    kieu: "tien",
    canh: "phai",
    locDuoc: "range",
    // Lọc bằng cặp `ttbsoTu`/`ttbsoDen` (Zod), KHÁC khóa sắp `tgtttbso`.
    khoaLoc: "ttbso",
    sapDuoc: true,
    sapTrenBang: true,
    tren: { fileXuat: true, bang: true },
  },
  {
    key: "dvtte",
    nhan: "Tiền tệ",
    kieu: "text",
    sapDuoc: true,
    tren: { fileXuat: true, bang: true },
  },
  {
    key: "ttxly",
    nhan: "Trạng thái xử lý (mã)",
    // Ô bảng hiện CHIP nhãn qua statusLabels.ts (chỉ nhãn mã đã kiểm chứng), không hiện mã
    // trần như file xuất → nhãn cột bỏ đuôi "(mã)".
    nhanNgan: "TT xử lý",
    kieu: "ma",
    sapDuoc: true,
    tren: { fileXuat: true, bang: true },
  },
  {
    key: "tthai",
    nhan: "Trạng thái HĐ (mã)",
    nhanNgan: "TT hóa đơn",
    kieu: "ma",
    sapDuoc: true,
    tren: { fileXuat: true, bang: true },
  },
  {
    key: "chieu",
    nhan: "Chiều",
    kieu: "enum",
    locDuoc: "enum",
    enum: [
      ["purchase", "Mua vào"],
      ["sold", "Bán ra"],
    ],
    sapDuoc: true,
    sapTrenBang: true,
    tren: { fileXuat: true, bang: true },
  },
  {
    key: "nguon",
    nhan: "Nguồn",
    kieu: "enum",
    locDuoc: "enum",
    enum: [
      ["normal", "Hóa đơn điện tử thường"],
      ["sco", "Máy tính tiền"],
    ],
    sapDuoc: true,
    sapTrenBang: true,
    tren: { fileXuat: true, bang: true },
  },
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

// U-K1 — Registry miền hoá đơn: nguồn sự thật duy nhất cho trường hoá đơn (Phần C của
// docs/design/CHUAN-giao-dien-va-anh-xa-du-lieu.md). Test này khoá danh sách trường xuất
// file (`tren.fileXuat`) TRÙNG KHỚP với `EXPORT_COLUMNS` hiện có ở packages/export trước
// khi refactor — đầu ra file xuất phải bất biến (tiêu chí nghiệm thu U-K1 #1, #2).
import { describe, expect, it } from "vitest";
import {
  INVOICE_FIELDS,
  fieldsForExport,
  fieldsForTable,
  labelOf,
  sortableKeys,
} from "../../src/registry";

describe("INVOICE_FIELDS — Registry miền hoá đơn", () => {
  it("mọi field có key, nhan không rỗng", () => {
    for (const f of INVOICE_FIELDS) {
      expect(f.key.length).toBeGreaterThan(0);
      expect(f.nhan.length).toBeGreaterThan(0);
    }
  });

  it("key duy nhất, không trùng", () => {
    const keys = INVOICE_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("fieldsForExport() — đúng danh sách + thứ tự EXPORT_COLUMNS hiện có", () => {
  it("đúng 19 trường, đúng thứ tự nghiệp vụ đã chốt", () => {
    expect(fieldsForExport().map((f) => f.key)).toEqual([
      "tdlap",
      "ncnhat",
      "khmshdon",
      "khhdon",
      "shdon",
      "nbmst",
      "nbten",
      "nmmst",
      "nmten",
      "hangHoa",
      "tgtcthue",
      "ttcktmai",
      "tgtthue",
      "tgtttbso",
      "dvtte",
      "ttxly",
      "tthai",
      "chieu",
      "nguon",
    ]);
  });

  it("KHÔNG có tgia (M3 — chưa kiểm chứng dvtte≠VND)", () => {
    expect(fieldsForExport().some((f) => f.key === "tgia")).toBe(false);
  });

  it("nhãn khớp EXPORT_COLUMNS hiện có (nguồn sự thật duy nhất)", () => {
    expect(labelOf("tdlap")).toBe("Ngày lập");
    expect(labelOf("ncnhat")).toBe("Ngày cập nhật");
    expect(labelOf("khmshdon")).toBe("Ký hiệu mẫu số");
    expect(labelOf("khhdon")).toBe("Ký hiệu HĐ");
    expect(labelOf("shdon")).toBe("Số HĐ");
    expect(labelOf("nbmst")).toBe("MST người bán");
    expect(labelOf("nbten")).toBe("Tên người bán");
    expect(labelOf("nmmst")).toBe("MST người mua");
    expect(labelOf("nmten")).toBe("Tên người mua");
    expect(labelOf("hangHoa")).toBe("Hàng hóa, dịch vụ (số lượng)");
    expect(labelOf("tgtcthue")).toBe("Tiền chưa thuế");
    expect(labelOf("ttcktmai")).toBe("Chiết khấu");
    expect(labelOf("tgtthue")).toBe("Tiền thuế");
    expect(labelOf("tgtttbso")).toBe("Tổng thanh toán");
    expect(labelOf("dvtte")).toBe("Tiền tệ");
    expect(labelOf("ttxly")).toBe("Trạng thái xử lý (mã)");
    expect(labelOf("tthai")).toBe("Trạng thái HĐ (mã)");
    expect(labelOf("chieu")).toBe("Chiều");
    expect(labelOf("nguon")).toBe("Nguồn");
  });

  it("kieu khớp kind hiện có: tiền → 'tien', ngày → 'ngay', mã trạng thái → 'ma'", () => {
    const byKey = (k: string) => fieldsForExport().find((f) => f.key === k);
    expect(byKey("tgtcthue")?.kieu).toBe("tien");
    expect(byKey("ttcktmai")?.kieu).toBe("tien");
    expect(byKey("tgtthue")?.kieu).toBe("tien");
    expect(byKey("tgtttbso")?.kieu).toBe("tien");
    expect(byKey("tdlap")?.kieu).toBe("ngay");
    expect(byKey("ncnhat")?.kieu).toBe("ngay");
    expect(byKey("ttxly")?.kieu).toBe("ma");
    expect(byKey("tthai")?.kieu).toBe("ma");
    expect(byKey("hangHoa")?.kieu).toBe("list");
    expect(byKey("khmshdon")?.kieu).toBe("text");
  });
});

describe("labelOf() — trường chưa khai báo", () => {
  it("ném lỗi rõ ràng thay vì trả undefined im lặng", () => {
    expect(() => labelOf("khong_ton_tai")).toThrow();
  });
});

// U-K2 — hai bộ chọn này khai khung ở U-K1 (khi đó CHƯA field nào gán tren.bang/sapDuoc,
// test cũ khoá ở "rỗng"). U-K2 gán thật, nên kỳ vọng siết từ "rỗng" thành TẬP CHÍNH XÁC —
// mạnh hơn, không phải nới.
describe("fieldsForTable() — cột bảng hoá đơn, đúng thứ tự hiển thị", () => {
  it("đúng danh sách key + thứ tự khớp bảng đang chạy (mốc PARITY U-K2)", () => {
    expect(fieldsForTable().map((f) => f.key)).toEqual([
      "tdlap",
      "shdon",
      "nbten",
      "nmten",
      "hangHoa",
      "soLuong",
      "tgtcthue",
      "tgtthue",
      "tgtttbso",
      "dvtte",
      "ttxly",
      "tthai",
      "chieu",
      "nguon",
    ]);
  });

  it("nhãn hiển thị trên bảng = nhanNgan ?? nhan — giữ NGUYÊN chữ bảng đang dùng", () => {
    const hien = new Map(fieldsForTable().map((f) => [f.key, f.nhanNgan ?? f.nhan]));
    expect(hien.get("tdlap")).toBe("Ngày lập");
    expect(hien.get("shdon")).toBe("Ký hiệu · Số HĐ");
    expect(hien.get("nbten")).toBe("Người bán");
    expect(hien.get("nmten")).toBe("Người mua");
    expect(hien.get("hangHoa")).toBe("Hàng hóa, dịch vụ");
    expect(hien.get("soLuong")).toBe("Số lượng");
    expect(hien.get("tgtcthue")).toBe("Chưa thuế");
    expect(hien.get("tgtthue")).toBe("Tiền thuế");
    expect(hien.get("tgtttbso")).toBe("Tổng TT");
    expect(hien.get("dvtte")).toBe("Tiền tệ");
    expect(hien.get("ttxly")).toBe("TT xử lý");
    expect(hien.get("tthai")).toBe("TT hóa đơn");
    expect(hien.get("chieu")).toBe("Chiều");
    expect(hien.get("nguon")).toBe("Nguồn");
  });

  // Đây là điểm "hết lệch": nhãn NGẮN của bảng và nhãn ĐẦY ĐỦ của file xuất nay sinh từ
  // CÙNG một khai báo, nên không thể trôi khỏi nhau nữa. Muốn bảng hiện "Tổng thanh toán"
  // chỉ cần xoá `nhanNgan` — một dòng, một nơi.
  it("nhãn đầy đủ của cột tiền khớp ĐÚNG nhãn file xuất (cùng một field)", () => {
    const f = INVOICE_FIELDS.find((x) => x.key === "tgtttbso");
    expect(f?.nhan).toBe("Tổng thanh toán");
    expect(f?.nhanNgan).toBe("Tổng TT");
    expect(f?.tren.fileXuat).toBe(true);
    expect(f?.tren.bang).toBe(true);
  });
});

describe("sortableKeys() — allowlist ORDER BY phía server", () => {
  it("đúng 12 khóa khớp SORT_COLUMNS đang chạy (mốc PARITY U-K2)", () => {
    expect(sortableKeys()).toEqual([
      "tdlap",
      "shdon",
      "nbten",
      "nmten",
      "tgtcthue",
      "tgtthue",
      "tgtttbso",
      "dvtte",
      "ttxly",
      "tthai",
      "chieu",
      "nguon",
    ]);
  });

  it("cột tóm tắt dòng hàng KHÔNG sắp được (sub-select, cần HAVING — ngoài phạm vi)", () => {
    expect(sortableKeys()).not.toContain("hangHoa");
    expect(sortableKeys()).not.toContain("soLuong");
  });
});

// PARITY: `sapDuoc` (allowlist server) RỘNG HƠN `sapTrenBang` (menu sắp bảng phơi ra).
// Bảng hôm nay KHÔNG có menu cho dvtte/ttxly/tthai dù server sắp được. Tách hai khái niệm
// để U-K2 không vô tình mọc thêm menu — và để khoảng lệch đó thành DỮ LIỆU THẤY ĐƯỢC thay
// vì ẩn trong JSX.
describe("sapDuoc vs sapTrenBang — khoảng lệch server/bảng là CÓ CHỦ Ý", () => {
  it("dvtte/ttxly/tthai: server sắp được nhưng bảng CHƯA phơi menu sắp", () => {
    for (const k of ["dvtte", "ttxly", "tthai"]) {
      const f = INVOICE_FIELDS.find((x) => x.key === k);
      expect(f?.sapDuoc, `${k} phải nằm trong allowlist server`).toBe(true);
      expect(f?.sapTrenBang ?? false, `${k} bảng chưa có menu sắp`).toBe(false);
    }
  });

  it("mọi field sapTrenBang PHẢI sapDuoc (bảng không thể sắp thứ server từ chối)", () => {
    for (const f of INVOICE_FIELDS) {
      if (f.sapTrenBang)
        expect(f.sapDuoc, `${f.key} sắp trên bảng mà không có allowlist`).toBe(true);
    }
  });
});

describe("locDuoc — ô lọc trên bảng", () => {
  it("đúng 6 trường lọc được, đúng kiểu ô (mốc PARITY U-K2)", () => {
    const loc = INVOICE_FIELDS.filter((f) => f.locDuoc).map((f) => [f.key, f.locDuoc]);
    expect(loc).toEqual([
      ["shdon", "text"],
      ["nbten", "text"],
      ["nmten", "text"],
      ["tgtttbso", "range"],
      ["chieu", "enum"],
      ["nguon", "enum"],
    ]);
  });

  // Khóa LỌC của cột tổng thanh toán là `ttbso` (cặp ttbsoTu/ttbsoDen trong Zod), KHÁC
  // khóa SẮP `tgtttbso`. Ghi tường minh để bảng không gửi nhầm tên tham số lên server.
  it("khoaLoc mặc định = key; riêng tgtttbso lọc bằng khóa 'ttbso'", () => {
    const f = INVOICE_FIELDS.find((x) => x.key === "tgtttbso");
    expect(f?.khoaLoc).toBe("ttbso");
    expect(INVOICE_FIELDS.find((x) => x.key === "nbten")?.khoaLoc).toBeUndefined();
  });

  it("chiều/nguồn mang đúng lựa chọn enum do server định nghĩa (không bịa)", () => {
    expect(INVOICE_FIELDS.find((x) => x.key === "chieu")?.enum).toEqual([
      ["purchase", "Mua vào"],
      ["sold", "Bán ra"],
    ]);
    expect(INVOICE_FIELDS.find((x) => x.key === "nguon")?.enum).toEqual([
      ["normal", "Hóa đơn điện tử thường"],
      ["sco", "Máy tính tiền"],
    ]);
  });
});

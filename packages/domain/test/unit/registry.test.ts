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

// U-K2 dùng — khai sẵn chữ ký hàm ở U-K1 nên phải có test ngay, tránh code chết không phủ.
describe("fieldsForTable() / sortableKeys() — chưa gán tren.bang/sapDuoc ở U-K1", () => {
  it("rỗng vì chưa có field nào đánh dấu tren.bang", () => {
    expect(fieldsForTable()).toEqual([]);
  });

  it("rỗng vì chưa có field nào đánh dấu sapDuoc", () => {
    expect(sortableKeys()).toEqual([]);
  });
});

// U-K1 — File xuất phẳng (một mặt hàng một dòng): catalog cột, helper chọn cột, guard key hợp lệ.
// Test khoá: (1) cấu trúc FLAT_EXPORT_COLUMNS — 31 cột, nhãn/nhóm/kiểu/mặc định đúng; (2) chonCotXuat()
// xử lý được input rỗng/null/lạ/lẫn hợp lệ+lạ; (3) KEYS/DEFAULT_KEYS đúng nguồn từ COLUMNS.
import { describe, expect, it } from "vitest";
import {
  FLAT_EXPORT_COLUMNS,
  FLAT_EXPORT_DEFAULT_KEYS,
  FLAT_EXPORT_KEYS,
  type FlatExportCol,
  type FlatExportKieu,
  type FlatExportNhom,
  chonCotXuat,
} from "../../src/flatExport";

describe("FLAT_EXPORT_COLUMNS — catalog 31 cột file xuất phẳng", () => {
  it("có đúng 31 cột", () => {
    expect(FLAT_EXPORT_COLUMNS.length).toBe(31);
  });

  it("mọi cột có key, nhan không rỗng", () => {
    for (const col of FLAT_EXPORT_COLUMNS) {
      expect(col.key.length).toBeGreaterThan(0);
      expect(col.nhan.length).toBeGreaterThan(0);
    }
  });

  it("key duy nhất, không trùng", () => {
    const keys = FLAT_EXPORT_COLUMNS.map((c) => c.key);
    expect(new Set(keys).size).toBe(31);
  });

  it("mọi cột có nhom hợp lệ (stt|hd|nguoi|dong|trangthai|hdTien)", () => {
    const validNhom: FlatExportNhom[] = ["stt", "hd", "nguoi", "dong", "trangthai", "hdTien"];
    for (const col of FLAT_EXPORT_COLUMNS) {
      expect(validNhom).toContain(col.nhom);
    }
  });

  it("mọi cột có kieu hợp lệ (text|ngay|tien|num|ma)", () => {
    const validKieu: FlatExportKieu[] = ["text", "ngay", "tien", "num", "ma"];
    for (const col of FLAT_EXPORT_COLUMNS) {
      expect(validKieu).toContain(col.kieu);
    }
  });

  it("mọi cột có macDinhHien boolean", () => {
    for (const col of FLAT_EXPORT_COLUMNS) {
      expect(typeof col.macDinhHien).toBe("boolean");
    }
  });

  it("cột đầu tiên là sttFile (STT)", () => {
    expect(FLAT_EXPORT_COLUMNS[0]?.key).toBe("sttFile");
    expect(FLAT_EXPORT_COLUMNS[0]?.nhan).toBe("STT");
    expect(FLAT_EXPORT_COLUMNS[0]?.kieu).toBe("num");
    expect(FLAT_EXPORT_COLUMNS[0]?.macDinhHien).toBe(true);
  });

  it("cột cuối cùng là tgtttbso (Tổng thanh toán cả HĐ)", () => {
    // `.at(-1)` chứ KHÔNG phải chỉ số cứng: catalog còn chèn cột nữa, đừng cột-hoá chỉ số.
    const last = FLAT_EXPORT_COLUMNS.at(-1);
    expect(last?.key).toBe("tgtttbso");
    expect(last?.nhan).toBe("Tổng thanh toán (cả HĐ)");
    expect(last?.nhom).toBe("hdTien");
    expect(last?.kieu).toBe("tien");
    expect(last?.macDinhHien).toBe(false);
  });

  it("nhóm stt có 1 cột (sttFile)", () => {
    const stt = FLAT_EXPORT_COLUMNS.filter((c) => c.nhom === "stt");
    expect(stt).toHaveLength(1);
    expect(stt[0]?.key).toBe("sttFile");
  });

  it("nhóm hd chứa ký hiệu, số, chiều, ngày lập/cập nhật, tiền tệ", () => {
    const hd = FLAT_EXPORT_COLUMNS.filter((c) => c.nhom === "hd");
    const keys = hd.map((c) => c.key);
    expect(keys).toContain("khmshdon");
    expect(keys).toContain("khhdon");
    expect(keys).toContain("shdon");
    expect(keys).toContain("chieu");
    expect(keys).toContain("tdlap");
    expect(keys).toContain("ncnhat");
    expect(keys).toContain("nguon");
    expect(keys).toContain("dvtte");
  });

  it("nhóm dong chứa mặt hàng, số lượng, đơn giá, tiền, thuế, v.v.", () => {
    const dong = FLAT_EXPORT_COLUMNS.filter((c) => c.nhom === "dong");
    const keys = dong.map((c) => c.key);
    expect(keys).toContain("sttDong");
    expect(keys).toContain("ten");
    expect(keys).toContain("dvtinh");
    expect(keys).toContain("sluong");
    expect(keys).toContain("dgia");
    expect(keys).toContain("thtien");
    expect(keys).toContain("tsuat");
    expect(keys).toContain("tsuatTien");
    expect(keys).toContain("tongSauThue");
  });

  it("cột 'ten' (Hàng hóa/dịch vụ) có macDinhHien=true", () => {
    const ten = FLAT_EXPORT_COLUMNS.find((c) => c.key === "ten");
    expect(ten?.macDinhHien).toBe(true);
  });

  it("cột 'ncnhat' (Ngày cập nhật) có macDinhHien=false", () => {
    const ncnhat = FLAT_EXPORT_COLUMNS.find((c) => c.key === "ncnhat");
    expect(ncnhat?.macDinhHien).toBe(false);
  });

  it("cột tiền suất có kieu='num' (không phải tien)", () => {
    const tsuat = FLAT_EXPORT_COLUMNS.find((c) => c.key === "tsuat");
    expect(tsuat?.kieu).toBe("num");
  });

  it("cột trạng thái có kieu='ma'", () => {
    const ttxly = FLAT_EXPORT_COLUMNS.find((c) => c.key === "ttxly");
    expect(ttxly?.kieu).toBe("ma");
    const tthai = FLAT_EXPORT_COLUMNS.find((c) => c.key === "tthai");
    expect(tthai?.kieu).toBe("ma");
  });
});

// U36 QĐ-1 — người dùng phải ĐỌC ĐƯỢC trạng thái ngay trên file tải về, sát cạnh số tiền
// mà nó chi phối; nếu không, kế toán pivot cột "Tổng thanh toán (cả HĐ)" sẽ ra số cũ mà
// không biết vì sao (rủi ro 7.4 của kế hoạch).
describe("U36 — ba cột trạng thái, bật mặc định, ngay sau 'Tổng tiền (sau thuế)'", () => {
  const keys = FLAT_EXPORT_COLUMNS.map((c) => c.key);

  it("thứ tự: tthai → tthaiNhan → tinhVaoTong nằm LIỀN SAU tongSauThue", () => {
    const i = keys.indexOf("tongSauThue");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(keys.slice(i + 1, i + 4)).toEqual(["tthai", "tthaiNhan", "tinhVaoTong"]);
  });

  it("cả ba đều BẬT mặc định và giữ đúng thứ tự đó trong bộ mặc định", () => {
    const i = FLAT_EXPORT_DEFAULT_KEYS.indexOf("tongSauThue");
    expect(FLAT_EXPORT_DEFAULT_KEYS.slice(i + 1)).toEqual(["tthai", "tthaiNhan", "tinhVaoTong"]);
  });

  it("nhãn: `tthai` GIỮ NGUYÊN 'Trạng thái HĐ (mã)' — không đẻ nhãn thứ hai cho một trường", () => {
    expect(FLAT_EXPORT_COLUMNS.find((c) => c.key === "tthai")?.nhan).toBe("Trạng thái HĐ (mã)");
    expect(FLAT_EXPORT_COLUMNS.find((c) => c.key === "tthaiNhan")?.nhan).toBe("Trạng thái");
    expect(FLAT_EXPORT_COLUMNS.find((c) => c.key === "tinhVaoTong")?.nhan).toBe("Tính vào tổng");
  });

  it("hai cột mới thuộc nhóm 'trangthai', kiểu 'text'", () => {
    for (const k of ["tthaiNhan", "tinhVaoTong"]) {
      const c = FLAT_EXPORT_COLUMNS.find((x) => x.key === k);
      expect(c?.nhom).toBe("trangthai");
      expect(c?.kieu).toBe("text");
    }
  });

  it("`tthai` chỉ xuất hiện MỘT lần (chuyển vị trí, không tạo key trùng)", () => {
    expect(keys.filter((k) => k === "tthai")).toHaveLength(1);
  });

  it("`ttxly` giữ vị trí cũ và VẪN TẮT — ý nghĩa mã chưa kiểm chứng, không bật bừa", () => {
    expect(FLAT_EXPORT_COLUMNS.find((c) => c.key === "ttxly")?.macDinhHien).toBe(false);
    expect(keys.indexOf("ttxly")).toBeGreaterThan(keys.indexOf("dvtte"));
    expect(keys.indexOf("ttxly")).toBeLessThan(keys.indexOf("tgtcthue"));
  });
});

describe("FLAT_EXPORT_KEYS — Set key hợp lệ", () => {
  it("là Set, chứa 31 key từ COLUMNS", () => {
    expect(FLAT_EXPORT_KEYS instanceof Set).toBe(true);
    expect(FLAT_EXPORT_KEYS.size).toBe(31);
  });

  it("chứa đúng các key của COLUMNS", () => {
    const colKeys = FLAT_EXPORT_COLUMNS.map((c) => c.key);
    for (const k of colKeys) {
      expect(FLAT_EXPORT_KEYS.has(k)).toBe(true);
    }
  });

  it("không chứa key không tồn tại", () => {
    expect(FLAT_EXPORT_KEYS.has("khong_ton_tai")).toBe(false);
    expect(FLAT_EXPORT_KEYS.has("fake_key")).toBe(false);
  });

  it("có key sttFile", () => {
    expect(FLAT_EXPORT_KEYS.has("sttFile")).toBe(true);
  });

  it("có key tengag, dgia, tsuat, v.v. (mẫu cột dòng)", () => {
    expect(FLAT_EXPORT_KEYS.has("ten")).toBe(true);
    expect(FLAT_EXPORT_KEYS.has("dgia")).toBe(true);
    expect(FLAT_EXPORT_KEYS.has("tsuat")).toBe(true);
    expect(FLAT_EXPORT_KEYS.has("tsuatTien")).toBe(true);
  });
});

describe("FLAT_EXPORT_DEFAULT_KEYS — 19 cột mặc định (macDinhHien=true)", () => {
  it("là array 19 cột", () => {
    expect(Array.isArray(FLAT_EXPORT_DEFAULT_KEYS)).toBe(true);
    expect(FLAT_EXPORT_DEFAULT_KEYS.length).toBe(19);
  });

  it("chứa đúng key của cột có macDinhHien=true", () => {
    const expected = FLAT_EXPORT_COLUMNS.filter((c) => c.macDinhHien).map((c) => c.key);
    expect(FLAT_EXPORT_DEFAULT_KEYS).toEqual(expected);
  });

  it("cột đầu là sttFile, cuối là tinhVaoTong (U36 chèn 3 cột trạng thái ở cuối bộ mặc định)", () => {
    expect(FLAT_EXPORT_DEFAULT_KEYS[0]).toBe("sttFile");
    // Vị trí 15 vẫn là tongSauThue — 16 cột cũ KHÔNG bị xáo, 3 cột mới chỉ nối thêm phía sau.
    expect(FLAT_EXPORT_DEFAULT_KEYS[15]).toBe("tongSauThue");
    expect(FLAT_EXPORT_DEFAULT_KEYS.at(-1)).toBe("tinhVaoTong");
  });

  it("chứa stt, ngày lập, ký hiệu, số HĐ, chiều, người, hàng, số lượng, tiền", () => {
    expect(FLAT_EXPORT_DEFAULT_KEYS).toContain("sttFile");
    expect(FLAT_EXPORT_DEFAULT_KEYS).toContain("tdlap");
    expect(FLAT_EXPORT_DEFAULT_KEYS).toContain("khhdon");
    expect(FLAT_EXPORT_DEFAULT_KEYS).toContain("shdon");
    expect(FLAT_EXPORT_DEFAULT_KEYS).toContain("chieu");
    expect(FLAT_EXPORT_DEFAULT_KEYS).toContain("nbten");
    expect(FLAT_EXPORT_DEFAULT_KEYS).toContain("nbmst");
    expect(FLAT_EXPORT_DEFAULT_KEYS).toContain("nmten");
    expect(FLAT_EXPORT_DEFAULT_KEYS).toContain("nmmst");
    expect(FLAT_EXPORT_DEFAULT_KEYS).toContain("ten");
    expect(FLAT_EXPORT_DEFAULT_KEYS).toContain("sluong");
    expect(FLAT_EXPORT_DEFAULT_KEYS).toContain("dgia");
    expect(FLAT_EXPORT_DEFAULT_KEYS).toContain("thtien");
    expect(FLAT_EXPORT_DEFAULT_KEYS).toContain("tsuat");
    expect(FLAT_EXPORT_DEFAULT_KEYS).toContain("tsuatTien");
  });

  it("KHÔNG chứa cột ẩn (ncnhat, khmshdon, dvtinh, ltsuat, dvtte, ttxly, tgtcthue, ttcktmai, tgtthue, tgtttbso, sttDong)", () => {
    expect(FLAT_EXPORT_DEFAULT_KEYS).not.toContain("ncnhat");
    expect(FLAT_EXPORT_DEFAULT_KEYS).not.toContain("khmshdon");
    expect(FLAT_EXPORT_DEFAULT_KEYS).not.toContain("dvtinh");
    expect(FLAT_EXPORT_DEFAULT_KEYS).not.toContain("ltsuat");
    expect(FLAT_EXPORT_DEFAULT_KEYS).not.toContain("dvtte");
    expect(FLAT_EXPORT_DEFAULT_KEYS).not.toContain("ttxly");
    expect(FLAT_EXPORT_DEFAULT_KEYS).not.toContain("tgtcthue");
    expect(FLAT_EXPORT_DEFAULT_KEYS).not.toContain("ttcktmai");
    expect(FLAT_EXPORT_DEFAULT_KEYS).not.toContain("tgtthue");
    expect(FLAT_EXPORT_DEFAULT_KEYS).not.toContain("tgtttbso");
    expect(FLAT_EXPORT_DEFAULT_KEYS).not.toContain("sttDong");
  });
});

describe("chonCotXuat() — chuẩn hóa cột từ client", () => {
  it("không truyền gì (undefined) → trả 19 cột mặc định theo CATALOG", () => {
    const result = chonCotXuat();
    const expected = FLAT_EXPORT_COLUMNS.filter((c) => c.macDinhHien);
    expect(result).toEqual(expected);
  });

  it("truyền null → trả 19 cột mặc định", () => {
    const result = chonCotXuat(null);
    const expected = FLAT_EXPORT_COLUMNS.filter((c) => c.macDinhHien);
    expect(result).toEqual(expected);
  });

  it("truyền array rỗng → trả 19 cột mặc định", () => {
    const result = chonCotXuat([]);
    const expected = FLAT_EXPORT_COLUMNS.filter((c) => c.macDinhHien);
    expect(result).toEqual(expected);
  });

  it("truyền key hợp lệ → trả cột theo thứ tự CATALOG, không theo thứ tự input", () => {
    const input = ["shdon", "sttFile", "ten"];
    const result = chonCotXuat(input);
    const keys = result.map((c) => c.key);
    // Thứ tự CATALOG: sttFile (0), ten (13), shdon (6)
    expect(keys).toEqual(["sttFile", "shdon", "ten"]);
  });

  it("truyền key hợp lệ, kèm key lạ → bỏ key lạ, trả hợp lệ theo CATALOG", () => {
    const input = ["sttFile", "khong_ton_tai", "ten", "fake_key"];
    const result = chonCotXuat(input);
    const keys = result.map((c) => c.key);
    expect(keys).toEqual(["sttFile", "ten"]);
  });

  it("truyền array chỉ key lạ → fallback mặc định (19 cột, an toàn)", () => {
    const input = ["khong_ton_tai", "fake_key"];
    const result = chonCotXuat(input);
    // Khi toàn bộ key lạ được lọc, chon.length === 0 → co = null → fallback mặc định
    const expected = FLAT_EXPORT_COLUMNS.filter((c) => c.macDinhHien);
    expect(result).toEqual(expected);
  });

  it("truyền toàn bộ 31 key → trả 31 cột theo CATALOG", () => {
    const allKeys = FLAT_EXPORT_COLUMNS.map((c) => c.key);
    const result = chonCotXuat(allKeys);
    expect(result).toEqual(FLAT_EXPORT_COLUMNS);
  });

  it("truyền một cột mặc định → trả đúng cột đó", () => {
    const result = chonCotXuat(["tdlap"]);
    expect(result).toHaveLength(1);
    expect(result[0]?.key).toBe("tdlap");
    expect(result[0]?.nhan).toBe("Ngày lập");
  });

  it("truyền một cột ẩn (chưa chọn) → trả cột đó (không ưu tiên mặc định)", () => {
    const result = chonCotXuat(["ncnhat"]);
    expect(result).toHaveLength(1);
    expect(result[0]?.key).toBe("ncnhat");
    expect(result[0]?.nhan).toBe("Ngày cập nhật");
  });

  it("kết quả luôn có type FlatExportCol[]", () => {
    const result = chonCotXuat(["sttFile"]);
    expect(Array.isArray(result)).toBe(true);
    for (const col of result) {
      expect(typeof col.key).toBe("string");
      expect(typeof col.nhan).toBe("string");
      expect(typeof col.nhom).toBe("string");
      expect(typeof col.kieu).toBe("string");
      expect(typeof col.macDinhHien).toBe("boolean");
    }
  });

  it("input không thay đổi nhận ở hàm (readonly safe)", () => {
    const input = ["sttFile", "ten"] as const;
    const result1 = chonCotXuat(input);
    const result2 = chonCotXuat(input);
    expect(result1).toEqual(result2);
  });

  it("truyền ReadonlyArray → xử lý bình thường", () => {
    const input: readonly string[] = ["sttFile", "ten"];
    const result = chonCotXuat(input);
    const keys = result.map((c) => c.key);
    expect(keys).toEqual(["sttFile", "ten"]);
  });

  it("truyền key trùng → giữ duy nhất (Set xử lý)", () => {
    const input = ["sttFile", "sttFile", "ten", "ten"];
    const result = chonCotXuat(input);
    const keys = result.map((c) => c.key);
    // Set sẽ bỏ trùng, nên kết quả là 2 cột
    expect(keys).toEqual(["sttFile", "ten"]);
  });

  it("đầu ra luôn giữ thứ tự CATALOG", () => {
    // Request thứ tự lộn xộn
    const input = ["tongSauThue", "sttFile", "ten", "dgia"];
    const result = chonCotXuat(input);
    const keys = result.map((c) => c.key);
    // Thứ tự CATALOG: sttFile (0), ten (13), dgia (17), tongSauThue (21)
    expect(keys).toEqual(["sttFile", "ten", "dgia", "tongSauThue"]);
  });

  it("cột return khớp FlatExportCol từ COLUMNS, không clone", () => {
    const result = chonCotXuat(["sttFile"]);
    const original = FLAT_EXPORT_COLUMNS.find((c) => c.key === "sttFile");
    // Phải là object giống nhau (tham chiếu)
    expect(result[0]).toBe(original);
  });
});

describe("chonCotXuat() — edge case nhãn/nhóm", () => {
  it("cột với nhãn dài (cả HĐ) — ví dụ tgtttbso", () => {
    const result = chonCotXuat(["tgtttbso"]);
    expect(result[0]?.nhan).toBe("Tổng thanh toán (cả HĐ)");
  });

  it("cột với nhãn dài (trước thuế) — ví dụ thtien", () => {
    const result = chonCotXuat(["thtien"]);
    expect(result[0]?.nhan).toBe("Thành tiền (trước thuế)");
  });

  it("nhóm hdTien chứa các cột tính toán cấp HĐ", () => {
    const keys = ["tgtcthue", "ttcktmai", "tgtthue", "tgtttbso"];
    const result = chonCotXuat(keys);
    for (const col of result) {
      expect(col.nhom).toBe("hdTien");
    }
  });
});

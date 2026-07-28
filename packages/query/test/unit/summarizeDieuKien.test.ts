// U36.3 unit — hai vị từ SQL quyết định "hóa đơn nào được cộng tiền" và "mã nào là lạ".
//
// Kiểm bằng CÂU SQL SINH RA (PgDialect), không phải bằng dữ liệu: bốn bẫy của bước này đều
// là bẫy CÚ PHÁP/logic ba trị, chúng lộ ra ở chuỗi SQL chứ không lộ ở một ca dữ liệu cụ thể.
// Riêng nhánh "danh sách rỗng" thì KHÔNG có cách nào dựng bằng dữ liệu — nếu không kiểm ở
// đây thì nó chỉ là chú thích, và `not in ()` sẽ làm hỏng cả endpoint vào ngày ai đó dọn
// `TTHAI_LOAI_KHOI_TONG`.
import { TTHAI_DA_KIEM_CHUNG, TTHAI_LOAI_KHOI_TONG } from "@vat/domain";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { dieuKienMaLa, dieuKienTinhTong } from "../../src/summarize";

const dialect = new PgDialect();
const raSql = (s: Parameters<PgDialect["sqlToQuery"]>[0]) => dialect.sqlToQuery(s).sql;

describe("dieuKienTinhTong", () => {
  it("có mã loại trừ → nêu `is null` tường minh (bẫy NOT IN + NULL)", () => {
    const q = raSql(dieuKienTinhTong([4]));
    expect(q).toContain("is null or");
    expect(q).toContain("not in");
  });

  it("danh sách RỖNG → `true`, KHÔNG sinh `not in ()` (lỗi cú pháp SQL)", () => {
    const q = raSql(dieuKienTinhTong([]));
    expect(q.trim()).toBe("true");
    expect(q).not.toContain("not in");
  });

  it("nhiều mã → liệt kê đủ, ngăn bằng dấu phẩy", () => {
    const q = raSql(dieuKienTinhTong([4, 6]));
    expect(q).toContain("not in (");
    expect(q.match(/,/g)?.length).toBeGreaterThanOrEqual(1);
  });

  it("hằng production hiện hành dựng được câu hợp lệ", () => {
    expect(() => raSql(dieuKienTinhTong(TTHAI_LOAI_KHOI_TONG))).not.toThrow();
  });
});

describe("dieuKienMaLa", () => {
  it("có tập đã kiểm chứng → loại NULL ra khỏi 'mã lạ'", () => {
    const q = raSql(dieuKienMaLa([1, 2, 3, 4, 5]));
    expect(q).toContain("is not null and");
    expect(q).toContain("not in");
  });

  it("tập đã kiểm chứng RỖNG → mọi mã non-null đều là lạ, KHÔNG `not in ()`", () => {
    const q = raSql(dieuKienMaLa([]));
    expect(q).toContain("is not null");
    expect(q).not.toContain("not in");
  });

  it("hằng production hiện hành dựng được câu hợp lệ", () => {
    expect(() => raSql(dieuKienMaLa(TTHAI_DA_KIEM_CHUNG))).not.toThrow();
  });
});

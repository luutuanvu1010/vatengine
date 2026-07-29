// U37b Gói 4a — tầng truy vấn cho việc phát hành gói hóa đơn gốc.
//
// Hai hàm, hai vai trò khác nhau:
//  - `listHoaDonChoGoi`: liệt kê hóa đơn thuộc gói. ĐÂY LÀ CHỖ RÀNG BUỘC BẢO MẬT NẰM —
//    `runHoSoGocJob` tin thẳng `msg.ref`, không tra lại `hoa_don` theo tenant (phát hiện ở
//    review bảo mật U37a). Nên `ref` BẮT BUỘC dựng từ hàng đã lọc `tenant_id`, không nhận
//    từ client. Hàm này là nguồn duy nhất sinh ra `ref`.
//  - `demTienDoGoi`: đếm tiến trình. QĐ-B8 — đếm TRỰC TIẾP từ `tep_hoa_don_goc`, không
//    thêm cột đếm ở `goi_chia_se` (không tạo nguồn sự thật thứ hai).
import { tepHoaDonGoc, withTenant } from "@vat/db";
import { beforeEach, describe, expect, it } from "vitest";
import { demTienDoGoi, listHoaDonChoGoi } from "../../src/goiHoaDon";
import { type Db, freshDb, makeTenant, seedInvoice } from "../helpers";

const KHACH = "0312000001";
const KHACH_KHAC = "0312000099";

describe("listHoaDonChoGoi (integration, PGlite)", () => {
  let db: Db;
  let tenantId: string;

  beforeEach(async () => {
    db = await freshDb();
    tenantId = await makeTenant(db, "Cty A", "0100000001");
  });

  const lay = (over: Record<string, unknown> = {}) =>
    withTenant(db, tenantId, (tx) =>
      listHoaDonChoGoi(tx, tenantId, {
        nmmst: KHACH,
        tuNgay: "2026-07-01",
        denNgay: "2026-07-31",
        ...over,
      }),
    );

  it("trả ĐỦ 4 tham số định danh + hoaDonId để dựng ref", async () => {
    await seedInvoice(db, tenantId, {
      chieu: "sold",
      nmmst: KHACH,
      nbmst: "0100000001",
      khhdon: "C26TQO",
      khmshdon: "1",
      shdon: "13580",
      tdlap: new Date("2026-07-15T00:00:00Z"),
      nguon: "normal",
    });

    const rows = await lay();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      nbmst: "0100000001",
      khhdon: "C26TQO",
      khmshdon: "1",
      shdon: "13580",
      source: "normal",
    });
    expect(rows[0]?.hoaDonId).toBeTruthy();
  });

  it("`source` ánh xạ từ `nguon`: sco → 'sco' (chọn đúng họ endpoint GDT)", async () => {
    await seedInvoice(db, tenantId, {
      chieu: "sold",
      nmmst: KHACH,
      shdon: "1",
      nguon: "sco",
      tdlap: new Date("2026-07-15T00:00:00Z"),
    });

    const rows = await lay();
    expect(rows[0]?.source).toBe("sco");
  });

  it("CHỈ chiều bán ra (QĐ-B1) — hóa đơn mua vào không lọt vào gói", async () => {
    await seedInvoice(db, tenantId, {
      chieu: "sold",
      nmmst: KHACH,
      shdon: "1",
      tdlap: new Date("2026-07-15T00:00:00Z"),
    });
    await seedInvoice(db, tenantId, {
      chieu: "purchase",
      nmmst: KHACH,
      shdon: "2",
      tdlap: new Date("2026-07-15T00:00:00Z"),
    });

    expect(await lay()).toHaveLength(1);
  });

  it("CHỈ khách hàng được chọn (QĐ-B2) — khách khác không lọt", async () => {
    for (const [mst, shdon] of [
      [KHACH, "1"],
      [KHACH_KHAC, "2"],
    ] as const) {
      await seedInvoice(db, tenantId, {
        chieu: "sold",
        nmmst: mst,
        shdon,
        tdlap: new Date("2026-07-15T00:00:00Z"),
      });
    }

    const rows = await lay();
    expect(rows).toHaveLength(1);
  });

  it("lọc theo khoảng ngày, BAO GỒM cả hai đầu mút", async () => {
    for (const [ngay, shdon] of [
      ["2026-06-30T00:00:00Z", "1"], // trước khoảng
      ["2026-07-01T00:00:00Z", "2"], // đầu mút
      ["2026-07-31T00:00:00Z", "3"], // cuối mút
      ["2026-08-01T00:00:00Z", "4"], // sau khoảng
    ] as const) {
      await seedInvoice(db, tenantId, {
        chieu: "sold",
        nmmst: KHACH,
        shdon,
        tdlap: new Date(ngay),
      });
    }

    const rows = await lay();
    expect(rows.map((r) => r.shdon).sort()).toEqual(["2", "3"]);
  });

  it("CÁCH LY TENANT: hóa đơn cùng khách nhưng của tenant khác KHÔNG lọt", async () => {
    const tenantB = await makeTenant(db, "Cty B", "0100000002");
    await seedInvoice(db, tenantId, {
      chieu: "sold",
      nmmst: KHACH,
      shdon: "1",
      tdlap: new Date("2026-07-15T00:00:00Z"),
    });
    await seedInvoice(db, tenantB, {
      chieu: "sold",
      nmmst: KHACH,
      shdon: "2",
      tdlap: new Date("2026-07-15T00:00:00Z"),
    });

    // Đây là lớp chắn quan trọng nhất: `ref` sinh ra ở đây đi thẳng vào message queue mà
    // `runHoSoGocJob` KHÔNG tra lại. Lọt một hàng của tenant khác là tải hồ sơ gốc của họ.
    const rows = await lay();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.shdon).toBe("1");
  });

  it("không có hóa đơn nào khớp → mảng rỗng, KHÔNG ném", async () => {
    expect(await lay()).toEqual([]);
  });
});

describe("demTienDoGoi (integration, PGlite)", () => {
  let db: Db;
  let tenantId: string;

  beforeEach(async () => {
    db = await freshDb();
    tenantId = await makeTenant(db, "Cty A", "0100000001");
  });

  async function seedVoiTrangThai(shdon: string, trangThai?: string): Promise<string> {
    const hoaDonId = await seedInvoice(db, tenantId, {
      chieu: "sold",
      nmmst: KHACH,
      shdon,
      tdlap: new Date("2026-07-15T00:00:00Z"),
    });
    if (trangThai) {
      await db.insert(tepHoaDonGoc).values({
        tenantId,
        hoaDonId,
        trangThai,
        ...(trangThai === "da_tai"
          ? {
              khoaXml: `hoadon-goc/${tenantId}/${hoaDonId}.xml`,
              khoaHtml: `hoadon-goc/${tenantId}/${hoaDonId}.html`,
            }
          : {}),
      });
    }
    return hoaDonId;
  }

  it("đếm đúng bốn nhóm: xong / không có hồ sơ gốc / lỗi / còn chờ", async () => {
    const ids = [
      await seedVoiTrangThai("1", "da_tai"),
      await seedVoiTrangThai("2", "da_tai"),
      await seedVoiTrangThai("3", "khong_co_ho_so_goc"),
      await seedVoiTrangThai("4", "loi"),
      await seedVoiTrangThai("5"), // chưa có bản ghi nào ⇒ còn chờ
    ];

    const td = await withTenant(db, tenantId, (tx) => demTienDoGoi(tx, tenantId, ids));
    expect(td).toEqual({ tong: 5, xong: 2, khongCoHoSoGoc: 1, loi: 1, conCho: 1 });
  });

  it("chưa tải gì → tất cả còn chờ", async () => {
    const ids = [await seedVoiTrangThai("1"), await seedVoiTrangThai("2")];
    const td = await withTenant(db, tenantId, (tx) => demTienDoGoi(tx, tenantId, ids));
    expect(td).toEqual({ tong: 2, xong: 0, khongCoHoSoGoc: 0, loi: 0, conCho: 2 });
  });

  it("danh sách rỗng → mọi số bằng 0, KHÔNG ném (tránh SQL `IN ()`)", async () => {
    const td = await withTenant(db, tenantId, (tx) => demTienDoGoi(tx, tenantId, []));
    expect(td).toEqual({ tong: 0, xong: 0, khongCoHoSoGoc: 0, loi: 0, conCho: 0 });
  });

  it("CÁCH LY TENANT: bản ghi của tenant khác không được tính vào tiến độ", async () => {
    const tenantB = await makeTenant(db, "Cty B", "0100000002");
    const hoaDonB = await seedInvoice(db, tenantB, {
      chieu: "sold",
      nmmst: KHACH,
      shdon: "9",
      tdlap: new Date("2026-07-15T00:00:00Z"),
    });
    await db.insert(tepHoaDonGoc).values({
      tenantId: tenantB,
      hoaDonId: hoaDonB,
      trangThai: "da_tai",
      khoaXml: "x",
      khoaHtml: "y",
    });

    // Hỏi tiến độ dưới tenant A nhưng đưa id của tenant B: phải coi là CÒN CHỜ, không
    // được đọc trạng thái của tenant khác.
    const td = await withTenant(db, tenantId, (tx) => demTienDoGoi(tx, tenantId, [hoaDonB]));
    expect(td).toEqual({ tong: 1, xong: 0, khongCoHoSoGoc: 0, loi: 0, conCho: 1 });
  });
});

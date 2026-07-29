// U37b — danh sách khách hàng để chọn khi tải hóa đơn gốc (integration, PGlite).
//
// Nguồn dữ liệu: chính hóa đơn BÁN RA của tenant. Chỉ liệt kê khách có ĐỦ MST + tên —
// khớp luật "MST hoặc tên trống ⇒ chặn nút" (U37 §8 mục 10): thứ không chọn được thì
// không hiện ra để khỏi bẫy người dùng.
//
// Bằng chứng nền (đo production 2026-07-29, U37 §4.8): 167 khách hàng, 1.957 hóa đơn;
// 83% hóa đơn bán ra KHÔNG có MST người mua (khách lẻ dùng CCCD) — nhóm đó nằm ngoài.
import { withTenant } from "@vat/db";
import { beforeEach, describe, expect, it } from "vitest";
import { listKhachHang } from "../../src/khachHang";
import { type Db, freshDb, makeTenant, seedInvoice } from "../helpers";

describe("listKhachHang (integration, PGlite)", () => {
  let db: Db;
  let tenantId: string;

  beforeEach(async () => {
    db = await freshDb();
    tenantId = await makeTenant(db, "Cty A", "0100000001");
  });

  const lay = () => withTenant(db, tenantId, (tx) => listKhachHang(tx, tenantId));

  it("gộp theo MST: một khách nhiều hóa đơn → MỘT mục, kèm số hóa đơn", async () => {
    for (const shdon of ["1", "2", "3"]) {
      await seedInvoice(db, tenantId, {
        chieu: "sold",
        nmmst: "0312000001",
        nmten: "CÔNG TY TNHH ABC",
        shdon,
      });
    }

    const kq = await lay();
    expect(kq.items).toHaveLength(1);
    expect(kq.items[0]).toMatchObject({
      nmmst: "0312000001",
      nmten: "CÔNG TY TNHH ABC",
      soHoaDon: 3,
    });
  });

  it("chỉ lấy chiều BÁN RA — người bán của hóa đơn mua vào KHÔNG phải khách hàng", async () => {
    await seedInvoice(db, tenantId, {
      chieu: "sold",
      nmmst: "0312000001",
      nmten: "Khách bán ra",
      shdon: "1",
    });
    await seedInvoice(db, tenantId, {
      chieu: "purchase",
      nmmst: "0312000002",
      nmten: "Bên kia của hóa đơn mua vào",
      shdon: "2",
    });

    const kq = await lay();
    expect(kq.items.map((x) => x.nmmst)).toEqual(["0312000001"]);
  });

  it("BỎ QUA hóa đơn thiếu MST hoặc thiếu tên — thứ không chọn được thì không hiện", async () => {
    // Khách lẻ: có tên, không MST (83% hóa đơn bán ra thực tế thuộc nhóm này).
    await seedInvoice(db, tenantId, {
      chieu: "sold",
      nmmst: null,
      nmten: "Nguyễn Văn A",
      shdon: "1",
    });
    // MST cá nhân trên máy tính tiền: có MST, GDT trả tên null (U37 §4.8).
    await seedInvoice(db, tenantId, {
      chieu: "sold",
      nmmst: "8845000001",
      nmten: null,
      shdon: "2",
      nguon: "sco",
    });
    // Chuỗi rỗng cũng phải bị loại như null.
    await seedInvoice(db, tenantId, { chieu: "sold", nmmst: "", nmten: "", shdon: "3" });
    await seedInvoice(db, tenantId, {
      chieu: "sold",
      nmmst: "0312000001",
      nmten: "CÔNG TY HỢP LỆ",
      shdon: "4",
    });

    const kq = await lay();
    expect(kq.items).toHaveLength(1);
    expect(kq.items[0]?.nmmst).toBe("0312000001");
  });

  it("một MST có NHIỀU cách viết tên → vẫn MỘT mục, lấy tên của hóa đơn mới nhất", async () => {
    // Đo thật: 165/169 MST chỉ có một cách viết, nhưng có MST viết 2 kiểu (U37 §4.8).
    // Gộp theo MST là đúng — MST mới là định danh; tên chỉ để tìm.
    await seedInvoice(db, tenantId, {
      chieu: "sold",
      nmmst: "0312000001",
      nmten: "CTY TNHH ABC",
      shdon: "1",
      tdlap: new Date("2026-05-10T00:00:00Z"),
    });
    await seedInvoice(db, tenantId, {
      chieu: "sold",
      nmmst: "0312000001",
      nmten: "CÔNG TY TNHH ABC",
      shdon: "2",
      tdlap: new Date("2026-07-20T00:00:00Z"),
    });

    const kq = await lay();
    expect(kq.items).toHaveLength(1);
    expect(kq.items[0]?.nmten).toBe("CÔNG TY TNHH ABC");
    expect(kq.items[0]?.soHoaDon).toBe(2);
  });

  it("sắp theo TÊN để người dùng dò mắt được, không theo thứ tự ngẫu nhiên", async () => {
    for (const [mst, ten, shdon] of [
      ["0312000003", "Xây dựng Z", "1"],
      ["0312000001", "An Bình", "2"],
      ["0312000002", "Minh Khang", "3"],
    ] as const) {
      await seedInvoice(db, tenantId, { chieu: "sold", nmmst: mst, nmten: ten, shdon });
    }

    const kq = await lay();
    expect(kq.items.map((x) => x.nmten)).toEqual(["An Bình", "Minh Khang", "Xây dựng Z"]);
  });

  it("CÁCH LY TENANT: khách của tenant khác không lọt sang", async () => {
    const tenantB = await makeTenant(db, "Cty B", "0100000002");
    await seedInvoice(db, tenantId, {
      chieu: "sold",
      nmmst: "0312000001",
      nmten: "Khách của A",
      shdon: "1",
    });
    await seedInvoice(db, tenantB, {
      chieu: "sold",
      nmmst: "0312000009",
      nmten: "Khách của B",
      shdon: "2",
    });

    const cuaA = await lay();
    expect(cuaA.items.map((x) => x.nmten)).toEqual(["Khách của A"]);

    const cuaB = await withTenant(db, tenantB, (tx) => listKhachHang(tx, tenantB));
    expect(cuaB.items.map((x) => x.nmten)).toEqual(["Khách của B"]);
  });

  it("chưa có hóa đơn bán ra nào → danh sách rỗng, KHÔNG ném", async () => {
    const kq = await lay();
    expect(kq.items).toEqual([]);
    expect(kq.biCatBot).toBe(false);
  });

  it("vượt trần → CẮT nhưng BÁO biCatBot=true (không cắt im lặng)", async () => {
    for (let i = 0; i < 5; i++) {
      await seedInvoice(db, tenantId, {
        chieu: "sold",
        nmmst: `03120000${String(i).padStart(2, "0")}`,
        nmten: `Khách ${i}`,
        shdon: String(i + 1),
      });
    }

    const kq = await withTenant(db, tenantId, (tx) => listKhachHang(tx, tenantId, { gioiHan: 3 }));
    expect(kq.items).toHaveLength(3);
    expect(kq.biCatBot).toBe(true);
  });
});

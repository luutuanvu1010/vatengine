// ÁNH XẠ FILE XUẤT (sheet phẳng 2026-07-21) — canh ĐÚNG và ĐỦ, đi qua đường thật:
// PGlite → iterateInvoices → encoder xlsx → đọc lại file. Mỗi mặt hàng một dòng, kèm đủ
// ngữ cảnh hóa đơn; tiền cấp hóa đơn LẶP mỗi dòng, nhãn "(cả HĐ)".
//
// Cách canh hoán đổi: MỖI trường mang một giá trị NHẬN DIỆN RIÊNG. Hai cột đổi chỗ là lộ
// ngay — không cần biết trước lỗi ở đâu. (Đã kiểm chứng test có răng bằng đột biến.)
import { withTenant } from "@vat/db";
import { beforeEach, describe, expect, it } from "vitest";
import { lineDetailRenderColumns } from "../../src/columns";
import { fetchLinesForInvoices } from "../../src/lineRows";
import { iterateInvoices } from "../../src/rows";
import { toXlsxWithLinesFromBatches } from "../../src/xlsx";
import { type Db, freshDb, makeTenant, readXlsx, seedInvoice, seedLine } from "../helpers";

const HEADERS = lineDetailRenderColumns().map((c) => c.header);
const NB_TEN = "AAA Người Bán";
const NM_TEN = "BBB Người Mua";
const HANG_1 = "CCC Xăng E10";
const HANG_2 = "DDD Dầu Điêzen";

describe("Ánh xạ sheet phẳng — mọi cột đúng nguồn, không sót/không trượt cột", () => {
  let db: Db;
  let tenantA: string;

  beforeEach(async () => {
    db = await freshDb();
    tenantA = await makeTenant(db, "Cty A", "0100000001");
  });

  async function xuat() {
    return withTenant(db, tenantA, async (tx) =>
      toXlsxWithLinesFromBatches(iterateInvoices(tx, tenantA, {}), (ids) =>
        fetchLinesForInvoices(tx, tenantA, ids),
      ),
    );
  }

  it("mỗi giá trị nằm ĐÚNG cột (canh hoán đổi); tiền cấp HĐ lặp mỗi dòng với nhãn (cả HĐ)", async () => {
    const id = await seedInvoice(db, tenantA, {
      nbmst: "1111111111",
      nbten: NB_TEN,
      nmmst: "2222222222",
      nmten: NM_TEN,
      khmshdon: "5",
      khhdon: "K26XYZ",
      shdon: "778899",
      tdlap: new Date("2026-07-01T03:00:00Z"),
      ncnhat: new Date("2026-07-02T04:00:00Z"),
      tgtcthue: "111",
      ttcktmai: "222",
      tgtthue: "333",
      tgtttbso: "444",
      dvtte: "USD",
      ttxly: 7,
      tthai: 9,
      chieu: "sold",
      nguon: "normal",
    });
    await seedLine(db, tenantA, id, { stt: 1, ten: HANG_1, sluong: "42.492", dvtinh: "Lít" });
    await seedLine(db, tenantA, id, { stt: 2, ten: HANG_2, sluong: "20.433", dvtinh: "Lít" });

    const sheet = readXlsx(await xuat(), 1);
    const header = sheet.rows[0]?.map((c) => c.value) ?? [];
    const at = (r: number, nhan: string) => sheet.rows[r]?.[header.indexOf(nhan)]?.value;

    // Hóa đơn 2 mặt hàng ⇒ 2 dòng (header + 2).
    expect(sheet.rows.length).toBe(3);

    // Ngữ cảnh hóa đơn + tiền (cả HĐ) LẶP đúng ở CẢ hai dòng.
    for (const r of [1, 2]) {
      expect(at(r, "Ngày lập")).toBe("2026-07-01 03:00:00");
      expect(at(r, "Ngày cập nhật")).toBe("2026-07-02 04:00:00");
      expect(at(r, "Ký hiệu mẫu số")).toBe("5");
      expect(at(r, "Ký hiệu HĐ")).toBe("K26XYZ");
      expect(at(r, "Số HĐ")).toBe("778899");
      expect(at(r, "MST người bán")).toBe("1111111111");
      expect(at(r, "Tên người bán")).toBe(NB_TEN);
      expect(at(r, "MST người mua")).toBe("2222222222");
      expect(at(r, "Tên người mua")).toBe(NM_TEN);
      expect(at(r, "Tiền tệ")).toBe("USD");
      expect(at(r, "Trạng thái xử lý (mã)")).toBe("7");
      expect(at(r, "Trạng thái HĐ (mã)")).toBe("9");
      expect(at(r, "Chiều")).toBe("sold");
      expect(at(r, "Nguồn")).toBe("normal");
      expect(at(r, "Tiền chưa thuế (cả HĐ)")).toBe("111");
      expect(at(r, "Chiết khấu (cả HĐ)")).toBe("222");
      expect(at(r, "Tiền thuế (cả HĐ)")).toBe("333");
      expect(at(r, "Tổng thanh toán (cả HĐ)")).toBe("444");
    }

    // Chi tiết TỪNG dòng khác nhau — số lượng của DÒNG, không phải tổng.
    expect(at(1, "STT")).toBe("1");
    expect(at(1, "Tên hàng hóa/dịch vụ")).toBe(HANG_1);
    expect(at(1, "Số lượng")).toBe("42.492");
    expect(at(2, "Tên hàng hóa/dịch vụ")).toBe(HANG_2);
    expect(at(2, "Số lượng")).toBe("20.433");

    // KHÔNG còn cột "Số dòng hàng".
    expect(header).not.toContain("Số dòng hàng");
  });

  it("ĐỦ: header khớp cột phẳng; mọi dòng dữ liệu đủ số ô (thiếu ô là trượt cột)", async () => {
    const id = await seedInvoice(db, tenantA, { shdon: "1", ttcktmai: "1", ncnhat: new Date() });
    await seedLine(db, tenantA, id, { stt: 1, ten: HANG_1, sluong: "1" });

    const sheet = readXlsx(await xuat(), 1);
    expect(sheet.rows[0]?.map((c) => c.value)).toEqual(HEADERS);
    for (const r of sheet.rows) expect(r.length).toBe(HEADERS.length);
  });

  it("trường rỗng KHÔNG làm trượt cột (hình dạng dữ liệu sco thật: dvtte/ttxly/tthai null)", async () => {
    const id = await seedInvoice(db, tenantA, {
      shdon: "9",
      nbten: NB_TEN,
      nmten: null,
      ncnhat: null,
      ttcktmai: null,
      dvtte: null,
      ttxly: null,
      tthai: null,
    });
    await seedLine(db, tenantA, id, { stt: 1, ten: HANG_1, sluong: "1" });

    const sheet = readXlsx(await xuat(), 1);
    const header = sheet.rows[0]?.map((c) => c.value) ?? [];
    const data = sheet.rows[1]?.map((c) => c.value) ?? [];
    expect(data.length).toBe(header.length);
    expect(data[header.indexOf("Tên người bán")]).toBe(NB_TEN);
    expect(data[header.indexOf("Số HĐ")]).toBe("9");
    expect(data[header.indexOf("Nguồn")]).toBe("normal");
  });

  it("hóa đơn KHÔNG có dòng hàng vẫn xuất MỘT dòng (không mất khỏi file)", async () => {
    await seedInvoice(db, tenantA, { shdon: "555", nbten: NB_TEN });

    const sheet = readXlsx(await xuat(), 1);
    const header = sheet.rows[0]?.map((c) => c.value) ?? [];
    const at = (nhan: string) => sheet.rows[1]?.[header.indexOf(nhan)]?.value;
    expect(sheet.rows.length).toBe(2); // header + 1 dòng hóa đơn
    expect(at("Số HĐ")).toBe("555");
    expect(at("Tên người bán")).toBe(NB_TEN);
    expect(at("Tên hàng hóa/dịch vụ") ?? "").toBe(""); // phần dòng hàng trống
  });

  it("mỗi dòng hàng kèm đúng ngữ cảnh của HĐ CHÍNH nó (hai HĐ khác người bán)", async () => {
    const a = await seedInvoice(db, tenantA, {
      shdon: "100",
      nbten: "AAA Bán",
      chieu: "sold",
      tdlap: new Date("2026-06-01T03:00:00Z"),
    });
    const b = await seedInvoice(db, tenantA, {
      shdon: "200",
      nbten: "BBB Bán",
      chieu: "purchase",
      tdlap: new Date("2026-06-02T03:00:00Z"),
    });
    await seedLine(db, tenantA, a, { stt: 1, ten: "Vé xem phim", sluong: "3", dvtinh: "vé" });
    await seedLine(db, tenantA, b, { stt: 1, ten: "Xăng", sluong: "10", dvtinh: "Lít" });

    const sheet = readXlsx(await xuat(), 1);
    const h = sheet.rows[0]?.map((c) => c.value) ?? [];
    const at = (r: number, nhan: string) => sheet.rows[r]?.[h.indexOf(nhan)]?.value;
    const byShdon = new Map(
      sheet.rows.slice(1).map((r, i) => [r[h.indexOf("Số HĐ")]?.value, i + 1]),
    );
    const rA = byShdon.get("100") as number;
    const rB = byShdon.get("200") as number;

    expect(at(rA, "Tên người bán")).toBe("AAA Bán");
    expect(at(rA, "Chiều")).toBe("sold");
    expect(at(rA, "Tên hàng hóa/dịch vụ")).toBe("Vé xem phim");
    expect(at(rA, "ĐVT")).toBe("vé");
    expect(at(rA, "Số lượng")).toBe("3");
    expect(at(rB, "Tên người bán")).toBe("BBB Bán");
    expect(at(rB, "Chiều")).toBe("purchase");
  });
});

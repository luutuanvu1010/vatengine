// ÁNH XẠ FILE XUẤT — canh ĐÚNG và ĐỦ, đi qua đường thật: PGlite → iterateInvoices →
// encoder xlsx → đọc lại file. Yêu cầu chủ dự án sau nghiệm thu 2026-07-20.
//
// Vì sao cần test riêng dù đã có test từng cột: các test kia kiểm cellFor với hàng dựng
// TAY. Test này gieo hóa đơn THẬT xuống DB rồi đọc lại file, nên nó bắt được cả lỗi ở
// tầng truy vấn (chọn nhầm cột), tầng kiểu, lẫn tầng mã hóa — thứ mà test đơn vị bỏ lọt.
//
// Cách canh hoán đổi: MỖI trường mang một giá trị NHẬN DIỆN RIÊNG. Nếu hai cột bị đổi
// chỗ cho nhau, giá trị sẽ rơi sai ô và test đỏ ngay — không cần biết trước lỗi ở đâu.
import { withTenant } from "@vat/db";
import { beforeEach, describe, expect, it } from "vitest";
import { EXPORT_COLUMNS } from "../../src/columns";
import { fetchLinesForInvoices } from "../../src/lineRows";
import { iterateInvoices } from "../../src/rows";
import { toXlsxWithLinesFromBatches } from "../../src/xlsx";
import { type Db, freshDb, makeTenant, readXlsx, seedInvoice, seedLine } from "../helpers";

/** Giá trị nhận diện cho từng trường — cố ý KHÁC NHAU hoàn toàn để phát hiện hoán đổi. */
const NB_TEN = "AAA Người Bán";
const NM_TEN = "BBB Người Mua";
const HANG_1 = "CCC Xăng E10";
const HANG_2 = "DDD Dầu Điêzen";

describe("Ánh xạ xlsx — mọi cột đúng nguồn, không sót cột", () => {
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

  it("mỗi giá trị nằm ĐÚNG cột của nó (canh hoán đổi giữa các trường)", async () => {
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
    const data = sheet.rows[1]?.map((c) => c.value) ?? [];
    const o = (nhan: string) => data[header.indexOf(nhan)];

    expect(o("Ngày lập")).toBe("2026-07-01 03:00:00");
    expect(o("Ngày cập nhật")).toBe("2026-07-02 04:00:00");
    expect(o("Ký hiệu mẫu số")).toBe("5");
    expect(o("Ký hiệu HĐ")).toBe("K26XYZ");
    expect(o("Số HĐ")).toBe("778899");
    expect(o("MST người bán")).toBe("1111111111");
    expect(o("Tên người bán")).toBe(NB_TEN);
    expect(o("MST người mua")).toBe("2222222222");
    expect(o("Tên người mua")).toBe(NM_TEN);
    expect(o("Hàng hóa, dịch vụ (số lượng)")).toBe(`${HANG_1} — 42.492\n${HANG_2} — 20.433`);
    expect(o("Số dòng hàng")).toBe("2");
    expect(o("Tiền chưa thuế")).toBe("111");
    expect(o("Chiết khấu")).toBe("222");
    expect(o("Tiền thuế")).toBe("333");
    expect(o("Tổng thanh toán")).toBe("444");
    expect(o("Tiền tệ")).toBe("USD");
    expect(o("Trạng thái xử lý (mã)")).toBe("7");
    expect(o("Trạng thái HĐ (mã)")).toBe("9");
    expect(o("Chiều")).toBe("sold");
    expect(o("Nguồn")).toBe("normal");
  });

  it("ĐỦ: header khớp EXPORT_COLUMNS, và dòng dữ liệu có đủ ngần ấy ô", async () => {
    const id = await seedInvoice(db, tenantA, { shdon: "1", ttcktmai: "1", ncnhat: new Date() });
    await seedLine(db, tenantA, id, { stt: 1, ten: HANG_1, sluong: "1" });

    const sheet = readXlsx(await xuat(), 1);
    expect(sheet.rows[0]?.map((c) => c.value)).toEqual(EXPORT_COLUMNS.map((c) => c.label));
    // Hàng dữ liệu phải có ĐÚNG số ô của header — thiếu ô là mọi thứ phía sau trượt cột.
    expect(sheet.rows[1]?.length).toBe(EXPORT_COLUMNS.length);
  });

  it("trường rỗng KHÔNG làm trượt cột (ô trống vẫn giữ chỗ)", async () => {
    // Hóa đơn thiếu nhiều trường — đúng hình dạng dữ liệu sco thật (dvtte/ttxly/tthai null).
    await seedInvoice(db, tenantA, {
      shdon: "9",
      nbten: NB_TEN,
      nmten: null,
      ncnhat: null,
      ttcktmai: null,
      dvtte: null,
      ttxly: null,
      tthai: null,
    });

    const sheet = readXlsx(await xuat(), 1);
    const header = sheet.rows[0]?.map((c) => c.value) ?? [];
    const data = sheet.rows[1]?.map((c) => c.value) ?? [];
    expect(data.length).toBe(header.length);
    // Giá trị CÓ vẫn nằm đúng ô, dù các ô quanh nó trống.
    expect(data[header.indexOf("Tên người bán")]).toBe(NB_TEN);
    expect(data[header.indexOf("Số HĐ")]).toBe("9");
    expect(data[header.indexOf("Nguồn")]).toBe("normal");
  });

  it("sheet 2 mang đúng dòng hàng của đúng hóa đơn", async () => {
    const a = await seedInvoice(db, tenantA, { shdon: "100" });
    const b = await seedInvoice(db, tenantA, {
      shdon: "200",
      tdlap: new Date("2026-04-10T08:00:00Z"),
    });
    await seedLine(db, tenantA, a, { stt: 1, ten: HANG_1, sluong: "5", dvtinh: "Lít" });
    await seedLine(db, tenantA, b, { stt: 1, ten: HANG_2, sluong: "9", dvtinh: "Kg" });

    const sheet = readXlsx(await xuat(), 2);
    const header = sheet.rows[0]?.map((c) => c.value) ?? [];
    const iSo = header.indexOf("Số HĐ");
    const iTen = header.indexOf("Tên hàng hóa/dịch vụ");
    const iSl = header.indexOf("Số lượng");
    const cap = sheet.rows.slice(1).map((r) => [r[iSo]?.value, r[iTen]?.value, r[iSl]?.value]);
    expect(cap).toEqual([
      ["100", HANG_1, "5"],
      ["200", HANG_2, "9"],
    ]);
  });

  it("sheet 2 PHẲNG: mỗi dòng hàng kèm đủ ngữ cảnh hóa đơn của CHÍNH nó (2026-07-21)", async () => {
    // Hai hóa đơn khác người bán; mỗi dòng hàng phải mang đúng người bán của HĐ nó thuộc về
    // — để lọc/pivot trong Excel không cần tra chéo sheet 1.
    const a = await seedInvoice(db, tenantA, {
      shdon: "100",
      nbten: "AAA Bán",
      nmten: "Khách A",
      chieu: "sold",
      tdlap: new Date("2026-06-01T03:00:00Z"),
    });
    const b = await seedInvoice(db, tenantA, {
      shdon: "200",
      nbten: "BBB Bán",
      nmten: "Khách B",
      chieu: "purchase",
      tdlap: new Date("2026-06-02T03:00:00Z"),
    });
    await seedLine(db, tenantA, a, { stt: 1, ten: "Vé xem phim", sluong: "3", dvtinh: "vé" });
    await seedLine(db, tenantA, b, { stt: 1, ten: "Xăng", sluong: "10", dvtinh: "Lít" });

    const sheet = readXlsx(await xuat(), 2);
    const h = sheet.rows[0]?.map((c) => c.value) ?? [];
    const o = (r: number, nhan: string) => sheet.rows[r]?.[h.indexOf(nhan)]?.value;

    const byShdon = new Map(
      sheet.rows.slice(1).map((r, i) => [r[h.indexOf("Số HĐ")]?.value, i + 1]),
    );
    const rA = byShdon.get("100") as number;
    const rB = byShdon.get("200") as number;

    // Dòng của HĐ 100: đủ ngữ cảnh của 100, KHÔNG lẫn của 200.
    expect(o(rA, "Ngày lập")).toBe("2026-06-01 03:00:00");
    expect(o(rA, "Tên người bán")).toBe("AAA Bán");
    expect(o(rA, "Tên người mua")).toBe("Khách A");
    expect(o(rA, "Chiều")).toBe("sold");
    expect(o(rA, "Tên hàng hóa/dịch vụ")).toBe("Vé xem phim");
    expect(o(rA, "ĐVT")).toBe("vé"); // đơn vị VẪN CÒN ở cột ĐVT riêng (chỉ bỏ ở sheet 1)
    expect(o(rA, "Số lượng")).toBe("3");
    // Dòng của HĐ 200: ngữ cảnh khác hẳn.
    expect(o(rB, "Tên người bán")).toBe("BBB Bán");
    expect(o(rB, "Chiều")).toBe("purchase");
  });
});

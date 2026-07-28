// U6 integration (PGlite) — tổng hợp (count + sum tiền) gom theo chiều. Tiền giữ
// dạng CHUỖI (cột numeric) — không ép float (mục 7.1: tránh sai số).
import { beforeEach, describe, expect, it } from "vitest";
import { summarizeInvoices } from "../../src/summarize";
import { type Db, freshDb, makeTenant, seedInvoice } from "../helpers";

describe("summarizeInvoices (integration, PGlite)", () => {
  let db: Db;
  let tenantA: string;

  beforeEach(async () => {
    db = await freshDb();
    tenantA = await makeTenant(db, "Cty A", "0100000001");
  });

  it("gom theo chiều: count + sum tiền đúng; tổng chung khớp", async () => {
    // purchase: 2 hóa đơn.
    await seedInvoice(db, tenantA, {
      shdon: "1",
      chieu: "purchase",
      tgtcthue: "1000000",
      tgtthue: "80000",
      tgtttbso: "1080000",
    });
    await seedInvoice(db, tenantA, {
      shdon: "2",
      tdlap: new Date("2026-04-13T09:00:00Z"),
      chieu: "purchase",
      tgtcthue: "2000000",
      tgtthue: "160000",
      tgtttbso: "2160000",
    });
    // sold: 1 hóa đơn.
    await seedInvoice(db, tenantA, {
      shdon: "3",
      chieu: "sold",
      tgtcthue: "5000000",
      tgtthue: "400000",
      tgtttbso: "5400000",
    });

    const s = await summarizeInvoices(db, tenantA, {});

    const purchase = s.byChieu.find((x) => x.chieu === "purchase");
    const sold = s.byChieu.find((x) => x.chieu === "sold");
    expect(purchase?.count).toBe(2);
    expect(Number(purchase?.tongTcthue)).toBe(3000000);
    expect(Number(purchase?.tongTthue)).toBe(240000);
    expect(typeof purchase?.tongTcthue).toBe("string"); // giữ chuỗi (không float)
    expect(sold?.count).toBe(1);
    expect(Number(sold?.tongTtbso)).toBe(5400000);

    expect(s.total.count).toBe(3);
    expect(Number(s.total.tongTcthue)).toBe(8000000);
    expect(Number(s.total.tongTthue)).toBe(640000);
    expect(Number(s.total.tongTtbso)).toBe(8640000);
  });

  it("tôn trọng bộ lọc (chỉ tổng hợp phần khớp)", async () => {
    await seedInvoice(db, tenantA, { shdon: "1", chieu: "purchase", tgtttbso: "1000000" });
    await seedInvoice(db, tenantA, { shdon: "2", chieu: "sold", tgtttbso: "9000000" });
    const s = await summarizeInvoices(db, tenantA, { chieu: "purchase" });
    expect(s.total.count).toBe(1);
    expect(Number(s.total.tongTtbso)).toBe(1000000);
  });

  it("giữ chính xác số lớn hơn 2^53 (không mất số qua float)", async () => {
    // 9007199254740993 = 2^53 + 1 (không biểu diễn được bằng double). Postgres numeric
    // cộng chính xác → chuỗi "9007199254740994"; nếu code ép Number sẽ sai.
    await seedInvoice(db, tenantA, { shdon: "1", chieu: "purchase", tgtcthue: "9007199254740993" });
    await seedInvoice(db, tenantA, {
      shdon: "2",
      tdlap: new Date("2026-04-13T09:00:00Z"),
      chieu: "purchase",
      tgtcthue: "1",
    });
    const s = await summarizeInvoices(db, tenantA, {});
    expect(s.total.tongTcthue).toBe("9007199254740994");
  });

  it("không có hóa đơn khớp → byChieu rỗng, total.count = 0", async () => {
    const s = await summarizeInvoices(db, tenantA, {});
    expect(s.byChieu).toEqual([]);
    expect(s.total.count).toBe(0);
  });
});

// U36 (QĐ-3/QĐ-4/QĐ-7) — hóa đơn `tthai=4` (BỊ THAY THẾ) đã mất hiệu lực, bản thay thế gánh
// toàn bộ giá trị ⇒ LOẠI khỏi mọi phép cộng TIỀN. Đo trên production 2026-07-28: doanh thu
// bán ra dôi 274.535.000đ, thuế đầu ra dôi 20.335.925đ vì đếm trùng cặp gốc + thay thế.
// Bằng chứng mã trạng thái: docs/BANG-CHUNG-ma-trang-thai-hoa-don-2026-07-28.md §3, §7.
describe("summarizeInvoices — loại tthai=4 khỏi TIỀN, giữ count (U36)", () => {
  let db: Db;
  let tenantA: string;

  beforeEach(async () => {
    db = await freshDb();
    tenantA = await makeTenant(db, "Cty A", "0100000001");
  });

  const hd = (shdon: string, over: Record<string, unknown> = {}) =>
    seedInvoice(db, tenantA, {
      shdon,
      chieu: "sold",
      tdlap: new Date(`2026-04-${shdon.padStart(2, "0")}T09:00:00Z`),
      tgtcthue: "1000000",
      tgtthue: "80000",
      tgtttbso: "1080000",
      ...over,
    });

  it("#1 tiền KHÔNG cộng hóa đơn mã 4; `count` VẪN đếm nó (QĐ-7)", async () => {
    await hd("01", { tthai: 4 });
    await hd("02", { tthai: 2 });

    const s = await summarizeInvoices(db, tenantA, {});
    // Tiền = chỉ hóa đơn mã 2.
    expect(s.total.tongTcthue).toBe("1000000");
    expect(s.total.tongTthue).toBe("80000");
    expect(s.total.tongTtbso).toBe("1080000");
    // count giữ nguyên nghĩa "khớp bộ lọc" — nếu trừ mã 4, kỳ chỉ có mã 4 sẽ cho count=0
    // và trang TỰ GỌI ĐỒNG BỘ lên Tổng cục Thuế (GDT đã phạt 429 ngày 2026-07-27).
    expect(s.total.count).toBe(2);
    expect(s.total.countTinhTong).toBe(1);
    expect(s.total.soLoaiKhoiTong).toBe(1);
  });

  it("#2 tthai = NULL VẪN được cộng (bẫy `NOT IN` + NULL)", async () => {
    await hd("01", { tthai: null });
    const s = await summarizeInvoices(db, tenantA, {});
    expect(s.total.tongTthue).toBe("80000");
    expect(s.total.countTinhTong).toBe(1);
    expect(s.total.soLoaiKhoiTong).toBe(0);
  });

  it("#3 tthai = 5 (bị điều chỉnh) VẪN được cộng — cặp 3/5 cho tổng 0", async () => {
    // Bản gốc bị điều chỉnh CÒN hiệu lực; hóa đơn điều chỉnh chỉ ghi phần giảm (biên bản §7).
    await hd("01", { tthai: 5, tgtthue: "266667", tgtttbso: "3600000" });
    await hd("02", { tthai: 3, tgtthue: "-266667", tgtttbso: "-3600000" });
    const s = await summarizeInvoices(db, tenantA, {});
    expect(s.total.tongTthue).toBe("0");
    expect(s.total.tongTtbso).toBe("0");
    expect(s.total.soLoaiKhoiTong).toBe(0);
  });

  it("#4 kỳ CHỈ có mã 4 → thueDaLoai là SỐ, không null (bẫy SUM tập rỗng)", async () => {
    await hd("01", { tthai: 4, tgtthue: "1711111", tgtttbso: "23100000" });
    const s = await summarizeInvoices(db, tenantA, {});
    const sold = s.byChieu.find((x) => x.chieu === "sold");
    expect(sold?.thueDaLoai).toBe("1711111");
    expect(sold?.ttbsoDaLoai).toBe("23100000");
    // Không có hóa đơn mã 2/3 nào → phải là "0", KHÔNG null (giao diện luôn hiển thị số).
    expect(sold?.thueThayTheDieuChinh).toBe("0");
    expect(sold?.ttbsoThayTheDieuChinh).toBe("0");
  });

  it("#6 một chiều TOÀN mã 4 vẫn CÒN trong byChieu, countTinhTong = 0", async () => {
    // Bẫy: đặt loại trừ vào WHERE sẽ làm cả nhóm biến mất khỏi `group by chieu`.
    await hd("01", { chieu: "sold", tthai: 4 });
    await hd("02", { chieu: "purchase", tthai: 1 });
    const s = await summarizeInvoices(db, tenantA, {});
    const sold = s.byChieu.find((x) => x.chieu === "sold");
    expect(sold).toBeDefined();
    expect(sold?.count).toBe(1);
    expect(sold?.countTinhTong).toBe(0);
    expect(sold?.soLoaiKhoiTong).toBe(1);
    expect(sold?.tongTthue).toBeNull(); // QĐ-10: tổng tiền giữ nullable, KHÔNG coalesce
  });

  it("số đếm theo loại thay đổi, tách ĐÚNG CHIỀU (không trộn mua vào với bán ra)", async () => {
    await hd("01", { chieu: "sold", tthai: 2 });
    await hd("02", { chieu: "sold", tthai: 3 });
    await hd("03", { chieu: "sold", tthai: 5 });
    await hd("04", { chieu: "purchase", tthai: 2 });

    const s = await summarizeInvoices(db, tenantA, {});
    const sold = s.byChieu.find((x) => x.chieu === "sold");
    const purchase = s.byChieu.find((x) => x.chieu === "purchase");
    expect(sold?.soHdThayThe).toBe(1);
    expect(sold?.soHdDieuChinh).toBe(1);
    expect(sold?.soDuocDieuChinh).toBe(1);
    expect(purchase?.soHdThayThe).toBe(1);
    expect(purchase?.soHdDieuChinh).toBe(0);
    // Σ tiền của mã 2 và 3 lập trong kỳ — quy mô cần rà soát, ĐÃ nằm trong tổng.
    expect(sold?.thueThayTheDieuChinh).toBe("160000");
  });

  it("#16 mã ngoài 1–5 → đếm vào soMaLa, nhưng VẪN cộng tiền (QĐ-6)", async () => {
    await hd("01", { tthai: 9 });
    const s = await summarizeInvoices(db, tenantA, {});
    const sold = s.byChieu.find((x) => x.chieu === "sold");
    expect(sold?.soMaLa).toBe(1);
    expect(sold?.tongTthue).toBe("80000"); // không tự ý loại thứ chưa hiểu
    expect(sold?.soLoaiKhoiTong).toBe(0);
  });

  it("tthai NULL KHÔNG phải 'mã lạ' — thiếu mã khác với mã chưa biết", async () => {
    await hd("01", { tthai: null });
    const s = await summarizeInvoices(db, tenantA, {});
    expect(s.byChieu.find((x) => x.chieu === "sold")?.soMaLa).toBe(0);
  });

  it("#18 chuỗi nhiều đời A→B→C (A=4, B=4, C=2): loại đúng HAI bản mã 4", async () => {
    // Chưa quan sát ca này trong 33.929 hóa đơn (§7.3) — test khóa hành vi trước.
    // Công thức "ròng" kiểu Σ(2)−Σ(4) sẽ trừ HAI lần ở đây; quy tắc loại mã 4 thì vẫn đúng.
    await hd("01", { tthai: 4, tgtthue: "100" });
    await hd("02", { tthai: 4, tgtthue: "200" });
    await hd("03", { tthai: 2, tgtthue: "300" });
    const s = await summarizeInvoices(db, tenantA, {});
    expect(s.total.tongTthue).toBe("300");
    expect(s.total.soLoaiKhoiTong).toBe(2);
    expect(s.byChieu.find((x) => x.chieu === "sold")?.thueDaLoai).toBe("300");
  });

  it("#17 giữ chính xác > 2^53 kể cả khi có loại trừ (không ép float)", async () => {
    await hd("01", { tthai: 1, tgtcthue: "9007199254740993" });
    await hd("02", { tthai: 4, tgtcthue: "9007199254740993" });
    const s = await summarizeInvoices(db, tenantA, {});
    expect(s.total.tongTcthue).toBe("9007199254740993");
    expect(s.byChieu.find((x) => x.chieu === "sold")?.thueDaLoai).toBe("80000");
  });

  it("#19 CÁCH LY TENANT: mã 4 của tenant B không ảnh hưởng số của A", async () => {
    const tenantB = await makeTenant(db, "Cty B", "0100000009");
    await hd("01", { tthai: 1 });
    await seedInvoice(db, tenantB, { shdon: "01", chieu: "sold", tthai: 4, tgtthue: "999999" });

    const a = await summarizeInvoices(db, tenantA, {});
    expect(a.total.count).toBe(1);
    expect(a.total.soLoaiKhoiTong).toBe(0);
    expect(a.byChieu.find((x) => x.chieu === "sold")?.thueDaLoai).toBe("0");

    const b = await summarizeInvoices(db, tenantB, {});
    expect(b.byChieu.find((x) => x.chieu === "sold")?.thueDaLoai).toBe("999999");
  });

  it("tenant chưa có dữ liệu → byChieu rỗng, total.count = 0 (giao diện phải chịu được)", async () => {
    const s = await summarizeInvoices(db, tenantA, {});
    expect(s.byChieu).toEqual([]);
    expect(s.total.count).toBe(0);
    expect(s.total.countTinhTong).toBe(0);
    expect(s.total.soLoaiKhoiTong).toBe(0);
  });
});

// U39 — bộ BA số tiền cho nhóm hóa đơn BỊ SỬA. Trước đây chỉ có `thueDaLoai`/`ttbsoDaLoai`
// (mã 4) — THIẾU tiền trước thuế, và mã 5 không có số tiền nào. Chủ dự án yêu cầu thống kê
// đủ: tiền trước thuế · tiền thuế · tổng sau thuế.
//
// ⚠️ Mã 4 và mã 5 để RIÊNG, không gộp: mã 4 KHÔNG tính vào tổng, mã 5 VẪN tính. Gộp tiền
// của chúng vào một con số là trộn hai ý nghĩa trái ngược.
describe("summarizeInvoices — bộ ba số tiền cho hóa đơn bị sửa (U39)", () => {
  let db: Db;
  let tenantA: string;

  beforeEach(async () => {
    db = await freshDb();
    tenantA = await makeTenant(db, "Cty A", "0100000001");
  });

  const hd = (shdon: string, over: Record<string, unknown> = {}) =>
    seedInvoice(db, tenantA, {
      shdon,
      chieu: "sold",
      tdlap: new Date(`2026-04-${shdon.padStart(2, "0")}T09:00:00Z`),
      tgtcthue: "1000000",
      tgtthue: "80000",
      tgtttbso: "1080000",
      ...over,
    });

  it("mã 4 → đủ ba số: trước thuế, thuế, tổng sau thuế", async () => {
    await hd("01", { tthai: 4, tgtcthue: "21388889", tgtthue: "1711111", tgtttbso: "23100000" });
    const s = await summarizeInvoices(db, tenantA, {});
    const sold = s.byChieu.find((x) => x.chieu === "sold");
    expect(sold?.tcthueDaLoai).toBe("21388889");
    expect(sold?.thueDaLoai).toBe("1711111");
    expect(sold?.ttbsoDaLoai).toBe("23100000");
  });

  it("mã 5 → có bộ ba RIÊNG, không lẫn vào số của mã 4", async () => {
    await hd("01", { tthai: 4, tgtcthue: "100", tgtthue: "10", tgtttbso: "110" });
    await hd("02", { tthai: 5, tgtcthue: "3333333", tgtthue: "266667", tgtttbso: "3600000" });
    const s = await summarizeInvoices(db, tenantA, {});
    const sold = s.byChieu.find((x) => x.chieu === "sold");
    expect(sold?.tcthueDaLoai).toBe("100"); // CHỈ mã 4
    expect(sold?.tcthueBiDieuChinh).toBe("3333333"); // CHỈ mã 5
    expect(sold?.thueBiDieuChinh).toBe("266667");
    expect(sold?.ttbsoBiDieuChinh).toBe("3600000");
  });

  it("không có mã 4/5 → cả sáu số là '0', KHÔNG null (giao diện luôn hiện số)", async () => {
    await hd("01", { tthai: 1 });
    const s = await summarizeInvoices(db, tenantA, {});
    const sold = s.byChieu.find((x) => x.chieu === "sold");
    for (const v of [
      sold?.tcthueDaLoai,
      sold?.thueDaLoai,
      sold?.ttbsoDaLoai,
      sold?.tcthueBiDieuChinh,
      sold?.thueBiDieuChinh,
      sold?.ttbsoBiDieuChinh,
    ]) {
      expect(v).toBe("0");
    }
  });

  it("mã 5 VẪN nằm trong tổng tiền, mã 4 thì KHÔNG — bất biến QĐ-4 không đổi", async () => {
    await hd("01", { tthai: 4, tgtthue: "999" });
    await hd("02", { tthai: 5, tgtthue: "111" });
    const s = await summarizeInvoices(db, tenantA, {});
    expect(s.total.tongTthue).toBe("111");
  });

  it("giữ chính xác số > 2^53 ở nhóm bị sửa", async () => {
    await hd("01", { tthai: 4, tgtcthue: "9007199254740993" });
    const s = await summarizeInvoices(db, tenantA, {});
    expect(s.byChieu.find((x) => x.chieu === "sold")?.tcthueDaLoai).toBe("9007199254740993");
  });
});

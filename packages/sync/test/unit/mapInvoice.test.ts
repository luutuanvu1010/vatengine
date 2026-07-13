import type { InvoiceRow } from "@vat/gdt-client";
import { describe, expect, it } from "vitest";
import { mapInvoiceRowToHoaDon } from "../../src/mapInvoice";

const TENANT = "11111111-1111-1111-1111-111111111111";

// Dòng hóa đơn giả theo ĐÚNG định dạng đã kiểm chứng (ADR-0001 Amendment #7):
// tdlap = ISO-8601 UTC KHÔNG mili giây; ncnhat = ISO-8601 UTC CÓ mili giây;
// tiền = JSON number; ttxly/tthai = JSON integer. Giá trị placeholder, KHÔNG dữ liệu thật.
function row(over: Record<string, unknown> = {}): InvoiceRow {
  return {
    nbmst: "0100000001",
    nbten: "Cty Bán X",
    nmmst: "0100000002",
    nmten: "Cty Mua Y",
    khmshdon: "1",
    khhdon: "C26TAA",
    shdon: "123",
    tdlap: "2026-04-12T17:00:00Z",
    ncnhat: "2026-04-13T09:44:51.456Z",
    tgtcthue: 1000000,
    tgtthue: 80000,
    tgtttbso: 1080000,
    ttcktmai: 0,
    dvtte: "VND",
    tgia: 1,
    ttxly: 8,
    tthai: 1,
    _source: "normal",
    _direction: "purchase",
    ...over,
  };
}

describe("mapInvoiceRowToHoaDon", () => {
  it("(1) ánh xạ đủ trường header + chieu/nguon + rawJson; tdlap/ncnhat → Date đúng thời khắc UTC", () => {
    const m = mapInvoiceRowToHoaDon(row(), TENANT);

    expect(m.tenantId).toBe(TENANT);
    expect(m.nbmst).toBe("0100000001");
    expect(m.nbten).toBe("Cty Bán X");
    expect(m.nmmst).toBe("0100000002");
    expect(m.nmten).toBe("Cty Mua Y");
    expect(m.khmshdon).toBe("1");
    expect(m.khhdon).toBe("C26TAA");
    expect(m.shdon).toBe("123");

    // tdlap: lưu NGUYÊN thời khắc UTC (không tự quy đổi múi giờ) — Amendment #7.
    expect(m.tdlap).toBeInstanceOf(Date);
    expect((m.tdlap as Date).toISOString()).toBe("2026-04-12T17:00:00.000Z");
    expect(m.ncnhat).toBeInstanceOf(Date);
    expect((m.ncnhat as Date).toISOString()).toBe("2026-04-13T09:44:51.456Z");

    // chieu ← _direction, nguon ← _source; rawJson giữ NGUYÊN dòng gốc.
    expect(m.chieu).toBe("purchase");
    expect(m.nguon).toBe("normal");
    expect(m.rawJson).toEqual(row());

    // ttxly/tthai giữ dạng số nguyên.
    expect(m.ttxly).toBe(8);
    expect(m.tthai).toBe(1);
  });

  it("(2) chịu được trường tùy chọn thiếu (nmmst/nmten/tiền null) — không ném, cột null hợp lệ", () => {
    const m = mapInvoiceRowToHoaDon(
      row({ nmmst: undefined, nmten: null, tgtthue: null, dvtte: undefined, ttxly: null }),
      TENANT,
    );
    expect(m.nmmst ?? null).toBeNull();
    expect(m.nmten ?? null).toBeNull();
    expect(m.tgtthue ?? null).toBeNull();
    expect(m.dvtte ?? null).toBeNull();
    expect(m.ttxly ?? null).toBeNull();
    // Khóa tự nhiên vẫn còn nguyên.
    expect(m.nbmst).toBe("0100000001");
    expect(m.shdon).toBe("123");
  });

  it("tiền là số → lưu chuỗi numeric; giá trị lớn dạng khoa học không mất số (Amendment #7)", () => {
    // 1.4727778E7 trên dây (wire) đã được JSON.parse thành number 14727778 trước khi
    // tới mapper — kiểm để không ai đổi sang xử lý chuỗi rồi vỡ ở dạng khoa học.
    const m = mapInvoiceRowToHoaDon(row({ tgtttbso: 1.4727778e7 }), TENANT);
    expect(typeof m.tgtttbso).toBe("string");
    expect(m.tgtttbso).toBe("14727778");
  });

  it("tiền dạng chuỗi số cũng được giữ nguyên (phòng thủ nếu GDT đổi kiểu)", () => {
    const m = mapInvoiceRowToHoaDon(row({ tgtcthue: "999999.5" }), TENANT);
    expect(m.tgtcthue).toBe("999999.5");
  });

  it("FAIL-LOUD: tdlap thiếu/không parse được → ném lỗi (không âm thầm lưu sai khóa tự nhiên)", () => {
    expect(() => mapInvoiceRowToHoaDon(row({ tdlap: undefined }), TENANT)).toThrow();
    expect(() => mapInvoiceRowToHoaDon(row({ tdlap: "khong-phai-ngay" }), TENANT)).toThrow();
  });

  it("trường khóa null → ép chuỗi rỗng (cột NOT NULL không nhận null)", () => {
    const m = mapInvoiceRowToHoaDon(row({ nbmst: null }), TENANT);
    expect(m.nbmst).toBe("");
  });

  it("ttxly không phải số → null (không ép bừa thành NaN)", () => {
    const m = mapInvoiceRowToHoaDon(row({ ttxly: "khong-phai-so" }), TENANT);
    expect(m.ttxly ?? null).toBeNull();
  });
});

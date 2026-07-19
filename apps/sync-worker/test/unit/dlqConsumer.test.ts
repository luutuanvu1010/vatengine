import { describe, expect, it } from "vitest";
import { dlqRecord } from "../../src/dlqConsumer";

describe("H-B.6 — dlqRecord (thuần)", () => {
  it("message header → loai 'header' + doiTuong theo kỳ/chiều", () => {
    const r = dlqRecord({
      tenantId: "t1",
      taikhoanId: "a1",
      direction: "purchase",
      dateFrom: "01/07/2026",
      dateTo: "31/07/2026",
      period: "2026-07",
    });
    expect(r.loai).toBe("header");
    expect(r.doiTuong).toBe("ky:2026-07:purchase");
    expect(r.lyDo).toBe("max_retries"); // CHƯA KIỂM CHỨNG: CF không truyền lý do → mặc định
  });
  it("message detail → loai 'detail' + doiTuong theo hóa đơn", () => {
    const r = dlqRecord({
      kind: "detail",
      tenantId: "t1",
      taikhoanId: "a1",
      hoaDonId: "hd9",
      ref: { nbmst: "x", khhdon: "1", khmshdon: "1", shdon: "5", source: "normal" },
    });
    expect(r.loai).toBe("detail");
    expect(r.doiTuong).toBe("hoadon:hd9");
  });
});

import { describe, expect, it } from "vitest";
import { dlqConsume, dlqRecord } from "../../src/dlqConsumer";

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

  it("dlqConsume ghi 1 hàng dong_bo_that_bai + 1 audit qua withTenant", async () => {
    const inserted: unknown[] = [];
    const tx = {
      // withTenant gọi tx.execute(set_config) TRƯỚC fn → mock phải có execute.
      execute: async () => ({ rows: [] }),
      insert: (_table: unknown) => ({
        values: async (values: unknown) => {
          inserted.push(values);
        },
      }),
    };
    // Giả withTenant: db.transaction(fn) → fn(tx). (withTenant tự gọi tx.execute bên trong.)
    const db = {
      transaction: async (fn: (t: typeof tx) => Promise<void>) => fn(tx),
    } as unknown as import("../../src/types").AnyDb;
    await dlqConsume(db, {
      tenantId: "t1",
      taikhoanId: "a1",
      direction: "sold",
      dateFrom: "01/07/2026",
      dateTo: "31/07/2026",
      period: "2026-07",
    });
    expect(inserted.length).toBe(2); // dong_bo_that_bai + audit_log
  });
});

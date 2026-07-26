import { describe, expect, it } from "vitest";
import { dlqConsume, dlqRecord } from "../../src/dlqConsumer";
import type { AnyDb } from "../../src/types";

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

  // I2 (nhãn `loai` sai) — audit/delta đang bị dán "header" trước khi vá.
  it("message audit → loai 'audit' (KHÔNG 'header')", () => {
    const r = dlqRecord({
      kind: "audit",
      tenantId: "t1",
      taikhoanId: "a1",
      direction: "purchase",
      dateFrom: "01/07/2026",
      dateTo: "31/07/2026",
      period: "2026-07",
      vong: 1,
      lanDongBoId: "ldb-1",
    });
    expect(r.loai).toBe("audit");
    expect(r.doiTuong).toBe("ky:2026-07:purchase");
  });

  it("message delta → loai 'delta' (KHÔNG 'header')", () => {
    const r = dlqRecord({
      kind: "delta",
      tenantId: "t1",
      taikhoanId: "a1",
      direction: "sold",
      dateFrom: "01/07/2026",
      dateTo: "31/07/2026",
      period: "2026-07",
      lanDongBoId: "ldb-1",
      family: "normal",
      conLai: ["sco"],
      vong: 1,
      prevCount: 3,
    });
    expect(r.loai).toBe("delta");
    expect(r.doiTuong).toBe("ky:2026-07:sold");
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
    } as unknown as AnyDb;
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

describe("I2 — dlqConsume CHỐT run 'lan_dong_bo' đang mở TRƯỚC khi ack (không để treo 'running')", () => {
  function makeDb() {
    const inserted: Array<Record<string, unknown>> = [];
    const updated: Array<{ table: unknown; values: Record<string, unknown> }> = [];
    const tx = {
      execute: async () => ({ rows: [] }),
      insert: (_table: unknown) => ({
        values: async (values: Record<string, unknown>) => {
          inserted.push(values);
        },
      }),
      // chotDeltaRun (packages/sync) chạy tx.update(lanDongBo).set(kq).where(...).
      update: (table: unknown) => ({
        set: (values: Record<string, unknown>) => ({
          where: async () => {
            updated.push({ table, values });
          },
        }),
      }),
    };
    const db = {
      transaction: async (fn: (t: typeof tx) => Promise<void>) => fn(tx),
    } as unknown as AnyDb;
    return { db, inserted, updated };
  }

  it("message delta rơi DLQ → run bị CHỐT failed + sổ ghi loai 'delta'", async () => {
    const { db, inserted, updated } = makeDb();
    await dlqConsume(db, {
      kind: "delta",
      tenantId: "t1",
      taikhoanId: "a1",
      direction: "purchase",
      dateFrom: "01/07/2026",
      dateTo: "31/07/2026",
      period: "2026-07",
      lanDongBoId: "ldb-1",
      family: "normal",
      conLai: ["sco"],
      vong: 1,
      prevCount: 3,
    });
    expect(inserted.find((r) => r.loai === "delta")).toBeTruthy();
    expect(updated).toHaveLength(1);
    expect(updated[0]?.values.trangThai).toBe("failed");
    expect(typeof updated[0]?.values.thongDiepLoi).toBe("string");
  });

  it("message audit KHÔNG có lanDongBoId (vòng 0) → KHÔNG gọi chốt (không có run nào mở)", async () => {
    const { db, inserted, updated } = makeDb();
    await dlqConsume(db, {
      kind: "audit",
      tenantId: "t1",
      taikhoanId: "a1",
      direction: "purchase",
      dateFrom: "01/07/2026",
      dateTo: "31/07/2026",
      period: "2026-07",
      vong: 0,
    });
    expect(inserted.find((r) => r.loai === "audit")).toBeTruthy();
    expect(updated).toEqual([]);
  });

  it("message audit CÓ lanDongBoId (vòng ≥1) → CHỐT run failed", async () => {
    const { db, updated } = makeDb();
    await dlqConsume(db, {
      kind: "audit",
      tenantId: "t1",
      taikhoanId: "a1",
      direction: "purchase",
      dateFrom: "01/07/2026",
      dateTo: "31/07/2026",
      period: "2026-07",
      vong: 1,
      lanDongBoId: "ldb-9",
    });
    expect(updated).toHaveLength(1);
    expect(updated[0]?.values.trangThai).toBe("failed");
  });

  it("message header (không kind, không lanDongBoId) → KHÔNG gọi chốt", async () => {
    const { db, updated } = makeDb();
    await dlqConsume(db, {
      tenantId: "t1",
      taikhoanId: "a1",
      direction: "purchase",
      dateFrom: "01/07/2026",
      dateTo: "31/07/2026",
      period: "2026-07",
    });
    expect(updated).toEqual([]);
  });
});

// U22 B4 — Test THUẦN (unit, offline) cho logic tracker backfill (docs/plans/U22-plan.md
// §4C PA-A). Logic thuần tách khỏi wiring Durable Object (backfillTrackerDO.ts) — cùng
// khuôn loginLimiter/loginLimiterDO: DO chỉ nạp/lưu + ủy quyền cho các hàm dưới đây.
import { describe, expect, it } from "vitest";
import { type BackfillDef, initDef, readDef } from "../../src/backfillTracker";

const defA: BackfillDef = {
  tenantId: "ten-A",
  taikhoanId: "tk-1",
  months: ["2026-01", "2026-02"],
  directions: ["purchase", "sold"],
  createdAtMs: 1_000,
};

describe("initDef — khởi tạo store-once (idempotent) + cách ly tenant", () => {
  it("chưa có def → status 'created', def = incoming", () => {
    expect(initDef(undefined, defA)).toEqual({ status: "created", def: defA });
  });

  it("ĐÃ có def CÙNG tenant → status 'exists', GIỮ NGUYÊN def cũ (không ghi đè — nền AC5)", () => {
    const incoming: BackfillDef = { ...defA, months: ["2026-03"], createdAtMs: 9_999 };
    const r = initDef(defA, incoming);
    expect(r).toEqual({ status: "exists", def: defA }); // giữ tháng+thời điểm gốc, KHÔNG lấy incoming
    if (r.status === "exists") expect(r.def.months).toEqual(["2026-01", "2026-02"]);
  });

  it("ĐÃ có def của tenant KHÁC (trùng backfillId) → 'conflict', KHÔNG rò def chéo tenant", () => {
    // Cách ly tenant nhất quán với readDef: nếu backfillId (UUID) đã thuộc tenant khác,
    // KHÔNG echo lại def của tenant kia (taikhoanId/months...) cho người gọi.
    const incoming: BackfillDef = { ...defA, tenantId: "ten-B", taikhoanId: "tk-B" };
    const r = initDef(defA, incoming);
    expect(r).toEqual({ status: "conflict" });
    expect("def" in r).toBe(false); // tuyệt đối không kèm def của ten-A
  });
});

describe("readDef — đọc có kiểm PHẠM VI TENANT (cách ly)", () => {
  it("chưa init (undefined) → null", () => {
    expect(readDef(undefined, "ten-A")).toBeNull();
  });

  it("def của tenant KHÁC → null (KHÔNG rò tồn tại chéo tenant — như 404)", () => {
    expect(readDef(defA, "ten-B")).toBeNull();
  });

  it("đúng tenant → trả def", () => {
    expect(readDef(defA, "ten-A")).toEqual(defA);
  });
});

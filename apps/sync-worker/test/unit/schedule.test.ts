// U9 — Test logic lịch (nhóm unit, thuần, offline): cửa sổ kỳ hiện tại theo GIỜ VN
// (UTC+7) + dựng message job. Không chạm DB/mạng. Ngày cố định qua nowMs → xác định.
import { describe, expect, it } from "vitest";
import { buildMessages, currentPeriodWindow } from "../../src/schedule";
import type { DueAccount } from "../../src/schedule";

describe("currentPeriodWindow — kỳ hiện tại theo giờ VN (UTC+7)", () => {
  it("giữa tháng: 2026-07-14 03:00 UTC (10:00 VN) → tháng 7/2026 đầy đủ", () => {
    const w = currentPeriodWindow(Date.UTC(2026, 6, 14, 3, 0, 0));
    expect(w).toEqual({ period: "2026-07", dateFrom: "01/07/2026", dateTo: "31/07/2026" });
  });

  it("biên tháng: 2026-07-31 17:30 UTC = 2026-08-01 00:30 VN → tháng 8/2026 (không phải 7)", () => {
    const w = currentPeriodWindow(Date.UTC(2026, 6, 31, 17, 30, 0));
    expect(w).toEqual({ period: "2026-08", dateFrom: "01/08/2026", dateTo: "31/08/2026" });
  });

  it("tháng 2 năm nhuận: 2028-02 → dateTo 29/02/2028", () => {
    const w = currentPeriodWindow(Date.UTC(2028, 1, 10, 0, 0, 0));
    expect(w).toEqual({ period: "2028-02", dateFrom: "01/02/2028", dateTo: "29/02/2028" });
  });

  it("tháng 2 năm thường: 2026-02 → dateTo 28/02/2026", () => {
    const w = currentPeriodWindow(Date.UTC(2026, 1, 10, 0, 0, 0));
    expect(w).toEqual({ period: "2026-02", dateFrom: "01/02/2026", dateTo: "28/02/2026" });
  });
});

describe("buildMessages — một message / (tài khoản × chiều), tenant_id tường minh", () => {
  const window = { period: "2026-07", dateFrom: "01/07/2026", dateTo: "31/07/2026" };
  const due: DueAccount[] = [
    { tenantId: "t-A", taikhoanId: "acc-A1" },
    { tenantId: "t-A", taikhoanId: "acc-A2" },
  ];

  it("2 tài khoản × 2 chiều = 4 message; mỗi message mang đủ khóa + tenant_id", () => {
    const msgs = buildMessages(due, window, ["purchase", "sold"]);
    expect(msgs).toHaveLength(4);
    // multi-tenant.md: job nền phải mang tenant_id tường minh — không message nào thiếu.
    expect(msgs.every((m) => typeof m.tenantId === "string" && m.tenantId.length > 0)).toBe(true);
    expect(msgs).toContainEqual({
      tenantId: "t-A",
      taikhoanId: "acc-A1",
      direction: "purchase",
      dateFrom: "01/07/2026",
      dateTo: "31/07/2026",
      period: "2026-07",
    });
    expect(msgs).toContainEqual({
      tenantId: "t-A",
      taikhoanId: "acc-A2",
      direction: "sold",
      dateFrom: "01/07/2026",
      dateTo: "31/07/2026",
      period: "2026-07",
    });
  });

  it("danh sách rỗng → không message nào", () => {
    expect(buildMessages([], window, ["purchase", "sold"])).toHaveLength(0);
  });
});

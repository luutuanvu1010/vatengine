import { describe, expect, it } from "vitest";
import {
  buildAuditMessages,
  buildSyncMessages,
  currentPeriodWindow,
  isAuditMessage,
  isDeltaMessage,
  monthlyWindows,
} from "../../src/syncJob";

describe("currentPeriodWindow — kỳ tháng hiện tại theo giờ VN", () => {
  it("giữa tháng: dateFrom=01, dateTo=ngày cuối, period=YYYY-MM", () => {
    // 2026-07-15T03:00:00Z = 10:00 VN 15/07 → tháng 7.
    const w = currentPeriodWindow(Date.UTC(2026, 6, 15, 3, 0, 0));
    expect(w.period).toBe("2026-07");
    expect(w.dateFrom).toBe("01/07/2026");
    expect(w.dateTo).toBe("31/07/2026");
  });

  it("biên tháng theo GIỜ VN: 2026-06-30T18:00Z = 01:00 VN 01/07 → thuộc tháng 7", () => {
    const w = currentPeriodWindow(Date.UTC(2026, 5, 30, 18, 0, 0));
    expect(w.period).toBe("2026-07");
    expect(w.dateFrom).toBe("01/07/2026");
  });

  it("tháng 2 (28 ngày, 2026 không nhuận): dateTo=28", () => {
    const w = currentPeriodWindow(Date.UTC(2026, 1, 10, 3, 0, 0));
    expect(w.dateTo).toBe("28/02/2026");
  });
});

describe("buildSyncMessages — một message / (tài khoản × chiều), tenant_id tường minh", () => {
  const window = { period: "2026-07", dateFrom: "01/07/2026", dateTo: "31/07/2026" };

  it("một tài khoản × 2 chiều → 2 message đúng payload", () => {
    const msgs = buildSyncMessages([{ tenantId: "t1", taikhoanId: "a1" }], window, [
      "purchase",
      "sold",
    ]);
    expect(msgs).toEqual([
      { tenantId: "t1", taikhoanId: "a1", direction: "purchase", ...window },
      { tenantId: "t1", taikhoanId: "a1", direction: "sold", ...window },
    ]);
  });

  it("nhiều tài khoản → tích Descartes tài khoản × chiều, giữ tenant_id mỗi payload", () => {
    const msgs = buildSyncMessages(
      [
        { tenantId: "t1", taikhoanId: "a1" },
        { tenantId: "t2", taikhoanId: "a2" },
      ],
      window,
      ["purchase"],
    );
    expect(msgs).toHaveLength(2);
    expect(msgs.map((m) => `${m.tenantId}:${m.taikhoanId}:${m.direction}`)).toEqual([
      "t1:a1:purchase",
      "t2:a2:purchase",
    ]);
  });
});

describe("buildAuditMessages — một message / (tháng × chiều), vong 0", () => {
  it("buildAuditMessages: 1 msg / (tháng × chiều), vong 0, kind audit", () => {
    const ws = monthlyWindows("2026-06-01", "2026-07-31"); // 2 tháng
    const msgs = buildAuditMessages({ tenantId: "t1", taikhoanId: "a1" }, ws, ["purchase", "sold"]);
    expect(msgs).toHaveLength(4);
    expect(msgs[0]).toMatchObject({
      kind: "audit",
      tenantId: "t1",
      taikhoanId: "a1",
      direction: "purchase",
      period: "2026-06",
      dateFrom: "01/06/2026",
      dateTo: "30/06/2026",
      vong: 0,
    });
  });
});

describe("type guards — isAuditMessage, isDeltaMessage", () => {
  it("guards phân nhánh đúng và không nhận nhầm nhau/legacy", () => {
    expect(isAuditMessage({ kind: "audit" })).toBe(true);
    expect(isDeltaMessage({ kind: "delta" })).toBe(true);
    expect(isAuditMessage({ kind: "detail" })).toBe(false);
    expect(isDeltaMessage({ period: "2026-06" })).toBe(false); // header legacy không kind
  });
});

// U22 B2 — Test thuần (unit, offline, KHÔNG mạng) cho `monthlyWindows` +
// `buildBackfillMessages` (docs/plans/U22-plan.md §4A, AC1). Tách một khoảng lọc
// `YYYY-MM-DD` thành danh sách cửa sổ THÁNG ĐẦY ĐỦ (giờ VN); dựng message backfill
// đúng dạng `SyncJobMessage` cho nhiều tháng × nhiều chiều. Phủ biên tháng/năm/nhuận
// và ca fail-loud (không đoán): sai định dạng, ngày phi thực tế, khoảng đảo ngược.
import { describe, expect, it } from "vitest";
import { buildBackfillMessages, monthlyWindows } from "../../src/syncJob";

describe("monthlyWindows — tách khoảng lọc thành cửa sổ tháng đầy đủ (AC1)", () => {
  it("cùng một tháng → 1 cửa sổ (căn 01→cuối tháng, KHÔNG cắt theo ngày lọc)", () => {
    expect(monthlyWindows("2026-04-05", "2026-04-25")).toEqual([
      { period: "2026-04", dateFrom: "01/04/2026", dateTo: "30/04/2026" },
    ]);
  });

  it("from == to (cùng một ngày) → đúng 1 cửa sổ của tháng đó", () => {
    expect(monthlyWindows("2026-07-16", "2026-07-16")).toEqual([
      { period: "2026-07", dateFrom: "01/07/2026", dateTo: "31/07/2026" },
    ]);
  });

  it("nhiều tháng trong cùng năm → mỗi tháng 1 cửa sổ, ngày cuối tháng đúng (31/30/31)", () => {
    expect(monthlyWindows("2026-03-15", "2026-05-20")).toEqual([
      { period: "2026-03", dateFrom: "01/03/2026", dateTo: "31/03/2026" },
      { period: "2026-04", dateFrom: "01/04/2026", dateTo: "30/04/2026" },
      { period: "2026-05", dateFrom: "01/05/2026", dateTo: "31/05/2026" },
    ]);
  });

  it("vắt qua năm → liệt kê đủ các tháng qua ranh giới năm (2 nhuận: Feb thường 28)", () => {
    expect(monthlyWindows("2025-11-10", "2026-02-03")).toEqual([
      { period: "2025-11", dateFrom: "01/11/2025", dateTo: "30/11/2025" },
      { period: "2025-12", dateFrom: "01/12/2025", dateTo: "31/12/2025" },
      { period: "2026-01", dateFrom: "01/01/2026", dateTo: "31/01/2026" },
      { period: "2026-02", dateFrom: "01/02/2026", dateTo: "28/02/2026" },
    ]);
  });

  it("tháng 2 năm NHUẬN → ngày cuối = 29", () => {
    expect(monthlyWindows("2024-02-01", "2024-02-15")).toEqual([
      { period: "2024-02", dateFrom: "01/02/2024", dateTo: "29/02/2024" },
    ]);
  });

  it("ngày đầu/cuối lệch giữa tháng KHÔNG ảnh hưởng biên tháng (31/07 → 01/08 = 2 cửa sổ đầy đủ)", () => {
    expect(monthlyWindows("2026-07-31", "2026-08-01")).toEqual([
      { period: "2026-07", dateFrom: "01/07/2026", dateTo: "31/07/2026" },
      { period: "2026-08", dateFrom: "01/08/2026", dateTo: "31/08/2026" },
    ]);
  });

  it("khoảng dài (12 tháng) → đúng 12 cửa sổ liên tục, không trùng, không thiếu", () => {
    const ws = monthlyWindows("2025-01-01", "2025-12-31");
    expect(ws).toHaveLength(12);
    expect(ws[0]?.period).toBe("2025-01");
    expect(ws[11]?.period).toBe("2025-12");
    expect(ws[11]?.dateTo).toBe("31/12/2025");
    // liên tục, không lặp
    expect(new Set(ws.map((w) => w.period)).size).toBe(12);
  });

  // Fail-loud (Hiến pháp §Khi gặp mơ hồ — không đoán, báo lỗi rõ):
  it("sai định dạng (không phải YYYY-MM-DD) → ném lỗi rõ", () => {
    expect(() => monthlyWindows("01/04/2026", "30/04/2026")).toThrow(/YYYY-MM-DD/);
  });

  it("ngày phi thực tế (2026-02-30) → ném (không cuộn âm thầm sang tháng khác)", () => {
    expect(() => monthlyWindows("2026-02-30", "2026-03-10")).toThrow(/không có thật/);
  });

  it("khoảng đảo ngược (tuNgay sau denNgay) → ném (không đoán ý người dùng)", () => {
    expect(() => monthlyWindows("2026-05-01", "2026-03-01")).toThrow(/không hợp lệ/);
  });
});

describe("buildBackfillMessages — dựng job nhiều tháng × nhiều chiều (AC1/AC3)", () => {
  const account = { tenantId: "ten-1", taikhoanId: "tk-1" };

  it("N cửa sổ × M chiều → N*M message, mỗi message gắn đúng tenant/tài khoản/chiều/kỳ", () => {
    const windows = monthlyWindows("2026-03-15", "2026-04-20"); // 2 tháng
    const msgs = buildBackfillMessages(account, windows, ["purchase", "sold"]);

    expect(msgs).toHaveLength(4); // 2 tháng × 2 chiều
    // tenant_id + taikhoan_id đi TƯỜNG MINH trong MỌI payload (multi-tenant.md).
    expect(msgs.every((m) => m.tenantId === "ten-1" && m.taikhoanId === "tk-1")).toBe(true);

    expect(msgs).toEqual([
      {
        tenantId: "ten-1",
        taikhoanId: "tk-1",
        direction: "purchase",
        dateFrom: "01/03/2026",
        dateTo: "31/03/2026",
        period: "2026-03",
      },
      {
        tenantId: "ten-1",
        taikhoanId: "tk-1",
        direction: "sold",
        dateFrom: "01/03/2026",
        dateTo: "31/03/2026",
        period: "2026-03",
      },
      {
        tenantId: "ten-1",
        taikhoanId: "tk-1",
        direction: "purchase",
        dateFrom: "01/04/2026",
        dateTo: "30/04/2026",
        period: "2026-04",
      },
      {
        tenantId: "ten-1",
        taikhoanId: "tk-1",
        direction: "sold",
        dateFrom: "01/04/2026",
        dateTo: "30/04/2026",
        period: "2026-04",
      },
    ]);
  });

  it("một chiều duy nhất → mỗi tháng đúng 1 message", () => {
    const windows = monthlyWindows("2026-01-01", "2026-03-31"); // 3 tháng
    const msgs = buildBackfillMessages(account, windows, ["purchase"]);
    expect(msgs).toHaveLength(3);
    expect(msgs.map((m) => m.period)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(msgs.every((m) => m.direction === "purchase")).toBe(true);
  });

  it("không có cửa sổ → không message (biên rỗng an toàn)", () => {
    expect(buildBackfillMessages(account, [], ["purchase", "sold"])).toEqual([]);
  });
});

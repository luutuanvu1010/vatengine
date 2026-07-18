// U22 B6 — Test THUẦN (unit, offline) cho `deriveBackfillStatus` (docs/plans/U22-plan.md
// AC4): suy trạng thái TỪNG THÁNG (cho|dang_chay|xong|loi) + trạng thái TỔNG cho một
// backfill, từ các bản ghi `lan_dong_bo`. Một tháng "xong" = MỌI chiều đã `completed`.
import { TRANG_THAI_LAN_DONG_BO } from "@vat/db";
import type { InvoiceDirection } from "@vat/gdt-client";
import { describe, expect, it } from "vitest";
import { deriveBackfillStatus } from "../../src/coverage";

const DIRS: InvoiceDirection[] = ["purchase", "sold"];
const MONTHS = ["2026-01", "2026-02", "2026-03"];
const S = TRANG_THAI_LAN_DONG_BO;

function row(period: string, chieu: InvoiceDirection, trangThai: string) {
  return { period, chieu, trangThai };
}
const statuses = (p: ReturnType<typeof deriveBackfillStatus>) => p.thang.map((t) => t.trangThai);

describe("deriveBackfillStatus — suy tiến độ backfill từng tháng + tổng (AC4)", () => {
  it("chưa có bản ghi nào → mọi tháng 'cho', tổng 'dang_chay', soXong=0", () => {
    const p = deriveBackfillStatus([], DIRS, MONTHS);
    expect(statuses(p)).toEqual(["cho", "cho", "cho"]);
    expect(p.soXong).toBe(0);
    expect(p.tongSoThang).toBe(3);
    expect(p.trangThaiTong).toBe("dang_chay");
  });

  it("mọi tháng completed CẢ 2 CHIỀU → mọi tháng 'xong', tổng 'hoan_thanh'", () => {
    const rows = MONTHS.flatMap((m) => DIRS.map((d) => row(m, d, S.HOAN_THANH)));
    const p = deriveBackfillStatus(rows, DIRS, MONTHS);
    expect(statuses(p)).toEqual(["xong", "xong", "xong"]);
    expect(p.soXong).toBe(3);
    expect(p.trangThaiTong).toBe("hoan_thanh");
  });

  it("một chiều completed, chiều kia CHƯA → tháng đó 'dang_chay' (chưa 'xong')", () => {
    // 2026-01 xong cả 2; 2026-02 chỉ purchase xong (sold chưa) → dang_chay; 2026-03 trống.
    const rows = [
      row("2026-01", "purchase", S.HOAN_THANH),
      row("2026-01", "sold", S.HOAN_THANH),
      row("2026-02", "purchase", S.HOAN_THANH),
    ];
    const p = deriveBackfillStatus(rows, DIRS, MONTHS);
    expect(statuses(p)).toEqual(["xong", "dang_chay", "cho"]);
    expect(p.soXong).toBe(1);
    expect(p.trangThaiTong).toBe("dang_chay");
  });

  it("có bản ghi 'running' → tháng 'dang_chay'", () => {
    const rows = [row("2026-01", "purchase", S.DANG_CHAY)];
    const p = deriveBackfillStatus(rows, DIRS, MONTHS);
    expect(p.thang[0]?.trangThai).toBe("dang_chay");
  });

  it("chiều 'can_dang_nhap_lai' → tháng 'loi' + tổng 'can_dang_nhap_lai' (ưu tiên báo đăng nhập lại)", () => {
    const rows = [
      row("2026-01", "purchase", S.HOAN_THANH),
      row("2026-01", "sold", S.HOAN_THANH),
      row("2026-02", "sold", S.CAN_DANG_NHAP_LAI),
    ];
    const p = deriveBackfillStatus(rows, DIRS, MONTHS);
    expect(p.thang[1]?.trangThai).toBe("loi");
    expect(p.trangThaiTong).toBe("can_dang_nhap_lai");
  });

  it("chiều 'failed' (không reauth) → tháng 'loi' + tổng 'co_loi'", () => {
    const rows = [row("2026-03", "purchase", S.THAT_BAI)];
    const p = deriveBackfillStatus(rows, DIRS, MONTHS);
    expect(p.thang[2]?.trangThai).toBe("loi");
    expect(p.trangThaiTong).toBe("co_loi");
  });

  it("reauth ƯU TIÊN hơn failed ở trạng thái TỔNG", () => {
    const rows = [
      row("2026-01", "purchase", S.THAT_BAI), // 1 tháng failed
      row("2026-02", "sold", S.CAN_DANG_NHAP_LAI), // 1 tháng reauth
    ];
    const p = deriveBackfillStatus(rows, DIRS, MONTHS);
    expect(p.trangThaiTong).toBe("can_dang_nhap_lai"); // reauth thắng
  });

  it("completed THẮNG failed cũ cùng (tháng,chiều) → tính là đã 'xong' khi chiều kia cũng xong", () => {
    const rows = [
      row("2026-01", "purchase", S.THAT_BAI), // lần trước lỗi
      row("2026-01", "purchase", S.HOAN_THANH), // lần sau thành công
      row("2026-01", "sold", S.HOAN_THANH),
    ];
    const p = deriveBackfillStatus(rows, DIRS, MONTHS);
    expect(p.thang[0]?.trangThai).toBe("xong");
    expect(p.soXong).toBe(1);
  });

  it("bản ghi NGOÀI danh sách months của backfill → bỏ qua (không lẫn)", () => {
    const rows = [row("2025-12", "purchase", S.HOAN_THANH)];
    const p = deriveBackfillStatus(rows, DIRS, MONTHS);
    expect(statuses(p)).toEqual(["cho", "cho", "cho"]); // 2025-12 không thuộc backfill
  });
});

// SỰ CỐ 2026-07-18 (banner "loi" hiện NGAY khi bấm): bản ghi THAT_BAI/CAN_DANG_NHAP_LAI
// CŨ (trước khi backfill này được tạo) làm GET /backfill/:id trả co_loi tức thì — UI
// ngừng poll trong khi job MỚI còn chưa chạy. Với `sinceMs` (= def.createdAtMs), lỗi
// CŨ bị bỏ qua; completed thì tính MỌI THỜI ĐIỂM (tháng đã phủ từ trước vẫn là "xong").
describe("deriveBackfillStatus — sinceMs bỏ qua lỗi CŨ trước khi backfill được tạo", () => {
  const SINCE = 1_000_000;
  const rowAt = (period: string, chieu: InvoiceDirection, trangThai: string, batDauMs: number) => ({
    period,
    chieu,
    trangThai,
    batDauMs,
  });

  it("failed CŨ (batDauMs < sinceMs), chưa có run mới → tháng 'cho', tổng 'dang_chay' (KHÔNG 'loi')", () => {
    const rows = [rowAt("2026-01", "purchase", S.THAT_BAI, SINCE - 1)];
    const p = deriveBackfillStatus(rows, DIRS, ["2026-01"], SINCE);
    expect(p.thang[0]?.trangThai).toBe("cho");
    expect(p.trangThaiTong).toBe("dang_chay");
  });

  it("failed MỚI (batDauMs >= sinceMs) → vẫn 'loi' (lỗi thật của backfill này)", () => {
    const rows = [rowAt("2026-01", "purchase", S.THAT_BAI, SINCE)];
    const p = deriveBackfillStatus(rows, DIRS, ["2026-01"], SINCE);
    expect(p.thang[0]?.trangThai).toBe("loi");
    expect(p.trangThaiTong).toBe("co_loi");
  });

  it("completed CŨ vẫn tính 'xong' (khoảng đã phủ từ trước không bị bắt chạy lại)", () => {
    const rows = DIRS.map((d) => rowAt("2026-01", d, S.HOAN_THANH, SINCE - 1));
    const p = deriveBackfillStatus(rows, DIRS, ["2026-01"], SINCE);
    expect(p.thang[0]?.trangThai).toBe("xong");
    expect(p.trangThaiTong).toBe("hoan_thanh");
  });

  it("can_dang_nhap_lai CŨ bị bỏ qua; failed cũ + completed mới → 'xong'", () => {
    const rows = [
      rowAt("2026-01", "purchase", S.CAN_DANG_NHAP_LAI, SINCE - 5),
      rowAt("2026-01", "purchase", S.THAT_BAI, SINCE - 3),
      ...DIRS.map((d) => rowAt("2026-01", d, S.HOAN_THANH, SINCE + 10)),
    ];
    const p = deriveBackfillStatus(rows, DIRS, ["2026-01"], SINCE);
    expect(p.thang[0]?.trangThai).toBe("xong");
    expect(p.trangThaiTong).toBe("hoan_thanh");
  });

  it("KHÔNG truyền sinceMs → hành vi cũ giữ nguyên (failed cũ vẫn 'loi' — tương thích lùi)", () => {
    const rows = [rowAt("2026-01", "purchase", S.THAT_BAI, 123)];
    const p = deriveBackfillStatus(rows, DIRS, ["2026-01"]);
    expect(p.thang[0]?.trangThai).toBe("loi");
  });
});

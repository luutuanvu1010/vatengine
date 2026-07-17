// U22 B7 — Máy trạng thái THUẦN `deriveRangeBackfillState` (mọi tổ hợp) + RangeSyncPanel
// (presentational: nhận state từ hook) render đúng từng trạng thái. Offline, không mạng.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RangeSyncPanel } from "../../src/features/invoices/RangeSyncPanel";
import {
  type RangeBackfillState,
  deriveRangeBackfillState,
} from "../../src/features/invoices/useRangeBackfill";

const BASE = {
  sessionExpired: false,
  otherError: false,
  preparing: false,
  startEmpty: false,
  hasBackfillId: false,
  startTong: 0,
  progress: undefined,
};

describe("deriveRangeBackfillState — máy trạng thái thuần", () => {
  it("không tín hiệu → idle", () => {
    expect(deriveRangeBackfillState(BASE)).toEqual({ kind: "idle" });
  });
  it("hết phiên (409/không tài khoản) → phien_het_han", () => {
    expect(deriveRangeBackfillState({ ...BASE, sessionExpired: true })).toEqual({
      kind: "phien_het_han",
    });
  });
  it("lỗi khác → co_loi", () => {
    expect(deriveRangeBackfillState({ ...BASE, otherError: true })).toEqual({ kind: "co_loi" });
  });
  it("đang POST/tải tài khoản → dang_lay 0/0", () => {
    expect(deriveRangeBackfillState({ ...BASE, preparing: true })).toEqual({
      kind: "dang_lay",
      soXong: 0,
      tong: 0,
    });
  });
  it("POST xong, chờ poll đầu (hasBackfillId) → dang_lay 0/tong", () => {
    expect(deriveRangeBackfillState({ ...BASE, hasBackfillId: true, startTong: 3 })).toEqual({
      kind: "dang_lay",
      soXong: 0,
      tong: 3,
    });
  });
  it("khoảng đã phủ (startEmpty) → xong", () => {
    expect(deriveRangeBackfillState({ ...BASE, startEmpty: true })).toEqual({ kind: "xong" });
  });
  it("tiến độ dang_chay → dang_lay kèm tháng hiện tại", () => {
    const progress = {
      backfillId: "b",
      thang: [
        { period: "2026-01", trangThai: "xong" as const },
        { period: "2026-02", trangThai: "dang_chay" as const },
      ],
      soXong: 1,
      tongSoThang: 2,
      trangThaiTong: "dang_chay" as const,
    };
    expect(deriveRangeBackfillState({ ...BASE, hasBackfillId: true, progress })).toEqual({
      kind: "dang_lay",
      soXong: 1,
      tong: 2,
      thangHienTai: "2026-02",
    });
  });
  it("tiến độ hoan_thanh → xong; can_dang_nhap_lai → phien_het_han; co_loi → co_loi", () => {
    const b = { backfillId: "b", thang: [], soXong: 0, tongSoThang: 1 };
    expect(
      deriveRangeBackfillState({ ...BASE, progress: { ...b, trangThaiTong: "hoan_thanh" } }).kind,
    ).toBe("xong");
    expect(
      deriveRangeBackfillState({ ...BASE, progress: { ...b, trangThaiTong: "can_dang_nhap_lai" } })
        .kind,
    ).toBe("phien_het_han");
    expect(
      deriveRangeBackfillState({ ...BASE, progress: { ...b, trangThaiTong: "co_loi" } }).kind,
    ).toBe("co_loi");
  });
});

function panel(
  state: RangeBackfillState,
  over: Partial<Parameters<typeof RangeSyncPanel>[0]["backfill"]> = {},
) {
  const start = vi.fn();
  render(
    <RangeSyncPanel
      tuNgay="2026-01-01"
      denNgay="2026-03-31"
      backfill={{ state, lineResult: null, start, ...over }}
    />,
  );
  return start;
}

describe("RangeSyncPanel — render từng trạng thái + nút", () => {
  it("idle → nút 'Đồng bộ khoảng này'; bấm → gọi start", async () => {
    const start = panel({ kind: "idle" });
    const btn = screen.getByRole("button", { name: "Đồng bộ khoảng này" });
    await userEvent.click(btn);
    expect(start).toHaveBeenCalledOnce();
  });
  it("dang_lay → thanh tiến độ + X/N tháng + tháng hiện tại; nút khóa", () => {
    panel({ kind: "dang_lay", soXong: 1, tong: 3, thangHienTai: "2026-02" });
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "1");
    expect(screen.getByText("02/2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đang đồng bộ…" })).toBeDisabled();
  });
  it("phien_het_han → nhắc kết nối lại", () => {
    panel({ kind: "phien_het_han" });
    expect(screen.getByText(/kết nối lại/i)).toBeInTheDocument();
  });
  it("co_loi → thông báo lỗi", () => {
    panel({ kind: "co_loi" });
    expect(screen.getByText(/Không gửi được/)).toBeInTheDocument();
  });
  it("xong → đã đồng bộ xong", () => {
    panel({ kind: "xong" });
    expect(screen.getByText(/Đã đồng bộ xong/)).toBeInTheDocument();
  });
  it("có lineResult → hiện số hóa đơn đang đổ dòng hàng (U26)", () => {
    panel(
      { kind: "dang_lay", soXong: 0, tong: 1 },
      { lineResult: { soDaXepHang: 2029, conLai: 0 } },
    );
    expect(screen.getByText(/2029/)).toBeInTheDocument();
  });
});

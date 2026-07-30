// U22 B7 — Máy trạng thái THUẦN `deriveRangeBackfillState` (mọi tổ hợp) + RangeSyncPanel
// (presentational: nhận state từ hook) render đúng từng trạng thái. Offline, không mạng.
import { render, screen } from "@testing-library/react";
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
  // 2026-07-18: TÁCH hai loại lỗi vốn bị gộp làm một. Gộp lại khiến job nền hỏng bị
  // báo là "không gửi được yêu cầu" — sai bản chất, người dùng bấm lại vô ích.
  it("KHÔNG gửi được request (otherError) → loi_gui", () => {
    expect(deriveRangeBackfillState({ ...BASE, otherError: true })).toEqual({ kind: "loi_gui" });
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
  it("tiến độ hoan_thanh → xong; can_dang_nhap_lai → phien_het_han", () => {
    const b = { backfillId: "b", thang: [], soXong: 0, tongSoThang: 1 };
    expect(
      deriveRangeBackfillState({ ...BASE, progress: { ...b, trangThaiTong: "hoan_thanh" } }).kind,
    ).toBe("xong");
    expect(
      deriveRangeBackfillState({ ...BASE, progress: { ...b, trangThaiTong: "can_dang_nhap_lai" } })
        .kind,
    ).toBe("phien_het_han");
  });

  // BẰNG CHỨNG 2026-07-18: POST /backfill trả 202 (17/17 sự kiện vat-api `ok`) nhưng
  // UI vẫn báo "Không gửi được yêu cầu đồng bộ" — vì `trangThaiTong: "co_loi"` (job NỀN
  // hỏng, thật ra do GDT 429) bị gộp chung state với lỗi gửi request. Phải TÁCH.
  it("job NỀN hỏng (trangThaiTong co_loi) → loi_dong_bo kèm số tháng lỗi, KHÔNG phải loi_gui", () => {
    const progress = {
      backfillId: "b",
      thang: [
        { period: "2026-05", trangThai: "loi" as const },
        { period: "2026-06", trangThai: "loi" as const },
        { period: "2026-07", trangThai: "xong" as const },
      ],
      soXong: 1,
      tongSoThang: 3,
      trangThaiTong: "co_loi" as const,
    };
    expect(deriveRangeBackfillState({ ...BASE, progress })).toEqual({
      kind: "loi_dong_bo",
      soThangLoi: 2,
    });
  });
});

function panel(
  state: RangeBackfillState,
  over: Partial<Parameters<typeof RangeSyncPanel>[0]["backfill"]> = {},
) {
  return render(<RangeSyncPanel backfill={{ state, lineResult: null, start: vi.fn(), ...over }} />);
}

// Task 12 — nút "Đồng bộ từ Thuế" chuyển ra khỏi RangeSyncPanel (nay ở hàng nút của
// FilterBar trong InvoicesPage — xem invoiceRangeSync.test.tsx). Panel này CHỈ còn tiến
// độ + cảnh báo (thuần presentational, không có nút/không gọi `start`).
describe("RangeSyncPanel — render từng trạng thái (thuần tiến độ + cảnh báo)", () => {
  it("idle → không hiện gì (chưa có tiến độ, chưa có cảnh báo)", () => {
    panel({ kind: "idle" });
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
  // Khoảng cách TRÊN của khối thông báo do `gap` của vùng chứa dọc trong `InvoicesPage` lo
  // (không margin lẻ). Điều đó chỉ đúng nếu panel KHÔNG render vùng chứa rỗng khi chẳng có
  // gì để nói — một <div> rỗng vẫn tính là một ô lưới, sinh thêm một khoảng hở ảo và làm
  // khoảng cách LỆCH giữa trạng thái "không tác vụ nền" và "có tác vụ nền".
  it("idle + không tác vụ nền + không dòng hàng → KHÔNG render vùng chứa nào", () => {
    const { container } = panel({ kind: "idle" });
    expect(container.firstChild).toBeNull();
  });
  it("dang_lay → thanh tiến độ + X/N tháng + tháng hiện tại; KHÔNG có nút", () => {
    panel({ kind: "dang_lay", soXong: 1, tong: 3, thangHienTai: "2026-02" });
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "1");
    expect(screen.getByText("02/2026")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("phien_het_han → nhắc kết nối lại", () => {
    panel({ kind: "phien_het_han" });
    expect(screen.getByText(/kết nối lại/i)).toBeInTheDocument();
  });
  it("loi_gui (request KHÔNG gửi được) → nói đúng là không gửi được", () => {
    panel({ kind: "loi_gui" });
    expect(screen.getByText(/Không gửi được/)).toBeInTheDocument();
  });

  it("loi_dong_bo (job nền hỏng) → KHÔNG được nói 'không gửi được'; phải nói yêu cầu đã nhận + nêu số tháng lỗi", () => {
    panel({ kind: "loi_dong_bo", soThangLoi: 2 });
    // Chống hồi quy chính xác lỗi 2026-07-18: request ĐÃ gửi thành công (202).
    expect(screen.queryByText(/Không gửi được/)).not.toBeInTheDocument();
    expect(screen.getByText(/đã nhận/i)).toBeInTheDocument();
    expect(screen.getByText(/2 tháng/)).toBeInTheDocument();
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

  // Minh bạch tác vụ nền (sự cố livelock 2026-07-27): người dùng không thấy phiên đồng bộ
  // đang chạy nên bấm lặp lại → bão trùng lặp. Panel phải nói rõ "đang chạy nền, bấm thêm
  // không tạo trùng".
  it("idle + có tác vụ nền → hiện 'x tác vụ' + các tháng + trấn an không tạo trùng", () => {
    panel(
      { kind: "idle" },
      {
        tacVuNen: {
          soTacVu: 2,
          thang: [
            { period: "2026-07", chieu: "purchase", batDau: "2026-07-27T04:00:00Z" },
            { period: "2026-07", chieu: "sold", batDau: "2026-07-27T04:01:00Z" },
          ],
        },
      },
    );
    expect(screen.getByText(/tác vụ đồng bộ xử lý nền/)).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument(); // số tác vụ
    expect(screen.getByText(/07\/2026/)).toBeInTheDocument(); // kỳ khử trùng (2 chiều → 1 lần)
    expect(screen.getByText(/không tạo.*trùng/i)).toBeInTheDocument();
  });
  it("dang_lay (đã hiện tiến độ của chính phiên này) → KHÔNG lặp thêm dòng tác vụ nền", () => {
    panel(
      { kind: "dang_lay", soXong: 0, tong: 1 },
      {
        tacVuNen: {
          soTacVu: 1,
          thang: [{ period: "2026-07", chieu: "purchase", batDau: "2026-07-27T04:00:00Z" }],
        },
      },
    );
    expect(screen.queryByText(/không tạo.*trùng/i)).not.toBeInTheDocument();
  });
  it("tacVuNen soTacVu=0 → không hiện dòng tác vụ nền", () => {
    panel({ kind: "idle" }, { tacVuNen: { soTacVu: 0, thang: [] } });
    expect(screen.queryByText(/không tạo.*trùng/i)).not.toBeInTheDocument();
  });
});

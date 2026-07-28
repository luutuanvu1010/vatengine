// Task 13 (Slice 2, cuối) — thẻ Kết quả hiện đủ 4 số thống kê từ /invoices/summary
// (đã có sẵn ở backend: total.count/tongTcthue/tongTthue/tongTtbso). Thuần hiển thị —
// nhãn tiền lấy từ Registry @vat/domain (ui.md nhãn một-nguồn), tiền in ĐẦY ĐỦ bằng
// formatMoney (chuỗi-an-toàn), null/rỗng → "—" (không giá trị giả).
import { screen } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../../src/features/auth/auth-context";
import { InvoicesPage } from "../../src/features/invoices/InvoicesPage";
import { saveInvoiceFilter } from "../../src/lib/filterStore";
import type { MeResponse } from "../../src/types/api";
import { renderWithProviders } from "../helpers/renderApp";

function j(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Render InvoicesPage với vai đã seed (mirror invoiceRangeSync.test.tsx). */
function InvoicesPageAs() {
  const { applyMe } = useAuth();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const me: MeResponse = {
      ten: "DN",
      mst: "0311772540",
      goiDichVu: null,
      goiDichVuTen: null,
      banQuyen: "Mặc định",
      ghiChu: null,
      role: "quan_tri",
    };
    applyMe(me);
  }, [applyMe]);
  return <InvoicesPage />;
}

function mockApi(total: {
  count: number;
  tongTcthue: string | null;
  tongTthue: string | null;
  tongTtbso: string | null;
}) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/me")) {
      return j(200, {
        ten: "DN",
        mst: "0311772540",
        goiDichVu: null,
        banQuyen: "Mặc định",
        ghiChu: null,
        role: "quan_tri",
      });
    }
    if (url.includes("/tax-accounts")) return j(200, []);
    if (url.includes("/invoices/summary")) {
      return j(200, { byChieu: [], total });
    }
    return j(200, { rows: [], total: total.count, limit: 50, offset: 0 });
  });
}

describe("Thẻ 'Kết quả' — 4 số thống kê (Task 13)", () => {
  beforeEach(() => {
    saveInvoiceFilter({ tuNgay: "2026-03-01", denNgay: "2026-06-30" });
  });
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("hiện đủ 4 số từ summary, tiền in đầy đủ + ₫, null → —", async () => {
    mockApi({
      count: 6802,
      tongTcthue: "12480350200",
      tongTthue: "1198412016",
      tongTtbso: null,
    });
    renderWithProviders(<InvoicesPageAs />);
    expect(await screen.findByText("6.802")).toBeTruthy();
    expect(screen.getByText("12.480.350.200 ₫")).toBeTruthy();
    expect(screen.getByText("Tiền chưa thuế")).toBeTruthy();
    expect(screen.getByText("1.198.412.016 ₫")).toBeTruthy();
    expect(screen.getByText("Tiền thuế")).toBeTruthy();
    expect(screen.getByText("Tổng thanh toán")).toBeTruthy();
    expect(screen.getByText("—")).toBeTruthy();
  });

  // 2026-07-26 (chủ dự án): nút Xuất phải đứng ở HÀNG HÀNH ĐỘNG cạnh "Đồng bộ từ Thuế"
  // (bị cụm 4 Stat đẩy khuất khi nằm trong thẻ Kết quả). Chốt cả hai nút cùng hiện diện.
  it("nút Xuất Excel/CSV hiện cạnh nút Đồng bộ từ Thuế (hàng hành động)", async () => {
    mockApi({ count: 10, tongTcthue: "1", tongTthue: "1", tongTtbso: "1" });
    renderWithProviders(<InvoicesPageAs />);
    expect(await screen.findByRole("button", { name: "Đồng bộ từ Thuế" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Xuất Excel" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Xuất CSV" })).toBeTruthy();
  });
});

// U36 — thẻ Kết quả sau khi tổng tiền loại hóa đơn bị thay thế (mã 4).
type TongU36 = {
  count: number;
  countTinhTong?: number;
  soLoaiKhoiTong?: number;
  tongTcthue: string | null;
  tongTthue: string | null;
  tongTtbso: string | null;
};

/** Mock ghi lại MỌI URL gọi ra — để khẳng định trang KHÔNG tự đồng bộ (QĐ-7). */
function mockU36(total: TongU36, byChieu: unknown[] = []) {
  const calls: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    calls.push(`${(init?.method ?? "GET").toUpperCase()} ${url}`);
    if (url.endsWith("/me")) {
      return j(200, {
        ten: "DN",
        mst: "0311772540",
        goiDichVu: null,
        banQuyen: "Mặc định",
        ghiChu: null,
        role: "quan_tri",
      });
    }
    if (url.includes("/tax-accounts")) return j(200, []);
    if (url.includes("/invoices/summary")) return j(200, { byChieu, total });
    return j(200, { rows: [], total: total.count, limit: 50, offset: 0 });
  });
  return calls;
}

const CHIEU_BAN_RA_MA4 = {
  chieu: "sold",
  count: 3,
  countTinhTong: 0,
  soLoaiKhoiTong: 3,
  tongTcthue: null,
  tongTthue: null,
  tongTtbso: null,
  soDuocDieuChinh: 0,
  soHdThayThe: 0,
  soHdDieuChinh: 0,
  soMaLa: 0,
  thueDaLoai: "1711111",
  ttbsoDaLoai: "23100000",
  thueThayTheDieuChinh: "0",
  ttbsoThayTheDieuChinh: "0",
};

describe("U36 — trang Danh sách khi có hóa đơn bị thay thế", () => {
  beforeEach(() => {
    saveInvoiceFilter({ tuNgay: "2026-07-01", denNgay: "2026-07-31" });
  });
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("số đếm GIỮ NGUYÊN + dòng phụ giải thích phần không tính vào tổng", async () => {
    mockU36(
      {
        count: 3,
        countTinhTong: 0,
        soLoaiKhoiTong: 3,
        tongTcthue: null,
        tongTthue: null,
        tongTtbso: null,
      },
      [CHIEU_BAN_RA_MA4],
    );
    renderWithProviders(<InvoicesPageAs />);
    expect(await screen.findByText("3")).toBeTruthy();
    expect(screen.getByText("(3 hóa đơn bị thay thế - không tính vào tổng)")).toBeTruthy();
    expect(screen.getByText(/đã loại khỏi tổng/)).toBeTruthy();
  });

  it("#5 kỳ CHỈ có hóa đơn mã 4 → count > 0 ⇒ KHÔNG tự gọi đồng bộ lên Tổng cục Thuế", async () => {
    // Nếu ai đó trừ mã 4 khỏi `count`, `khongCoHoaDon` thành true và trang tự POST
    // /backfill — đúng kịch bản khiến GDT phạt 429 ngày 2026-07-27.
    const calls = mockU36(
      {
        count: 3,
        countTinhTong: 0,
        soLoaiKhoiTong: 3,
        tongTcthue: null,
        tongTthue: null,
        tongTtbso: null,
      },
      [CHIEU_BAN_RA_MA4],
    );
    renderWithProviders(<InvoicesPageAs />);
    await screen.findByText(/đã loại khỏi tổng/);
    expect(calls.filter((c) => c.includes("/backfill"))).toEqual([]);
  });

  it("#7 tenant chưa có dữ liệu → không thông báo, không crash", async () => {
    mockU36({ count: 0, tongTcthue: null, tongTthue: null, tongTtbso: null }, []);
    renderWithProviders(<InvoicesPageAs />);
    expect(await screen.findByText(/Không có hóa đơn khớp bộ lọc/)).toBeTruthy();
    expect(screen.queryByText(/đã loại khỏi tổng/)).toBeNull();
  });

  it("#8 dữ liệu shape CŨ trong cache (thiếu mọi trường mới) → hiện số bình thường, không ném", async () => {
    mockU36({ count: 12, tongTcthue: "1000", tongTthue: "80", tongTtbso: "1080" }, [
      { chieu: "sold", count: 12, tongTcthue: "1000", tongTthue: "80", tongTtbso: "1080" },
    ]);
    renderWithProviders(<InvoicesPageAs />);
    expect(await screen.findByText("12")).toBeTruthy();
    expect(screen.getByText("1.000 ₫")).toBeTruthy();
    expect(screen.queryByText(/đã loại khỏi tổng/)).toBeNull();
    expect(screen.queryByText(/không tính vào tổng/)).toBeNull();
  });
});

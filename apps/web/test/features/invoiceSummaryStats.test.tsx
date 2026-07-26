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

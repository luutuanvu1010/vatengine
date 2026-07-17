// 2026-07-17 — "chọn khoảng thời gian thì cũng chạy đồng bộ được cho khoảng đó" (chủ
// dự án): khi bộ lọc có ĐỦ tuNgay+denNgay, danh sách hiện nút "Đồng bộ khoảng này".
// Bấm → gọi CẢ HAI: POST /tax-accounts/:id/backfill {tuNgay,denNgay} (tháng còn thiếu
// header — U22) VÀ POST /tax-accounts/:id/backfill-lines (hóa đơn thiếu dòng hàng —
// U26; đường đổ dữ liệu cho HĐ cũ đã có header). Tài khoản = cái còn token; hết token
// → nhắc kết nối lại, KHÔNG gọi API.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvoicesPage } from "../../src/features/invoices/InvoicesPage";
import { clearToken, setToken } from "../../src/lib/apiClient";
import { saveInvoiceFilter } from "../../src/lib/filterStore";
import type { TaxAccountView } from "../../src/types/api";
import { renderWithProviders } from "../helpers/renderApp";

const ACC: TaxAccountView = {
  id: "acc-1",
  username: "4201969169",
  loai: "chinh",
  uyQuyenLuc: "2026-07-01T00:00:00.000Z",
  tokenHetHan: new Date(Date.now() + 3_600_000).toISOString(),
  ngayTao: "2026-07-01T00:00:00.000Z",
};

const EMPTY_LIST = { rows: [], total: 0, limit: 50, offset: 0 };
const EMPTY_SUMMARY = {
  byChieu: [],
  total: { count: 0, tongTcthue: null, tongTthue: null, tongTtbso: null },
};

function mockApi(accounts: TaxAccountView[]) {
  const posts: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "POST" && url.includes("/backfill-lines")) {
      posts.push("backfill-lines");
      return new Response(JSON.stringify({ soHoaDonThieu: 2029, soDaXepHang: 2029, conLai: 0 }), {
        status: 202,
        headers: { "content-type": "application/json" },
      });
    }
    if (method === "POST" && url.includes("/backfill")) {
      posts.push("backfill");
      return new Response(
        JSON.stringify({ backfillId: "b1", thangCanLay: ["2026-03"], tongSoThang: 1 }),
        { status: 202, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes("/tax-accounts")) {
      return new Response(JSON.stringify(accounts), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/invoices/summary")) {
      return new Response(JSON.stringify(EMPTY_SUMMARY), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify(EMPTY_LIST), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  return posts;
}

describe("Đồng bộ theo khoảng thời gian từ danh sách hóa đơn", () => {
  beforeEach(() => {
    setToken("t");
    saveInvoiceFilter({ tuNgay: "2026-03-01", denNgay: "2026-06-30" });
  });
  afterEach(() => {
    clearToken();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("có đủ tuNgay+denNgay → hiện nút; bấm → gọi backfill (khoảng) + backfill-lines; báo kết quả", async () => {
    const posts = mockApi([ACC]);
    renderWithProviders(<InvoicesPage />);
    const btn = await screen.findByRole("button", { name: /Đồng bộ khoảng này/ });
    await userEvent.click(btn);

    expect(await screen.findByText(/1 tháng/)).toBeTruthy();
    expect(screen.getByText(/2029/)).toBeTruthy();
    expect(posts).toContain("backfill");
    expect(posts).toContain("backfill-lines");
  });

  it("không còn tài khoản có phiên thuế → nhắc kết nối lại, KHÔNG gọi API đồng bộ", async () => {
    const posts = mockApi([{ ...ACC, tokenHetHan: new Date(Date.now() - 1000).toISOString() }]);
    renderWithProviders(<InvoicesPage />);
    const btn = await screen.findByRole("button", { name: /Đồng bộ khoảng này/ });
    await userEvent.click(btn);

    expect(await screen.findByText(/kết nối lại/i)).toBeTruthy();
    expect(posts).toHaveLength(0);
  });

  it("thiếu khoảng ngày → KHÔNG hiện nút", async () => {
    saveInvoiceFilter({ tuNgay: "2026-03-01" }); // thiếu denNgay
    mockApi([ACC]);
    renderWithProviders(<InvoicesPage />);
    await screen.findByText("Danh sách hóa đơn");
    expect(screen.queryByRole("button", { name: /Đồng bộ khoảng này/ })).toBeNull();
  });
});

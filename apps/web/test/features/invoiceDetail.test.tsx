import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvoiceDetailPage } from "../../src/features/invoices/InvoiceDetailPage";
import { clearToken, setToken } from "../../src/lib/apiClient";
import type { InvoiceDetailResponse, InvoiceLineRow } from "../../src/types/api";
import { json, renderWithProviders } from "../helpers/renderApp";

const row: InvoiceDetailResponse = {
  id: "r1",
  tenantId: "t",
  nbmst: "0311772540",
  nbten: "Cty CP Nhiên liệu",
  nmmst: "4201568932",
  nmten: "Cty TNHH Tour Đảo",
  khmshdon: "1",
  khhdon: "C26TDA",
  shdon: "0001284",
  tdlap: "2026-04-02T17:00:00.000Z",
  ncnhat: null,
  tgtcthue: "45000000",
  tgtthue: "4500000",
  tgtttbso: "49500000",
  ttcktmai: null,
  dvtte: "VND",
  tgia: null,
  ttxly: 8,
  tthai: 1,
  chieu: "purchase",
  nguon: "normal",
  rawJson: {},
  createdAt: "x",
  updatedAt: "x",
  dongHangHoa: [],
};

function line(over: Partial<InvoiceLineRow>): InvoiceLineRow {
  return {
    id: "l1",
    hoaDonId: "r1",
    tenantId: "t",
    stt: 1,
    ten: "VW tiêu chuẩn NL",
    dvtinh: "Gói",
    sluong: "13",
    dgia: "100000",
    thtien: "1300000",
    ltsuat: "8%",
    tsuat: "0.08",
    tsuatTien: "104000",
    rawJson: {},
    ...over,
  };
}

function renderDetail() {
  return renderWithProviders(
    <Routes>
      <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
    </Routes>,
    "/invoices/r1",
  );
}

describe("U15.3 — chi tiết hóa đơn (header)", () => {
  beforeEach(() => setToken("t"));
  afterEach(() => {
    clearToken();
    vi.restoreAllMocks();
  });

  it("render header + bảng dòng hàng với tên SP, ĐVT, SL, đơn giá, thành tiền, thuế suất", async () => {
    const data: InvoiceDetailResponse = {
      ...row,
      dongHangHoa: [
        line({ id: "l1", stt: 1, ten: "VW tiêu chuẩn NL" }),
        line({ id: "l2", stt: 2, ten: "VW tiêu chuẩn TE", sluong: "2", thtien: "200000" }),
      ],
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => json(200, data));
    renderDetail();
    expect(await screen.findByText("0001284")).toBeInTheDocument();
    // Tên hai sản phẩm hiển thị.
    expect(screen.getByText("VW tiêu chuẩn NL")).toBeInTheDocument();
    expect(screen.getByText("VW tiêu chuẩn TE")).toBeInTheDocument();
    // Cột bảng dòng hàng.
    expect(screen.getByText("Tên hàng hóa, dịch vụ")).toBeInTheDocument();
    expect(screen.getByText("ĐVT")).toBeInTheDocument();
    expect(screen.getByText("Thuế suất")).toBeInTheDocument();
    // Giá trị định dạng tiền của một dòng.
    expect(screen.getByText("1.300.000")).toBeInTheDocument();
  });

  it("không có dòng hàng → nêu rõ hóa đơn chưa có dòng hàng chi tiết", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => json(200, row));
    renderDetail();
    expect(await screen.findByText("0001284")).toBeInTheDocument();
    expect(screen.getByText(/chưa có dòng hàng/i)).toBeInTheDocument();
  });

  it("404 → thông báo không tìm thấy", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => json(404, { error: "not_found" }));
    renderDetail();
    expect(await screen.findByText(/Không tìm thấy hóa đơn/)).toBeInTheDocument();
  });
});

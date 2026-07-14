import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvoiceDetailPage } from "../../src/features/invoices/InvoiceDetailPage";
import { clearToken, setToken } from "../../src/lib/apiClient";
import type { InvoiceRow } from "../../src/types/api";
import { json, renderWithProviders } from "../helpers/renderApp";

const row: InvoiceRow = {
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
};

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

  it("render header + nêu rõ dòng hàng chưa khả dụng", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => json(200, row));
    renderDetail();
    expect(await screen.findByText("0001284")).toBeInTheDocument();
    expect(screen.getByText("45.000.000")).toBeInTheDocument();
    expect(screen.getByText("Gốc")).toBeInTheDocument();
    expect(screen.getByText(/dòng hàng/i)).toBeInTheDocument();
  });

  it("404 → thông báo không tìm thấy", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => json(404, { error: "not_found" }));
    renderDetail();
    expect(await screen.findByText(/Không tìm thấy hóa đơn/)).toBeInTheDocument();
  });
});

import { screen, within } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvoiceDetailPage } from "../../src/features/invoices/InvoiceDetailPage";
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
  afterEach(() => {
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

  it("không có dòng hàng → thông báo đúng chữ spec (cần đồng bộ chi tiết)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => json(200, row));
    renderDetail();
    expect(await screen.findByText("0001284")).toBeInTheDocument();
    expect(
      screen.getByText(/Chưa có dữ liệu dòng hàng \(cần đồng bộ chi tiết\)/),
    ).toBeInTheDocument();
  });

  it("404 → thông báo không tìm thấy", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => json(404, { error: "not_found" }));
    renderDetail();
    expect(await screen.findByText(/Không tìm thấy hóa đơn/)).toBeInTheDocument();
  });
});

describe("U23-A — siết tiêu chí dòng hàng (chi tiết)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // (a) Đúng số dòng + đúng thứ tự stt (component không đảo thứ tự server trả).
  it("hiển thị đúng số dòng hàng và giữ đúng thứ tự stt", async () => {
    const data: InvoiceDetailResponse = {
      ...row,
      dongHangHoa: [
        line({ id: "a", stt: 1, ten: "Mục một" }),
        line({ id: "b", stt: 2, ten: "Mục hai" }),
        line({ id: "c", stt: 3, ten: "Mục ba" }),
      ],
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => json(200, data));
    renderDetail();
    await screen.findByText("0001284");
    const table = screen.getByText("Tên hàng hóa, dịch vụ").closest("table");
    expect(table).not.toBeNull();
    // Bỏ hàng tiêu đề (thead) → chỉ còn các dòng dữ liệu.
    // Đủ 7 cột: STT · Tên HH-DV · ĐVT · Số lượng · Đơn giá · Thành tiền · Thuế suất.
    expect(within(table as HTMLElement).getAllByRole("columnheader")).toHaveLength(7);
    const dataRows = within(table as HTMLElement)
      .getAllByRole("row")
      .slice(1);
    expect(dataRows).toHaveLength(3);
    // Mỗi dòng dữ liệu cũng đủ 7 ô.
    for (const tr of dataRows) {
      expect(within(tr).getAllByRole("cell")).toHaveLength(7);
    }
    const names = dataRows.map((tr) => within(tr).getByText(/^Mục /).textContent);
    expect(names).toEqual(["Mục một", "Mục hai", "Mục ba"]);
  });

  // (b)+(d) Giá trị > 2^53 giữ nguyên chuỗi/không ép float (Number() sẽ làm sai số).
  it("giữ chính xác giá trị > 2^53 (chuỗi), không ép float", async () => {
    const data: InvoiceDetailResponse = {
      ...row,
      dongHangHoa: [
        line({
          id: "big",
          stt: 1,
          ten: "Mục cực lớn",
          sluong: "12345678901234567890", // > 2^53: nếu Number() → 12345678901234568000
          dgia: "1",
          thtien: "9007199254740993000", // > 2^53: nếu Number() → mất chữ số cuối
          ltsuat: "10%",
        }),
      ],
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => json(200, data));
    renderDetail();
    await screen.findByText("0001284");
    // Số lượng giữ nguyên chuỗi (không phân nhóm, không ép float).
    expect(screen.getByText("12345678901234567890")).toBeInTheDocument();
    // Thành tiền phân nhóm nghìn chính xác từng chữ số.
    expect(screen.getByText("9.007.199.254.740.993.000")).toBeInTheDocument();
  });
});

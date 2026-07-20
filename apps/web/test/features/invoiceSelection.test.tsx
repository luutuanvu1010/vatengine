// U30 — chọn dòng để xuất. Quyết định chủ dự án 2026-07-20:
// "Chọn tất cả" = chọn TRANG HIỆN TẠI, và lựa chọn được GIỮ khi lật trang.
// Ràng buộc an toàn: lựa chọn KHÔNG được lưu localStorage (multi-tenant.md H-B.3 —
// dữ liệu tenant còn sót ở client), và phải bị XÓA khi đổi bộ lọc (chống xuất nhầm
// những hóa đơn người dùng không còn nhìn thấy). Offline, không mạng thật.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InvoicesPage } from "../../src/features/invoices/InvoicesPage";
import type { InvoiceListRow } from "../../src/types/api";
import { renderWithProviders } from "../helpers/renderApp";

function row(over: Partial<InvoiceListRow>): InvoiceListRow {
  return {
    id: "r1",
    tenantId: "t",
    nbmst: "0311772540",
    nbten: "Cty Bán",
    nmmst: "4201568932",
    nmten: "Cty Mua",
    khmshdon: "1",
    khhdon: "C26TDA",
    shdon: "0001284",
    tdlap: "2026-04-02T17:00:00.000Z",
    ncnhat: null,
    tgtcthue: "1000000",
    tgtthue: "80000",
    tgtttbso: "1080000",
    ttcktmai: null,
    dvtte: "VND",
    tgia: null,
    ttxly: 8,
    tthai: 1,
    chieu: "purchase",
    nguon: "normal",
    rawJson: {},
    createdAt: "2026-04-03T00:00:00.000Z",
    updatedAt: "2026-04-03T00:00:00.000Z",
    tenHangDau: null,
    hangHoa: [],
    soDongHang: 0,
    ...over,
  };
}

const R1 = row({ id: "r1", shdon: "0001" });
const R2 = row({ id: "r2", shdon: "0002" });
const R3 = row({ id: "r3", shdon: "0003" });

/** Ghi lại mọi request tạo kết xuất để soi body đã gửi. */
type Captured = { url: string; body: unknown };

function mockApi(rows: InvoiceListRow[], total = rows.length) {
  const captured: Captured[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const json = (v: unknown, status = 200) =>
      new Response(JSON.stringify(v), {
        status,
        headers: { "content-type": "application/json" },
      });

    // Nút xuất chỉ hiện với vai canExport (ke_toan_truong/quan_tri) — phải seed vai,
    // nếu không component tự ẩn và test tưởng hỏng tính năng.
    if (url.includes("/me")) {
      return json({
        ten: "DN",
        mst: "0311772540",
        goiDichVu: null,
        goiDichVuTen: null,
        banQuyen: "Mặc định",
        ghiChu: null,
        role: "quan_tri",
      });
    }
    if (url.includes("/invoices/summary")) {
      return json({
        byChieu: [],
        total: { count: rows.length, tongTcthue: null, tongTthue: null, tongTtbso: null },
      });
    }
    if (url.includes("/exports/") && init?.method !== "POST") {
      return new Response(new Blob(["x"]), { status: 200 });
    }
    if (url.includes("/exports")) {
      captured.push({
        url,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      return json({ id: "e1.xlsx", key: "k", url: "/exports/e1.xlsx" }, 201);
    }
    return json({ rows, total, limit: 50, offset: 0 });
  });
  return captured;
}

/** Checkbox chọn dòng của một hóa đơn, tìm theo nhãn trợ năng chứa số HĐ. */
const rowBox = (shdon: string) => screen.getByLabelText(new RegExp(`chọn.*${shdon}`, "i"));
const allBox = () => screen.getByLabelText(/chọn tất cả/i);

/** Thanh trạng thái lựa chọn (role=status). null khi chưa chọn gì. */
const thanhChon = () => screen.queryByRole("status");
/** Nút xuất — nhãn ĐỔI theo số đã chọn nên khớp mềm. */
const nutXuatExcel = () => screen.getByRole("button", { name: /Xuất.*Excel/i });

describe("U30 — chọn dòng trên bảng hóa đơn", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("T9 — mỗi hàng có checkbox; tick 1 dòng → hiện 'Đã chọn 1 hóa đơn'", async () => {
    mockApi([R1, R2, R3]);
    const u = userEvent.setup();
    renderWithProviders(<InvoicesPage />);
    await screen.findByText("0001");

    await u.click(rowBox("0001"));
    expect(thanhChon()?.textContent).toContain("Đã chọn 1 hóa đơn");
  });

  it("T10 — ô header tri-state: chọn một phần trang → indeterminate, chọn hết → checked", async () => {
    mockApi([R1, R2, R3]);
    const u = userEvent.setup();
    renderWithProviders(<InvoicesPage />);
    await screen.findByText("0001");

    const head = allBox() as HTMLInputElement;
    expect(head.checked).toBe(false);
    expect(head.indeterminate).toBe(false);

    await u.click(rowBox("0001"));
    expect(head.indeterminate).toBe(true);
    expect(head.checked).toBe(false);

    await u.click(rowBox("0002"));
    await u.click(rowBox("0003"));
    expect(head.checked).toBe(true);
    expect(head.indeterminate).toBe(false);
  });

  it("ô header chọn/bỏ chọn cả trang", async () => {
    mockApi([R1, R2, R3]);
    const u = userEvent.setup();
    renderWithProviders(<InvoicesPage />);
    await screen.findByText("0001");

    await u.click(allBox());
    expect(thanhChon()?.textContent).toContain("Đã chọn 3 hóa đơn");
    await u.click(allBox());
    expect(thanhChon()).toBeNull();
  });

  it("T11 — đổi bộ lọc → XÓA sạch lựa chọn (chống xuất nhầm dòng không còn thấy)", async () => {
    mockApi([R1, R2, R3]);
    const u = userEvent.setup();
    renderWithProviders(<InvoicesPage />);
    await screen.findByText("0001");

    await u.click(rowBox("0001"));
    expect(thanhChon()?.textContent).toContain("Đã chọn 1 hóa đơn");

    await u.click(screen.getByRole("button", { name: /Áp dụng/i }));
    expect(thanhChon()).toBeNull();
  });

  it("T12 — lật trang GIỮ lựa chọn (quyết định chủ dự án 2026-07-20)", async () => {
    mockApi([R1, R2, R3], 120); // total > limit ⇒ có phân trang
    const u = userEvent.setup();
    renderWithProviders(<InvoicesPage />);
    await screen.findByText("0001");

    await u.click(rowBox("0001"));
    expect(thanhChon()?.textContent).toContain("Đã chọn 1 hóa đơn");

    await u.click(screen.getByRole("button", { name: /Sau|Tiếp|Next/i }));
    // Lựa chọn phải còn nguyên sau khi đổi trang — KHÁC hẳn ca đổi bộ lọc (T11).
    expect(thanhChon()?.textContent).toContain("Đã chọn 1 hóa đơn");
  });

  it("nút 'Bỏ chọn tất cả' xóa lựa chọn", async () => {
    mockApi([R1, R2]);
    const u = userEvent.setup();
    renderWithProviders(<InvoicesPage />);
    await screen.findByText("0001");

    await u.click(allBox());
    await u.click(screen.getByRole("button", { name: /Bỏ chọn/i }));
    expect(thanhChon()).toBeNull();
  });

  it("KHÔNG lưu lựa chọn vào localStorage (multi-tenant.md — không để sót dữ liệu tenant)", async () => {
    mockApi([R1, R2]);
    const u = userEvent.setup();
    renderWithProviders(<InvoicesPage />);
    await screen.findByText("0001");

    await u.click(rowBox("0001"));
    const dump = JSON.stringify(localStorage);
    expect(dump).not.toContain("r1");
  });
});

describe("U30 — xuất theo dòng đã chọn", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("có chọn dòng → gửi body { ids } đúng các id đã tick", async () => {
    const captured = mockApi([R1, R2, R3]);
    const u = userEvent.setup();
    renderWithProviders(<InvoicesPage />);
    await screen.findByText("0001");

    await u.click(rowBox("0001"));
    await u.click(rowBox("0003"));
    await u.click(nutXuatExcel());

    await vi.waitFor(() => expect(captured.length).toBe(1));
    expect(captured[0]?.body).toEqual({ ids: ["r1", "r3"] });
  });

  it("KHÔNG chọn dòng nào → KHÔNG gửi ids (giữ hành vi xuất theo bộ lọc)", async () => {
    const captured = mockApi([R1, R2]);
    const u = userEvent.setup();
    renderWithProviders(<InvoicesPage />);
    await screen.findByText("0001");

    await u.click(nutXuatExcel());
    await vi.waitFor(() => expect(captured.length).toBe(1));
    expect(captured[0]?.body).toBeUndefined();
  });

  it("nhãn nút đổi theo số đã chọn", async () => {
    mockApi([R1, R2]);
    const u = userEvent.setup();
    renderWithProviders(<InvoicesPage />);
    await screen.findByText("0001");

    expect(nutXuatExcel().textContent).toBe("Xuất Excel");
    await u.click(rowBox("0001"));
    expect(nutXuatExcel().textContent).toBe("Xuất 1 hóa đơn đã chọn (Excel)");
  });
});

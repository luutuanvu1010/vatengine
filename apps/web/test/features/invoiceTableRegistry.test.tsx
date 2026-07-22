// U-K2 — bảng hoá đơn DẪN XUẤT cột từ Registry miền hoá đơn (@vat/domain) thay vì khai tay
// từng <ThMenu> trong JSX. Đây là test chống trôi: nó phải ĐỎ nếu ai đó gõ thẳng một nhãn
// vào InvoiceTable.tsx, hoặc thêm/bớt/đảo cột mà không qua Registry.
//
// Vì sao đọc MÃ NGUỒN chứ không chỉ render: render chỉ chứng minh "nhãn hiện ra đúng", nó
// KHÔNG phân biệt nổi nhãn đến từ Registry hay từ chuỗi gõ tay tình cờ trùng. Tiêu chí
// nghiệm thu #1 nói rõ "KHÔNG có chuỗi nhãn literal trong InvoiceTable.tsx" — chỉ đọc file
// mới kiểm được điều đó.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { screen } from "@testing-library/react";
import { INVOICE_FIELDS, fieldsForTable } from "@vat/domain";
import { afterEach, describe, expect, it, vi } from "vitest";
import { O_BANG } from "../../src/features/invoices/InvoiceTable";
import { InvoicesPage } from "../../src/features/invoices/InvoicesPage";
import type { InvoiceListRow } from "../../src/types/api";
import { renderWithProviders } from "../helpers/renderApp";

// Vitest chạy với cwd = apps/web (gốc package) → đường dẫn tương đối từ đó là ổn định.
const NGUON_BANG = resolve(process.cwd(), "src/features/invoices/InvoiceTable.tsx");

function row(over: Partial<InvoiceListRow> = {}): InvoiceListRow {
  return {
    id: "r1",
    tenantId: "t",
    nbmst: "0311772540",
    nbten: "Cty Bán",
    nmmst: "4201568932",
    nmten: "Cty Mua",
    khmshdon: "1",
    khhdon: "C26TDA",
    shdon: "0001",
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
  } as InvoiceListRow;
}

function mockList(rows: InvoiceListRow[]): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(((input: RequestInfo | URL) => {
    const url = String(
      typeof input === "string" ? input : input instanceof URL ? input : input.url,
    );
    if (url.includes("/invoices"))
      return Promise.resolve(
        new Response(JSON.stringify({ rows, total: rows.length }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    return Promise.resolve(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  }) as typeof fetch);
}

describe("U-K2 — tiêu đề cột bảng đến từ Registry, không gõ tay", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("mọi nhãn cột render ra đều là nhanNgan ?? nhan của đúng field, đúng THỨ TỰ", async () => {
    mockList([row()]);
    renderWithProviders(<InvoicesPage />);
    await screen.findByText("Cty Bán");

    const mongDoi = fieldsForTable().map((f) => f.nhanNgan ?? f.nhan);
    const ths = Array.from(document.querySelectorAll("thead th"));
    // Cột đầu là ô CHỌN (checkbox, không nhãn chữ) — ngoại lệ có chủ ý, xem spec §Phạm vi.
    const nhanThuc = ths
      // Bỏ ký tự nút mở menu (⋮) để còn lại đúng phần nhãn chữ.
      .map((th) => (th.textContent ?? "").replace(/⋮/g, "").trim())
      .filter((s) => s.length > 0);

    expect(nhanThuc).toEqual(mongDoi);
  });

  // Đây là điều kiện then chốt của "một nguồn nhãn": nhãn phải KHÔNG tồn tại dưới dạng
  // chuỗi trong file bảng. Trôi nhãn chỉ xảy ra được khi có bản chép thứ hai.
  it("InvoiceTable.tsx KHÔNG chứa chuỗi nhãn cột nào (mọi nhãn qua Registry)", () => {
    const src = readFileSync(NGUON_BANG, "utf8");
    // Bỏ chú thích trước khi soi: chú thích được phép nhắc tên cột để giải thích.
    const maNguon = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

    for (const f of fieldsForTable()) {
      const nhan = f.nhanNgan ?? f.nhan;
      expect(maNguon, `nhãn '${nhan}' bị gõ thẳng trong InvoiceTable.tsx`).not.toContain(nhan);
    }
  });

  // Bất biến giữ hai nửa khớp nhau: Registry quyết CÓ CỘT NÀO, bảng quyết VẼ RA SAO. Thêm
  // cột vào Registry mà quên renderer ⇒ ô trống âm thầm trên production; test này chặn.
  it("mọi cột Registry đều có renderer ô — không cột nào rơi vào lưới an toàn", () => {
    for (const f of fieldsForTable()) {
      expect(typeof O_BANG[f.key], `cột '${f.key}' thiếu renderer ô trong O_BANG`).toBe("function");
    }
  });

  it("renderer KHÔNG thừa: mọi key trong O_BANG đều là cột Registry (không code chết)", () => {
    const khoaRegistry = new Set(fieldsForTable().map((f) => f.key));
    for (const k of Object.keys(O_BANG)) {
      expect(khoaRegistry.has(k), `renderer '${k}' không ứng với cột Registry nào`).toBe(true);
    }
  });

  it("lựa chọn ô lọc enum (chiều/nguồn) cũng đến từ Registry, không khai lại trong bảng", () => {
    const src = readFileSync(NGUON_BANG, "utf8");
    expect(src).not.toContain("CHIEU_CHON");
    expect(src).not.toContain("NGUON_CHON");
    expect(INVOICE_FIELDS.find((f) => f.key === "chieu")?.enum).toBeDefined();
  });
});

describe("U-K2 — PARITY: khả năng sắp/lọc trên bảng không đổi", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("đúng những cột CÓ menu tùy chọn như trước (9 cột), không mọc thêm", async () => {
    mockList([row()]);
    renderWithProviders(<InvoicesPage />);
    await screen.findByText("Cty Bán");

    const coMenu = fieldsForTable()
      .filter((f) => f.sapTrenBang || f.locDuoc)
      .map((f) => f.nhanNgan ?? f.nhan);
    // Mốc PARITY chụp trước khi sửa: 9 cột có <ColumnMenu>.
    expect(coMenu).toEqual([
      "Ngày lập",
      "Ký hiệu · Số HĐ",
      "Người bán",
      "Người mua",
      "Chưa thuế",
      "Tiền thuế",
      "Tổng TT",
      "Chiều",
      "Nguồn",
    ]);

    const nut = screen.getAllByRole("button", { name: /tùy chọn cột/i });
    expect(nut).toHaveLength(coMenu.length);
  });

  it("cột tóm tắt dòng hàng + trạng thái + tiền tệ vẫn KHÔNG có menu (không đổi hành vi)", async () => {
    mockList([row()]);
    renderWithProviders(<InvoicesPage />);
    await screen.findByText("Cty Bán");

    for (const nhan of ["Hàng hóa, dịch vụ", "Số lượng", "Tiền tệ", "TT xử lý", "TT hóa đơn"]) {
      expect(
        screen.queryByRole("button", { name: new RegExp(`tùy chọn cột ${nhan}`, "i") }),
        `${nhan} không được mọc thêm menu ở U-K2`,
      ).toBeNull();
    }
  });
});

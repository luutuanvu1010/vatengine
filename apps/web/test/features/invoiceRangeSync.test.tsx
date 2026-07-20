// U22 B7 — "chọn khoảng thời gian thì cũng chạy đồng bộ được cho khoảng đó" (chủ dự án),
// NAY có thanh tiến độ + TỰ chạy khi danh sách RỖNG. Khi bộ lọc đủ tuNgay+denNgay: nút
// "Đồng bộ khoảng này" (bấm tay khi có dữ liệu) HOẶC tự chạy (khi rỗng) → gọi CẢ HAI
// POST /backfill {tuNgay,denNgay} (U22) + POST /backfill-lines (U26), poll GET /backfill/:id
// hiện tiến độ; xong → tự làm mới danh sách. Hết phiên → nhắc kết nối lại, KHÔNG gọi.
// U27-B3: đồng bộ khoảng (nút + auto) CHỈ dành cho vai quản lý tài khoản thuế
// (canManageTaxAccounts) — seed vai qua applyMe; vai ke_toan → không panel, không auto.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../../src/features/auth/auth-context";
import { InvoicesPage } from "../../src/features/invoices/InvoicesPage";
import { saveInvoiceFilter } from "../../src/lib/filterStore";
import type { InvoiceListRow, MeResponse, Role, TaxAccountView } from "../../src/types/api";
import { renderWithProviders } from "../helpers/renderApp";

const ACC: TaxAccountView = {
  id: "acc-1",
  username: "4201969169",
  loai: "chinh",
  uyQuyenLuc: "2026-07-01T00:00:00.000Z",
  tokenHetHan: new Date(Date.now() + 3_600_000).toISOString(),
  ngayTao: "2026-07-01T00:00:00.000Z",
};
const EMPTY_SUMMARY = {
  byChieu: [],
  total: { count: 0, tongTcthue: null, tongTthue: null, tongTtbso: null },
};

function j(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Render InvoicesPage với vai đã seed (mặc định quan_tri — có quyền quản lý tài khoản thuế). */
function InvoicesPageAs({ vaiTro = "quan_tri" }: { vaiTro?: Role }) {
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
      role: vaiTro,
    };
    applyMe(me);
  }, [applyMe, vaiTro]);
  return <InvoicesPage />;
}

const ROW: InvoiceListRow = {
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
  soDongHang: 0,
  tongSoLuong: null,
  hangHoa: [],
};

function mockApi(opts: {
  accounts: TaxAccountView[];
  rows?: InvoiceListRow[];
  progressTong?: string;
  vaiTro?: Role;
}) {
  const posts: string[] = [];
  let invoiceCalls = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "POST" && url.includes("/backfill-lines")) {
      posts.push("backfill-lines");
      return j(202, { soHoaDonThieu: 2029, soDaXepHang: 2029, conLai: 0 });
    }
    if (method === "POST" && url.includes("/backfill")) {
      posts.push("backfill");
      return j(202, { backfillId: "b1", thangCanLay: ["2026-03"], tongSoThang: 1 });
    }
    if (method === "GET" && url.includes("/backfill/")) {
      return j(200, {
        backfillId: "b1",
        thang: [{ period: "2026-03", trangThai: "dang_chay" }],
        soXong: 0,
        tongSoThang: 1,
        trangThaiTong: opts.progressTong ?? "dang_chay",
      });
    }
    // ADR-0003 Amendment #1 (C8): AuthProvider gọi /me lúc khởi động để khôi phục phiên.
    // Phải trả hồ sơ ĐÚNG VAI ở đây — nếu để rơi xuống nhánh bắt-tất bên dưới, `me` sẽ
    // thành object danh sách hóa đơn (không có `role`) và ghi đè vai mà InvoicesPageAs
    // vừa seed, làm panel đồng bộ biến mất vì RBAC.
    if (url.endsWith("/me")) {
      return j(200, {
        ten: "DN",
        mst: "0311772540",
        goiDichVu: null,
        banQuyen: "Mặc định",
        ghiChu: null,
        role: opts.vaiTro ?? "quan_tri",
      });
    }
    if (url.includes("/tax-accounts")) return j(200, opts.accounts);
    if (url.includes("/invoices/summary")) return j(200, EMPTY_SUMMARY);
    invoiceCalls += 1;
    const rows = opts.rows ?? [];
    return j(200, { rows, total: rows.length, limit: 50, offset: 0 });
  });
  return { posts, invoiceCalls: () => invoiceCalls };
}

describe("Đồng bộ theo khoảng + thanh tiến độ (U22 B7)", () => {
  beforeEach(() => {
    saveInvoiceFilter({ tuNgay: "2026-03-01", denNgay: "2026-06-30" });
  });
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("kỳ rỗng + còn phiên → TỰ gọi backfill (khoảng)+backfill-lines, hiện thanh tiến độ", async () => {
    const { posts } = mockApi({ accounts: [ACC] });
    renderWithProviders(<InvoicesPageAs />);
    expect(await screen.findByRole("progressbar")).toBeInTheDocument();
    expect(await screen.findByText(/2029/)).toBeInTheDocument();
    expect(posts).toContain("backfill");
    expect(posts).toContain("backfill-lines");
  });

  it("danh sách CÓ dữ liệu → bấm nút 'Đồng bộ khoảng này' → gọi backfill+backfill-lines (thủ công)", async () => {
    const { posts } = mockApi({ accounts: [ACC], rows: [ROW] });
    renderWithProviders(<InvoicesPageAs />);
    // list không rỗng → KHÔNG tự chạy; chờ bảng hiện rồi bấm nút.
    await screen.findByText("VND");
    expect(posts).toHaveLength(0); // chưa bấm → chưa gọi
    await userEvent.click(screen.getByRole("button", { name: "Đồng bộ khoảng này" }));
    expect(await screen.findByRole("progressbar")).toBeInTheDocument();
    expect(posts).toContain("backfill");
    expect(posts).toContain("backfill-lines");
  });

  it("backfill hoàn thành → TỰ làm mới danh sách hóa đơn (invalidate)", async () => {
    const api = mockApi({ accounts: [ACC], progressTong: "hoan_thanh" });
    renderWithProviders(<InvoicesPageAs />);
    // Poll trả 'hoan_thanh' → banner "đã đồng bộ xong" + invalidate → /invoices gọi lại (>1).
    expect(await screen.findByText(/Đã đồng bộ xong/)).toBeInTheDocument();
    await vi.waitFor(() => expect(api.invoiceCalls()).toBeGreaterThan(1));
  });

  it("kỳ rỗng + hết phiên thuế → nhắc kết nối lại, KHÔNG gọi API đồng bộ", async () => {
    const { posts } = mockApi({
      accounts: [{ ...ACC, tokenHetHan: new Date(Date.now() - 1000).toISOString() }],
    });
    renderWithProviders(<InvoicesPageAs />);
    expect(await screen.findByText(/kết nối lại/i)).toBeInTheDocument();
    expect(posts).toHaveLength(0);
  });

  it("thiếu khoảng ngày → KHÔNG hiện panel đồng bộ khoảng", async () => {
    saveInvoiceFilter({ tuNgay: "2026-03-01" }); // thiếu denNgay
    mockApi({ accounts: [ACC] });
    renderWithProviders(<InvoicesPageAs />);
    await screen.findByText("Danh sách hóa đơn");
    expect(screen.queryByRole("button", { name: /Đồng bộ khoảng này/ })).toBeNull();
  });

  it("vai ke_toan → KHÔNG hiện panel VÀ không tự gọi backfill (U27-B3 AC6)", async () => {
    const { posts } = mockApi({ accounts: [ACC], vaiTro: "ke_toan" }); // kỳ rỗng
    renderWithProviders(<InvoicesPageAs vaiTro="ke_toan" />);
    // Kỳ rỗng + vai không đủ quyền → auto KHÔNG chạy → hiện ô rỗng thường (không thanh tiến độ).
    expect(await screen.findByText(/Không có hóa đơn khớp bộ lọc/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Đồng bộ khoảng này/ })).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(posts).toHaveLength(0);
  });
});

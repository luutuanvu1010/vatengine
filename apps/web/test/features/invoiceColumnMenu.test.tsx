// U31 — lọc & sắp xếp theo cột trên bảng hóa đơn. Server-side: mọi thao tác gửi tham số
// lên API và áp trên TOÀN TẬP, không lọc cục bộ trang đang xem (quyết định chủ dự án
// 2026-07-20 — lọc client chỉ 50 dòng sẽ khiến người dùng tưởng đã lọc hết, xuất thiếu).
import { screen, within } from "@testing-library/react";
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
  };
}

/** Ghi lại URL của mọi lần gọi /invoices để soi tham số đã gửi. */
function mockApi(total = 1) {
  const urls: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    const json = (v: unknown) =>
      new Response(JSON.stringify(v), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
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
        total: { count: total, tongTcthue: null, tongTthue: null, tongTtbso: null },
      });
    }
    if (url.includes("/invoices")) urls.push(url);
    return json({ rows: [row({})], total, limit: 50, offset: 0 });
  });
  return urls;
}

const lastUrl = (urls: string[]) => urls[urls.length - 1] ?? "";

/** Menu đang mở (fieldset mang role=group, nhận diện theo nhãn "Tùy chọn cột …"). */
const menuDangMo = () => screen.getByRole("group", { name: /tùy chọn cột/i });

/** Mở menu của một cột theo nhãn cột. */
async function moMenu(u: ReturnType<typeof userEvent.setup>, nhanCot: string) {
  await u.click(screen.getByRole("button", { name: new RegExp(`tùy chọn cột ${nhanCot}`, "i") }));
}

describe("U31 — sắp xếp theo cột", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("T13 — chọn sắp xếp tăng dần → gửi sortBy + sortDir lên server", async () => {
    const urls = mockApi();
    const u = userEvent.setup();
    renderWithProviders(<InvoicesPage />);
    await screen.findByText("0001");

    await moMenu(u, "Người bán");
    await u.click(screen.getByRole("button", { name: /tăng dần/i }));

    await vi.waitFor(() => {
      expect(lastUrl(urls)).toContain("sortBy=nbten");
      expect(lastUrl(urls)).toContain("sortDir=asc");
    });
  });

  it("chọn giảm dần → sortDir=desc", async () => {
    const urls = mockApi();
    const u = userEvent.setup();
    renderWithProviders(<InvoicesPage />);
    await screen.findByText("0001");

    await moMenu(u, "Tổng TT");
    await u.click(screen.getByRole("button", { name: /giảm dần/i }));

    await vi.waitFor(() => {
      expect(lastUrl(urls)).toContain("sortBy=tgtttbso");
      expect(lastUrl(urls)).toContain("sortDir=desc");
    });
  });

  it("KHÔNG sắp xếp → không gửi tham số sort (tương thích ngược)", async () => {
    const urls = mockApi();
    renderWithProviders(<InvoicesPage />);
    await screen.findByText("0001");
    expect(lastUrl(urls)).not.toContain("sortBy");
  });

  it("T16 — cột đang sắp xếp có dấu hiệu thị giác", async () => {
    mockApi();
    const u = userEvent.setup();
    renderWithProviders(<InvoicesPage />);
    await screen.findByText("0001");

    await moMenu(u, "Người bán");
    await u.click(screen.getByRole("button", { name: /tăng dần/i }));

    const th = screen.getByText("Người bán").closest("th");
    expect(th?.textContent).toContain("↑");
  });
});

describe("U31 — lọc theo cột", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("T14 — nhập lọc cột Người bán → gửi nbten lên server", async () => {
    const urls = mockApi();
    const u = userEvent.setup();
    renderWithProviders(<InvoicesPage />);
    await screen.findByText("0001");

    await moMenu(u, "Người bán");
    const menu = menuDangMo();
    await u.type(within(menu).getByRole("textbox"), "tour dao");
    await u.click(within(menu).getByRole("button", { name: /^Lọc$/i }));

    await vi.waitFor(() => expect(lastUrl(urls)).toContain("nbten=tour+dao"));
  });

  it("T14b — áp lọc cột RESET offset về 0 (đang ở trang 3 mà lọc → không kẹt trang trống)", async () => {
    const urls = mockApi(120); // total > limit ⇒ có phân trang
    const u = userEvent.setup();
    renderWithProviders(<InvoicesPage />);
    await screen.findByText("0001");

    await u.click(screen.getByRole("button", { name: /Sau|Tiếp|Next/i }));
    await vi.waitFor(() => expect(lastUrl(urls)).toContain("offset=50"));

    await moMenu(u, "Người bán");
    const menu = menuDangMo();
    await u.type(within(menu).getByRole("textbox"), "abc");
    await u.click(within(menu).getByRole("button", { name: /^Lọc$/i }));

    // Không reset thì người dùng lọc xong rơi vào trang 2 của tập mới — thường là RỖNG,
    // và họ sẽ tưởng bộ lọc không khớp gì.
    await vi.waitFor(() => {
      expect(lastUrl(urls)).toContain("nbten=abc");
      expect(lastUrl(urls)).toContain("offset=0");
    });
  });

  it("lọc cột Số HĐ → gửi shdon", async () => {
    const urls = mockApi();
    const u = userEvent.setup();
    renderWithProviders(<InvoicesPage />);
    await screen.findByText("0001");

    await moMenu(u, "Ký hiệu · Số HĐ");
    const menu = menuDangMo();
    await u.type(within(menu).getByRole("textbox"), "1284");
    await u.click(within(menu).getByRole("button", { name: /^Lọc$/i }));

    await vi.waitFor(() => expect(lastUrl(urls)).toContain("shdon=1284"));
  });

  it("T15 — áp lọc cột XÓA lựa chọn dòng (U30) — chống xuất nhầm", async () => {
    mockApi();
    const u = userEvent.setup();
    renderWithProviders(<InvoicesPage />);
    await screen.findByText("0001");

    await u.click(screen.getByLabelText(/chọn hóa đơn 0001/i));
    expect(screen.queryByRole("status")?.textContent).toContain("Đã chọn 1");

    await moMenu(u, "Người bán");
    const menu = menuDangMo();
    await u.type(within(menu).getByRole("textbox"), "x");
    await u.click(within(menu).getByRole("button", { name: /^Lọc$/i }));

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("T16b — cột đang lọc có dấu hiệu thị giác", async () => {
    mockApi();
    const u = userEvent.setup();
    renderWithProviders(<InvoicesPage />);
    await screen.findByText("0001");

    await moMenu(u, "Người bán");
    const menu = menuDangMo();
    await u.type(within(menu).getByRole("textbox"), "abc");
    await u.click(within(menu).getByRole("button", { name: /^Lọc$/i }));

    const th = screen.getByText("Người bán").closest("th");
    expect(th?.textContent).toContain("•");
  });

  it("xóa lọc cột → gỡ bộ lọc (dấu hiệu biến mất, ô nhập trống)", async () => {
    const urls = mockApi();
    const u = userEvent.setup();
    renderWithProviders(<InvoicesPage />);
    await screen.findByText("0001");

    await moMenu(u, "Người bán");
    let menu = menuDangMo();
    await u.type(within(menu).getByRole("textbox"), "abc");
    await u.click(within(menu).getByRole("button", { name: /^Lọc$/i }));
    await vi.waitFor(() => expect(lastUrl(urls)).toContain("nbten=abc"));
    expect(screen.getByText("Người bán").closest("th")?.textContent).toContain("•");

    await moMenu(u, "Người bán");
    menu = menuDangMo();
    await u.click(within(menu).getByRole("button", { name: /xóa lọc/i }));

    // KHÔNG khẳng định trên URL: bỏ bộ lọc đưa queryKey về đúng trạng thái ban đầu, và
    // React Query phục vụ lại từ cache (JSON.stringify bỏ khóa undefined) — không có
    // request mới, và đó là hành vi ĐÚNG. Cái cần canh là bộ lọc đã được gỡ thật.
    expect(screen.getByText("Người bán").closest("th")?.textContent).not.toContain("•");
    await moMenu(u, "Người bán");
    expect(within(menuDangMo()).getByRole("textbox")).toHaveValue("");
  });
});

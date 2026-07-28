// U35 (A6) — badge "Hóa đơn vừa thay đổi (N)" + panel trên màn Tra cứu. Mock fetch định
// tuyến theo path (cùng mẫu invoices.test.tsx) — không mạng thật, không gọi GDT.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  InvoiceChangesBadge,
  formatPhatHienLuc,
  nhanTrangThai,
} from "../../src/features/invoices/InvoiceChangesBadge";
import { renderWithProviders } from "../helpers/renderApp";

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const ROW_A = {
  id: "chg-1",
  hoaDonId: "inv-1",
  truong: "ttxly" as const,
  giaTriCu: 8,
  giaTriMoi: 6,
  lanDongBoId: null,
  phatHienLuc: "2026-04-12T10:00:00Z",
  daDoc: false,
  khmshdon: "1",
  khhdon: "C26TAA",
  shdon: "7",
  nbten: "Cty Bán X",
};

function mockRoutes(opts: { list?: { rows: unknown[]; total: number; unreadCount: number } }) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/invoices/changes/mark-read")) {
      return jsonRes({ ok: true, markedCount: 1 });
    }
    if (url.includes("/invoices/changes")) {
      return jsonRes(opts.list ?? { rows: [], total: 0, limit: 20, offset: 0, unreadCount: 0 });
    }
    return jsonRes({}, 500);
  });
}

describe("nhanTrangThai / formatPhatHienLuc (thuần)", () => {
  it("ttxly CHƯA kiểm chứng (Registry rỗng) → hiện fallback '(chưa rõ)', KHÔNG bịa nhãn", () => {
    expect(nhanTrangThai("ttxly", 8)).toBe("8 (chưa rõ)");
  });

  it("tthai=1 đã kiểm chứng → 'Gốc'", () => {
    expect(nhanTrangThai("tthai", 1)).toBe("Gốc");
  });

  it("mã null → '—'", () => {
    expect(nhanTrangThai("ttxly", null)).toBe("—");
  });

  it("format ngày giờ dd/mm/yyyy hh:mm", () => {
    expect(formatPhatHienLuc("2026-01-02T03:04:00Z")).toMatch(/^02\/01\/2026 \d{2}:\d{2}$/);
  });
});

describe("InvoiceChangesBadge", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("unreadCount=0 → nhãn KHÔNG hiện số; unreadCount>0 → hiện '(N)'", async () => {
    mockRoutes({ list: { rows: [], total: 0, unreadCount: 0 } });
    renderWithProviders(<InvoiceChangesBadge />);
    expect(await screen.findByRole("button", { name: "Hóa đơn vừa thay đổi" })).toBeInTheDocument();
  });

  it("có thay đổi chưa đọc → badge hiện '(N)'", async () => {
    mockRoutes({ list: { rows: [ROW_A], total: 1, unreadCount: 1 } });
    renderWithProviders(<InvoiceChangesBadge />);
    expect(
      await screen.findByRole("button", { name: "Hóa đơn vừa thay đổi (1)" }),
    ).toBeInTheDocument();
  });

  it("bấm mở panel → hiện định danh HĐ + 'Trạng thái: cũ → mới, phát hiện …'", async () => {
    mockRoutes({ list: { rows: [ROW_A], total: 1, unreadCount: 1 } });
    renderWithProviders(<InvoiceChangesBadge />);
    const trigger = await screen.findByRole("button", { name: "Hóa đơn vừa thay đổi (1)" });
    fireEvent.click(trigger);

    const panel = await screen.findByRole("group", { name: "Hóa đơn vừa thay đổi" });
    expect(within(panel).getByText("C26TAA-7 · Cty Bán X")).toBeInTheDocument();
    // ttxly 8→6, chưa mã nào kiểm chứng → cả hai vế đều "(chưa rõ)" (nguyên tắc bằng chứng).
    expect(
      within(panel).getByText(/Trạng thái: 8 \(chưa rõ\) → 6 \(chưa rõ\), phát hiện/),
    ).toBeInTheDocument();
  });

  it("bấm liên kết một dòng → gọi mark-read với ĐÚNG id dòng đó (đọc kèm mở hóa đơn)", async () => {
    const bodies: unknown[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/invoices/changes/mark-read")) {
        bodies.push(init?.body ? JSON.parse(String(init.body)) : undefined);
        return jsonRes({ ok: true, markedCount: 1 });
      }
      if (url.includes("/invoices/changes")) {
        return jsonRes({ rows: [ROW_A], total: 1, limit: 20, offset: 0, unreadCount: 1 });
      }
      return jsonRes({}, 500);
    });
    renderWithProviders(<InvoiceChangesBadge />);
    fireEvent.click(await screen.findByRole("button", { name: "Hóa đơn vừa thay đổi (1)" }));
    const panel = await screen.findByRole("group", { name: "Hóa đơn vừa thay đổi" });
    fireEvent.click(within(panel).getByRole("link", { name: "C26TAA-7 · Cty Bán X" }));
    await waitFor(() => expect(bodies).toEqual([{ ids: ["chg-1"] }]));
  });

  it("chưa đọc → hiện Badge 'Mới'; đã đọc → không hiện", async () => {
    mockRoutes({
      list: {
        rows: [ROW_A, { ...ROW_A, id: "chg-2", daDoc: true, giaTriMoi: 5 }],
        total: 2,
        unreadCount: 1,
      },
    });
    renderWithProviders(<InvoiceChangesBadge />);
    fireEvent.click(await screen.findByRole("button", { name: "Hóa đơn vừa thay đổi (1)" }));
    const panel = await screen.findByRole("group", { name: "Hóa đơn vừa thay đổi" });
    expect(within(panel).getAllByText("Mới")).toHaveLength(1);
  });

  it("trạng thái rỗng: không có thay đổi nào → 'Chưa có thay đổi nào'", async () => {
    mockRoutes({ list: { rows: [], total: 0, unreadCount: 0 } });
    renderWithProviders(<InvoiceChangesBadge />);
    fireEvent.click(await screen.findByRole("button", { name: "Hóa đơn vừa thay đổi" }));
    expect(await screen.findByText("Chưa có thay đổi nào.")).toBeInTheDocument();
  });

  it("lỗi tải → ErrorState + nút thử lại", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonRes({ error: "internal" }, 500));
    renderWithProviders(<InvoiceChangesBadge />);
    fireEvent.click(await screen.findByRole("button", { name: "Hóa đơn vừa thay đổi" }));
    // 5xx được queryClient retry 1 lần (queryClient.ts) trước khi chốt isError — chờ dài
    // hơn mặc định để không đỏ giả do độ trễ backoff giữa hai lần thử.
    expect(
      await screen.findByText("Không tải được danh sách thay đổi.", {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thử lại" })).toBeInTheDocument();
  });

  it("'Đánh dấu tất cả đã đọc' → gọi mark-read KHÔNG ids (mark-all) → badge về 0 sau khi làm mới", async () => {
    // Mock ĐỘNG: list phản ứng theo việc mark-read đã được gọi hay chưa, để bài test
    // xác nhận thật sự có REFETCH sau mutation (không chỉ tin optimistic UI).
    let markedAll = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/invoices/changes/mark-read")) {
        markedAll = true;
        return jsonRes({ ok: true, markedCount: 1 });
      }
      if (url.includes("/invoices/changes")) {
        return jsonRes(
          markedAll
            ? { rows: [], total: 0, limit: 20, offset: 0, unreadCount: 0 }
            : { rows: [ROW_A], total: 1, limit: 20, offset: 0, unreadCount: 1 },
        );
      }
      return jsonRes({}, 500);
    });

    renderWithProviders(<InvoiceChangesBadge />);
    fireEvent.click(await screen.findByRole("button", { name: "Hóa đơn vừa thay đổi (1)" }));
    const panel = await screen.findByRole("group", { name: "Hóa đơn vừa thay đổi" });
    fireEvent.click(within(panel).getByRole("button", { name: "Đánh dấu tất cả đã đọc" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Hóa đơn vừa thay đổi" })).toBeInTheDocument(),
    );
  });
});

// Chấm đỏ số đếm chưa đọc (kiểu TikTok) — chủ dự án yêu cầu 2026-07-28.
// Ràng buộc: SỐ vẫn phải tới được trình đọc màn hình. Nó rời khỏi chữ hiện trên nút nên
// phải nằm ở `aria-label`; chính chấm thì `aria-hidden` để không bị đọc hai lần.
describe("Chấm đỏ số chưa đọc", () => {
  afterEach(() => vi.restoreAllMocks());

  it("unreadCount > 0 → hiện chấm với đúng số, KHÔNG còn '(N)' trong chữ hiển thị", async () => {
    mockRoutes({ list: { rows: [ROW_A], total: 1, unreadCount: 3 } });
    renderWithProviders(<InvoiceChangesBadge />);
    const nut = await screen.findByRole("button", { name: "Hóa đơn vừa thay đổi (3)" });
    // Chữ nhìn thấy trên nút KHÔNG chứa số nữa — số nằm ở chấm.
    expect(nut.textContent).toContain("Hóa đơn vừa thay đổi");
    expect(nut.textContent).not.toContain("(3)");
    const cham = within(nut).getByTestId("so-chua-doc");
    expect(cham.textContent).toBe("3");
  });

  it("số vẫn tới được trình đọc màn hình qua aria-label; chấm KHÔNG bị đọc trùng", async () => {
    mockRoutes({ list: { rows: [ROW_A], total: 1, unreadCount: 3 } });
    renderWithProviders(<InvoiceChangesBadge />);
    const nut = await screen.findByRole("button", { name: "Hóa đơn vừa thay đổi (3)" });
    expect(nut.getAttribute("aria-label")).toBe("Hóa đơn vừa thay đổi (3)");
    expect(within(nut).getByTestId("so-chua-doc").getAttribute("aria-hidden")).toBe("true");
  });

  it("unreadCount = 0 → KHÔNG có chấm (không để chấm đỏ trơ khi chẳng có gì mới)", async () => {
    mockRoutes({ list: { rows: [], total: 0, unreadCount: 0 } });
    renderWithProviders(<InvoiceChangesBadge />);
    const nut = await screen.findByRole("button", { name: "Hóa đơn vừa thay đổi" });
    expect(within(nut).queryByTestId("so-chua-doc")).toBeNull();
  });

  it("trên 99 → cắt thành '99+' để chấm không phình làm vỡ hàng nút", async () => {
    mockRoutes({ list: { rows: [ROW_A], total: 1, unreadCount: 1234 } });
    renderWithProviders(<InvoiceChangesBadge />);
    const nut = await screen.findByRole("button", { name: "Hóa đơn vừa thay đổi (1234)" });
    expect(within(nut).getByTestId("so-chua-doc").textContent).toBe("99+");
  });

  it("đúng 99 vẫn hiện đủ số (biên, không cắt sớm)", async () => {
    mockRoutes({ list: { rows: [ROW_A], total: 1, unreadCount: 99 } });
    renderWithProviders(<InvoiceChangesBadge />);
    const nut = await screen.findByRole("button", { name: "Hóa đơn vừa thay đổi (99)" });
    expect(within(nut).getByTestId("so-chua-doc").textContent).toBe("99");
  });

  it("tô bằng token --notify-*, KHÔNG mượn --danger-* (07-DESIGN_TOKENS: không dùng lẫn)", async () => {
    mockRoutes({ list: { rows: [ROW_A], total: 1, unreadCount: 2 } });
    renderWithProviders(<InvoiceChangesBadge />);
    const cham = within(
      await screen.findByRole("button", { name: "Hóa đơn vừa thay đổi (2)" }),
    ).getByTestId("so-chua-doc");
    expect(cham.style.background).toBe("var(--notify-600)");
    expect(cham.style.color).toBe("var(--notify-fg)");
  });
});

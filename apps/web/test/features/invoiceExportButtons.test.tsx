// B2 (U27) — Nút Xuất Excel/CSV theo HÓA ĐƠN trong danh sách. Tái dùng đúng luồng
// ExportsPage: createExport(format, filter) → downloadExport(id) → saveBlob(blob,
// "hoa-don.<format>"). Kết xuất TOÀN BỘ kết quả theo bộ lọc (server-side). Chỉ vai
// canExport (ke_toan_truong/quan_tri) thấy nút; ke_toan → không render.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../../src/features/auth/auth-context";
import { InvoiceExportButtons } from "../../src/features/invoices/InvoiceExportButtons";
import { clearToken, setToken } from "../../src/lib/apiClient";
import type { InvoiceFilter, MeResponse, Role } from "../../src/types/api";
import { renderWithProviders } from "../helpers/renderApp";

const FILTER: InvoiceFilter = { chieu: "purchase", tuNgay: "2026-03-01", denNgay: "2026-03-31" };

/** Seed vai qua applyMe (1 lần) rồi render nút — cô lập component. Prop tên `vaiTro`
 * (không phải `role`) để Biome không hiểu nhầm JSX prop là ARIA role. */
function ExportButtonsAs({ vaiTro, filter = FILTER }: { vaiTro: Role; filter?: InvoiceFilter }) {
  const { applyMe } = useAuth();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const me: MeResponse = {
      ten: "DN",
      mst: "0311772540",
      goiDichVu: null,
      banQuyen: "Mặc định",
      ghiChu: null,
      role: vaiTro,
    };
    applyMe(me);
  }, [applyMe, vaiTro]);
  return <InvoiceExportButtons filter={filter} />;
}

let calls: { url: string; method: string }[];
function mockExports(postStatus = 201) {
  calls = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method });
    if (method === "POST" && url.includes("/exports")) {
      const body = postStatus === 201 ? { id: "e1", key: "k", url: "u" } : { error: "forbidden" };
      return new Response(JSON.stringify(body), {
        status: postStatus,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("filebytes", { status: 200 }); // GET /exports/e1 → blob
  });
}

describe("B2 — nút kết xuất theo hóa đơn", () => {
  beforeEach(() => {
    setToken("t");
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:x"),
      revokeObjectURL: vi.fn(),
    });
  });
  afterEach(() => {
    clearToken();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("vai ke_toan_truong → thấy 2 nút Xuất Excel/CSV", () => {
    mockExports();
    renderWithProviders(<ExportButtonsAs vaiTro="ke_toan_truong" />);
    expect(screen.getByRole("button", { name: "Xuất Excel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Xuất CSV" })).toBeInTheDocument();
  });

  it("vai ke_toan → KHÔNG render nút", () => {
    mockExports();
    renderWithProviders(<ExportButtonsAs vaiTro="ke_toan" />);
    expect(screen.queryByRole("button", { name: "Xuất Excel" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Xuất CSV" })).toBeNull();
  });

  it("bấm Xuất Excel → createExport('xlsx', filter) đúng bộ lọc rồi tải file", async () => {
    mockExports();
    renderWithProviders(<ExportButtonsAs vaiTro="quan_tri" />);
    await userEvent.click(screen.getByRole("button", { name: "Xuất Excel" }));
    await waitFor(() => {
      expect(
        calls.some(
          (c) =>
            c.method === "POST" &&
            c.url.includes("/exports?format=xlsx") &&
            c.url.includes("chieu=purchase") &&
            c.url.includes("tuNgay=2026-03-01"),
        ),
      ).toBe(true);
      expect(calls.some((c) => c.url.includes("/exports/e1"))).toBe(true);
    });
  });

  it("bấm Xuất CSV → createExport('csv', filter)", async () => {
    mockExports();
    renderWithProviders(<ExportButtonsAs vaiTro="quan_tri" />);
    await userEvent.click(screen.getByRole("button", { name: "Xuất CSV" }));
    await waitFor(() => {
      expect(calls.some((c) => c.method === "POST" && c.url.includes("/exports?format=csv"))).toBe(
        true,
      );
    });
  });

  it("403 → hiện 'Bạn không có quyền kết xuất.', không crash", async () => {
    mockExports(403);
    renderWithProviders(<ExportButtonsAs vaiTro="quan_tri" />);
    await userEvent.click(screen.getByRole("button", { name: "Xuất Excel" }));
    expect(await screen.findByText(/không có quyền kết xuất/i)).toBeInTheDocument();
  });
});

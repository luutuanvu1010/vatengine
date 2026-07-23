import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
// Chọn cột xuất (S1): nhớ localStorage, panel tick ẩn/hiện, và cột đã chọn CHẢY vào
// createExport (body.cols). Server allowlist + sinh file — phần đó test ở @vat/export/api.
import { FLAT_EXPORT_DEFAULT_KEYS } from "@vat/domain";
import { useEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../../src/features/auth/auth-context";
import { ChonCotXuat } from "../../src/features/invoices/ChonCotXuat";
import { InvoiceExportButtons } from "../../src/features/invoices/InvoiceExportButtons";
import { loadExportCols, saveExportCols } from "../../src/lib/exportColsStore";
import type { InvoiceFilter, MeResponse } from "../../src/types/api";
import { renderWithProviders } from "../helpers/renderApp";

describe("exportColsStore — nhớ lựa chọn cột", () => {
  beforeEach(() => localStorage.clear());

  it("chưa lưu → 16 cột mặc định", () => {
    expect(loadExportCols()).toEqual([...FLAT_EXPORT_DEFAULT_KEYS]);
  });

  it("lưu rồi đọc lại giữ nguyên; BỎ key lạ", () => {
    saveExportCols(["shdon", "nbten"]);
    expect(loadExportCols()).toEqual(["shdon", "nbten"]);
    localStorage.setItem("vat.exportCols.v1", JSON.stringify(["shdon", "khong_ton_tai"]));
    expect(loadExportCols()).toEqual(["shdon"]);
  });

  it("dữ liệu hỏng → về mặc định", () => {
    localStorage.setItem("vat.exportCols.v1", "khong-phai-json");
    expect(loadExportCols()).toEqual([...FLAT_EXPORT_DEFAULT_KEYS]);
  });
});

describe("ChonCotXuat — panel tick ẩn/hiện", () => {
  it("mở panel → bỏ tick cột → onChange; 'Về mặc định' khôi phục", async () => {
    const onChange = vi.fn();
    render(<ChonCotXuat value={["shdon"]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /Tùy chỉnh cột/ }));
    await userEvent.click(screen.getByLabelText("Số HĐ")); // đang chọn → bỏ
    expect(onChange).toHaveBeenLastCalledWith([]);
    await userEvent.click(screen.getByRole("button", { name: /Về mặc định/ }));
    expect(onChange).toHaveBeenLastCalledWith([...FLAT_EXPORT_DEFAULT_KEYS]);
  });
});

const FILTER: InvoiceFilter = { tuNgay: "2026-03-01", denNgay: "2026-03-31" };

function ExportAs({ cols }: { cols: string[] }) {
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
      role: "quan_tri",
    };
    applyMe(me);
  }, [applyMe]);
  return <InvoiceExportButtons filter={FILTER} cols={cols} />;
}

describe("Xuất TÔN TRỌNG cột đã chọn", () => {
  beforeEach(() => {
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:x"),
      revokeObjectURL: vi.fn(),
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("bấm Xuất → createExport gửi cols đã chọn trong body", async () => {
    const bodies: Array<{ cols?: string[] } | null> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/me")) {
        return new Response(
          JSON.stringify({
            ten: "DN",
            mst: "0311772540",
            goiDichVu: null,
            banQuyen: "Mặc định",
            ghiChu: null,
            role: "quan_tri",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (method === "POST" && url.includes("/exports")) {
        bodies.push(init?.body ? JSON.parse(String(init.body)) : null);
        return new Response(JSON.stringify({ id: "e1", key: "k", url: "u" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("filebytes", { status: 200 });
    });

    renderWithProviders(<ExportAs cols={["shdon", "nbten"]} />);
    await userEvent.click(screen.getByRole("button", { name: "Xuất Excel" }));
    await waitFor(() => {
      expect(
        bodies.some((b) => JSON.stringify(b?.cols) === JSON.stringify(["shdon", "nbten"])),
      ).toBe(true);
    });
  });
});

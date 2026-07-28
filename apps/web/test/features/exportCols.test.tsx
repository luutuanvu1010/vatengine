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
import { EXPORT_COLS_KEY, loadExportCols, saveExportCols } from "../../src/lib/exportColsStore";
import type { InvoiceFilter, MeResponse } from "../../src/types/api";
import { renderWithProviders } from "../helpers/renderApp";

describe("exportColsStore — nhớ lựa chọn cột", () => {
  beforeEach(() => localStorage.clear());

  it("chưa lưu → bộ cột mặc định", () => {
    expect(loadExportCols()).toEqual([...FLAT_EXPORT_DEFAULT_KEYS]);
  });

  it("lưu rồi đọc lại giữ nguyên; BỎ key lạ", () => {
    saveExportCols(["shdon", "nbten"]);
    expect(loadExportCols()).toEqual(["shdon", "nbten"]);
    localStorage.setItem(EXPORT_COLS_KEY, JSON.stringify(["shdon", "khong_ton_tai"]));
    expect(loadExportCols()).toEqual(["shdon"]);
  });

  it("dữ liệu hỏng → về mặc định", () => {
    localStorage.setItem(EXPORT_COLS_KEY, "khong-phai-json");
    expect(loadExportCols()).toEqual([...FLAT_EXPORT_DEFAULT_KEYS]);
  });

  // U36 tiêu chí #13 — khóa cũ `v1` CHỈ lọc key lạ, KHÔNG bổ sung key mới. Người dùng đã
  // từng bấm "Tùy chỉnh cột" trước U36 sẽ không bao giờ thấy 3 cột trạng thái ⇒ QĐ-1
  // ("bật mặc định") vô hiệu với đúng nhóm người dùng quan tâm nhất. Bump khóa lên v2.
  it("người dùng có lựa chọn cũ (khóa v1) → BỎ QUA, nhận bộ mặc định MỚI có 3 cột trạng thái", () => {
    localStorage.setItem("vat.exportCols.v1", JSON.stringify(["sttFile", "shdon", "nbten"]));
    const cols = loadExportCols();
    expect(cols).toEqual([...FLAT_EXPORT_DEFAULT_KEYS]);
    expect(cols).toContain("tthai");
    expect(cols).toContain("tthaiNhan");
    expect(cols).toContain("tinhVaoTong");
  });

  it("khóa đang dùng là v2 (đổi khóa = đổi hành vi người dùng cũ — phải tường minh)", () => {
    expect(EXPORT_COLS_KEY).toBe("vat.exportCols.v2");
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

  // Số cột trên nút phải DẪN XUẤT từ catalog: chuỗi cứng "(16 cột)" đã nói dối người dùng
  // ngay khi U36 thêm 3 cột, và sẽ nói dối lại ở lần thêm cột sau.
  it("nhãn nút nêu ĐÚNG số cột mặc định, dẫn xuất từ catalog", async () => {
    render(<ChonCotXuat value={["shdon"]} onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /Tùy chỉnh cột/ }));
    screen.getByRole("button", { name: `Về mặc định (${FLAT_EXPORT_DEFAULT_KEYS.length} cột)` });
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

import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExportsPage } from "../../src/features/exports/ExportsPage";
import { renderWithProviders } from "../helpers/renderApp";

let calls: { url: string; method: string }[];

function mockExports() {
  calls = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method });
    if (url.includes("/exports/convert")) {
      return new Response(JSON.stringify({ id: "e1", key: "k", url: "u", profile: "reference" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    }
    if (method === "POST" && url.includes("/exports")) {
      return new Response(JSON.stringify({ id: "e1", key: "k", url: "u" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    }
    // GET /exports/e1 → blob tải về
    return new Response("filebytes", { status: 200 });
  });
}

describe("U15.4 — kết xuất & convert", () => {
  beforeEach(() => {
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:x"),
      revokeObjectURL: vi.fn(),
    });
    mockExports();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("chỉ reference khả dụng; MISA/FAST/SMART 'Sắp có' (khóa)", () => {
    renderWithProviders(<ExportsPage />);
    expect(screen.getByText("Khả dụng")).toBeInTheDocument();
    expect(screen.getAllByText("Sắp có")).toHaveLength(3);
    expect(screen.getByText("MISA")).toBeInTheDocument();
  });

  it("mẫu chuẩn (native) → POST /exports?format=xlsx rồi tải", async () => {
    renderWithProviders(<ExportsPage />);
    await userEvent.click(screen.getByRole("button", { name: "Tạo và tải tệp" }));
    await waitFor(() => {
      expect(calls.some((c) => c.method === "POST" && c.url.includes("/exports?format=xlsx"))).toBe(
        true,
      );
      expect(calls.some((c) => c.url.includes("/exports/e1"))).toBe(true);
    });
    expect(await screen.findByText(/bắt đầu tải về/)).toBeInTheDocument();
  });

  it("chọn reference → POST /exports/convert?profile=reference", async () => {
    renderWithProviders(<ExportsPage />);
    // Hai nơi cùng mang chữ "Định dạng tham chiếu" từ 2026-07-29 (thẻ chọn + dòng tóm tắt
    // bên phải) — nhắm ĐÚNG thẻ chọn bấm được, không để query mơ hồ.
    await userEvent.click(screen.getByRole("button", { name: /Định dạng tham chiếu/ }));
    await userEvent.click(screen.getByRole("button", { name: "Tạo và tải tệp" }));
    await waitFor(() => {
      expect(calls.some((c) => c.url.includes("/exports/convert?profile=reference"))).toBe(true);
    });
  });
});

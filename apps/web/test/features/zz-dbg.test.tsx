import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "../../src/features/dashboard/DashboardPage";
import { renderWithProviders } from "../helpers/renderApp";

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

describe("dbg", () => {
  afterEach(() => vi.restoreAllMocks());
  it("in ra URL đã gọi + nội dung", async () => {
    const goi: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      goi.push(url);
      if (url.includes("/me")) return json({ ten: "DN", mst: "4201568932", role: "ke_toan_truong" });
      if (url.includes("/tax-accounts")) return json([{ id: "tk1", username: "4201568932", tokenHetHan: "2999-06-15T10:30:00Z" }]);
      if (url.includes("/invoices/summary")) {
        const moiKy = !url.includes("tuNgay");
        return json(moiKy ? [] : { byChieu: [], total: { count: 0 } });
      }
      if (url.includes("/invoices")) return json({ rows: [], total: 0 });
      return json({});
    });
    const { container } = renderWithProviders(<DashboardPage />);
    await screen.findByText(/không có việc nào cần xử lý/i);
    await new Promise((r) => setTimeout(r, 200));
    console.log("URLS:", JSON.stringify(goi, null, 1));
    console.log("TEXT:", container.textContent?.slice(0, 600));
    expect(true).toBe(true);
  });
});

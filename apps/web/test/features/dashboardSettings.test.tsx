import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "../../src/features/dashboard/DashboardPage";
import { clearToken, setToken } from "../../src/lib/apiClient";
import { AppRouter } from "../../src/routes/AppRouter";
import { json, mockFetch, renderWithProviders } from "../helpers/renderApp";

describe("Dashboard (D)", () => {
  beforeEach(() => setToken("t"));
  afterEach(() => {
    clearToken();
    vi.restoreAllMocks();
  });

  it("thẻ mua/bán + đối chiếu 4 số (rút gọn tr/tỷ)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/invoices/summary")) {
        return json(200, {
          byChieu: [
            {
              chieu: "purchase",
              count: 4,
              tongTcthue: null,
              tongTthue: "35000000",
              tongTtbso: "389100000",
            },
            {
              chieu: "sold",
              count: 2,
              tongTcthue: null,
              tongTthue: "177000000",
              tongTtbso: "2080000000",
            },
          ],
          total: { count: 6, tongTcthue: null, tongTthue: null, tongTtbso: null },
        });
      }
      return json(200, {
        findings: [],
        summary: { lechThue: 2, thieuSoDauRa: 1, huy: 1, thayThe: 1 },
      });
    });
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByText("389,1 tr đ")).toBeInTheDocument();
    expect(screen.getByText("2,08 tỷ đ")).toBeInTheDocument();
    expect(screen.getByText("Xem chi tiết →")).toBeInTheDocument();
    // ke_toan (me null → fallback) → KHÔNG có lối tắt kết xuất.
    expect(screen.queryByText("Kết xuất & Convert")).not.toBeInTheDocument();
  });
});

describe("Cài đặt chung (B6)", () => {
  beforeEach(() => clearToken());
  afterEach(() => vi.restoreAllMocks());

  it("hiện Tên/MST/Gói/Vai trò từ /me — KHÔNG địa chỉ bịa", async () => {
    mockFetch({
      login: () => json(200, { token: "jwt" }),
      me: () =>
        json(200, {
          ten: "Công ty TNHH Tour Đảo",
          mst: "4201568932",
          goiDichVu: "Miễn phí",
          role: "ke_toan_truong",
        }),
    });
    renderWithProviders(<AppRouter />, "/");
    await userEvent.type(screen.getByLabelText("Email công việc"), "kt@tourdao.vn");
    await userEvent.type(screen.getByLabelText("Mật khẩu"), "pw");
    await userEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
    await userEvent.click(await screen.findByRole("link", { name: "Cài đặt chung" }));

    expect(await screen.findByText("Mã số thuế")).toBeInTheDocument();
    expect(screen.getByText("4201568932")).toBeInTheDocument();
    expect(screen.getByText("Miễn phí")).toBeInTheDocument();
    // Không có địa chỉ bịa (tenants chưa có cột dia_chi).
    expect(screen.queryByText(/đường B2/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Địa chỉ")).not.toBeInTheDocument();
  });
});

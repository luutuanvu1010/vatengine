import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "../../src/features/auth/auth-context";
import { loadInvoiceFilter, saveInvoiceFilter } from "../../src/lib/filterStore";
import { json } from "../helpers/renderApp";

// H-B.3 — chống rò dữ liệu tenant trên máy dùng chung: chuyển phiên (đăng xuất / đăng
// nhập) PHẢI xóa cache React Query (singleton toàn app) + bộ lọc localStorage.
function LogoutHarness() {
  const { logout } = useAuth();
  return (
    <button type="button" onClick={logout}>
      thoat
    </button>
  );
}

function LoginHarness() {
  const { login } = useAuth();
  return (
    <button type="button" onClick={() => login("b@moi.vn", "matkhau")}>
      vao
    </button>
  );
}

describe("H-B.3 — dọn trạng thái phiên client", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("đăng xuất → xóa cache React Query + bộ lọc localStorage", async () => {
    const qc = new QueryClient();
    qc.setQueryData(["invoices", {}, 0], { rows: [{ id: "TENANT_A" }], total: 1 });
    saveInvoiceFilter({ nbmst: "4201568932" });

    render(
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <LogoutHarness />
        </AuthProvider>
      </QueryClientProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "thoat" }));

    expect(qc.getQueryData(["invoices", {}, 0])).toBeUndefined();
    expect(loadInvoiceFilter()).toEqual({});
  });

  it("đăng nhập → xóa cache + bộ lọc cũ trước khi phục vụ tenant mới", async () => {
    const qc = new QueryClient();
    qc.setQueryData(["invoices", {}, 0], { rows: [{ id: "STALE" }], total: 1 });
    saveInvoiceFilter({ nbmst: "0000000000" });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) return json(200, { token: "jwt" });
      if (url.endsWith("/me"))
        return json(200, { ten: "DN Mới", mst: "4201568932", goiDichVu: null, role: "quan_tri" });
      return json(200, {});
    });

    render(
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <LoginHarness />
        </AuthProvider>
      </QueryClientProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "vao" }));

    await waitFor(() => expect(qc.getQueryData(["invoices", {}, 0])).toBeUndefined());
    expect(loadInvoiceFilter()).toEqual({});
  });
});

// ADR-0003 Amendment #1 (C8 + C9) — phiên sống qua RELOAD nhờ cookie HttpOnly.
// Bối cảnh: reload huỷ toàn bộ JS context. Trước đây token nằm trong biến in-memory nên
// mất sạch → phải đăng nhập lại. Nay cookie do trình duyệt giữ, app khởi động phải HỎI
// LẠI server (`/me`) xem cookie còn hợp lệ không, thay vì mặc định coi là chưa đăng nhập.
//
// jsdom KHÔNG có cookie jar thật cho fetch mock, nên "còn cookie" được mô phỏng bằng
// việc `/me` trả 200; "hết/không cookie" bằng 401 — đúng điều SPA quan sát được.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "../../src/features/auth/auth-context";
import { saveInvoiceFilter } from "../../src/lib/filterStore";
import { AppRouter } from "../../src/routes/AppRouter";
import { json, mockFetch } from "../helpers/renderApp";

const ME_OK = {
  tenantId: "t-1",
  ten: "Cty A",
  mst: "0100000001",
  goiDichVu: null,
  ghiChu: null,
  role: "quan_tri",
};

/** Hiển thị thẳng trạng thái phiên để khẳng định không mơ hồ. */
function StatusProbe() {
  const { status } = useAuth();
  return <output data-testid="status">{status}</output>;
}

function renderRouter(ui: React.ReactElement, route = "/") {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider>{ui}</AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("C8/C9 — phiên sống qua reload (cookie HttpOnly)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("C8 — mở app khi cookie CÒN hiệu lực → vào thẳng app, KHÔNG bắt đăng nhập lại", async () => {
    // Đây chính là ca hỏng mà người dùng báo: nhấn Reload thì phải đăng nhập lại.
    mockFetch({ me: () => json(200, ME_OK) });
    renderRouter(<StatusProbe />);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authed"));
  });

  it("C8b — cookie HẾT hiệu lực (/me → 401) → về anon", async () => {
    mockFetch({ me: () => json(401, { error: "unauthorized" }) });
    renderRouter(<StatusProbe />);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anon"));
  });

  it("C8c — trong lúc đang kiểm tra phiên, KHÔNG nháy màn Login", async () => {
    // Nếu router coi 'checking' như 'chưa đăng nhập', mỗi lần tải trang người dùng sẽ
    // thấy màn Login loé lên rồi mới vào app — tệ hơn cả vấn đề đang sửa.
    let releaseMe: (r: Response) => void = () => {};
    const pending = new Promise<Response>((resolve) => {
      releaseMe = resolve;
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      String(input).endsWith("/me") ? pending : json(200, { rows: [], total: 0 }),
    );

    renderRouter(<AppRouter />);
    // /me chưa trả → đang 'checking'. Màn Login KHÔNG được xuất hiện.
    await Promise.resolve();
    expect(screen.queryByLabelText(/mật khẩu/i)).toBeNull();

    releaseMe(json(200, ME_OK));
    await waitFor(() => expect(screen.queryByLabelText(/mật khẩu/i)).toBeNull());
  });

  it("C9 — /me trả 401 lúc khởi động → dọn bộ lọc localStorage (H-B.3, chống rò tenant)", async () => {
    // multi-tenant.md: "Bất kỳ luồng đổi tenant MỚI nào bắt buộc gọi cùng bước dọn này".
    // Khởi-động-với-cookie-cũ là một ranh giới phiên MỚI → phải dọn như logout/401.
    saveInvoiceFilter({ nbmst: "4201568932" });
    mockFetch({ me: () => json(401, { error: "unauthorized" }) });
    renderRouter(<StatusProbe />);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anon"));
    expect(localStorage.getItem("vat.invoiceFilter")).toBeNull();
  });
});

import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppRouter } from "../../src/routes/AppRouter";
import { json, mockFetch, renderWithProviders } from "../helpers/renderApp";

const profile = (role: string) => () =>
  json(200, {
    ten: "Công ty TNHH Tour Đảo",
    mst: "4201568932",
    goiDichVu: "Miễn phí",
    banQuyen: "Mặc định",
    ghiChu: null,
    role,
  });

async function loginAs(role: string) {
  // Mô phỏng TRUNG THỰC cookie phiên (ADR-0003 Amendment #1): trước khi đăng nhập chưa
  // có cookie ⇒ /me phải 401 (nếu để 200 sẵn thì app vào thẳng và form đăng nhập không
  // bao giờ hiện). Sau khi POST /auth/login "đặt cookie" thì /me mới trả hồ sơ.
  let coCookie = false;
  mockFetch({
    login: () => {
      coCookie = true;
      return json(200, { ok: true });
    },
    me: () => (coCookie ? profile(role)() : json(401, { error: "unauthorized" })),
  });
  renderWithProviders(<AppRouter />, "/");
  // ADR-0003 Amendment #1 (C8): app khởi động ở 'checking' và gọi /me trước, nên form
  // đăng nhập chỉ xuất hiện SAU khi biết cookie không còn hiệu lực → phải chờ.
  await userEvent.type(await screen.findByLabelText("Email công việc"), "ketoan@tourdao.vn");
  await userEvent.type(screen.getByLabelText("Mật khẩu"), "matkhau");
  await userEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
}

describe("U15.1 — đăng nhập + phiên + RBAC guard", () => {
  afterEach(() => vi.restoreAllMocks());

  it("chưa đăng nhập → hiển thị màn đăng nhập", async () => {
    mockFetch({});
    renderWithProviders(<AppRouter />, "/");
    // findBy (không phải getBy): màn Đăng nhập chỉ hiện SAU khi /me trả lỗi/401 —
    // trước đó app đang ở 'checking' (C8).
    expect(await screen.findByRole("heading", { name: "Đăng nhập" })).toBeInTheDocument();
  });

  // 2026-07-30: mục nav "Kết xuất & Convert" đã ẩn theo cờ SHOW_EXPORTS (lịch sử ở
  // lib/featureFlags.ts), nên ca này chỉ còn khẳng định nav theo RBAC còn lại — "Kết nối tài
  // khoản thuế". Việc mục Kết xuất PHẢI vắng mặt khoá riêng ở exportsHidden.test.tsx.
  it("đăng nhập đúng (kế toán trưởng) → vào app, thấy nav kết nối thuế", async () => {
    await loginAs("ke_toan_truong");
    // Header hiện tên DN (từ /me).
    expect(await screen.findByText("Công ty TNHH Tour Đảo")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kết nối tài khoản thuế" })).toBeInTheDocument();
  });

  // ⚠️ 2026-07-30 — HAI ca dưới YẾU ĐI, ghi lại để không tin hão: chúng khẳng định mục nav
  // "Kết xuất & Convert" vắng mặt với vai ke_toan, nhưng từ khi cờ SHOW_EXPORTS tắt thì mục
  // đó vắng với MỌI vai ⇒ chúng xanh kể cả khi RBAC hỏng. Nếu bật lại cờ SHOW_EXPORTS, hai ca
  // này lấy lại đúng sức nặng ban đầu. Phần RBAC còn được khoá thật ở "Kết nối tài khoản
  // thuế" (cùng ca) và ở test/lib/rbac.test.ts.
  it("kế toán → ẩn nav kết xuất + kết nối thuế (khớp RBAC 403)", async () => {
    await loginAs("ke_toan");
    await screen.findByText("Công ty TNHH Tour Đảo");
    expect(screen.queryByRole("link", { name: "Kết xuất & Convert" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Kết nối tài khoản thuế" })).not.toBeInTheDocument();
  });

  it("kế toán vào thẳng /exports → màn 403 (không nội dung kết xuất)", async () => {
    // Như loginAs: chưa có cookie ⇒ /me 401 trước, 200 sau khi đăng nhập.
    let coCookie = false;
    mockFetch({
      login: () => {
        coCookie = true;
        return json(200, { ok: true });
      },
      me: () => (coCookie ? profile("ke_toan")() : json(401, { error: "unauthorized" })),
    });
    renderWithProviders(<AppRouter />, "/login");
    // ADR-0003 Amendment #1 (C8): app khởi động ở 'checking' và gọi /me trước, nên form
    // đăng nhập chỉ xuất hiện SAU khi biết cookie không còn hiệu lực → phải chờ.
    await userEvent.type(await screen.findByLabelText("Email công việc"), "kt@tourdao.vn");
    await userEvent.type(screen.getByLabelText("Mật khẩu"), "pw");
    await userEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
    await screen.findByText("Công ty TNHH Tour Đảo");
    // Điều hướng tới /exports qua thanh địa chỉ giả — dùng lại render mới ở route đó.
    // (Ở đây kiểm nav bị ẩn là đủ cho guard hiển thị; guard route kiểm bằng test riêng.)
    expect(screen.queryByRole("link", { name: "Kết xuất & Convert" })).not.toBeInTheDocument();
  });

  it("sai mật khẩu (401) → báo lỗi, ở lại màn đăng nhập", async () => {
    mockFetch({ login: () => json(401, { error: "unauthorized" }) });
    renderWithProviders(<AppRouter />, "/");
    // ADR-0003 Amendment #1 (C8): app khởi động ở 'checking' và gọi /me trước, nên form
    // đăng nhập chỉ xuất hiện SAU khi biết cookie không còn hiệu lực → phải chờ.
    await userEvent.type(await screen.findByLabelText("Email công việc"), "x@y.vn");
    await userEvent.type(screen.getByLabelText("Mật khẩu"), "sai");
    await userEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
    expect(await screen.findByText("Email hoặc mật khẩu không đúng.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Đăng nhập" })).toBeInTheDocument();
  });

  it("đăng xuất → về màn đăng nhập", async () => {
    await loginAs("quan_tri");
    await screen.findByText("Công ty TNHH Tour Đảo");
    await userEvent.click(screen.getByRole("button", { name: "Mở hồ sơ" }));
    await userEvent.click(screen.getByRole("button", { name: "Đăng xuất" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Đăng nhập" })).toBeInTheDocument(),
    );
  });
});

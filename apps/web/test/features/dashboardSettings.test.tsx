import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../../src/features/auth/auth-context";
import { DashboardPage } from "../../src/features/dashboard/DashboardPage";
import { AppRouter } from "../../src/routes/AppRouter";
import type { MeResponse, Role, TaxAccountView } from "../../src/types/api";
import { json, mockFetch, renderWithProviders } from "../helpers/renderApp";

function taxAccount(over: Partial<TaxAccountView> = {}): TaxAccountView {
  return {
    id: "a1",
    username: "4201568932",
    loai: "chinh",
    uyQuyenLuc: null,
    tokenHetHan: null,
    ngayTao: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

/** Mock fetch chỉ trả /tax-accounts (Dashboard tối giản chỉ cần trạng thái kết nối). */
function mockTaxAccounts(accounts: TaxAccountView[], vaiTro: Role = "quan_tri") {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    // ADR-0003 Amendment #1 (C8): AuthProvider gọi /me lúc khởi động và lượt này về SAU
    // applyMe của DashboardAs ⇒ nó ghi đè vai. Phải trả ĐÚNG vai, nếu không rơi xuống
    // nhánh bắt-tất (object danh sách, không có `role`) và RBAC ẩn mất lối tắt.
    if (url.endsWith("/me")) {
      return json(200, {
        ten: "DN",
        mst: "0311772540",
        goiDichVu: null,
        banQuyen: "Mặc định",
        ghiChu: null,
        role: vaiTro,
      });
    }
    if (url.includes("/tax-accounts")) return json(200, accounts);
    return json(200, { rows: [], total: 0, limit: 50, offset: 0 });
  });
}

/** Render DashboardPage CÔ LẬP (không app-shell nav) với một vai — seed qua applyMe (1 lần).
 * Prop đặt tên `vaiTro` (không phải `role`) để tránh linter a11y hiểu nhầm là ARIA role. */
function DashboardAs({ vaiTro }: { vaiTro: Role }) {
  const { applyMe } = useAuth();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const me: MeResponse = {
      ten: "DN",
      mst: "4201568932",
      goiDichVu: null,
      banQuyen: "Mặc định",
      ghiChu: null,
      role: vaiTro,
    };
    applyMe(me);
  }, [applyMe, vaiTro]);
  return <DashboardPage />;
}

describe("Dashboard (U23-C) — tối giản: 1 dòng trạng thái kết nối, không số tiền", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("(a) không hiển thị số tiền + KHÔNG gọi /invoices/summary hay /reconcile", async () => {
    const spy = mockTaxAccounts([]);
    renderWithProviders(<DashboardPage />);
    await screen.findByText(/Chưa kết nối/);
    const called = spy.mock.calls.map((c) => String(c[0]));
    expect(called.some((u) => u.includes("/invoices/summary"))).toBe(false);
    expect(called.some((u) => u.includes("/reconcile"))).toBe(false);
    // Không còn chuỗi tiền rút gọn (tr/tỷ + " đ").
    expect(screen.queryByText(/\btr đ\b|\btỷ đ\b/)).not.toBeInTheDocument();
  });

  it("(b) token còn hạn → 'Đã kết nối' + ngày giờ VN (UTC+7) đúng", async () => {
    mockTaxAccounts([taxAccount({ tokenHetHan: "2999-06-15T10:30:00.000Z" })]);
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByText(/Đã kết nối/)).toBeInTheDocument();
    // UTC 10:30 + 7h = 17:30 ngày 15/06/2999.
    expect(screen.getByText(/15\/06\/2999 17:30/)).toBeInTheDocument();
  });

  it("(b) không có tài khoản/token → 'Chưa kết nối'", async () => {
    mockTaxAccounts([]);
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByText(/Chưa kết nối/)).toBeInTheDocument();
  });

  it("(b) token đã hết hạn → 'Chưa kết nối'", async () => {
    mockTaxAccounts([taxAccount({ tokenHetHan: "2000-01-01T00:00:00.000Z" })]);
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByText(/Chưa kết nối/)).toBeInTheDocument();
  });

  it("(b) nhiều tài khoản: chọn token còn hạn MUỘN NHẤT, bỏ qua token hết hạn", async () => {
    mockTaxAccounts([
      taxAccount({ id: "expired", tokenHetHan: "2000-01-01T00:00:00.000Z" }),
      taxAccount({ id: "early", tokenHetHan: "2999-01-10T00:00:00.000Z" }),
      taxAccount({ id: "late", tokenHetHan: "2999-06-15T10:30:00.000Z" }),
    ]);
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByText(/Đã kết nối/)).toBeInTheDocument();
    // Hiển thị mốc MUỘN NHẤT (15/06/2999 17:30), không phải mốc sớm hơn.
    expect(screen.getByText(/15\/06\/2999 17:30/)).toBeInTheDocument();
    expect(screen.queryByText(/10\/01\/2999/)).not.toBeInTheDocument();
  });

  it("(c) vai ke_toan: chỉ 'Xem hóa đơn'; ẩn 'Kết xuất' + 'Kết nối tài khoản thuế'", async () => {
    mockTaxAccounts([], "ke_toan");
    renderWithProviders(<DashboardAs vaiTro="ke_toan" />);
    expect(await screen.findByText("Xem hóa đơn")).toBeInTheDocument();
    expect(screen.queryByText("Kết xuất")).not.toBeInTheDocument();
    expect(screen.queryByText("Kết nối tài khoản thuế")).not.toBeInTheDocument();
  });

  it("(d) vai ke_toan_truong: hiện đủ 3 lối tắt", async () => {
    mockTaxAccounts([], "ke_toan_truong");
    renderWithProviders(<DashboardAs vaiTro="ke_toan_truong" />);
    expect(await screen.findByText("Kết xuất")).toBeInTheDocument();
    expect(screen.getByText("Xem hóa đơn")).toBeInTheDocument();
    expect(screen.getByText("Kết nối tài khoản thuế")).toBeInTheDocument();
  });
});

describe("Cài đặt chung (B6)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("hiện Tên/MST/Gói/Vai trò từ /me — KHÔNG địa chỉ bịa", async () => {
    mockFetch({
      login: () => json(200, { token: "jwt" }),
      me: () =>
        json(200, {
          ten: "Công ty TNHH Tour Đảo",
          mst: "4201568932",
          goiDichVu: "Miễn phí",
          banQuyen: "Mặc định",
          ghiChu: null,
          role: "ke_toan_truong",
        }),
    });
    renderWithProviders(<AppRouter />, "/");
    await userEvent.type(await screen.findByLabelText("Email công việc"), "kt@tourdao.vn");
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

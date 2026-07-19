// S5 + U23-D4 — Kết nối tài khoản thuế: MST cố định read-only (không ô nhập), nút Ngắt kết
// nối (có xác nhận), mật khẩu thuế KHÔNG lưu client, RBAC ke_toan bị chặn màn.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../../src/features/auth/auth-context";
import { SubAccountBlock, TaxAccountsPage } from "../../src/features/taxAccounts/TaxAccountsPage";
import { AppRouter } from "../../src/routes/AppRouter";
import type { MeResponse, Role, TaxAccountView } from "../../src/types/api";
import { json, mockFetch, renderWithProviders } from "../helpers/renderApp";

let calls: { url: string; method: string }[];

function mock(list: TaxAccountView[], hoSo: { mst?: string; role?: Role } = {}) {
  calls = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    // ADR-0003 Amendment #1 (C8): AuthProvider gọi /me lúc khởi động, và lượt này về SAU
    // applyMe của TaxPageAs nên nó ghi đè `me`. Không xử ở đây thì `/me` rơi xuống nhánh
    // bắt-tất và `me` thành MẢNG danh sách tài khoản ⇒ mst/role undefined.
    // KHÔNG đưa vào `calls`: hạ tầng phiên, không phải hành vi test đang đo.
    if (url.endsWith("/me")) {
      return json(200, {
        ten: "DN",
        mst: hoSo.mst ?? "0311772540",
        goiDichVu: null,
        banQuyen: "Mặc định",
        ghiChu: null,
        role: hoSo.role ?? "quan_tri",
      });
    }
    calls.push({ url, method });
    if (url.includes("/captcha"))
      return json(200, { key: "ck", content: '<svg id="cap"><text>7K9P2</text></svg>' });
    if (url.includes("/authorize")) return json(200, { ok: true });
    if (url.includes("/login"))
      return json(200, { ok: true, tokenHetHan: "2026-07-15T10:30:00.000Z" });
    if (url.includes("/sync")) return json(202, { enqueued: 2, period: "2026-07" });
    if (url.includes("/disconnect")) return json(200, { ok: true });
    if (method === "POST" && url.includes("/tax-accounts")) return json(201, { id: "a1" });
    return json(200, list); // GET list
  });
}

const authorized: TaxAccountView = {
  id: "a1",
  username: "0311772540",
  loai: "chinh",
  uyQuyenLuc: "2026-07-01T00:00:00.000Z",
  tokenHetHan: "2999-01-01T00:00:00.000Z", // token còn hạn → ĐÃ KẾT NỐI
  ngayTao: "2026-07-01T00:00:00.000Z",
};
const expired: TaxAccountView = { ...authorized, tokenHetHan: "2020-01-01T00:00:00.000Z" };

/** Render TaxAccountsPage CÔ LẬP với MST + vai (seed qua applyMe, 1 lần). */
function TaxPageAs({ mst, role = "quan_tri" }: { mst: string; role?: Role }) {
  const { applyMe } = useAuth();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const me: MeResponse = {
      ten: "DN",
      mst,
      goiDichVu: null,
      goiDichVuTen: null,
      banQuyen: "Mặc định",
      ghiChu: null,
      role,
    };
    applyMe(me);
  }, [applyMe, mst, role]);
  return <TaxAccountsPage />;
}

describe("S5 / U23-D4 — kết nối tài khoản thuế", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("(a) chưa có tài khoản → MST read-only (đã che), KHÔNG ô nhập MST; Kết nối → POST", async () => {
    mock([]);
    renderWithProviders(<TaxPageAs mst="0311772540" />);
    // MST che hiển thị read-only.
    expect(await screen.findByText("0311xxxxxx")).toBeInTheDocument();
    // KHÔNG còn ô nhập MST.
    expect(screen.queryByLabelText("Mã số thuế (MST)")).toBeNull();
    // Kết nối (không gửi username — backend auto MST).
    await userEvent.click(screen.getByRole("button", { name: "Kết nối tài khoản thuế" }));
    await waitFor(() =>
      expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/tax-accounts"))).toBe(true),
    );
  });

  it("tenant chưa khai MST → cảnh báo, không cho kết nối", async () => {
    mock([], { mst: "" }); // /me phải khớp: tenant CHƯA khai MST.
    renderWithProviders(<TaxPageAs mst="" />);
    expect(await screen.findByText(/chưa khai mã số thuế/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kết nối tài khoản thuế" })).toBeNull();
  });

  it("chưa ủy quyền → bước ủy quyền (chặn login)", async () => {
    mock([{ ...authorized, uyQuyenLuc: null, tokenHetHan: null }]);
    renderWithProviders(<TaxAccountsPage />);
    expect(await screen.findByText("Ủy quyền truy cập")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Tôi đồng ý ủy quyền" }));
    await waitFor(() => expect(calls.some((c) => c.url.includes("/authorize"))).toBe(true));
  });

  it("đã kết nối → báo thành công + Đồng bộ ngay, KHÔNG ép captcha", async () => {
    mock([authorized]);
    renderWithProviders(<TaxAccountsPage />);
    expect(await screen.findByText(/Đã kết nối mã số thuế .* thành công/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đồng bộ ngay" })).toBeInTheDocument();
    expect(screen.queryByAltText(/captcha/i)).toBeNull();
  });

  it("đã kết nối → Đồng bộ ngay gặp 503 sync_busy → báo QUÁ TẢI (khác lỗi chung)", async () => {
    calls = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? "GET" });
      if (url.includes("/sync")) return json(503, { error: "sync_busy" });
      return json(200, [authorized]);
    });
    renderWithProviders(<TaxAccountsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Đồng bộ ngay" }));
    expect(await screen.findByText(/quá tải/i)).toBeInTheDocument();
    // KHÔNG hiện thông báo lỗi chung chung khi là 503 sync_busy.
    expect(screen.queryByText(/Không gửi được yêu cầu đồng bộ/)).toBeNull();
  });

  it("(b) đã kết nối → Ngắt kết nối CÓ XÁC NHẬN → POST /disconnect", async () => {
    mock([authorized]);
    renderWithProviders(<TaxAccountsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Ngắt kết nối" }));
    // Bước xác nhận hiện ra; CHƯA gọi endpoint.
    expect(screen.getByText(/Xác nhận\?/)).toBeInTheDocument();
    expect(calls.some((c) => c.url.includes("/disconnect"))).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Xác nhận ngắt kết nối" }));
    await waitFor(() =>
      expect(calls.some((c) => c.method === "POST" && c.url.includes("/disconnect"))).toBe(true),
    );
  });

  it("(c) token hết hạn → captcha an toàn (<img>) + đăng nhập gửi password; password KHÔNG lưu client", async () => {
    mock([expired]);
    renderWithProviders(<TaxAccountsPage />);
    const img = await screen.findByAltText(/captcha/i);
    expect(img.tagName).toBe("IMG");
    expect(img.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
    expect(document.getElementById("cap")).toBeNull(); // KHÔNG chèn SVG thô
    await userEvent.type(screen.getByLabelText("Mật khẩu thuế"), "matkhauthue");
    await userEvent.type(screen.getByLabelText("Mã captcha"), "7K9P2");
    await userEvent.click(screen.getByRole("button", { name: "Đăng nhập GDT" }));
    await waitFor(() => expect(calls.some((c) => c.url.includes("/login"))).toBe(true));
    // Sau đăng nhập: ô mật khẩu được xóa (không giữ state) + KHÔNG rơi vào localStorage.
    await waitFor(() =>
      expect((screen.getByLabelText("Mật khẩu thuế") as HTMLInputElement).value).toBe(""),
    );
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      expect(localStorage.getItem(k ?? "")).not.toContain("matkhauthue");
    }
  });

  it("(d) vai ke_toan → KHÔNG thấy lối vào màn kết nối (guard RBAC)", async () => {
    mockFetch({
      login: () => json(200, { token: "jwt" }),
      me: () =>
        json(200, {
          ten: "DN",
          mst: "0311772540",
          goiDichVu: null,
          banQuyen: "Mặc định",
          ghiChu: null,
          role: "ke_toan",
        }),
    });
    renderWithProviders(<AppRouter />, "/");
    await userEvent.type(await screen.findByLabelText("Email công việc"), "kt@x.vn");
    await userEvent.type(screen.getByLabelText("Mật khẩu"), "pw");
    await userEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
    await screen.findByRole("heading", { name: "Tổng quan" }); // đã vào app (dashboard)
    // Route /tax-accounts guard bằng canManageTaxAccounts → ke_toan không có lối vào.
    expect(screen.queryByRole("link", { name: "Kết nối tài khoản thuế" })).toBeNull();
  });
});

// Khối tài khoản con dựng nền (mặc định ẩn sau cờ) — test trực tiếp validate tiền tố MST.
describe("U23-D — SubAccountBlock (dựng nền, validate tiền tố MST gốc)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("chỉ cho thêm khi username nhánh bắt đầu bằng MST gốc", async () => {
    mock([]);
    renderWithProviders(<SubAccountBlock mst="0311772540" onDone={() => {}} />);
    const field = screen.getByLabelText(/Mã số thuế nhánh/);
    const btn = screen.getByRole("button", { name: "Thêm tài khoản con" });
    expect(btn).toBeDisabled(); // rỗng
    await userEvent.type(field, "999");
    expect(btn).toBeDisabled(); // sai tiền tố
    expect(screen.getByText(/phải bắt đầu bằng MST gốc/i)).toBeInTheDocument();
    await userEvent.clear(field);
    await userEvent.type(field, "0311772540-001");
    expect(btn).toBeEnabled(); // đúng tiền tố (nhánh)
    await userEvent.click(btn);
    await waitFor(() =>
      expect(calls.some((c) => c.method === "POST" && c.url.includes("/tax-accounts"))).toBe(true),
    );
  });
});

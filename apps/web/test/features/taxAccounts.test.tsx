import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TaxAccountsPage } from "../../src/features/taxAccounts/TaxAccountsPage";
import { clearToken, setToken } from "../../src/lib/apiClient";
import type { TaxAccountView } from "../../src/types/api";
import { json, renderWithProviders } from "../helpers/renderApp";

let calls: { url: string; method: string }[];

function mock(list: TaxAccountView[]) {
  calls = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method });
    if (url.includes("/captcha"))
      return json(200, { key: "ck", content: '<svg id="cap"><text>7K9P2</text></svg>' });
    if (url.includes("/authorize")) return json(200, { ok: true });
    if (url.includes("/login"))
      return json(200, { ok: true, tokenHetHan: "2026-07-15T10:30:00.000Z" });
    if (url.includes("/sync")) return json(202, { enqueued: 2, period: "2026-07" });
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
// Đã ủy quyền nhưng token HẾT HẠN → hiện lại form captcha để đăng nhập lại.
const expired: TaxAccountView = { ...authorized, tokenHetHan: "2020-01-01T00:00:00.000Z" };

describe("S5 — kết nối tài khoản thuế", () => {
  beforeEach(() => setToken("t"));
  afterEach(() => {
    clearToken();
    vi.restoreAllMocks();
  });

  it("chưa có tài khoản → form đăng ký MST", async () => {
    mock([]);
    renderWithProviders(<TaxAccountsPage />);
    expect(await screen.findByText("Đăng ký mã số thuế")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Mã số thuế (MST)"), "0311772540");
    await userEvent.click(screen.getByRole("button", { name: "Đăng ký" }));
    await waitFor(() =>
      expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/tax-accounts"))).toBe(true),
    );
  });

  it("chưa ủy quyền → bước ủy quyền (chặn login)", async () => {
    mock([{ ...authorized, uyQuyenLuc: null, tokenHetHan: null }]);
    renderWithProviders(<TaxAccountsPage />);
    expect(await screen.findByText("Ủy quyền truy cập")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Tôi đồng ý ủy quyền" }));
    await waitFor(() => expect(calls.some((c) => c.url.includes("/authorize"))).toBe(true));
  });

  it("đã kết nối (token còn hạn) → báo thành công + Đồng bộ ngay, KHÔNG ép captcha", async () => {
    mock([authorized]);
    renderWithProviders(<TaxAccountsPage />);
    expect(await screen.findByText(/Đã kết nối mã số thuế .* thành công/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đồng bộ ngay" })).toBeInTheDocument();
    // KHÔNG hiện form captcha khi đã kết nối (đỡ gây rối UX).
    expect(screen.queryByAltText(/captcha/i)).toBeNull();
  });

  it("đã kết nối → Đồng bộ ngay gọi POST /sync + báo đã gửi", async () => {
    mock([authorized]);
    renderWithProviders(<TaxAccountsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Đồng bộ ngay" }));
    await waitFor(() =>
      expect(calls.some((c) => c.method === "POST" && c.url.includes("/sync"))).toBe(true),
    );
    expect(await screen.findByText(/Đã gửi yêu cầu đồng bộ/)).toBeInTheDocument();
  });

  it("token hết hạn → hiện captcha (<img> an toàn); đăng nhập GDT gửi password + captcha", async () => {
    mock([expired]);
    renderWithProviders(<TaxAccountsPage />);
    const img = await screen.findByAltText(/captcha/i);
    // BẢO MẬT: captcha render qua <img> data-URI, KHÔNG chèn SVG thô vào DOM.
    expect(img.tagName).toBe("IMG");
    expect(img.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
    expect(document.getElementById("cap")).toBeNull();
    await userEvent.type(screen.getByLabelText("Mật khẩu thuế"), "matkhauthue");
    await userEvent.type(screen.getByLabelText("Mã captcha"), "7K9P2");
    await userEvent.click(screen.getByRole("button", { name: "Đăng nhập GDT" }));
    await waitFor(() => expect(calls.some((c) => c.url.includes("/login"))).toBe(true));
  });
});

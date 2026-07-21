import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, configureApi } from "../../src/lib/apiClient";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("apiClient", () => {
  beforeEach(() => {
    configureApi({ onUnauthorized: undefined });
  });
  afterEach(() => vi.restoreAllMocks());

  // ADR-0003 Amendment #1: phiên chuyển sang cookie HttpOnly. Client KHÔNG còn cầm token
  // ⇒ không đính Authorization; thay vào đó phải bật `credentials` để trình duyệt tự gửi
  // cookie. Thiếu `credentials` thì mọi request đi ra KHÔNG kèm phiên ⇒ 401 hàng loạt.
  it("gửi credentials same-origin và KHÔNG đính Authorization", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(200, { rows: [], total: 0, limit: 50, offset: 0 }));
    await api.getInvoices({}, {});
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe("same-origin");
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("tải file (blob) cũng kèm credentials — nếu không, tải về sẽ 401", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(new Blob(["x"]), { status: 200 }));
    await api.downloadExport("id-1");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe("same-origin");
  });

  it("dựng query string từ bộ lọc + phân trang", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(200, { rows: [], total: 0, limit: 50, offset: 0 }));
    await api.getInvoices({ chieu: "purchase", nbmst: "0311772540" }, { limit: 50, offset: 100 });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("chieu=purchase");
    expect(url).toContain("nbmst=0311772540");
    expect(url).toContain("limit=50");
    expect(url).toContain("offset=100");
  });

  it("401 → ApiError(401) + gọi onUnauthorized", async () => {
    const onUnauthorized = vi.fn();
    configureApi({ onUnauthorized });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(401, { error: "unauthorized" }));
    await expect(api.getInvoices({}, {})).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("403 → ApiError(403, 'forbidden'), KHÔNG gọi onUnauthorized", async () => {
    const onUnauthorized = vi.fn();
    configureApi({ onUnauthorized });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(403, { error: "forbidden" }));
    await expect(api.createExport("xlsx", {})).rejects.toMatchObject({ status: 403 });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  // C2 — server đặt cookie; body chỉ báo thành công. Nếu ai đó "tiện tay" trả token về
  // body lần nữa thì JS lại cầm được token và toàn bộ lợi ích HttpOnly mất sạch.
  it("login: body KHÔNG mang token, request có credentials", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(200, { ok: true }));
    const res = (await api.login("a@b.vn", "pw", "token-captcha-gia")) as Record<string, unknown>;
    expect(res.token).toBeUndefined();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe("same-origin");
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  // C4 — chỉ server xoá được cookie HttpOnly, nên đăng xuất BẮT BUỘC đi qua mạng.
  it("logout: POST /auth/logout kèm credentials", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(200, { ok: true }));
    await api.logout();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/auth/logout");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
  });

  it("ApiError là instance Error mang status", () => {
    const e = new ApiError(404, "not_found");
    expect(e).toBeInstanceOf(Error);
    expect(e.status).toBe(404);
    expect(e.code).toBe("not_found");
  });
});

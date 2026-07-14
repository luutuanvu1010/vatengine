import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, clearToken, configureApi, setToken } from "../../src/lib/apiClient";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("apiClient", () => {
  beforeEach(() => {
    clearToken();
    configureApi({ onUnauthorized: undefined });
  });
  afterEach(() => vi.restoreAllMocks());

  it("đính Authorization: Bearer khi có token", async () => {
    setToken("jwt-abc");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(200, { rows: [], total: 0, limit: 50, offset: 0 }));
    await api.getInvoices({}, {});
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer jwt-abc");
  });

  it("dựng query string từ bộ lọc + phân trang", async () => {
    setToken("t");
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
    setToken("expired");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(401, { error: "unauthorized" }));
    await expect(api.getInvoices({}, {})).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("403 → ApiError(403, 'forbidden'), KHÔNG gọi onUnauthorized", async () => {
    const onUnauthorized = vi.fn();
    configureApi({ onUnauthorized });
    setToken("t");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(403, { error: "forbidden" }));
    await expect(api.createExport("xlsx", {})).rejects.toMatchObject({ status: 403 });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("login trả token, KHÔNG cần Authorization", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(200, { token: "new-jwt" }));
    const res = await api.login("a@b.vn", "pw");
    expect(res.token).toBe("new-jwt");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("ApiError là instance Error mang status", () => {
    const e = new ApiError(404, "not_found");
    expect(e).toBeInstanceOf(Error);
    expect(e.status).toBe(404);
    expect(e.code).toBe("not_found");
  });
});

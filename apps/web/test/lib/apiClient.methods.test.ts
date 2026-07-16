import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, clearToken, configureApi, setToken } from "../../src/lib/apiClient";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Chụp [url, init] của lần fetch cuối. */
function lastCall(m: { mock: { calls: unknown[] } }): [string, RequestInit] {
  const calls = m.mock.calls as [string, RequestInit][];
  const c = calls[calls.length - 1];
  if (!c) throw new Error("fetch chưa được gọi");
  return c;
}

describe("apiClient — bề mặt đầy đủ (đúng path/method/body)", () => {
  beforeEach(() => {
    clearToken();
    setToken("t");
    configureApi({ onUnauthorized: undefined });
  });
  afterEach(() => vi.restoreAllMocks());

  it("getSummary / getInvoice / getReconcile → GET đúng path", async () => {
    const m = vi.spyOn(globalThis, "fetch").mockImplementation(async () => jsonResponse(200, {}));
    await api.getSummary({ chieu: "sold" });
    expect(lastCall(m)[0]).toContain("/invoices/summary?chieu=sold");
    await api.getInvoice("id-123");
    expect(lastCall(m)[0]).toContain("/invoices/id-123");
    await api.getReconcile({});
    expect(lastCall(m)[0]).toContain("/reconcile");
  });

  it("createExport / convertExport → POST + query đúng", async () => {
    const m = vi.spyOn(globalThis, "fetch").mockImplementation(async () => jsonResponse(201, {}));
    await api.createExport("csv", { chieu: "purchase" });
    let [url, init] = lastCall(m);
    expect(init.method).toBe("POST");
    expect(url).toContain("format=csv");
    expect(url).toContain("chieu=purchase");
    await api.convertExport("reference", "xlsx", {});
    [url, init] = lastCall(m);
    expect(url).toContain("profile=reference");
    expect(url).toContain("format=xlsx");
  });

  it("downloadExport → trả Blob; 401 → onUnauthorized", async () => {
    const m = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response("filebytes", { status: 200 }));
    const blob = await api.downloadExport("exp-1");
    expect(await blob.text()).toBe("filebytes");
    expect(lastCall(m)[0]).toContain("/exports/exp-1");

    const onUnauthorized = vi.fn();
    configureApi({ onUnauthorized });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 401 }));
    await expect(api.downloadExport("exp-1")).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("A1/A2 + S5 → path đúng", async () => {
    const m = vi.spyOn(globalThis, "fetch").mockImplementation(async () => jsonResponse(200, {}));
    await api.getMe();
    expect(lastCall(m)[0]).toContain("/me");
    await api.listTaxAccounts();
    expect(lastCall(m)[0]).toContain("/tax-accounts");
    await api.getTaxAccount("ta-1");
    expect(lastCall(m)[0]).toContain("/tax-accounts/ta-1");
    await api.registerTaxAccount({ username: "0311772540", loai: "con" });
    let [url, init] = lastCall(m);
    expect(url).toContain("/tax-accounts");
    expect(JSON.parse(String(init.body))).toEqual({ username: "0311772540", loai: "con" });
    await api.authorizeTaxAccount("ta-1");
    expect(lastCall(m)[0]).toContain("/tax-accounts/ta-1/authorize");
    await api.getCaptcha("ta-1");
    expect(lastCall(m)[0]).toContain("/tax-accounts/ta-1/captcha");
    await api.loginTaxAccount("ta-1", "pw", "ck", "cv");
    [url, init] = lastCall(m);
    expect(url).toContain("/tax-accounts/ta-1/login");
    expect(JSON.parse(String(init.body))).toEqual({ password: "pw", ckey: "ck", cvalue: "cv" });
    await api.disconnectTaxAccount("ta-1");
    expect(lastCall(m)[0]).toContain("/tax-accounts/ta-1/disconnect");
  });

  it("registerTaxAccount() không tham số → body rỗng (backend auto MST — U23-D2)", async () => {
    const m = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(201, { id: "x" }));
    await api.registerTaxAccount();
    expect(JSON.parse(String(lastCall(m)[1].body))).toEqual({});
  });

  it("lỗi mạng (fetch reject) → ApiError(0, 'network_error')", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    await expect(api.getMe()).rejects.toMatchObject({ status: 0, code: "network_error" });
  });

  it("lỗi với body không phải JSON → ApiError status, code undefined", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html>500</html>", { status: 500 }),
    );
    await expect(api.getMe()).rejects.toMatchObject({ status: 500, code: undefined });
  });
});

// U19 — Hợp đồng của lớp gọi API. Điều kiện xong bắt buộc: phiên KHÔNG nằm ở client.
//
// Nếu một refactor nào đó lén đưa token vào localStorage hay header Authorization, toàn bộ
// lập luận chống-XSS của ADR-0003 Amendment #1 sụp — mà lint và typecheck sẽ không nói gì.
// Những test này là thứ duy nhất canh chỗ đó.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminApiError, adminApi, configureAdminApi } from "../src/lib/adminApiClient";

const fetchGia = vi.fn();

function traVe(status: number, body: unknown = { ok: true }) {
  fetchGia.mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

/** Đối số của lần gọi fetch thứ n. */
function lanGoi(n = 0): [string, RequestInit] {
  return fetchGia.mock.calls[n] as [string, RequestInit];
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchGia);
  fetchGia.mockReset();
  localStorage.clear();
  sessionStorage.clear();
  configureAdminApi({});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("🔴 Phiên KHÔNG nằm ở client", () => {
  it("đăng nhập KHÔNG ghi gì vào localStorage / sessionStorage", async () => {
    traVe(200, { ok: true });
    await adminApi.dangNhap("chu@vatengine.vn", "mat-khau");
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it("KHÔNG gửi header Authorization — cookie HttpOnly lo việc đó", async () => {
    traVe(200, { items: [], total: 0 });
    await adminApi.lietKeTenant({});
    const [, init] = lanGoi();
    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain("authorization");
  });

  it("dùng credentials 'same-origin' (không 'include' — hẹp hơn là đủ)", async () => {
    traVe(200, { items: [], total: 0 });
    await adminApi.lietKeTenant({});
    expect(lanGoi()[1].credentials).toBe("same-origin");
  });
});

describe("Đường dẫn — phải khớp allowlist của front-door", () => {
  it("mặc định tiền tố /api (front-door chỉ proxy /api/*)", async () => {
    traVe(200, { items: [], total: 0 });
    await adminApi.lietKeTenant({});
    // Mặc định "" như apps/web sẽ cho ra "/admin/tenants" → rơi vào SPA fallback → client
    // nhận index.html thay vì JSON. Đó là lý do apps/admin đổi mặc định.
    expect(lanGoi()[0]).toMatch(/^\/api\/admin\/tenants/);
  });

  it.each([
    ["duyetTenant", () => adminApi.duyetTenant("abc"), "/api/admin/tenants/abc/duyet", "POST"],
    ["tuChoiTenant", () => adminApi.tuChoiTenant("abc"), "/api/admin/tenants/abc/tu-choi", "POST"],
    ["khoaTenant", () => adminApi.khoaTenant("abc"), "/api/admin/tenants/abc/khoa", "POST"],
    ["moKhoaTenant", () => adminApi.moKhoaTenant("abc"), "/api/admin/tenants/abc/mo-khoa", "POST"],
    [
      "resetMatKhau",
      () => adminApi.resetMatKhau("abc"),
      "/api/admin/tenants/abc/reset-mat-khau",
      "POST",
    ],
    ["docPhien", () => adminApi.docPhien(), "/api/admin/auth/me", "GET"],
    ["dangXuat", () => adminApi.dangXuat(), "/api/admin/auth/logout", "POST"],
  ])("%s gọi đúng %s", async (_ten, goi, duong, method) => {
    traVe(200);
    await goi();
    const [url, init] = lanGoi();
    expect(url).toBe(duong);
    expect(init.method).toBe(method);
  });

  it("lietKeTenant chuyển trangThai/q thành query đúng tên tham số backend", async () => {
    traVe(200, { items: [], total: 0 });
    await adminApi.lietKeTenant({ trangThai: "cho_duyet", q: "0100", limit: 50 });
    const url = lanGoi()[0];
    // Backend đọc `trang_thai`, không phải `trangThai` — lệch tên là bộ lọc im lặng không
    // có tác dụng, và màn hình sẽ hiện MỌI tenant trong tab "Chờ duyệt".
    expect(url).toContain("trang_thai=cho_duyet");
    expect(url).toContain("q=0100");
    expect(url).toContain("limit=50");
  });

  it("bỏ tham số rỗng/undefined khỏi query", async () => {
    traVe(200, { items: [], total: 0 });
    await adminApi.lietKeTenant({ trangThai: undefined, q: "" });
    expect(lanGoi()[0]).toBe("/api/admin/tenants");
  });
});

describe("Xử lỗi", () => {
  it("401 → gọi onUnauthorized và ném AdminApiError", async () => {
    const onUnauthorized = vi.fn();
    configureAdminApi({ onUnauthorized });
    traVe(401, { error: "unauthorized" });
    await expect(adminApi.lietKeTenant({})).rejects.toBeInstanceOf(AdminApiError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("409 giữ nguyên status để UI phân biệt được 'đã đổi trạng thái'", async () => {
    traVe(409, { error: "chuyen_trang_thai_khong_hop_le" });
    await expect(adminApi.duyetTenant("abc")).rejects.toMatchObject({
      status: 409,
      code: "chuyen_trang_thai_khong_hop_le",
    });
  });

  it("503 (secret chưa cấu hình) KHÔNG bị nhầm thành 401", async () => {
    const onUnauthorized = vi.fn();
    configureAdminApi({ onUnauthorized });
    traVe(503, { error: "admin_chua_cau_hinh" });
    await expect(adminApi.docPhien()).rejects.toMatchObject({ status: 503 });
    // Nhầm 503 thành "hết phiên" sẽ đẩy chủ dự án vào vòng lặp đăng nhập vô tận trong khi
    // vấn đề thật nằm ở secret máy chủ.
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("lỗi mạng → status 0", async () => {
    fetchGia.mockRejectedValueOnce(new Error("offline"));
    await expect(adminApi.docPhien()).rejects.toMatchObject({ status: 0, code: "network_error" });
  });
});

describe("suaMetadata — bề mặt hẹp (D4)", () => {
  it("chỉ gửi ten/goi_dich_vu/ghi_chu, KHÔNG có email hay mst", async () => {
    traVe(200, { ok: true, tenant: {} });
    await adminApi.suaMetadata("abc", { ten: "Tên mới" });
    const body = JSON.parse(String(lanGoi()[1].body)) as Record<string, unknown>;
    expect(body).toEqual({ ten: "Tên mới" });
    expect(Object.keys(body)).not.toContain("email");
    expect(Object.keys(body)).not.toContain("mst");
  });
});

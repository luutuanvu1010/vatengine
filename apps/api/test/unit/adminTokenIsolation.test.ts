// U18 — TÁCH HAI MIỀN TOKEN (khách ↔ super-admin) ở TẦNG MẬT MÃ.
//
// Đây là bất biến gốc của cả đơn vị: nếu một token khách bao giờ đó verify được ở miền
// admin, toàn bộ ngoại lệ xuyên-tenant của U18 mở ra cho mọi khách hàng. Tách bằng
// SECRET RIÊNG (không phải bằng một cờ trong payload) nên kẻ tấn công không thể tự chế
// token: họ không có khoá ký.
//
// `aud: "admin"` là lớp phòng thủ THỨ HAI, không phải lớp chính. Nó chỉ có ý nghĩa trong
// đúng một kịch bản: ai đó cấu hình nhầm ADMIN_JWT_SECRET = JWT_SECRET. Lớp thứ BA
// (kiemTraCauHinhAdmin) từ chối khởi chạy hẳn trong kịch bản đó — xem test cuối file.
import { sign, verify } from "hono/jwt";
import { describe, expect, it } from "vitest";
import {
  ADMIN_AUD,
  ADMIN_TOKEN_TTL_SEC,
  kiemTraCauHinhAdmin,
  signAdminToken,
} from "../../src/admin/adminAuth";
import { TOKEN_TTL_SEC, signToken } from "../../src/auth";

const SECRET_KHACH = "secret-cua-khach-u18-test";
const SECRET_ADMIN = "secret-cua-admin-u18-test";
const ADMIN_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const TENANT_ID = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

describe("signAdminToken — hình dạng token admin", () => {
  it("mang aud='admin', sub=id admin, và KHÔNG mang tenant_id", async () => {
    const token = await signAdminToken(ADMIN_ID, SECRET_ADMIN);
    const payload = await verify(token, SECRET_ADMIN, "HS256");

    expect(payload.aud).toBe(ADMIN_AUD);
    expect(payload.sub).toBe(ADMIN_ID);
    // KHÔNG có tenant_id là điều khiến token admin vô hại ở miền khách — xem test
    // "token admin KHÔNG lọt qua requireTenant" bên dưới.
    expect(payload.tenant_id).toBeUndefined();
    expect(payload.role).toBeUndefined();
  });

  it("TTL 2 giờ — ngắn hơn token khách (8 giờ)", async () => {
    // Cửa sổ rủi ro của token admin phải hẹp hơn: nó đi kèm quyền xuyên-tenant.
    const nowSec = 1_800_000_000;
    const token = await signAdminToken(ADMIN_ID, SECRET_ADMIN, nowSec);
    const payload = await verify(token, SECRET_ADMIN, "HS256");

    expect(payload.exp).toBe(nowSec + ADMIN_TOKEN_TTL_SEC);
    expect(ADMIN_TOKEN_TTL_SEC).toBe(2 * 60 * 60);
    expect(ADMIN_TOKEN_TTL_SEC).toBeLessThan(TOKEN_TTL_SEC);
  });
});

describe("🔴 Hai miền token KHÔNG hoán đổi được", () => {
  it("token ADMIN verify bằng secret KHÁCH → ném (chữ ký không khớp)", async () => {
    const tokenAdmin = await signAdminToken(ADMIN_ID, SECRET_ADMIN);
    await expect(verify(tokenAdmin, SECRET_KHACH, "HS256")).rejects.toThrow();
  });

  it("token KHÁCH verify bằng secret ADMIN → ném (chữ ký không khớp)", async () => {
    const tokenKhach = await signToken(
      { tenantId: TENANT_ID, role: "quan_tri", sub: ADMIN_ID },
      SECRET_KHACH,
    );
    await expect(verify(tokenKhach, SECRET_ADMIN, "HS256")).rejects.toThrow();
  });

  it("token KHÁCH không mang aud='admin' — nên trượt cổng aud KỂ CẢ khi hai secret trùng nhau", async () => {
    // Mô phỏng đúng kịch bản cấu hình sai: ký token khách bằng CHÍNH secret admin. Chữ ký
    // hợp lệ, verify không ném — chỉ còn `aud` đứng giữa kẻ tấn công và quyền xuyên-tenant.
    const tokenKhach = await signToken(
      { tenantId: TENANT_ID, role: "quan_tri", sub: ADMIN_ID },
      SECRET_ADMIN,
    );
    const payload = await verify(tokenKhach, SECRET_ADMIN, "HS256");
    expect(payload.aud).not.toBe(ADMIN_AUD);
  });

  it("token ADMIN không mang tenant_id — nên trượt requireTenant KỂ CẢ khi hai secret trùng nhau", async () => {
    // Chiều ngược lại của kịch bản trên. requireTenant (auth.ts) từ chối mọi payload có
    // `tenant_id` không phải UUID — token admin không có claim đó nên rớt ở đúng cổng ấy.
    const tokenAdmin = await signAdminToken(ADMIN_ID, SECRET_KHACH);
    const payload = await verify(tokenAdmin, SECRET_KHACH, "HS256");
    expect(payload.tenant_id).toBeUndefined();
  });

  it("token admin BỊA bằng cách tự thêm aud='admin' vào secret khách → không verify được ở miền admin", async () => {
    // Kẻ tấn công biết đúng hình dạng payload vẫn vô hại: họ không có SECRET_ADMIN.
    const boGia = await sign({ sub: ADMIN_ID, aud: ADMIN_AUD, exp: 4_000_000_000 }, SECRET_KHACH);
    await expect(verify(boGia, SECRET_ADMIN, "HS256")).rejects.toThrow();
  });
});

describe("kiemTraCauHinhAdmin — fail-closed với cấu hình sai (R3)", () => {
  it("thiếu ADMIN_JWT_SECRET → không hợp lệ", () => {
    expect(kiemTraCauHinhAdmin({ JWT_SECRET: SECRET_KHACH })).toEqual({
      ok: false,
      lyDo: "thieu_secret",
    });
  });

  it("ADMIN_JWT_SECRET rỗng → không hợp lệ (chuỗi rỗng là 'chưa đặt', không phải 'đã đặt')", () => {
    expect(kiemTraCauHinhAdmin({ JWT_SECRET: SECRET_KHACH, ADMIN_JWT_SECRET: "" })).toEqual({
      ok: false,
      lyDo: "thieu_secret",
    });
  });

  it("🔴 ADMIN_JWT_SECRET TRÙNG JWT_SECRET → không hợp lệ", () => {
    // Đây là cấu hình sai nguy hiểm nhất và cũng dễ xảy ra nhất (copy-paste khi
    // `wrangler secret put`). Nếu để lọt, hai miền token gộp làm một và toàn bộ lập luận
    // tách-ở-tầng-mật-mã sụp — chỉ còn `aud` gánh, tức một lớp duy nhất.
    expect(
      kiemTraCauHinhAdmin({ JWT_SECRET: SECRET_KHACH, ADMIN_JWT_SECRET: SECRET_KHACH }),
    ).toEqual({ ok: false, lyDo: "trung_secret_khach" });
  });

  it("hai secret khác nhau và không rỗng → hợp lệ", () => {
    expect(
      kiemTraCauHinhAdmin({ JWT_SECRET: SECRET_KHACH, ADMIN_JWT_SECRET: SECRET_ADMIN }),
    ).toEqual({ ok: true, secret: SECRET_ADMIN });
  });
});

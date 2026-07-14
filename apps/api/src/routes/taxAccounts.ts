// U14 — quản lý tài khoản thuế + đường login GDT (ghi token mã hóa). Mọi route sau
// requireTenant + requireRole(ke_toan_truong|quan_tri), trong withTenant (RLS lớp 2)
// + lọc tenant_id tường minh (lớp 1). Gọi GDT CHỈ qua @vat/gdt-client (gdt-adapter.md).
import { maskSensitive } from "@vat/crypto";
import { auditLog, storeToken, taiKhoanThue, withTenant } from "@vat/db";
import {
  GdtContractDriftError,
  GdtError,
  authenticate,
  deriveTokenExpiry,
  getCaptcha,
} from "@vat/gdt-client";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { isUuid, requireTenant } from "../auth";
import { requireRole } from "../rbac";
import type { AppDeps, AppEnv } from "../types";

const registerSchema = z.object({
  username: z.string().min(1),
  loai: z.enum(["chinh", "con"]).optional(),
});

const loginSchema = z.object({
  password: z.string().min(1),
  ckey: z.string().min(1),
  cvalue: z.string().min(1),
});

export function taxAccountsRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();

  r.use("*", requireTenant);
  r.use("*", requireRole("ke_toan_truong", "quan_tri"));

  // POST /tax-accounts — đăng ký bản ghi tài khoản thuế (chưa có token).
  r.post("/", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "bad_request" }, 400);
    }
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "bad_request" }, 400);

    const tenantId = c.get("tenantId");
    const { db, close } = await deps.getDb(c.env);
    try {
      const id = await withTenant(db, tenantId, async (tx) => {
        const rows = await tx
          .insert(taiKhoanThue)
          .values({
            tenantId,
            username: parsed.data.username,
            ...(parsed.data.loai ? { loai: parsed.data.loai } : {}),
          })
          .returning({ id: taiKhoanThue.id });
        return rows[0]?.id;
      });
      if (!id) return c.json({ error: "server_error" }, 500);
      return c.json({ id }, 201);
    } finally {
      await close();
    }
  });

  // POST /tax-accounts/:id/authorize — ghi nhận ủy quyền tenant (NĐ 13). Login sẽ chặn
  // nếu chưa ủy quyền. Audit (append-only). Cách ly: chỉ tài khoản thuộc tenant hiện tại.
  r.post("/:id/authorize", async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id)) return c.json({ error: "bad_request" }, 400);
    const tenantId = c.get("tenantId");
    const { db, close } = await deps.getDb(c.env);
    try {
      const ok = await withTenant(db, tenantId, async (tx) => {
        const updated = await tx
          .update(taiKhoanThue)
          .set({ uyQuyenLuc: new Date() })
          .where(and(eq(taiKhoanThue.id, id), eq(taiKhoanThue.tenantId, tenantId)))
          .returning({ id: taiKhoanThue.id });
        if (updated.length === 0) return false;
        await tx.insert(auditLog).values({
          tenantId,
          hanhDong: "uy_quyen_tai_khoan_thue",
          doiTuong: id,
          chiTiet: maskSensitive({ phase: "authorize" }),
        });
        return true;
      });
      if (!ok) return c.json({ error: "not_found" }, 404);
      return c.json({ ok: true });
    } finally {
      await close();
    }
  });

  // GET /tax-accounts/:id/captcha — proxy ảnh captcha GDT cho người dùng gõ. KHÔNG tự
  // giải captcha (ranh giới Hiến pháp). :id để gắn RBAC/ngữ cảnh; captcha GDT là công khai.
  r.get("/:id/captcha", async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id)) return c.json({ error: "bad_request" }, 400);
    const transport = deps.getTransport(c.env);
    const cap = await getCaptcha(transport);
    return c.json({ key: cap.key, content: cap.content });
  });

  // POST /tax-accounts/:id/login — captcha người dùng đã gõ → authenticate() → lưu token
  // MÃ HÓA. 409 nếu chưa ủy quyền. 401 nếu GDT từ chối (KHÔNG lưu). KHÔNG lưu mật khẩu.
  r.post("/:id/login", async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id)) return c.json({ error: "bad_request" }, 400);
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "bad_request" }, 400);
    }
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "bad_request" }, 400);

    const tenantId = c.get("tenantId");
    const { db, close } = await deps.getDb(c.env);
    try {
      // Tải tài khoản (tenant-scoped): lấy username + kiểm ủy quyền. Cách ly: không thấy
      // tài khoản tenant khác → 404.
      const acc = await withTenant(db, tenantId, async (tx) => {
        const rows = await tx
          .select({ username: taiKhoanThue.username, uyQuyenLuc: taiKhoanThue.uyQuyenLuc })
          .from(taiKhoanThue)
          .where(and(eq(taiKhoanThue.id, id), eq(taiKhoanThue.tenantId, tenantId)));
        return rows[0] ?? null;
      });
      if (!acc) return c.json({ error: "not_found" }, 404);
      if (!acc.uyQuyenLuc) return c.json({ error: "chua_uy_quyen" }, 409);

      // Gọi GDT qua adapter. 401/sai captcha → GdtError → KHÔNG lưu token.
      let gdtToken: string;
      try {
        const authRes = await authenticate(deps.getTransport(c.env), {
          username: acc.username,
          password: parsed.data.password,
          ckey: parsed.data.ckey,
          cvalue: parsed.data.cvalue,
        });
        gdtToken = authRes.token;
      } catch (err) {
        // Lệch hợp đồng API thuế ≠ 401 nghiệp vụ — phải lộ ra, không được nuốt thành 401.
        if (err instanceof GdtContractDriftError) throw err;
        // Audit thất bại (mask), rồi 401 gọn. Không phân biệt sai captcha vs mật khẩu.
        await withTenant(db, tenantId, async (tx) => {
          await tx.insert(auditLog).values({
            tenantId,
            hanhDong: "dang_nhap_thue_that_bai",
            doiTuong: id,
            chiTiet: maskSensitive({ reason: err instanceof GdtError ? err.message : "loi" }),
          });
        });
        return c.json({ error: "unauthorized" }, 401);
      }

      // deriveTokenExpiry ném lỗi nếu token GDT không đúng dạng JWT có exp (giả định
      // CHƯA KIỂM CHỨNG). Bọc CHỈ derive để lỗi hình dạng token fail có kiểm soát
      // (502 + audit), không lộ 500 trần trụi. storeToken + audit thành công chạy
      // NGOÀI catch này — lỗi DB thật (vd audit insert transient fail) không được
      // gán nhãn nhầm thành "token_shape_unexpected" trong khi token đã lưu.
      // KHÔNG đưa token vào audit.
      let tokenHetHan: Date;
      try {
        tokenHetHan = deriveTokenExpiry(gdtToken);
      } catch (_err) {
        await withTenant(db, tenantId, async (tx) => {
          await tx.insert(auditLog).values({
            tenantId,
            hanhDong: "dang_nhap_thue_that_bai",
            doiTuong: id,
            chiTiet: maskSensitive({ reason: "token_shape_unexpected" }),
          });
        });
        return c.json({ error: "token_shape_unexpected" }, 502);
      }
      await storeToken(db, tenantId, id, gdtToken, tokenHetHan, c.env.TOKEN_KEK);
      await withTenant(db, tenantId, async (tx) => {
        await tx.insert(auditLog).values({
          tenantId,
          hanhDong: "dang_nhap_thue_thanh_cong",
          doiTuong: id,
          chiTiet: maskSensitive({ tokenHetHan: tokenHetHan.toISOString() }),
        });
      });
      return c.json({ ok: true, tokenHetHan: tokenHetHan.toISOString() });
    } finally {
      await close();
    }
  });

  return r;
}

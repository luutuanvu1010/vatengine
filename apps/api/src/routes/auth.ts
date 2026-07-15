// Route xác thực người dùng NỘI BỘ (U8): POST /auth/login đổi email+mật khẩu lấy JWT
// nội bộ mang `tenant_id`+`role`. KHÔNG liên quan tài khoản thuế (security.md).
//
// CÁCH LY vs RLS: login xảy ra TRƯỚC khi biết tenant nên KHÔNG chạy trong withTenant.
// `nguoi_dung` bật FORCE RLS ⇒ SELECT thường (role app production, non-superuser) sẽ
// thấy 0 hàng. Vì vậy tra cứu đi qua hàm SECURITY DEFINER `auth_lookup_user(email)`
// (owner BYPASSRLS, bề mặt hẹp — chỉ trả trường xác thực; xem migration 0001). Email
// UNIQUE toàn cục nên một email định danh đúng một người dùng.
import { maskSensitive } from "@vat/crypto";
import { auditLog, withTenant } from "@vat/db";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { signToken } from "../auth";
import { verifyPassword } from "../password";
import { isRole } from "../rbac";
import type { AnyDb, AppDeps, AppEnv } from "../types";

const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

// H-A.5a — CHỐNG DÒ TÀI KHOẢN (timing): khi email không tồn tại, verify vẫn chạy MỘT
// PBKDF2 với hash giả này ⇒ chi phí/độ trễ như email thật (không rẽ nhánh nhanh làm lộ
// email nào có thật). Đây là hash của một chuỗi vứt ở 100k vòng — KHÔNG phải bí mật.
const DUMMY_HASH =
  "pbkdf2$100000$+/h2Y2AcqbZICIBYzLoDIg==$b2aenLCuqsZ6yMxcSLtLeM+SXqczHUBs0FlFqRsXvtM=";

// Ghi audit đăng nhập SaaS (security.md: "audit … đăng nhập"; NĐ13). CHỈ khi quy được
// về tenant (email có thật) — audit_log.tenant_id NOT NULL + RLS. Email không tồn tại →
// không tenant → không ghi (phần dò email do rate-limit/WAF lo — H-A.5b). Qua withTenant
// để thoả RLS FORCE (role app non-superuser). Che chi_tiet phòng thủ (maskSensitive).
async function auditLogin(
  db: AnyDb,
  tenantId: string,
  userId: string,
  ketQua: "thanh_cong" | "that_bai",
): Promise<void> {
  await withTenant(db, tenantId, async (tx) => {
    await tx.insert(auditLog).values({
      tenantId,
      hanhDong: "dang_nhap_saas",
      doiTuong: userId,
      chiTiet: maskSensitive({ ket_qua: ketQua }),
    });
  });
}

interface AuthRow {
  id: string;
  tenant_id: string;
  vai_tro: string;
  password_hash: string | null;
}

export function authRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();

  // POST /auth/login — KHÔNG requireTenant (đây là đường phát hành token). Sai thông tin
  // → 401 GỌN, không phân biệt "email sai" vs "mật khẩu sai" (không rò cho dò tài khoản).
  r.post("/login", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "bad_request" }, 400);
    }
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "bad_request" }, 400);
    const { email, password } = parsed.data;

    const { db, close } = await deps.getDb(c.env);
    let closed = false;
    const closeOnce = async () => {
      if (!closed) {
        closed = true;
        await close();
      }
    };

    // Đẩy audit + đóng kết nối RA KHỎI đường găng phản hồi: độ trễ HTTP KHÔNG phụ thuộc
    // việc có ghi audit hay không ⇒ không rò email tồn tại qua timing round-trip DB (vá
    // Medium security-review H-A.5a). MỌI nhánh sau-xác-thực gọi settle() đúng một lần rồi
    // trả về ngay → thời gian phản hồi đồng nhất. Prod: waitUntil (sau response). Test:
    // không có executionCtx → await inline để quan sát được audit.
    const settle = (auditTask?: Promise<unknown>): Promise<unknown> => {
      // finally: đóng kết nối dù audit thành hay bại, giữ nguyên kết quả gốc.
      const done = (auditTask ?? Promise.resolve()).finally(closeOnce);
      try {
        // Prod: có executionCtx → chạy sau khi trả response (off critical path); KHÔNG
        // chờ `done` ⇒ độ trễ phản hồi không phụ thuộc audit.
        c.executionCtx.waitUntil(done);
        return Promise.resolve();
      } catch {
        // Test/không có executionCtx: getter ném → chờ `done` inline để quan sát audit.
        return done;
      }
    };

    try {
      const res = (await db.execute(
        sql`select id, tenant_id, vai_tro, password_hash from auth_lookup_user(${email})`,
      )) as { rows: AuthRow[] };
      const row = res.rows[0];
      // LUÔN chạy MỘT verify PBKDF2 (hash thật hoặc DUMMY) trước khi rẽ nhánh → chi phí/
      // độ trễ đồng nhất dù email có tồn tại hay không (chống dò tài khoản qua timing).
      const passwordOk = await verifyPassword(password, row?.password_hash ?? DUMMY_HASH);

      // Thành công cần: user thật + có hash + mật khẩu khớp + vai hợp lệ (chặn dữ liệu bẩn).
      if (!row || !row.password_hash || !passwordOk || !isRole(row.vai_tro)) {
        // Audit THẤT BẠI chỉ khi quy được về tenant (email có thật). Email không tồn tại
        // → không tenant → không ghi (dò email do rate-limit/WAF lo — H-A.5b).
        const audit = row?.password_hash
          ? auditLogin(db, row.tenant_id, row.id, "that_bai")
          : undefined;
        await settle(audit);
        return c.json({ error: "unauthorized" }, 401);
      }

      const token = await signToken(
        { tenantId: row.tenant_id, role: row.vai_tro, sub: row.id },
        c.env.JWT_SECRET,
      );
      await settle(auditLogin(db, row.tenant_id, row.id, "thanh_cong"));
      return c.json({ token });
    } catch (e) {
      // Lỗi TRƯỚC settle (lookup/verify/signToken) → đóng kết nối rồi ném (app.onError lo).
      await closeOnce();
      throw e;
    }
  });

  return r;
}

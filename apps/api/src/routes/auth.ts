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
import { clearSessionCookie, setSessionCookie } from "../session";
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
  // U17b: thêm "login_fail_chua_duyet" — tenant tồn tại nhưng chưa active (cho_duyet/
  // khoa/tu_choi). hanhDong (audit_log.hanh_dong) VẪN LUÔN "dang_nhap_saas"; giá trị này
  // chỉ nằm trong chi_tiet.ket_qua, không đổi mã lỗi HTTP trả về (vẫn 401 gọn).
  ketQua: "thanh_cong" | "that_bai" | "login_fail_chua_duyet",
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
  // U17b (Task 3, migration 0009) — trạng thái duyệt của tenant sở hữu người dùng này.
  // Tập hợp lệ: active | cho_duyet | khoa | tu_choi. Chỉ "active" được đăng nhập.
  tenant_trang_thai: string;
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

    // U17b (Task 5b) — CHUẨN HOÁ MỘT LẦN DUY NHẤT, dùng chung cho cả khoá limiter lẫn tra
    // cứu DB. LỖI ĐO ĐƯỢC (báo cáo 2026-07-20, DB thật): dangKy.ts (đăng ký công khai) chuẩn
    // hoá trim+lowercase TRƯỚC khi lưu, nhưng đường login TRƯỚC BẢN VÁ NÀY truyền `email` THÔ
    // cho auth_lookup_user() — SQL của hàm so khớp byte-exact (`WHERE n.email = p_email`,
    // migration 0001/0009). Hậu quả: DB lưu "person@example.com", đăng nhập bằng ĐÚNG chuỗi
    // đã gõ lúc đăng ký "Person@Example.com" → 401; chỉ gõ toàn thường mới vào được — bất kỳ
    // ai đăng ký email có ký tự hoa đều tự khoá mình khỏi tài khoản của chính họ. Chuẩn hoá
    // ở TẦNG GỌI (không sửa auth_lookup_user — hàm SECURITY DEFINER ngoài phạm vi sửa này).
    const emailChuanHoa = email.trim().toLowerCase();

    // H-A.5b — KHÓA per-account (lớp app, bổ sung WAF per-IP ở edge). Key = email chuẩn
    // hóa; kiểm TRƯỚC mọi việc DB. Đếm theo email (KỂ CẢ email giả) ⇒ enumeration-neutral
    // (email không tồn tại cũng bị khóa sau N lần). Khóa → 429 gọn (không lộ tài khoản).
    const limiter = deps.getLoginLimiter(c.env, `login:${emailChuanHoa}`);
    const gate = await limiter.check();
    if (gate.locked) {
      return c.json({ error: "too_many_attempts" }, 429, {
        "Retry-After": String(Math.ceil(gate.retryAfterMs / 1000)),
      });
    }

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
        sql`select id, tenant_id, vai_tro, password_hash, tenant_trang_thai from auth_lookup_user(${emailChuanHoa})`,
      )) as { rows: AuthRow[] };
      const row = res.rows[0];
      // LUÔN chạy MỘT verify PBKDF2 (hash thật hoặc DUMMY) trước khi rẽ nhánh → chi phí/
      // độ trễ đồng nhất dù email có tồn tại hay không (chống dò tài khoản qua timing).
      const passwordOk = await verifyPassword(password, row?.password_hash ?? DUMMY_HASH);

      // Thành công cần: user thật + có hash + mật khẩu khớp + vai hợp lệ (chặn dữ liệu bẩn)
      // + tenant đã duyệt (active).
      if (
        !row ||
        !row.password_hash ||
        !passwordOk ||
        !isRole(row.vai_tro) ||
        // U17b — cổng trạng thái. ĐẶT TRONG CÙNG biểu thức 401 có chủ ý: một `if` riêng đặt
        // trước sẽ trả về SỚM hơn, bỏ qua verify PBKDF2 và recordFailure() ⇒ tenant chưa
        // duyệt phản hồi nhanh hơn tenant sai mật khẩu, đo được từ ngoài ⇒ rò trạng thái.
        row.tenant_trang_thai !== "active"
      ) {
        // Ghi một lần sai vào bộ đếm khóa — UNIFORM cho mọi nhánh sai (email thật lẫn giả)
        // ⇒ không rò tồn tại. Audit THẤT BẠI chỉ khi quy được về tenant (email có thật).
        await limiter.recordFailure();
        // U17b — phân nhánh audit: tenant có thật nhưng chưa active ghi
        // login_fail_chua_duyet (để soi được lý do thật khi tra audit), còn lại (sai mật
        // khẩu / vai không hợp lệ) vẫn that_bai như cũ. KHÔNG đổi mã lỗi HTTP (vẫn 401 gọn,
        // vẫn qua đúng một settle() off-critical-path).
        const hanhDong =
          row?.password_hash && row.tenant_trang_thai !== "active"
            ? "login_fail_chua_duyet"
            : "that_bai";
        const audit = row?.password_hash
          ? auditLogin(db, row.tenant_id, row.id, hanhDong)
          : undefined;
        await settle(audit);
        return c.json({ error: "unauthorized" }, 401);
      }

      // Đăng nhập đúng → reset bộ đếm khóa (không phạt oan phiên sau).
      await limiter.recordSuccess();

      const token = await signToken(
        { tenantId: row.tenant_id, role: row.vai_tro, sub: row.id },
        c.env.JWT_SECRET,
      );
      await settle(auditLogin(db, row.tenant_id, row.id, "thanh_cong"));
      // ADR-0003 Amendment #1 (C1+C2): token đi bằng cookie HttpOnly, KHÔNG trả trong
      // body. Trả trong body thì JS lại cầm được token ⇒ triệt tiêu toàn bộ lợi ích
      // chống XSS-exfil của HttpOnly. Đây là điểm dễ vô hiệu hoá cả thiết kế nhất.
      setSessionCookie(c, token);
      return c.json({ ok: true });
    } catch (e) {
      // Lỗi TRƯỚC settle (lookup/verify/signToken) → đóng kết nối rồi ném (app.onError lo).
      await closeOnce();
      throw e;
    }
  });

  // POST /auth/logout — ADR-0003 Amendment #1 (C4). BẮT BUỘC, không phải tuỳ chọn: khi
  // phiên nằm trong cookie, "Đăng xuất" chỉ dọn state phía client sẽ KHÔNG thực sự đăng
  // xuất — cookie vẫn còn và request kế tiếp vẫn được xác thực.
  //
  // KHÔNG requireTenant: đăng xuất phải luôn thành công, kể cả khi cookie đã hết hạn hay
  // hỏng — nếu bắt xác thực, người dùng mang cookie hỏng sẽ mắc kẹt không xoá được.
  // Idempotent: gọi nhiều lần vẫn 200.
  r.post("/logout", (c) => {
    clearSessionCookie(c);
    return c.json({ ok: true });
  });

  return r;
}

// U17b (§3.2, Task 5) — POST /dang-ky: cổng đăng ký công khai CÓ KIỂM SOÁT. KHÔNG
// requireTenant (route công khai, chưa có tenant tại thời điểm gọi). Tạo tenant
// `trang_thai='cho_duyet'` — KHÔNG đăng nhập được cho tới khi Admin duyệt (U18, cổng
// trạng thái đã gác ở POST /auth/login — Task 4).
//
// QĐ-1 (đường ghi): tự sinh UUID (`idMoi`) rồi `withTenant(db, idMoi, ...)` → INSERT
// `tenants{id: idMoi}`. Policy RLS trên `tenants` là `id = current_setting('app.tenant_id')`
// cho CẢ USING lẫn WITH CHECK (packages/db/src/schema/_rls.ts) → đặt app.tenant_id = idMoi
// TRƯỚC khi insert đúng id đó thì WITH CHECK khớp, INSERT lọt mà KHÔNG cần hàm SECURITY
// DEFINER nào. Test "QĐ-1" trong dangKy.test.ts chứng minh điều này dưới role production
// non-superuser thật (không chỉ tin theo tài liệu — CLAUDE.md nguyên tắc bằng chứng).
import { maskSensitive } from "@vat/crypto";
import { auditLog, nguoiDung, tenants, withTenant } from "@vat/db";
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import { validateEmailDangKy } from "../lib/validateEmailDangKy";
import { TURNSTILE_FIELD, kiemTraCauHinhTurnstile, xacMinhTurnstile } from "../turnstile";
import type { AppDeps, AppEnv } from "../types";

// MST 10 hoặc 13 chữ số (giá trị verbatim theo spec — không đổi dạng).
const MST_RE = /^\d{10}$|^\d{13}$/;

// dongYDieuKhoan CỐ Ý optional ở tầng Zod: nếu bắt buộc boolean, THIẾU trường sẽ rớt ngay
// ở safeParse thành `bad_request` chung chung, che mất mã lỗi nghiệp vụ riêng
// `chua_dong_y_dieu_khoan` mà spec yêu cầu cho CẢ hai ca "thiếu" và "false". Kiểm tường
// minh `=== true` ngay sau khi parse mới phân biệt được.
const dangKySchema = z
  .object({
    email: z.string(),
    tenDoanhNghiep: z.string().trim().min(1),
    mst: z.string(),
    dongYDieuKhoan: z.boolean().optional(),
  })
  .strict();

/** Nhận diện lỗi UNIQUE (Postgres SQLSTATE 23505) xuyên qua lớp bọc DrizzleQueryError của
 * drizzle-orm — lỗi driver gốc (pg/pglite, có `.code`) nằm ở `.cause`, không phải thuộc
 * tính trực tiếp của lỗi ném ra. KHÔNG bắt lỗi khác — lỗi DB thật vẫn phải nổi lên
 * app.onError → 500 như cũ (không nuốt lỗi hạ tầng thành 409 sai). */
function isUniqueViolation(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const cause = (err as { cause?: unknown }).cause;
  return (
    typeof cause === "object" && cause !== null && (cause as { code?: unknown }).code === "23505"
  );
}

export function dangKyRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();

  r.post("/", async (c) => {
    // ── U33 — CỔNG TURNSTILE (thay SignupLimiter) ────────────────────────────────────
    // QĐ-11 (2026-07-21): chặn nhịp theo IP giao cho WAF của Cloudflare; tầng ứng dụng chỉ
    // giữ captcha. Sau thay đổi này, đây là lớp bảo vệ DUY NHẤT còn lại ở tầng ứng dụng cho
    // cổng GHI công khai duy nhất của hệ thống — nên mọi nhánh đều fail-closed.
    const cauHinh = kiemTraCauHinhTurnstile(c.env);
    if (!cauHinh.ok) {
      // Thiếu secret ⇒ TỪ CHỐI PHỤC VỤ. Cố ý NGƯỢC với SignupLimiter cũ (fail-open khi
      // thiếu binding): hồi đó limiter chỉ là một trong nhiều lớp, giờ nó là lớp duy nhất.
      // Fail-open bây giờ nghĩa là một lần cấu hình sai âm thầm mở toang cổng đăng ký.
      return c.json({ error: "captcha_chua_cau_hinh" }, 503);
    }

    // Đọc body MỘT LẦN ở đây rồi truyền xuống: một Request chỉ đọc được body một lần, mà
    // cả cổng captcha lẫn `xuLyDangKy` đều cần nó.
    const body = await c.req.json().catch(() => null);
    const token = (body as Record<string, unknown> | null)?.[TURNSTILE_FIELD];

    // `CF-Connecting-IP` do CHÍNH biên Cloudflare ghi (client không giả mạo được). Ở đây nó
    // CHỈ là dữ liệu phụ giúp Cloudflare chấm điểm — KHÔNG còn là điều kiện bắt buộc như
    // thời SignupLimiter (vốn phải có IP mới đếm được). Vắng header vẫn xác minh được token,
    // nên không còn trả 503 `khong_xac_dinh_duoc_ip` nữa.
    const kq = await xacMinhTurnstile(
      cauHinh.secret,
      typeof token === "string" ? token : "",
      c.req.header("CF-Connecting-IP"),
    );
    if (!kq.ok) {
      // `cau_hinh_sai` = secret của MÁY CHỦ sai, không phải lỗi người gọi — trả 503 để họ
      // không ngồi bấm lại vô ích trong khi vấn đề nằm ở phía ta.
      if (kq.ly_do === "cau_hinh_sai") return c.json({ error: "captcha_chua_cau_hinh" }, 503);
      return c.json({ error: kq.ly_do }, 400);
    }

    return await xuLyDangKy(c, deps, body);
  });

  return r;
}

// `body` do nơi gọi đọc sẵn (một Request chỉ đọc body được MỘT LẦN, mà cổng captcha ở
// trên đã dùng lượt đó). `null` = body không phải JSON hợp lệ.
async function xuLyDangKy(c: Context<AppEnv>, deps: AppDeps, body: unknown) {
  if (body === null) return c.json({ error: "bad_request" }, 400);
  const parsed = dangKySchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "bad_request" }, 400);
  const { tenDoanhNghiep, mst } = parsed.data;

  if (parsed.data.dongYDieuKhoan !== true) {
    return c.json({ error: "chua_dong_y_dieu_khoan" }, 400);
  }

  const emailCheck = validateEmailDangKy(parsed.data.email);
  // KHÔNG lộ `ly_do` nội bộ ra response — chỉ một mã lỗi gộp cho client.
  if (!emailCheck.ok) return c.json({ error: "email_khong_hop_le" }, 400);
  const email = parsed.data.email.trim().toLowerCase();

  if (!MST_RE.test(mst)) return c.json({ error: "mst_khong_hop_le" }, 400);

  const { db, close } = await deps.getDb(c.env);
  try {
    const idMoi = crypto.randomUUID();
    try {
      await withTenant(db, idMoi, async (tx) => {
        await tx.insert(tenants).values({
          id: idMoi,
          ten: tenDoanhNghiep,
          mst,
          trangThai: "cho_duyet",
          goiDichVu: "free",
        });
        await tx.insert(nguoiDung).values({
          tenantId: idMoi,
          email,
          vaiTro: "quan_tri",
          // passwordHash bỏ trống → NULL (mặc định cột) — tenant tự đăng ký CHƯA có mật
          // khẩu; đặt mật khẩu là việc của luồng sau (ngoài phạm vi Task 5).
        });
        await tx.insert(auditLog).values({
          tenantId: idMoi,
          hanhDong: "dang_ky",
          doiTuong: idMoi,
          chiTiet: maskSensitive({ email, mst, tenDoanhNghiep }),
        });
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        // 409 GỘP — KHÔNG phân biệt MST hay email trùng, tránh biến endpoint công khai
        // thành oracle tra cứu "MST/email này đã có khách hàng chưa".
        return c.json({ error: "da_ton_tai" }, 409);
      }
      throw err;
    }
    return c.json({ ok: true, trangThai: "cho_duyet" }, 201);
  } finally {
    await close();
  }
}

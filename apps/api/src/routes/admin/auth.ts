// U18 — POST /admin/auth/login. Đường vào duy nhất của miền super-admin.
//
// KHÔNG có `requireSuperAdmin` ở đây (đây là chỗ token được PHÁT ra), nhưng cổng cấu hình
// fail-closed thì vẫn phải chạy: thiếu/trùng `ADMIN_JWT_SECRET` ⇒ 503, không phát token.
//
// KHÔNG có endpoint tạo super-admin. Chủ ý, ghi rõ ở U18-plan §45: danh tính chủ phần mềm
// chỉ sinh ra qua `scripts/seed-super-admin.mjs` chạy tay dưới role migrate. Một endpoint
// "đăng ký admin" — dù gác kỹ đến đâu — là bề mặt tấn công không có lý do tồn tại khi số
// lượng super-admin đếm trên đầu ngón tay.
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_TOKEN_TTL_SEC,
  kiemTraCauHinhAdmin,
  signAdminToken,
} from "../../admin/adminAuth";
import { ghiAuditAdmin } from "../../admin/auditAdmin";
import { requireSuperAdmin } from "../../admin/requireSuperAdmin";
import { verifyPassword } from "../../password";
import type { AdminEnv, AppDeps } from "../../types";

const loginSchema = z.object({ email: z.string(), password: z.string() }).strict();

// Hash "mồi" để nhánh email-không-tồn-tại vẫn tốn đúng một lượt PBKDF2 như nhánh có thật.
// Cùng thủ pháp /auth/login của khách (H-A.5a): không có nó, thời gian phản hồi tiết lộ
// email nào đang là tài khoản quản trị — danh sách đáng giá với kẻ tấn công.
//
// PHẢI LÀ HASH HỢP LỆ, không phải chuỗi bất kỳ: `verifyPassword` trả `false` NGAY khi
// định dạng sai (sai scheme, base64 hỏng) mà KHÔNG chạy PBKDF2 — dùng hash dị dạng sẽ làm
// nhánh "email không tồn tại" nhanh hơn hẳn và tái tạo lại đúng lỗ rò timing mà nó sinh ra
// để bịt. Giá trị dưới đây là hash 100k vòng của một chuỗi vứt, giống hệt hằng số mà
// routes/auth.ts dùng — KHÔNG phải bí mật.
const DUMMY_HASH =
  "pbkdf2$100000$+/h2Y2AcqbZICIBYzLoDIg==$b2aenLCuqsZ6yMxcSLtLeM+SXqczHUBs0FlFqRsXvtM=";

interface AdminRow {
  id: string;
  email: string;
  password_hash: string;
  ten: string | null;
  trang_thai: string;
}

export function adminAuthRoutes(deps: AppDeps) {
  const r = new Hono<AdminEnv>();

  r.post("/login", async (c) => {
    const cauHinh = kiemTraCauHinhAdmin(c.env);
    if (!cauHinh.ok) return c.json({ error: "admin_chua_cau_hinh" }, 503);

    const parsed = loginSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "bad_request" }, 400);

    // Chuẩn hoá TRƯỚC khi tra: hợp đồng 3 nơi (tầng gọi / hàm admin_lookup so lower(email)
    // / chỉ mục biểu thức lower(email)). Lệch một chỗ là 401 vô cớ không manh mối — đúng
    // lỗi U17b Task 6 đã phải vá cho đường đăng nhập khách.
    const email = parsed.data.email.trim().toLowerCase();
    const { db, close } = await deps.getDb(c.env);

    try {
      const res = (await db.execute(
        sql`select id, email, password_hash, ten, trang_thai from admin_lookup(${email})`,
      )) as { rows: AdminRow[] };
      const row = res.rows[0];

      // LUÔN chạy đúng một verify PBKDF2 trước khi rẽ nhánh — chi phí đồng nhất dù email
      // có tồn tại hay không.
      const matKhauDung = await verifyPassword(
        parsed.data.password,
        row?.password_hash ?? DUMMY_HASH,
      );

      // Gộp mọi điều kiện vào MỘT biểu thức 401 có chủ ý: tách thành `if` riêng cho
      // "bị khoá" sẽ trả về sớm trước verify và làm nhánh đó phản hồi nhanh hơn đo được
      // từ bên ngoài — tức rò trạng thái qua timing (bài học U17b Finding 1).
      if (!row || !matKhauDung || row.trang_thai !== "active") {
        await ghiAuditAdmin(db, {
          hanhDong: "admin_login_fail",
          // Ghi id nếu biết được (giúp phát hiện dò mật khẩu vào một tài khoản cụ thể);
          // không biết thì ghi nhãn cố định, KHÔNG ghi email đã gõ — email trong nhật ký
          // thất bại chính là danh sách mục tiêu mà kẻ tấn công muốn có.
          nguoiThucHien: row?.id ?? "khong_xac_dinh",
          chiTiet: { ket_qua: row ? (matKhauDung ? "bi_khoa" : "sai_mat_khau") : "khong_ton_tai" },
        });
        return c.json({ error: "unauthorized" }, 401);
      }

      const token = await signAdminToken(row.id, cauHinh.secret);
      setCookie(c, ADMIN_SESSION_COOKIE, token, {
        httpOnly: true, // JS không đọc được → XSS ở Cổng Admin không exfil được token.
        secure: new URL(c.req.url).protocol === "https:",
        sameSite: "Strict",
        path: "/",
        maxAge: ADMIN_TOKEN_TTL_SEC, // Khớp ĐÚNG exp của JWT — cookie và token cùng hết hạn.
      });

      await db.execute(sql`select admin_ghi_dang_nhap_cuoi(${row.id}::uuid)`);
      await ghiAuditAdmin(db, {
        hanhDong: "admin_login",
        nguoiThucHien: row.id,
        chiTiet: { ten: row.ten },
      });

      // Thân phản hồi KHÔNG chứa token: phiên đi bằng cookie HttpOnly. Trả token ra body
      // sẽ mời frontend cất nó vào localStorage — đúng thứ ADR-0003 Amendment #1 đã bỏ.
      return c.json({ ok: true });
    } finally {
      await close();
    }
  });

  // GET /admin/auth/me — DÒ PHIÊN. Cổng Admin không đọc được cookie HttpOnly nên sau khi
  // tải lại trang nó không có cách nào tự biết phiên còn sống hay không; endpoint này là
  // câu trả lời (200 = còn, 401 = hết). Cùng vai trò `GET /me` đang phục vụ app khách.
  //
  // CỐ Ý KHÔNG CHẠM DB: `requireSuperAdmin` đã xác minh chữ ký + hạn + `aud` của token,
  // nên bản thân việc request đi tới được handler này ĐÃ là câu trả lời. Tra thêm
  // `quan_tri_he_thong` chỉ để lấy email/tên sẽ cần một hàm SECURITY DEFINER MỚI (tra theo
  // id — `admin_lookup` tra theo email), tức một migration nữa và một cửa BYPASSRLS nữa,
  // cho một dòng chữ trên header. Không đáng: mỗi cửa mở thêm là bề mặt phải review vĩnh viễn.
  r.get("/me", requireSuperAdmin, (c) => c.json({ id: c.get("adminId") }));

  // POST /admin/auth/logout — BẮT BUỘC, không phải tuỳ chọn. Khi phiên nằm trong cookie
  // HttpOnly, JS ở Cổng Admin KHÔNG xoá được nó; "Đăng xuất" chỉ dọn state phía client sẽ
  // để cookie sống tiếp đủ 2 giờ và request kế tiếp vẫn được xác thực — tức KHÔNG thực sự
  // đăng xuất. Chỉ server mới xoá được (bài học C4, xem apps/api/src/session.ts).
  //
  // KHÔNG gác `requireSuperAdmin`: đăng xuất phải luôn thành công, kể cả khi cookie đã hết
  // hạn hoặc hỏng — bắt xác thực thì người mang cookie hỏng sẽ mắc kẹt không xoá được nó.
  // Idempotent: gọi nhiều lần vẫn 200.
  r.post("/logout", (c) => {
    deleteCookie(c, ADMIN_SESSION_COOKIE, {
      path: "/",
      secure: new URL(c.req.url).protocol === "https:",
      sameSite: "Strict",
    });
    return c.json({ ok: true });
  });

  return r;
}

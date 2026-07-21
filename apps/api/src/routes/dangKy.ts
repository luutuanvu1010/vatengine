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
    // F6 — CF-Connecting-IP do CHÍNH Cloudflare edge ghi (client KHÔNG giả mạo được) — giữ
    // NGUYÊN header này, KHÔNG chuyển sang X-Forwarded-For (client tự đặt được, vô hiệu hoá
    // toàn bộ limiter theo IP). Vấn đề đã sửa là FALLBACK: `?? "unknown"` cũ dồn MỌI request
    // thiếu header vào chung một bucket "unknown" — 5 lượt/giờ khoá luôn cổng đăng ký cho
    // TOÀN BỘ Internet nếu header từng vắng mặt (tự-DoS). Header vắng mặt nghĩa là request
    // không đi qua đúng đường (dev trực tiếp bỏ qua CF, hoặc lỗi cấu hình edge) — TỪ CHỐI
    // TƯỜNG MINH thay vì âm thầm gộp bucket. 503 (không phải 400): đây KHÔNG phải lỗi của
    // người gọi (body/tham số của họ hoàn toàn có thể hợp lệ) mà là điều kiện HẠ TẦNG khiến
    // ta tạm thời không thể áp cổng chống lạm dụng một cách an toàn — cùng ngữ nghĩa "tạm
    // thời, thử lại sau" với 503 sync_busy đã dùng ở nơi khác trong dự án (U28 Queue 429).
    const ip = c.req.header("CF-Connecting-IP");
    if (!ip) {
      return c.json({ error: "khong_xac_dinh_duoc_ip" }, 503);
    }

    // F1 (TOCTOU) — kiểm limiter TRƯỚC KHI mở kết nối DB, VÀ ghi lượt NGAY TRONG CÙNG một
    // round-trip DO nguyên tử (checkAndRecordSignup — signupLimiter.ts). TRƯỚC bản vá này,
    // check() và record() là hai round-trip RIÊNG với toàn bộ việc DB (xuLyDangKy) xen giữa
    // — N request đồng thời từ một IP đều lọt qua check() trước khi request đầu kịp record()
    // (đo được 12/12 lọt ngưỡng 3, xem RED-PROOF git log dangKy.test.ts). Gộp làm MỘT lệnh
    // gọi khép lỗ hổng vì Durable Object tuần tự hoá TỪNG fetch() riêng lẻ trọn vẹn.
    const limiter = deps.getSignupLimiter(c.env, `dangky:${ip}`);
    const { gate, token } = await limiter.checkAndRecord();
    if (gate.chan) {
      // Request ĐÃ BIẾT bị chặn — checkAndRecordSignup KHÔNG ghi thêm (không token), nên ở
      // đây cũng không có gì để hoàn — thoát ngay, không chạm DB.
      return c.json({ error: "qua_nhieu_yeu_cau" }, 429, {
        "Retry-After": String(Math.ceil(gate.thuLaiSauMs / 1000)),
      });
    }

    try {
      // Thành công (201), 4xx nghiệp vụ (bad_request/chua_dong_y_dieu_khoan/
      // email_khong_hop_le/mst_khong_hop_le), và 409 da_ton_tai đều trả về (return) BÊN
      // TRONG xuLyDangKy — KHÔNG ném — nên đều giữ nguyên lượt đã ghi ở trên (đúng thiết kế
      // đã chốt: đếm MỌI lượt kể cả sẽ thất bại sau, validate rẻ không được là đường né).
      return await xuLyDangKy(c, deps);
    } catch (err) {
      // F9 — CHỈ lỗi HẠ TẦNG thật (DB mất kết nối, ...) rơi vào đây (409/4xx nghiệp vụ đã
      // return ở trên, không ném). Đây KHÔNG phải lạm dụng của người gọi — hoàn lại lượt vừa
      // ghi để một lần trục trặc CỦA HỆ THỐNG không ngốn mất quota ít ỏi (5/giờ) của một
      // doanh nghiệp hợp lệ. refund() lỗi (DO hiccup) TUYỆT ĐỐI không được thay thế lỗi gốc
      // (F9 gốc: finally cũ đã từng biến một 201 ĐÃ COMMIT thành 500) — bắt riêng, chỉ log
      // (không PII), rồi luôn ném lại lỗi GỐC để app.onError xử lý như cũ ({error:"internal"}).
      // token luôn có giá trị ở đây trên thực tế (gate.chan === false ⇒ checkAndRecordSignup
      // luôn kèm token — xem signupLimiter.ts) — kiểm tường minh thay vì ép kiểu, phòng
      // trường hợp client limiter fail-open (thiếu binding) không có token nào để hoàn.
      if (token !== undefined) {
        try {
          await limiter.refund(token);
        } catch {
          console.warn(JSON.stringify({ type: "signup_limiter_refund_failed", at: Date.now() }));
        }
      }
      throw err;
    }
  });

  return r;
}

async function xuLyDangKy(c: Context<AppEnv>, deps: AppDeps) {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "bad_request" }, 400);
  }
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

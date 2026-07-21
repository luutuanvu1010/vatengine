// Route xác thực người dùng NỘI BỘ (U8): POST /auth/login đổi email+mật khẩu lấy JWT
// nội bộ mang `tenant_id`+`role`. KHÔNG liên quan tài khoản thuế (security.md).
//
// CÁCH LY vs RLS: login xảy ra TRƯỚC khi biết tenant nên KHÔNG chạy trong withTenant.
// `nguoi_dung` bật FORCE RLS ⇒ SELECT thường (role app production, non-superuser) sẽ
// thấy 0 hàng. Vì vậy tra cứu đi qua hàm SECURITY DEFINER `auth_lookup_user(email)`
// (owner BYPASSRLS, bề mặt hẹp — chỉ trả trường xác thực; xem migration 0001). Email
// UNIQUE toàn cục nên một email định danh đúng một người dùng.
import { maskSensitive } from "@vat/crypto";
import { auditLog, nguoiDung, withTenant } from "@vat/db";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { requireTenant, signToken } from "../auth";
import { hashPassword, resolvePbkdf2Iterations, verifyPassword } from "../password";
import { isRole } from "../rbac";
import { clearSessionCookie, setSessionCookie } from "../session";
import type { AnyDb, AppDeps, AppEnv } from "../types";

// U18 — độ dài tối thiểu mật khẩu người dùng tự đặt. 8 ký tự: mật khẩu này KHÔNG có cửa
// sổ hết hạn như mật khẩu tạm 6 số, nên nó phải tự đứng vững. Ràng buộc đặt ở đây vì đây
// hiện là đường DUY NHẤT người dùng tự đặt mật khẩu; U24 (quên mật khẩu) sẽ dùng lại.
const MAT_KHAU_TOI_THIEU = 8;

const doiMatKhauSchema = z
  .object({
    mat_khau_hien_tai: z.string().min(1),
    mat_khau_moi: z.string().min(MAT_KHAU_TOI_THIEU),
  })
  .strict();

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
  // U18: thêm "login_fail_mat_khau_tam_het_han" (mật khẩu ĐÚNG nhưng quá hạn 72h) và
  // "doi_mat_khau". Cả hai vẫn ghi dưới hanh_dong="dang_nhap_saas" như các giá trị trước
  // — chỉ nằm trong chi_tiet.ket_qua, không đổi hình dạng bảng audit_log.
  ketQua:
    | "thanh_cong"
    | "that_bai"
    | "login_fail_chua_duyet"
    | "login_fail_mat_khau_tam_het_han"
    | "doi_mat_khau",
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
        //
        // ĐÍNH CHÍNH 2026-07-20 (chủ dự án duyệt, xem docs/plans/U17b-plan-thuc-thi.md
        // Task 4) — gate đổi từ `row?.password_hash && ...` sang `row && ...`. Bản cũ dùng
        // password_hash làm điều kiện "tenant có thật", nhưng tenant tự đăng ký qua
        // POST /dang-ky luôn có password_hash NULL (đặt mật khẩu là việc của luồng sau) ⇒
        // `row?.password_hash` LUÔN false cho đúng quần thể mà login_fail_chua_duyet được
        // sinh ra để phục vụ — nhánh audit này không bao giờ ghi được, và hoàn toàn KHÔNG
        // audit nào được ghi (kể cả that_bai) cho người dùng tự đăng ký. "Tenant có thật"
        // đúng nghĩa là `row` tồn tại (email khớp một hàng — auditLogin() đã cần
        // row.tenant_id/row.id), không phụ thuộc có mật khẩu hay chưa. KHÔNG đổi mã lỗi
        // HTTP, KHÔNG đổi vị trí trong biểu thức 401 hay đường settle() off-critical-path.
        const hanhDong =
          row && row.tenant_trang_thai !== "active" ? "login_fail_chua_duyet" : "that_bai";
        const audit = row ? auditLogin(db, row.tenant_id, row.id, hanhDong) : undefined;
        await settle(audit);
        return c.json({ error: "unauthorized" }, 401);
      }

      // Đăng nhập đúng → reset bộ đếm khóa (không phạt oan phiên sau).
      await limiter.recordSuccess();

      // ── U18 — CỔNG MẬT KHẨU TẠM ────────────────────────────────────────────────────
      // Mật khẩu tạm 6 chữ số (cấp khi super-admin duyệt/reset) chỉ có 10^6 không gian;
      // "hết hạn 72h" là một trong ba điều kiện bù bắt buộc khiến đánh đổi đó còn an
      // toàn (U18-plan §103, xem admin/matKhauTam.ts).
      //
      // ĐẶT Ở ĐÂY — SAU biểu thức 401, KHÔNG gộp vào trong nó — và đó là chủ ý ngược với
      // cổng trạng thái U17b ở trên. Lý do: cổng này cần một truy vấn phụ mà chỉ chạy
      // được khi đã biết `tenant_id`, tức chỉ khi email CÓ THẬT. Gộp vào biểu thức 401 sẽ
      // làm nhánh email-có-thật tốn thêm một round-trip DB so với nhánh email-không-tồn-
      // tại — tái tạo đúng lỗ rò enumeration qua timing mà H-A.5a đã bịt.
      //
      // Rò còn lại, đã cân nhắc và chấp nhận: người ĐÃ biết mật khẩu đúng có thể phân
      // biệt "hết hạn" với "còn hạn" qua độ trễ. Nhưng họ cũng phân biệt được bằng chính
      // mã trạng thái (401 vs 200) — timing không thêm thông tin gì mới.
      //
      // Truy vấn chạy trong withTenant ⇒ đi qua RLS bình thường, KHÔNG cần thêm hàm
      // SECURITY DEFINER nào. Đây chính là lý do 0011 không phải đụng auth_lookup_user()
      // (xem đầu file migration): tránh DROP+CREATE trên hàm gánh toàn bộ đường đăng nhập.
      const co = await withTenant(db, row.tenant_id, (tx) =>
        tx
          .select({
            phaiDoi: nguoiDung.phaiDoiMatKhau,
            hetHan: nguoiDung.matKhauTamHetHan,
          })
          .from(nguoiDung)
          .where(eq(nguoiDung.id, row.id)),
      );
      const coMatKhauTam = co[0];
      if (coMatKhauTam?.hetHan && coMatKhauTam.hetHan.getTime() <= Date.now()) {
        // Mật khẩu ĐÚNG nhưng đã quá hạn ⇒ vẫn 401 gọn. Khách phải xin super-admin cấp
        // lại (POST /admin/tenants/:id/reset-mat-khau). KHÔNG recordFailure: mật khẩu gõ
        // đúng nên đây không phải tín hiệu dò mật khẩu, không được tính vào khoá tài khoản.
        await settle(auditLogin(db, row.tenant_id, row.id, "login_fail_mat_khau_tam_het_han"));
        return c.json({ error: "unauthorized" }, 401);
      }

      const token = await signToken(
        { tenantId: row.tenant_id, role: row.vai_tro, sub: row.id },
        c.env.JWT_SECRET,
      );
      await settle(auditLogin(db, row.tenant_id, row.id, "thanh_cong"));
      // ADR-0003 Amendment #1 (C1+C2): token đi bằng cookie HttpOnly, KHÔNG trả trong
      // body. Trả trong body thì JS lại cầm được token ⇒ triệt tiêu toàn bộ lợi ích
      // chống XSS-exfil của HttpOnly. Đây là điểm dễ vô hiệu hoá cả thiết kế nhất.
      setSessionCookie(c, token);
      // U18 — cờ buộc đổi mật khẩu. CHỈ có mặt khi bằng true, không phải luôn luôn: hợp
      // đồng phản hồi của người dùng bình thường giữ NGUYÊN `{ok:true}` như trước U18, nên
      // không đơn vị nào đang chạy phải sửa theo. Frontend (U20) đọc theo giá trị thật.
      return c.json(coMatKhauTam?.phaiDoi ? { ok: true, phai_doi_mat_khau: true } : { ok: true });
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

  // POST /auth/doi-mat-khau — U18 (QĐ-2). Đóng lỗ hổng mà chính U18 mở ra: super-admin
  // cấp mật khẩu TẠM 6 chữ số, và nếu không có đường đổi thì nó thành mật khẩu VĨNH VIỄN
  // — sụp điều kiện bù "buộc đổi lần đầu" (matKhauTam.ts). U20 làm phần UI ép màn đổi;
  // đây là backend, thuộc phạm vi U18.
  //
  // ĐÒI MẬT KHẨU HIỆN TẠI, không chỉ dựa vào phiên đang đăng nhập: nếu chỉ cần cookie
  // hợp lệ, một phiên bị chiếm (máy bỏ quên, XSS chưa vá) đổi được mật khẩu và khoá
  // vĩnh viễn chủ tài khoản ra ngoài. Xác thực lại biến việc đó thành bất khả thi nếu
  // kẻ chiếm phiên không biết mật khẩu.
  r.post("/doi-mat-khau", requireTenant, async (c) => {
    const userId = c.get("userId");
    // Token cũ (trước U18) không mang `sub` ⇒ không xác định được "chính tôi" là ai.
    // Đăng nhập lại là đủ để có token mới có `sub`.
    if (!userId) return c.json({ error: "unauthorized" }, 401);

    const parsed = doiMatKhauSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "bad_request" }, 400);
    const { mat_khau_hien_tai, mat_khau_moi } = parsed.data;
    if (mat_khau_moi === mat_khau_hien_tai) {
      // Đổi sang chính nó sẽ tắt cờ `phai_doi_mat_khau` mà không đổi gì thật — biến bước
      // buộc-đổi thành hình thức. Từ chối tường minh.
      return c.json({ error: "mat_khau_moi_trung_hien_tai" }, 400);
    }

    const tenantId = c.get("tenantId");
    const { db, close } = await deps.getDb(c.env);
    try {
      const rows = await withTenant(db, tenantId, (tx) =>
        tx
          .select({ hash: nguoiDung.passwordHash, hetHan: nguoiDung.matKhauTamHetHan })
          .from(nguoiDung)
          .where(eq(nguoiDung.id, userId)),
      );
      const row = rows[0];
      if (!row?.hash || !(await verifyPassword(mat_khau_hien_tai, row.hash))) {
        return c.json({ error: "unauthorized" }, 401);
      }
      // Mật khẩu tạm đã quá hạn thì KHÔNG được dùng làm chìa để đặt mật khẩu vĩnh viễn —
      // nếu không, cửa sổ 72h trở nên vô nghĩa với bất kỳ ai còn giữ token cũ.
      if (row.hetHan && row.hetHan.getTime() <= Date.now()) {
        return c.json({ error: "unauthorized" }, 401);
      }

      const hashMoi = await hashPassword(mat_khau_moi, resolvePbkdf2Iterations(c.env));
      await withTenant(db, tenantId, (tx) =>
        tx
          .update(nguoiDung)
          .set({
            passwordHash: hashMoi,
            phaiDoiMatKhau: false,
            // Xoá hạn: mật khẩu này do chính người dùng đặt, không còn là mật khẩu tạm.
            matKhauTamHetHan: null,
          })
          .where(eq(nguoiDung.id, userId)),
      );
      await auditLogin(db, tenantId, userId, "doi_mat_khau");
      return c.json({ ok: true });
    } finally {
      await close();
    }
  });

  return r;
}

// U18 §5 — Quản trị vòng đời tenant. TOÀN BỘ router này nằm sau `requireSuperAdmin`.
//
// RANH GIỚI PHÁP LÝ CỨNG (chốt 2026-07-15): chủ phần mềm quản trị VÒNG ĐỜI TÀI KHOẢN và
// METADATA, tuyệt đối KHÔNG đọc/sửa hóa đơn của khách. Ranh giới đó không được thi hành
// bằng "route này không hỏi tới hóa đơn" mà bằng việc các hàm SQL ở migration 0011 KHÔNG
// CÓ ĐƯỜNG TỚI bảng `hoa_don` — nên kể cả một route viết ẩu sau này cũng không moi ra
// được. Xem test "không hàm admin_* nào chạm tới bảng hóa đơn" trong superAdmin.test.ts.
//
// Mọi truy vấn ở đây đi qua hàm SECURITY DEFINER `admin_*`. KHÔNG viết truy vấn Drizzle
// trực tiếp lên `tenants`/`nguoi_dung` trong file này: role app không có đường xuyên-tenant
// nào khác, và nếu có thì đó chính là lỗ hổng U18 sinh ra để tránh.
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { ghiAuditAdmin } from "../../admin/auditAdmin";
import { hanMatKhauTam, sinhMatKhauTam } from "../../admin/matKhauTam";
import { requireSuperAdmin } from "../../admin/requireSuperAdmin";
import { type HanhDongAdmin, chuyenTuHanhDong } from "../../admin/tenantStateMachine";
import { isUuid } from "../../auth";
import { hashPassword, resolvePbkdf2Iterations } from "../../password";
import type { AdminEnv, AnyDb, AppDeps } from "../../types";

const patchSchema = z
  .object({
    // Danh sách sửa được là ALLOWLIST, khớp đúng tham số của `admin_sua_metadata_tenant`.
    // `.strict()` để một khoá lạ (vd `mst`) bị TỪ CHỐI thẳng bằng 400 thay vì bị bỏ qua im
    // lặng — người gọi phải biết là yêu cầu của họ không được thực hiện.
    ten: z.string().trim().min(1).optional(),
    goi_dich_vu: z.string().trim().min(1).optional(),
    ghi_chu: z.string().optional(),
  })
  .strict();

/** Ánh xạ path → hành động máy trạng thái. Path dùng gạch nối (quy ước URL), hành động
 * dùng gạch dưới (quy ước định danh) — khai một chỗ để hai bên không trôi khỏi nhau. */
const HANH_DONG_THEO_PATH: Record<string, HanhDongAdmin> = {
  duyet: "duyet",
  "tu-choi": "tu_choi",
  khoa: "khoa",
  "mo-khoa": "mo_khoa",
};

/** Đặt mật khẩu TẠM cho tài khoản chính của tenant. Dùng chung cho "duyệt" và "reset".
 * Trả mật khẩu THÔ cho nơi gọi để đưa vào phản hồi ĐÚNG MỘT LẦN (QĐ-1) — nơi gọi có
 * trách nhiệm không đưa nó vào audit/log. */
async function datMatKhauTam(db: AnyDb, tenantId: string, env: { PBKDF2_ITERATIONS?: string }) {
  const matKhauTam = sinhMatKhauTam();
  const hetHan = hanMatKhauTam();
  // Băm ở tầng Worker (WebCrypto) rồi mới xuống DB: mật khẩu thô KHÔNG BAO GIỜ đi vào
  // Postgres, nên nó cũng không lọt vào nhật ký truy vấn chậm hay bản sao lưu của DB.
  const hash = await hashPassword(matKhauTam, resolvePbkdf2Iterations(env));
  const r = (await db.execute(
    sql`select id, email from admin_dat_mat_khau_tam(${tenantId}::uuid, ${hash}, ${hetHan.toISOString()}::timestamptz)`,
  )) as { rows: Array<{ id: string; email: string }> };
  const row = r.rows[0];
  return row ? { matKhauTam, hetHan, email: row.email, nguoiDungId: row.id } : null;
}

export function adminTenantsRoutes(deps: AppDeps) {
  const r = new Hono<AdminEnv>();

  // Gác TOÀN BỘ router. Đặt trước mọi handler để không có đường nào lọt ra ngoài cổng.
  r.use("*", requireSuperAdmin);

  // ── Liệt kê ────────────────────────────────────────────────────────────────────────
  r.get("/", async (c) => {
    const { db, close } = await deps.getDb(c.env);
    try {
      const q = c.req.query("q") ?? null;
      const trangThai = c.req.query("trang_thai") ?? null;
      const limit = Number(c.req.query("limit") ?? 50);
      const offset = Number(c.req.query("offset") ?? 0);
      const res = (await db.execute(sql`
        select * from admin_liet_ke_tenant(
          ${trangThai}, ${q},
          ${Number.isFinite(limit) ? limit : 50}::int,
          ${Number.isFinite(offset) ? offset : 0}::int)`)) as {
        rows: Array<Record<string, unknown>>;
      };
      // `total` lặp trên mọi hàng (window function) — bóc ra một lần rồi bỏ khỏi từng item.
      const total = res.rows.length > 0 ? Number(res.rows[0]?.total) : 0;
      const items = res.rows.map(({ total: _bo, ...item }) => item);
      return c.json({ items, total });
    } finally {
      await close();
    }
  });

  // ── Chi tiết ───────────────────────────────────────────────────────────────────────
  r.get("/:id", async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id)) return c.json({ error: "bad_request" }, 400);
    const { db, close } = await deps.getDb(c.env);
    try {
      const res = (await db.execute(
        sql`select * from admin_chi_tiet_tenant(${id}::uuid)`,
      )) as { rows: Array<Record<string, unknown>> };
      const row = res.rows[0];
      if (!row) return c.json({ error: "not_found" }, 404);
      return c.json(row);
    } finally {
      await close();
    }
  });

  // ── Chuyển trạng thái: duyet | tu-choi | khoa | mo-khoa ────────────────────────────
  r.post("/:id/:hanhDong{duyet|tu-choi|khoa|mo-khoa}", async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id)) return c.json({ error: "bad_request" }, 400);
    const hanhDong = HANH_DONG_THEO_PATH[c.req.param("hanhDong")] as HanhDongAdmin;
    const { tu, den } = chuyenTuHanhDong(hanhDong);

    const { db, close } = await deps.getDb(c.env);
    try {
      // MỘT câu UPDATE nguyên tử với `WHERE trang_thai = tu`. Không đọc-rồi-ghi ⇒ không có
      // khe TOCTOU: hai admin bấm cùng lúc thì người thứ hai cập nhật 0 hàng → 409.
      const res = (await db.execute(
        sql`select id, trang_thai from admin_doi_trang_thai_tenant(${id}::uuid, ${tu}, ${den})`,
      )) as { rows: Array<{ id: string; trang_thai: string }> };

      if (res.rows.length === 0) {
        // 0 hàng có hai nguyên nhân: tenant không tồn tại, hoặc đang ở trạng thái khác.
        // Phân biệt bằng một truy vấn CHỈ trên đường lỗi để trả đúng 404 vs 409 — Cổng
        // Admin cần phân biệt được "gõ nhầm id" với "ai đó vừa đổi trạng thái trước bạn".
        const ton = (await db.execute(
          sql`select id from admin_chi_tiet_tenant(${id}::uuid)`,
        )) as { rows: unknown[] };
        return ton.rows.length === 0
          ? c.json({ error: "not_found" }, 404)
          : c.json({ error: "chuyen_trang_thai_khong_hop_le", tu_mong_doi: tu }, 409);
      }

      const adminId = c.get("adminId");
      await ghiAuditAdmin(db, {
        hanhDong: `${hanhDong}_tenant`,
        doiTuong: id,
        nguoiThucHien: adminId,
        chiTiet: { cu: tu, moi: den },
      });

      // Duyệt = mở tài khoản cho khách ⇒ phải có mật khẩu để đăng nhập lần đầu. U17b tạo
      // `nguoi_dung` với `password_hash = NULL` (đặt mật khẩu là việc của luồng sau) nên
      // nếu không làm bước này, tenant vừa duyệt vẫn KHÔNG đăng nhập được — đúng chỗ kẹt
      // mà cả U18 sinh ra để gỡ.
      if (hanhDong === "duyet") {
        const dat = await datMatKhauTam(db, id, c.env);
        if (dat) {
          await ghiAuditAdmin(db, {
            hanhDong: "cap_mat_khau_tam",
            doiTuong: id,
            nguoiThucHien: adminId,
            // GHI RẰNG đã cấp, KHÔNG ghi cấp cái gì. `maskSensitive` không cứu được ở đây:
            // mật khẩu tạm là chuỗi 6 chữ số, không có tên khoá nào để nó nhận ra mà che.
            chiTiet: { da_cap: true, het_han: dat.hetHan.toISOString() },
          });
          // QĐ-1 — mật khẩu tạm trả về ĐÚNG MỘT LẦN, ngay tại đây. Không có đường nào đọc
          // lại nó: DB chỉ giữ bản băm. Super-admin chuyển cho khách ngoài luồng cho tới
          // khi U24 dựng xong hạ tầng email (AWS SES).
          return c.json({
            ok: true,
            trang_thai: den,
            mat_khau_tam: dat.matKhauTam,
            email: dat.email,
            mat_khau_tam_het_han: dat.hetHan.toISOString(),
          });
        }
      }

      return c.json({ ok: true, trang_thai: den });
    } finally {
      await close();
    }
  });

  // ── Sửa metadata ───────────────────────────────────────────────────────────────────
  r.patch("/:id", async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id)) return c.json({ error: "bad_request" }, 400);
    const parsed = patchSchema.safeParse(await c.req.json().catch(() => null));
    // `.strict()` làm mọi khoá ngoài allowlist rớt ở đây — kể cả `mst`. MST là khoá tự
    // nhiên (U23-D: 1 MST ↔ 1 tenant); đổi được nó là đổi được danh tính pháp lý của một
    // doanh nghiệp trong hệ thống.
    if (!parsed.success) return c.json({ error: "bad_request" }, 400);

    const { db, close } = await deps.getDb(c.env);
    try {
      const truoc = (await db.execute(
        sql`select ten, goi_dich_vu, ghi_chu from admin_chi_tiet_tenant(${id}::uuid)`,
      )) as { rows: Array<Record<string, unknown>> };
      if (truoc.rows.length === 0) return c.json({ error: "not_found" }, 404);

      const d = parsed.data;
      const res = (await db.execute(sql`
        select id, ten, mst, goi_dich_vu, ghi_chu from admin_sua_metadata_tenant(
          ${id}::uuid, ${d.ten ?? null}, ${d.goi_dich_vu ?? null}, ${d.ghi_chu ?? null})`)) as {
        rows: Array<Record<string, unknown>>;
      };

      await ghiAuditAdmin(db, {
        hanhDong: "sua_metadata_tenant",
        doiTuong: id,
        nguoiThucHien: c.get("adminId"),
        // Ghi CŨ → MỚI (QĐ-6), không chỉ tên trường: nhật ký phải trả lời được "đã đổi
        // thành cái gì", nếu không thì nó chỉ chứng minh có ai đó đã động vào.
        chiTiet: { cu: truoc.rows[0], moi: res.rows[0] },
      });
      return c.json({ ok: true, tenant: res.rows[0] });
    } finally {
      await close();
    }
  });

  // ── Cấp lại mật khẩu tạm ───────────────────────────────────────────────────────────
  r.post("/:id/reset-mat-khau", async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id)) return c.json({ error: "bad_request" }, 400);
    const { db, close } = await deps.getDb(c.env);
    try {
      const dat = await datMatKhauTam(db, id, c.env);
      // NULL = không tìm thấy tài khoản `quan_tri` nào của tenant này (tenant không tồn
      // tại, hoặc dữ liệu bất thường). Không tạo mới — U18 không phải nơi tạo người dùng.
      if (!dat) return c.json({ error: "not_found" }, 404);

      await ghiAuditAdmin(db, {
        hanhDong: "reset_mat_khau_tenant",
        doiTuong: id,
        nguoiThucHien: c.get("adminId"),
        chiTiet: { da_cap: true, het_han: dat.hetHan.toISOString() },
      });
      return c.json({
        ok: true,
        mat_khau_tam: dat.matKhauTam,
        email: dat.email,
        mat_khau_tam_het_han: dat.hetHan.toISOString(),
      });
    } finally {
      await close();
    }
  });

  return r;
}

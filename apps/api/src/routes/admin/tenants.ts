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
import { requireSuperAdmin } from "../../admin/requireSuperAdmin";
import { type HanhDongAdmin, chuyenTuHanhDong } from "../../admin/tenantStateMachine";
import { isUuid } from "../../auth";
import { thuDatMatKhau } from "../../email/mau";
import { bamToken, sinhToken } from "../../email/token";
import { hanTokenDatMatKhau, lienKetDatMatKhau } from "../../email/tokenDatMatKhau";
import type { AdminEnv, AnyDb, AppDeps, Env } from "../../types";
import { urlWeb } from "../../urlWeb";

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

/**
 * Lát cắt 3 (QĐ-14) — Tạo token đặt mật khẩu rồi GỬI THƯ. Dùng chung cho "duyệt" và
 * "gửi lại link". Thay hẳn `datMatKhauTam` cũ (mật khẩu tạm 6 chữ số).
 *
 * Trả `null` khi tenant không có tài khoản `quan_tri` nào (không tồn tại, hoặc dữ liệu bất
 * thường) — nơi gọi trả 404. KHÔNG tạo người dùng mới: đó không phải việc của đường này.
 *
 * `daGuiThu` phải NỔI LÊN tới phản hồi, không được nuốt. Thư hỏng nghĩa là khách không bao
 * giờ nhận được gì, và chủ dự án là người DUY NHẤT có thể phát hiện — nhưng chỉ khi màn
 * hình nói ra. Đây đúng chỗ mà một đường lỗi bị bỏ quên vì nó không nằm trên luồng chính.
 */
async function guiLinkDatMatKhau(
  db: AnyDb,
  tenantId: string,
  tenDoanhNghiep: string,
  env: Env,
  deps: AppDeps,
): Promise<{ email: string; hetHan: Date; daGuiThu: boolean } | null> {
  const token = sinhToken();
  const hetHan = hanTokenDatMatKhau();
  const r = (await db.execute(
    sql`select r_nguoi_dung_id, r_email from dat_mat_khau_tao(${tenantId}::uuid, ${await bamToken(token)}, ${hetHan.toISOString()}::timestamptz)`,
  )) as { rows: Array<{ r_nguoi_dung_id: string; r_email: string }> };
  const row = r.rows[0];
  if (!row) return null;

  // Thư hỏng KHÔNG được ném đè lên kết quả chính: tenant đã đổi trạng thái trong DB rồi,
  // trả 500 cho admin sẽ khiến họ bấm Duyệt lại và nhận 409 khó hiểu (F9, cùng lớp với
  // `/dang-ky`). Nhưng KHÁC với Telegram, thư này là mắt xích BẮT BUỘC của chuỗi — nên
  // phản hồi phải NÓI RA rằng thư chưa gửi được.
  let daGuiThu = false;
  try {
    const thu = thuDatMatKhau(tenDoanhNghiep, lienKetDatMatKhau(urlWeb(env), token));
    const kq = await deps.getEmailTransport(env).gui({ ...thu, den: row.r_email });
    daGuiThu = kq.daGui;
    if (!kq.daGui) console.warn(`[admin] không gửi được thư đặt mật khẩu: ${kq.lyDo}`);
  } catch (err) {
    console.warn("[admin] gửi thư đặt mật khẩu ném lỗi:", err instanceof Error ? err.message : err);
  }
  return { email: row.r_email, hetHan, daGuiThu };
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
      const res = (await db.execute(sql`select * from admin_chi_tiet_tenant(${id}::uuid)`)) as {
        rows: Array<Record<string, unknown>>;
      };
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
        const ton = (await db.execute(sql`select id from admin_chi_tiet_tenant(${id}::uuid)`)) as {
          rows: unknown[];
        };
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

      // Duyệt = mở tài khoản cho khách ⇒ khách phải đặt được mật khẩu. U17b tạo
      // `nguoi_dung` với `password_hash = NULL` nên nếu không làm bước này, tenant vừa
      // duyệt vẫn KHÔNG đăng nhập được.
      //
      // Trước Lát cắt 3, chỗ này sinh mật khẩu tạm 6 chữ số rồi trả về cho admin tự chuyển
      // cho khách qua điện thoại (QĐ-1). QĐ-14 gỡ hẳn đường đó: hệ thống tự gửi thư kèm
      // liên kết, và admin không còn nhìn thấy mật khẩu của khách nữa.
      if (hanhDong === "duyet") {
        const ten = (await db.execute(sql`select ten from admin_chi_tiet_tenant(${id}::uuid)`)) as {
          rows: Array<{ ten: string }>;
        };
        const kq = await guiLinkDatMatKhau(db, id, ten.rows[0]?.ten ?? "", c.env, deps);
        if (kq) {
          await ghiAuditAdmin(db, {
            hanhDong: "gui_link_dat_mat_khau",
            doiTuong: id,
            nguoiThucHien: adminId,
            // QĐ-17 — ghi RẰNG đã gửi, KHÔNG ghi gửi cái gì và gửi cho ai. Token là chìa
            // khoá; email là dữ liệu cá nhân, mà bảng này thì bất biến.
            chiTiet: { da_gui_thu: kq.daGuiThu, het_han: kq.hetHan.toISOString() },
          });
          return c.json({
            ok: true,
            trang_thai: den,
            email: kq.email,
            da_gui_thu: kq.daGuiThu,
            het_han: kq.hetHan.toISOString(),
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

  // ── Gửi lại liên kết đặt mật khẩu ──────────────────────────────────────────────────
  // Tên route đổi từ `reset-mat-khau` (QĐ-14): nó không còn reset mật khẩu nào cả, nó gửi
  // một lá thư. Giữ tên cũ là để lại một cái tên nói dối trong hợp đồng API — cùng họ với
  // bài học "thao tác GHI diễn đạt như câu đọc".
  //
  // Tác dụng phụ CÓ CHỦ Ý: mọi liên kết chưa dùng của tài khoản này chết ngay (hàm
  // `dat_mat_khau_tao` lo). Bấm "Gửi lại" mà liên kết cũ vẫn sống là hai chìa cùng mở một
  // cửa, và người bấm tưởng mình vừa thu hồi chìa cũ.
  r.post("/:id/gui-link-dat-mat-khau", async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id)) return c.json({ error: "bad_request" }, 400);
    const { db, close } = await deps.getDb(c.env);
    try {
      const ten = (await db.execute(sql`select ten from admin_chi_tiet_tenant(${id}::uuid)`)) as {
        rows: Array<{ ten: string }>;
      };
      if (ten.rows.length === 0) return c.json({ error: "not_found" }, 404);

      const kq = await guiLinkDatMatKhau(db, id, ten.rows[0]?.ten ?? "", c.env, deps);
      // NULL = tenant có thật nhưng không có tài khoản `quan_tri` nào (dữ liệu bất thường).
      // Không tạo mới — U18 không phải nơi tạo người dùng.
      if (!kq) return c.json({ error: "not_found" }, 404);

      await ghiAuditAdmin(db, {
        hanhDong: "gui_link_dat_mat_khau",
        doiTuong: id,
        nguoiThucHien: c.get("adminId"),
        chiTiet: { da_gui_thu: kq.daGuiThu, het_han: kq.hetHan.toISOString(), gui_lai: true },
      });
      return c.json({
        ok: true,
        email: kq.email,
        da_gui_thu: kq.daGuiThu,
        het_han: kq.hetHan.toISOString(),
      });
    } finally {
      await close();
    }
  });

  return r;
}

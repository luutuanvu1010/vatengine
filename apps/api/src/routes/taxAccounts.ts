// U14 — quản lý tài khoản thuế + đường login GDT (ghi token mã hóa). Mọi route sau
// requireTenant + requireRole(ke_toan_truong|quan_tri), trong withTenant (RLS lớp 2)
// + lọc tenant_id tường minh (lớp 1). Gọi GDT CHỈ qua @vat/gdt-client (gdt-adapter.md).
import { maskSensitive } from "@vat/crypto";
import { auditLog, clearToken, storeToken, taiKhoanThue, tenants, withTenant } from "@vat/db";
import {
  GdtContractDriftError,
  GdtError,
  authenticate,
  deriveTokenExpiry,
  getCaptcha,
} from "@vat/gdt-client";
import {
  buildDetailMessages,
  buildSyncMessages,
  currentPeriodWindow,
  listInvoicesMissingLines,
} from "@vat/sync";
import { and, count, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { isUuid, requireTenant } from "../auth";
import { requireRole } from "../rbac";
import type { AppDeps, AppEnv } from "../types";

// U23-D2 — username tài khoản chính auto = MST gốc (không nhận từ body). Body chỉ tùy chọn
// `loai`; `username` chỉ dùng cho tài khoản CON khi module bật.
const registerSchema = z.object({
  username: z.string().min(1).optional(),
  loai: z.enum(["chinh", "con"]).optional(),
});

// U26 — trần message backfill dòng hàng / một lần gọi trigger: 4000 msg = 40 sendBatch
// (≤100 msg/batch) — vừa ngân sách 50 subrequest/lần gọi Workers Free, có lề cho DB.
export const MAX_BACKFILL_LINES_MOI_LAN = 4000;

// Hạn mức số tài khoản thuế / tenant. TODO (U17): lấy theo GÓI DỊCH VỤ (tenants.goiDichVu →
// bảng gói). Tạm hardcode = 1 tại MỘT điểm — không rải magic number khắp handler.
export function getGioiHanTkThue(_tenant: { goiDichVu: string | null }): number {
  return 1;
}

// Cờ module tài khoản con (U23-D — "chỉ dựng nền"). Mặc định TẮT. Bật ⇒ cho tạo loai='con'
// với username theo nhánh MST. TODO: chuyển sang cấu hình theo gói dịch vụ khi U17 xong.
export const SUB_ACCOUNT_MODULE_ENABLED = false;

// Username tài khoản CON hợp lệ: là NHÁNH của MST gốc (dài hơn + bắt đầu bằng MST) — chống
// dùng MST ngoài doanh nghiệp. Vd "abcd-001" hợp lệ với MST "abcd"; "abcd" trơn là tài khoản
// chính (không phải con); "efgh-001" sai tiền tố.
export function isValidSubUsername(mst: string, username: string): boolean {
  return username.length > mst.length && username.startsWith(mst);
}

const loginSchema = z.object({
  password: z.string().min(1),
  ckey: z.string().min(1),
  cvalue: z.string().min(1),
});

export function taxAccountsRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();

  r.use("*", requireTenant);
  r.use("*", requireRole("ke_toan_truong", "quan_tri"));

  // POST /tax-accounts — đăng ký bản ghi tài khoản thuế (chưa có token). U23-D2: tài khoản
  // CHÍNH auto username = tenants.mst (không nhận từ body); kiểm hạn mức (getGioiHanTkThue);
  // tài khoản CON ẩn sau cờ (mặc định TẮT). Mọi truy vấn tenant-scoped (withTenant + RLS).
  r.post("/", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "bad_request" }, 400);
    }
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "bad_request" }, 400);

    const loai = parsed.data.loai ?? "chinh";
    // Tài khoản con chỉ khả dụng khi module bật (mặc định TẮT — U23-D chỉ dựng nền).
    if (loai === "con" && !SUB_ACCOUNT_MODULE_ENABLED) {
      return c.json({ error: "sub_account_disabled" }, 400);
    }

    const tenantId = c.get("tenantId");
    const { db, close } = await deps.getDb(c.env);
    try {
      const outcome = await withTenant(db, tenantId, async (tx) => {
        const trows = await tx
          .select({ mst: tenants.mst, goiDichVu: tenants.goiDichVu })
          .from(tenants)
          .where(eq(tenants.id, tenantId));
        const tenant = trows[0];
        if (!tenant || !tenant.mst) return { kind: "mst_missing" as const };

        // Username: chính auto = MST gốc; con validate tiền tố (startsWith MST).
        let username: string;
        if (loai === "con") {
          const u = parsed.data.username;
          if (!u || !isValidSubUsername(tenant.mst, u))
            return { kind: "sub_prefix_invalid" as const };
          username = u;
        } else {
          username = tenant.mst;
        }

        // Hạn mức (tạm =1) — đếm tài khoản thuế hiện có của tenant.
        const cnt = await tx
          .select({ n: count() })
          .from(taiKhoanThue)
          .where(eq(taiKhoanThue.tenantId, tenantId));
        if (Number(cnt[0]?.n ?? 0) >= getGioiHanTkThue(tenant)) {
          return { kind: "limit_reached" as const };
        }

        const ins = await tx
          .insert(taiKhoanThue)
          .values({ tenantId, username, loai })
          .returning({ id: taiKhoanThue.id });
        return { kind: "ok" as const, id: ins[0]?.id };
      });

      switch (outcome.kind) {
        case "mst_missing":
          return c.json({ error: "mst_missing", message: "Doanh nghiệp chưa khai MST" }, 400);
        case "sub_prefix_invalid":
          return c.json({ error: "sub_prefix_invalid" }, 400);
        case "limit_reached":
          return c.json({ error: "limit_reached", message: "Đã đạt hạn mức tài khoản thuế" }, 409);
        default:
          if (!outcome.id) return c.json({ error: "server_error" }, 500);
          return c.json({ id: outcome.id }, 201);
      }
    } finally {
      await close();
    }
  });

  // A2 (U15) — GET /tax-accounts: liệt kê tài khoản thuế của tenant (đọc trạng thái cho
  // S5). CHỈ trường trạng thái; KHÔNG token_hien_tai/secret_ref (bí mật). Cách ly tenant.
  r.get("/", async (c) => {
    const tenantId = c.get("tenantId");
    const { db, close } = await deps.getDb(c.env);
    try {
      const rows = await withTenant(db, tenantId, (tx) =>
        tx
          .select({
            id: taiKhoanThue.id,
            username: taiKhoanThue.username,
            loai: taiKhoanThue.loai,
            uyQuyenLuc: taiKhoanThue.uyQuyenLuc,
            tokenHetHan: taiKhoanThue.tokenHetHan,
            ngayTao: taiKhoanThue.ngayTao,
          })
          .from(taiKhoanThue)
          .where(eq(taiKhoanThue.tenantId, tenantId)),
      );
      return c.json(rows);
    } finally {
      await close();
    }
  });

  // A2 — GET /tax-accounts/:id: một tài khoản (đọc trạng thái). Khác tenant → 404.
  r.get("/:id", async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id)) return c.json({ error: "bad_request" }, 400);
    const tenantId = c.get("tenantId");
    const { db, close } = await deps.getDb(c.env);
    try {
      const row = await withTenant(db, tenantId, async (tx) => {
        const rows = await tx
          .select({
            id: taiKhoanThue.id,
            username: taiKhoanThue.username,
            loai: taiKhoanThue.loai,
            uyQuyenLuc: taiKhoanThue.uyQuyenLuc,
            tokenHetHan: taiKhoanThue.tokenHetHan,
            ngayTao: taiKhoanThue.ngayTao,
          })
          .from(taiKhoanThue)
          .where(and(eq(taiKhoanThue.id, id), eq(taiKhoanThue.tenantId, tenantId)));
        return rows[0] ?? null;
      });
      if (!row) return c.json({ error: "not_found" }, 404);
      return c.json(row);
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

  // POST /tax-accounts/:id/sync — "Đồng bộ ngay": đẩy job (purchase+sold, kỳ hiện tại) vào
  // hàng đợi để sync-worker kéo hóa đơn. API chỉ PRODUCER, giữ stateless (ADR-0001 §3).
  // Token phải CÒN HẠN — job nền KHÔNG tự đăng nhập (quyết định A). Cách ly: chỉ tài
  // khoản thuộc tenant hiện tại (withTenant + lọc tenant_id).
  r.post("/:id/sync", async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id)) return c.json({ error: "bad_request" }, 400);
    const queue = c.env.SYNC_QUEUE;
    if (!queue) return c.json({ error: "sync_unavailable" }, 503);
    const tenantId = c.get("tenantId");
    const { db, close } = await deps.getDb(c.env);
    try {
      const acc = await withTenant(db, tenantId, async (tx) => {
        const rows = await tx
          .select({ tokenHetHan: taiKhoanThue.tokenHetHan })
          .from(taiKhoanThue)
          .where(and(eq(taiKhoanThue.id, id), eq(taiKhoanThue.tenantId, tenantId)));
        return rows[0] ?? null;
      });
      if (!acc) return c.json({ error: "not_found" }, 404);
      if (!acc.tokenHetHan || acc.tokenHetHan.getTime() <= Date.now()) {
        return c.json({ error: "token_het_han" }, 409);
      }
      const window = currentPeriodWindow(Date.now());
      const msgs = buildSyncMessages([{ tenantId, taikhoanId: id }], window, ["purchase", "sold"]);
      await queue.sendBatch(msgs.map((body) => ({ body })));
      return c.json({ enqueued: msgs.length, period: window.period }, 202);
    } finally {
      await close();
    }
  });

  // POST /tax-accounts/:id/backfill-lines — U26: enqueue 1 message chi tiết
  // (`kind:"detail"`) / hóa đơn ĐANG THIẾU dòng hàng của tài khoản (mua→nmmst,
  // bán→nbmst = username tài khoản; hoa_don không có taikhoan_id). Consumer pha 2
  // (vat-sync-worker) xử lý idempotent → gọi lại trigger an toàn. API chỉ PRODUCER.
  // Trần 4000 msg/lần gọi (ngân sách subrequest Workers Free: ≤40 sendBatch + lề);
  // `conLai > 0` → gọi lại tới khi 0. Token phải CÒN HẠN (pha 2 dùng token này).
  r.post("/:id/backfill-lines", async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id)) return c.json({ error: "bad_request" }, 400);
    const queue = c.env.SYNC_QUEUE;
    if (!queue) return c.json({ error: "sync_unavailable" }, 503);
    const tenantId = c.get("tenantId");
    const { db, close } = await deps.getDb(c.env);
    try {
      const ketQua = await withTenant(db, tenantId, async (tx) => {
        const rows = await tx
          .select({ username: taiKhoanThue.username, tokenHetHan: taiKhoanThue.tokenHetHan })
          .from(taiKhoanThue)
          .where(and(eq(taiKhoanThue.id, id), eq(taiKhoanThue.tenantId, tenantId)));
        const acc = rows[0];
        if (!acc) return { loi: 404 as const };
        if (!acc.tokenHetHan || acc.tokenHetHan.getTime() <= Date.now()) {
          return { loi: 409 as const };
        }
        // GIỚI HẠN ĐÃ BIẾT (tài khoản `loai='con'`): username có thể không phải MST
        // trần (CHƯA KIỂM CHỨNG định dạng) → HĐ không khớp sẽ nằm ngoài phạm vi, hiện
        // trong `soHoaDonThieu` của tài khoản chính. Không âm thầm: U26-plan §6.
        const thieu = await listInvoicesMissingLines(tx, tenantId, {
          ownMst: acc.username,
          limit: MAX_BACKFILL_LINES_MOI_LAN,
        });
        return { thieu };
      });
      if ("loi" in ketQua) {
        return c.json({ error: ketQua.loi === 404 ? "not_found" : "token_het_han" }, ketQua.loi);
      }
      const { candidates, tongThieu } = ketQua.thieu;
      if (candidates.length > 0) {
        // Chia lô ≤100 msg (giới hạn sendBatch Cloudflare Queues) — enqueue TRƯỚC,
        // audit SAU (mirror thứ tự B5: không audit cho việc chưa xảy ra).
        const msgs = buildDetailMessages({ tenantId, taikhoanId: id }, candidates);
        for (let i = 0; i < msgs.length; i += 100) {
          await queue.sendBatch(msgs.slice(i, i + 100).map((body) => ({ body })));
        }
        await withTenant(db, tenantId, async (tx) => {
          await tx.insert(auditLog).values({
            tenantId,
            hanhDong: "backfill_dong_hang",
            doiTuong: id,
            chiTiet: maskSensitive({ soHoaDonThieu: tongThieu, soDaXepHang: msgs.length }),
          });
        });
      }
      return c.json(
        {
          soHoaDonThieu: tongThieu,
          soDaXepHang: candidates.length,
          conLai: tongThieu - candidates.length,
        },
        202,
      );
    } finally {
      await close();
    }
  });

  // POST /tax-accounts/:id/disconnect — NGẮT KẾT NỐI: xóa token đã lưu (token vault) + reset
  // trạng thái token, audit (mask). KHÔNG xóa bản ghi MST — chỉ ngắt token. Cách ly tenant:
  // tài khoản không thuộc tenant → clearToken trả false → 404 (không rò tồn tại chéo tenant).
  r.post("/:id/disconnect", async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id)) return c.json({ error: "bad_request" }, 400);
    const tenantId = c.get("tenantId");
    const { db, close } = await deps.getDb(c.env);
    try {
      const ok = await clearToken(db, tenantId, id);
      if (!ok) return c.json({ error: "not_found" }, 404);
      await withTenant(db, tenantId, async (tx) => {
        await tx.insert(auditLog).values({
          tenantId,
          hanhDong: "ngat_ket_noi_thue",
          doiTuong: id,
          chiTiet: maskSensitive({ phase: "disconnect" }),
        });
      });
      return c.json({ ok: true });
    } finally {
      await close();
    }
  });

  return r;
}

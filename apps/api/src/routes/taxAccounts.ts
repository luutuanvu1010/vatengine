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
  type PeriodWindow,
  type VatSyncQueueMessage,
  buildAuditMessages,
  buildBackfillMessages,
  buildDetailMessages,
  buildSyncMessages,
  currentPeriodWindow,
  listInvoicesMissingLines,
  monthlyWindows,
} from "@vat/sync";
import { and, count, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { isUuid, requireTenant } from "../auth";
import { HAN_MUC_MAC_DINH, type HanMucGoi, docHanMucGoi } from "../goiDichVuConfig";
import { isQueueRateLimited, resolveBackfillLinesPaceMs, sendBatchesPaced } from "../queueEnqueue";
import { requireRole } from "../rbac";
import type { AppDeps, AppEnv } from "../types";

// Sự cố Queue 429 (2026-07-17): mọi producer bọc enqueue để 429 (vượt 5.000 msg/giây
// /queue) → 503 `sync_busy` CÓ KIỂM SOÁT, KHÔNG để thành 500 trần trụi (hồi quy nút
// "Đồng bộ ngay"). Log CRITICAL (đã mask) để giám sát phát hiện sớm, không đợi người báo.
function logQueueBusy(route: string, tenantId: string): void {
  console.error(`[vat-api] CRITICAL queue 429 (sync_busy) route=${route} tenant=${tenantId}`);
}

// U23-D2 — username tài khoản chính auto = MST gốc (không nhận từ body). Body chỉ tùy chọn
// `loai`; `username` chỉ dùng cho tài khoản CON khi module bật.
const registerSchema = z.object({
  username: z.string().min(1).optional(),
  loai: z.enum(["chinh", "con"]).optional(),
});

// U26 — trần message backfill dòng hàng / một lần gọi trigger: 4000 msg = 40 sendBatch
// (≤100 msg/batch) — vừa ngân sách 50 subrequest/lần gọi Workers Free, có lề cho DB.
export const MAX_BACKFILL_LINES_MOI_LAN = 4000;

// U17a — Hạn mức số tài khoản thuế / tenant, ĐỌC THEO GÓI DỊCH VỤ (thay hardcode cũ).
// Giữ nguyên CHỮ KÝ đồng bộ để không vỡ call-site; hạn mức đã được `docHanMucGoi` đọc
// và kẹp biên từ trước, hàm này chỉ lấy ra.
export function getGioiHanTkThue(hanMuc: HanMucGoi): number {
  return hanMuc.soMstToiDa;
}

// U17a — Cờ module tài khoản con nay theo GÓI (thay hằng TẮT cứng). Gói `free` để false.
export function isSubAccountEnabled(hanMuc: HanMucGoi): boolean {
  return hanMuc.choTaiKhoanCon;
}

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

// U22 — body backfill: khoảng lọc YYYY-MM-DD (chỉ kiểm ĐỊNH DẠNG ở đây; monthlyWindows
// fail-loud với khoảng đảo ngược / ngày phi thực tế → 400).
const backfillSchema = z.object({
  tuNgay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "tuNgay phải YYYY-MM-DD"),
  denNgay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "denNgay phải YYYY-MM-DD"),
  // force: re-sync MỌI tháng trong khoảng, BỎ QUA coverage "đã phủ". Dùng để lấy lại
  // phần production hụt (GDT 429/subrequest làm phiên cũ ghi thiếu) — upsert idempotent
  // hợp thêm, không nhân đôi. Mặc định false = hành vi cũ (chỉ tháng còn thiếu).
  force: z.boolean().optional().default(false),
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

    const tenantId = c.get("tenantId");
    const { db, close } = await deps.getDb(c.env);
    try {
      const outcome = await withTenant(db, tenantId, async (tx) => {
        const trows = await tx
          .select({ mst: tenants.mst, goiDichVu: tenants.goiDichVu })
          .from(tenants)
          .where(eq(tenants.id, tenantId));
        const tenant = trows[0];

        // Review Task 5, việc 2 — khôi phục thứ tự ưu tiên TRƯỚC Task 5: kiểm cờ module
        // tài khoản CON phải thắng TRƯỚC KHI xác định mst_missing/username, để request
        // loai=con khi module tắt luôn nhận sub_account_disabled bất kể MST/username thế
        // nào (không phụ thuộc thứ tự đọc dữ liệu khác trong transaction). Tenant không có
        // bản ghi (hiếm — không có gói để đọc) dùng mặc định bảo thủ (choTaiKhoanCon=false)
        // nên vẫn chặn CON đúng tinh thần fail-safe-to-DEFAULT.
        const hanMuc = tenant ? await docHanMucGoi(tx, tenant.goiDichVu) : HAN_MUC_MAC_DINH;
        if (loai === "con" && !isSubAccountEnabled(hanMuc)) {
          return { kind: "sub_disabled" as const };
        }
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

        // Hạn mức theo gói — đếm tài khoản thuế hiện có của tenant.
        const cnt = await tx
          .select({ n: count() })
          .from(taiKhoanThue)
          .where(eq(taiKhoanThue.tenantId, tenantId));
        if (Number(cnt[0]?.n ?? 0) >= getGioiHanTkThue(hanMuc)) {
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
        case "sub_disabled":
          return c.json({ error: "sub_account_disabled" }, 400);
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
      try {
        await queue.sendBatch(msgs.map((body) => ({ body })));
      } catch (err) {
        if (isQueueRateLimited(err)) {
          logQueueBusy("sync", tenantId);
          return c.json({ error: "sync_busy" }, 503);
        }
        throw err;
      }
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
        // Chia lô ≤100 msg (giới hạn sendBatch Cloudflare Queues) + GIÃN NHỊP giữa các
        // lô để burst không tự chạm trần 5.000 msg/giây/queue (sự cố 429 2026-07-17) —
        // enqueue TRƯỚC, audit SAU (mirror thứ tự B5: không audit cho việc chưa xảy ra).
        const msgs = buildDetailMessages({ tenantId, taikhoanId: id }, candidates);
        try {
          await sendBatchesPaced(
            (batch) => queue.sendBatch(batch),
            msgs,
            resolveBackfillLinesPaceMs(c.env),
          );
        } catch (err) {
          if (isQueueRateLimited(err)) {
            logQueueBusy("backfill-lines", tenantId);
            return c.json({ error: "sync_busy" }, 503);
          }
          throw err;
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

  // POST /tax-accounts/:id/backfill — U22, đường mặc định đổi sang DELTA (Task 7, spec
  // 2026-07-26, docs/CHAN-DOAN-thieu-hoa-don-thang.md): KHÔNG còn tính "tháng còn thiếu"
  // qua coverage nhị phân (missingMonths/lan_dong_bo — lỗ hổng A2 từng gây kẹt sau 6802 vì
  // một chiều "hoàn thành" che tháng thật ra bị hụt). Mặc định enqueue MỘT job audit
  // (kind:"audit", vong:0 — buildAuditMessages) mỗi (tháng × chiều) trong khoảng; audit rẻ
  // (1-2 request GDT) tự quyết đủ/hụt ở sync-worker (Task 6). `force:true` giữ đường LEGACY
  // cũ (buildBackfillMessages, header không `kind`, full-month) để re-sync toàn phần khi
  // cần. Tạo BackfillTracker DO (B4) để GET /backfill/:id theo dõi. API chỉ PRODUCER
  // (stateless). Token phải CÒN HẠN (409 — job nền KHÔNG tự đăng nhập). Cách ly tenant
  // (404). Audit (AC7).
  r.post("/:id/backfill", async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id)) return c.json({ error: "bad_request" }, 400);
    const queue = c.env.SYNC_QUEUE;
    if (!queue) return c.json({ error: "sync_unavailable" }, 503);
    if (!c.env.BACKFILL_TRACKER) return c.json({ error: "backfill_unavailable" }, 503);

    const parsed = backfillSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "bad_request" }, 400);
    let windows: PeriodWindow[];
    try {
      windows = monthlyWindows(parsed.data.tuNgay, parsed.data.denNgay);
    } catch (_e) {
      return c.json({ error: "bad_request" }, 400); // khoảng đảo ngược / ngày phi thực tế
    }

    const tenantId = c.get("tenantId");
    const directions = ["purchase", "sold"] as const;
    const { db, close } = await deps.getDb(c.env);
    try {
      // Nạp tài khoản + kiểm token trong MỘT withTenant (cách ly tenant lớp 1 tường minh
      // + RLS lớp 2). KHÔNG giữ transaction mở khi enqueue/gọi DO sau đó.
      const outcome = await withTenant(db, tenantId, async (tx) => {
        const rows = await tx
          .select({ tokenHetHan: taiKhoanThue.tokenHetHan })
          .from(taiKhoanThue)
          .where(and(eq(taiKhoanThue.id, id), eq(taiKhoanThue.tenantId, tenantId)));
        const acc = rows[0];
        if (!acc) return { kind: "not_found" as const };
        if (!acc.tokenHetHan || acc.tokenHetHan.getTime() <= Date.now()) {
          return { kind: "token_het_han" as const };
        }
        // Delta-sync (spec 2026-07-26): mặc định KHÔNG bỏ tháng đã phủ nữa — mỗi tháng một
        // job audit rẻ (1–2 request GDT) tự quyết đủ/hụt; coverage nhị phân là lỗ hổng A2
        // đã gây kẹt 6802 (docs/CHAN-DOAN). force giữ đường legacy full-month.
        const msgs: VatSyncQueueMessage[] = parsed.data.force
          ? directions.flatMap((dir) =>
              buildBackfillMessages({ tenantId, taikhoanId: id }, windows, [dir]),
            )
          : buildAuditMessages({ tenantId, taikhoanId: id }, windows, [...directions]);
        return { kind: "ok" as const, msgs, months: windows.map((w) => w.period) };
      });

      if (outcome.kind === "not_found") return c.json({ error: "not_found" }, 404);
      if (outcome.kind === "token_het_han") return c.json({ error: "token_het_han" }, 409);

      // Lý thuyết: monthlyWindows luôn trả ≥1 cửa sổ cho khoảng hợp lệ (kiểm ở trên) nên
      // months rỗng KHÔNG xảy ra trên đường này — giữ nhánh phòng thủ (fail-safe), KHÔNG
      // tạo backfill/tracker mồ côi nếu giả định đó sai trong tương lai.
      if (outcome.months.length === 0) {
        return c.json({ backfillId: null, thangCanLay: [], tongSoThang: 0 }, 202);
      }

      const backfillId = crypto.randomUUID();
      // Thứ tự: ENQUEUE trước → INIT tracker sau. Lấy dữ liệu (job vào hàng đợi) là mục
      // tiêu chính của backfill; tracker chỉ tạo SAU khi job đã an toàn trong hàng đợi →
      // KHÔNG để lại tracker "mồ côi không có job" nếu enqueue lỗi (khi đó route ném → 500,
      // client không nhận backfillId nên không poll). Không có bù trừ 2 pha giữa queue↔DO;
      // thứ tự này chọn hệ quả an toàn nhất khi một trong hai lỗi.
      try {
        await queue.sendBatch(outcome.msgs.map((body) => ({ body })));
      } catch (err) {
        // Queue 429 (2026-07-17): enqueue lỗi TRƯỚC init → không để tracker mồ côi;
        // 503 sync_busy CÓ KIỂM SOÁT thay vì 500 (client thử lại sau).
        if (isQueueRateLimited(err)) {
          logQueueBusy("backfill", tenantId);
          return c.json({ error: "sync_busy" }, 503);
        }
        throw err;
      }
      await deps.getBackfillTracker(c.env, backfillId).init({
        tenantId,
        taikhoanId: id,
        months: outcome.months,
        directions: [...directions],
        createdAtMs: Date.now(),
        mode: parsed.data.force ? "force" : "delta",
      });
      // Audit khởi tạo backfill (AC7 — như hành động đồng bộ). KHÔNG đưa token vào chi tiết.
      await withTenant(db, tenantId, async (tx) => {
        await tx.insert(auditLog).values({
          tenantId,
          hanhDong: "backfill_khoi_tao",
          doiTuong: id,
          chiTiet: maskSensitive({
            backfillId,
            tongSoThang: outcome.months.length,
            tuNgay: parsed.data.tuNgay,
            denNgay: parsed.data.denNgay,
            force: parsed.data.force,
          }),
        });
      });
      return c.json(
        { backfillId, thangCanLay: outcome.months, tongSoThang: outcome.months.length },
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

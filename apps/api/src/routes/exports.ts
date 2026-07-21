// Route kết xuất hóa đơn (U7): tạo file xlsx/csv từ dữ liệu ĐÃ đồng bộ (KHÔNG gọi GDT),
// GHI ra R2, trả liên kết tải (chốt #1). Tải lại stream từ R2, GIỚI HẠN TENANT qua tiền
// tố key (chốt cách ly). Ghi audit "xuất dữ liệu" (chốt #4, security.md). Mọi truy vấn
// chạy trong `withTenant` (RLS lớp 2) + buildWhere lọc `tenant_id` tường minh (lớp 1).
import { maskSensitive } from "@vat/crypto";
import { auditLog, withTenant } from "@vat/db";
import {
  type ExportFormat,
  accountingCsvStream,
  accountingXlsxFromBatches,
  csvStreamWithLines,
  fetchLinesForInvoices,
  getProfile,
  invoiceToHtml,
  invoiceToXml,
  isExportFormat,
  isProfileId,
  iterateInvoices,
  toXlsxWithLinesFromBatches,
  zipStreamFromBatches,
} from "@vat/export";
import { exportSelectionSchema, invoiceFilterSchema } from "@vat/query";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { requireTenant } from "../auth";
import { requireRole } from "../rbac";
import type { AppDeps, AppEnv } from "../types";

// id đối tượng kết xuất: "<uuid>.<đuôi định dạng>". Đuôi khớp trực tiếp EXPORT_FORMATS
// (xml.zip/html.zip chứa dấu chấm) — escape để không hiểu nhầm "." là ký tự bất kỳ.
const EXPORT_ID_RE = new RegExp(
  `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(${["xlsx", "csv", "xml\\.zip", "html\\.zip"].join("|")})$`,
  "i",
);

// Trần body cho POST /exports (U30). 1000 uuid + khung JSON ≈ 40KB → 256KB rộng rãi
// cho ca hợp lệ, nhưng chặn sớm body vô lý trước khi tốn CPU parse.
const MAX_BODY_BYTES = 256 * 1024;

const CONTENT_TYPE: Record<ExportFormat, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv; charset=utf-8",
  "xml.zip": "application/zip",
  "html.zip": "application/zip",
};

// Key luôn mang tiền tố tenant → tải chỉ dựng key từ tenantId của CHÍNH người gọi ⇒
// một tenant không thể chạm object của tenant khác (cách ly — multi-tenant.md).
function exportKey(tenantId: string, id: string): string {
  return `exports/${tenantId}/${id}`;
}

// U30 — đọc danh sách dòng đã chọn từ body. NGUỒN DUY NHẤT cho cả /exports lẫn /convert:
// hai route phải hiểu "chọn dòng" y hệt nhau, chép logic sang nơi thứ hai là mời gọi
// lệch hành vi. Body vắng (client cũ) hoặc không phải JSON → coi như không chọn gì.
async function docChonDong(c: { req: { json: () => Promise<unknown> } }): Promise<
  { ok: true; ids?: string[] } | { ok: false }
> {
  const rawBody = await c.req.json().catch(() => ({}));
  const chon = exportSelectionSchema.safeParse(rawBody);
  return chon.success ? { ok: true, ids: chon.data.ids } : { ok: false };
}

export function exportsRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();

  // Mọi route cần JWT hợp lệ (security.md). tenantId lấy từ context (middleware).
  // RBAC (U8): KẾT XUẤT là hành động nhạy cảm (audit "export") → chỉ kế toán trưởng +
  // quản trị; vai `ke_toan` bị 403 (ma trận quyền U8-plan).
  r.use("*", requireTenant);
  r.use("*", requireRole("ke_toan_truong", "quan_tri"));

  // U30 — trần kích thước body, phòng thủ TƯỜNG MINH cho bề mặt mới (route nay đọc JSON).
  // Vì sao cần dù đã có MAX_EXPORT_IDS: trần số phần tử chỉ chặn SAU khi `c.req.json()`
  // đã đọc + parse xong toàn bộ body — body khổng lồ vẫn đốt CPU/RAM của Worker trước đó.
  // 256KB đủ rộng cho ca hợp lệ tối đa (1000 uuid ≈ 40KB) và vẫn chặn sớm mọi thứ vô lý.
  // Không dựa ngầm vào giới hạn mặc định của nền tảng Cloudflare (phát hiện review 2026-07-20).
  const chanBodyLon = bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (c) => c.json({ error: "payload_too_large" }, 413),
  });
  r.use("/", chanBodyLon);
  r.use("/convert", chanBodyLon);

  // POST /exports?format=xlsx|csv&<bộ lọc U6> — tạo file kết xuất (có side effect: ghi
  // R2 + audit) → dùng POST, không GET.
  //
  // U30 — body JSON TÙY CHỌN `{ ids?: string[] }` để xuất đúng các dòng người dùng đã
  // tick. Vì sao body chứ không phải query: hàng nghìn uuid không nhét được vào URL.
  // Mở rộng CỘNG THÊM: không body ⇒ hành vi cũ nguyên vẹn (client cũ không phải sửa).
  r.post("/", async (c) => {
    const format = c.req.query("format");
    // Nguồn định dạng hợp lệ = @vat/export (không hardcode lại — tránh nguồn sự thật thứ hai).
    if (!isExportFormat(format)) return c.json({ error: "bad_request" }, 400);
    const filter = invoiceFilterSchema.safeParse(c.req.query());
    if (!filter.success) return c.json({ error: "bad_request" }, 400);

    const chon = await docChonDong(c);
    if (!chon.ok) return c.json({ error: "bad_request" }, 400);
    const ids = chon.ids;

    // M2 (chốt 2026-07-20): có ids ⇒ BỎ QUA bộ lọc. Lựa chọn cụ thể hơn ý định; giao cả
    // hai sẽ cho file ít hơn con số "đã chọn N" đang hiển thị → mất niềm tin.
    // An toàn: buildWhere LUÔN gắn tenant_id trước, nên ids chỉ thu hẹp, không mở rộng.
    const selection = ids ? { ids } : filter.data;

    const tenantId = c.get("tenantId");
    const id = `${crypto.randomUUID()}.${format}`;
    const key = exportKey(tenantId, id);
    const storage = deps.getStorage(c.env);
    const { db, close } = await deps.getDb(c.env);
    try {
      await withTenant(db, tenantId, async (tx) => {
        // Dòng hàng (dong_hang_hoa) nạp theo lô, LỌC tenant_id tường minh (U23-B, cách ly
        // tenant — multi-tenant.md). Dùng chung cho csv/xlsx/xml.zip/html.zip.
        const fetchLines = (ids: string[]) => fetchLinesForInvoices(tx, tenantId, ids);
        // CSV/xml.zip/html.zip: stream thẳng vào R2 (không giữ cả file trong RAM). XLSX:
        // gom (bản chất zip) nhưng tiêu thụ generator lô-by-lô, không nạp cả tập ORM cùng lúc.
        if (format === "csv") {
          // MỘT sheet phẳng (2026-07-21): mỗi mặt hàng một dòng, kèm đủ ngữ cảnh hóa đơn.
          // Một pass qua generator hóa đơn + fetchLines lô-by-lô.
          const batches = iterateInvoices(tx, tenantId, selection);
          await storage.put(key, csvStreamWithLines(batches, fetchLines));
        } else if (format === "xml.zip" || format === "html.zip") {
          const batches = iterateInvoices(tx, tenantId, selection);
          const render =
            format === "xml.zip"
              ? (
                  row: Parameters<typeof invoiceToXml>[0],
                  lines: Parameters<typeof invoiceToXml>[1],
                ) => ({
                  content: invoiceToXml(row, lines),
                  ext: "xml",
                })
              : (
                  row: Parameters<typeof invoiceToHtml>[0],
                  lines: Parameters<typeof invoiceToHtml>[1],
                ) => ({
                  content: invoiceToHtml(row, lines),
                  ext: "html",
                });
          await storage.put(key, zipStreamFromBatches(batches, fetchLines, render));
        } else {
          // XLSX: sheet "HoaDon" + sheet "Chi tiết dòng hàng" (U23-B).
          const batches = iterateInvoices(tx, tenantId, selection);
          await storage.put(key, await toXlsxWithLinesFromBatches(batches, fetchLines));
        }
        // Audit "xuất dữ liệu" (append). KHÔNG log raw_json/token (security.md). U12:
        // mask chi_tiet — filter tự do (vd nbmst) có thể chứa giá trị nhạy cảm.
        // U30: ghi SỐ LƯỢNG id đã chọn, KHÔNG ghi danh sách id (audit log để truy vết
        // hành động, không phải để nhân bản dữ liệu nghiệp vụ). Vắng trường này ⇒ xuất
        // theo bộ lọc — hai chế độ phân biệt được khi soi log.
        await tx.insert(auditLog).values({
          tenantId,
          hanhDong: "export",
          doiTuong: format,
          chiTiet: maskSensitive({
            key,
            filter: ids ? undefined : filter.data,
            soIdDaChon: ids?.length,
          }),
        });
      });
    } finally {
      await close();
    }
    return c.json({ id, key, url: `/exports/${id}` }, 201);
  });

  // POST /exports/convert?profile=<id>&format=xlsx|csv&<bộ lọc U6> — ÁNH XẠ hóa đơn sang
  // định dạng nhập liệu phần mềm kế toán theo PROFILE (U11). Dùng chung hạ tầng U7: keyset
  // streaming + R2 (tiền tố tenant) + audit. profile CHƯA KIỂM CHỨNG (chưa khả dụng) → 400.
  // Tải lại qua GET /exports/:id (id là <uuid>.<fmt> — cùng keyspace).
  r.post("/convert", async (c) => {
    const profileId = c.req.query("profile");
    // Nguồn profile hợp lệ = @vat/export registry (không hardcode; không phục vụ layout
    // CHƯA KIỂM CHỨNG — Nguyên tắc bằng chứng).
    if (!isProfileId(profileId)) return c.json({ error: "bad_request" }, 400);
    const format = c.req.query("format");
    if (!isExportFormat(format)) return c.json({ error: "bad_request" }, 400);
    const filter = invoiceFilterSchema.safeParse(c.req.query());
    if (!filter.success) return c.json({ error: "bad_request" }, 400);

    // U30b — /convert tôn trọng dòng đã chọn y hệt /exports. Người dùng tick vài hóa đơn
    // rồi bấm convert phải nhận đúng những dòng đó, không phải cả bộ lọc.
    const chon = await docChonDong(c);
    if (!chon.ok) return c.json({ error: "bad_request" }, 400);
    const ids = chon.ids;
    const selection = ids ? { ids } : filter.data; // M2: có ids ⇒ bỏ qua bộ lọc

    const profile = getProfile(profileId);

    const tenantId = c.get("tenantId");
    const id = `${crypto.randomUUID()}.${format}`;
    const key = exportKey(tenantId, id);
    const storage = deps.getStorage(c.env);
    const { db, close } = await deps.getDb(c.env);
    try {
      await withTenant(db, tenantId, async (tx) => {
        const batches = iterateInvoices(tx, tenantId, selection);
        if (format === "csv") {
          await storage.put(key, accountingCsvStream(profile, batches));
        } else {
          await storage.put(key, await accountingXlsxFromBatches(profile, batches));
        }
        // Audit "xuất dữ liệu" cho convert (append; security.md). doiTuong = profile id.
        // U12: mask chi_tiet như route export.
        await tx.insert(auditLog).values({
          tenantId,
          hanhDong: "convert",
          doiTuong: profileId,
          chiTiet: maskSensitive({
            key,
            format,
            filter: ids ? undefined : filter.data,
            soIdDaChon: ids?.length,
          }),
        });
      });
    } finally {
      await close();
    }
    return c.json({ id, key, url: `/exports/${id}`, profile: profileId }, 201);
  });

  // GET /exports/:id — tải file từ R2, giới hạn tenant qua tiền tố key.
  r.get("/:id", async (c) => {
    const id = c.req.param("id");
    if (!EXPORT_ID_RE.test(id)) return c.json({ error: "bad_request" }, 400);

    const tenantId = c.get("tenantId");
    const key = exportKey(tenantId, id);
    const bytes = await deps.getStorage(c.env).get(key);
    if (!bytes) return c.json({ error: "not_found" }, 404);

    // Đuôi dài (xml.zip/html.zip) khớp trước đuôi ngắn (csv) để không cắt nhầm.
    const format: ExportFormat = id.endsWith(".xml.zip")
      ? "xml.zip"
      : id.endsWith(".html.zip")
        ? "html.zip"
        : id.endsWith(".xlsx")
          ? "xlsx"
          : "csv";
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": CONTENT_TYPE[format],
        "Content-Disposition": `attachment; filename="hoadon-${id}"`,
      },
    });
  });

  return r;
}

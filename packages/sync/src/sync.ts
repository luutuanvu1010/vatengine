import { hoaDon, lanDongBo, withTenant } from "@vat/db";
import { GdtError, queryInvoices } from "@vat/gdt-client";
import type { GdtTransport, InvoiceDirection, InvoiceRow, RetryOptions } from "@vat/gdt-client";
// Dịch vụ đồng bộ idempotent (U5). Gọi adapter lấy hóa đơn MỘT chiều trong MỘT
// khoảng ngày → upsert vào `hoa_don` theo khóa tự nhiên 6 trường (trong `withTenant`
// để RLS chốt tenant) → ghi MỘT bản ghi `lan_dong_bo`. Hàm thư viện, PHI TRẠNG THÁI:
// nhận `token` qua tham số (KHÔNG tự đăng nhập, KHÔNG persist credential — U12);
// KHÔNG gọi `fetch()` GDT trực tiếp (chỉ qua adapter). Đồng bộ nền/lịch là U9.
// Xem CLAUDE.md, .claude/rules/{multi-tenant,gdt-adapter,security}.md, docs/plans/U5-plan.md.
import { and, eq, inArray } from "drizzle-orm";
import type { TablesRelationalConfig } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import { mapInvoiceRowToHoaDon } from "./mapInvoice";

type NewHoaDon = typeof hoaDon.$inferInsert;

// Mirror chữ ký generic của `withTenant` để nhận mọi client Drizzle Postgres
// (PGlite trong test, pg/Hyperdrive khi chạy) mà không cần `any`.
type Db<
  TQuery extends PgQueryResultHKT,
  TFull extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
> = PgDatabase<TQuery, TFull, TSchema>;
type Tx<
  TQuery extends PgQueryResultHKT,
  TFull extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
> = PgTransaction<TQuery, TFull, TSchema>;

/** Một thay đổi trạng thái phát hiện được giữa hai lần đồng bộ (nền cho unit thông
 * báo sau — quyết định #A: U5 chỉ PHÁT HIỆN, không persist bảng thông báo). */
export interface InvoiceChange {
  naturalKey: string;
  ttxlyCu: number | null;
  ttxlyMoi: number | null;
  tthaiCu: number | null;
  tthaiMoi: number | null;
}

export interface SyncOptions<
  TQuery extends PgQueryResultHKT = PgQueryResultHKT,
  TFull extends Record<string, unknown> = Record<string, unknown>,
  TSchema extends TablesRelationalConfig = TablesRelationalConfig,
> {
  db: Db<TQuery, TFull, TSchema>;
  transport: GdtTransport;
  /** Token JWT GDT — nhận từ ngoài (U1). KHÔNG persist, KHÔNG log. */
  token: string;
  tenantId: string;
  /** FK `lan_dong_bo.taikhoan_id` (NOT NULL). */
  taikhoanId: string;
  direction: InvoiceDirection;
  /** Khoảng ngày, định dạng dd/mm/yyyy (khớp adapter). */
  dateFrom: string;
  dateTo: string;
  statuses?: number[];
  includeSco?: boolean;
  size?: number;
  retry?: RetryOptions;
}

export interface SyncResult {
  lanDongBoId: string;
  soHdMoi: number;
  soHdCapNhat: number;
  trangThai: "completed" | "failed";
  thongDiepLoi?: string;
  /**
   * Phân loại lỗi (chỉ khi `trangThai === "failed"`) để tầng điều phối nền (U9)
   * quyết định RETRY hay không mà KHÔNG phải dò chuỗi `thongDiepLoi` (mong manh):
   * - `session_expired`: 401/hết phiên — token đã chết, KHÔNG retry (báo đăng nhập lại).
   * - `transient`: lỗi tạm (mạng/5xx/DB) — nên retry qua hàng đợi.
   * `sync()` đã tự retry cấp adapter (5xx/timeout) trước khi trả về; nhãn này dành
   * cho vòng retry cấp job (Queue) của U9.
   */
  failureKind?: "session_expired" | "transient";
  changes: InvoiceChange[];
}

/** Khóa tự nhiên trong phạm vi một tenant (5 trường; `tenant_id` cố định theo phiên
 * đồng bộ). `tdlap` dùng thời khắc UTC chuẩn hóa để so khớp ổn định. */
function naturalKeyOf(m: {
  nbmst: string;
  khmshdon: string;
  khhdon: string;
  shdon: string;
  tdlap: Date;
}): string {
  return [m.nbmst, m.khmshdon, m.khhdon, m.shdon, m.tdlap.toISOString()].join("|");
}

function parseDdmmyyyy(s: string): Date {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  const d = m
    ? new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])))
    : new Date(Number.NaN);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Khoảng ngày đồng bộ không đúng định dạng dd/mm/yyyy: ${s}`);
  }
  return d;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Phân loại lỗi cho `SyncResult.failureKind`. Chỉ 401/hết phiên là `session_expired`
 * (token chết, không retry); mọi lỗi còn lại coi là `transient` (mạng/5xx/DB — retry
 * cấp job an toàn, có trần lần thử của hàng đợi làm chốt chặn). */
function classifyFailure(err: unknown): "session_expired" | "transient" {
  return err instanceof GdtError && err.code === "SESSION_EXPIRED"
    ? "session_expired"
    : "transient";
}

/** Upsert idempotent một lô hóa đơn cho một tenant, trong transaction đã đặt ngữ
 * cảnh tenant. So khớp theo khóa tự nhiên; đếm mới/cập nhật; gom thay đổi trạng thái. */
async function upsertBatch<
  TQuery extends PgQueryResultHKT,
  TFull extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
>(
  tx: Tx<TQuery, TFull, TSchema>,
  tenantId: string,
  rows: InvoiceRow[],
): Promise<{ soHdMoi: number; soHdCapNhat: number; changes: InvoiceChange[] }> {
  // Ánh xạ + khử trùng trong lô theo khóa tự nhiên (adapter đã khử 5 trường; phòng hờ).
  const byKey = new Map<string, NewHoaDon>();
  for (const r of rows) {
    const mapped = mapInvoiceRowToHoaDon(r, tenantId);
    byKey.set(naturalKeyOf(mapped), mapped);
  }
  if (byKey.size === 0) return { soHdMoi: 0, soHdCapNhat: 0, changes: [] };

  // Lấy bản ghi hiện có: lọc TƯỜNG MINH theo tenant_id (multi-tenant.md) + thu hẹp
  // theo tập `shdon` của lô; khớp chính xác khóa tự nhiên đầy đủ trong bộ nhớ.
  const shdons = [...new Set([...byKey.values()].map((m) => m.shdon))];
  const existing = await tx
    .select()
    .from(hoaDon)
    .where(and(eq(hoaDon.tenantId, tenantId), inArray(hoaDon.shdon, shdons)));
  const existingByKey = new Map(existing.map((e) => [naturalKeyOf(e), e]));

  let soHdMoi = 0;
  let soHdCapNhat = 0;
  const changes: InvoiceChange[] = [];
  const toInsert: NewHoaDon[] = [];

  for (const [key, m] of byKey) {
    const ex = existingByKey.get(key);
    if (!ex) {
      toInsert.push(m);
      soHdMoi += 1;
      continue;
    }
    const ttxlyCu = ex.ttxly ?? null;
    const ttxlyMoi = m.ttxly ?? null;
    const tthaiCu = ex.tthai ?? null;
    const tthaiMoi = m.tthai ?? null;
    // "Thay đổi" = trạng thái xử lý/hóa đơn đổi (đúng ca (b)/(e)). Hóa đơn đã phát
    // hành là bất biến về tiền; điều chỉnh tạo hóa đơn mới (shdon khác) → không xét
    // tiền ở đây để giữ đếm cập nhật khớp ngữ nghĩa "trạng thái đổi".
    if (ttxlyCu !== ttxlyMoi || tthaiCu !== tthaiMoi) {
      await tx
        .update(hoaDon)
        .set({
          ttxly: m.ttxly,
          tthai: m.tthai,
          ncnhat: m.ncnhat,
          tgtcthue: m.tgtcthue,
          tgtthue: m.tgtthue,
          tgtttbso: m.tgtttbso,
          ttcktmai: m.ttcktmai,
          tgia: m.tgia,
          dvtte: m.dvtte,
          rawJson: m.rawJson,
          updatedAt: new Date(),
        })
        // Lọc TƯỜNG MINH cả tenant_id (không chỉ id) — multi-tenant.md: mọi truy vấn
        // GHI phải gắn tenant_id, không chỉ dựa RLS. Phòng thủ theo chiều sâu nếu về
        // sau `ex` đến từ nguồn khác/không còn lọc theo tenant.
        .where(and(eq(hoaDon.id, ex.id), eq(hoaDon.tenantId, tenantId)));
      soHdCapNhat += 1;
      changes.push({ naturalKey: key, ttxlyCu, ttxlyMoi, tthaiCu, tthaiMoi });
    }
  }

  if (toInsert.length > 0) await tx.insert(hoaDon).values(toInsert);
  return { soHdMoi, soHdCapNhat, changes };
}

interface RunMeta {
  taikhoanId: string;
  chieu: InvoiceDirection;
  tuNgay: Date;
  denNgay: Date;
  batDau: Date;
}

/** Ghi bản ghi `lan_dong_bo` thất bại (transaction riêng để không bị cuốn theo
 * rollback của phần upsert) và trả `SyncResult` thất bại. */
async function recordFailed<
  TQuery extends PgQueryResultHKT,
  TFull extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
>(
  db: Db<TQuery, TFull, TSchema>,
  tenantId: string,
  meta: RunMeta,
  message: string,
  failureKind: "session_expired" | "transient",
): Promise<SyncResult> {
  const id = await withTenant(db, tenantId, async (tx) => {
    const inserted = await tx
      .insert(lanDongBo)
      .values({
        tenantId,
        taikhoanId: meta.taikhoanId,
        chieu: meta.chieu,
        tuNgay: meta.tuNgay,
        denNgay: meta.denNgay,
        soHdMoi: 0,
        soHdCapNhat: 0,
        trangThai: "failed",
        thongDiepLoi: message,
        batDau: meta.batDau,
        ketThuc: new Date(),
      })
      .returning({ id: lanDongBo.id });
    const row = inserted[0];
    if (!row) throw new Error("insert lan_dong_bo (failed) không trả về id");
    return row.id;
  });
  return {
    lanDongBoId: id,
    soHdMoi: 0,
    soHdCapNhat: 0,
    trangThai: "failed",
    thongDiepLoi: message,
    failureKind,
    changes: [],
  };
}

export async function sync<
  TQuery extends PgQueryResultHKT,
  TFull extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
>(opts: SyncOptions<TQuery, TFull, TSchema>): Promise<SyncResult> {
  const { db, transport, token, tenantId, taikhoanId, direction, dateFrom, dateTo } = opts;
  const meta: RunMeta = {
    taikhoanId,
    chieu: direction,
    tuNgay: parseDdmmyyyy(dateFrom),
    denNgay: parseDdmmyyyy(dateTo),
    batDau: new Date(),
  };

  // Bước 1 — lấy hóa đơn (chưa chạm DB). 401/lỗi ở đây → ghi thất bại, KHÔNG có ghi
  // dở dang vì chưa mở transaction ghi hóa đơn. 401 KHÔNG retry (adapter đã đảm bảo).
  let rows: InvoiceRow[];
  try {
    rows = await queryInvoices(
      transport,
      token,
      {
        direction,
        dateFrom,
        dateTo,
        statuses: opts.statuses,
        includeSco: opts.includeSco,
        size: opts.size,
      },
      opts.retry,
    );
  } catch (err) {
    return recordFailed(db, tenantId, meta, errMsg(err), classifyFailure(err));
  }

  // Bước 2 — upsert + ghi lịch sử NGUYÊN TỬ: mọi lỗi giữa chừng → rollback, không có
  // số đếm mà thiếu dữ liệu, không có hóa đơn ghi dở.
  try {
    return await withTenant(db, tenantId, async (tx) => {
      const { soHdMoi, soHdCapNhat, changes } = await upsertBatch(tx, tenantId, rows);
      const inserted = await tx
        .insert(lanDongBo)
        .values({
          tenantId,
          taikhoanId,
          chieu: direction,
          tuNgay: meta.tuNgay,
          denNgay: meta.denNgay,
          soHdMoi,
          soHdCapNhat,
          trangThai: "completed",
          batDau: meta.batDau,
          ketThuc: new Date(),
        })
        .returning({ id: lanDongBo.id });
      const row = inserted[0];
      if (!row) throw new Error("insert lan_dong_bo (completed) không trả về id");
      return {
        lanDongBoId: row.id,
        soHdMoi,
        soHdCapNhat,
        trangThai: "completed" as const,
        changes,
      };
    });
  } catch (err) {
    return recordFailed(db, tenantId, meta, errMsg(err), classifyFailure(err));
  }
}

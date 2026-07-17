import { TRANG_THAI_LAN_DONG_BO, hoaDon, lanDongBo, withTenant } from "@vat/db";
import { GdtError, pace, queryInvoices, toDetailRef } from "@vat/gdt-client";
import type {
  GdtTransport,
  InvoiceDetailRef,
  InvoiceDirection,
  InvoiceLine,
  InvoiceRow,
  RetryOptions,
} from "@vat/gdt-client";
// Dịch vụ đồng bộ idempotent (U5). Gọi adapter lấy hóa đơn MỘT chiều trong MỘT
// khoảng ngày → upsert vào `hoa_don` theo khóa tự nhiên 6 trường (trong `withTenant`
// để RLS chốt tenant) → ghi MỘT bản ghi `lan_dong_bo`. Hàm thư viện, PHI TRẠNG THÁI:
// nhận `token` qua tham số (KHÔNG tự đăng nhập, KHÔNG persist credential — U12);
// KHÔNG gọi `fetch()` GDT trực tiếp (chỉ qua adapter). Đồng bộ nền/lịch là U9.
// Xem CLAUDE.md, .claude/rules/{multi-tenant,gdt-adapter,security}.md, docs/plans/U5-plan.md.
import { and, eq, inArray, sql } from "drizzle-orm";
import type { TablesRelationalConfig } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import { persistInvoiceLines } from "./detailLines";
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
  /**
   * Pha 2 (tùy chọn) — lấy dòng hàng chi tiết cho mỗi hóa đơn. Điểm INJECT: production
   * truyền `adapterFetchDetail(transport, token, retry)` (getInvoiceDetail+mapDetailLines);
   * test truyền bản giả offline. KHÔNG truyền = chỉ đồng bộ header (hành vi U5 gốc).
   *
   * LƯU Ý (fallback tạm được §1.1 cho phép): hiện lấy detail ĐỒNG BỘ trong pha 1, tuần
   * tự (concurrency 1 — "không gọi song song dồn dập"), backoff do adapter. TODO chuyển
   * sang 2 pha thật qua queue (message `kind:"detail"`) khi mở rộng tới 100k tenant —
   * primitive `persistInvoiceLines` đã tách sẵn để migrate.
   */
  fetchDetail?: (ref: InvoiceDetailRef) => Promise<InvoiceLine[]>;
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
   * - `rate_limited`: 429 kiệt lượt retry cấp adapter (U25) — GDT đang giới hạn tốc độ;
   *   tầng job (U9) phải ĐẨY LÙI (backpressure, reenqueue có delay), KHÔNG retry thật
   *   tính `max_retries` (đập lại GDT đúng lúc đang bị chặn — vi phạm "tôn trọng máy
   *   chủ thuế").
   * - `transient`: lỗi tạm khác (mạng/5xx/DB) — nên retry qua hàng đợi.
   * `sync()` đã tự retry cấp adapter (5xx/429/timeout) trước khi trả về; nhãn này dành
   * cho vòng retry cấp job (Queue) của U9.
   */
  failureKind?: "session_expired" | "rate_limited" | "transient";
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

/** Phân loại lỗi cho `SyncResult.failureKind` (U25 mở rộng `rate_limited`):
 * - 401/hết phiên → `session_expired` (token chết, không retry).
 * - 429 kiệt lượt retry adapter (`GdtError.httpStatus === 429`) → `rate_limited`
 *   (tầng job phải backpressure, KHÔNG retry thật — xem doc `SyncResult.failureKind`).
 * - mọi lỗi còn lại → `transient` (mạng/5xx khác/DB — retry cấp job an toàn, có trần
 *   lần thử của hàng đợi làm chốt chặn). */
function classifyFailure(err: unknown): "session_expired" | "rate_limited" | "transient" {
  if (err instanceof GdtError && err.code === "SESSION_EXPIRED") return "session_expired";
  if (err instanceof GdtError && err.httpStatus === 429) return "rate_limited";
  return "transient";
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

  // Chèn các hàng "mới" (theo ảnh chụp SELECT) bằng UPSERT nguyên tử ở TẦNG DB thay
  // vì INSERT thuần: nếu một sync SONG SONG cùng (tenant,kỳ,chiều) đã chèn đúng khóa
  // tự nhiên GIỮA lúc ta SELECT và INSERT, INSERT thuần sẽ vỡ ràng buộc
  // `hoa_don_natural_key` → cả transaction rollback → ghi `failed` OAN dù dữ liệu đã có
  // (H-B.2). `ON CONFLICT DO UPDATE` (suy ra đúng ràng buộc khóa tự nhiên 6 trường) khử
  // đua: hàng của đối thủ được cập nhật giá trị mới nhất, không ném, không nhân đôi.
  // Cập nhật đúng cột biến đổi từ `excluded` (hàng đang chèn); `updated_at` = thời điểm
  // hiện tại. Cột bất biến (khóa tự nhiên, chieu/nguon, created_at) giữ nguyên.
  // Lưu ý (không chặn nghiệm thu): số đếm `soHdMoi/soHdCapNhat` tính từ ảnh chụp SELECT
  // TRƯỚC khi biết ON CONFLICT sẽ INSERT hay UPDATE. Trong khe đua hiếm, một hàng có thể
  // bị đếm 'mới' dù DB thực UPDATE và KHÔNG vào `changes`. Chấp nhận được: số đếm/`changes`
  // là chỉ báo (telemetry/thông báo), không phải chốt tính đúng dữ liệu — dữ liệu vẫn đúng.
  if (toInsert.length > 0) {
    await tx
      .insert(hoaDon)
      .values(toInsert)
      .onConflictDoUpdate({
        target: [
          hoaDon.tenantId,
          hoaDon.nbmst,
          hoaDon.khmshdon,
          hoaDon.khhdon,
          hoaDon.shdon,
          hoaDon.tdlap,
        ],
        set: {
          ttxly: sql`excluded.ttxly`,
          tthai: sql`excluded.tthai`,
          ncnhat: sql`excluded.ncnhat`,
          tgtcthue: sql`excluded.tgtcthue`,
          tgtthue: sql`excluded.tgtthue`,
          tgtttbso: sql`excluded.tgtttbso`,
          ttcktmai: sql`excluded.ttcktmai`,
          tgia: sql`excluded.tgia`,
          dvtte: sql`excluded.dvtte`,
          rawJson: sql`excluded.raw_json`,
          updatedAt: new Date(),
        },
      });
  }
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
  failureKind: "session_expired" | "rate_limited" | "transient",
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
        trangThai: TRANG_THAI_LAN_DONG_BO.THAT_BAI,
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
    trangThai: TRANG_THAI_LAN_DONG_BO.THAT_BAI,
    thongDiepLoi: message,
    failureKind,
    changes: [],
  };
}

/**
 * Pha 2 — resolve `hoadon_id` cho từng hóa đơn trong lô (sau upsert header) rồi lưu
 * dòng hàng idempotent. Chạy TRONG transaction upsert (nguyên tử: lỗi giữa chừng →
 * rollback cả header lẫn dòng). Detail đã được lấy TRƯỚC khi mở transaction (không
 * giữ transaction mở trong lúc gọi mạng).
 */
async function persistLinesForBatch<
  TQuery extends PgQueryResultHKT,
  TFull extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
>(
  tx: Tx<TQuery, TFull, TSchema>,
  tenantId: string,
  rows: InvoiceRow[],
  linesByKey: Map<string, InvoiceLine[]>,
): Promise<void> {
  const shdons = [...new Set(rows.map((r) => String(r.shdon ?? "")))];
  if (shdons.length === 0) return;
  // Lọc TƯỜNG MINH theo tenant_id (multi-tenant.md) + thu hẹp theo shdon của lô.
  const persisted = await tx
    .select()
    .from(hoaDon)
    .where(and(eq(hoaDon.tenantId, tenantId), inArray(hoaDon.shdon, shdons)));
  const idByKey = new Map(persisted.map((e) => [naturalKeyOf(e), e.id]));

  const done = new Set<string>();
  for (const row of rows) {
    const key = naturalKeyOf(mapInvoiceRowToHoaDon(row, tenantId));
    const hoaDonId = idByKey.get(key);
    if (!hoaDonId || done.has(hoaDonId)) continue; // không thấy (bất thường) / đã xử lý
    done.add(hoaDonId);
    await persistInvoiceLines(tx, tenantId, hoaDonId, linesByKey.get(key) ?? []);
  }
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

  // Bước 1b (tùy chọn) — lấy dòng hàng chi tiết TRƯỚC khi mở transaction ghi (không
  // giữ transaction mở khi gọi mạng). Tuần tự (concurrency 1) — "không gọi song song
  // dồn dập" (gdt-adapter.md). 401 → session_expired (token chết, không retry); 5xx/
  // timeout → transient. KHÔNG log giá trị dòng hàng (security.md).
  //
  // GIỚI HẠN ĐÃ BIẾT (không tuyên bố sai — Nguyên tắc bằng chứng): trong fallback
  // đồng bộ này, detail KHÔNG đi qua TenantLimiter theo TỪNG request. runJob (U9)
  // chỉ tiêu 1 permit token-bucket cho cả job, nên rate-respect ở cấp JOB dựa vào:
  // (1) tuần tự concurrency 1, (2) backoff của adapter khi lỗi. Rate-limit theo từng
  // request detail là phần của kiến trúc queue 2 pha thật (mỗi message detail tự lấy
  // permit) — đó là nội dung của TODO chuyển queue ở SyncOptions.fetchDetail.
  let linesByKey: Map<string, InvoiceLine[]> | undefined;
  if (opts.fetchDetail) {
    linesByKey = new Map();
    try {
      let first = true;
      for (const row of rows) {
        // Giãn nhịp giữa các lần lấy detail TRỪ lần đầu (U25 AC3 — cùng cơ chế `pace`
        // với phân trang header). `retry.minIntervalMs` không đặt/0 → không chờ.
        if (!first) {
          await pace(opts.retry?.minIntervalMs, opts.retry?.sleepFn);
        }
        first = false;
        const lines = await opts.fetchDetail(toDetailRef(row));
        linesByKey.set(naturalKeyOf(mapInvoiceRowToHoaDon(row, tenantId)), lines);
      }
    } catch (err) {
      return recordFailed(db, tenantId, meta, errMsg(err), classifyFailure(err));
    }
  }

  // Bước 2 — upsert header + persist dòng hàng + ghi lịch sử NGUYÊN TỬ: mọi lỗi giữa
  // chừng → rollback, không có số đếm mà thiếu dữ liệu, không có hóa đơn/dòng ghi dở.
  try {
    return await withTenant(db, tenantId, async (tx) => {
      const { soHdMoi, soHdCapNhat, changes } = await upsertBatch(tx, tenantId, rows);
      if (linesByKey) await persistLinesForBatch(tx, tenantId, rows, linesByKey);
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
          trangThai: TRANG_THAI_LAN_DONG_BO.HOAN_THANH,
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
        trangThai: TRANG_THAI_LAN_DONG_BO.HOAN_THANH,
        changes,
      };
    });
  } catch (err) {
    return recordFailed(db, tenantId, meta, errMsg(err), classifyFailure(err));
  }
}

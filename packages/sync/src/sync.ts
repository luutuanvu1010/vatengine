import { TRANG_THAI_LAN_DONG_BO, dongHangHoa, hoaDon, lanDongBo, withTenant } from "@vat/db";
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
   * Đường INLINE lấy dòng hàng (tùy chọn) — TEST/công cụ offline dùng; production U26
   * KHÔNG truyền nữa. KHÔNG truyền = chỉ đồng bộ header + trả `detailCandidates` để
   * tầng nền enqueue message `kind:"detail"` (queue 2 pha thật — mỗi message 1 hóa
   * đơn, 1 permit TenantLimiter/request, xem apps/sync-worker/src/runDetailJob.ts).
   * Lý do bỏ inline ở production: fetch tuần tự ~2000 HĐ trong MỘT lần gọi Worker
   * vượt trần subrequest Free + đập 429 vào GDT (bằng chứng prod — BACKLOG 2026-07-16).
   */
  fetchDetail?: (ref: InvoiceDetailRef) => Promise<InvoiceLine[]>;
}

/**
 * U26 (pha 1) — một ứng viên cần lấy dòng hàng ở pha 2: hóa đơn MỚI hoặc ĐỔI TRẠNG
 * THÁI trong lượt đồng bộ này. `ref` khớp `InvoiceDetailRef` (4 trường định danh đã
 * kiểm chứng + nguồn normal|sco); `hoaDonId` để persist xóa-chèn đúng đích. Tầng nền
 * (sync-worker) enqueue 1 message `kind:"detail"` / candidate — sync() KHÔNG tự đụng
 * queue (giữ package thuần thư viện, không phụ thuộc binding Cloudflare).
 */
export interface DetailCandidate {
  hoaDonId: string;
  ref: {
    nbmst: string;
    khhdon: string;
    khmshdon: string;
    shdon: string;
    source: "normal" | "sco";
  };
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
   * - `local_limit`: chạm TRẦN NỀN TẢNG của gói Workers (vd 50 subrequest/invocation
   *   trên Free) — retry được, nhưng **KHÔNG nói lên sức khỏe GDT** (có thể xảy ra
   *   trước cả khi chạm GDT) ⇒ tầng job KHÔNG được tính vào circuit breaker.
   * `sync()` đã tự retry cấp adapter (5xx/429/timeout) trước khi trả về; nhãn này dành
   * cho vòng retry cấp job (Queue) của U9.
   */
  failureKind?: "session_expired" | "rate_limited" | "transient" | "local_limit";
  changes: InvoiceChange[];
  /** U26 — hóa đơn cần lấy dòng hàng pha 2 (mới/đổi trạng thái). Rỗng khi failed. */
  detailCandidates: DetailCandidate[];
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

/**
 * Số hàng hoa_don tối đa cho MỘT câu INSERT (chia lô — sự cố 2026-07-18). 200 hàng ×
 * 21 tham số = 4.200 tham số/câu, xa trần 65.535 của giao thức Postgres; đồng thời ghìm
 * kích thước câu lệnh (raw_json vài KB/hóa đơn). Con số là TRẦN AN TOÀN chọn theo suy
 * luận, CHƯA đo ngưỡng thật của Hyperdrive/Neon — chỉnh khi có số đo.
 */
export const INSERT_CHUNK_SIZE = 200;

// Trần mỗi PHẦN message + trần TOÀN chuỗi khi tóm tắt lỗi (tomTatLoi).
const LOI_MAX_PHAN = 400;
const LOI_MAX_TONG = 2000;

/**
 * Tóm tắt lỗi để ghi `thong_diep_loi` — SỰ CỐ 2026-07-18: Drizzle ném DrizzleQueryError
 * với `message` = TOÀN BỘ SQL + tham số (kể cả `raw_json`) — production đã lưu một
 * thông điệp 11.476.737 ký tự vào `lan_dong_bo`, còn nguyên nhân PG thật (trong
 * `cause`) thì mất. Quy tắc: cắt TỪNG PHẦN (không cắt đuôi cả chuỗi — nguyên nhân gốc
 * nằm CUỐI chain), nối tối đa 3 tầng cause, chặn trần tổng. Cũng là chốt security.md:
 * không dump `raw_json` vào bảng vết.
 */
export function tomTatLoi(err: unknown): string {
  const phan: string[] = [];
  let cur: unknown = err;
  const daGap = new Set<unknown>();
  while (cur instanceof Error && phan.length < 3 && !daGap.has(cur)) {
    daGap.add(cur);
    phan.push(
      cur.message.length > LOI_MAX_PHAN
        ? `${cur.message.slice(0, LOI_MAX_PHAN)}… [cắt bớt từ ${cur.message.length} ký tự]`
        : cur.message,
    );
    cur = cur.cause;
  }
  const noi = phan.length > 0 ? phan.join(" ⇐ nguyên nhân: ") : String(err);
  return noi.length > LOI_MAX_TONG ? `${noi.slice(0, LOI_MAX_TONG)}…` : noi;
}

/**
 * Trần NỀN TẢNG của gói Workers (không phải lỗi GDT).
 *
 * ĐÃ KIỂM CHỨNG (2026-07-18, `lan_dong_bo` production, n=61): khi pha 1 vượt trần
 * 50 subrequest/invocation của gói **Free**, Workers ném Error với thông điệp
 * `"Too many subrequests by single Worker invocation. To configure this limit, refer
 * to https://…"`. Đây là lỗi cục bộ — request có thể chưa hề rời biên Cloudflare.
 *
 * CHƯA KIỂM CHỨNG: thông điệp của trần CPU/thời gian — **không đoán, không match ở
 * đây**. Bổ sung khi quan sát được chuỗi thật (nguyên tắc bằng chứng, CLAUDE.md).
 *
 * Đây là chỗ DUY NHẤT được dò chuỗi lỗi: dò một lần tại biên rồi phát ra nhãn có
 * kiểu, để tầng điều phối (U9) quyết định mà không phải dò chuỗi (mong manh).
 */
export function laTranNenTangCucBo(err: unknown): boolean {
  return err instanceof Error && err.message.includes("Too many subrequests");
}

/** Phân loại lỗi cho `SyncResult.failureKind` (U25 mở rộng `rate_limited`):
 * - 401/hết phiên → `session_expired` (token chết, không retry).
 * - 429 kiệt lượt retry adapter (`GdtError.httpStatus === 429`) → `rate_limited`
 *   (tầng job phải backpressure, KHÔNG retry thật — xem doc `SyncResult.failureKind`).
 * - trần nền tảng Workers → `local_limit` (retry được, KHÔNG tính vào breaker GDT).
 * - mọi lỗi còn lại → `transient` (mạng/5xx khác/DB — retry cấp job an toàn, có trần
 *   lần thử của hàng đợi làm chốt chặn). */
function classifyFailure(
  err: unknown,
): "session_expired" | "rate_limited" | "transient" | "local_limit" {
  if (err instanceof GdtError && err.code === "SESSION_EXPIRED") return "session_expired";
  if (err instanceof GdtError && err.httpStatus === 429) return "rate_limited";
  if (laTranNenTangCucBo(err)) return "local_limit";
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
): Promise<{
  soHdMoi: number;
  soHdCapNhat: number;
  changes: InvoiceChange[];
  detailCandidates: DetailCandidate[];
}> {
  // Ánh xạ + khử trùng trong lô theo khóa tự nhiên (adapter đã khử 5 trường; phòng hờ).
  const byKey = new Map<string, NewHoaDon>();
  for (const r of rows) {
    const mapped = mapInvoiceRowToHoaDon(r, tenantId);
    byKey.set(naturalKeyOf(mapped), mapped);
  }
  if (byKey.size === 0) return { soHdMoi: 0, soHdCapNhat: 0, changes: [], detailCandidates: [] };

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
  // SỰ CỐ 2026-07-18 (kỳ 2026-07 purchase, production): INSERT TẤT CẢ trong MỘT câu
  // lệnh chết với tháng hàng nghìn hóa đơn ("Failed query: insert into hoa_don…" —
  // 21 tham số/hàng, ~3.100 hàng vượt trần 65.535 tham số của giao thức Postgres;
  // CHƯA KIỂM CHỨNG con số chính xác vì cause không được lưu). Chia lô INSERT_CHUNK_SIZE
  // hàng/câu lệnh — vẫn trong CÙNG transaction nên tính nguyên tử của run giữ nguyên.
  for (let i = 0; i < toInsert.length; i += INSERT_CHUNK_SIZE) {
    const lo = toInsert.slice(i, i + INSERT_CHUNK_SIZE);
    await tx
      .insert(hoaDon)
      .values(lo)
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

  // U26 — ứng viên pha 2 = MỚI (toInsert) ∪ ĐỔI TRẠNG THÁI (changes) ∪ ĐANG THIẾU dòng
  // hàng (trong lô). Vế "đang thiếu" làm pha 1 TỰ LÀNH: enqueue pha 2 lỗi/chưa xử xong
  // → lượt đồng bộ sau của cùng kỳ tự enqueue lại, không có hóa đơn kẹt 0 dòng vĩnh
  // viễn (đồng nhất tiêu chí backfill-lines). Resolve `hoa_don.id` NGAY TRONG
  // transaction (SELECT theo tenant + shdon của lô, khớp khóa tự nhiên đầy đủ — cùng
  // mẫu persistLinesForBatch) để message pha 2 mang id đích.
  const priorityKeys = new Set([
    ...toInsert.map((m) => naturalKeyOf(m)),
    ...changes.map((c) => c.naturalKey),
  ]);
  const persisted = await tx
    .select()
    .from(hoaDon)
    .where(and(eq(hoaDon.tenantId, tenantId), inArray(hoaDon.shdon, shdons)));
  const idByKey = new Map(persisted.map((e) => [naturalKeyOf(e), e.id]));
  const batchIds = [...byKey.keys()].flatMap((key) => idByKey.get(key) ?? []);
  const withLines = new Set(
    batchIds.length === 0
      ? []
      : (
          await tx
            .selectDistinct({ hoaDonId: dongHangHoa.hoaDonId })
            .from(dongHangHoa)
            .where(and(eq(dongHangHoa.tenantId, tenantId), inArray(dongHangHoa.hoaDonId, batchIds)))
        ).map((r) => r.hoaDonId),
  );
  const detailCandidates: DetailCandidate[] = [...byKey.entries()].flatMap(([key, m]) => {
    const hoaDonId = idByKey.get(key);
    // Không thấy id (khe đua hiếm) → bỏ ứng viên này, KHÔNG chặn upsert; lượt đồng
    // bộ sau hoặc backfill-lines sẽ bù (HĐ vẫn 0 dòng → nằm trong tập thiếu).
    if (!hoaDonId) return [];
    if (!priorityKeys.has(key) && withLines.has(hoaDonId)) return []; // không đổi + đã có dòng
    return [
      {
        hoaDonId,
        ref: {
          nbmst: m.nbmst,
          khhdon: m.khhdon,
          khmshdon: m.khmshdon,
          shdon: m.shdon,
          source: m.nguon === "sco" ? ("sco" as const) : ("normal" as const),
        },
      },
    ];
  });
  return { soHdMoi, soHdCapNhat, changes, detailCandidates };
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
  failureKind: "session_expired" | "rate_limited" | "transient" | "local_limit",
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
    detailCandidates: [],
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
    return recordFailed(db, tenantId, meta, tomTatLoi(err), classifyFailure(err));
  }

  // Bước 1b — đường INLINE (chỉ khi được tiêm fetchDetail: test/công cụ offline; U26
  // production KHÔNG tiêm — dòng hàng đi pha 2 qua queue, xem SyncOptions.fetchDetail).
  // Lấy chi tiết TRƯỚC khi mở transaction ghi (không giữ transaction mở khi gọi mạng),
  // tuần tự (concurrency 1). 401 → session_expired; 429 → rate_limited; 5xx/timeout →
  // transient. KHÔNG log giá trị dòng hàng (security.md).
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
      return recordFailed(db, tenantId, meta, tomTatLoi(err), classifyFailure(err));
    }
  }

  // Bước 2 — upsert header + persist dòng hàng + ghi lịch sử NGUYÊN TỬ: mọi lỗi giữa
  // chừng → rollback, không có số đếm mà thiếu dữ liệu, không có hóa đơn/dòng ghi dở.
  try {
    return await withTenant(db, tenantId, async (tx) => {
      const { soHdMoi, soHdCapNhat, changes, detailCandidates } = await upsertBatch(
        tx,
        tenantId,
        rows,
      );
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
        detailCandidates,
      };
    });
  } catch (err) {
    return recordFailed(db, tenantId, meta, tomTatLoi(err), classifyFailure(err));
  }
}

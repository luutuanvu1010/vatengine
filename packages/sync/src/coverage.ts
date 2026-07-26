// U22 B3 — Suy PHẠM VI ĐÃ PHỦ của backfill từ `lan_dong_bo` (docs/plans/U22-plan.md
// §4B, AC2). NGUỒN CHÂN LÝ "tháng nào đã đồng bộ" là `lan_dong_bo` (cổng B1 đã chứng
// minh: tháng RỖNG THẬT vẫn để lại 1 phiên 'completed' → phân biệt "đã phủ (kể cả
// rỗng)" với "chưa từng" mà KHÔNG cần bảng/patch mới). Chỉ ĐỌC — không gọi GDT.
//
// Quyết định (B3): "đã phủ" = có ≥1 phiên trạng thái THÀNH CÔNG TRỌN VẸN (`completed`)
// cho đúng (tenant, tài khoản, chiều, tháng). CHỦ Ý KHÔNG tính `hoan_thanh_mot_phan`/
// `running`/`failed`/`can_dang_nhap_lai` là đã phủ: đồng bộ lại là idempotent (U5) và
// an toàn, nên thà backfill lại phần dở còn hơn bỏ sót — ưu tiên đủ dữ liệu.
import { TRANG_THAI_LAN_DONG_BO, lanDongBo } from "@vat/db";
import type { InvoiceDirection } from "@vat/gdt-client";
import { and, eq, gte, inArray, lt } from "drizzle-orm";
import type { TablesRelationalConfig } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { PeriodWindow } from "./syncJob";

// Generic trên `PgDatabase` (mẫu @vat/query.listInvoices): PGlite trong test, pg/
// Hyperdrive khi chạy; `PgTransaction` (từ withTenant) cũng thỏa vì kế thừa.
type Db<
  TQuery extends PgQueryResultHKT,
  TFull extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
> = PgDatabase<TQuery, TFull, TSchema>;

/** Kỳ "YYYY-MM" của một mốc `tu_ngay` đã lưu. `lan_dong_bo.tu_ngay` được ghi bằng
 * `Date.UTC(y, m-1, 1)` (ngày 1, 00:00 UTC — xem sync.ts parseDdmmyyyy) nên đọc trực
 * tiếp getUTC* trả đúng tháng theo lịch VN mà không cần dịch múi giờ. */
function periodOf(tuNgay: Date): string {
  return `${tuNgay.getUTCFullYear()}-${String(tuNgay.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Mốc đầu tháng (UTC) của kỳ "YYYY-MM". */
function monthStartUtc(period: string): Date {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) throw new Error(`period phải định dạng YYYY-MM: ${period}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
}

/** Mốc đầu tháng KẾ TIẾP (UTC) của kỳ "YYYY-MM" — biên trên (loại trừ) để bound truy vấn. */
function nextMonthStartUtc(period: string): Date {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) throw new Error(`period phải định dạng YYYY-MM: ${period}`);
  // Date.UTC(y, M, 1) với M = số tháng 1-based = ngày 1 tháng kế (cuộn năm khi M=12).
  return new Date(Date.UTC(Number(m[1]), Number(m[2]), 1));
}

/**
 * Tập kỳ "YYYY-MM" ĐÃ PHỦ (completed) trong `windows`, cho đúng (tenant, tài khoản,
 * chiều). Lọc TƯỜNG MINH `tenant_id` (multi-tenant.md, lớp 1) — gọi trong `withTenant`
 * để RLS chốt lớp 2. Một truy vấn: bound theo `[đầu tháng nhỏ nhất, đầu tháng-kế lớn
 * nhất)` rồi suy kỳ từ `tu_ngay` và giao với tập kỳ được hỏi. Trả tập con của
 * `windows.map(period)`.
 */
export async function coveredMonths<
  TQuery extends PgQueryResultHKT,
  TFull extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
>(
  db: Db<TQuery, TFull, TSchema>,
  tenantId: string,
  taikhoanId: string,
  chieu: InvoiceDirection,
  windows: PeriodWindow[],
): Promise<Set<string>> {
  if (windows.length === 0) return new Set();
  const wanted = new Set(windows.map((w) => w.period));
  // Biên truy vấn theo tu_ngay: [nhỏ nhất đầu-tháng, lớn nhất đầu-tháng-kế). Không giả
  // định windows đã sắp xếp → lấy min/max tường minh.
  let lo: Date | null = null;
  let hi: Date | null = null;
  for (const w of windows) {
    const s = monthStartUtc(w.period);
    const e = nextMonthStartUtc(w.period);
    if (lo === null || s.getTime() < lo.getTime()) lo = s;
    if (hi === null || e.getTime() > hi.getTime()) hi = e;
  }
  if (lo === null || hi === null) return new Set(); // windows rỗng đã chặn ở trên; chốt kiểu

  const rows = await db
    .select({ tuNgay: lanDongBo.tuNgay })
    .from(lanDongBo)
    .where(
      and(
        eq(lanDongBo.tenantId, tenantId),
        eq(lanDongBo.taikhoanId, taikhoanId),
        eq(lanDongBo.chieu, chieu),
        eq(lanDongBo.trangThai, TRANG_THAI_LAN_DONG_BO.HOAN_THANH),
        gte(lanDongBo.tuNgay, lo),
        lt(lanDongBo.tuNgay, hi),
      ),
    );

  const covered = new Set<string>();
  for (const r of rows) {
    const p = periodOf(r.tuNgay);
    if (wanted.has(p)) covered.add(p);
  }
  return covered;
}

/**
 * Danh sách cửa sổ tháng CÒN THIẾU = `windows` trừ các tháng đã phủ (cho một chiều).
 * Giữ nguyên thứ tự đầu vào. Đây chính là tập cần enqueue backfill (B5).
 */
export async function missingMonths<
  TQuery extends PgQueryResultHKT,
  TFull extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
>(
  db: Db<TQuery, TFull, TSchema>,
  tenantId: string,
  taikhoanId: string,
  chieu: InvoiceDirection,
  windows: PeriodWindow[],
): Promise<PeriodWindow[]> {
  const covered = await coveredMonths(db, tenantId, taikhoanId, chieu, windows);
  return windows.filter((w) => !covered.has(w.period));
}

// ── B6: theo dõi tiến độ backfill (AC4) ──────────────────────────────────────────

/** Trạng thái một tháng của backfill (frontend hiển thị).
 * `"du"` = tháng ĐỦ so total GDT mà KHÔNG kéo gì — mọi chiều completed đều là
 * run `loai='audit'` (kiểm-đủ). `"xong"` = đã kéo thật ít nhất một chiều
 * (`loai='sync'`, hoặc legacy không có `loai`). `du` ⊂ nhóm-đã-xong (soXong đếm
 * cả hai). */
export type BackfillMonthStatus = "cho" | "dang_chay" | "xong" | "du" | "loi";

export interface BackfillProgress {
  thang: { period: string; trangThai: BackfillMonthStatus }[];
  /** Số tháng đã hoàn thành — đếm cả 'xong' (đã kéo) lẫn 'du' (đủ, không kéo). */
  soXong: number;
  tongSoThang: number;
  /** Tổng: hoan_thanh (tất cả xong) | can_dang_nhap_lai (token chết — ưu tiên báo) |
   * co_loi (có tháng lỗi khác) | dang_chay (còn đang chạy/chờ). */
  trangThaiTong: "dang_chay" | "hoan_thanh" | "co_loi" | "can_dang_nhap_lai";
}

/** Trạng thái tổng hợp cho MỘT (tháng, chiều) từ nhiều bản ghi (có thể lặp do retry).
 * Ưu tiên: completed thắng (thành công cuối) → reauth → failed → running/partial →
 * pending (không có bản ghi). */
type DirState = "covered" | "reauth" | "failed" | "running" | "pending";

function reduceDirState(trangThais: string[]): DirState {
  if (trangThais.includes(TRANG_THAI_LAN_DONG_BO.HOAN_THANH)) return "covered";
  if (trangThais.includes(TRANG_THAI_LAN_DONG_BO.CAN_DANG_NHAP_LAI)) return "reauth";
  if (trangThais.includes(TRANG_THAI_LAN_DONG_BO.THAT_BAI)) return "failed";
  if (
    trangThais.includes(TRANG_THAI_LAN_DONG_BO.DANG_CHAY) ||
    trangThais.includes(TRANG_THAI_LAN_DONG_BO.HOAN_THANH_MOT_PHAN)
  ) {
    return "running";
  }
  return "pending";
}

/**
 * Suy tiến độ backfill (thuần, dễ test): từ các bản ghi `lan_dong_bo` (`{period, chieu,
 * trangThai, loai}`), tính trạng thái TỪNG THÁNG trong `months` + trạng thái TỔNG (AC4).
 * Một tháng đạt "hoàn thành" khi MỌI chiều `completed`: nếu ÍT NHẤT MỘT chiều được phủ
 * bởi run `loai !== 'audit'` (sync, hoặc legacy không có `loai` — tương thích lùi) →
 * `"xong"` (đã kéo thật); nếu TẤT CẢ chiều chỉ được phủ bởi run `loai='audit'` (kiểm-đủ,
 * không kéo) → `"du"` (Task 8, delta-sync). Bản ghi ngoài `months` bị bỏ qua.
 *
 * `sinceMs` (SỰ CỐ 2026-07-18): bản ghi THẤT BẠI/CẦN ĐĂNG NHẬP LẠI **cũ hơn thời điểm
 * backfill này được tạo** (`def.createdAtMs`) bị BỎ QUA — trước đó chúng làm GET
 * /backfill/:id trả `co_loi` NGAY sau khi bấm (UI ngừng poll trong khi job mới còn
 * chưa chạy). `completed` vẫn tính MỌI thời điểm: tháng đã phủ từ trước là "xong" thật.
 * Không truyền `sinceMs` → hành vi cũ (tương thích lùi).
 */
export function deriveBackfillStatus(
  rows: {
    period: string;
    chieu: InvoiceDirection;
    trangThai: string;
    batDauMs?: number;
    loai?: string;
  }[],
  directions: InvoiceDirection[],
  months: string[],
  sinceMs?: number,
): BackfillProgress {
  const byKey = new Map<string, string[]>(); // "period|chieu" → danh sách trạng thái
  // "period|chieu" mà có ÍT NHẤT MỘT bản ghi completed KHÔNG PHẢI audit (loai==='sync'
  // hoặc thiếu loai — legacy tính như sync, tương thích lùi). Dùng để phân biệt
  // 'du' (chỉ audit-completed) với 'xong' (đã kéo thật).
  const coCompletedSync = new Set<string>();
  for (const r of rows) {
    const laLoiCu =
      sinceMs !== undefined &&
      r.batDauMs !== undefined &&
      r.batDauMs < sinceMs &&
      (r.trangThai === TRANG_THAI_LAN_DONG_BO.THAT_BAI ||
        r.trangThai === TRANG_THAI_LAN_DONG_BO.CAN_DANG_NHAP_LAI);
    if (laLoiCu) continue;
    const k = `${r.period}|${r.chieu}`;
    const arr = byKey.get(k);
    if (arr) arr.push(r.trangThai);
    else byKey.set(k, [r.trangThai]);
    if (r.trangThai === TRANG_THAI_LAN_DONG_BO.HOAN_THANH && r.loai !== "audit") {
      coCompletedSync.add(k);
    }
  }

  let anyReauth = false;
  let anyLoi = false;
  const thang = months.map((period) => {
    const dirStates = directions.map((d) => reduceDirState(byKey.get(`${period}|${d}`) ?? []));
    let trangThai: BackfillMonthStatus;
    if (dirStates.length > 0 && dirStates.every((s) => s === "covered")) {
      const coSync = directions.some((d) => coCompletedSync.has(`${period}|${d}`));
      trangThai = coSync ? "xong" : "du";
    } else if (dirStates.some((s) => s === "reauth")) {
      trangThai = "loi";
      anyReauth = true;
      anyLoi = true;
    } else if (dirStates.some((s) => s === "failed")) {
      trangThai = "loi";
      anyLoi = true;
    } else if (dirStates.some((s) => s === "running" || s === "covered")) {
      trangThai = "dang_chay"; // đang chạy hoặc một phần chiều đã xong
    } else {
      trangThai = "cho";
    }
    return { period, trangThai };
  });

  const soXong = thang.filter((t) => t.trangThai === "xong" || t.trangThai === "du").length;
  const tongSoThang = months.length;
  let trangThaiTong: BackfillProgress["trangThaiTong"];
  if (anyReauth) trangThaiTong = "can_dang_nhap_lai";
  else if (anyLoi) trangThaiTong = "co_loi";
  else if (tongSoThang > 0 && soXong === tongSoThang) trangThaiTong = "hoan_thanh";
  else trangThaiTong = "dang_chay";

  return { thang, soXong, tongSoThang, trangThaiTong };
}

/**
 * Suy tiến độ backfill từ DB: đọc `lan_dong_bo` cho (tenant, tài khoản, các chiều, các
 * tháng) rồi gọi `deriveBackfillStatus`. Lọc `tenant_id` tường minh (lớp 1) — gọi trong
 * `withTenant` để RLS (lớp 2). Chỉ đọc cột không nhạy cảm (tu_ngay/chieu/trang_thai).
 */
export async function monthlyBackfillStatus<
  TQuery extends PgQueryResultHKT,
  TFull extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
>(
  db: Db<TQuery, TFull, TSchema>,
  tenantId: string,
  taikhoanId: string,
  directions: InvoiceDirection[],
  months: string[],
  sinceMs?: number,
): Promise<BackfillProgress> {
  if (months.length === 0 || directions.length === 0) {
    return deriveBackfillStatus([], directions, months, sinceMs);
  }
  let lo: Date | null = null;
  let hi: Date | null = null;
  for (const m of months) {
    const s = monthStartUtc(m);
    const e = nextMonthStartUtc(m);
    if (lo === null || s.getTime() < lo.getTime()) lo = s;
    if (hi === null || e.getTime() > hi.getTime()) hi = e;
  }
  if (lo === null || hi === null) return deriveBackfillStatus([], directions, months, sinceMs);

  const rows = await db
    .select({
      tuNgay: lanDongBo.tuNgay,
      chieu: lanDongBo.chieu,
      trangThai: lanDongBo.trangThai,
      batDau: lanDongBo.batDau,
      loai: lanDongBo.loai,
    })
    .from(lanDongBo)
    .where(
      and(
        eq(lanDongBo.tenantId, tenantId),
        eq(lanDongBo.taikhoanId, taikhoanId),
        inArray(lanDongBo.chieu, directions),
        gte(lanDongBo.tuNgay, lo),
        lt(lanDongBo.tuNgay, hi),
      ),
    );
  const mapped = rows.map((r) => ({
    period: periodOf(r.tuNgay),
    chieu: r.chieu as InvoiceDirection,
    trangThai: r.trangThai,
    batDauMs: r.batDau.getTime(),
    loai: r.loai,
  }));
  return deriveBackfillStatus(mapped, directions, months, sinceMs);
}

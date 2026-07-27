// Task 5 (delta-sync) — vòng đời một run delta (`lan_dong_bo`, cột `checkpoint`/`loai`
// từ Task 1) + `syncChunk`: kéo TỐI ĐA `maxPages` trang của MỘT họ endpoint
// (`queryInvoicesChunk`, Task 2), commit MỖI LÔ trong một transaction riêng qua
// `withTenant` (không giữ một transaction lớn xuyên suốt cả kỳ — sự cố chunk-insert
// 2026-07-18 dạy: lô nhỏ, commit sớm), CỘNG DỒN `soHdMoi`/`soHdCapNhat` vào run row
// bằng SQL (chống mất đếm khi 2 lô ghi gần nhau), và ghi `checkpoint` để lô sau (hoặc
// redelivery của cùng lô) nối đúng chỗ. Task 6 (điều phối vòng lặp delta + audit) dùng
// các hàm này làm nguyên liệu. Xem CLAUDE.md, .claude/rules/{multi-tenant,gdt-adapter}.md.
import { TRANG_THAI_LAN_DONG_BO, lanDongBo, withTenant } from "@vat/db";
import { queryInvoicesChunk } from "@vat/gdt-client";
import type { GdtTransport, InvoiceDirection, RetryOptions } from "@vat/gdt-client";
import { and, eq, gte, sql } from "drizzle-orm";
import type { TablesRelationalConfig } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { classifyFailure, parseDdmmyyyy, tomTatLoi, upsertBatch } from "./sync";
import type { DetailCandidate } from "./sync";

// Mirror chữ ký generic của `withTenant` (cùng mẫu sync.ts/audit.ts) — nhận mọi client
// Drizzle Postgres (PGlite trong test, pg/Hyperdrive khi chạy) mà không cần `any`.
type Db<
  TQuery extends PgQueryResultHKT,
  TFull extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
> = PgDatabase<TQuery, TFull, TSchema>;

/** Tham số một run delta (một tài khoản, một chiều, một khoảng ngày dd/mm/yyyy). */
export interface DeltaRunParams {
  taikhoanId: string;
  direction: InvoiceDirection;
  /** Khoảng ngày, định dạng dd/mm/yyyy (khớp adapter). */
  dateFrom: string;
  dateTo: string;
}

/**
 * Mở một run delta MỚI (`lan_dong_bo` trạng thái `running`, `loai='sync'`) — Task 6 gọi
 * TRƯỚC vòng lặp kéo lô. `checkpoint` khởi tạo rỗng (`{}`) — `syncChunk` ghi đè sau mỗi
 * lô thành công.
 */
export async function moDeltaRun<
  TQuery extends PgQueryResultHKT,
  TFull extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
>(db: Db<TQuery, TFull, TSchema>, tenantId: string, p: DeltaRunParams): Promise<string> {
  return withTenant(db, tenantId, async (tx) => {
    const inserted = await tx
      .insert(lanDongBo)
      .values({
        tenantId,
        taikhoanId: p.taikhoanId,
        chieu: p.direction,
        tuNgay: parseDdmmyyyy(p.dateFrom),
        denNgay: parseDdmmyyyy(p.dateTo),
        trangThai: TRANG_THAI_LAN_DONG_BO.DANG_CHAY,
        loai: "sync",
        checkpoint: {},
        batDau: new Date(),
      })
      .returning({ id: lanDongBo.id });
    const row = inserted[0];
    if (!row) throw new Error("moDeltaRun: insert lan_dong_bo không trả về id");
    return row.id;
  });
}

/** Trần tuổi một run 'running' còn được coi là "chuỗi kéo đang chạy" (2 giờ).
 *
 * Vì sao cần trần: run mồ côi (chuỗi chết mà chưa kịp chốt — vd deploy giữa chừng) mà
 * không có trần thì `coDeltaRunDangChay` chặn kỳ đó VĨNH VIỄN. 2h là dư an toàn: chuỗi
 * lành hoàn thành trong vài phút; chuỗi kẹt backpressure chết về DLQ (được chốt failed)
 * trong ~1h (trần bpAttempt 10 × delay 300s + retry consumer). CHƯA KIỂM CHỨNG dưới tải
 * lớn hơn — nếu quan sát thấy chuỗi lành chạy quá 2h, nâng trần thay vì bỏ guard. */
export const TUOI_TOI_DA_CHUOI_KEO_MS = 2 * 3_600_000;

/**
 * Có chuỗi kéo delta ĐANG CHẠY cho cùng (tài khoản × kỳ × chiều) không? — guard khử
 * TRÙNG LẶP chuỗi (sự cố livelock 2026-07-27: mỗi lần bấm "Đồng bộ" mở thêm một chuỗi
 * cho CÙNG kỳ; hàng chục chuỗi giành ngân sách permit 2 req/s của tenant → không chuỗi
 * nào xong). Task 6 gọi TRƯỚC `moDeltaRun` ở vòng audit 0; `true` ⇒ KHÔNG mở chuỗi mới,
 * để chuỗi sẵn có tự kéo tới đủ. Chỉ xét run `loai='sync'` `running` MỚI hơn trần tuổi
 * (xem `TUOI_TOI_DA_CHUOI_KEO_MS`). Lọc `tenant_id` tường minh (multi-tenant.md, lớp 1).
 *
 * GIỚI HẠN ĐÃ BIẾT (TOCTOU, review 2026-07-27): guard là SELECT best-effort, KHÔNG có
 * ràng buộc UNIQUE ở DB — hai audit vòng 0 cùng scope chạy ĐỒNG THỜI (queue
 * max_concurrency=3) vẫn có thể cùng thấy "chưa có run" rồi cùng mở chuỗi. Hệ quả bị
 * CHẶN TRÊN ở ~3 chuỗi (thay vì không giới hạn như trước fix) — đủ thoát livelock.
 * Chặn cứng (partial unique index WHERE trang_thai='running' AND loai='sync') là
 * migration riêng — xem backlog [2026-07-27].
 */
export async function coDeltaRunDangChay<
  TQuery extends PgQueryResultHKT,
  TFull extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
>(
  db: Db<TQuery, TFull, TSchema>,
  tenantId: string,
  p: DeltaRunParams,
  nowMs: number = Date.now(),
): Promise<boolean> {
  return withTenant(db, tenantId, async (tx) => {
    const rows = await tx
      .select({ id: lanDongBo.id })
      .from(lanDongBo)
      .where(
        and(
          eq(lanDongBo.tenantId, tenantId),
          eq(lanDongBo.taikhoanId, p.taikhoanId),
          eq(lanDongBo.chieu, p.direction),
          eq(lanDongBo.tuNgay, parseDdmmyyyy(p.dateFrom)),
          eq(lanDongBo.loai, "sync"),
          eq(lanDongBo.trangThai, TRANG_THAI_LAN_DONG_BO.DANG_CHAY),
          gte(lanDongBo.batDau, new Date(nowMs - TUOI_TOI_DA_CHUOI_KEO_MS)),
        ),
      )
      .limit(1);
    return rows.length > 0;
  });
}

/**
 * Ghi một run AUDIT (`lan_dong_bo` trạng thái `completed`, `loai='audit'`, `soHdMoi`/
 * `soHdCapNhat` mặc định 0) — Task 6 gọi khi vòng đối chiếu (`decideAudit`) kết luận
 * `{kind:"du"}`: kỳ đã đủ so `total` GDT, KHÔNG cần kéo gì thêm. Bản ghi này là DẤU
 * "đã kiểm, đủ" phân biệt với run kéo dữ liệu thật (cùng mẫu U22 B1: tháng rỗng thật
 * vẫn ghi 1 phiên completed để phân biệt "đã phủ" vs "chưa từng").
 */
export async function ghiAuditDu<
  TQuery extends PgQueryResultHKT,
  TFull extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
>(db: Db<TQuery, TFull, TSchema>, tenantId: string, p: DeltaRunParams): Promise<void> {
  await withTenant(db, tenantId, async (tx) => {
    await tx.insert(lanDongBo).values({
      tenantId,
      taikhoanId: p.taikhoanId,
      chieu: p.direction,
      tuNgay: parseDdmmyyyy(p.dateFrom),
      denNgay: parseDdmmyyyy(p.dateTo),
      trangThai: TRANG_THAI_LAN_DONG_BO.HOAN_THANH,
      loai: "audit",
      batDau: new Date(),
      ketThuc: new Date(),
    });
  });
}

/** Kết quả chốt (Task 6 quyết định khi vòng lặp delta/audit kết thúc). */
export interface ChotDeltaRunKetQua {
  trangThai: "completed" | "failed" | "can_dang_nhap_lai";
  thongDiepLoi?: string;
}

/**
 * Chốt trạng thái CUỐI của một run delta đã mở bằng `moDeltaRun` — set `trangThai` +
 * `ketThuc` (+ `thongDiepLoi` nếu có lỗi). KHÔNG đụng `checkpoint`/`soHdMoi`/
 * `soHdCapNhat` — số liệu đó do `syncChunk` cộng dồn từng lô trong suốt run.
 */
export async function chotDeltaRun<
  TQuery extends PgQueryResultHKT,
  TFull extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
>(
  db: Db<TQuery, TFull, TSchema>,
  tenantId: string,
  lanDongBoId: string,
  kq: ChotDeltaRunKetQua,
): Promise<void> {
  await withTenant(db, tenantId, async (tx) => {
    await tx
      .update(lanDongBo)
      .set({
        trangThai: kq.trangThai,
        ...(kq.thongDiepLoi ? { thongDiepLoi: kq.thongDiepLoi } : {}),
        ketThuc: new Date(),
      })
      .where(and(eq(lanDongBo.id, lanDongBoId), eq(lanDongBo.tenantId, tenantId)));
  });
}

/** Con trỏ resume ghi vào `lan_dong_bo.checkpoint` sau MỖI lô thành công. */
export interface DeltaCheckpoint {
  family: "normal" | "sco";
  state: string | null;
  totalQuanSat: number | null;
}

/** Kết quả một lô (`syncChunk`) — Task 6 dùng để quyết định kéo tiếp/dừng/báo lỗi. */
export interface ChunkOutcome {
  trangThai: "ok" | "failed";
  /** ok: họ này đã hết trang (không còn `state` để nối tiếp). */
  done?: boolean;
  /** ok && !done: con trỏ lô kế. */
  state?: string;
  totalQuanSat?: number | null;
  soHdMoi?: number;
  soHdCapNhat?: number;
  /** Số TRANG đã kéo trong LÔ này (pass-through `queryInvoicesChunk().pages`) — Task 6
   * dùng để cộng dồn `trangDaKeo` chặn chuỗi delta enqueue vô hạn (trần
   * `TRAN_TONG_TRANG_DELTA`, xem syncJob.ts). Chỉ có ở nhánh ok (thất bại không kéo được
   * trang nào tính được). */
  pages?: number;
  failureKind?: "session_expired" | "rate_limited" | "transient" | "local_limit";
  thongDiepLoi?: string;
  detailCandidates: DetailCandidate[];
}

export interface SyncChunkOptions<
  TQuery extends PgQueryResultHKT,
  TFull extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
> {
  db: Db<TQuery, TFull, TSchema>;
  transport: GdtTransport;
  /** Token JWT GDT — nhận từ ngoài (U1). KHÔNG persist, KHÔNG log. */
  token: string;
  tenantId: string;
  taikhoanId: string;
  direction: InvoiceDirection;
  family: "normal" | "sco";
  /** Khoảng ngày, định dạng dd/mm/yyyy (khớp adapter). */
  dateFrom: string;
  dateTo: string;
  lanDongBoId: string;
  /** Con trỏ tiếp tục từ lô trước (rỗng = lô đầu của họ này). */
  state?: string;
  maxPages: number;
  size?: number;
  retry?: RetryOptions;
}

/**
 * Kéo TỐI ĐA `maxPages` trang của MỘT họ endpoint (normal | sco) nối tiếp từ
 * `opts.state`, upsert idempotent vào `hoa_don`, rồi COMMIT trong MỘT transaction
 * (`withTenant`) cùng lúc CỘNG DỒN `soHdMoi`/`soHdCapNhat` vào run row (SQL
 * `col + delta` — an toàn khi nhiều lô ghi gần nhau) và cập nhật `checkpoint`.
 *
 * Lỗi khi FETCH (mạng/GDT — 401/429/5xx/local_limit) xảy ra TRƯỚC khi mở transaction
 * ghi: trả `failed` + `failureKind`, KHÔNG đụng run row — `checkpoint`/số đếm hiện có
 * giữ nguyên để tầng điều phối (Task 6) resume đúng từ lô trước, không mất tiến độ.
 *
 * Lỗi khi UPSERT/ghi run row (DB) xảy ra TRONG transaction: rollback nguyên tử (không
 * hóa đơn nào của lô này được ghi dở dang), cũng trả `failed` không đụng run row (lỗi
 * nằm trong transaction đã rollback nên tự nhiên không đụng).
 *
 * Idempotent theo lô: gọi lại CÙNG tham số (redelivery message chưa ack) không nhân
 * đôi hóa đơn — `upsertBatch` upsert theo khóa tự nhiên; `soHdMoi` của lần gọi lại sẽ
 * là 0 vì hóa đơn đã tồn tại từ lần trước.
 */
export async function syncChunk<
  TQuery extends PgQueryResultHKT,
  TFull extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
>(opts: SyncChunkOptions<TQuery, TFull, TSchema>): Promise<ChunkOutcome> {
  let chunk: Awaited<ReturnType<typeof queryInvoicesChunk>>;
  try {
    chunk = await queryInvoicesChunk(
      opts.transport,
      opts.token,
      {
        direction: opts.direction,
        family: opts.family,
        dateFrom: opts.dateFrom,
        dateTo: opts.dateTo,
        ...(opts.state ? { state: opts.state } : {}),
        maxPages: opts.maxPages,
        ...(opts.size ? { size: opts.size } : {}),
      },
      opts.retry,
    );
  } catch (err) {
    // KHÔNG đụng run row: checkpoint/số đếm giữ nguyên, retry/reenqueue của Task 6 sẽ
    // nối lại đúng chỗ từ checkpoint hiện có.
    return {
      trangThai: "failed",
      failureKind: classifyFailure(err),
      thongDiepLoi: tomTatLoi(err),
      detailCandidates: [],
    };
  }

  try {
    return await withTenant(opts.db, opts.tenantId, async (tx) => {
      const { soHdMoi, soHdCapNhat, detailCandidates } = await upsertBatch(
        tx,
        opts.tenantId,
        chunk.rows,
      );
      await tx
        .update(lanDongBo)
        .set({
          soHdMoi: sql`${lanDongBo.soHdMoi} + ${soHdMoi}`,
          soHdCapNhat: sql`${lanDongBo.soHdCapNhat} + ${soHdCapNhat}`,
          checkpoint: {
            family: opts.family,
            state: chunk.state ?? null,
            totalQuanSat: chunk.total,
          } satisfies DeltaCheckpoint,
        })
        .where(and(eq(lanDongBo.id, opts.lanDongBoId), eq(lanDongBo.tenantId, opts.tenantId)));
      return {
        trangThai: "ok" as const,
        done: !chunk.state,
        ...(chunk.state ? { state: chunk.state } : {}),
        totalQuanSat: chunk.total,
        soHdMoi,
        soHdCapNhat,
        pages: chunk.pages,
        detailCandidates,
      };
    });
  } catch (err) {
    return {
      trangThai: "failed",
      failureKind: classifyFailure(err),
      thongDiepLoi: tomTatLoi(err),
      detailCandidates: [],
    };
  }
}

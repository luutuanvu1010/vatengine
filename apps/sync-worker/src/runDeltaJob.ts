// Task 6 (delta-sync) — Điều phối CHUỖI "audit → kéo lô → kiểm lại" cho MỘT kỳ ×
// MỘT chiều, chạy trên hàng đợi `vat-sync` bằng nhiều lần gọi Worker NGẮN thay vì một
// lần gọi dài (sự cố 2026-07-18: một job phân trang cả tháng vượt trần subrequest /
// invocation và tự nuôi cửa sổ phạt 429 của GDT).
//
// Hai nửa của chuỗi:
//  - `runAuditJob` (message `kind:"audit"`): hỏi `total` từng họ endpoint (normal/sco)
//    bằng 1 request/họ, đối chiếu count DB (`demTheoNguon`) qua `decideAudit` (thuần,
//    @vat/sync) rồi quyết định — ĐỦ: ghi dấu "đã kiểm, đủ" / chốt run đang mở; DỪNG
//    (bão hòa hoặc chạm trần vòng): chốt run kèm ghi chú số hụt; KÉO: mở run (vòng 0)
//    và enqueue MỘT message kéo họ đầu, họ sau xếp vào `conLai`.
//  - `runDeltaJob` (message `kind:"delta"`): kéo ĐÚNG MỘT lô (`keoChunk` = syncChunk,
//    tối đa `chunkPages` trang) rồi NỐI chuỗi — chưa hết trang: enqueue lại chính
//    message mang `state` mới; hết trang mà còn `conLai`: chuyển họ; hết cả hai:
//    enqueue lại message audit để kiểm lại.
//
// THUẦN LOGIC, phụ thuộc tiêm → test offline (test/unit/runDeltaJob.test.ts). Cô lập
// adapter: KHÔNG tự fetch GDT (deps.layTotal/keoChunk do wiring dựng trên
// @vat/gdt-client + @vat/sync). Phân loại lỗi bằng nhãn có kiểu (`classifyFailure` /
// `ChunkOutcome.failureKind`) — KHÔNG dò chuỗi lỗi tại đây.
import type { InvoiceDirection } from "@vat/gdt-client";
import { buildDetailMessages, classifyFailure, decideAudit } from "@vat/sync";
import type {
  AuditSyncMessage,
  ChunkOutcome,
  DeltaPullMessage,
  DetailSyncMessage,
  VatSyncQueueMessage,
} from "@vat/sync";
import type { AccountToken, JobOutcome, JobRecorder, TenantLimiterClient } from "./types";

/** Phụ thuộc tiêm cho runAuditJob/runDeltaJob (test offline; production dựng ở deps.ts). */
export interface DeltaJobDeps {
  now(): number;
  loadAccount(msg: { tenantId: string; taikhoanId: string }): Promise<AccountToken | null>;
  limiter: TenantLimiterClient;
  recorder: JobRecorder;
  /** `total` GDT của MỘT họ endpoint (1 request, size=1). `null` = họ không áp dụng
   * (sco 404) hoặc GDT không trả total → `decideAudit` bỏ qua họ đó. */
  layTotal(
    token: string,
    direction: InvoiceDirection,
    family: "normal" | "sco",
    dateFrom: string,
    dateTo: string,
  ): Promise<number | null>;
  /** Count `hoa_don` hiện có trong DB, tách theo nguồn (tenant-scoped). */
  demTheoNguon(
    tenantId: string,
    direction: InvoiceDirection,
    period: string,
  ): Promise<{ normal: number; sco: number }>;
  /** Mở run delta mới (`lan_dong_bo` running) → id. */
  moRun(msg: AuditSyncMessage): Promise<string>;
  /** Ghi dấu "đã kiểm, đủ" (`lan_dong_bo` loai='audit', completed). */
  ghiDu(msg: AuditSyncMessage): Promise<void>;
  /** Chốt trạng thái CUỐI của run đang mở. */
  chotRun(
    tenantId: string,
    lanDongBoId: string,
    kq: { trangThai: "completed" | "failed" | "can_dang_nhap_lai"; thongDiepLoi?: string },
  ): Promise<void>;
  /** Kéo MỘT lô (syncChunk) — commit từng lô, ghi checkpoint để lô sau nối đúng chỗ. */
  keoChunk(msg: DeltaPullMessage, token: string): Promise<ChunkOutcome>;
  /** Gửi message nối chuỗi (audit/delta) vào queue vat-sync. */
  enqueue(msgs: VatSyncQueueMessage[]): Promise<void>;
  /** Gửi message pha 2 (dòng hàng) vào queue vat-sync. */
  enqueueDetail(msgs: DetailSyncMessage[]): Promise<void>;
  /** Số trang tối đa mỗi lô (`DELTA_CHUNK_PAGES`, mặc định 40). */
  chunkPages: number;
}

/** Kết quả tiền kiểm dùng chung cho cả hai nửa chuỗi: token hợp lệ, hoặc outcome dừng. */
type TienKiem = { ok: true; token: string } | { ok: false; outcome: JobOutcome };

/**
 * Tiền kiểm CHUNG (mirror `runScheduledSync`, cùng thứ tự + cùng ngữ nghĩa):
 * tài khoản còn tồn tại → token còn hạn (KHÔNG tự đăng nhập/không captcha — ranh giới
 * Hiến pháp) → xin permit rate-limit/circuit-breaker TRƯỚC khi chạm GDT.
 */
async function tienKiem(
  deps: DeltaJobDeps,
  msg: AuditSyncMessage | DeltaPullMessage,
): Promise<TienKiem> {
  const account = await deps.loadAccount(msg);
  // Tài khoản bị xóa giữa enqueue↔consume: KHÔNG ghi reauth (tránh FK mồ côi tới
  // tai_khoan_thue) — để queue thử lại có trần → dead-letter cho người xử lý.
  if (!account) return { ok: false, outcome: { kind: "retry", reason: "tai_khoan_khong_ton_tai" } };

  if (
    !account.tokenHienTai ||
    !account.tokenHetHan ||
    account.tokenHetHan.getTime() <= deps.now()
  ) {
    await deps.recorder.reauthPreflight(msg, "token_het_han");
    return { ok: false, outcome: { kind: "needs_reauth", reason: "token_het_han" } };
  }

  const permit = await deps.limiter.tryAcquire();
  if (!permit.allowed) {
    if (permit.reason === "breaker_open") {
      // Máy chủ thuế đang lỗi/đã ngắt mạch → KHÔNG gọi GDT lúc này; ĐẨY LÙI (reenqueue
      // có delay), KHÔNG tính max_retries. Vẫn ghi audit (breakerSkip) — H-B.4.
      await deps.recorder.breakerSkip(msg);
      return { ok: false, outcome: { kind: "retry_backpressure", reason: "breaker_open" } };
    }
    return { ok: false, outcome: { kind: "retry_backpressure", reason: "rate_limited" } };
  }
  return { ok: true, token: account.tokenHienTai };
}

/**
 * Ánh xạ MỘT lỗi ném ra giữa chừng → outcome, theo ĐÚNG quy ước của `runScheduledSync`
 * (sự cố 2026-07-18): chỉ những lỗi NÓI LÊN SỨC KHỎE ĐƯỜNG RA GDT mới tính vào breaker.
 *  - `session_expired` (401): GDT ĐÃ trả lời ⇒ đường ra lành, token TA hỏng → reauth.
 *  - `rate_limited` (429): đẩy lùi qua đường backpressure, KHÔNG retry nóng.
 *  - `local_limit`: trần gói Workers — có thể xảy ra trước cả khi chạm GDT ⇒ retry
 *    nhưng KHÔNG quy kết cho GDT.
 *  - còn lại: lỗi tạm (mạng/5xx/DB) → retry + ghi thất bại vào breaker.
 */
async function xuLyLoiAudit(
  deps: DeltaJobDeps,
  msg: AuditSyncMessage,
  err: unknown,
): Promise<JobOutcome> {
  const loai = classifyFailure(err);
  if (loai === "session_expired") {
    await deps.recorder.reauthRuntime(msg, "session_expired");
    return { kind: "needs_reauth", reason: "session_expired" };
  }
  if (loai === "rate_limited") return { kind: "retry_backpressure", reason: "rate_limited" };
  if (loai === "local_limit") return { kind: "retry", reason: "local_limit" };
  await deps.limiter.recordResult(false);
  return { kind: "retry", reason: err instanceof Error ? err.message : String(err) };
}

export async function runAuditJob(deps: DeltaJobDeps, msg: AuditSyncMessage): Promise<JobOutcome> {
  const kiem = await tienKiem(deps, msg);
  if (!kiem.ok) return kiem.outcome;

  try {
    // Hỏi `total` TUẦN TỰ (không song song): mỗi request tiêu một permit của CÙNG
    // limiter khi wiring bọc throttledTransport — bắn song song là "gọi dồn dập".
    const totalNormal = await deps.layTotal(
      kiem.token,
      msg.direction,
      "normal",
      msg.dateFrom,
      msg.dateTo,
    );
    const totalSco = await deps.layTotal(
      kiem.token,
      msg.direction,
      "sco",
      msg.dateFrom,
      msg.dateTo,
    );
    const dem = await deps.demTheoNguon(msg.tenantId, msg.direction, msg.period);
    const quyetDinh = decideAudit(
      [
        { family: "normal", total: totalNormal, dbCount: dem.normal },
        { family: "sco", total: totalSco, dbCount: dem.sco },
      ],
      msg.vong,
      msg.prevCount,
    );
    await deps.limiter.recordResult(true);

    if (quyetDinh.kind === "du") {
      // Vòng 0: chưa có run nào để chốt → ghi MỘT bản ghi "đã kiểm, đủ" (phân biệt
      // "đã phủ, đủ" với "chưa từng kiểm" — cùng mẫu U22 B1). Vòng ≥1: chốt run đang mở.
      if (msg.lanDongBoId) {
        await deps.chotRun(msg.tenantId, msg.lanDongBoId, { trangThai: "completed" });
      } else {
        await deps.ghiDu(msg);
      }
      return { kind: "completed" };
    }

    if (quyetDinh.kind === "dung") {
      // Chịu dừng dù còn hụt (bão hòa hoặc chạm TRAN_VONG_DELTA): `total` GDT tự nó dao
      // động ±~4% nên kéo mãi vô ích. Ghi rõ số hụt vào run để người vận hành thấy và
      // quyết định force thủ công, KHÔNG âm thầm coi là đủ.
      if (msg.lanDongBoId) {
        await deps.chotRun(msg.tenantId, msg.lanDongBoId, {
          trangThai: "completed",
          thongDiepLoi: `delta hội tụ nhưng còn hụt ~${quyetDinh.hutConLai} HĐ so total GDT (total bất ổn) sau ${msg.vong} vòng`,
        });
      }
      return { kind: "completed" };
    }

    // KÉO — mở run (vòng 0) hoặc dùng run sẵn; enqueue MỘT message kéo họ đầu, các họ
    // còn lại xếp `conLai` (một họ đang kéo tại một thời điểm → không dồn dập GDT).
    const runCoSan = msg.lanDongBoId;
    const lanDongBoId = runCoSan ?? (await deps.moRun(msg));
    const [family, ...conLai] = quyetDinh.families;
    if (!family) return { kind: "completed" }; // decideAudit "keo" luôn có ≥1 họ (phòng hờ)
    try {
      await deps.enqueue([
        {
          kind: "delta",
          tenantId: msg.tenantId,
          taikhoanId: msg.taikhoanId,
          direction: msg.direction,
          dateFrom: msg.dateFrom,
          dateTo: msg.dateTo,
          period: msg.period,
          lanDongBoId,
          family,
          conLai,
          vong: msg.vong + 1,
          prevCount: dem.normal + dem.sco,
        },
      ]);
    } catch (err) {
      // Run VỪA mở nhưng message kéo KHÔNG vào được queue: lượt giao lại vẫn có
      // `msg.lanDongBoId` undefined nên sẽ mở run MỚI ⇒ run này treo `running` vĩnh
      // viễn, làm nhiễu sổ đồng bộ. Tự dọn (chốt failed) trước khi trả retry. Nếu là
      // run CÓ SẴN (vòng ≥1) thì KHÔNG chốt — lượt sau còn nối tiếp vào đúng run đó.
      if (!runCoSan) {
        await deps.chotRun(msg.tenantId, lanDongBoId, {
          trangThai: "failed",
          thongDiepLoi: "khong enqueue duoc message keo lo dau (run vua mo, se mo lai o luot sau)",
        });
      }
      throw err; // để catch ngoài phân loại (transient → retry + ghi thất bại limiter)
    }
    return { kind: "completed" };
  } catch (err) {
    return xuLyLoiAudit(deps, msg, err);
  }
}

/** Message NỐI chuỗi sau một lô thành công. `state`/`bpAttempt` được LOẠI BỎ khỏi bản
 * sao (destructuring) thay vì gán `undefined`: message nào cũng đi qua JSON của queue,
 * giữ hình dạng sạch để so khớp và để `bpAttempt` khởi động lại từ 0 sau tiến độ thật. */
function messageKeTiep(msg: DeltaPullMessage, kq: ChunkOutcome): VatSyncQueueMessage {
  const { state: _state, bpAttempt: _bpAttempt, ...goc } = msg;

  // Chưa hết trang → kéo tiếp CHÍNH họ này từ con trỏ mới.
  if (!kq.done) return { ...goc, ...(kq.state ? { state: kq.state } : {}) };

  // Hết trang họ này mà còn họ chờ → chuyển họ, con trỏ về đầu.
  const [ke, ...conLai] = msg.conLai;
  if (ke) return { ...goc, family: ke, conLai };

  // Hết mọi họ của vòng này → KIỂM LẠI (audit) để biết đã đủ chưa. Việc CHỐT run là
  // của vòng audit hội tụ, không phải của delta.
  return {
    kind: "audit",
    tenantId: msg.tenantId,
    taikhoanId: msg.taikhoanId,
    direction: msg.direction,
    dateFrom: msg.dateFrom,
    dateTo: msg.dateTo,
    period: msg.period,
    vong: msg.vong,
    lanDongBoId: msg.lanDongBoId,
    prevCount: msg.prevCount,
  };
}

export async function runDeltaJob(deps: DeltaJobDeps, msg: DeltaPullMessage): Promise<JobOutcome> {
  const kiem = await tienKiem(deps, msg);
  if (!kiem.ok) return kiem.outcome;

  const kq = await deps.keoChunk(msg, kiem.token);

  if (kq.trangThai === "failed") {
    // Cùng quy ước với runScheduledSync (sự cố 2026-07-18): 401 và trần nền tảng cục
    // bộ KHÔNG nói lên sức khỏe đường ra GDT ⇒ không mở breaker oan.
    const laTinHieuSucKhoeGdt =
      kq.failureKind !== "session_expired" && kq.failureKind !== "local_limit";
    if (laTinHieuSucKhoeGdt) await deps.limiter.recordResult(false);

    if (kq.failureKind === "session_expired") {
      // Token chết giữa chuỗi: chốt run đang mở là `can_dang_nhap_lai` (không để run
      // treo `running` mãi) rồi dừng chuỗi — chờ người dùng đăng nhập lại (U1/captcha).
      await deps.recorder.reauthRuntime(msg, "session_expired");
      await deps.chotRun(msg.tenantId, msg.lanDongBoId, { trangThai: "can_dang_nhap_lai" });
      return { kind: "needs_reauth", reason: "session_expired" };
    }
    if (kq.failureKind === "rate_limited") {
      return { kind: "retry_backpressure", reason: "rate_limited" };
    }
    if (kq.failureKind === "local_limit") {
      // XÁC MINH SUBREQUEST: log tường minh để chốt nguyên nhân trần (gói Workers Paid
      // ≠ zone Pro). Chunk theo trang lẽ ra đã đưa một lô xuống dưới trần — nếu vẫn
      // đụng, hạ DELTA_CHUNK_PAGES. KHÔNG log token/nội dung hóa đơn (security.md).
      console.warn(
        `[delta] local_limit: chunkPages=${deps.chunkPages} kỳ=${msg.period} họ=${msg.family} — kiểm gói Workers (Paid≠zone Pro) + hạ DELTA_CHUNK_PAGES nếu tái diễn`,
      );
    }
    // Lỗi tạm: KHÔNG enqueue message nối tiếp — message HIỆN TẠI (còn nguyên `state`)
    // được queue giao lại, nối đúng chỗ từ checkpoint mà syncChunk KHÔNG đụng khi lỗi.
    return { kind: "retry", reason: kq.thongDiepLoi ?? "transient" };
  }

  await deps.limiter.recordResult(true);

  // Pha 2 (dòng hàng): enqueue lỗi → RETRY cả lô (không nuốt im lặng). Lô là idempotent
  // (upsert theo khóa tự nhiên) nên chạy lại vô hại.
  if (kq.detailCandidates.length > 0) {
    try {
      await deps.enqueueDetail(buildDetailMessages(msg, kq.detailCandidates));
    } catch (err) {
      return {
        kind: "retry",
        reason: `enqueue_detail_that_bai: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  try {
    await deps.enqueue([messageKeTiep(msg, kq)]);
  } catch (err) {
    // Mất message nối chuỗi = chuỗi ĐỨT im lặng (run treo `running`). Retry cả lô —
    // upsert idempotent nên kéo lại cùng trang không nhân đôi hóa đơn.
    return {
      kind: "retry",
      reason: `enqueue_ke_tiep_that_bai: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  return { kind: "completed" };
}

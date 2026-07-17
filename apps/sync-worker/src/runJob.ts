// U9 — Điều phối MỘT job đồng bộ nền (một tenant, một tài khoản, một chiều, một kỳ).
// THUẦN LOGIC, phụ thuộc tiêm (loadAccount/limiter/sync/recorder) → test offline.
// Cô lập adapter: KHÔNG tự fetch GDT, chỉ truyền transport cho sync() (U5). Quyết
// định RETRY hay không dựa `SyncResult.failureKind` (không dò chuỗi lỗi).
import type { JobOutcome, RunJobDeps, SyncJobMessage } from "./types";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function runScheduledSync(deps: RunJobDeps, msg: SyncJobMessage): Promise<JobOutcome> {
  const account = await deps.loadAccount(msg);

  // Tài khoản không còn tồn tại (xóa giữa enqueue↔consume): KHÔNG ghi reauth (tránh
  // FK mồ côi tới tai_khoan_thue). Để queue thử lại có trần → dead-letter cho người xử lý.
  if (!account) {
    return { kind: "retry", reason: "tai_khoan_khong_ton_tai" };
  }

  // Pre-flight token (quyết định A): token rỗng/hết hạn → KHÔNG gọi GDT, KHÔNG tự
  // đăng nhập, KHÔNG captcha (ranh giới Hiến pháp). Ghi "cần đăng nhập lại".
  const now = deps.now();
  if (!account.tokenHienTai || !account.tokenHetHan || account.tokenHetHan.getTime() <= now) {
    await deps.recorder.reauthPreflight(msg, "token_het_han");
    return { kind: "needs_reauth", reason: "token_het_han" };
  }
  const token = account.tokenHienTai;

  // Rate limit + circuit breaker (Durable Object per tenant/MST) TRƯỚC khi gọi GDT.
  const permit = await deps.limiter.tryAcquire();
  if (!permit.allowed) {
    if (permit.reason === "breaker_open") {
      // Máy chủ thuế đang lỗi/đã ngắt mạch → KHÔNG gọi GDT lúc này. H-B.4: reenqueue
      // có delay (backpressure) thay vì bỏ tick — breaker chỉ mở TẠM, không được làm
      // mất cả kỳ đồng bộ. KHÔNG tính vào max_retries. Vẫn ghi audit (breakerSkip).
      await deps.recorder.breakerSkip(msg);
      return { kind: "retry_backpressure", reason: "breaker_open" };
    }
    // Hết token trong giỏ → ĐẨY LÙI: reenqueue có delay (không phải lỗi, không ghi vết,
    // KHÔNG tính max_retries — H-B.4). Giỏ token tự đầy lại theo thời gian.
    return { kind: "retry_backpressure", reason: "rate_limited" };
  }

  // Gọi dịch vụ đồng bộ idempotent (U5). db đã bound sẵn vào deps.sync.
  let result: Awaited<ReturnType<RunJobDeps["sync"]>>;
  try {
    result = await deps.sync({
      transport: deps.transport,
      token,
      tenantId: msg.tenantId,
      taikhoanId: msg.taikhoanId,
      direction: msg.direction,
      dateFrom: msg.dateFrom,
      dateTo: msg.dateTo,
      includeSco: deps.syncParams?.includeSco,
      size: deps.syncParams?.size,
      statuses: deps.syncParams?.statuses,
      retry: deps.syncParams?.retry,
    });
  } catch (err) {
    // sync() thường TỰ nuốt lỗi → "failed"; ném ra đây là bất ngờ (vd cấu hình sai).
    // Coi là tạm thời có trần queue làm chốt chặn.
    await deps.limiter.recordResult(false);
    return { kind: "retry", reason: errMsg(err) };
  }

  if (result.trangThai === "completed") {
    await deps.limiter.recordResult(true);
    return {
      kind: "completed",
      lanDongBoId: result.lanDongBoId,
      soHdMoi: result.soHdMoi,
      soHdCapNhat: result.soHdCapNhat,
    };
  }

  // Thất bại: cập nhật breaker rồi phân loại theo failureKind.
  await deps.limiter.recordResult(false);
  if (result.failureKind === "session_expired") {
    // 401 runtime: token chết → KHÔNG retry (retry token chết là vô ích + thiếu tôn
    // trọng máy chủ thuế). Đánh dấu cần đăng nhập lại; người dùng đăng nhập lại (U1/captcha).
    await deps.recorder.reauthRuntime(msg, "session_expired");
    return { kind: "needs_reauth", reason: "session_expired" };
  }
  if (result.failureKind === "rate_limited") {
    // 429 kiệt lượt retry adapter (U25): GDT đang giới hạn tốc độ → ĐẨY LÙI qua đường
    // backpressure đã có (fanout.ts) — reenqueue có delay, KHÔNG tính max_retries.
    // Retry thật ở đây sẽ đập lại GDT đúng lúc đang bị chặn (vi phạm "tôn trọng máy
    // chủ thuế", CLAUDE.md §Ranh giới đạo đức).
    return { kind: "retry_backpressure", reason: "rate_limited" };
  }
  // Lỗi tạm khác (mạng/5xx/DB) → retry qua queue.
  return { kind: "retry", reason: result.thongDiepLoi ?? "transient" };
}

// U26 (pha 2) — Điều phối MỘT message chi tiết: một hóa đơn / message, 1 permit
// TenantLimiter / request GDT (trả nợ permit-per-request của kiến trúc queue 2 pha).
// THUẦN LOGIC, phụ thuộc tiêm (loadAccount/limiter/fetchLines/persistLines) → test
// offline. Cô lập adapter: KHÔNG tự fetch GDT (fetchLines do wiring dựng trên
// adapterFetchDetail). Phân loại lỗi bằng GdtError.code/httpStatus — không dò chuỗi.
//
// KHÔNG ghi lan_dong_bo ở pha 2: lan_dong_bo là sổ theo KỲ header (ngữ nghĩa
// "completed = header xong" mà U22 B3/B6 dựa vào). Quan sát pha 2 = structured log
// (không giá trị dòng hàng/token — security.md) + DLQ.
import { GdtError } from "@vat/gdt-client";
import type { InvoiceLine } from "@vat/gdt-client";
import type { DetailSyncMessage } from "@vat/sync";
import { consumerAction } from "./fanout";
import type { QueueAction } from "./fanout";
import type { AccountToken, TenantLimiterClient } from "./types";

/** Kết quả xử lý một message chi tiết — ánh xạ sang hành động queue ở `detailConsumerAction`. */
export type DetailJobOutcome =
  | { kind: "completed"; soDong: number }
  /** Bỏ qua CÓ CHỦ ĐÍCH (ack + cảnh báo): token hết hạn (chờ người đăng nhập lại —
   * retry vô ích) hoặc sco+404 (endpoint sco detail CHƯA KIỂM CHỨNG — không để một
   * giả định kéo message lặp vô hạn). */
  | { kind: "ack_skip"; reason: "token_het_han" | "sco_404" }
  | { kind: "needs_reauth"; reason: string }
  | { kind: "retry_backpressure"; reason: "rate_limited" | "breaker_open" }
  | { kind: "retry"; reason: string };

// Phụ thuộc tiêm cho runDetailJob (test offline; production dựng ở deps.ts).
export interface RunDetailJobDeps {
  now(): number;
  loadAccount(msg: { tenantId: string; taikhoanId: string }): Promise<AccountToken | null>;
  limiter: TenantLimiterClient;
  /** Lấy dòng hàng MỘT hóa đơn qua adapter (getInvoiceDetail + mapDetailLines). */
  fetchLines(token: string, ref: DetailSyncMessage["ref"]): Promise<InvoiceLine[]>;
  /** Persist idempotent xóa-chèn (withTenant + persistInvoiceLines). */
  persistLines(tenantId: string, hoaDonId: string, lines: InvoiceLine[]): Promise<void>;
  /** 401 runtime: token chết → xóa token + audit (mirror JobRecorder.reauthRuntime). */
  markTokenDead(msg: DetailSyncMessage, reason: string): Promise<void>;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function runDetailJob(
  deps: RunDetailJobDeps,
  msg: DetailSyncMessage,
): Promise<DetailJobOutcome> {
  const account = await deps.loadAccount(msg);
  // Tài khoản bị xóa giữa enqueue↔consume → retry có trần → DLQ (người xử lý thấy).
  if (!account) return { kind: "retry", reason: "tai_khoan_khong_ton_tai" };

  // Pre-flight token: hết hạn/rỗng → ack + cảnh báo. KHÔNG ghi reauth per-message
  // (job header đã ghi 1 bản ghi "cần đăng nhập lại" — N message detail không được
  // tạo N bản ghi trùng). Sau khi đăng nhập lại: kỳ hiện tại tự lành qua vế "thiếu
  // dòng hàng" của detailCandidates; kỳ cũ chạy lại trigger backfill-lines.
  const now = deps.now();
  if (!account.tokenHienTai || !account.tokenHetHan || account.tokenHetHan.getTime() <= now) {
    console.warn(
      `Bỏ message chi tiết: token hết hạn (tenant=${msg.tenantId} hoadon=${msg.hoaDonId}).`,
    );
    return { kind: "ack_skip", reason: "token_het_han" };
  }
  const token = account.tokenHienTai;

  // 1 permit / request GDT — rate limit + circuit breaker TRƯỚC khi gọi.
  const permit = await deps.limiter.tryAcquire();
  if (!permit.allowed) {
    return {
      kind: "retry_backpressure",
      reason: permit.reason === "breaker_open" ? "breaker_open" : "rate_limited",
    };
  }

  let lines: InvoiceLine[];
  try {
    lines = await deps.fetchLines(token, msg.ref);
  } catch (err) {
    if (err instanceof GdtError && err.code === "SESSION_EXPIRED") {
      // Token chết runtime: xóa để pre-flight các message sau bỏ qua sạch.
      await deps.markTokenDead(msg, "session_expired");
      await deps.limiter.recordResult(false);
      return { kind: "needs_reauth", reason: "session_expired" };
    }
    if (err instanceof GdtError && err.httpStatus === 429) {
      // GDT đẩy lùi → ghi thất bại (đủ liên tiếp sẽ mở breaker chặn cả giỏ) +
      // reenqueue có delay, KHÔNG message.retry() dồn dập.
      await deps.limiter.recordResult(false);
      return { kind: "retry_backpressure", reason: "rate_limited" };
    }
    if (err instanceof GdtError && err.httpStatus === 404 && msg.ref.source === "sco") {
      // CHƯA KIỂM CHỨNG (endpoints.ts): sco detail suy từ đối xứng. 404 ở đây nhiều
      // khả năng là "không áp dụng" — ack có cảnh báo, KHÔNG retry vô hạn, KHÔNG mở
      // breaker (GDT trả lời nhanh, không phải sự cố hạ tầng). Gỡ nhãn bằng contract
      // test sco thật (U26-plan §6) rồi mới xét xử lý chặt hơn.
      console.warn(
        `Bỏ message chi tiết sco (HTTP 404 — endpoint sco detail CHƯA KIỂM CHỨNG): tenant=${msg.tenantId} hoadon=${msg.hoaDonId}.`,
      );
      await deps.limiter.recordResult(true);
      return { kind: "ack_skip", reason: "sco_404" };
    }
    // 404 normal (bất thường) / 5xx / timeout / lỗi mạng → lỗi tạm: queue thử lại
    // có trần max_retries → DLQ. Không nuốt im lặng.
    await deps.limiter.recordResult(false);
    return { kind: "retry", reason: errMsg(err) };
  }

  try {
    // Persist idempotent (xóa-chèn theo hoadon_id+tenant) — cả khi lines rỗng: xóa
    // dòng cũ để khớp nguồn (quyết định C).
    await deps.persistLines(msg.tenantId, msg.hoaDonId, lines);
  } catch (err) {
    // Lỗi DB → retry; GDT đã trả lời OK nên KHÔNG tính thất bại vào breaker (breaker
    // đo sức khỏe đường GDT, không phải DB).
    await deps.limiter.recordResult(true);
    return { kind: "retry", reason: errMsg(err) };
  }

  await deps.limiter.recordResult(true);
  if (lines.length === 0) {
    // Kiểm hợp đồng MỀM của detail (thiếu hdhhdvu chỉ cảnh báo — U3): thành công với
    // 0 dòng là hợp lệ nhưng đáng chú ý. KHÔNG log giá trị dòng hàng (security.md).
    console.warn(
      `Hóa đơn ${msg.hoaDonId} (tenant=${msg.tenantId}): GDT trả 0 dòng hàng (hdhhdvu rỗng/thiếu).`,
    );
  }
  return { kind: "completed", soDong: lines.length };
}

/**
 * Ánh xạ outcome pha 2 → hành động hàng đợi. Tái dùng `consumerAction` (H-B.4) cho
 * các nhánh chung; riêng `ack_skip` là ack có chủ đích (đã cảnh báo trong runDetailJob).
 */
export function detailConsumerAction(
  outcome: DetailJobOutcome,
  opts: { backpressureDelaySeconds: number; bpAttempt: number; maxBackpressure: number },
): QueueAction {
  switch (outcome.kind) {
    case "completed":
    case "ack_skip":
      return { type: "ack" };
    case "needs_reauth":
      return consumerAction({ kind: "needs_reauth", reason: outcome.reason }, opts);
    case "retry_backpressure":
      return consumerAction({ kind: "retry_backpressure", reason: outcome.reason }, opts);
    case "retry":
      return consumerAction({ kind: "retry", reason: outcome.reason }, opts);
  }
}

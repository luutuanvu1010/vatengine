// U37a (lát 3) — Điều phối MỘT message tải HỒ SƠ GỐC hóa đơn: một hóa đơn / message,
// 1 permit TenantLimiter / request GDT (cùng kỷ luật pha 2 của U26).
// THUẦN LOGIC, phụ thuộc tiêm → test offline. Cô lập adapter: KHÔNG tự fetch GDT.
// Phân loại lỗi bằng GdtError.code/httpStatus — không dò chuỗi.
//
// KHÔNG ghi lan_dong_bo: đó là sổ theo KỲ header. Quan sát ở đây = bảng `tep_hoa_don_goc`
// (trạng thái từng hóa đơn) + structured log + DLQ.
import { GdtError } from "@vat/gdt-client";
import type { HoSoGocDaTach, HoSoGocMessage } from "@vat/sync";
import { tachHoSoGoc } from "@vat/sync";
import { consumerAction } from "./fanout";
import type { QueueAction } from "./fanout";
import type { AccountToken, TenantLimiterClient } from "./types";

/** Kết quả xử lý một message hồ sơ gốc. */
export type HoSoGocOutcome =
  | { kind: "completed"; soByte: number }
  /**
   * Bỏ qua CÓ CHỦ ĐÍCH (ack):
   * - `da_co`: hồ sơ gốc đã nằm trong kho — hồ sơ gốc BẤT BIẾN nên tải lại là vô nghĩa;
   * - `token_het_han`: chờ người đăng nhập lại, retry vô ích (job header đã ghi 1 bản
   *   ghi "cần đăng nhập lại"; N message không được tạo N bản ghi trùng);
   * - `khong_co_ho_so_goc`: GDT KHÔNG có bản gốc cho hóa đơn này. Là kết quả HỢP LỆ,
   *   không phải sự cố — đã ghi vào sổ để lần sau không hỏi lại.
   */
  | { kind: "ack_skip"; reason: "da_co" | "token_het_han" | "khong_co_ho_so_goc" }
  | { kind: "needs_reauth"; reason: string }
  | { kind: "retry_backpressure"; reason: "rate_limited" | "breaker_open" }
  | { kind: "retry"; reason: string };

export interface RunHoSoGocJobDeps {
  now(): number;
  loadAccount(msg: { tenantId: string; taikhoanId: string }): Promise<AccountToken | null>;
  limiter: TenantLimiterClient;
  /** Kho đã có hồ sơ gốc của hóa đơn này chưa (kể cả bản ghi "không có hồ sơ gốc")? */
  daCo(tenantId: string, hoaDonId: string): Promise<boolean>;
  /** Tải gói ZIP qua adapter (`getInvoiceOriginalZip`). */
  taiHoSoGoc(token: string, ref: HoSoGocMessage["ref"]): Promise<Uint8Array>;
  /** Ghi R2 (xml + html + tài nguyên chung) và upsert `tep_hoa_don_goc`. */
  luuHoSoGoc(tenantId: string, hoaDonId: string, daTach: HoSoGocDaTach): Promise<void>;
  /** Upsert `tep_hoa_don_goc` trạng thái `khong_co_ho_so_goc` — không có tệp nào để ghi. */
  ghiNhanKhongCoHoSoGoc(tenantId: string, hoaDonId: string, maLoi: string): Promise<void>;
  /** 401 runtime: token chết → xóa token + audit. */
  markTokenDead(msg: HoSoGocMessage, reason: string): Promise<void>;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function runHoSoGocJob(
  deps: RunHoSoGocJobDeps,
  msg: HoSoGocMessage,
): Promise<HoSoGocOutcome> {
  // TRƯỚC MỌI THỨ KHÁC: hồ sơ gốc bất biến ⇒ đã có thì thôi. Đây là toàn bộ lý do tồn
  // tại của kho — chạy lại một kỳ đã tải không tốn request nào tới máy chủ thuế
  // (Hiến pháp: "Tôn trọng máy chủ thuế… Không gọi dồn dập").
  if (await deps.daCo(msg.tenantId, msg.hoaDonId)) {
    return { kind: "ack_skip", reason: "da_co" };
  }

  const account = await deps.loadAccount(msg);
  // Tài khoản bị xóa giữa enqueue↔consume → retry có trần → DLQ (người xử lý thấy).
  if (!account) return { kind: "retry", reason: "tai_khoan_khong_ton_tai" };

  const now = deps.now();
  if (!account.tokenHienTai || !account.tokenHetHan || account.tokenHetHan.getTime() <= now) {
    console.warn(
      `Bỏ message hồ sơ gốc: token hết hạn (tenant=${msg.tenantId} hoadon=${msg.hoaDonId}).`,
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

  let zip: Uint8Array;
  try {
    zip = await deps.taiHoSoGoc(token, msg.ref);
  } catch (err) {
    if (err instanceof GdtError && err.code === "SESSION_EXPIRED") {
      await deps.markTokenDead(msg, "session_expired");
      await deps.limiter.recordResult(false);
      return { kind: "needs_reauth", reason: "session_expired" };
    }
    if (err instanceof GdtError && err.code === "NO_SOURCE_DOCUMENT") {
      // GDT trả lời NHANH và ĐÚNG — chỉ là hóa đơn này không có bản gốc (~19,9% nhóm
      // purchase/normal, U37 §4.6). Ghi `true` cho breaker: tính thất bại ở đây sẽ mở
      // breaker oan và chặn cả giỏ hóa đơn khỏe. Ghi sổ để lần sau `daCo` chặn từ đầu.
      await deps.limiter.recordResult(true);
      await deps.ghiNhanKhongCoHoSoGoc(msg.tenantId, msg.hoaDonId, err.code);
      console.warn(
        `Hóa đơn ${msg.hoaDonId} (tenant=${msg.tenantId}): GDT không có hồ sơ gốc — ghi sổ, không thử lại.`,
      );
      return { kind: "ack_skip", reason: "khong_co_ho_so_goc" };
    }
    if (err instanceof GdtError && err.httpStatus === 429) {
      await deps.limiter.recordResult(false);
      return { kind: "retry_backpressure", reason: "rate_limited" };
    }
    // 5xx thật / timeout / lỗi mạng → lỗi tạm: queue thử lại có trần → DLQ.
    await deps.limiter.recordResult(false);
    return { kind: "retry", reason: errMsg(err) };
  }

  // Từ đây GDT đã trả lời OK — mọi thất bại phía sau là của TA, không tính vào breaker
  // (breaker đo sức khỏe đường GDT, không phải đường R2/DB của mình).
  let daTach: HoSoGocDaTach;
  try {
    daTach = tachHoSoGoc(zip);
  } catch (err) {
    await deps.limiter.recordResult(true);
    return { kind: "retry", reason: errMsg(err) };
  }

  try {
    await deps.luuHoSoGoc(msg.tenantId, msg.hoaDonId, daTach);
  } catch (err) {
    await deps.limiter.recordResult(true);
    return { kind: "retry", reason: errMsg(err) };
  }

  await deps.limiter.recordResult(true);
  return { kind: "completed", soByte: daTach.xml.length + daTach.html.length };
}

/** Ánh xạ outcome → hành động hàng đợi. Mirror `detailConsumerAction` (U26). */
export function hoSoGocConsumerAction(
  outcome: HoSoGocOutcome,
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

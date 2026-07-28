// H-B.6 — Xử lý job rơi dead-letter (vat-sync-dlq). Phần THUẦN (dlqRecord) test offline;
// phần ghi DB (dlqConsume) ở Task 4. "CRITICAL" mã hoá qua hanh_dong (audit_log không có
// cột severity — không đổi schema).
import { maskSensitive } from "@vat/crypto";
import { auditLog, dongBoThatBai, withTenant } from "@vat/db";
import {
  type VatSyncQueueMessage,
  chotDeltaRun,
  isAuditMessage,
  isDeltaMessage,
  isDetailMessage,
  isHoSoGocMessage,
} from "@vat/sync";
import type { AnyDb } from "./types";

export const AUDIT_HANH_DONG_DLQ = "dong_bo_that_bai_dlq";

// I2 — thêm "audit"/"delta" (Task 6): trước đây hai loại này rơi vào nhánh mặc định
// "header" (dán nhãn sai — audit/delta không phải job cả kỳ).
export interface DlqRecord {
  loai: "header" | "detail" | "audit" | "delta" | "hoso";
  lyDo: string;
  doiTuong: string;
  payload: VatSyncQueueMessage;
}

/** Ánh xạ MỘT message DLQ → hàng sổ. lyDo mặc định 'max_retries' — Cloudflare Queues
 * KHÔNG truyền cho consumer DLQ lý do message vào DLQ (CHƯA KIỂM CHỨNG cách phân biệt
 * backpressure_cap; nếu cần, phải nhúng cờ vào body ở H-B.4 — ngoài phạm vi).
 *
 * I2 — thứ tự guard mirror `phanLoaiMessage` (fanout.ts): detail trước (có `hoaDonId`
 * riêng), rồi audit/delta (đều có `kind` tường minh), "header" là fallthrough CUỐI
 * (message không `kind` — tương thích lùi). */
export function dlqRecord(body: VatSyncQueueMessage): DlqRecord {
  if (isDetailMessage(body)) {
    return {
      loai: "detail",
      lyDo: "max_retries",
      doiTuong: `hoadon:${body.hoaDonId}`,
      payload: body,
    };
  }
  if (isAuditMessage(body)) {
    return {
      loai: "audit",
      lyDo: "max_retries",
      doiTuong: `ky:${body.period}:${body.direction}`,
      payload: body,
    };
  }
  if (isDeltaMessage(body)) {
    return {
      loai: "delta",
      lyDo: "max_retries",
      doiTuong: `ky:${body.period}:${body.direction}`,
      payload: body,
    };
  }
  // U37a — như `detail`, message này định danh theo HÓA ĐƠN chứ không theo kỳ/chiều.
  if (isHoSoGocMessage(body)) {
    return {
      loai: "hoso",
      lyDo: "max_retries",
      doiTuong: `hoadon:${body.hoaDonId}`,
      payload: body,
    };
  }
  return {
    loai: "header",
    lyDo: "max_retries",
    doiTuong: `ky:${body.period}:${body.direction}`,
    payload: body,
  };
}

/** Ghi bền MỘT job DLQ + audit CRITICAL. Gọi trong queue() khi batch.queue === 'vat-sync-dlq'.
 * "CRITICAL" mã hoá qua hanh_dong AUDIT_HANH_DONG_DLQ (audit_log không có cột severity) +
 * console.error (quan sát ngoài audit, đủ để cấu hình cảnh báo Workers Logs).
 *
 * I2 — một message audit/delta rơi DLQ (vượt max_retries/bpAttempt trần) có thể mang
 * theo một run `lan_dong_bo` ĐANG MỞ (`running`) mà không còn ai kéo tiếp/kiểm lại
 * nữa — trước khi vá, dlqConsume chỉ ghi sổ rồi ack, để run đó treo `running` vĩnh
 * viễn. CHỐT run (nếu có) TRƯỚC KHI trả về (index.ts chỉ ack SAU khi dlqConsume
 * resolve) — lỗi khi chốt ném ra ngoài, được index.ts xử lý y hệt lỗi ghi sổ (retry
 * của DLQ consumer, trần max_retries:3 làm chốt cuối). */
export async function dlqConsume(db: AnyDb, body: VatSyncQueueMessage): Promise<void> {
  const rec = dlqRecord(body);
  await withTenant(db, body.tenantId, async (tx) => {
    await tx.insert(dongBoThatBai).values({
      tenantId: body.tenantId,
      loai: rec.loai,
      payload: rec.payload,
      lyDo: rec.lyDo,
    });
    await tx.insert(auditLog).values({
      tenantId: body.tenantId,
      hanhDong: AUDIT_HANH_DONG_DLQ,
      doiTuong: rec.doiTuong,
      // security.md "che trước khi ghi": mask chi_tiet trước khi ghi (payload có thể
      // mang dữ liệu nhạy cảm lẫn vào chuỗi lỗi).
      chiTiet: maskSensitive({ loai: rec.loai, lyDo: rec.lyDo, payload: rec.payload }),
    });
  });

  // I2 — delta LUÔN mang lanDongBoId của run đang mở; audit chỉ mang khi ≥ vòng 1
  // (vòng 0 chưa mở run nào → không có gì để chốt).
  const lanDongBoId = isDeltaMessage(body)
    ? body.lanDongBoId
    : isAuditMessage(body)
      ? body.lanDongBoId
      : undefined;
  if (lanDongBoId) {
    await chotDeltaRun(db, body.tenantId, lanDongBoId, {
      trangThai: "failed",
      thongDiepLoi: "message rơi dead-letter (max_retries/bpAttempt trần)",
    });
  }

  // Quan sát runtime (Workers Logs) ngoài audit_log — không log body thô ở mức cao hơn
  // ở nơi khác; đây là log CÓ CHỦ ĐÍCH cho tín hiệu CRITICAL, không chứa payload/token.
  console.error(`[DLQ-CRITICAL] tenant=${body.tenantId} ${rec.doiTuong} lyDo=${rec.lyDo}`);
}

// H-B.6 — Xử lý job rơi dead-letter (vat-sync-dlq). Phần THUẦN (dlqRecord) test offline;
// phần ghi DB (dlqConsume) ở Task 4. "CRITICAL" mã hoá qua hanh_dong (audit_log không có
// cột severity — không đổi schema).
import { maskSensitive } from "@vat/crypto";
import { auditLog, dongBoThatBai, withTenant } from "@vat/db";
import { type VatSyncQueueMessage, isDetailMessage } from "@vat/sync";
import type { AnyDb } from "./types";

export const AUDIT_HANH_DONG_DLQ = "dong_bo_that_bai_dlq";

export interface DlqRecord {
  loai: "header" | "detail";
  lyDo: string;
  doiTuong: string;
  payload: VatSyncQueueMessage;
}

/** Ánh xạ MỘT message DLQ → hàng sổ. lyDo mặc định 'max_retries' — Cloudflare Queues
 * KHÔNG truyền cho consumer DLQ lý do message vào DLQ (CHƯA KIỂM CHỨNG cách phân biệt
 * backpressure_cap; nếu cần, phải nhúng cờ vào body ở H-B.4 — ngoài phạm vi). */
export function dlqRecord(body: VatSyncQueueMessage): DlqRecord {
  if (isDetailMessage(body)) {
    return {
      loai: "detail",
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
 * console.error (quan sát ngoài audit, đủ để cấu hình cảnh báo Workers Logs). */
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
  // Quan sát runtime (Workers Logs) ngoài audit_log — không log body thô ở mức cao hơn
  // ở nơi khác; đây là log CÓ CHỦ ĐÍCH cho tín hiệu CRITICAL, không chứa payload/token.
  console.error(`[DLQ-CRITICAL] tenant=${body.tenantId} ${rec.doiTuong} lyDo=${rec.lyDo}`);
}

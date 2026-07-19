// H-B.6 — Xử lý job rơi dead-letter (vat-sync-dlq). Phần THUẦN (dlqRecord) test offline;
// phần ghi DB (dlqConsume) ở Task 4. "CRITICAL" mã hoá qua hanh_dong (audit_log không có
// cột severity — không đổi schema).
import { type VatSyncQueueMessage, isDetailMessage } from "@vat/sync";

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

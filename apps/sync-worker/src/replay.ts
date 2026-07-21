import { TRANG_THAI_DA_DAU, TRANG_THAI_DA_PHAT_LAI, dongBoThatBai, withTenant } from "@vat/db";
import type { VatSyncQueueMessage } from "@vat/sync";
// H-B.6 — Phát lại THỦ CÔNG job DLQ đã đậu. Endpoint sau Cloudflare Access (con người
// giữ quyền quyết định — Hiến pháp). Reset bpAttempt=0 để job thử lại đầy đủ; nếu egress
// vẫn hỏng, gate (Task 5/6) + backpressure H-B.4 lại xử lý đúng.
import { and, eq, inArray } from "drizzle-orm";
import type { AnyDb } from "./types";

/** Thuần — dựng message phát lại từ các hàng sổ (reset bpAttempt để job thử lại đầy đủ). */
export function replayMessages(rows: { payload: unknown }[]): VatSyncQueueMessage[] {
  return rows.map((r) => ({ ...(r.payload as VatSyncQueueMessage), bpAttempt: 0 }));
}

export async function replayDeadLetters(
  db: AnyDb,
  queue: Queue<VatSyncQueueMessage>,
  opts: { tenantId: string; ids?: string[] },
): Promise<{ daPhatLai: number }> {
  return withTenant(db, opts.tenantId, async (tx) => {
    const where = opts.ids?.length
      ? and(eq(dongBoThatBai.trangThai, TRANG_THAI_DA_DAU), inArray(dongBoThatBai.id, opts.ids))
      : eq(dongBoThatBai.trangThai, TRANG_THAI_DA_DAU);
    const rows = (await tx.select().from(dongBoThatBai).where(where)) as {
      id: string;
      payload: unknown;
    }[];
    const msgs = replayMessages(rows);
    // msgs.length === rows.length (map 1-1 trong replayMessages) — cast an toàn theo
    // cấu trúc, tránh noUncheckedIndexedAccess báo `T | undefined` khi zip 2 mảng.
    for (const [i, row] of rows.entries()) {
      await queue.send(msgs[i] as VatSyncQueueMessage);
      await tx
        .update(dongBoThatBai)
        .set({ trangThai: TRANG_THAI_DA_PHAT_LAI, phatLaiLuc: new Date() })
        .where(eq(dongBoThatBai.id, row.id));
    }
    return { daPhatLai: rows.length };
  });
}

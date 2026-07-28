// U35 (A6) — badge "Hóa đơn vừa thay đổi (N)" + panel liệt kê, trên màn Tra cứu hóa đơn.
// Đọc /invoices/changes (nhẹ, tức thời — không kéo GDT); "Đánh dấu đã đọc" là ghi cờ nội
// bộ, không phải hành động nặng — cùng nhóm "đọc dữ liệu đã có" theo hợp đồng tương tác
// ui.md (khác nút "Đồng bộ từ Thuế").
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Loading,
  Popover,
} from "../../components/ui/primitives";
import { api } from "../../lib/apiClient";
import { labelTthai, labelTtxly } from "../../lib/statusLabels";

const QUERY_KEY = ["invoice-changes"] as const;

/** "2026-04-12T10:00:00Z" → "12/04/2026 17:00" (giờ trình duyệt — đủ cho "phát hiện lúc"). */
export function formatPhatHienLuc(iso: string): string {
  const d = new Date(iso);
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/** Nhãn trạng thái theo ĐÚNG trường đã đổi — một nguồn (statusLabels.ts → @vat/domain,
 * ui.md). Mã ngoài tập đã kiểm chứng tự rơi về "N (chưa rõ)", không bịa nhãn. */
export function nhanTrangThai(truong: "ttxly" | "tthai", code: number | null): string {
  return (truong === "ttxly" ? labelTtxly(code) : labelTthai(code)).text;
}

export function InvoiceChangesBadge() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => api.getInvoiceChanges({ limit: 20 }),
  });
  const markRead = useMutation({
    mutationFn: (ids?: readonly string[]) => api.markInvoiceChangesRead(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const unreadCount = list.data?.unreadCount ?? 0;

  return (
    <Popover
      ariaLabel="Hóa đơn vừa thay đổi"
      trigger={({ toggle }) => (
        <Button type="button" variant="secondary" onClick={toggle}>
          Hóa đơn vừa thay đổi{unreadCount > 0 ? ` (${unreadCount})` : ""}
        </Button>
      )}
    >
      <div style={{ padding: "var(--sp-3)" }}>
        {list.isPending && <Loading />}
        {list.isError && (
          <ErrorState message="Không tải được danh sách thay đổi." onRetry={() => list.refetch()} />
        )}
        {list.isSuccess && list.data.rows.length === 0 && (
          <EmptyState message="Chưa có thay đổi nào." />
        )}
        {list.isSuccess && list.data.rows.length > 0 && (
          <div style={{ display: "grid", gap: "var(--sp-3)" }}>
            {unreadCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => markRead.mutate(undefined)}
                disabled={markRead.isPending}
              >
                Đánh dấu tất cả đã đọc
              </Button>
            )}
            <div style={{ display: "grid", gap: "var(--sp-2)", maxHeight: 360, overflowY: "auto" }}>
              {list.data.rows.map((r) => (
                <div
                  key={r.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: "var(--sp-2)",
                    paddingBottom: "var(--sp-2)",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <div style={{ display: "grid", gap: "var(--sp-1)", fontSize: "var(--fs-sm)" }}>
                    <Link to={`/invoices/${r.hoaDonId}`} onClick={() => markRead.mutate([r.id])}>
                      {r.khhdon}-{r.shdon} · {r.nbten ?? "—"}
                    </Link>
                    <span style={{ color: "var(--text-secondary)" }}>
                      Trạng thái: {nhanTrangThai(r.truong, r.giaTriCu)} →{" "}
                      {nhanTrangThai(r.truong, r.giaTriMoi)}, phát hiện{" "}
                      {formatPhatHienLuc(r.phatHienLuc)}
                    </span>
                  </div>
                  {!r.daDoc && <Badge tone="info">Mới</Badge>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Popover>
  );
}

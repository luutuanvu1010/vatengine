// B2 (U27) — Nút Xuất Excel/CSV cho DANH SÁCH HÓA ĐƠN. Kết xuất TOÀN BỘ kết quả theo bộ
// lọc hiện tại (server-side, không chỉ trang đang xem) — tái dùng đúng luồng ExportsPage:
// createExport(format, filter) → downloadExport(id) → saveBlob. Tự ẩn với vai không được
// kết xuất (canExport); server vẫn là biên tin cậy (403 → báo không có quyền).
import { useMutation } from "@tanstack/react-query";
import { Button } from "../../components/ui/primitives";
import { ApiError, api } from "../../lib/apiClient";
import { saveBlob } from "../../lib/download";
import { canExport } from "../../lib/rbac";
import type { ExportFormat, InvoiceFilter } from "../../types/api";
import { useAuth } from "../auth/auth-context";

export function InvoiceExportButtons({
  filter,
  selectedIds = [],
}: { filter: InvoiceFilter; selectedIds?: string[] }) {
  const { me } = useAuth();
  const coChon = selectedIds.length > 0;
  const run = useMutation({
    mutationFn: async (format: ExportFormat) => {
      // U30 — có tick dòng nào thì xuất ĐÚNG những dòng đó (server bỏ qua bộ lọc);
      // không tick gì thì giữ hành vi cũ: xuất toàn bộ kết quả theo bộ lọc.
      const res = await api.createExport(format, filter, coChon ? selectedIds : undefined);
      const blob = await api.downloadExport(res.id);
      saveBlob(blob, `hoa-don.${format}`);
    },
  });

  // Guard UX: chỉ vai được kết xuất mới thấy nút (khớp route guard + rbac server).
  if (!me || !canExport(me.role)) return null;

  const thongBaoLoi =
    run.error instanceof ApiError && run.error.status === 403
      ? "Bạn không có quyền kết xuất."
      : run.isError
        ? "Kết xuất thất bại. Thử lại."
        : null;

  // Nhãn nói rõ đang xuất CÁI GÌ — người dùng không phải đoán giữa hai chế độ.
  const nhan = (format: ExportFormat, label: string) => {
    if (run.isPending && run.variables === format) return "Đang xuất…";
    return coChon ? `Xuất ${selectedIds.length} hóa đơn đã chọn (${label})` : `Xuất ${label}`;
  };

  return (
    <div
      style={{ display: "inline-flex", gap: "var(--sp-2)", alignItems: "center", flexWrap: "wrap" }}
    >
      <Button variant="secondary" onClick={() => run.mutate("xlsx")} disabled={run.isPending}>
        {nhan("xlsx", "Excel")}
      </Button>
      <Button variant="secondary" onClick={() => run.mutate("csv")} disabled={run.isPending}>
        {nhan("csv", "CSV")}
      </Button>
      {thongBaoLoi ? (
        <span style={{ fontSize: "var(--fs-xs)", color: "var(--danger-600)" }}>{thongBaoLoi}</span>
      ) : null}
    </div>
  );
}

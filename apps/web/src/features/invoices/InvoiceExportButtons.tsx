// B2 (U27) — Nút Xuất Excel/CSV cho DANH SÁCH HÓA ĐƠN. Kết xuất TOÀN BỘ kết quả theo bộ
// lọc hiện tại (server-side, không chỉ trang đang xem) — tái dùng đúng luồng ExportsPage:
// createExport(format, filter) → downloadExport(id) → saveBlob. Tự ẩn với vai không được
// kết xuất (canExport); server vẫn là biên tin cậy (403 → báo không có quyền).
import { useMutation } from "@tanstack/react-query";
import { Button } from "../../components/ui/primitives";
import { ApiError } from "../../lib/apiClient";
import { canExport } from "../../lib/rbac";
import type { ExportFormat, InvoiceFilter } from "../../types/api";
import { useAuth } from "../auth/auth-context";
import { taiXuatHoaDon } from "./taiXuatHoaDon";

export function InvoiceExportButtons({ filter, cols }: { filter: InvoiceFilter; cols?: string[] }) {
  const { me } = useAuth();
  const run = useMutation({
    // 2026-07-23 — bảng đã bỏ nên không còn chế độ "xuất dòng đã chọn": luôn xuất TOÀN BỘ
    // kết quả theo bộ lọc hiện tại (server-side). `cols` = cột người dùng chọn (rỗng ⇒ server
    // xuất 16 cột mặc định). Luồng xuất+tải dùng chung (taiXuatHoaDon).
    mutationFn: (format: ExportFormat) => taiXuatHoaDon(format, filter, undefined, cols),
  });

  // Guard UX: chỉ vai được kết xuất mới thấy nút (khớp route guard + rbac server).
  if (!me || !canExport(me.role)) return null;

  const thongBaoLoi =
    run.error instanceof ApiError && run.error.status === 403
      ? "Bạn không có quyền kết xuất."
      : run.isError
        ? "Kết xuất thất bại. Thử lại."
        : null;

  const nhan = (format: ExportFormat, label: string) => {
    if (run.isPending && run.variables === format) return "Đang xuất…";
    return `Xuất ${label}`;
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

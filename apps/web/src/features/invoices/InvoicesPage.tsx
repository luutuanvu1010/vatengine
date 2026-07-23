import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Card, EmptyState, ErrorState, Loading } from "../../components/ui/primitives";
import { api } from "../../lib/apiClient";
import { loadInvoiceFilter, saveInvoiceFilter } from "../../lib/filterStore";
import { monthRangeOf, vnYearMonth } from "../../lib/period";
import { canManageTaxAccounts } from "../../lib/rbac";
import type { InvoiceFilter } from "../../types/api";
import { useAuth } from "../auth/auth-context";
import { FilterBar } from "./FilterBar";
import { InvoiceExportButtons } from "./InvoiceExportButtons";
import { RangeSyncPanel } from "./RangeSyncPanel";
import { taiXuatHoaDon } from "./taiXuatHoaDon";
import { useRangeBackfill } from "./useRangeBackfill";

/** Kỳ mặc định = THÁNG HIỆN TẠI theo giờ VN (yêu cầu 2). Tách ra để test ghim đồng hồ. */
export function kyThangHienTai(homNay: Date = new Date()): { tuNgay: string; denNgay: string } {
  const { y, m } = vnYearMonth(homNay);
  return monthRangeOf(y, m);
}

/** Panel "Đồng bộ và tải xuống" chỉ hiện khi có quyền đồng bộ VÀ có đủ khoảng kỳ. Tách hàm
 * thuần để test được cả nhánh guard (sau U-K4 kỳ luôn có sẵn ở luồng thật — đây là phòng
 * thủ chiều sâu, vẫn phải kiểm để không âm thầm mục ruỗng). */
export function nenHienPanelDongBo(filter: InvoiceFilter, canSync: boolean): boolean {
  return canSync && !!filter.tuNgay && !!filter.denNgay;
}

export function InvoicesPage() {
  const { me } = useAuth();
  // U27-B3: chỉ vai quản lý tài khoản thuế mới đồng bộ được (khớp RBAC server /tax-accounts).
  const canSync = canManageTaxAccounts(me?.role ?? "ke_toan");
  // U-K4 (yêu cầu 2) — mở màn LUÔN mặc định tháng hiện tại: giữ chiều/nguồn/MST đã lưu,
  // GHI ĐÈ kỳ = tháng này. filterStore đã bỏ nhớ tuNgay/denNgay nên kỳ cũ không lọt vào.
  const [filter, setFilter] = useState<InvoiceFilter>(() => ({
    ...loadInvoiceFilter(),
    ...kyThangHienTai(),
  }));

  // 2026-07-23 (chủ dự án) — Danh sách hóa đơn KHÔNG còn hiện bảng: chỉ SỐ ĐẾM + nút
  // Xuất/Đồng bộ. Số đếm lấy từ /invoices/summary (total.count) → bỏ hẳn query danh sách.
  const summary = useQuery({
    queryKey: ["invoices-summary", filter],
    queryFn: () => api.getSummary(filter),
  });

  function applyFilter(next: InvoiceFilter) {
    setFilter(next);
    saveInvoiceFilter(next);
  }

  const count = summary.data?.total.count ?? 0;
  // Rỗng = đã tải xong summary và đếm được 0. Dùng để tự đồng bộ (không để màn rỗng gây hiểu nhầm).
  const khongCoHoaDon = summary.isSuccess && count === 0;

  // U22 B7 — MỘT instance hook (tránh backfill trùng): nút "Đồng bộ và tải xuống" + tự chạy
  // khi kỳ đã lọc RỖNG. Gate cả auto-backfill lẫn panel để ke_toan không tự gọi API rồi 403.
  const backfillGoc = useRangeBackfill({
    tuNgay: filter.tuNgay,
    denNgay: filter.denNgay,
    auto: khongCoHoaDon && canSync,
  });

  // U-K4 (yêu cầu 3b) — "Đồng bộ và tải xuống": sau khi backfill THỦ CÔNG hoàn thành, tự
  // xuất + tải file cho bộ lọc đang xem. CHỈ khi người dùng BẤM nút (không phải auto-backfill
  // lúc rỗng — nếu không mỗi lần mở màn rỗng sẽ bất ngờ tải file). Tái dùng taiXuatHoaDon.
  const [taiSauDongBo, setTaiSauDongBo] = useState(false);
  const backfill = {
    ...backfillGoc,
    start: () => {
      setTaiSauDongBo(true);
      backfillGoc.start();
    },
  };
  const backfillRunning = backfill.state.kind === "dang_lay";

  const xuatSauDongBo = useMutation({
    mutationFn: (f: InvoiceFilter) => taiXuatHoaDon("xlsx", f),
  });
  const dongBoXong = backfillGoc.state.kind === "xong";
  useEffect(() => {
    if (dongBoXong && taiSauDongBo) {
      setTaiSauDongBo(false);
      xuatSauDongBo.mutate(filter);
    }
  }, [dongBoXong, taiSauDongBo, filter, xuatSauDongBo]);

  return (
    <div>
      <PageHeader
        title="Danh sách hóa đơn"
        subtitle="Hóa đơn điện tử kéo trực tiếp từ Tổng cục Thuế"
      />

      <Card style={{ marginBottom: "var(--sp-4)" }}>
        <FilterBar value={filter} onApply={applyFilter} />
        {nenHienPanelDongBo(filter, canSync) && (
          <RangeSyncPanel
            backfill={backfill}
            loiTaiXuong={
              xuatSauDongBo.isError
                ? "Đã đồng bộ xong nhưng tải file không thành công — bấm nút Xuất Excel/CSV để tải lại."
                : null
            }
          />
        )}
        <div
          style={{
            marginTop: "var(--sp-3)",
            fontSize: "var(--fs-xs)",
            color: "var(--text-disabled)",
          }}
        >
          Đã ghi nhớ bộ lọc gần nhất · Giờ hiển thị theo VN (UTC+7)
        </div>
      </Card>

      <Card>
        {summary.isPending ? (
          <Loading />
        ) : summary.isError ? (
          <ErrorState message="Không đếm được hóa đơn." onRetry={() => summary.refetch()} />
        ) : count === 0 ? (
          <EmptyState
            message={
              backfillRunning
                ? "Đang đồng bộ khoảng đã lọc từ Tổng cục Thuế — số liệu sẽ cập nhật khi lấy xong (xem tiến độ ở khung lọc phía trên)."
                : "Không có hóa đơn khớp bộ lọc. Thử mở rộng kỳ hoặc bỏ bớt điều kiện."
            }
          />
        ) : (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "var(--sp-3)",
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: "var(--fs-sm)", color: "var(--text-secondary)" }}>
              Có {count} hóa đơn
            </span>
            {/* B2 (U27) — kết xuất TOÀN BỘ kết quả theo bộ lọc hiện tại. */}
            <InvoiceExportButtons filter={filter} />
          </div>
        )}
      </Card>
    </div>
  );
}

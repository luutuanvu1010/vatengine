import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Pagination } from "../../components/ui/Pagination";
import { Card, EmptyState, ErrorState, Loading } from "../../components/ui/primitives";
import { api } from "../../lib/apiClient";
import { loadInvoiceFilter, saveInvoiceFilter } from "../../lib/filterStore";
import { formatMoney } from "../../lib/format";
import { canManageTaxAccounts } from "../../lib/rbac";
import type { InvoiceFilter } from "../../types/api";
import { useAuth } from "../auth/auth-context";
import { FilterBar } from "./FilterBar";
import { InvoiceExportButtons } from "./InvoiceExportButtons";
import { InvoiceTable } from "./InvoiceTable";
import { RangeSyncPanel } from "./RangeSyncPanel";
import { useRangeBackfill } from "./useRangeBackfill";

const LIMIT = 50;

export function InvoicesPage() {
  const { me } = useAuth();
  // U27-B3: chỉ vai quản lý tài khoản thuế mới đồng bộ được (khớp RBAC server /tax-accounts).
  const canSync = canManageTaxAccounts(me?.role ?? "ke_toan");
  const [filter, setFilter] = useState<InvoiceFilter>(() => loadInvoiceFilter());
  const [offset, setOffset] = useState(0);

  const list = useQuery({
    queryKey: ["invoices", filter, offset],
    queryFn: () => api.getInvoices(filter, { limit: LIMIT, offset }),
  });
  const summary = useQuery({
    queryKey: ["invoices-summary", filter],
    queryFn: () => api.getSummary(filter),
  });

  function applyFilter(next: InvoiceFilter) {
    setFilter(next);
    setOffset(0);
    saveInvoiceFilter(next);
  }

  const rows = list.data?.rows ?? [];
  const total = list.data?.total ?? 0;
  const tongTtbso = summary.data?.total.tongTtbso ?? null;
  const listEmpty = !list.isPending && !list.isError && rows.length === 0;

  // U22 B7 — MỘT instance hook (tránh backfill trùng): nút "Đồng bộ khoảng này" + tự chạy
  // khi kỳ đã lọc RỖNG (không để màn rỗng gây hiểu nhầm). Hook tự lo trường hợp thiếu khoảng.
  // Gate cả auto-backfill lẫn panel để ke_toan không tự kích hoạt gọi API rồi 403.
  const backfill = useRangeBackfill({
    tuNgay: filter.tuNgay,
    denNgay: filter.denNgay,
    auto: listEmpty && canSync,
  });
  const backfillRunning = backfill.state.kind === "dang_lay";

  return (
    <div>
      <PageHeader
        title="Danh sách hóa đơn"
        subtitle="Hóa đơn điện tử kéo trực tiếp từ Tổng cục Thuế"
      />

      <Card style={{ marginBottom: "var(--sp-4)" }}>
        <FilterBar value={filter} onApply={applyFilter} />
        {canSync && filter.tuNgay && filter.denNgay && (
          <RangeSyncPanel tuNgay={filter.tuNgay} denNgay={filter.denNgay} backfill={backfill} />
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

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "var(--sp-2)",
          gap: "var(--sp-3)",
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: "var(--fs-sm)", color: "var(--text-secondary)" }}>
          Hiển thị <strong>{total}</strong> hóa đơn
        </span>
        <div
          style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", flexWrap: "wrap" }}
        >
          <span style={{ fontSize: "var(--fs-sm)", color: "var(--text-secondary)" }}>
            Tổng thanh toán <strong className="tabular">{formatMoney(tongTtbso) || "—"}</strong> đ
          </span>
          {/* B2 (U27) — kết xuất toàn bộ kết quả theo bộ lọc; tự ẩn với vai không có quyền. */}
          <InvoiceExportButtons filter={filter} />
        </div>
      </div>

      <Card style={{ padding: 0 }}>
        {list.isPending ? (
          <Loading />
        ) : list.isError ? (
          <ErrorState message="Không tải được danh sách hóa đơn." onRetry={() => list.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            message={
              backfillRunning
                ? "Đang đồng bộ khoảng đã lọc từ Tổng cục Thuế — dữ liệu sẽ hiện khi lấy xong (xem tiến độ ở khung lọc phía trên)."
                : "Không có hóa đơn khớp bộ lọc. Thử mở rộng kỳ hoặc bỏ bớt điều kiện."
            }
          />
        ) : (
          <>
            <InvoiceTable rows={rows} />
            <div style={{ padding: "0 var(--sp-4)" }}>
              <Pagination total={total} limit={LIMIT} offset={offset} onOffset={setOffset} />
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Pagination } from "../../components/ui/Pagination";
import { Card, EmptyState, ErrorState, Loading } from "../../components/ui/primitives";
import { api } from "../../lib/apiClient";
import { loadInvoiceFilter, saveInvoiceFilter } from "../../lib/filterStore";
import { formatMoney } from "../../lib/format";
import { monthRangeOf, vnYearMonth } from "../../lib/period";
import { canManageTaxAccounts } from "../../lib/rbac";
import type { InvoiceFilter, InvoiceSort } from "../../types/api";
import { useAuth } from "../auth/auth-context";
import { FilterBar } from "./FilterBar";
import { InvoiceExportButtons } from "./InvoiceExportButtons";
import { InvoiceTable } from "./InvoiceTable";
import { RangeSyncPanel } from "./RangeSyncPanel";
import { taiXuatHoaDon } from "./taiXuatHoaDon";
import { useRangeBackfill } from "./useRangeBackfill";

const LIMIT = 50;

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
  const [offset, setOffset] = useState(0);
  // U30 — lựa chọn dòng để xuất. CỐ Ý để ở state trang, KHÔNG localStorage: đây là dữ
  // liệu tenant, để sót lại sau khi đổi phiên là lỗ hổng (multi-tenant.md H-B.3).
  // Giữ qua phân trang (quyết định chủ dự án 2026-07-20) nên không reset theo `offset`.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  // U31 — sắp xếp theo cột. Rỗng ⇒ không gửi tham số ⇒ server giữ thứ tự mặc định.
  const [sort, setSort] = useState<InvoiceSort>({});

  const list = useQuery({
    queryKey: ["invoices", filter, offset, sort],
    queryFn: () => api.getInvoices(filter, { limit: LIMIT, offset }, sort),
  });
  const summary = useQuery({
    queryKey: ["invoices-summary", filter],
    queryFn: () => api.getSummary(filter),
  });

  function applyFilter(next: InvoiceFilter) {
    setFilter(next);
    setOffset(0);
    saveInvoiceFilter(next);
    // XÓA lựa chọn khi đổi bộ lọc: giữ lại sẽ khiến người dùng xuất nhầm những hóa đơn
    // họ KHÔNG còn nhìn thấy trên màn hình. Lật trang thì ngược lại — giữ nguyên.
    setSelectedIds(new Set());
  }

  // U31 — lọc theo cột đi CHUNG `InvoiceFilter` với thanh lọc trên: một nguồn sự thật cho
  // "tập hóa đơn đang xem", nên tổng tiền và nút xuất tự khớp với bảng. Tách hai hệ lọc
  // sẽ khiến con số dưới bảng nói khác bảng.
  // Khóa "ttbso" là ảo: menu trả "tu|den", tách ra hai tham số server.
  const giaTriLoc = (khoa: string): string => {
    if (khoa === "ttbso") {
      const tu = filter.ttbsoTu ?? "";
      const den = filter.ttbsoDen ?? "";
      return tu || den ? `${tu}|${den}` : "";
    }
    return ((filter as Record<string, unknown>)[khoa] as string | undefined) ?? "";
  };

  const onLoc = (khoa: string, giaTri: string) => {
    if (khoa === "ttbso") {
      const [tu = "", den = ""] = giaTri.split("|");
      applyFilter({ ...filter, ttbsoTu: tu || undefined, ttbsoDen: den || undefined });
      return;
    }
    applyFilter({ ...filter, [khoa]: giaTri || undefined });
  };

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  /** Chọn/bỏ chọn toàn bộ dòng của TRANG hiện tại, không đụng lựa chọn ở trang khác. */
  function togglePage(ids: string[], checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  const rows = list.data?.rows ?? [];
  const total = list.data?.total ?? 0;
  const tongTtbso = summary.data?.total.tongTtbso ?? null;
  const listEmpty = !list.isPending && !list.isError && rows.length === 0;

  // U22 B7 — MỘT instance hook (tránh backfill trùng): nút "Đồng bộ khoảng này" + tự chạy
  // khi kỳ đã lọc RỖNG (không để màn rỗng gây hiểu nhầm). Hook tự lo trường hợp thiếu khoảng.
  // Gate cả auto-backfill lẫn panel để ke_toan không tự kích hoạt gọi API rồi 403.
  const backfillGoc = useRangeBackfill({
    tuNgay: filter.tuNgay,
    denNgay: filter.denNgay,
    auto: listEmpty && canSync,
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
        {nenHienPanelDongBo(filter, canSync) && filter.tuNgay && filter.denNgay && (
          <RangeSyncPanel
            tuNgay={filter.tuNgay}
            denNgay={filter.denNgay}
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
          {/* B2 (U27) — kết xuất theo bộ lọc; U30 — hoặc theo các dòng đã tick. */}
          <InvoiceExportButtons filter={filter} selectedIds={[...selectedIds]} />
        </div>
      </div>

      {/* U30 — thanh trạng thái lựa chọn, chỉ hiện khi có dòng được chọn. */}
      {selectedIds.size > 0 && (
        // <output> mang sẵn role="status" — vùng cập nhật động, trình đọc màn hình
        // được báo khi số đã chọn đổi (dùng phần tử ngữ nghĩa thay vì gán role).
        <output
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--sp-3)",
            flexWrap: "wrap",
            marginBottom: "var(--sp-2)",
            padding: "var(--sp-2) var(--sp-3)",
            background: "var(--info-50)",
            border: "1px solid var(--info-200)",
            borderRadius: "var(--radius-md)",
            fontSize: "var(--fs-sm)",
            color: "var(--text-secondary)",
          }}
        >
          <span>
            Đã chọn <strong>{selectedIds.size}</strong> hóa đơn
          </span>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              color: "var(--info-700)",
              fontSize: "var(--fs-sm)",
              textDecoration: "underline",
            }}
          >
            Bỏ chọn tất cả
          </button>
        </output>
      )}

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
            <InvoiceTable
              rows={rows}
              selection={{ selectedIds, onToggle: toggleOne, onTogglePage: togglePage }}
              ops={{
                sort,
                onSort: (sortBy, sortDir) => {
                  setSort({ sortBy, sortDir });
                  setOffset(0);
                },
                giaTriLoc,
                onLoc,
              }}
            />
            <div style={{ padding: "0 var(--sp-4)" }}>
              <Pagination total={total} limit={LIMIT} offset={offset} onOffset={setOffset} />
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

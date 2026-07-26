import { useQuery } from "@tanstack/react-query";
import { labelOf } from "@vat/domain";
import { useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  InfoTip,
  Loading,
  SectionLabel,
  Stat,
} from "../../components/ui/primitives";
import { api } from "../../lib/apiClient";
import { loadExportCols, saveExportCols } from "../../lib/exportColsStore";
import { loadInvoiceFilter, saveInvoiceFilter } from "../../lib/filterStore";
import { formatMoney } from "../../lib/format";
import { monthRangeOf, vnYearMonth } from "../../lib/period";
import { canExport, canManageTaxAccounts } from "../../lib/rbac";
import type { InvoiceFilter } from "../../types/api";
import { useAuth } from "../auth/auth-context";
import { ChonCotXuat } from "./ChonCotXuat";
import { FilterBar } from "./FilterBar";
import { InvoiceExportButtons } from "./InvoiceExportButtons";
import { RangeSyncPanel } from "./RangeSyncPanel";
import { useRangeBackfill } from "./useRangeBackfill";

/** "12480350200" → "12.480.350.200 ₫"; null/rỗng → "—" (không giá trị giả). */
export function tienStat(v: string | null | undefined): string {
  const s = formatMoney(v ?? null);
  return s ? `${s} ₫` : "—";
}

/** Kỳ mặc định = THÁNG HIỆN TẠI theo giờ VN (yêu cầu 2). Tách ra để test ghim đồng hồ. */
export function kyThangHienTai(homNay: Date = new Date()): { tuNgay: string; denNgay: string } {
  const { y, m } = vnYearMonth(homNay);
  return monthRangeOf(y, m);
}

/** Nút/panel "Đồng bộ từ Thuế" chỉ hiện khi có quyền đồng bộ VÀ có đủ khoảng kỳ. Tách hàm
 * thuần để test được cả nhánh guard (sau U-K4 kỳ luôn có sẵn ở luồng thật — đây là phòng
 * thủ chiều sâu, vẫn phải kiểm để không âm thầm mục ruỗng). */
export function nenHienPanelDongBo(filter: InvoiceFilter, canSync: boolean): boolean {
  return canSync && !!filter.tuNgay && !!filter.denNgay;
}

/** Nhãn "kỳ đang xem" cho badge — suy TỪ filter đã có ở client (KHÔNG gọi thêm API).
 * "2026-07-01"/"2026-07-31" → "01/07 – 31/07/2026". Thiếu kỳ → null (không hiện badge). */
export function nhanBadgeKy(tuNgay?: string, denNgay?: string): string | null {
  if (!tuNgay || !denNgay) return null;
  const [, m1, d1] = tuNgay.split("-");
  const [y2, m2, d2] = denNgay.split("-");
  if (!d1 || !m1 || !d2 || !m2 || !y2) return null;
  return `${d1}/${m1} – ${d2}/${m2}/${y2}`;
}

export function InvoicesPage() {
  const { me } = useAuth();
  // U27-B3: chỉ vai quản lý tài khoản thuế mới đồng bộ được (khớp RBAC server /tax-accounts).
  const canSync = canManageTaxAccounts(me?.role ?? "ke_toan");
  const canExp = canExport(me?.role ?? "ke_toan");

  // Cột xuất người dùng chọn (nhớ localStorage). Truyền vào nút Xuất + bước tự-tải sau đồng bộ.
  const [cols, setCols] = useState<string[]>(loadExportCols);
  const doiCols = (keys: string[]) => {
    setCols(keys);
    saveExportCols(keys);
  };
  // U-K4 (yêu cầu 2) — mở màn LUÔN mặc định tháng hiện tại: giữ nguồn/MST đã lưu, GHI ĐÈ kỳ =
  // tháng này. Chiều MẶC ĐỊNH = Mua vào (bỏ "Tất cả"): giữ chiều đã lưu nếu có, chưa có → Mua
  // vào (chủ dự án 2026-07-23). filterStore đã bỏ nhớ tuNgay/denNgay nên kỳ cũ không lọt vào.
  const [filter, setFilter] = useState<InvoiceFilter>(() => {
    const daLuu = loadInvoiceFilter();
    return { ...daLuu, chieu: daLuu.chieu ?? "purchase", ...kyThangHienTai() };
  });

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

  // U22 B7 — MỘT instance hook (tránh backfill trùng): nút "Đồng bộ từ Thuế" + tự chạy
  // khi kỳ đã lọc RỖNG. Gate cả auto-backfill lẫn panel để ke_toan không tự gọi API rồi 403.
  // Task 12 — bỏ cơ chế tự-tải-file sau đồng bộ (taiSauDongBo/xuatSauDongBo/loiTaiXuong):
  // đồng bộ (kéo) và xuất (tải) là hai hành động khác bản chất, tách bạch theo hợp đồng
  // tương tác ui.md — người dùng bấm nút Xuất ở thẻ Kết quả khi cần file.
  const backfill = useRangeBackfill({
    tuNgay: filter.tuNgay,
    denNgay: filter.denNgay,
    auto: khongCoHoaDon && canSync,
  });
  const backfillRunning = backfill.state.kind === "dang_lay";

  // Badge kỳ đang xem — mặc định BẬT; suy từ filter (client), không gọi thêm API.
  const badgeKy = nhanBadgeKy(filter.tuNgay, filter.denNgay);

  return (
    <div>
      <PageHeader
        title="Danh sách hóa đơn"
        subtitle="Hóa đơn điện tử kéo trực tiếp từ Tổng cục Thuế"
      />

      {/* (a) Tra cứu hóa đơn — lọc (đọc nhẹ) + đồng bộ (kéo nặng) trong MỘT thẻ; hai nút
          tách bạch theo hợp đồng tương tác ui.md. Ghi chú dài → InfoTip (spec 2026-07-26). */}
      <Card style={{ marginBottom: "var(--sp-4)" }}>
        <SectionLabel>Tra cứu hóa đơn</SectionLabel>
        <FilterBar
          value={filter}
          onApply={applyFilter}
          hanhDongPhu={
            nenHienPanelDongBo(filter, canSync) ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--sp-1)" }}>
                <Button onClick={backfill.start} disabled={backfillRunning}>
                  {backfillRunning ? "Đang đồng bộ…" : "Đồng bộ từ Thuế"}
                </Button>
                <InfoTip
                  label="Giải thích đồng bộ"
                  text="Kiểm tra và kéo phần còn thiếu từ máy chủ thuế cho kỳ đã chọn — chạy nền."
                />
              </span>
            ) : undefined
          }
        />
        {nenHienPanelDongBo(filter, canSync) && <RangeSyncPanel backfill={backfill} />}
        <div
          style={{
            marginTop: "var(--sp-4)",
            fontSize: "var(--fs-xs)",
            color: "var(--text-disabled)",
          }}
        >
          Đã ghi nhớ bộ lọc gần nhất · Giờ hiển thị theo VN (UTC+7)
        </div>
      </Card>

      {/* (c) Kết quả + Xuất — số đếm là tiêu điểm (Stat). Đủ 4 trạng thái. */}
      <Card>
        <SectionLabel>Kết quả</SectionLabel>
        {summary.isPending ? (
          <Loading />
        ) : summary.isError ? (
          <ErrorState message="Không đếm được hóa đơn." onRetry={() => summary.refetch()} />
        ) : count === 0 ? (
          <EmptyState
            message={
              backfillRunning
                ? "Đang đồng bộ khoảng đã lọc từ Tổng cục Thuế — số liệu sẽ cập nhật khi lấy xong (xem tiến độ ở khung Đồng bộ phía trên)."
                : "Không có hóa đơn khớp bộ lọc. Thử mở rộng kỳ hoặc bỏ bớt điều kiện."
            }
          />
        ) : (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: "var(--sp-6)",
              flexWrap: "wrap",
            }}
          >
            {/* Task 13 — cụm 4 số: đếm + 3 tổng tiền (đã có sẵn ở summary.total). Nhãn tiền
                từ Registry (`labelOf` — ui.md nhãn một-nguồn), tiền in ĐẦY ĐỦ (formatMoney). */}
            <div
              style={{
                display: "flex",
                gap: "var(--sp-6)",
                flexWrap: "wrap",
                alignItems: "flex-start",
              }}
            >
              <Stat
                value={formatMoney(String(count))}
                label="hóa đơn khớp bộ lọc"
                badge={
                  badgeKy ? (
                    <Badge>
                      <span className="tabular">Kỳ {badgeKy}</span>
                    </Badge>
                  ) : undefined
                }
              />
              <Stat value={tienStat(summary.data?.total.tongTcthue)} label={labelOf("tgtcthue")} />
              <Stat value={tienStat(summary.data?.total.tongTthue)} label={labelOf("tgtthue")} />
              <Stat value={tienStat(summary.data?.total.tongTtbso)} label={labelOf("tgtttbso")} />
            </div>
            {/* B2 (U27) — kết xuất TOÀN BỘ kết quả theo bộ lọc hiện tại; "Tùy chỉnh cột" chọn
                cột vào file (chỉ vai được kết xuất). */}
            <div
              style={{
                display: "flex",
                gap: "var(--sp-2)",
                alignItems: "flex-start",
                flexWrap: "wrap",
              }}
            >
              {canExp ? <ChonCotXuat value={cols} onChange={doiCols} /> : null}
              <InvoiceExportButtons filter={filter} cols={cols} />
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

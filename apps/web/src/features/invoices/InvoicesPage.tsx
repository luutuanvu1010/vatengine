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
  HuongDanTrang,
  Loading,
  MucHuongDan,
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
import { BiSuaKyKhacBadge } from "./BiSuaKyKhacBadge";
import { ChonCotXuat } from "./ChonCotXuat";
import { FilterBar } from "./FilterBar";
import { InvoiceExportButtons } from "./InvoiceExportButtons";
import { RangeSyncPanel } from "./RangeSyncPanel";
import { TaiHoaDonGoc } from "./TaiHoaDonGoc";
import { ThongBaoTrangThai } from "./ThongBaoTrangThai";
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
  // U36 — số hóa đơn bị loại khỏi TỔNG TIỀN (mã 4). `?? 0` chứ không chỉ kiểm mảng rỗng:
  // tab đang mở giữ dữ liệu shape CŨ trong cache tới lần refetch (queryKey không đổi).
  const soLoaiKhoiTong = summary.data?.total.soLoaiKhoiTong ?? 0;
  const byChieu = summary.data?.byChieu ?? [];
  // Hóa đơn BỊ SỬA của kỳ đang xem (mã 4 + mã 5) — thẻ Kết quả đã liệt kê đủ. Truyền xuống
  // badge để nó trừ ra, chỉ báo phần NGOÀI kỳ; hai chỗ không chồng lấn nhau.
  // `undefined` khi summary trong cache còn shape CŨ (chưa có hai trường này) — badge sẽ
  // im lặng thay vì đếm nhầm toàn bộ hóa đơn bị sửa thành "ở kỳ khác".
  const shapeCu =
    byChieu.length > 0 &&
    byChieu.every((c) => c.soLoaiKhoiTong === undefined && c.soDuocDieuChinh === undefined);
  const soBiSuaTrongKy = shapeCu
    ? undefined
    : byChieu.reduce((n, c) => n + (c.soLoaiKhoiTong ?? 0) + (c.soDuocDieuChinh ?? 0), 0);
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
        subtitle="Hóa đơn điện tử truy xuất trực tiếp từ Tổng cục Thuế"
      />

      {/* (a) Tra cứu hóa đơn — lọc (đọc nhẹ) + đồng bộ (kéo nặng) trong MỘT thẻ; hai nút
          tách bạch theo hợp đồng tương tác ui.md. Ghi chú dài → InfoTip (spec 2026-07-26). */}
      <Card style={{ marginBottom: "var(--sp-4)" }}>
        <SectionLabel>Tra cứu hóa đơn</SectionLabel>
        {/* Vùng chứa DỌC của thẻ: một `gap` duy nhất lo mọi khoảng cách giữa bộ lọc, khối
            thông báo trạng thái đồng bộ và dòng ghi chú cuối thẻ — không margin lẻ cho từng
            khối, nên khoảng cách không lệch khi khối giữa xuất hiện hay biến mất. */}
        <div style={{ display: "grid", gap: "var(--sp-4)" }}>
          <FilterBar
            value={filter}
            onApply={applyFilter}
            hanhDongPhu={
              /* Hàng hành động cạnh "Lọc dữ liệu": Đồng bộ (kéo nặng, vai quản trị) + Xuất
               (đọc nhẹ — tải dữ liệu ĐÃ có; InvoiceExportButtons tự ẩn theo canExport).
               Yêu cầu chủ dự án 2026-07-26: nút xuất đứng cạnh nút đồng bộ cho dễ thấy. */
              <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--sp-2)" }}>
                {nenHienPanelDongBo(filter, canSync) && (
                  <span
                    style={{ display: "inline-flex", alignItems: "center", gap: "var(--sp-1)" }}
                  >
                    <Button onClick={backfill.start} disabled={backfillRunning}>
                      {backfillRunning ? "Đang đồng bộ…" : "Đồng bộ từ Tổng cục Thuế"}
                    </Button>
                  </span>
                )}
                {canExp ? <ChonCotXuat value={cols} onChange={doiCols} /> : null}
                <InvoiceExportButtons filter={filter} cols={cols} />
                <BiSuaKyKhacBadge
                  filter={filter}
                  trongKy={soBiSuaTrongKy}
                  onChonKy={(tuNgay, denNgay) => applyFilter({ ...filter, tuNgay, denNgay })}
                />
              </span>
            }
          />
          {nenHienPanelDongBo(filter, canSync) && <RangeSyncPanel backfill={backfill} />}
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-disabled)" }}>
            Đã ghi nhớ bộ lọc gần nhất · Giờ hiển thị theo VN (UTC+7)
          </div>
        </div>
      </Card>

      {/* (b) Tải hóa đơn gốc — thẻ RIÊNG, không chen vào thanh hành động của bộ lọc.
          Đây là quy trình nhiều bước có trạng thái sống (chờ → tiến độ → link → thu hồi),
          khác hẳn "Xuất Excel" bấm-phát-ra-file. Nó ăn theo bộ lọc đã áp dụng nên đứng
          NGAY DƯỚI thẻ tra cứu và TRÊN kết quả — đọc từ trên xuống là đúng thứ tự việc.
          Component tự khóa khi bộ lọc chưa đủ ba vế (khách hàng + bán ra + khoảng ngày). */}
      <TaiHoaDonGoc filter={filter} />

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
                ? "Đang đồng bộ khoảng đã lọc từ Tổng cục Thuế. Số liệu sẽ cập nhật khi xong; xem tiến độ ở phía trên."
                : "Không có hóa đơn khớp bộ lọc. Vui lòng mở rộng kỳ hoặc bỏ bớt điều kiện."
            }
          />
        ) : (
          <>
            {/* U36 — giải thích TRƯỚC khi người dùng đọc số, không phải chú thích cuối trang:
                tổng của kỳ đã qua nay khác con số họ từng thấy và từng xuất file (§7.2). */}
            <ThongBaoTrangThai byChieu={byChieu} badgeKy={badgeKy} filter={filter} />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "var(--sp-6)",
                alignItems: "start",
              }}
            >
              {/* Task 13 + chỉnh 2026-07-26 — cụm 4 số xếp LƯỚI tự co (auto-fit): số đếm là
                tiêu điểm (cỡ md), 3 tổng tiền cỡ sm để vừa MỘT hàng màn thường, tự xuống
                hàng gọn ở màn hẹp. Nhãn tiền từ Registry (`labelOf` — nhãn một-nguồn), tiền
                in ĐẦY ĐỦ (formatMoney). Cụm xuất đã chuyển lên hàng hành động thẻ Tra cứu. */}
              {/* U36 QĐ-7 — SỐ ĐẾM GIỮ NGUYÊN nghĩa "khớp bộ lọc"; ba số tiền bên cạnh thì đã
                loại hóa đơn bị thay thế. Chênh lệch đó phải được nói ra ngay tại chỗ, nếu
                không người dùng sẽ tự cộng tay và thấy lệch. */}
              <Stat
                value={formatMoney(String(count))}
                label="hóa đơn khớp bộ lọc"
                ghiChu={
                  soLoaiKhoiTong > 0
                    ? `(${formatMoney(String(soLoaiKhoiTong))} hóa đơn bị thay thế — không tính vào tổng)`
                    : undefined
                }
                badge={
                  badgeKy ? (
                    <Badge>
                      <span className="tabular">Kỳ {badgeKy}</span>
                    </Badge>
                  ) : undefined
                }
              />
              <Stat
                co="sm"
                value={tienStat(summary.data?.total.tongTcthue)}
                label={labelOf("tgtcthue")}
              />
              <Stat
                co="sm"
                value={tienStat(summary.data?.total.tongTthue)}
                label={labelOf("tgtthue")}
              />
              <Stat
                co="sm"
                value={tienStat(summary.data?.total.tongTtbso)}
                label={labelOf("tgtttbso")}
              />
            </div>
          </>
        )}
      </Card>

      {/* Nhãn ngắn ở nút — mô tả đầy đủ ở đây (quy ước ui.md §4.5). Trước đó mô tả của
          "Đồng bộ" nằm trong tooltip ⓘ và mô tả của "Tải hóa đơn gốc" chen trong thẻ. */}
      <HuongDanTrang>
        <MucHuongDan nhan="Lọc dữ liệu">
          Đọc lại tập hóa đơn <strong>đã có</strong> trong hệ thống theo điều kiện bạn đặt: khoảng
          ngày, chiều mua vào hoặc bán ra, nguồn hóa đơn, mã số thuế người bán hoặc người mua. Thao
          tác này không gọi sang Tổng cục Thuế nên có kết quả ngay.
        </MucHuongDan>
        <MucHuongDan nhan="Đồng bộ từ Tổng cục Thuế">
          Đối chiếu từng tháng trong kỳ đã chọn với hệ thống Tổng cục Thuế và truy xuất phần còn
          thiếu. Việc này xử lý nền: bạn có thể tiếp tục thao tác khác, số liệu sẽ đầy dần. Chỉ vai
          quản trị tài khoản thuế thấy chức năng này.
        </MucHuongDan>
        <MucHuongDan nhan="Tùy chỉnh cột và Xuất Excel">
          Chọn những cột cần đưa vào tệp kết xuất, rồi xuất toàn bộ kết quả khớp bộ lọc ra tệp Excel
          để đối chiếu và kê khai. Đây là kết xuất dữ liệu đã có, không truy xuất mới.
        </MucHuongDan>
        <MucHuongDan nhan="Tải hóa đơn gốc (.zip)">
          Truy xuất bản gốc có chữ ký số từ Tổng cục Thuế đối với các hóa đơn đã phát hành cho người
          mua đang chọn, đóng gói thành tệp nén .zip và tạo liên kết tải về để gửi cho người mua.
          Thẻ này chỉ hiện khi bộ lọc đang ở <strong>chiều Bán ra</strong>; sau đó cần chọn thêm
          người mua và khoảng thời gian thì mới tải được. Liên kết tạo ra là công khai và tự hết hạn
          sau khoảng một tuần; bạn có thể thu hồi bất cứ lúc nào ở trang Liên kết chia sẻ.
        </MucHuongDan>
        <MucHuongDan nhan="Hóa đơn bị sửa ở kỳ khác">
          Liệt kê những hóa đơn đã bị thay thế hoặc điều chỉnh bởi một hóa đơn thuộc kỳ kê khai
          khác. Nếu tờ khai của kỳ đó đã nộp, cần cân nhắc khai bổ sung.
        </MucHuongDan>
      </HuongDanTrang>
    </div>
  );
}

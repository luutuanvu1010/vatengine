// U36 Gói 4 — thông báo giải thích vì sao TỔNG TIỀN đổi so với trước.
//
// Bối cảnh: từ 28/07/2026, hóa đơn `tthai=4` (BỊ THAY THẾ) không còn được cộng vào tổng
// (QĐ-3). Tổng của các kỳ ĐÃ QUA vì vậy khác con số người dùng từng thấy và từng xuất file
// (§7.2 kế hoạch U36) — im lặng đổi số là cách chắc chắn nhất để kế toán tưởng phần mềm
// hỏng, hoặc tưởng nghĩa vụ thuế của họ vừa thay đổi.
//
// Chịu được dữ liệu shape CŨ: `queryKey` không đổi sau deploy nên một tab đang mở vẫn giữ
// dữ liệu cũ trong cache tới lần refetch kế. Mọi trường mới đọc qua `?? 0` / `?? "0"`.
import { useQuery } from "@tanstack/react-query";
import { nhanTthai, truTienChuoi } from "@vat/domain";
import { useState } from "react";
import { Alert, Button, ErrorState, Loading } from "../../components/ui/primitives";
import { api } from "../../lib/apiClient";
import { formatDateVN, formatMoney } from "../../lib/format";
import { labelChieu } from "../../lib/statusLabels";
import type { ChieuSummary, InvoiceFilter } from "../../types/api";

// Dòng "Từ 28/07/2026, hóa đơn bị thay thế không còn được cộng vào tổng" ĐÃ GỠ (chủ dự án
// chốt 2026-07-29), tuy `U36-plan.md` §7.2 từng ghi là bắt buộc. Ba lý do:
//   • Nó là thông báo DI TRÚ — chỉ có nghĩa với người ĐÃ TỪNG thấy số cũ. Người dùng mới
//     đọc thấy một câu đố.
//   • Nó vĩnh viễn. Thông báo di trú mà ghim mãi thì thành nhiễu.
//   • Nó THỪA: khối ngay bên trên đã nói cụ thể hơn nhiều — "3 hóa đơn bị thay thế - đã loại
//     khỏi tổng: trước thuế −X, thuế −Y, tổng thanh toán −Z".
// Nội dung này nay nằm ở `lib/changelog.ts` v2.0 → trang "Lịch sử cập nhật", đúng chỗ dành
// cho tin về thay đổi của phần mềm.
//
// CÙNG LÝ DO, chú giải "(số thuế phải nộp thật không đổi - trước đây phần mềm tính dư)" cũng
// ĐÃ GỠ (chủ dự án chốt 2026-07-29), tuy `U36-plan.md` §2.1 từng ghi là bắt buộc. Nó gánh hai
// việc: rào chắn hiểu nhầm, và một câu di trú. Nhưng thứ tạo ra nhu cầu rào chắn chính là câu
// tiêu đề cũ — "Thuế phải nộp trên báo cáo giảm X ₫" không nêu giảm SO VỚI GÌ, nên đọc một
// mình rất dễ tưởng nghĩa vụ thuế vừa đổi. Nay câu tự nêu mốc so sánh ngay trong nó ("Việc
// loại hóa đơn bị thay thế làm…"): mốc chuyển từ "phiên bản phần mềm cũ" sang "dữ liệu của
// chính kỳ này", người dùng MỚI đọc vẫn hiểu, và chú giải thành thừa thật chứ không bị cắt
// cụt. Gỡ chú giải mà giữ nguyên câu cũ thì chỉ còn cái bẫy, mất rào chắn — đừng làm vậy.

const soLoai = (c: ChieuSummary): number => c.soLoaiKhoiTong ?? 0;

/** Tiền dạng "-1.711.111 ₫" / "1.711.111 ₫". Dấu trừ là `-` ASCII (QĐ-8). */
function tien(v: string, am = false): string {
  const s = formatMoney(v);
  return `${am && s !== "0" ? "-" : ""}${s} ₫`;
}

/**
 * Δ thuế phải nộp = −thueDaLoai(bán ra) + thueDaLoai(mua vào), tức `mua vào − bán ra`.
 *
 * HAI CHIỀU NGƯỢC DẤU — đây chính là chỗ bản kế hoạch đầu làm sai khi cộng thẳng:
 * loại hóa đơn mã 4 ở BÁN RA làm thuế đầu ra giảm ⇒ thuế phải nộp GIẢM; loại ở MUA VÀO làm
 * thuế được khấu trừ giảm ⇒ thuế phải nộp TĂNG.
 *
 * Tính bằng BigInt trên chuỗi (`truTienChuoi`) — tiền có thể vượt 2^53, `06-BINDING_MAP` §4.2
 * CẤM `Number()`/`parseFloat`. Không chiều nào có mã 4 → `null` (ẩn dòng, tiêu chí #17c).
 */
export function deltaThuePhaiNop(byChieu: readonly ChieuSummary[]): string | null {
  if (!byChieu.some((c) => soLoai(c) > 0)) return null;
  const ban = byChieu.find((c) => c.chieu === "sold");
  const mua = byChieu.find((c) => c.chieu === "purchase");
  return truTienChuoi(mua?.thueDaLoai ?? "0", ban?.thueDaLoai ?? "0");
}

/** "-1711111" → "giảm 1.711.111 ₫". Nêu hướng bằng CHỮ, không để dấu trừ đứng cạnh chữ
 * "giảm" (đọc thành phủ định kép). */
function dienGiaiDelta(delta: string): string {
  if (delta === "0") return "không đổi";
  const am = delta.startsWith("-");
  return `${am ? "giảm" : "tăng"} ${tien(am ? delta.slice(1) : delta)}`;
}

/** Danh sách hóa đơn ĐÃ BỊ sửa của kỳ đang lọc.
 *
 * Chỉ mount khi người dùng bấm bung — cố ý KHÔNG tải sẵn: đa số kỳ không có hóa đơn nào bị
 * sửa, tải trước là tốn một lượt gọi cho mọi lần mở trang.
 *
 * Nguồn `GET /invoices?biSua=true` (mã 4 + mã 5) — KHÁC nguồn của nút "Hóa đơn vừa thay
 * đổi", vốn chỉ thấy hóa đơn đổi trạng thái TRONG LÚC hệ thống theo dõi. */
function DanhSachBiSua({ filter }: { filter: InvoiceFilter }) {
  const ds = useQuery({
    queryKey: ["invoices-bi-sua", filter],
    queryFn: () => api.getInvoices({ ...filter, biSua: true }, { limit: 100 }),
  });

  if (ds.isPending) return <Loading />;
  if (ds.isError)
    return <ErrorState message="Không tải được danh sách." onRetry={() => ds.refetch()} />;
  if (ds.data.rows.length === 0) return <div>Không có hóa đơn nào bị sửa trong kỳ này.</div>;

  return (
    <div style={{ display: "grid", gap: "var(--sp-2)", marginTop: "var(--sp-2)" }}>
      {ds.data.rows.map((r) => (
        <div key={r.id} style={{ fontSize: "var(--fs-sm)" }}>
          <strong>
            {r.khhdon}-{r.shdon}
          </strong>{" "}
          · {formatDateVN(r.tdlap)} · {nhanTthai(r.tthai)} · {labelChieu(r.chieu)}
          <br />
          <span className="tabular">
            trước thuế {tien(r.tgtcthue ?? "0")} · thuế {tien(r.tgtthue ?? "0")} · tổng{" "}
            {tien(r.tgtttbso ?? "0")}
          </span>
        </div>
      ))}
      {ds.data.total > ds.data.rows.length ? (
        <div>
          Hiện {ds.data.rows.length}/{ds.data.total} hóa đơn - tải file Excel để xem đủ.
        </div>
      ) : null}
    </div>
  );
}

function KhoiChieu({ c, badgeKy }: { c: ChieuSummary; badgeKy: string | null }) {
  const loai = soLoai(c);
  const moi = (c.soHdThayThe ?? 0) + (c.soHdDieuChinh ?? 0);
  return (
    <div style={{ marginBottom: "var(--sp-2)" }}>
      <div style={{ fontWeight: "var(--fw-semibold)" }}>
        {badgeKy ? `Kỳ ${badgeKy} · ` : ""}
        {labelChieu(c.chieu)}
      </div>
      {loai > 0 ? (
        <div>
          {loai} hóa đơn <strong>bị thay thế</strong> - đã loại khỏi tổng: trước thuế{" "}
          <strong className="tabular">{tien(c.tcthueDaLoai ?? "0", true)}</strong>, thuế{" "}
          <strong className="tabular">{tien(c.thueDaLoai ?? "0", true)}</strong>, tổng thanh toán{" "}
          <strong className="tabular">{tien(c.ttbsoDaLoai ?? "0", true)}</strong>
        </div>
      ) : null}
      {/* Mã 5 để RIÊNG và nói thẳng "vẫn tính vào tổng". Gộp chung với mã 4 thì kế toán sẽ
          trừ nhầm phần này ra khỏi sổ — sai theo chiều ngược lại (biên bản §7). */}
      {(c.soDuocDieuChinh ?? 0) > 0 ? (
        <div>
          {c.soDuocDieuChinh} hóa đơn <strong>bị điều chỉnh</strong> - <em>vẫn tính vào tổng</em>:
          trước thuế <strong className="tabular">{tien(c.tcthueBiDieuChinh ?? "0")}</strong>, thuế{" "}
          <strong className="tabular">{tien(c.thueBiDieuChinh ?? "0")}</strong>, tổng thanh toán{" "}
          <strong className="tabular">{tien(c.ttbsoBiDieuChinh ?? "0")}</strong>
        </div>
      ) : null}
      {moi > 0 ? (
        <div>
          {(c.soHdThayThe ?? 0) > 0 ? `${c.soHdThayThe} hóa đơn thay thế` : ""}
          {(c.soHdThayThe ?? 0) > 0 && (c.soHdDieuChinh ?? 0) > 0 ? " và " : ""}
          {(c.soHdDieuChinh ?? 0) > 0 ? `${c.soHdDieuChinh} hóa đơn điều chỉnh` : ""} lập trong kỳ -
          đã tính vào tổng
        </div>
      ) : null}
    </div>
  );
}

export function ThongBaoTrangThai({
  byChieu,
  badgeKy,
  filter,
}: {
  byChieu: readonly ChieuSummary[];
  badgeKy: string | null;
  /** Kỳ đang lọc — dùng nguyên vẹn khi bung danh sách, để danh sách khớp đúng con số
   * người dùng đang nhìn. */
  filter?: InvoiceFilter;
}) {
  const coThayDoi = byChieu.filter(
    (c) =>
      soLoai(c) > 0 ||
      (c.soHdThayThe ?? 0) > 0 ||
      (c.soHdDieuChinh ?? 0) > 0 ||
      (c.soDuocDieuChinh ?? 0) > 0,
  );
  const soMaLa = byChieu.reduce((n, c) => n + (c.soMaLa ?? 0), 0);
  // `tthai=5` = hóa đơn CỦA KỲ NÀY đã bị một hóa đơn khác sửa. Hóa đơn sửa nó có thể nằm ở
  // KỲ SAU, và khi đó phần tăng/giảm rơi vào kỳ sau trong khi kỳ này vẫn cộng đủ bản gốc.
  // Đếm cả hai chiều: mã 5 ở mua vào cũng đã quan sát được (2 ca, biên bản §6.5).
  const soBiSua = byChieu.reduce((n, c) => n + (c.soDuocDieuChinh ?? 0), 0);
  // Tổng số hóa đơn ĐÃ BỊ sửa = mã 4 (bị thay thế) + mã 5 (bị điều chỉnh) — khớp đúng tập
  // mà `GET /invoices?biSua=true` trả về, để con số trên nút không lệch danh sách bung ra.
  const soBiSuaTong = byChieu.reduce((n, c) => n + soLoai(c) + (c.soDuocDieuChinh ?? 0), 0);
  const [moDs, setMoDs] = useState(false);
  const delta = deltaThuePhaiNop(byChieu);

  if (coThayDoi.length === 0 && soMaLa === 0 && soBiSua === 0) return null;

  return (
    <div style={{ display: "grid", gap: "var(--sp-3)", marginBottom: "var(--sp-4)" }}>
      {coThayDoi.length > 0 ? (
        // Tone `info`: đây là thay đổi ĐÃ KIỂM CHỨNG cần rà soát, KHÔNG phải lỗi.
        <Alert tone="info">
          {coThayDoi.map((c) => (
            <KhoiChieu key={c.chieu} c={c} badgeKy={badgeKy} />
          ))}
          {delta !== null ? (
            <div style={{ marginBottom: "var(--sp-2)" }}>
              <strong>
                Việc loại hóa đơn bị thay thế làm thuế phải nộp trên báo cáo {dienGiaiDelta(delta)}.
              </strong>
            </div>
          ) : null}
          {/* Bung danh sách ngay tại chỗ — người dùng đang đứng ở đây, không bắt họ đi tìm
              sang màn khác. Chỉ hiện khi thật sự có hóa đơn bị sửa để xem. */}
          {soBiSuaTong > 0 && filter ? (
            <div style={{ marginBottom: "var(--sp-2)" }}>
              <Button type="button" variant="ghost" onClick={() => setMoDs((v) => !v)}>
                {moDs ? "Ẩn danh sách" : `Xem danh sách ${soBiSuaTong} hóa đơn`}
              </Button>
              {moDs ? <DanhSachBiSua filter={filter} /> : null}
            </div>
          ) : null}
        </Alert>
      ) : null}

      {/* Hóa đơn của kỳ này đã bị sửa bởi hóa đơn KHÁC — mà hóa đơn đó có thể thuộc kỳ SAU.
          Ca thật: HĐ 7914 lập 23/06/2026 bị HĐ 9842 lập 09/07/2026 điều chỉnh giảm
          3.599.999 đ. Tổng tháng 6 vẫn cộng đủ 7914, phần giảm rơi sang tháng 7 ⇒ nếu tờ
          khai tháng 6 đã nộp thì phải cân nhắc KHAI BỔ SUNG. Đây là cảnh báo duy nhất người
          xem kỳ cũ nhận được cho tới khi U37 ghép được cặp gốc↔mới.

          Tone `warning` chứ KHÔNG phải `info` như khối phía trên (chủ dự án chốt 2026-07-28,
          đã ghi thành luật ở 07-DESIGN_TOKENS §1): khối trên chỉ GIẢI THÍCH số liệu đã đổi,
          còn khối này bỏ qua thì có HẬU QUẢ PHÁP LÝ — tờ khai kỳ cũ có thể phải làm lại. */}
      {soBiSua > 0 ? (
        <Alert tone="warning">
          {soBiSua} hóa đơn của kỳ này đã bị thay thế hoặc điều chỉnh bởi hóa đơn ở kỳ khác - kiểm
          tra trước khi kê khai.
        </Alert>
      ) : null}

      {/* QĐ-6 / rủi ro §7.1 — mã "hủy" thật CHƯA có bằng chứng. Nếu Tổng cục Thuế phát ra một
          mã trạng thái ta chưa biết, hóa đơn đó VẪN được cộng vào tổng; cảnh báo này là thứ
          duy nhất giữ cho rủi ro đó không im lặng. */}
      {soMaLa > 0 ? (
        <Alert tone="warning">
          Có {soMaLa} hóa đơn mang mã trạng thái chưa xác định - cần kiểm tra.
        </Alert>
      ) : null}
    </div>
  );
}

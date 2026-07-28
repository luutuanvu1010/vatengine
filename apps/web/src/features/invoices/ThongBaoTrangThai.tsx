// U36 Gói 4 — thông báo giải thích vì sao TỔNG TIỀN đổi so với trước.
//
// Bối cảnh: từ 28/07/2026, hóa đơn `tthai=4` (BỊ THAY THẾ) không còn được cộng vào tổng
// (QĐ-3). Tổng của các kỳ ĐÃ QUA vì vậy khác con số người dùng từng thấy và từng xuất file
// (§7.2 kế hoạch U36) — im lặng đổi số là cách chắc chắn nhất để kế toán tưởng phần mềm
// hỏng, hoặc tưởng nghĩa vụ thuế của họ vừa thay đổi.
//
// Chịu được dữ liệu shape CŨ: `queryKey` không đổi sau deploy nên một tab đang mở vẫn giữ
// dữ liệu cũ trong cache tới lần refetch kế. Mọi trường mới đọc qua `?? 0` / `?? "0"`.
import { truTienChuoi } from "@vat/domain";
import { Alert } from "../../components/ui/primitives";
import { formatMoney } from "../../lib/format";
import { labelChieu } from "../../lib/statusLabels";
import type { ChieuSummary } from "../../types/api";

/** Ngày đổi cách tính — nêu thẳng cho người dùng, không giấu trong changelog. */
export const NGAY_DOI_CACH_TINH = "28/07/2026";

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
          {loai} hóa đơn <strong>bị thay thế</strong> - đã loại khỏi tổng: thuế{" "}
          <strong className="tabular">{tien(c.thueDaLoai ?? "0", true)}</strong>, tổng thanh toán{" "}
          <strong className="tabular">{tien(c.ttbsoDaLoai ?? "0", true)}</strong>
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
}: {
  byChieu: readonly ChieuSummary[];
  badgeKy: string | null;
}) {
  const coThayDoi = byChieu.filter(
    (c) => soLoai(c) > 0 || (c.soHdThayThe ?? 0) > 0 || (c.soHdDieuChinh ?? 0) > 0,
  );
  const soMaLa = byChieu.reduce((n, c) => n + (c.soMaLa ?? 0), 0);
  // `tthai=5` = hóa đơn CỦA KỲ NÀY đã bị một hóa đơn khác sửa. Hóa đơn sửa nó có thể nằm ở
  // KỲ SAU, và khi đó phần tăng/giảm rơi vào kỳ sau trong khi kỳ này vẫn cộng đủ bản gốc.
  // Đếm cả hai chiều: mã 5 ở mua vào cũng đã quan sát được (2 ca, biên bản §6.5).
  const soBiSua = byChieu.reduce((n, c) => n + (c.soDuocDieuChinh ?? 0), 0);
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
              <strong>Thuế phải nộp trên báo cáo {dienGiaiDelta(delta)}</strong>{" "}
              <em>(số thuế phải nộp thật không đổi - trước đây phần mềm tính dư)</em>
            </div>
          ) : null}
          <div style={{ fontSize: "var(--fs-xs)" }}>
            <em>Từ {NGAY_DOI_CACH_TINH}, hóa đơn bị thay thế không còn được cộng vào tổng.</em>
          </div>
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

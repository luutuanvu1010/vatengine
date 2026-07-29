// U22 B7 — Đồng bộ theo KHOẢNG đã lọc, ngay trong bảng điều khiển. Nút "Đồng bộ khoảng
// này" (yêu cầu chủ dự án 2026-07-17) NAY có THANH TIẾN ĐỘ theo tháng + tự chạy khi danh
// sách rỗng (tinh thần U22 gốc: không để màn rỗng gây hiểu nhầm). Bấm/tự → gọi CẢ HAI:
// POST /backfill {tuNgay,denNgay} (tháng thiếu header — U22) + POST /backfill-lines (hóa
// đơn thiếu dòng hàng — U26), rồi poll GET /backfill/:id hiện tiến độ. Trình bày thuần —
// logic ở useRangeBackfill (deriveRangeBackfillState). Presentational: nhận state từ hook.
// Task 12 — nút "Đồng bộ từ Thuế" chuyển lên hàng nút của FilterBar (thẻ "Tra cứu hóa đơn"
// gộp lọc + đồng bộ); panel này CHỈ còn tiến độ + cảnh báo. Cơ chế tự-tải-file sau đồng bộ
// (và `loiTaiXuong`) đã bỏ hoàn toàn — người dùng bấm nút Xuất riêng khi cần.
import { Alert } from "../../components/ui/primitives";
import type { SyncStatusView } from "../../types/api";
import type { LineBackfillResult, RangeBackfillState } from "./useRangeBackfill";
import { formatPeriod } from "./useRangeBackfill";

function ProgressBar({
  soXong,
  tong,
  thangHienTai,
}: { soXong: number; tong: number; thangHienTai?: string }) {
  return (
    <div style={{ display: "grid", gap: "var(--sp-2)" }}>
      <div style={{ fontSize: "var(--fs-base)", color: "var(--text-secondary)" }}>
        {tong > 0 ? (
          <>
            Đang lấy hóa đơn từ Tổng cục Thuế — <strong>{soXong}</strong>/<strong>{tong}</strong>{" "}
            tháng
            {thangHienTai ? (
              <>
                {" "}
                (đang lấy tháng <strong>{formatPeriod(thangHienTai)}</strong>…)
              </>
            ) : null}
          </>
        ) : (
          "Đang chuẩn bị đồng bộ khoảng này…"
        )}
      </div>
      {/* Native <progress> = role "progressbar" ngầm (a11y đúng, không cần tabindex). */}
      <progress
        value={soXong}
        max={tong || 1}
        aria-label="Tiến độ lấy hóa đơn theo tháng"
        style={{ width: "100%", height: 8, accentColor: "var(--brand-600)" }}
      />
    </div>
  );
}

export interface RangeBackfill {
  state: RangeBackfillState;
  lineResult: LineBackfillResult | null;
  start: () => void;
  /** Tác vụ đồng bộ NỀN đang chạy (GET sync-status) — minh bạch phiên để người dùng
   * không bấm lặp lại (sự cố livelock 2026-07-27). Tùy chọn: thiếu = không hiển thị. */
  tacVuNen?: SyncStatusView | null;
}

/** Các kỳ đang chạy nền, mỗi kỳ một lần, định dạng MM/YYYY. */
function thangDangChayNen(tacVuNen: SyncStatusView): string {
  return [...new Set(tacVuNen.thang.map((t) => formatPeriod(t.period)))].join(", ");
}

export function RangeSyncPanel({ backfill }: { backfill: RangeBackfill }) {
  const { state, lineResult, tacVuNen } = backfill;
  const running = state.kind === "dang_lay";
  return (
    <div style={{ display: "grid", gap: "var(--sp-2)" }}>
      {/* Tác vụ nền: chỉ hiện khi KHÔNG đang hiển thị tiến độ của chính phiên này —
          tránh nói cùng một việc hai lần. */}
      {!running && tacVuNen && tacVuNen.soTacVu > 0 && (
        <Alert tone="info">
          Đang có <strong>{tacVuNen.soTacVu}</strong> tác vụ đồng bộ chạy nền (tháng{" "}
          <strong>{thangDangChayNen(tacVuNen)}</strong>). Bấm <strong>Đồng bộ từ Thuế</strong> lúc
          này sẽ <strong>không tạo phiên trùng</strong> — hệ thống tự ghép vào phiên đang chạy, dữ
          liệu sẽ đầy dần.
        </Alert>
      )}
      {running && (
        <ProgressBar
          soXong={state.soXong}
          tong={state.tong}
          {...(state.thangHienTai ? { thangHienTai: state.thangHienTai } : {})}
        />
      )}

      {/* Dòng hàng (U26) chạy song song — hiện ngay khi có kết quả, không phụ thuộc header. */}
      {lineResult && lineResult.soDaXepHang > 0 && (
        <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-tertiary)" }}>
          Đồng thời đang đổ dòng hàng cho <strong>{lineResult.soDaXepHang}</strong> hóa đơn cũ
          {lineResult.conLai > 0 ? <> (còn {lineResult.conLai} — sẽ tiếp ở đợt sau)</> : null} — cột{" "}
          <strong>Hàng hóa, dịch vụ</strong> và <strong>Số lượng</strong> sẽ đầy dần.
        </div>
      )}

      {state.kind === "phien_het_han" && (
        <Alert tone="danger">
          Phiên đăng nhập thuế đã hết hạn — vui lòng <strong>kết nối lại</strong> ở trang{" "}
          <strong>Tài khoản thuế</strong> rồi bấm lại.
        </Alert>
      )}
      {state.kind === "loi_gui" && (
        <Alert tone="danger">Không gửi được yêu cầu đồng bộ. Thử lại sau ít phút.</Alert>
      )}
      {state.kind === "loi_dong_bo" && (
        <Alert tone="warning">
          Yêu cầu đồng bộ <strong>đã nhận</strong>, nhưng {state.soThangLoi} tháng chưa kéo được dữ
          liệu — thường do máy chủ Tổng cục Thuế đang giới hạn tốc độ. Hệ thống sẽ tự giãn nhịp và
          thử lại; bạn có thể bấm lại sau ít phút. Bấm liên tục không làm nhanh hơn.
        </Alert>
      )}
      {state.kind === "xong" && (
        <Alert tone="info">
          Đã đồng bộ xong khoảng này. Dữ liệu sẽ hiển thị đầy đủ trong ít phút — tải lại danh sách
          nếu chưa thấy.
        </Alert>
      )}
    </div>
  );
}

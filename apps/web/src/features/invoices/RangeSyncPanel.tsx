// U22 B7 — Đồng bộ theo KHOẢNG đã lọc, ngay trong bảng điều khiển. Nút "Đồng bộ khoảng
// này" (yêu cầu chủ dự án 2026-07-17) NAY có THANH TIẾN ĐỘ theo tháng + tự chạy khi danh
// sách rỗng (tinh thần U22 gốc: không để màn rỗng gây hiểu nhầm). Bấm/tự → gọi CẢ HAI:
// POST /backfill {tuNgay,denNgay} (tháng thiếu header — U22) + POST /backfill-lines (hóa
// đơn thiếu dòng hàng — U26), rồi poll GET /backfill/:id hiện tiến độ. Trình bày thuần —
// logic ở useRangeBackfill (deriveRangeBackfillState). Presentational: nhận state từ hook.
import { Alert, Button } from "../../components/ui/primitives";
import type { LineBackfillResult, RangeBackfillState } from "./useRangeBackfill";
import { formatPeriod } from "./useRangeBackfill";

function ProgressBar({
  soXong,
  tong,
  thangHienTai,
}: { soXong: number; tong: number; thangHienTai?: string }) {
  return (
    <div style={{ display: "grid", gap: "var(--sp-2)" }}>
      <div style={{ fontSize: "var(--fs-sm)", color: "var(--text-secondary)" }}>
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
}

export function RangeSyncPanel({
  tuNgay,
  denNgay,
  backfill,
}: { tuNgay: string; denNgay: string; backfill: RangeBackfill }) {
  const { state, lineResult, start } = backfill;
  const running = state.kind === "dang_lay";
  return (
    <div style={{ marginTop: "var(--sp-3)", display: "grid", gap: "var(--sp-2)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", flexWrap: "wrap" }}>
        <Button onClick={start} disabled={running}>
          {running ? "Đang đồng bộ…" : "Đồng bộ khoảng này"}
        </Button>
        <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-tertiary)" }}>
          Kéo hóa đơn + dòng hàng từ Tổng cục Thuế cho khoảng {tuNgay} → {denNgay} (chạy nền)
        </span>
      </div>

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
      {state.kind === "co_loi" && (
        <Alert tone="danger">Không gửi được yêu cầu đồng bộ. Thử lại sau ít phút.</Alert>
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

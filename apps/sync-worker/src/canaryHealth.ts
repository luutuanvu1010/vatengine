// U43 — Máy trạng thái canary lối vào GDT (THUẦN, không I/O, test offline).
// Khác probe egress (health.ts: mọi verdict xấu đều cần 3 tick): WAF_BLOCKED và DRIFT là tín
// hiệu XÁC ĐỊNH (thân phản hồi/mã HTTP nói rõ) → báo ngay lần đầu; TIMEOUT/ERROR là nhiễu
// mạng → giữ ngưỡng 3. Đã báo thì im tới khi hồi phục (một OK) → báo "đã thông lại".
// Tin "đã bật" (kiểm CÁI CHUÔNG ngay khi deploy, không đợi sự cố thật) neo vào cờ BỀN
// `daChao` chứ KHÔNG suy ra từ `prev === undefined`: nếu tick canary đầu tiên sau deploy
// vướng nhiễu mạng (TIMEOUT/ERROR dưới ngưỡng 3) thì không có alert nào, nhưng từ đó
// `prev` hết undefined vĩnh viễn ⇒ chuông thử-khi-deploy mất câm (review U43, mục B).
//
// Hàm này LẠC QUAN: state trả về giả định cảnh báo đã tới tay người. Khi sink báo không
// giao được, chỗ gọi lưu `trangThaiKhiGiaoHong(...)` thay vì `step.state` — với hệ cảnh
// báo, "báo trùng" rẻ hơn "mất báo" rất nhiều (mục A).
import type { CanaryResult, CanaryVerdict } from "@vat/gdt-client";

export const CANARY_BAD_STREAK_THRESHOLD = 3;

export interface CanaryState {
  lastVerdict?: CanaryVerdict;
  /** Số verdict ≠ OK liên tiếp. */
  consecutiveBad: number;
  /** Đã phát cảnh báo cho đợt xấu hiện tại chưa (chống spam). */
  alerted: boolean;
  /** ISO thời điểm bắt đầu đợt xấu hiện tại. */
  since?: string;
  /**
   * Đã GIAO ĐƯỢC tin "giám sát đã bật" chưa. Bền qua mọi tick (kể cả nhánh xấu) và chỉ
   * bật khi tin thật sự tới nơi — trạng thái cũ trong DO chưa có trường này nên sau khi
   * deploy bản vá sẽ có thêm ĐÚNG MỘT tin chào, coi như chuông được thử lại.
   */
  daChao?: boolean;
}

export const HEALTHY_CANARY: CanaryState = Object.freeze({ consecutiveBad: 0, alerted: false });

export type CanaryAlertKind = "bat_giam_sat" | "chan" | "drift" | "loi_lien_tiep" | "hoi_phuc";

export interface CanaryAlert {
  kind: CanaryAlertKind;
  result: CanaryResult;
  consecutiveBad: number;
}

export interface CanaryStep {
  state: CanaryState;
  alert: CanaryAlert | null;
}

const XAC_DINH: ReadonlySet<CanaryVerdict> = new Set(["WAF_BLOCKED", "DRIFT"]);

export function nextCanaryHealth(
  prev: CanaryState | undefined,
  result: CanaryResult,
  nowIso: string,
): CanaryStep {
  const verdict = result.verdict;
  // `daChao: true` là LẠC QUAN — tin chào/hồi phục giao được mới thật sự chứng minh chuông
  // sống; giao hỏng thì chỗ gọi lưu `trangThaiKhiGiaoHong` để hạ cờ xuống.
  const khoe: CanaryState = {
    lastVerdict: "OK",
    consecutiveBad: 0,
    alerted: false,
    daChao: true,
  };

  if (verdict === "OK") {
    // Xét `alerted` TRƯỚC `daChao`: đang trong đợt sự cố đã báo thì tin cần gửi là "đã
    // thông lại", không phải tin chào (tin hồi phục cũng chứng minh chuông sống).
    if (prev?.alerted)
      return { state: khoe, alert: { kind: "hoi_phuc", result, consecutiveBad: 0 } };
    if (!prev?.daChao)
      return { state: khoe, alert: { kind: "bat_giam_sat", result, consecutiveBad: 0 } };
    return { state: khoe, alert: null };
  }

  const truoc = prev ?? HEALTHY_CANARY;
  const consecutiveBad = truoc.consecutiveBad + 1;
  const since = truoc.since ?? nowIso;
  let kind: CanaryAlertKind | null = null;
  if (!truoc.alerted) {
    if (XAC_DINH.has(verdict)) kind = verdict === "WAF_BLOCKED" ? "chan" : "drift";
    else if (consecutiveBad >= CANARY_BAD_STREAK_THRESHOLD) kind = "loi_lien_tiep";
  }
  return {
    state: {
      lastVerdict: verdict,
      consecutiveBad,
      alerted: truoc.alerted || kind !== null,
      since,
      // Cờ chào đi XUYÊN nhánh xấu — rơi mất thì mọi blip dưới ngưỡng sẽ làm chào lại.
      ...(truoc.daChao === undefined ? {} : { daChao: truoc.daChao }),
    },
    alert: kind ? { kind, result, consecutiveBad } : null,
  };
}

/**
 * Trạng thái để LƯU khi cảnh báo của `step` KHÔNG giao được tới người.
 *
 * Giữ nguyên diễn biến (`consecutiveBad`/`since`/`lastVerdict` — gate enqueue đọc chúng)
 * nhưng xoá dấu "đã báo" để tick sau báo LẠI:
 * - `chan`/`drift`/`loi_lien_tiep` → `alerted: false`;
 * - `bat_giam_sat` → `daChao: false` (tick OK sau chào lại);
 * - `hoi_phuc` → GIỮ `alerted: true`. QUYẾT ĐỊNH (review U43): người vận hành vẫn đang tin
 *   "GDT bị chặn", nên tick OK sau phải báo hồi phục lại; đổi lại, tick xấu kế tiếp im —
 *   đúng với hiểu biết hiện có của họ, không báo trùng cái đã báo.
 */
export function trangThaiKhiGiaoHong(step: CanaryStep, prev: CanaryState | undefined): CanaryState {
  const kind = step.alert?.kind;
  if (kind === "bat_giam_sat") return { ...step.state, daChao: false };
  if (kind === "hoi_phuc") return { ...step.state, alerted: true, daChao: prev?.daChao ?? false };
  return { ...step.state, alerted: false };
}

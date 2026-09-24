// U43 — Soạn tin Telegram cho sự kiện giám sát lối vào GDT (canary mỗi giờ + probe egress).
// Tin nằm trên máy chủ Telegram (ngoài tầm kiểm soát tenant — security.md): CHỈ metadata
// vận hành. Canary dùng MST giả nên không có dữ liệu tenant; KHÔNG BAO GIỜ đưa token/secret.
import { thoatHtml } from "./telegram";

export const RUNBOOK_GDT = "docs/runbooks/gdt-doi-phuong-thuc.md";

export type LoaiSuKienGiamSat =
  | "bat_giam_sat"
  | "chan"
  | "drift"
  | "loi_lien_tiep"
  | "hoi_phuc"
  | "egress";

export interface SuKienGiamSatGdt {
  loai: LoaiSuKienGiamSat;
  verdict: string;
  httpStatus?: number;
  /** Thông điệp GDT/lỗi nguyên văn — chuỗi do BÊN NGOÀI kiểm soát, phải escape. */
  message?: string;
  consecutiveBad?: number;
  egressCountry?: string;
  thoiDiem: Date;
}

function tieuDe(sk: SuKienGiamSatGdt): string {
  switch (sk.loai) {
    case "bat_giam_sat":
      return "✅ <b>Giám sát lối vào GDT đã bật</b>";
    case "chan":
      return "🚫 <b>GDT đang CHẶN đăng nhập từ hệ thống (WAF)</b>";
    case "drift":
      return "⚠️ <b>GDT đổi cách phản hồi đăng nhập</b>";
    case "loi_lien_tiep":
      return `⚠️ <b>Canary GDT lỗi ${sk.consecutiveBad ?? "?"} lần liên tiếp</b>`;
    case "hoi_phuc":
      return "✅ <b>GDT đã thông lại</b>";
    case "egress":
      return `🚫 <b>Probe egress GDT xấu ${sk.consecutiveBad ?? "?"} tick liên tiếp</b>`;
  }
}

function gioVietNam(d: Date): string {
  return d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour12: false });
}

function vietCanLam(loai: LoaiSuKienGiamSat): string {
  switch (loai) {
    case "chan":
      return `Việc cần làm: đọc ${RUNBOOK_GDT} — so header portal (request-id/Action/End-Point), curl tái lập, KHÔNG thử dồn.`;
    case "drift":
      return `Việc cần làm: xem mã + thông điệp ở trên, đối chiếu contract test; cập nhật phân loại có kiểm chứng (${RUNBOOK_GDT}).`;
    case "loi_lien_tiep":
      return "Việc cần làm: kiểm mạng biên/Cloudflare status; nếu kéo dài, chạy make test-contract từ máy dev.";
    case "egress":
      return `Việc cần làm: cron đồng bộ đang bị chặn enqueue tới khi probe OK. Xem ${RUNBOOK_GDT}.`;
    default:
      return "Không cần làm gì.";
  }
}

/** Soạn tin (HTML Telegram). Tách khỏi phần gửi để test không đụng mạng. */
export function soanTinGiamSatGdt(sk: SuKienGiamSatGdt): string {
  const dong: string[] = [tieuDe(sk), ""];
  dong.push(`Verdict: <code>${thoatHtml(sk.verdict)}</code>`);
  if (sk.httpStatus !== undefined) dong.push(`HTTP: <code>${sk.httpStatus}</code>`);
  if (sk.message) dong.push(`GDT nói: ${thoatHtml(sk.message)}`);
  if (sk.egressCountry) dong.push(`Egress: ${thoatHtml(sk.egressCountry)}`);
  dong.push(`Lúc: ${thoatHtml(gioVietNam(sk.thoiDiem))} (giờ Việt Nam)`);
  dong.push("", thoatHtml(vietCanLam(sk.loai)));
  return dong.join("\n");
}

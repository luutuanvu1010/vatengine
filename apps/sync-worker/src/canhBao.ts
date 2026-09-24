// U43 — Đưa cảnh báo giám sát tới NGƯỜI THẬT qua Telegram (@vat/thong-bao). FAIL-SILENT có
// log: thiếu cấu hình hay Telegram sập thì cron vẫn sống, nhưng log nói RÕ vì sao không gửi.
import {
  type KetQuaThongBao,
  type SuKienGiamSatGdt,
  guiTinTelegram,
  kiemTraCauHinhTelegram,
  soanTinGiamSatGdt,
} from "@vat/thong-bao";

export interface EnvTelegram {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
}

export async function guiCanhBaoTelegram(
  env: EnvTelegram,
  sk: SuKienGiamSatGdt,
): Promise<KetQuaThongBao> {
  const ch = kiemTraCauHinhTelegram(env);
  if (!ch.ok) {
    console.warn(`[canhBao] Telegram TẮT — thiếu: ${ch.thieu.join(", ")}`);
    return { daGui: false, lyDo: "chua_cau_hinh" };
  }
  const kq = await guiTinTelegram(ch.cauHinh, soanTinGiamSatGdt(sk));
  if (!kq.daGui) console.warn(`[canhBao] không gửi được Telegram: ${kq.lyDo}`);
  return kq;
}

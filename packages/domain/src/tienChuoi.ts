// Số học TIỀN trên CHUỖI — nơi dùng chung cho web và tầng truy vấn.
//
// Vì sao cần: tiền là `numeric` Postgres, có thể vượt 2^53. `06-BINDING_MAP.md` §4.2 CẤM
// `Number()`/`parseFloat` cho tiền — ép float là mất số, tức sai sổ. Mọi phép tính tiền ở
// tầng trình bày phải đi qua đây.
//
// ⚠️ DRIFT ĐÃ BIẾT (ghi lại thay vì âm thầm chọn một bên — CLAUDE.md §8):
// `packages/export/src/columns.ts` có bộ số học thập phân riêng (`congThapPhan`,
// `tinhTienThue`, `nhanTram`) ra đời trước, ở một gói mà `apps/web` KHÔNG phụ thuộc. Hai
// nơi cùng làm số học chuỗi thập phân là một nguồn sự thật rưỡi. Gộp về đây là việc nên
// làm nhưng vượt phạm vi U36 ⇒ đã ghi vào `docs/BACKLOG-y-tuong-va-de-xuat.md`.

const DANG_SO = /^[+-]?\d+(\.\d+)?$/;

interface SoThapPhan {
  val: bigint;
  scale: number;
}

/** Chuỗi số → (nguyên đã dịch thang, số chữ số thập phân). null/undefined/rỗng → 0.
 * Chuỗi không phải số → NÉM: thà đỏ còn hơn trả số bịa vào một con số tiền. */
function tach(s: string | null | undefined): SoThapPhan {
  if (s === null || s === undefined || s === "") return { val: 0n, scale: 0 };
  if (!DANG_SO.test(s)) throw new Error(`Không phải chuỗi số tiền hợp lệ: ${s}`);
  const [nguyen = "0", thapPhan = ""] = s.split(".");
  return { val: BigInt(nguyen + thapPhan), scale: thapPhan.length };
}

/** (nguyên đã dịch thang, thang) → chuỗi; cắt số 0 đuôi phần thập phân; 0 luôn là "0". */
function dinhDang(val: bigint, scale: number): string {
  if (scale === 0) return val.toString();
  const am = val < 0n;
  const abs = (am ? -val : val).toString().padStart(scale + 1, "0");
  const nguyen = abs.slice(0, abs.length - scale);
  const thapPhan = abs.slice(abs.length - scale).replace(/0+$/, "");
  const than = thapPhan ? `${nguyen}.${thapPhan}` : nguyen;
  return am && val !== 0n ? `-${than}` : than;
}

/** `a - b` trên chuỗi tiền, CHÍNH XÁC ở mọi độ lớn (BigInt). Thiếu vế → coi như 0. */
export function truTienChuoi(a: string | null | undefined, b: string | null | undefined): string {
  const pa = tach(a);
  const pb = tach(b);
  const scale = Math.max(pa.scale, pb.scale);
  const na = pa.val * 10n ** BigInt(scale - pa.scale);
  const nb = pb.val * 10n ** BigInt(scale - pb.scale);
  return dinhDang(na - nb, scale);
}

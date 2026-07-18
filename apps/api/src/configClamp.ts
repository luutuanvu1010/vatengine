// U17a (QĐ-5) — Kẹp biên cho giá trị cấu hình đến từ DB (Admin sửa được ở U18).
// Mở rộng pattern `positiveOr` sẵn có (loginLimiter.ts:36) thêm chặn TRÊN, vì giá trị
// nay do người nhập chứ không còn là hằng deploy: quá nhỏ → khóa sạch khách; quá lớn →
// vô hiệu hóa chống lạm dụng. Rác/thiếu → mặc định trong mã (fail-safe-to-DEFAULT:
// KHÔNG fail-open, KHÔNG fail-closed).
//
// TÁCH HAI HÀM có chủ ý: ép số nguyên cho mọi trường sẽ khiến KHÔNG siết được
// refillPerSec xuống dưới 1/s (mặc định 2/s) — đúng hành vi Hiến pháp mong muốn nhất
// ("Tôn trọng máy chủ thuế… Không gọi dồn dập").

export function parseFinite(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

function clampTo(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

/** Kẹp về [min,max] rồi LÀM TRÒN. Dùng cho số đếm: req/phút, maxFailures, capacity. */
export function clampInt(raw: unknown, min: number, max: number, fallback: number): number {
  const n = parseFinite(raw);
  // fallback cũng bị kẹp: fallback sai không được thành đường vòng qua biên.
  return Math.round(clampTo(n ?? fallback, min, max));
}

/** Kẹp về [min,max], GIỮ phần thập phân. Dùng cho tốc độ/thời lượng: refillPerSec, *Ms. */
export function clampNumber(raw: unknown, min: number, max: number, fallback: number): number {
  const n = parseFinite(raw);
  return clampTo(n ?? fallback, min, max);
}

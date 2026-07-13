// Khóa tự nhiên hóa đơn ở TẦNG DB — nguồn chân lý DUY NHẤT (đối xứng khóa 5 trường
// của adapter `packages/gdt-client`, nhưng THÊM `tenant_id` để cách ly đa khách hàng
// và làm nền cho upsert idempotent ở U5). Xem CLAUDE.md ("Khóa tự nhiên hóa đơn")
// và .claude/rules/multi-tenant.md.

/** 6 trường khóa tự nhiên hóa đơn, ĐÚNG THỨ TỰ (tenant_id đứng đầu). */
export const HOA_DON_NATURAL_KEY = [
  "tenant_id",
  "nbmst",
  "khmshdon",
  "khhdon",
  "shdon",
  "tdlap",
] as const;

/** Tên ràng buộc UNIQUE khóa tự nhiên trên bảng `hoa_don`. */
export const HOA_DON_NATURAL_KEY_CONSTRAINT = "hoa_don_natural_key";

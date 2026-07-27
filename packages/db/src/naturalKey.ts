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

/** Tên ràng buộc UNIQUE (tenant_id, id) trên `hoa_don` — nền cho FK composite
 * same-tenant từ `lich_su_thay_doi_hoa_don` (U35, multi-tenant.md). */
export const HOA_DON_TENANT_ID_CONSTRAINT = "hoa_don_tenant_id_id_unique";

/** Tên ràng buộc UNIQUE (tenant_id, id) trên `lan_dong_bo` — nền cho FK composite
 * same-tenant từ `lich_su_thay_doi_hoa_don.lan_dong_bo_id` (U35, multi-tenant.md). */
export const LAN_DONG_BO_TENANT_ID_CONSTRAINT = "lan_dong_bo_tenant_id_id_unique";

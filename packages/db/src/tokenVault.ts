// U12 — Kho token GDT mã hóa TẠI NGHỈ (security.md: "token JWT do Tổng cục Thuế cấp,
// mã hoá tại nghỉ (envelope encryption), vòng đời ngắn, gắn token_het_han"). Seam
// hẹp bọc `@vat/crypto` quanh cột `tai_khoan_thue.token_hien_tai`.
//
// PHẠM VI (quyết định #1): CHỈ seam store/read + test fixture. Đường GHI runtime
// (authenticate → lưu token) là đơn vị nghiệp vụ sau — seam này SẴN SÀNG cho nó.
//
// Cách ly tenant (multi-tenant.md): mọi thao tác qua `withTenant` (RLS lớp 2) + lọc
// `tenant_id` tường minh (lớp 1). KHÔNG log token (security.md).
import { openSecret, sealSecret } from "@vat/crypto";
import { and, eq } from "drizzle-orm";
import type { TablesRelationalConfig } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { taiKhoanThue } from "./schema";
import { withTenant } from "./tenantContext";

// Db bất kỳ (pg/Hyperdrive khi chạy; PGlite khi test) — giống mẫu AnyDb ở apps
// (tránh `any`; withTenant generic suy ra tham số cụ thể).
type AnyDb = PgDatabase<PgQueryResultHKT, Record<string, unknown>, TablesRelationalConfig>;

/** Token đã giải mã của một tài khoản thuế. */
export interface DecryptedToken {
  token: string;
  tokenHetHan: Date | null;
}

/**
 * Mã hóa `token` và lưu vào `tai_khoan_thue.token_hien_tai` (tenant-scoped). Ghi kèm
 * `token_het_han`. KHÔNG lưu token thô.
 */
export async function storeToken(
  db: AnyDb,
  tenantId: string,
  taikhoanId: string,
  token: string,
  tokenHetHan: Date,
  kekB64: string,
): Promise<void> {
  const sealed = await sealSecret(token, kekB64);
  await withTenant(db, tenantId, async (tx) => {
    await tx
      .update(taiKhoanThue)
      .set({ tokenHienTai: sealed, tokenHetHan })
      .where(and(eq(taiKhoanThue.id, taikhoanId), eq(taiKhoanThue.tenantId, tenantId)));
  });
}

/**
 * Đọc + giải mã token của một tài khoản (tenant-scoped). Trả `null` nếu tài khoản
 * không thuộc tenant, không tồn tại, hoặc chưa có token (chưa đăng nhập).
 */
export async function readToken(
  db: AnyDb,
  tenantId: string,
  taikhoanId: string,
  kekB64: string,
): Promise<DecryptedToken | null> {
  const sealed = await withTenant(db, tenantId, async (tx) => {
    const rows = await tx
      .select({ tokenHienTai: taiKhoanThue.tokenHienTai, tokenHetHan: taiKhoanThue.tokenHetHan })
      .from(taiKhoanThue)
      .where(and(eq(taiKhoanThue.id, taikhoanId), eq(taiKhoanThue.tenantId, tenantId)));
    return rows[0] ?? null;
  });
  if (!sealed || sealed.tokenHienTai === null) return null;
  return {
    token: await openSecret(sealed.tokenHienTai, kekB64),
    tokenHetHan: sealed.tokenHetHan,
  };
}

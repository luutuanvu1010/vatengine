// H-A.2 — Cổng an ninh RLS ở RUNTIME: kiểm thuộc tính role kết nối DB lúc khởi động
// (cold start Worker). Role app kết nối Hyperdrive PHẢI NOSUPERUSER + NOBYPASSRLS +
// KHÔNG sở hữu bảng — nếu không, RLS (cách ly tenant lớp 2, multi-tenant.md) bị VÔ HIỆU
// kể cả FORCE ⇒ rò dữ liệu chéo tenant (thảm họa pháp lý). ADR-0004 (2026-07-15) đã kiểm
// chứng: vat_app an toàn, neondb_owner CÓ BYPASSRLS. Cổng này biến bằng chứng tĩnh đó
// thành ép tự động: chặn cả khi ai đó đổi chuỗi kết nối sang role sai sau này.
//
// THUẦN + nhận executor (db.execute) tiêm được → test xác định. Caching + fail-fast do
// tầng wiring (apps/*/db.ts) lo (một lần/isolate).
import { sql } from "drizzle-orm";

// Executor tối thiểu: chỉ cần `.execute(query)` trả `{ rows }` — khớp cả node-postgres
// (Hyperdrive production) lẫn PGlite (test), không ràng buộc kiểu drizzle cụ thể.
export interface RoleGuardExecutor {
  execute: (query: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
}

export interface RoleGuardVerdict {
  role: string;
  rolsuper: boolean;
  rolbypassrls: boolean;
  ownsTables: boolean;
  safe: boolean;
  /** Lý do KHÔNG an toàn (rỗng nếu safe): 'rolsuper' | 'rolbypassrls' | 'owns_tables'. */
  reasons: string[];
}

// Truy vấn thuộc tính role kết nối hiện tại + số bảng nghiệp vụ nó sở hữu. Không throw —
// caller (assertConnectionRoleSafe) quyết fail-fast. Truy vấn khớp bằng chứng ADR-0004 E1.
export async function checkConnectionRole(db: RoleGuardExecutor): Promise<RoleGuardVerdict> {
  const roleRes = await db.execute(
    sql`select current_user as role, rolsuper, rolbypassrls from pg_roles where rolname = current_user`,
  );
  const row = roleRes.rows[0];
  if (!row) {
    // Không xác định được role kết nối → FAIL-CLOSED (KHÔNG giả định an toàn).
    return {
      role: "",
      rolsuper: false,
      rolbypassrls: false,
      ownsTables: false,
      safe: false,
      reasons: ["role_not_found"],
    };
  }
  const role = String(row.role ?? "");
  const rolsuper = row.rolsuper === true;
  const rolbypassrls = row.rolbypassrls === true;

  const ownRes = await db.execute(
    sql`select count(*)::int as n from pg_tables where schemaname = 'public' and tableowner = current_user`,
  );
  const ownsTables = Number(ownRes.rows[0]?.n ?? 0) > 0;

  const reasons: string[] = [];
  if (rolsuper) reasons.push("rolsuper");
  if (rolbypassrls) reasons.push("rolbypassrls");
  if (ownsTables) reasons.push("owns_tables");

  return { role, rolsuper, rolbypassrls, ownsTables, safe: reasons.length === 0, reasons };
}

// Ném nếu role KHÔNG an toàn → tầng wiring bắt, đóng kết nối, TỪ CHỐI khởi động.
export function assertConnectionRoleSafe(v: RoleGuardVerdict): void {
  if (!v.safe) {
    throw new Error(
      `TỪ CHỐI KHỞI ĐỘNG: role kết nối '${v.role}' có [${v.reasons.join(", ")}] → RLS bị VÔ HIỆU, rủi ro rò dữ liệu chéo tenant (multi-tenant.md, ADR-0004). Dùng role app NOSUPERUSER/NOBYPASSRLS/không-sở-hữu-bảng cho Hyperdrive.`,
    );
  }
}

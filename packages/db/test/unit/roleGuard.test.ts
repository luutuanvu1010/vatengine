// H-A.2 — cổng an ninh: kiểm role kết nối DB. Role app PHẢI NOSUPERUSER + NOBYPASSRLS +
// KHÔNG sở hữu bảng, nếu không RLS (cách ly tenant lớp 2) bị VÔ HIỆU (ADR-0004 E1/E2 đã
// kiểm chứng neondb_owner CÓ BYPASSRLS). Unit test dùng executor GIẢ để phủ mọi nhánh.
import { describe, expect, it } from "vitest";
import { assertConnectionRoleSafe, checkConnectionRole } from "../../src/roleGuard";

// Executor giả: lần gọi 1 = truy vấn pg_roles, lần 2 = đếm bảng sở hữu.
function mockDb(roleRow: Record<string, unknown>, ownedTables: number) {
  let call = 0;
  return {
    execute: async () => {
      call += 1;
      return call === 1 ? { rows: [roleRow] } : { rows: [{ n: ownedTables }] };
    },
  };
}

const GOOD = { role: "vat_app", rolsuper: false, rolbypassrls: false };

describe("roleGuard.checkConnectionRole", () => {
  it("role app đúng (NOSUPER/NOBYPASSRLS/không own) → safe=true", async () => {
    const v = await checkConnectionRole(mockDb(GOOD, 0));
    expect(v.safe).toBe(true);
    expect(v.reasons).toEqual([]);
    expect(v.role).toBe("vat_app");
  });

  it("rolsuper=true → safe=false, reasons chứa rolsuper", async () => {
    const v = await checkConnectionRole(mockDb({ ...GOOD, rolsuper: true }, 0));
    expect(v.safe).toBe(false);
    expect(v.reasons).toContain("rolsuper");
  });

  it("rolbypassrls=true → safe=false (neondb_owner!)", async () => {
    const v = await checkConnectionRole(mockDb({ ...GOOD, rolbypassrls: true }, 0));
    expect(v.safe).toBe(false);
    expect(v.reasons).toContain("rolbypassrls");
  });

  it("sở hữu bảng (count>0) → safe=false, reasons chứa owns_tables", async () => {
    const v = await checkConnectionRole(mockDb(GOOD, 3));
    expect(v.safe).toBe(false);
    expect(v.reasons).toContain("owns_tables");
  });

  it("nhiều vi phạm cùng lúc → gộp đủ lý do", async () => {
    const v = await checkConnectionRole(mockDb({ ...GOOD, rolsuper: true, rolbypassrls: true }, 5));
    expect(v.reasons).toEqual(expect.arrayContaining(["rolsuper", "rolbypassrls", "owns_tables"]));
  });

  it("query role trả RỖNG → FAIL-CLOSED (safe=false, role_not_found)", async () => {
    const v = await checkConnectionRole({ execute: async () => ({ rows: [] }) });
    expect(v.safe).toBe(false);
    expect(v.reasons).toContain("role_not_found");
  });
});

describe("roleGuard.assertConnectionRoleSafe", () => {
  it("safe=true → KHÔNG ném", () => {
    expect(() =>
      assertConnectionRoleSafe({
        role: "vat_app",
        rolsuper: false,
        rolbypassrls: false,
        ownsTables: false,
        safe: true,
        reasons: [],
      }),
    ).not.toThrow();
  });

  it("safe=false → NÉM, thông điệp có role + lý do (từ chối khởi động)", () => {
    expect(() =>
      assertConnectionRoleSafe({
        role: "neondb_owner",
        rolsuper: false,
        rolbypassrls: true,
        ownsTables: true,
        safe: false,
        reasons: ["rolbypassrls", "owns_tables"],
      }),
    ).toThrow(/neondb_owner.*rolbypassrls/s);
  });
});

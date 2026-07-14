import { describe, expect, it } from "vitest";
import { canExport, canManageTaxAccounts, labelRole } from "../../src/lib/rbac";

describe("RBAC client — phản chiếu ma trận server (rbac.ts)", () => {
  it("kế toán KHÔNG được kết xuất / kết nối thuế", () => {
    expect(canExport("ke_toan")).toBe(false);
    expect(canManageTaxAccounts("ke_toan")).toBe(false);
  });
  it("kế toán trưởng + quản trị được kết xuất / kết nối thuế", () => {
    expect(canExport("ke_toan_truong")).toBe(true);
    expect(canExport("quan_tri")).toBe(true);
    expect(canManageTaxAccounts("ke_toan_truong")).toBe(true);
    expect(canManageTaxAccounts("quan_tri")).toBe(true);
  });
  it("nhãn vai tiếng Việt", () => {
    expect(labelRole("ke_toan")).toBe("Kế toán");
    expect(labelRole("ke_toan_truong")).toBe("Kế toán trưởng");
    expect(labelRole("quan_tri")).toBe("Quản trị");
  });
});

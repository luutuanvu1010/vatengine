// Route đăng ký tài khoản thuế (U14, Task 5): POST /tax-accounts. Xác nhận: RBAC
// (ke_toan_truong|quan_tri), 400 khi thiếu username, và bản ghi tạo ra thuộc đúng tenant.
import { taiKhoanThue } from "@vat/db";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { type Db, bearer, freshDb, injectDb, makeEnv, makeTenant, tokenFor } from "../helpers";

describe("POST /tax-accounts (đăng ký, PGlite)", () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;
  let tenantA: string;
  beforeEach(async () => {
    db = await freshDb();
    app = createApp(injectDb(db));
    tenantA = await makeTenant(db, "Cty A", "0100000001");
  });

  it("quan_tri đăng ký → 201 + bản ghi thuộc đúng tenant", async () => {
    const token = await tokenFor(tenantA, { role: "quan_tri" });
    const res = await app.request(
      "/tax-accounts",
      {
        method: "POST",
        headers: { ...bearer(token), "content-type": "application/json" },
        body: JSON.stringify({ username: "0100000001" }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string };
    const rows = await db
      .select()
      .from(taiKhoanThue)
      .where(and(eq(taiKhoanThue.id, body.id), eq(taiKhoanThue.tenantId, tenantA)));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.username).toBe("0100000001");
  });

  it("vai ke_toan → 403", async () => {
    const token = await tokenFor(tenantA, { role: "ke_toan" });
    const res = await app.request(
      "/tax-accounts",
      {
        method: "POST",
        headers: { ...bearer(token), "content-type": "application/json" },
        body: JSON.stringify({ username: "x" }),
      },
      makeEnv(),
    );
    expect(res.status).toBe(403);
  });

  it("thiếu username → 400", async () => {
    const token = await tokenFor(tenantA, { role: "quan_tri" });
    const res = await app.request(
      "/tax-accounts",
      {
        method: "POST",
        headers: { ...bearer(token), "content-type": "application/json" },
        body: JSON.stringify({}),
      },
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });
});

// U23-D2 — POST /tax-accounts: tài khoản CHÍNH auto username = tenants.mst (KHÔNG nhận từ
// body); hạn mức tài khoản thuế (tạm =1) → tài khoản thứ 2 chặn 409; tài khoản CON ẩn sau
// cờ (mặc định TẮT) → 400. RBAC ke_toan → 403. PGlite, offline.
import { taiKhoanThue } from "@vat/db";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { type Db, bearer, freshDb, injectDb, makeEnv, makeTenant, tokenFor } from "../helpers";

describe("POST /tax-accounts (U23-D2 — auto MST + hạn mức, PGlite)", () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;
  let tenantA: string;
  beforeEach(async () => {
    db = await freshDb();
    app = createApp(injectDb(db));
    tenantA = await makeTenant(db, "Cty A", "0100000001");
  });

  async function register(token: string, body: unknown) {
    return app.request(
      "/tax-accounts",
      {
        method: "POST",
        headers: { ...bearer(token), "content-type": "application/json" },
        body: JSON.stringify(body),
      },
      makeEnv(),
    );
  }

  it("(a) không gửi username → 201, username AUTO = MST gốc của tenant", async () => {
    const token = await tokenFor(tenantA, { role: "quan_tri" });
    const res = await register(token, {});
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string };
    const rows = await db
      .select()
      .from(taiKhoanThue)
      .where(and(eq(taiKhoanThue.id, body.id), eq(taiKhoanThue.tenantId, tenantA)));
    expect(rows[0]?.username).toBe("0100000001");
    expect(rows[0]?.loai).toBe("chinh");
  });

  it("(a) body username BỊ BỎ QUA cho tài khoản chính (vẫn = MST)", async () => {
    const token = await tokenFor(tenantA, { role: "quan_tri" });
    const res = await register(token, { username: "9999999999" });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string };
    const rows = await db.select().from(taiKhoanThue).where(eq(taiKhoanThue.id, body.id));
    expect(rows[0]?.username).toBe("0100000001"); // MST, KHÔNG phải 9999999999
  });

  it("(b) tenant chưa khai MST (rỗng) → 400", async () => {
    const tenantEmpty = await makeTenant(db, "Cty chưa khai MST", "");
    const token = await tokenFor(tenantEmpty, { role: "quan_tri" });
    const res = await register(token, {});
    expect(res.status).toBe(400);
  });

  it("(c) hạn mức = 1 → tài khoản thứ 2 bị chặn 409", async () => {
    const token = await tokenFor(tenantA, { role: "quan_tri" });
    expect((await register(token, {})).status).toBe(201);
    const res2 = await register(token, {});
    expect(res2.status).toBe(409);
  });

  it("(d) tài khoản con khi module TẮT (mặc định) → 400", async () => {
    const token = await tokenFor(tenantA, { role: "quan_tri" });
    const res = await register(token, { loai: "con", username: "0100000001-001" });
    expect(res.status).toBe(400);
  });

  it("vai ke_toan → 403", async () => {
    const token = await tokenFor(tenantA, { role: "ke_toan" });
    const res = await register(token, {});
    expect(res.status).toBe(403);
  });
});

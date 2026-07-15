// A1 (U15) — GET /me: hồ sơ tenant (ten/mst/goiDichVu) + vai từ token. Đọc-only, cả 3
// vai. Cách ly tenant: chỉ trả tenant của chính token (RLS + lọc id tường minh).
import { tenants } from "@vat/db";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { type Db, bearer, freshDb, injectDb, makeEnv, tokenFor } from "../helpers";

async function seedTenantFull(
  db: Db,
  ten: string,
  mst: string,
  goiDichVu: string | null,
): Promise<string> {
  const rows = await db
    .insert(tenants)
    .values({ ten, mst, ...(goiDichVu ? { goiDichVu } : {}) })
    .returning({ id: tenants.id });
  const row = rows[0];
  if (!row) throw new Error("insert tenant lỗi");
  return row.id;
}

describe("GET /me — hồ sơ tenant + vai", () => {
  let db: Db;
  beforeEach(async () => {
    db = await freshDb();
  });

  it("trả ten/mst/goiDichVu + role từ token", async () => {
    const tid = await seedTenantFull(db, "Công ty TNHH Tour Đảo", "4201568932", "Miễn phí");
    const app = createApp(injectDb(db));
    const token = await tokenFor(tid, { role: "ke_toan_truong" });
    const res = await app.request("/me", { headers: bearer(token) }, makeEnv());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ten: "Công ty TNHH Tour Đảo",
      mst: "4201568932",
      goiDichVu: "Miễn phí",
      banQuyen: "Mặc định",
      ghiChu: null,
      role: "ke_toan_truong",
    });
  });

  it("goiDichVu null khi chưa đặt gói", async () => {
    const tid = await seedTenantFull(db, "DN X", "0100000009", null);
    const app = createApp(injectDb(db));
    const res = await app.request("/me", { headers: bearer(await tokenFor(tid)) }, makeEnv());
    expect(res.status).toBe(200);
    expect((await res.json<{ goiDichVu: string | null }>()).goiDichVu).toBeNull();
  });

  it("cả 3 vai đều gọi được (kế toán)", async () => {
    const tid = await seedTenantFull(db, "DN Y", "0100000010", null);
    const app = createApp(injectDb(db));
    const token = await tokenFor(tid, { role: "ke_toan" });
    const res = await app.request("/me", { headers: bearer(token) }, makeEnv());
    expect(res.status).toBe(200);
  });

  it("không token → 401", async () => {
    const app = createApp(injectDb(db));
    const res = await app.request("/me", {}, makeEnv());
    expect(res.status).toBe(401);
  });

  it("cách ly: token tenant A không lộ tenant B (chỉ trả tenant của token)", async () => {
    const a = await seedTenantFull(db, "Tenant A", "0100000011", "Miễn phí");
    await seedTenantFull(db, "Tenant B", "0100000012", "Trả phí");
    const app = createApp(injectDb(db));
    const res = await app.request("/me", { headers: bearer(await tokenFor(a)) }, makeEnv());
    expect((await res.json<{ ten: string }>()).ten).toBe("Tenant A");
  });
});

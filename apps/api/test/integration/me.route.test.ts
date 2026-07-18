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
    // U17a-4: cột goiDichVu nay chứa MÃ (FK → goi_dich_vu.ma), không còn nhãn tiếng Việt
    // "Miễn phí" — nhãn sẽ quay lại ở Task 7 qua join bảng gói.
    const tid = await seedTenantFull(db, "Công ty TNHH Tour Đảo", "4201568932", "free");
    const app = createApp(injectDb(db));
    const token = await tokenFor(tid, { role: "ke_toan_truong" });
    const res = await app.request("/me", { headers: bearer(token) }, makeEnv());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ten: "Công ty TNHH Tour Đảo",
      mst: "4201568932",
      goiDichVu: "free",
      banQuyen: "Mặc định",
      ghiChu: null,
      role: "ke_toan_truong",
    });
  });

  it("goiDichVu mặc định 'free' khi chưa đặt gói (U17a-4: cột nay NOT NULL DEFAULT 'free')", async () => {
    const tid = await seedTenantFull(db, "DN X", "0100000009", null);
    const app = createApp(injectDb(db));
    const res = await app.request("/me", { headers: bearer(await tokenFor(tid)) }, makeEnv());
    expect(res.status).toBe(200);
    expect((await res.json<{ goiDichVu: string | null }>()).goiDichVu).toBe("free");
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
    // U17a-4: cả hai đều dùng mã 'free' — chỉ có gói này được seed ở migration 0007;
    // gói trả phí thật sẽ thêm ở Task 7.
    const a = await seedTenantFull(db, "Tenant A", "0100000011", "free");
    await seedTenantFull(db, "Tenant B", "0100000012", "free");
    const app = createApp(injectDb(db));
    const res = await app.request("/me", { headers: bearer(await tokenFor(a)) }, makeEnv());
    expect((await res.json<{ ten: string }>()).ten).toBe("Tenant A");
  });
});

// U-b — PATCH /me: chỉ quan_tri sửa ten/ghiChu; RBAC 403; cách ly tenant; strict body; audit.
import { auditLog, tenants } from "@vat/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { type Db, bearer, freshDb, injectDb, makeEnv, tokenFor } from "../helpers";

async function seedTenant(db: Db, ten: string, mst: string): Promise<string> {
  const rows = await db.insert(tenants).values({ ten, mst }).returning({ id: tenants.id });
  const row = rows[0];
  if (!row) throw new Error("insert tenant lỗi");
  return row.id;
}

function patchReq(token: string, body: unknown) {
  return {
    method: "PATCH",
    headers: { ...bearer(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

describe("PATCH /me — sửa hồ sơ tenant (chỉ quan_tri)", () => {
  let db: Db;
  beforeEach(async () => {
    db = await freshDb();
  });

  it("quan_tri sửa ten + ghiChu → 200, trả bản ghi mới, GET phản ánh", async () => {
    const tid = await seedTenant(db, "Tên cũ", "0100000100");
    const app = createApp(injectDb(db));
    const token = await tokenFor(tid, { role: "quan_tri" });
    const res = await app.request(
      "/me",
      patchReq(token, { ten: "Tên mới", ghiChu: "ghi chú A" }),
      makeEnv(),
    );
    expect(res.status).toBe(200);
    const json = await res.json<{ ten: string; ghiChu: string | null; banQuyen: string }>();
    expect(json.ten).toBe("Tên mới");
    expect(json.ghiChu).toBe("ghi chú A");
    expect(json.banQuyen).toBe("Mặc định");
    const get = await app.request("/me", { headers: bearer(token) }, makeEnv());
    expect((await get.json<{ ten: string }>()).ten).toBe("Tên mới");
  });

  it("U17a-7 fix: PATCH /me trả kèm goiDichVuTen (nhãn tiếng Việt), khớp GET /me", async () => {
    // Bug đã kiểm chứng: PATCH .returning() không join bảng gói nên thiếu goiDichVuTen,
    // khiến FE rơi về mã thô "free" ngay sau khi Lưu (SettingsPage: goiDichVuTen ?? goiDichVu).
    const tid = await seedTenant(db, "Tên cũ", "0100000199");
    const app = createApp(injectDb(db));
    const token = await tokenFor(tid, { role: "quan_tri" });
    const res = await app.request("/me", patchReq(token, { ten: "Tên mới" }), makeEnv());
    expect(res.status).toBe(200);
    const json = await res.json<{ goiDichVu: string; goiDichVuTen: string }>();
    expect(json.goiDichVu).toBe("free");
    expect(json.goiDichVuTen).toBe("Miễn phí");
  });

  it("vai ke_toan → 403, KHÔNG ghi", async () => {
    const tid = await seedTenant(db, "Tên cũ", "0100000101");
    const app = createApp(injectDb(db));
    const token = await tokenFor(tid, { role: "ke_toan" });
    const res = await app.request("/me", patchReq(token, { ten: "X" }), makeEnv());
    expect(res.status).toBe(403);
    const rows = await db.select({ ten: tenants.ten }).from(tenants).where(eq(tenants.id, tid));
    expect(rows[0]?.ten).toBe("Tên cũ");
  });

  it("vai ke_toan_truong → 403", async () => {
    const tid = await seedTenant(db, "Tên cũ", "0100000102");
    const app = createApp(injectDb(db));
    const token = await tokenFor(tid, { role: "ke_toan_truong" });
    const res = await app.request("/me", patchReq(token, { ten: "X" }), makeEnv());
    expect(res.status).toBe(403);
  });

  it("cách ly: PATCH tenant A không đụng tenant B", async () => {
    const a = await seedTenant(db, "A cũ", "0100000103");
    const b = await seedTenant(db, "B cũ", "0100000104");
    const app = createApp(injectDb(db));
    await app.request(
      "/me",
      patchReq(await tokenFor(a, { role: "quan_tri" }), { ten: "A mới" }),
      makeEnv(),
    );
    const rows = await db.select({ ten: tenants.ten }).from(tenants).where(eq(tenants.id, b));
    expect(rows[0]?.ten).toBe("B cũ");
  });

  it("khoá lạ (mst) → 400, KHÔNG ghi", async () => {
    const tid = await seedTenant(db, "Tên cũ", "0100000105");
    const app = createApp(injectDb(db));
    const token = await tokenFor(tid, { role: "quan_tri" });
    const res = await app.request("/me", patchReq(token, { mst: "9999999999" }), makeEnv());
    expect(res.status).toBe(400);
    const rows = await db.select({ mst: tenants.mst }).from(tenants).where(eq(tenants.id, tid));
    expect(rows[0]?.mst).toBe("0100000105");
  });

  it("body rỗng → 400", async () => {
    const tid = await seedTenant(db, "Tên cũ", "0100000106");
    const app = createApp(injectDb(db));
    const res = await app.request(
      "/me",
      patchReq(await tokenFor(tid, { role: "quan_tri" }), {}),
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });

  it("ten rỗng/whitespace → 400", async () => {
    const tid = await seedTenant(db, "Tên cũ", "0100000107");
    const app = createApp(injectDb(db));
    const res = await app.request(
      "/me",
      patchReq(await tokenFor(tid, { role: "quan_tri" }), { ten: "   " }),
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });

  it("PATCH thành công → append đúng 1 audit 'cap_nhat_cau_hinh'", async () => {
    const tid = await seedTenant(db, "Tên cũ", "0100000108");
    const app = createApp(injectDb(db));
    await app.request(
      "/me",
      patchReq(await tokenFor(tid, { role: "quan_tri" }), { ghiChu: "x" }),
      makeEnv(),
    );
    const rows = await db
      .select({ hanhDong: auditLog.hanhDong })
      .from(auditLog)
      .where(eq(auditLog.tenantId, tid));
    expect(rows.length).toBe(1);
    expect(rows[0]?.hanhDong).toBe("cap_nhat_cau_hinh");
  });
});

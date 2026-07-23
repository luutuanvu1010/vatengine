# Sửa MST trong Cổng Admin — Kế hoạch thực thi

> **Cho tác nhân thực thi:** dùng `superpowers:subagent-driven-development` (khuyến nghị)
> hoặc `superpowers:executing-plans` để chạy từng Task. Bước dùng checkbox (`- [ ]`).
>
> Spec: `docs/superpowers/specs/2026-07-23-doi-mst-cong-admin-design.md`.

**Mục tiêu:** super-admin đổi được mã số thuế của một tenant trong Cổng Admin, có kiểm soát:
chặn cứng khi tenant đã có hoá đơn; nếu có kết nối thuế (0 hoá đơn) thì đổi + tự xoá tài
khoản thuế trong một giao dịch.

**Cách làm:** một hàm SQL SECURITY DEFINER mới `admin_doi_mst` gánh toàn bộ chốt (đếm hoá
đơn · xoá `tai_khoan_thue` · UNIQUE bắt trùng MST), một route admin gọi nó, một dialog trong
Cổng Admin, và vá câu chỉ đường sai ở app khách.

**Ngăn xếp:** Postgres (migration SQL viết tay) · Hono + Zod trên Workers · React + Vite
(`apps/admin`, `apps/web`) · Vitest + PGlite.

## Ràng buộc toàn cục

| # | Ràng buộc | Nguồn |
|---|---|---|
| G1 | **Chỉ super-admin đổi được** — route sau `requireSuperAdmin` (đã gác toàn router admin) | Đ-1 |
| G2 | **Chặn cứng khi tenant có hoá đơn**, ép ở **hàm DB**, không tin mỗi UI | Đ-2 |
| G3 | **Có kết nối thuế (0 hoá đơn) → đổi + xoá `tai_khoan_thue`** trong MỘT giao dịch | Đ-3, Đ-4 |
| G4 | **KHÔNG đụng `admin_sua_metadata_tenant`** — làm hàm SQL riêng | Đ-5 |
| G5 | Dạng MST **verbatim** `/^\d{10}$\|^\d{13}$/` — copy nguyên từ `dangKy.ts` | spec §3.2 |
| G6 | Hàm SECURITY DEFINER **bắt buộc** `SET search_path = public`, owner `admin_api`, `REVOKE ALL FROM PUBLIC`, `GRANT EXECUTE` cho `vat_app` **và** `app_user` | 0011, [[vat-bai-hoc-migration-security-definer]] |
| G7 | Migration cộng dồn, an toàn chạy lại (`CREATE OR REPLACE`, `IF NOT EXISTS`) | `deploy.md` |
| G8 | Client là UX, KHÔNG phải lớp bảo vệ — cả ba chốt (hoá đơn, dạng MST, trùng) ép ở backend | `.claude/rules/ui.md` |
| G9 | `make lint` + `make test` xanh trước khi coi một Task là xong | `CLAUDE.md` DoD |

### Quyết định chốt trong kế hoạch này (spec để mở, nay quyết)

| Câu hỏi | Chốt | Vì sao |
|---|---|---|
| Đặt ô nhập MST ở đâu trong Cổng Admin? | **Hành động hàng trong `TenantsPage`** + một dialog nhỏ, KHÔNG dựng panel chi tiết | Panel chi tiết là U19 còn nợ 15% — ngoài phạm vi. Hành động hàng khớp khuôn nút Duyệt/Khoá đã có |
| Ẩn nút khi tenant có hoá đơn? | **KHÔNG ẩn — nút luôn hiện, backend chặn 409, dialog hiện "đã có N hoá đơn"** | `admin_liet_ke_tenant` không trả số hoá đơn. Thêm vào đòi `DROP`+`CREATE` hàm đang chạy (bẫy 0009) cho một lợi ích UX nhỏ. Backend vẫn là chốt thật (G2) |
| Xoá `tai_khoan_thue` = xoá hàng hay chỉ token? | **Xoá HÀNG** (`DELETE`) | `username = MST cũ`; giữ hàng là để một kết nối chết trỏ vào MST không tồn tại. Token đi theo hàng |

Điều chỉnh này khác spec §3.3 ("ẩn/mờ nút") — spec đã giao quyền quyết cho bước này.

---

## Bản đồ file

### Tạo mới
| File | Trách nhiệm |
|---|---|
| `packages/db/migrations/0015_admin_doi_mst.sql` | Hàm `admin_doi_mst` |
| `apps/admin/src/features/tenants/DoiMstDialog.tsx` | Dialog nhập MST mới + xác nhận |
| `apps/api/test/integration/admin.doiMst.test.ts` | Test hàm DB + route |

### Sửa
| File | Sửa gì |
|---|---|
| `packages/db/migrations/meta/_journal.json` | Thêm mục `idx: 15` |
| `apps/api/src/routes/admin/tenants.ts` | Thêm route `POST /:id/doi-mst` |
| `apps/admin/src/lib/adminApiClient.ts` | Thêm `doiMst(id, mst)` |
| `apps/admin/src/features/tenants/TenantsPage.tsx` | Thêm nút "Đổi MST" + gắn dialog |
| `apps/admin/src/features/audit/AuditPage.tsx` | Nhãn `doi_mst_tenant` |
| `apps/admin/test/features/congAdmin.test.tsx` | Test dialog đổi MST |
| `apps/web/src/features/taxAccounts/TaxAccountsPage.tsx` | Vá câu chỉ đường sai |
| `apps/web/test/features/taxAccounts.test.tsx` (nếu có) | Cập nhật khẳng định câu mới |

---

## Task 1 — Hàm DB `admin_doi_mst`

**Files:**
- Tạo: `packages/db/migrations/0015_admin_doi_mst.sql`
- Sửa: `packages/db/migrations/meta/_journal.json`
- Test: `apps/api/test/integration/admin.doiMst.test.ts`

**Interfaces — phần sau dựa vào:**
- `admin_doi_mst(p_id uuid, p_mst_moi text)` → `TABLE (id uuid, mst_cu text, mst_moi text, so_tk_thue_da_xoa int)`
- Ném `EXCEPTION` với `MESSAGE` = `khong_thay` (tenant không có) hoặc `co_hoa_don` (đã có hoá đơn). Trùng MST tenant khác → SQLSTATE `23505` tự nhiên.

- [ ] **Bước 1: Viết test đỏ**

Tạo `apps/api/test/integration/admin.doiMst.test.ts`:

```ts
// Sửa MST trong Cổng Admin (spec 2026-07-23) — tầng DB.
import { hoaDon, nguoiDung, taiKhoanThue, tenants } from "@vat/db";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { type Db, freshDb, makeTenant, seedInvoice } from "../helpers";

describe("hàm DB admin_doi_mst", () => {
  let db: Db;
  let tenantId: string;

  beforeEach(async () => {
    db = await freshDb();
    tenantId = await makeTenant(db, "Cty Thử", "0100000001");
    await db.insert(nguoiDung).values({ tenantId, email: "a@b.vn", vaiTro: "quan_tri" });
  });

  const doi = (mstMoi: string, id = tenantId) =>
    db.execute(
      sql`select id, mst_cu, mst_moi, so_tk_thue_da_xoa from admin_doi_mst(${id}::uuid, ${mstMoi})`,
    ) as Promise<{
      rows: Array<{ id: string; mst_cu: string; mst_moi: string; so_tk_thue_da_xoa: number }>;
    }>;

  it("đổi MST thành công khi 0 hoá đơn, 0 kết nối", async () => {
    const r = await doi("0100000002");
    expect(r.rows[0]).toMatchObject({ mst_cu: "0100000001", mst_moi: "0100000002", so_tk_thue_da_xoa: 0 });
    const t = (await db.select().from(tenants).where(eq(tenants.id, tenantId)))[0];
    expect(t?.mst).toBe("0100000002");
  });

  it("🔴 có kết nối thuế (0 hoá đơn) → đổi + XOÁ tài khoản thuế", async () => {
    await db.insert(taiKhoanThue).values({ tenantId, username: "0100000001", loai: "chinh" });
    const r = await doi("0100000002");
    expect(r.rows[0]?.so_tk_thue_da_xoa).toBe(1);
    const con = await db.select().from(taiKhoanThue).where(eq(taiKhoanThue.tenantId, tenantId));
    expect(con).toHaveLength(0);
  });

  it("🔴 có HOÁ ĐƠN → ném co_hoa_don, KHÔNG đổi gì", async () => {
    await seedInvoice(db, tenantId);
    await expect(doi("0100000002")).rejects.toThrow(/co_hoa_don/);
    const t = (await db.select().from(tenants).where(eq(tenants.id, tenantId)))[0];
    expect(t?.mst).toBe("0100000001"); // nguyên vẹn
  });

  it("🔴 đổi sang MST đã có tenant khác → 23505, KHÔNG xoá kết nối", async () => {
    await makeTenant(db, "Cty B", "0100000099");
    await db.insert(taiKhoanThue).values({ tenantId, username: "0100000001", loai: "chinh" });
    await expect(doi("0100000099")).rejects.toMatchObject({ cause: { code: "23505" } });
    // Giao dịch rollback ⇒ kết nối còn nguyên.
    const con = await db.select().from(taiKhoanThue).where(eq(taiKhoanThue.tenantId, tenantId));
    expect(con).toHaveLength(1);
  });

  it("đổi sang chính MST cũ → không xoá kết nối, so_tk_thue_da_xoa = 0", async () => {
    await db.insert(taiKhoanThue).values({ tenantId, username: "0100000001", loai: "chinh" });
    const r = await doi("0100000001");
    expect(r.rows[0]?.so_tk_thue_da_xoa).toBe(0);
    const con = await db.select().from(taiKhoanThue).where(eq(taiKhoanThue.tenantId, tenantId));
    expect(con).toHaveLength(1); // không ngắt kết nối oan
  });

  it("tenant không tồn tại → ném khong_thay", async () => {
    await expect(doi("0100000002", crypto.randomUUID())).rejects.toThrow(/khong_thay/);
  });

  it("🔴 hàm thuộc admin_api, PUBLIC không gọi được", async () => {
    const r = (await db.execute(sql`
      select r.rolname, has_function_privilege('public', p.oid, 'EXECUTE') pub
      from pg_proc p join pg_roles r on r.oid = p.proowner where p.proname = 'admin_doi_mst'`)) as {
      rows: Array<{ rolname: string; pub: boolean }>;
    };
    expect(r.rows[0]?.rolname).toBe("admin_api");
    expect(r.rows[0]?.pub).toBe(false);
  });
});
```

> Đọc `apps/api/test/helpers.ts` xác nhận `seedInvoice` và `taiKhoanThue` export đúng tên.
> `seedInvoice(db, tenantId)` đã có (dùng ở nhiều test). `taiKhoanThue` là bảng `@vat/db`.

- [ ] **Bước 2: Chạy test, xác nhận ĐỎ**

```bash
cd /Users/tuanbao/Documents/Projects/vatengine
npm run test -w apps/api -- test/integration/admin.doiMst.test.ts
```
Kỳ vọng: ĐỎ — `function admin_doi_mst(...) does not exist`.

- [ ] **Bước 3: Viết migration**

Tạo `packages/db/migrations/0015_admin_doi_mst.sql`:

```sql
-- Sửa MST trong Cổng Admin (spec 2026-07-23).
--
-- MST bị khoá có chủ ý (U23-D: khoá tự nhiên, 1 MST ↔ 1 tenant). Hàm này mở một cửa HẸP
-- cho super-admin sửa lỗi gõ nhầm lúc đăng ký, KHÔNG bẻ bất biến đó:
--   • chặn cứng khi tenant đã có hoá đơn — đổi MST của tenant có dữ liệu thật là bỏ rơi
--     toàn bộ hoá đơn thành mồ côi, không hoàn tác được;
--   • `tai_khoan_thue.username` tự gán = MST lúc kết nối (U23-D2), nên đổi MST phải XOÁ
--     luôn tài khoản thuế — giữ lại là để một kết nối chết trỏ vào MST không còn tồn tại;
--   • cả hai nằm TRỌN trong thân hàm ⇒ một giao dịch: hoặc đổi cả, hoặc rollback cả.
--
-- TÁCH khỏi `admin_sua_metadata_tenant` có chủ ý: hàm đó cố ý KHÔNG nhận mst (0011). Đổi
-- MST là đổi danh tính pháp lý, đáng có đường riêng + audit riêng.
CREATE OR REPLACE FUNCTION admin_doi_mst(p_id uuid, p_mst_moi text)
RETURNS TABLE (id uuid, mst_cu text, mst_moi text, so_tk_thue_da_xoa int)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_mst_cu text;
  v_so_hoa_don int;
  v_so_xoa int;
BEGIN
  SELECT t.mst INTO v_mst_cu FROM tenants t WHERE t.id = p_id FOR UPDATE;
  IF v_mst_cu IS NULL THEN
    RAISE EXCEPTION 'khong_thay';
  END IF;

  -- Đổi sang chính nó: không làm gì, KHÔNG ngắt kết nối oan.
  IF p_mst_moi = v_mst_cu THEN
    RETURN QUERY SELECT p_id, v_mst_cu, v_mst_cu, 0;
    RETURN;
  END IF;

  SELECT count(*)::int INTO v_so_hoa_don FROM hoa_don h WHERE h.tenant_id = p_id;
  IF v_so_hoa_don > 0 THEN
    RAISE EXCEPTION 'co_hoa_don';
  END IF;

  DELETE FROM tai_khoan_thue k WHERE k.tenant_id = p_id;
  GET DIAGNOSTICS v_so_xoa = ROW_COUNT;

  -- UNIQUE tenants_mst_unique (0006) vi phạm ⇒ 23505 nổi lên nguyên vẹn, giao dịch rollback
  -- (cả DELETE ở trên cũng lùi lại). Route map 23505 → 409 mst_da_ton_tai.
  UPDATE tenants SET mst = p_mst_moi WHERE tenants.id = p_id;

  RETURN QUERY SELECT p_id, v_mst_cu, p_mst_moi, v_so_xoa;
END $$;--> statement-breakpoint

-- Nghi thức owner (khuôn 0011). Hàm MỚI nên chỉ cần owner chuẩn — không DROP nên không
-- mất GRANT nào. Mượn tạm membership admin_api để ALTER OWNER chạy (bài học 0013).
GRANT admin_api TO CURRENT_USER;--> statement-breakpoint
DO $$
DECLARE
  ten_role text;
BEGIN
  ALTER FUNCTION public.admin_doi_mst(uuid,text) OWNER TO admin_api;
  REVOKE ALL ON FUNCTION public.admin_doi_mst(uuid,text) FROM PUBLIC;
  FOREACH ten_role IN ARRAY ARRAY['vat_app', 'app_user'] LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = ten_role) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.admin_doi_mst(uuid,text) TO %I', ten_role);
    END IF;
  END LOOP;
END $$;
```

- [ ] **Bước 4: Thêm mục vào `_journal.json`**

Sau mục `idx: 14` (chèn trước `]` đóng mảng `entries`):

```json
    ,{
      "idx": 15,
      "version": "7",
      "when": 1785645600000,
      "tag": "0015_admin_doi_mst",
      "breakpoints": true
    }
```
Rồi `npx biome format --write packages/db/migrations/meta/_journal.json`.

- [ ] **Bước 5: Chạy test, xác nhận XANH**

```bash
npm run test -w apps/api -- test/integration/admin.doiMst.test.ts
```
Kỳ vọng: 7 test PASS.

- [ ] **Bước 6: Commit**

```bash
git add packages/db/migrations/0015_admin_doi_mst.sql packages/db/migrations/meta/_journal.json apps/api/test/integration/admin.doiMst.test.ts
git commit -m "Đổi MST: migration 0015 — hàm admin_doi_mst (chặn khi có hoá đơn, tự xoá kết nối thuế)"
```

---

## Task 2 — Route `POST /admin/tenants/:id/doi-mst`

**Files:**
- Sửa: `apps/api/src/routes/admin/tenants.ts`, `apps/admin/src/lib/adminApiClient.ts`
- Test: `apps/api/test/integration/admin.doiMst.test.ts` (thêm describe)

**Interfaces:**
- Consumes: hàm DB `admin_doi_mst` (Task 1).
- Produces: `POST /admin/tenants/:id/doi-mst` body `{ mst }` → `200 { ok, mst_cu, mst_moi, so_tk_thue_da_xoa }`; lỗi 400 `mst_khong_hop_le`/`bad_request`, 404 `not_found`, 409 `co_hoa_don_khong_doi_duoc`/`mst_da_ton_tai`.
- adminApi client: `doiMst(id: string, mst: string): Promise<{ ok: true; mst_cu: string; mst_moi: string; so_tk_thue_da_xoa: number }>`.

- [ ] **Bước 1: Viết test đỏ**

Thêm imports vào ĐẦU `apps/api/test/integration/admin.doiMst.test.ts`:

```ts
import { createApp } from "../../src/app";
import { adminTokenFor, bearer, injectDb, makeEnv, seedSuperAdmin, tokenFor } from "../helpers";
```

Thêm describe vào CUỐI file:

```ts
describe("POST /admin/tenants/:id/doi-mst", () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;
  let token: string;
  let tenantId: string;

  beforeEach(async () => {
    db = await freshDb();
    app = createApp(injectDb(db));
    const adminId = await seedSuperAdmin(db, "chu@vatengine.vn", "mat-khau-chu");
    token = await adminTokenFor(adminId);
    tenantId = await makeTenant(db, "Cty Thử", "0100000001");
    await db.insert(nguoiDung).values({ tenantId, email: "a@b.vn", vaiTro: "quan_tri" });
  });

  const doi = (mst: unknown, id = tenantId, hdr = bearer(token)) =>
    app.request(
      `/admin/tenants/${id}/doi-mst`,
      { method: "POST", headers: { ...hdr, "content-type": "application/json" }, body: JSON.stringify({ mst }) },
      makeEnv(),
    );

  it("đổi thành công → 200 + cũ/mới + số tk xoá", async () => {
    const res = await doi("0100000002");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, mst_cu: "0100000001", mst_moi: "0100000002", so_tk_thue_da_xoa: 0 });
  });

  it("🔴 token KHÁCH bị từ chối (route sau requireSuperAdmin)", async () => {
    const res = await doi("0100000002", tenantId, bearer(await tokenFor(tenantId, { role: "quan_tri" })));
    expect(res.status).toBe(401);
  });

  it("có hoá đơn → 409 co_hoa_don_khong_doi_duoc", async () => {
    await seedInvoice(db, tenantId);
    const res = await doi("0100000002");
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "co_hoa_don_khong_doi_duoc" });
  });

  it("trùng MST tenant khác → 409 mst_da_ton_tai", async () => {
    await makeTenant(db, "Cty B", "0100000099");
    const res = await doi("0100000099");
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "mst_da_ton_tai" });
  });

  it.each(["123", "abcdefghij", "01000000011", ""])("MST sai dạng %s → 400 mst_khong_hop_le", async (mst) => {
    const res = await doi(mst);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "mst_khong_hop_le" });
  });

  it("tenant không tồn tại → 404", async () => {
    const res = await doi("0100000002", crypto.randomUUID());
    expect(res.status).toBe(404);
  });

  it("ghi audit doi_mst_tenant cũ→mới", async () => {
    await doi("0100000002");
    const { auditLogAdmin } = await import("@vat/db");
    const rows = await db.select().from(auditLogAdmin);
    const a = rows.find((x) => x.hanhDong === "doi_mst_tenant");
    expect(a).toBeDefined();
    const s = JSON.stringify(a?.chiTiet);
    expect(s).toContain("0100000001");
    expect(s).toContain("0100000002");
  });
});
```

- [ ] **Bước 2: Chạy test, xác nhận ĐỎ**

```bash
npm run test -w apps/api -- test/integration/admin.doiMst.test.ts
```
Kỳ vọng: describe mới ĐỎ với 404 (route chưa có).

- [ ] **Bước 3: Viết route**

Trong `apps/api/src/routes/admin/tenants.ts`, thêm hằng gần đầu file (sau `patchSchema`):

```ts
// MST 10 hoặc 13 chữ số — verbatim theo spec, khớp `dangKy.ts`.
const MST_RE = /^\d{10}$|^\d{13}$/;
const doiMstSchema = z.object({ mst: z.string() }).strict();
```

Thêm route trong `adminTenantsRoutes`, sau route `gui-link-dat-mat-khau`:

```ts
  // ── Đổi MST ────────────────────────────────────────────────────────────────────────
  // Cửa hẹp sửa lỗi gõ nhầm MST lúc đăng ký (spec 2026-07-23). Mọi chốt ép ở hàm DB
  // `admin_doi_mst`: đếm hoá đơn (chặn cứng), UNIQUE bắt trùng, xoá tài khoản thuế trong
  // cùng giao dịch. Route chỉ validate dạng MST và dịch lỗi DB sang HTTP.
  r.post("/:id/doi-mst", async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id)) return c.json({ error: "bad_request" }, 400);
    const parsed = doiMstSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "bad_request" }, 400);
    const mst = parsed.data.mst.trim();
    if (!MST_RE.test(mst)) return c.json({ error: "mst_khong_hop_le" }, 400);

    const { db, close } = await deps.getDb(c.env);
    try {
      let row: { mst_cu: string; mst_moi: string; so_tk_thue_da_xoa: number };
      try {
        const res = (await db.execute(
          sql`select mst_cu, mst_moi, so_tk_thue_da_xoa from admin_doi_mst(${id}::uuid, ${mst})`,
        )) as { rows: Array<typeof row> };
        const r0 = res.rows[0];
        if (!r0) return c.json({ error: "not_found" }, 404);
        row = r0;
      } catch (err) {
        // Hàm DB ném theo MESSAGE; lỗi UNIQUE nổi lên qua .cause.code (như dangKy.ts).
        const msg = err instanceof Error ? err.message : "";
        const code = (err as { cause?: { code?: string } })?.cause?.code;
        if (msg.includes("khong_thay")) return c.json({ error: "not_found" }, 404);
        if (msg.includes("co_hoa_don")) return c.json({ error: "co_hoa_don_khong_doi_duoc" }, 409);
        if (code === "23505") return c.json({ error: "mst_da_ton_tai" }, 409);
        throw err;
      }

      // Đổi sang chính nó (mst_cu === mst_moi): vẫn ghi audit để nhật ký trung thực, nhưng
      // đó là ca hiếm; ghi thẳng cho đơn giản.
      await ghiAuditAdmin(db, {
        hanhDong: "doi_mst_tenant",
        doiTuong: id,
        nguoiThucHien: c.get("adminId"),
        // MST là định danh doanh nghiệp, KHÔNG phải dữ liệu cá nhân (QĐ-17) ⇒ ghi cũ→mới.
        chiTiet: { cu: row.mst_cu, moi: row.mst_moi, tk_thue_da_xoa: row.so_tk_thue_da_xoa },
      });
      return c.json({ ok: true, ...row });
    } finally {
      await close();
    }
  });
```

- [ ] **Bước 4: Thêm `doiMst` vào adminApiClient**

Trong `apps/admin/src/lib/adminApiClient.ts`, sau `guiLaiLinkDatMatKhau`:

```ts
  /** Đổi MST của tenant. Backend chặn nếu đã có hoá đơn; nếu có kết nối thuế thì tự xoá
   * (username tự gán = MST cũ nên giữ lại là kết nối chết). Xem spec 2026-07-23. */
  doiMst(
    id: string,
    mst: string,
  ): Promise<{ ok: true; mst_cu: string; mst_moi: string; so_tk_thue_da_xoa: number }> {
    return request("POST", `/admin/tenants/${id}/doi-mst`, { body: { mst } });
  },
```

- [ ] **Bước 5: Chạy test + lint, xác nhận XANH**

```bash
npm run test -w apps/api -- test/integration/admin.doiMst.test.ts
make lint
```

- [ ] **Bước 6: Commit**

```bash
git add apps/api/src/routes/admin/tenants.ts apps/admin/src/lib/adminApiClient.ts apps/api/test/integration/admin.doiMst.test.ts
git commit -m "Đổi MST: route POST /admin/tenants/:id/doi-mst + adminApi.doiMst"
```

---

## Task 3 — Cổng Admin: dialog đổi MST

**Files:**
- Tạo: `apps/admin/src/features/tenants/DoiMstDialog.tsx`
- Sửa: `apps/admin/src/features/tenants/TenantsPage.tsx`, `apps/admin/src/features/audit/AuditPage.tsx`
- Test: `apps/admin/test/features/congAdmin.test.tsx`

**Interfaces:**
- Consumes: `adminApi.doiMst(id, mst)` (Task 2), `AdminApiError` (đã có).

- [ ] **Bước 1: Viết test đỏ**

Trong `apps/admin/test/features/congAdmin.test.tsx`: thêm `doiMst: vi.fn()` vào khối
`vi.mock` (cạnh `guiLaiLinkDatMatKhau`), rồi thêm describe:

```tsx
describe("Đổi MST", () => {
  it("bấm 'Đổi MST' → hiện dialog nhập MST mới", async () => {
    api.lietKeTenant.mockResolvedValue({ items: [tenant()], total: 1 });
    renderTenants();
    await userEvent.click(await screen.findByRole("button", { name: "Đổi MST" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/mã số thuế mới/i)).toBeInTheDocument();
  });

  it("đổi thành công → gọi API đúng id+mst, đóng dialog, nạp lại danh sách", async () => {
    api.lietKeTenant.mockResolvedValue({ items: [tenant()], total: 1 });
    api.doiMst.mockResolvedValue({ ok: true, mst_cu: "0100000001", mst_moi: "0100000002", so_tk_thue_da_xoa: 0 });
    renderTenants();
    await userEvent.click(await screen.findByRole("button", { name: "Đổi MST" }));
    const hop = within(await screen.findByRole("dialog"));
    await userEvent.type(hop.getByLabelText(/mã số thuế mới/i), "0100000002");
    await userEvent.click(hop.getByRole("button", { name: "Đổi MST" }));
    await waitFor(() => expect(api.doiMst).toHaveBeenCalledWith(tenant().id, "0100000002"));
  });

  it("🔴 409 có hoá đơn → hiện thông điệp KHÔNG đổi được, không đóng dialog", async () => {
    api.lietKeTenant.mockResolvedValue({ items: [tenant()], total: 1 });
    api.doiMst.mockRejectedValue(new AdminApiError(409, "co_hoa_don_khong_doi_duoc"));
    renderTenants();
    await userEvent.click(await screen.findByRole("button", { name: "Đổi MST" }));
    const hop = within(await screen.findByRole("dialog"));
    await userEvent.type(hop.getByLabelText(/mã số thuế mới/i), "0100000002");
    await userEvent.click(hop.getByRole("button", { name: "Đổi MST" }));
    await waitFor(() => expect(hop.getByText(/đã có hoá đơn/i)).toBeInTheDocument());
  });

  it("409 trùng MST → thông điệp trùng", async () => {
    api.lietKeTenant.mockResolvedValue({ items: [tenant()], total: 1 });
    api.doiMst.mockRejectedValue(new AdminApiError(409, "mst_da_ton_tai"));
    renderTenants();
    await userEvent.click(await screen.findByRole("button", { name: "Đổi MST" }));
    const hop = within(await screen.findByRole("dialog"));
    await userEvent.type(hop.getByLabelText(/mã số thuế mới/i), "0100000099");
    await userEvent.click(hop.getByRole("button", { name: "Đổi MST" }));
    await waitFor(() => expect(hop.getByText(/đã thuộc về doanh nghiệp khác/i)).toBeInTheDocument());
  });
});
```

> Kiểm chữ ký `AdminApiError`: `grep -n "class AdminApiError" apps/admin/src/lib/adminApiClient.ts`.
> Nếu là `(status, code)` như `ApiError` phía web thì test trên đúng; nếu khác, chỉnh cho khớp.

- [ ] **Bước 2: Chạy test, xác nhận ĐỎ**

```bash
npm run test -w apps/admin -- test/features/congAdmin.test.tsx
```
Kỳ vọng: describe "Đổi MST" ĐỎ (nút chưa có).

- [ ] **Bước 3: Viết `DoiMstDialog`**

Tạo `apps/admin/src/features/tenants/DoiMstDialog.tsx`:

```tsx
// Sửa MST trong Cổng Admin (spec 2026-07-23).
//
// MST là danh tính pháp lý của doanh nghiệp — cửa này chỉ mở cho super-admin, để sửa lỗi
// gõ nhầm lúc đăng ký. Backend là chốt thật: chặn khi đã có hoá đơn, bắt trùng MST, và tự
// xoá kết nối thuế (username tự gán = MST cũ). Dialog chỉ nhập + dịch lỗi sang tiếng người.
import { useState } from "react";
import { AdminApiError, adminApi } from "../../lib/adminApiClient";
import type { TenantRow } from "../../lib/types";

const MST_RE = /^\d{10}$|^\d{13}$/;

const LOI: Record<string, string> = {
  co_hoa_don_khong_doi_duoc:
    "Không đổi được: doanh nghiệp này đã có hoá đơn. Đổi MST sẽ bỏ rơi toàn bộ dữ liệu đã đồng bộ.",
  mst_da_ton_tai: "Mã số thuế này đã thuộc về doanh nghiệp khác trong hệ thống.",
  mst_khong_hop_le: "Mã số thuế phải gồm 10 hoặc 13 chữ số.",
  not_found: "Không tìm thấy doanh nghiệp này.",
};

interface Props {
  tenant: TenantRow;
  onDong: () => void;
  onXong: (soTkXoa: number) => void;
}

export function DoiMstDialog({ tenant, onDong, onXong }: Props) {
  const [mst, setMst] = useState("");
  const [loi, setLoi] = useState<string | null>(null);
  const [dangGui, setDangGui] = useState(false);

  async function gui() {
    if (!MST_RE.test(mst.trim())) {
      setLoi(LOI.mst_khong_hop_le);
      return;
    }
    if (
      !window.confirm(
        `Đổi MST của "${tenant.ten}" từ ${tenant.mst} sang ${mst.trim()}?\n\nMọi kết nối Tổng cục Thuế của doanh nghiệp này sẽ bị NGẮT. Khách phải kết nối lại bằng MST mới.`,
      )
    ) {
      return;
    }
    setLoi(null);
    setDangGui(true);
    try {
      const kq = await adminApi.doiMst(tenant.id, mst.trim());
      onXong(kq.so_tk_thue_da_xoa);
    } catch (e) {
      const code = e instanceof AdminApiError ? e.code : undefined;
      setLoi((code && LOI[code]) || "Đổi MST không thành công. Vui lòng thử lại.");
    } finally {
      setDangGui(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "grid",
        placeItems: "center",
        padding: "1.5rem",
        zIndex: 50,
      }}
    >
      <dialog
        open
        aria-modal="true"
        aria-labelledby="doi-mst-tieu-de"
        style={{
          position: "static",
          width: "min(100%, 32rem)",
          color: "var(--chu)",
          background: "var(--nen-noi)",
          border: "1px solid var(--vien)",
          borderRadius: "12px",
          padding: "1.75rem",
        }}
      >
        <h2 id="doi-mst-tieu-de" style={{ margin: "0 0 0.5rem", fontSize: "1.25rem" }}>
          Đổi mã số thuế
        </h2>
        <p style={{ margin: "0 0 1.25rem", color: "var(--chu-mo)" }}>
          {tenant.ten} — hiện tại: <strong>{tenant.mst}</strong>
        </p>

        {loi && (
          <p
            role="alert"
            style={{
              background: "var(--nen)",
              border: "1px solid var(--nguy)",
              borderRadius: "var(--ban-kinh)",
              padding: "0.75rem 1rem",
              marginBottom: "1rem",
            }}
          >
            {loi}
          </p>
        )}

        <label htmlFor="mst-moi" style={{ display: "block", marginBottom: "0.35rem" }}>
          Mã số thuế mới (10 hoặc 13 chữ số)
        </label>
        <input
          id="mst-moi"
          value={mst}
          onChange={(e) => setMst(e.target.value)}
          placeholder="Ví dụ: 0100000002"
          style={{
            width: "100%",
            padding: "0.5rem 0.7rem",
            background: "var(--nen)",
            color: "var(--chu)",
            border: "1px solid var(--vien)",
            marginBottom: "1.25rem",
          }}
        />

        <div style={{ display: "flex", gap: "0.6rem" }}>
          <button
            type="button"
            disabled={dangGui}
            onClick={() => void gui()}
            style={{
              flex: 1,
              padding: "0.7rem",
              background: "var(--nhan)",
              color: "#1f1300",
              border: "none",
              fontWeight: 700,
            }}
          >
            {dangGui ? "Đang đổi…" : "Đổi MST"}
          </button>
          <button
            type="button"
            onClick={onDong}
            style={{
              flex: 1,
              padding: "0.7rem",
              background: "var(--nen-noi-2)",
              color: "var(--chu)",
              border: "1px solid var(--vien)",
            }}
          >
            Hủy
          </button>
        </div>
      </dialog>
    </div>
  );
}
```

- [ ] **Bước 4: Gắn vào `TenantsPage`**

Trong `apps/admin/src/features/tenants/TenantsPage.tsx`:

1. Import: `import { DoiMstDialog } from "./DoiMstDialog";`
2. State: `const [doiMstTenant, setDoiMstTenant] = useState<TenantRow | null>(null);`
3. Nút "Đổi MST" trong ô Thao tác của MỌI hàng KHÔNG phải trạng thái cuối. Đặt cạnh các nút
   `hanhDongChoTrangThai`, nhưng là nút RIÊNG (không thuộc máy trạng thái — nó không đổi
   trạng thái). Trong `<td>` thao tác, sau vòng lặp `.map(hd => ...)`:

```tsx
                        <button
                          type="button"
                          onClick={() => setDoiMstTenant(t)}
                          style={{
                            padding: "0.3rem 0.7rem",
                            background: "var(--nen-noi-2)",
                            color: "var(--chu)",
                            border: "1px solid var(--vien)",
                            fontSize: "var(--fs-sm)",
                          }}
                        >
                          Đổi MST
                        </button>
```

4. Render dialog cuối JSX (cạnh `ketQuaGui`):

```tsx
      {doiMstTenant && (
        <DoiMstDialog
          tenant={doiMstTenant}
          onDong={() => setDoiMstTenant(null)}
          onXong={(soTkXoa) => {
            setDoiMstTenant(null);
            setLoiThaoTac(
              soTkXoa > 0
                ? `Đã đổi MST và ngắt ${soTkXoa} kết nối Tổng cục Thuế. Khách cần kết nối lại.`
                : "Đã đổi MST.",
            );
            void qc.invalidateQueries({ queryKey: ["tenants"] });
          }}
        />
      )}
```

> `loiThaoTac` hiện dùng cho lỗi (viền đỏ). Dùng lại nó cho thông báo thành công là lệch
> nghĩa. Nếu muốn sạch: đọc cách `loiThaoTac` render (dòng ~172) và cân nhắc một state
> `thongBao` riêng tone xanh. Tối thiểu chấp nhận được: dùng `loiThaoTac` — nhưng GHI chú
> đây là thông báo, không phải lỗi. (Người thực thi chọn; test không phụ thuộc chỗ này.)

- [ ] **Bước 5: Nhãn audit**

Trong `apps/admin/src/features/audit/AuditPage.tsx`, thêm cạnh các nhãn khác:

```ts
  doi_mst_tenant: "Đổi mã số thuế",
```

- [ ] **Bước 6: Chạy test + lint, xác nhận XANH**

```bash
npm run test -w apps/admin
make lint
```

- [ ] **Bước 7: Commit**

```bash
git add apps/admin
git commit -m "Đổi MST: dialog trong Cổng Admin + nhãn audit"
```

---

## Task 4 — Vá câu chỉ đường sai ở app khách

**Files:**
- Sửa: `apps/web/src/features/taxAccounts/TaxAccountsPage.tsx`
- Test: `apps/web/test/features/taxAccounts.test.tsx` (nếu có test chạm nhánh này)

- [ ] **Bước 1: Tìm test hiện có chạm nhánh `!mst`**

```bash
grep -rn "Cài đặt chung\|chưa khai mã số thuế" apps/web/test apps/web/src
```
Nếu có test khẳng định chuỗi cũ, sửa nó trước (đỏ), rồi sửa mã. Nếu không có, viết một test
nhỏ trong `apps/web/test/features/` render `RegisterForm`/`TaxAccountsPage` với `mst=null` và
khẳng định câu MỚI — bám khuôn test web hiện có (mock `fetch`, `renderWithProviders`).

- [ ] **Bước 2: Sửa câu chỉ đường**

Trong `apps/web/src/features/taxAccounts/TaxAccountsPage.tsx`, nhánh `if (!mst)`:

```tsx
        <Alert tone="warning">
          Doanh nghiệp <strong>chưa khai mã số thuế</strong>, hoặc mã số thuế chưa đúng. Vui lòng{" "}
          <strong>liên hệ hỗ trợ</strong> để cập nhật mã số thuế trước khi kết nối Tổng cục Thuế.
        </Alert>
```

Không thêm ô nhập nào ở app khách (Đ-1) — chỉ thôi chỉ vào ngõ cụt.

- [ ] **Bước 3: Chạy test + lint, xác nhận XANH**

```bash
npm run test -w apps/web
make lint
```

- [ ] **Bước 4: Commit**

```bash
git add apps/web
git commit -m "Đổi MST: vá câu chỉ đường sai ở app khách — 'liên hệ hỗ trợ' thay 'Cài đặt chung'"
```

---

## Task 5 — Tài liệu, kiểm chứng toàn kho, deploy

**Files:**
- Sửa: `docs/CHECKLIST-NGHIEM-THU.md`

- [ ] **Bước 1: Cổng kiểm đầy đủ**

```bash
make lint && make test
```
Cả hai xanh. (Đừng nối `&&` từ lệnh `echo` — bẫy đã ghi trong bộ nhớ dự án.)

- [ ] **Bước 2: Runbook deploy vào `CHECKLIST-NGHIEM-THU.md`**

Thêm mục:

```markdown
## F. Đổi MST trong Cổng Admin — deploy & nghiệm thu

Deploy: `make migrate` (0015) → `vat-api` → `vat-admin`. `vat-web` chỉ đổi một câu chữ
(không đụng API) nên deploy cùng lượt cho gọn, không bắt buộc thứ tự.

Hậu kiểm DB sau migrate (trên production, chỗ duy nhất kiểm chứng được quyền — PGlite chạy
superuser):
- `admin_doi_mst` thuộc role `admin_api`; `has_function_privilege('vat_app', oid, 'EXECUTE')` = true; `has_function_privilege('public', oid, 'EXECUTE')` = false.

Nghiệm thu bằng người thật, trên tenant `1234567899` (0 hoá đơn, có kết nối):
- [ ] Cổng Admin → bấm "Đổi MST" → nhập MST mới hợp lệ → xác nhận → thành công, báo đã ngắt kết nối
- [ ] Kiểm khách: màn "Kết nối mã số thuế" cho kết nối lại bằng MST mới
- [ ] Thử "Đổi MST" trên `4201969169` (22.350 hoá đơn) → **409, thông điệp "đã có hoá đơn"**, MST không đổi
- [ ] App khách khi chưa khai MST: câu hướng dẫn nói "liên hệ hỗ trợ", KHÔNG còn "Cài đặt chung"
```

- [ ] **Bước 3: Commit + push**

```bash
git add docs
git commit -m "docs: runbook deploy + nghiệm thu tính năng đổi MST"
git push origin HEAD:feat/cloudflare-stack-u0
```

> ⚠️ Dùng dạng tường minh `HEAD:feat/cloudflare-stack-u0`.

Deploy (migrate chạm production → nhờ chủ dự án gõ `! ...&& make migrate` như Lát cắt 3).

---

## Việc bị BỎ SÓT nếu không rà — đã rà

| Đường ít ai nghĩ | Xử lý |
|---|---|
| `tai_khoan_thue.username` = MST cũ thành mồ côi | ✅ Xoá tài khoản thuế trong cùng giao dịch (Task 1) |
| Đổi MST trùng chính nó → ngắt kết nối oan | ✅ Nhánh sớm, không xoá (Task 1) |
| UNIQUE bắt trùng nhưng DELETE đã chạy → nửa vời | ✅ Cùng giao dịch, 23505 rollback cả DELETE (Task 1, test có ca này) |
| Client tự tin chặn theo hoá đơn nhưng thiếu dữ liệu | ✅ Không ẩn nút — backend chặn, dialog dịch lỗi (quyết định §Ràng buộc) |
| Câu chỉ đường sai ở app khách | ✅ Task 4 |

## Ngoài phạm vi (YAGNI)
- Khách tự đổi MST (Đ-1 đã bác).
- Di trú hoá đơn sang MST mới (bài toán gộp/tách doanh nghiệp, khác hẳn).
- Panel chi tiết tenant đầy đủ (U19 còn nợ 15% — không kéo vào đây).

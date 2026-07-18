# U17a — Nền dữ liệu gói dịch vụ & cấu hình ngưỡng — Kế hoạch thực thi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng nền dữ liệu cho gói dịch vụ và ngưỡng cấu hình được, thay hạn mức hardcode, để bảng điều khiển Admin (U18) có chỗ ghi.

**Architecture:** Thêm 3 bảng TOÀN CỤC (không `tenant_id`) vào Postgres: `goi_dich_vu` giữ hạn mức theo gói, `cau_hinh_he_thong` giữ ngưỡng toàn cục dạng key/value text, `audit_log_admin` giữ nhật ký hành động xuyên-tenant. Ngưỡng đọc từ DB đi qua hàm kẹp biên thuần (`clampInt`/`clampNumber`) trước khi dùng, với thứ tự phân giải DB → env → `DEFAULT_*`. U17a chỉ làm **đường ĐỌC**; đường GHI là U18.

**Tech Stack:** TypeScript · Drizzle ORM · PostgreSQL (Neon qua Hyperdrive) · Cloudflare Workers + Hono · Vitest + PGlite (Postgres WASM, offline) · Biome

## Global Constraints

- **Spec nguồn:** `docs/plans/U17-plan.md` — mọi quyết định QĐ-1..QĐ-10 ở đó là ràng buộc, không diễn giải lại.
- **Worktree:** `/Users/tuanbao/Documents/Projects/vat-u17`, nhánh `feat/u17-dang-ky-goi-dich-vu`. `npm ci` đã chạy (exit 0).
- **TDD bắt buộc** (`.claude/rules/testing.md`): viết test đỏ trước, rồi mới hiện thực. Coverage tầng nghiệp vụ ≥ 80%.
- **Lệnh chuẩn:** `make lint` (Biome + `tsc --noEmit`) và `make test` (Vitest `unit` + `integration`, offline). Cả hai phải sạch trước khi coi task xong.
- **Migration số hiệu `0007`**, tên file `packages/db/migrations/0007_dang_ky_va_goi_dich_vu.sql`. Đã có tới `0006`.
- **Idempotent:** mọi câu DDL dùng `IF NOT EXISTS` / `CREATE OR REPLACE` / `DROP ... IF EXISTS` theo convention dự án (`0002`, `0006`).
- **Không log bí mật** (`.claude/rules/security.md`). Ngưỡng không phải bí mật nhưng audit vẫn qua `maskSensitive`.
- **Commit nhỏ, tiếng Việt, một task một commit.** Kết thúc mọi commit bằng:
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```
- **Ngoài phạm vi U17a:** endpoint Admin ghi cấu hình, danh tính super-admin, `POST /dang-ky`, `SignupLimiter`, cổng trạng thái login, middleware rate-limit route khách. Đó là U17b/U17c/U18.

---

## 📌 ERRATA (cập nhật 2026-07-18 sau khi Task 2 chạy thật)

Ba khẳng định trong bản đầu của plan này **đã bị bác bỏ bằng đo đạc thật trên PGlite**. Chúng đã được sửa tại chỗ ở các mục bên dưới; ghi lại đây để không ai tái tạo lại từ bản cũ.

1. **"Mọi đường ghi bị chặn ở tầng RLS, kể cả owner" — SAI.** `FORCE ROW LEVEL SECURITY` **không** chi phối role có `BYPASSRLS`/superuser. PGlite chạy role `postgres` (super + bypass); trên Neon, `app-role.sql:9` của chính kho này ghi *"`neondb_owner` CÓ BYPASSRLS!"*. Không tồn tại môi trường hiện có nào mà mệnh đề đó đúng.
2. **`UPDATE`/`DELETE` dưới RLS KHÔNG ném lỗi** — chúng chạy bình thường và ảnh hưởng **0 hàng**. Chỉ `INSERT` ném `new row violates row-level security policy`. ⇒ Test khẳng định `rejects.toThrow()` cho UPDATE sẽ **đỏ**; phải khẳng định *dữ liệu không đổi* thay vì trông chờ exception. Mã ứng dụng nào trông chờ exception khi ghi sẽ "thành công" im lặng — U18 phải biết điều này.
3. **Test kiểu "cấp mỗi USAGE rồi khẳng định lệnh ghi ném lỗi" LUÔN XANH.** Postgres kiểm quyền `GRANT` **trước** RLS, nên lỗi đến từ tầng GRANT. Mutation test ở Task 2 chứng minh: tiêm `CREATE POLICY ... FOR ALL USING(true) WITH CHECK(true)` mà test cũ vẫn xanh. ⇒ Muốn gác tầng RLS phải **(a)** khẳng định trực tiếp trên `pg_policies`, và **(b)** cấp **đủ** quyền ghi cho role test trước khi khẳng định RLS chặn — đó mới là cấu hình production (`app-role.sql:28` cấp `INSERT/UPDATE/DELETE ON ALL TABLES`).

Lý do biện minh `GRANT SELECT ... TO PUBLIC` trong bản đầu ("an toàn vì đường ghi đã bị RLS chặn") cũng **không đứng vững** — an toàn của đường ghi không biện minh cho việc mở đường đọc. Lý do đúng: **bảng không chứa dữ liệu tenant nào**, nên không có bề mặt rò rỉ chéo giữa doanh nghiệp khách hàng.

## ⚠️ Hai cạm bẫy đã biết — đọc trước khi viết migration

**Cạm bẫy 1 — FORCE RLS chặn cả seed.** Nếu bật `FORCE ROW LEVEL SECURITY` rồi mới `INSERT` seed, câu INSERT sẽ bị chính policy chặn (không có policy nào cho INSERT). **Thứ tự bắt buộc trong migration:** `CREATE TABLE` → `INSERT` seed → `ENABLE RLS` → `FORCE RLS` → `CREATE POLICY` (chỉ SELECT) → `GRANT SELECT`.

**Cạm bẫy 2 — backfill `tenants` có thể âm thầm không làm gì.** `tenants` bật FORCE RLS (`0000:128`) với policy `id = nullif(current_setting('app.tenant_id', true), '')::uuid`. Lúc chạy migration, GUC `app.tenant_id` **không được đặt** → `id = NULL` → **0 hàng khớp** → `UPDATE tenants SET goi_dich_vu='free'` không đổi gì mà **không báo lỗi**. Nó chỉ chạy được nhờ role migrate tình cờ có `BYPASSRLS` (Neon `neondb_owner`, xem chú thích `0001`) hoặc superuser (PGlite trong test). **Đây là giả định phụ thuộc môi trường, không được tin.** Task 4 vì vậy phải có test **khẳng định số hàng thật sự đã đổi**, không chỉ khẳng định "migration chạy không lỗi".

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `apps/api/src/configClamp.ts` | **Tạo.** Hai hàm thuần `clampInt` / `clampNumber` — kẹp giá trị đến từ DB về biên an toàn |
| `apps/api/test/unit/configClamp.test.ts` | **Tạo.** Ma trận biên cho hai hàm trên |
| `packages/db/src/schema/goiDichVu.ts` | **Tạo.** Bảng gói dịch vụ (hạn mức hạng A) |
| `packages/db/src/schema/cauHinhHeThong.ts` | **Tạo.** Bảng cấu hình toàn cục key/value |
| `packages/db/src/schema/auditLogAdmin.ts` | **Tạo.** Nhật ký hành động xuyên-tenant |
| `packages/db/src/schema/index.ts` | **Sửa.** Re-export 3 bảng mới |
| `packages/db/src/schema/tenants.ts` | **Sửa.** FK `goi_dich_vu` → `goiDichVu.ma` |
| `packages/db/migrations/0007_dang_ky_va_goi_dich_vu.sql` | **Tạo.** DDL + seed + RLS/GRANT + backfill + FK |
| `packages/db/test/integration/goiDichVu.test.ts` | **Tạo.** Kiểm RLS/quyền/seed/backfill thật dưới role non-superuser |
| `apps/api/src/goiDichVuConfig.ts` | **Tạo.** Đọc gói + phân giải ngưỡng DB → env → `DEFAULT_*` |
| `apps/api/test/integration/goiDichVuConfig.test.ts` | **Tạo.** Phân giải + fail-safe khi DB hỏng |
| `apps/api/src/routes/taxAccounts.ts:52` | **Sửa.** `getGioiHanTkThue` đọc theo gói thay `return 1` |
| `apps/api/src/routes/me.ts:39,51` | **Sửa.** `GET /me` trả thêm nhãn gói |
| `apps/web/src/features/settings/SettingsPage.tsx:93` | **Sửa.** Hiển thị nhãn gói |

---

## Task 1: Hàm kẹp biên `clampInt` / `clampNumber`

Hàm thuần, không phụ thuộc gì — làm trước để các task sau dùng được ngay.

**Vì sao tách hai hàm** (QĐ-5): ép số nguyên cho *mọi* trường sẽ khiến không thể siết `refillPerSec` xuống dưới `1/s` (mặc định là `2/s`) — đúng hành vi Hiến pháp mong muốn nhất khi nói *"không gọi dồn dập"* máy chủ thuế.

**Files:**
- Create: `apps/api/src/configClamp.ts`
- Test: `apps/api/test/unit/configClamp.test.ts`

**Interfaces:**
- Consumes: — (không phụ thuộc task nào)
- Produces:
  - `clampInt(raw: unknown, min: number, max: number, fallback: number): number`
  - `clampNumber(raw: unknown, min: number, max: number, fallback: number): number`

- [ ] **Step 1: Viết test đỏ**

Tạo `apps/api/test/unit/configClamp.test.ts`:

```ts
// U17a — Kẹp biên giá trị cấu hình đến từ DB (QĐ-5). Giá trị do Admin nhập KHÔNG được
// tin: quá nhỏ → khóa sạch khách; quá lớn → vô hiệu hóa chống lạm dụng; rác → phải rơi
// về mặc định thay vì NaN lan xuống limiter.
import { describe, expect, it } from "vitest";
import { clampInt, clampNumber } from "../../src/configClamp";

describe("clampInt", () => {
  it("giá trị trong biên → giữ nguyên", () => {
    expect(clampInt("120", 1, 1000, 60)).toBe(120);
    expect(clampInt(120, 1, 1000, 60)).toBe(120);
  });

  it("dưới biên → kẹp về min (không để 0 khóa sạch khách)", () => {
    expect(clampInt("0", 1, 1000, 60)).toBe(1);
    expect(clampInt("-5", 1, 1000, 60)).toBe(1);
  });

  it("trên biên → kẹp về max (không để vô hiệu hóa chống lạm dụng)", () => {
    expect(clampInt("999999", 1, 1000, 60)).toBe(1000);
  });

  it("số thập phân → làm tròn", () => {
    expect(clampInt("120.4", 1, 1000, 60)).toBe(120);
    expect(clampInt("120.6", 1, 1000, 60)).toBe(121);
  });

  it("rác / rỗng / thiếu → rơi về fallback, KHÔNG trả NaN", () => {
    expect(clampInt("abc", 1, 1000, 60)).toBe(60);
    expect(clampInt("", 1, 1000, 60)).toBe(60);
    expect(clampInt(undefined, 1, 1000, 60)).toBe(60);
    expect(clampInt(null, 1, 1000, 60)).toBe(60);
    expect(clampInt(Number.NaN, 1, 1000, 60)).toBe(60);
    expect(clampInt(Number.POSITIVE_INFINITY, 1, 1000, 60)).toBe(60);
  });

  it("fallback nằm ngoài biên vẫn bị kẹp (fallback không phải đường vòng)", () => {
    expect(clampInt("abc", 1, 10, 9999)).toBe(10);
  });
});

describe("clampNumber", () => {
  it("GIỮ ĐƯỢC số thập phân — đây là lý do tách khỏi clampInt (QĐ-5)", () => {
    // refillPerSec mặc định 2/s; siết xuống 0.5/s là hành vi Hiến pháp mong muốn nhất.
    // clampInt sẽ làm tròn 0.5 thành 1 và giết mất khả năng siết này.
    expect(clampNumber("0.5", 0.1, 2, 2)).toBe(0.5);
    expect(clampInt("0.5", 0, 2, 2)).toBe(1);
  });

  it("dưới/trên biên → kẹp", () => {
    expect(clampNumber("0.01", 0.1, 2, 2)).toBe(0.1);
    expect(clampNumber("99", 0.1, 2, 2)).toBe(2);
  });

  it("rác → fallback", () => {
    expect(clampNumber("abc", 0.1, 2, 2)).toBe(2);
    expect(clampNumber(undefined, 0.1, 2, 2)).toBe(2);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận ĐỎ**

```bash
cd /Users/tuanbao/Documents/Projects/vat-u17
npx vitest run apps/api/test/unit/configClamp.test.ts
```

Kỳ vọng: FAIL — `Failed to resolve import "../../src/configClamp"`.

- [ ] **Step 3: Hiện thực tối thiểu**

Tạo `apps/api/src/configClamp.ts`:

```ts
// U17a (QĐ-5) — Kẹp biên cho giá trị cấu hình đến từ DB (Admin sửa được ở U18).
// Mở rộng pattern `positiveOr` sẵn có (loginLimiter.ts:36) thêm chặn TRÊN, vì giá trị
// nay do người nhập chứ không còn là hằng deploy: quá nhỏ → khóa sạch khách; quá lớn →
// vô hiệu hóa chống lạm dụng. Rác/thiếu → mặc định trong mã (fail-safe-to-DEFAULT:
// KHÔNG fail-open, KHÔNG fail-closed).
//
// TÁCH HAI HÀM có chủ ý: ép số nguyên cho mọi trường sẽ khiến KHÔNG siết được
// refillPerSec xuống dưới 1/s (mặc định 2/s) — đúng hành vi Hiến pháp mong muốn nhất
// ("Tôn trọng máy chủ thuế… Không gọi dồn dập").

function parseFinite(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

function clampTo(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

/** Kẹp về [min,max] rồi LÀM TRÒN. Dùng cho số đếm: req/phút, maxFailures, capacity. */
export function clampInt(raw: unknown, min: number, max: number, fallback: number): number {
  const n = parseFinite(raw);
  // fallback cũng bị kẹp: fallback sai không được thành đường vòng qua biên.
  return Math.round(clampTo(n ?? fallback, min, max));
}

/** Kẹp về [min,max], GIỮ phần thập phân. Dùng cho tốc độ/thời lượng: refillPerSec, *Ms. */
export function clampNumber(raw: unknown, min: number, max: number, fallback: number): number {
  const n = parseFinite(raw);
  return clampTo(n ?? fallback, min, max);
}
```

- [ ] **Step 4: Chạy test, xác nhận XANH**

```bash
npx vitest run apps/api/test/unit/configClamp.test.ts
```

Kỳ vọng: PASS, 9 test.

- [ ] **Step 5: Lint sạch**

```bash
make lint
```

Kỳ vọng: không lỗi Biome, không lỗi `tsc`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/configClamp.ts apps/api/test/unit/configClamp.test.ts
git commit -m "$(cat <<'EOF'
U17a-1: clampInt/clampNumber — kẹp biên giá trị cấu hình từ DB

Ngưỡng nay do Admin nhập (U18) nên không tin được: quá nhỏ khóa sạch khách,
quá lớn vô hiệu hóa chống lạm dụng, rác làm NaN lan xuống limiter. Mở rộng
positiveOr (loginLimiter.ts:36) thêm chặn TRÊN + fail-safe về DEFAULT.

Tách hai hàm có chủ ý: ép số nguyên cho mọi trường sẽ khiến không siết được
refillPerSec dưới 1/s (mặc định 2/s) — đúng hành vi Hiến pháp mong muốn nhất.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Bảng `goi_dich_vu` + seed + RLS/GRANT

**Files:**
- Create: `packages/db/src/schema/goiDichVu.ts`
- Create: `packages/db/migrations/0007_dang_ky_va_goi_dich_vu.sql`
- Modify: `packages/db/src/schema/index.ts`
- Test: `packages/db/test/integration/goiDichVu.test.ts`

**Interfaces:**
- Consumes: —
- Produces: bảng `goiDichVu` với các cột `ma`, `ten`, `soMstToiDa`, `soHoaDonThang`, `choTaiKhoanCon`, `ghInvoicesMoiPhut`, `ghExportsMoiPhut`, `ghReconcileMoiPhut`, `capNhatLuc`. Hàng seed `ma='free'`.

- [ ] **Step 1: Viết test đỏ**

Tạo `packages/db/test/integration/goiDichVu.test.ts`:

```ts
// U17a — Bảng gói dịch vụ TOÀN CỤC (không tenant_id). Đây là bảng ĐẦU TIÊN của dự án
// không có trục tenant, nên phải kiểm hành vi RLS/quyền THẬT chứ không tin khai báo:
// drizzle KHÔNG phát ENABLE RLS cho bảng không khai báo policy (bằng chứng 0000 chỉ bật
// cho 7 bảng có tenantIsolationPolicy), và bảng mới KHÔNG thừa hưởng GRANT cũ
// (app-role.sql:28 là GRANT ON ALL TABLES chạy một lần; ALTER DEFAULT PRIVILEGES = 0).
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "../../src/schema";

const MIGRATIONS = fileURLToPath(new URL("../../migrations", import.meta.url));

type Db = ReturnType<typeof drizzle<typeof schema>>;

async function freshDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

describe("U17a — goi_dich_vu (integration, PGlite)", () => {
  let db: Db;
  beforeEach(async () => {
    db = await freshDb();
  });

  it("seed 'free' tồn tại với hạn mức 01 MST và không cho tài khoản con", async () => {
    const res = (await db.execute(
      sql`select ma, ten, so_mst_toi_da, cho_tai_khoan_con from goi_dich_vu where ma = 'free'`,
    )) as { rows: Array<Record<string, unknown>> };
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]).toMatchObject({
      ma: "free",
      so_mst_toi_da: 1,
      cho_tai_khoan_con: false,
    });
    // Nhãn tiếng Việt phải có — FE hiển thị nhãn này thay cột thô (QĐ-7).
    expect(String(res.rows[0]?.ten ?? "")).not.toBe("");
  });

  it("seed 'free' có đủ 3 ngưỡng rate-limit hạng A (QĐ-5)", async () => {
    const res = (await db.execute(
      sql`select gh_invoices_moi_phut, gh_exports_moi_phut, gh_reconcile_moi_phut
          from goi_dich_vu where ma = 'free'`,
    )) as { rows: Array<Record<string, unknown>> };
    expect(res.rows[0]).toMatchObject({
      gh_invoices_moi_phut: 120,
      gh_exports_moi_phut: 20,
      gh_reconcile_moi_phut: 20,
    });
  });

  it("RLS đã BẬT và FORCE (không để bảng toàn cục thành ngoại lệ đầu tiên)", async () => {
    const res = (await db.execute(
      sql`select relrowsecurity, relforcerowsecurity from pg_class where relname = 'goi_dich_vu'`,
    )) as { rows: Array<{ relrowsecurity: boolean; relforcerowsecurity: boolean }> };
    expect(res.rows[0]?.relrowsecurity).toBe(true);
    expect(res.rows[0]?.relforcerowsecurity).toBe(true);
  });

  it("role app KHÔNG-superuser: ĐỌC được (bắt lỗi quên GRANT — nếu quên, lỗi chỉ lộ sau deploy)", async () => {
    await db.execute(sql`create role app_user nosuperuser`);
    await db.execute(sql`grant usage on schema public to app_user`);
    await db.execute(sql`set role app_user`);
    const res = (await db.execute(sql`select ma from goi_dich_vu where ma = 'free'`)) as {
      rows: Array<{ ma: string }>;
    };
    expect(res.rows[0]?.ma).toBe("free");
    await db.execute(sql`reset role`);
  });

  it("role app KHÔNG-superuser: GHI bị chặn (đường ghi là U18, không phải role khách)", async () => {
    await db.execute(sql`create role app_user nosuperuser`);
    await db.execute(sql`grant usage on schema public to app_user`);
    await db.execute(sql`set role app_user`);
    await expect(
      db.execute(sql`insert into goi_dich_vu (ma, ten, so_mst_toi_da) values ('hack', 'x', 999)`),
    ).rejects.toThrow();
    await expect(
      db.execute(sql`update goi_dich_vu set so_mst_toi_da = 999 where ma = 'free'`),
    ).rejects.toThrow();
    await db.execute(sql`reset role`);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận ĐỎ**

```bash
npx vitest run packages/db/test/integration/goiDichVu.test.ts
```

Kỳ vọng: FAIL — `relation "goi_dich_vu" does not exist`.

- [ ] **Step 3: Khai báo lược đồ**

Tạo `packages/db/src/schema/goiDichVu.ts`:

```ts
import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// U17a — Gói dịch vụ. Bảng TOÀN CỤC: KHÔNG có tenant_id, nên KHÔNG dùng
// tenantIsolationPolicy. Đây là bảng đầu tiên của dự án như vậy ⇒ RLS + quyền phải làm
// TAY trong migration 0007 (drizzle chỉ phát ENABLE RLS cho bảng có khai báo policy).
//
// Hạn mức đọc từ đây thay hardcode (thay getGioiHanTkThue cũ). Ngưỡng gh_* là hạng A
// (QĐ-5) — Admin sửa tự do ở U18; hạng B'/C chống tấn công và nhịp GDT KHÔNG nằm ở đây.
export const goiDichVu = pgTable("goi_dich_vu", {
  ma: text("ma").primaryKey(),
  ten: text("ten").notNull(),
  soMstToiDa: integer("so_mst_toi_da").notNull().default(1),
  // NULL = không giới hạn số hóa đơn/tháng.
  soHoaDonThang: integer("so_hoa_don_thang"),
  choTaiKhoanCon: boolean("cho_tai_khoan_con").notNull().default(false),
  ghInvoicesMoiPhut: integer("gh_invoices_moi_phut").notNull().default(120),
  ghExportsMoiPhut: integer("gh_exports_moi_phut").notNull().default(20),
  ghReconcileMoiPhut: integer("gh_reconcile_moi_phut").notNull().default(20),
  capNhatLuc: timestamp("cap_nhat_luc", { withTimezone: true }).notNull().defaultNow(),
});
```

Sửa `packages/db/src/schema/index.ts` — thêm dòng export theo thứ tự bảng chữ cái:

```ts
export * from "./cauHinhHeThong";
export * from "./goiDichVu";
```

> Ghi chú: `cauHinhHeThong` được tạo ở Task 3. Nếu chạy Task 2 độc lập, chỉ thêm dòng `goiDichVu` và bổ sung dòng còn lại ở Task 3.

- [ ] **Step 4: Viết migration**

Tạo `packages/db/migrations/0007_dang_ky_va_goi_dich_vu.sql`:

```sql
-- U17a — Nền gói dịch vụ + cấu hình ngưỡng (spec: docs/plans/U17-plan.md §3.1, QĐ-5..9).
--
-- THỨ TỰ CÂU LỆNH LÀ CÓ CHỦ Ý — KHÔNG ĐẢO:
--   CREATE TABLE → INSERT seed → ENABLE RLS → FORCE RLS → CREATE POLICY → GRANT.
-- Vì sao: FORCE ROW LEVEL SECURITY chi phối CẢ owner. Nếu bật FORCE trước khi seed, câu
-- INSERT seed sẽ bị chính policy chặn (ta cố ý KHÔNG tạo policy nào cho INSERT) và
-- migration hỏng. Đây là hệ quả trực tiếp của bài học FORCE RLS ở 0000/0001.
--
-- Vì sao làm TAY: drizzle-kit chỉ phát ENABLE RLS cho bảng CÓ khai báo policy (bằng
-- chứng 0000: đúng 7 bảng có tenantIsolationPolicy mới được bật). Ba bảng dưới đây là
-- bảng TOÀN CỤC (không tenant_id) nên drizzle sẽ bỏ qua — không làm tay thì chúng thành
-- ngoại lệ RLS đầu tiên của dự án.
--
-- Idempotent (áp lại không lỗi) theo convention 0002/0006.

CREATE TABLE IF NOT EXISTS "goi_dich_vu" (
  "ma" text PRIMARY KEY,
  "ten" text NOT NULL,
  "so_mst_toi_da" integer NOT NULL DEFAULT 1,
  "so_hoa_don_thang" integer,
  "cho_tai_khoan_con" boolean NOT NULL DEFAULT false,
  "gh_invoices_moi_phut" integer NOT NULL DEFAULT 120,
  "gh_exports_moi_phut" integer NOT NULL DEFAULT 20,
  "gh_reconcile_moi_phut" integer NOT NULL DEFAULT 20,
  "cap_nhat_luc" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint

-- SEED phải chạy TRƯỚC khi bật FORCE RLS (xem chú thích thứ tự ở đầu file).
-- v1.0 chỉ có gói free; bảng cố ý linh hoạt để thêm gói trả phí không cần đổi lược đồ.
-- Ngưỡng gh_* là số ĐỀ XUẤT CHƯA KIỂM CHỨNG (U17-plan §3.6) — phải đo bằng số thật của
-- tenant production rồi chỉnh qua bảng điều khiển, KHÔNG cần deploy lại.
INSERT INTO "goi_dich_vu" ("ma", "ten", "so_mst_toi_da", "so_hoa_don_thang", "cho_tai_khoan_con")
VALUES ('free', 'Miễn phí', 1, NULL, false)
ON CONFLICT ("ma") DO NOTHING;--> statement-breakpoint

ALTER TABLE "goi_dich_vu" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "goi_dich_vu" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- CHỈ policy SELECT. Cố ý KHÔNG tạo policy INSERT/UPDATE/DELETE ⇒ mọi đường ghi bị chặn
-- ở tầng RLS, kể cả owner. Đường ghi của Admin (U18) sẽ đi qua hàm SECURITY DEFINER do
-- một role BYPASSRLS sở hữu — đúng mẫu auth_lookup_user (0001). LƯU Ý cho U18: hàm
-- SECURITY DEFINER do role KHÔNG-BYPASSRLS sở hữu VẪN bị FORCE chặn (0001:4-8 ghi rõ).
DROP POLICY IF EXISTS "goi_dich_vu_doc_moi_nguoi" ON "goi_dich_vu";--> statement-breakpoint
CREATE POLICY "goi_dich_vu_doc_moi_nguoi" ON "goi_dich_vu" FOR SELECT USING (true);--> statement-breakpoint

-- GRANT TƯỜNG MINH — bắt buộc, dễ quên: app-role.sql:28 là `GRANT ... ON ALL TABLES`
-- chạy MỘT LẦN và toàn repo KHÔNG có `ALTER DEFAULT PRIVILEGES` (đã grep, = 0). Bảng tạo
-- ở migration này KHÔNG thừa hưởng quyền nào ⇒ quên GRANT thì API lỗi `permission denied`
-- và lỗi chỉ lộ ra SAU khi deploy production.
GRANT SELECT ON "goi_dich_vu" TO PUBLIC;
```

> **Ghi chú `TO PUBLIC`:** tên role app khác nhau theo môi trường (`vat_app` production, `app_user` trong test) nên migration không biết tên cụ thể — `0002` gặp đúng vấn đề này và tự dán nhãn *"CHƯA KIỂM CHỨNG trên DB thật"*. Cấp SELECT cho `PUBLIC` là an toàn ở đây vì **quyền ghi đã bị chặn bằng RLS** (không có policy ghi), tức phòng thủ không dựa vào GRANT. Nếu sau này muốn siết đọc, thay bằng GRANT theo tên role ở `app-role.sql`.

- [ ] **Step 5: Chạy test, xác nhận XANH**

```bash
npx vitest run packages/db/test/integration/goiDichVu.test.ts
```

Kỳ vọng: PASS, 5 test.

- [ ] **Step 6: Chạy toàn bộ test — không hồi quy**

```bash
make test
```

Kỳ vọng: toàn xanh. Đặc biệt `packages/db/test/integration/constraints.test.ts` phải còn xanh (migration mới không phá RLS cũ).

- [ ] **Step 7: Lint + commit**

```bash
make lint
git add packages/db/src/schema/goiDichVu.ts packages/db/src/schema/index.ts \
        packages/db/migrations/0007_dang_ky_va_goi_dich_vu.sql \
        packages/db/test/integration/goiDichVu.test.ts
git commit -m "$(cat <<'EOF'
U17a-2: bảng goi_dich_vu + seed free + RLS/GRANT làm tay

Bảng TOÀN CỤC đầu tiên của dự án (không tenant_id). drizzle chỉ phát ENABLE
RLS cho bảng có khai báo policy (0000 bật đúng 7 bảng có tenantIsolationPolicy)
nên phải làm tay, nếu không đây thành ngoại lệ RLS đầu tiên.

Thứ tự câu lệnh có chủ ý: seed TRƯỚC khi bật FORCE RLS, vì FORCE chi phối cả
owner và ta cố ý không tạo policy INSERT — bật trước thì chính seed bị chặn.

GRANT tường minh vì app-role.sql:28 là GRANT ON ALL TABLES chạy một lần và
repo không có ALTER DEFAULT PRIVILEGES — quên thì lỗi permission denied chỉ
lộ sau khi deploy production.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Bảng `cau_hinh_he_thong` + `audit_log_admin`

**Files:**
- Create: `packages/db/src/schema/cauHinhHeThong.ts`
- Create: `packages/db/src/schema/auditLogAdmin.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/migrations/0007_dang_ky_va_goi_dich_vu.sql` (nối tiếp)
- Test: `packages/db/test/integration/goiDichVu.test.ts` (thêm describe)

**Interfaces:**
- Consumes: migration `0007` từ Task 2
- Produces:
  - `cauHinhHeThong` — cột `khoa`, `giaTri`, `moTa`, `capNhatLuc`. Seed `dangky_max_moi_ip_gio = '5'`
  - `auditLogAdmin` — cột `id`, `hanhDong`, `doiTuong`, `nguoiThucHien`, `chiTiet`, `taoLuc`

- [ ] **Step 1: Viết test đỏ**

Thêm vào cuối `packages/db/test/integration/goiDichVu.test.ts`:

```ts
describe("U17a — cau_hinh_he_thong (integration, PGlite)", () => {
  let db: Db;
  beforeEach(async () => {
    db = await freshDb();
  });

  it("seed ngưỡng đăng ký/IP = 5 (hạng B, QĐ-5), lưu dạng text", async () => {
    const res = (await db.execute(
      sql`select gia_tri from cau_hinh_he_thong where khoa = 'dangky_max_moi_ip_gio'`,
    )) as { rows: Array<{ gia_tri: string }> };
    // text CÓ CHỦ Ý: mọi resolveXxxConfig hiện nhận Record<string, string|undefined>,
    // giữ text cho phép tái dùng NGUYÊN các hàm thuần đã test, chỉ đổi nguồn nạp.
    expect(res.rows[0]?.gia_tri).toBe("5");
  });

  it("RLS bật + FORCE", async () => {
    const rls = (await db.execute(
      sql`select relrowsecurity, relforcerowsecurity from pg_class where relname = 'cau_hinh_he_thong'`,
    )) as { rows: Array<{ relrowsecurity: boolean; relforcerowsecurity: boolean }> };
    expect(rls.rows[0]?.relrowsecurity).toBe(true);
    expect(rls.rows[0]?.relforcerowsecurity).toBe(true);
  });

  it("KHÔNG có policy ghi nào (gác đúng tầng RLS, không phải tầng GRANT)", async () => {
    // Khẳng định TRỰC TIẾP trên catalog. Suy ra từ "lệnh ghi ném lỗi" là gác nhầm tầng:
    // Postgres kiểm quyền GRANT TRƯỚC RLS, nên một role thiếu GRANT sẽ ném lỗi kể cả khi
    // policy mở toang đường ghi ⇒ test kiểu đó LUÔN XANH. (Đã kiểm chứng bằng mutation
    // test ở Task 2: tiêm policy FOR ALL USING(true) mà test cũ vẫn xanh.)
    const res = (await db.execute(
      sql`select cmd from pg_policies where tablename = 'cau_hinh_he_thong'`,
    )) as { rows: Array<{ cmd: string }> };
    expect(res.rows.map((r) => r.cmd)).toEqual(["SELECT"]);
  });

  it("role app CÓ ĐỦ QUYỀN GHI vẫn bị RLS chặn (cấu hình giống production)", async () => {
    await db.execute(sql`create role app_user nosuperuser`);
    await db.execute(sql`grant usage on schema public to app_user`);
    // Cấp ĐỦ quyền ghi — đây mới là cấu hình production thật: app-role.sql:28 chạy
    // `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES`. Không cấp thì test gác nhầm tầng.
    await db.execute(sql`grant select, insert, update, delete on cau_hinh_he_thong to app_user`);
    await db.execute(sql`set role app_user`);

    const doc = (await db.execute(
      sql`select khoa from cau_hinh_he_thong where khoa = 'dangky_max_moi_ip_gio'`,
    )) as { rows: Array<{ khoa: string }> };
    expect(doc.rows).toHaveLength(1);

    // INSERT ném lỗi RLS ("new row violates row-level security policy").
    await expect(
      db.execute(sql`insert into cau_hinh_he_thong (khoa, gia_tri) values ('hack', '1')`),
    ).rejects.toThrow();

    // ⚠️ UPDATE/DELETE dưới RLS KHÔNG ném lỗi — chỉ ảnh hưởng 0 hàng (đo được ở Task 2).
    // Vì vậy phải khẳng định DỮ LIỆU KHÔNG ĐỔI, không được dùng rejects.toThrow().
    await expect(
      db.execute(sql`update cau_hinh_he_thong set gia_tri = '9999' where khoa = 'dangky_max_moi_ip_gio'`),
    ).resolves.not.toThrow();
    await db.execute(sql`reset role`);

    const sau = (await db.execute(
      sql`select gia_tri from cau_hinh_he_thong where khoa = 'dangky_max_moi_ip_gio'`,
    )) as { rows: Array<{ gia_tri: string }> };
    expect(sau.rows[0]?.gia_tri).toBe("5");
  });
});

describe("U17a — audit_log_admin (integration, PGlite)", () => {
  let db: Db;
  beforeEach(async () => {
    db = await freshDb();
  });

  it("ghi được nhật ký toàn cục KHÔNG cần tenant_id (gỡ hard stop QĐ-6)", async () => {
    // audit_log của khách có tenant_id NOT NULL + FK cascade + RLS for:all + trigger
    // append-only ⇒ thay đổi cấu hình TOÀN CỤC không có chỗ ghi hợp lệ. Bảng này là chỗ đó.
    await db.execute(
      sql`insert into audit_log_admin (hanh_dong, doi_tuong, nguoi_thuc_hien, chi_tiet)
          values ('doi_nguong', 'goi_dich_vu:free', 'admin@vd.vn',
                  '{"truoc": 120, "sau": 200}'::jsonb)`,
    );
    const res = (await db.execute(
      sql`select hanh_dong, nguoi_thuc_hien, chi_tiet from audit_log_admin`,
    )) as { rows: Array<Record<string, unknown>> };
    expect(res.rows).toHaveLength(1);
    // Ghi CŨ → MỚI, không chỉ tên trường như tiền lệ me.ts:89 — thiếu giá trị cũ thì
    // audit vô dụng khi điều tra sự cố (QĐ-6).
    expect(res.rows[0]?.chi_tiet).toMatchObject({ truoc: 120, sau: 200 });
  });

  it("append-only: UPDATE và DELETE bị trigger chặn kể cả owner", async () => {
    await db.execute(
      sql`insert into audit_log_admin (hanh_dong, nguoi_thuc_hien) values ('x', 'admin@vd.vn')`,
    );
    await expect(db.execute(sql`update audit_log_admin set hanh_dong = 'y'`)).rejects.toThrow();
    await expect(db.execute(sql`delete from audit_log_admin`)).rejects.toThrow();
  });

  it("append-only: TRUNCATE cũng bị chặn (trigger statement-level)", async () => {
    await expect(db.execute(sql`truncate audit_log_admin`)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận ĐỎ**

```bash
npx vitest run packages/db/test/integration/goiDichVu.test.ts
```

Kỳ vọng: 5 test cũ PASS, 5 test mới FAIL — `relation "cau_hinh_he_thong" does not exist`.

- [ ] **Step 3: Khai báo lược đồ**

Tạo `packages/db/src/schema/cauHinhHeThong.ts`:

```ts
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// U17a (QĐ-5 hạng B) — Cấu hình TOÀN CỤC dạng key/value. Chỗ hợp lẽ cho ngưỡng không
// thuộc tenant nào: rate-limit đăng ký theo IP xảy ra khi CHƯA có tenant nào tồn tại,
// nên không thể sống trong bảng có tenant_id.
//
// `gia_tri` là TEXT có chủ ý (không jsonb, không cột số): mọi resolveXxxConfig hiện nhận
// Record<string, string | undefined> và đã có fail-safe về DEFAULT — giữ text cho phép
// TÁI DÙNG NGUYÊN các hàm thuần đã test, chỉ đổi NGUỒN nạp.
//
// KHÔNG chứa ngưỡng hạng B' (chống dò mật khẩu) và hạng C (nhịp gọi GDT) — hai hạng đó
// giữ trong env, không đưa lên bảng điều khiển (QĐ-5).
export const cauHinhHeThong = pgTable("cau_hinh_he_thong", {
  khoa: text("khoa").primaryKey(),
  giaTri: text("gia_tri").notNull(),
  moTa: text("mo_ta"),
  capNhatLuc: timestamp("cap_nhat_luc", { withTimezone: true }).notNull().defaultNow(),
});
```

Tạo `packages/db/src/schema/auditLogAdmin.ts`:

```ts
import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// U17a (QĐ-6) — Nhật ký hành động XUYÊN-TENANT của super-admin. Tách hẳn khỏi audit_log
// của khách.
//
// VÌ SAO BẢNG RIÊNG: audit_log có tenant_id NOT NULL + FK cascade (auditLog.ts:13), policy
// RLS `for: 'all'` so tenant_id, và trigger append-only (0002). Ba lớp cùng chặn ⇒ thay
// đổi cấu hình TOÀN CỤC (bảng gói, ngưỡng hệ thống) KHÔNG có chỗ ghi hợp lệ, trong khi
// security.md:21 bắt buộc audit "đổi cấu hình". Sửa audit_log đang chạy đúng trên
// production là rủi ro hồi quy; tách bảng cũng hợp ranh giới bảo mật U18.
//
// U17a chỉ TẠO bảng. Đường ghi vào nó là U18.
export const auditLogAdmin = pgTable("audit_log_admin", {
  id: uuid("id").primaryKey().defaultRandom(),
  hanhDong: text("hanh_dong").notNull(),
  doiTuong: text("doi_tuong"),
  // Danh tính super-admin (U18 chốt mô hình). Text để không ràng vào bảng nguoi_dung của
  // khách — danh tính admin TÁCH khỏi bảng khách (yêu cầu bảo mật U18).
  nguoiThucHien: text("nguoi_thuc_hien").notNull(),
  // Ghi CŨ → MỚI, không chỉ tên trường (QĐ-6). Vẫn qua maskSensitive phòng thủ.
  chiTiet: jsonb("chi_tiet"),
  taoLuc: timestamp("tao_luc", { withTimezone: true }).notNull().defaultNow(),
});
```

Sửa `packages/db/src/schema/index.ts` — bảo đảm có đủ:

```ts
export * from "./auditLogAdmin";
export * from "./cauHinhHeThong";
export * from "./goiDichVu";
```

- [ ] **Step 4: Nối tiếp migration**

Nối vào cuối `packages/db/migrations/0007_dang_ky_va_goi_dich_vu.sql` (nhớ thêm `--> statement-breakpoint` sau câu `GRANT` của Task 2):

```sql
--> statement-breakpoint

-- ── cau_hinh_he_thong (QĐ-5 hạng B) ────────────────────────────────────────────
-- Cùng thứ tự có chủ ý: CREATE → seed → ENABLE → FORCE → POLICY → GRANT.
CREATE TABLE IF NOT EXISTS "cau_hinh_he_thong" (
  "khoa" text PRIMARY KEY,
  "gia_tri" text NOT NULL,
  "mo_ta" text,
  "cap_nhat_luc" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint

-- Ngưỡng đăng ký/IP: sửa được từ bảng điều khiển nhưng KẸP BIÊN 1..50/giờ trong mã
-- (configClamp.ts) — đây là cơ chế chống spam, không phải hạn mức thương mại.
INSERT INTO "cau_hinh_he_thong" ("khoa", "gia_tri", "mo_ta")
VALUES ('dangky_max_moi_ip_gio', '5', 'Số lượt đăng ký tối đa mỗi IP mỗi giờ (kẹp 1..50)')
ON CONFLICT ("khoa") DO NOTHING;--> statement-breakpoint

ALTER TABLE "cau_hinh_he_thong" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cau_hinh_he_thong" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "cau_hinh_doc_moi_nguoi" ON "cau_hinh_he_thong";--> statement-breakpoint
CREATE POLICY "cau_hinh_doc_moi_nguoi" ON "cau_hinh_he_thong" FOR SELECT USING (true);--> statement-breakpoint
GRANT SELECT ON "cau_hinh_he_thong" TO PUBLIC;--> statement-breakpoint

-- ── audit_log_admin (QĐ-6) ─────────────────────────────────────────────────────
-- KHÔNG bật RLS chặn ghi ở đây: khác hai bảng trên, bảng này PHẢI ghi được (U18 ghi vào).
-- Bất biến bảo đảm bằng TRIGGER append-only — đúng mẫu 0002, vốn chọn trigger thay REVOKE
-- vì REVOKE phụ thuộc tên role provider-specific và KHÔNG chi phối table owner.
CREATE TABLE IF NOT EXISTS "audit_log_admin" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "hanh_dong" text NOT NULL,
  "doi_tuong" text,
  "nguoi_thuc_hien" text NOT NULL,
  "chi_tiet" jsonb,
  "tao_luc" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE OR REPLACE FUNCTION audit_log_admin_no_mutate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log_admin là append-only: không được % (security.md)', TG_OP;
END;
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_log_admin_immutable ON "audit_log_admin";--> statement-breakpoint
CREATE TRIGGER audit_log_admin_immutable
BEFORE UPDATE OR DELETE ON "audit_log_admin"
FOR EACH ROW
EXECUTE FUNCTION audit_log_admin_no_mutate();--> statement-breakpoint
-- TRUNCATE là lệnh CẤP CÂU LỆNH → trigger row-level ở trên KHÔNG kích hoạt (bài học
-- security-reviewer 2026-07-14 ở 0002).
DROP TRIGGER IF EXISTS audit_log_admin_no_truncate ON "audit_log_admin";--> statement-breakpoint
CREATE TRIGGER audit_log_admin_no_truncate
BEFORE TRUNCATE ON "audit_log_admin"
FOR EACH STATEMENT
EXECUTE FUNCTION audit_log_admin_no_mutate();--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON "audit_log_admin" FROM PUBLIC;--> statement-breakpoint
GRANT SELECT, INSERT ON "audit_log_admin" TO PUBLIC;
```

- [ ] **Step 5: Chạy test, xác nhận XANH**

```bash
npx vitest run packages/db/test/integration/goiDichVu.test.ts
```

Kỳ vọng: PASS, 10 test.

- [ ] **Step 6: Toàn bộ test + lint**

```bash
make test && make lint
```

Kỳ vọng: toàn xanh, lint sạch.

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/schema/cauHinhHeThong.ts packages/db/src/schema/auditLogAdmin.ts \
        packages/db/src/schema/index.ts packages/db/migrations/0007_dang_ky_va_goi_dich_vu.sql \
        packages/db/test/integration/goiDichVu.test.ts
git commit -m "$(cat <<'EOF'
U17a-3: bảng cau_hinh_he_thong + audit_log_admin

cau_hinh_he_thong giữ ngưỡng TOÀN CỤC (đăng ký/IP xảy ra khi chưa có tenant
nào nên không thể sống trong bảng có tenant_id). gia_tri là text có chủ ý để
tái dùng nguyên các resolveXxxConfig đã test, chỉ đổi nguồn nạp.

audit_log_admin gỡ hard stop QĐ-6: audit_log của khách có tenant_id NOT NULL
+ FK cascade + RLS for:all + trigger append-only, ba lớp cùng chặn nên thay
đổi cấu hình TOÀN CỤC không có chỗ ghi hợp lệ, trong khi security.md:21 bắt
buộc audit. Tách bảng thay vì sửa audit_log đang chạy production.

Bất biến dùng TRIGGER không dùng REVOKE — đúng lý do 0002 đã ghi: REVOKE phụ
thuộc tên role provider-specific và không chi phối table owner.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Backfill `tenants.goi_dich_vu` về mã + FK

**Đây là task rủi ro nhất của U17a.** Xem "Cạm bẫy 2" ở đầu tài liệu: backfill có thể âm thầm không đổi hàng nào.

**Files:**
- Modify: `packages/db/migrations/0007_dang_ky_va_goi_dich_vu.sql` (nối tiếp)
- Modify: `packages/db/src/schema/tenants.ts`
- Test: `packages/db/test/integration/goiDichVu.test.ts` (thêm describe)

**Interfaces:**
- Consumes: bảng `goiDichVu` + seed `free` (Task 2)
- Produces: `tenants.goiDichVu` tham chiếu `goiDichVu.ma`, mặc định `'free'`, không còn NULL

- [ ] **Step 1: Viết test đỏ**

Thêm import vào đầu `packages/db/test/integration/goiDichVu.test.ts` (test dưới đây áp từng file migration nên cần đọc thư mục):

```ts
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
```

Rồi thêm vào cuối file:

```ts
describe("U17a — backfill tenants.goi_dich_vu (QĐ-7)", () => {
  it("KHẲNG ĐỊNH migration 0007 thật sự backfill hàng cũ, không âm thầm 0 hàng", async () => {
    // CẠM BẪY: tenants bật FORCE RLS (0000:128) với policy id = current_setting
    // ('app.tenant_id'). Lúc migrate, GUC đó KHÔNG được đặt → id = NULL → 0 hàng khớp →
    // UPDATE không đổi gì mà KHÔNG báo lỗi. Nó chỉ chạy được nhờ role migrate tình cờ có
    // BYPASSRLS (Neon neondb_owner) hoặc superuser (PGlite) — giả định phụ thuộc môi
    // trường. Test này tồn tại để nó không lọt im lặng.
    //
    // PHẢI áp từng migration THEO THỨ TỰ: 0000→0006, chèn tenant mang NHÃN cũ, RỒI mới áp
    // 0007. Gọi migrate() một lần (áp cả 0007) rồi chạy lại câu UPDATE bằng tay sẽ chứng
    // minh SAI THỨ: nó chỉ cho thấy "một câu tương đương chạy được", không cho thấy câu
    // TRONG 0007 đã đổi hàng thật.
    const client = new PGlite();
    const db = drizzle(client, { schema });

    const thuMuc = MIGRATIONS;
    const cacFile = (await readdir(thuMuc))
      .filter((f) => f.endsWith(".sql"))
      .sort(); // 0000_… → 0007_… theo thứ tự tên file

    async function apFile(ten: string): Promise<void> {
      const noiDung = await readFile(join(thuMuc, ten), "utf8");
      // drizzle phân tách câu bằng dấu mốc này; áp từng câu để giữ đúng thứ tự.
      for (const cau of noiDung.split("--> statement-breakpoint")) {
        const s = cau.trim();
        if (s) await db.execute(sql.raw(s));
      }
    }

    const truoc0007 = cacFile.filter((f) => !f.startsWith("0007"));
    const file0007 = cacFile.find((f) => f.startsWith("0007"));
    if (!file0007) throw new Error("không tìm thấy migration 0007");

    for (const f of truoc0007) await apFile(f);

    // Dữ liệu CŨ đúng như production: cột giữ NHÃN, chưa có bảng gói nên chưa có FK.
    await db.execute(
      sql`insert into tenants (ten, mst, goi_dich_vu) values ('Cty Cũ', '0100000099', 'Miễn phí')`,
    );

    // Áp 0007 — chính nó phải backfill.
    await apFile(file0007);

    // Không còn hàng nào mang nhãn cũ, và hàng đó nay trỏ đúng mã 'free'.
    const conNhan = (await db.execute(
      sql`select count(*)::int as n from tenants where goi_dich_vu = 'Miễn phí'`,
    )) as { rows: Array<{ n: number }> };
    expect(conNhan.rows[0]?.n).toBe(0);

    const hang = (await db.execute(
      sql`select goi_dich_vu from tenants where mst = '0100000099'`,
    )) as { rows: Array<{ goi_dich_vu: string }> };
    expect(hang.rows[0]?.goi_dich_vu).toBe("free");

    // Bất biến tổng: không tenant nào trỏ tới gói không tồn tại (chính là lệnh kiểm tay
    // bắt buộc sau `make migrate` trên production).
    const mocoi = (await db.execute(
      sql`select count(*)::int as n from tenants
          where goi_dich_vu not in (select ma from goi_dich_vu)`,
    )) as { rows: Array<{ n: number }> };
    expect(mocoi.rows[0]?.n).toBe(0);
  });

  it("FK chặn gán gói không tồn tại", async () => {
    const db = await freshDb();
    await expect(
      db.execute(
        sql`insert into tenants (ten, mst, goi_dich_vu) values ('Cty B', '0100000098', 'khong_co')`,
      ),
    ).rejects.toThrow();
  });

  it("tenant tạo mới không khai gói → mặc định 'free'", async () => {
    const db = await freshDb();
    await db.execute(sql`insert into tenants (ten, mst) values ('Cty C', '0100000097')`);
    const res = (await db.execute(
      sql`select goi_dich_vu from tenants where mst = '0100000097'`,
    )) as { rows: Array<{ goi_dich_vu: string }> };
    expect(res.rows[0]?.goi_dich_vu).toBe("free");
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận ĐỎ**

```bash
npx vitest run packages/db/test/integration/goiDichVu.test.ts
```

Kỳ vọng: 3 test mới FAIL — chưa có FK nên "FK chặn gói không tồn tại" không ném; mặc định chưa phải `'free'`.

- [ ] **Step 3: Nối migration**

Nối vào cuối `packages/db/migrations/0007_dang_ky_va_goi_dich_vu.sql`:

```sql
--> statement-breakpoint

-- ── Backfill + FK tenants.goi_dich_vu (QĐ-7) ───────────────────────────────────
-- Cột này đang chứa NHÃN, không phải mã: bằng chứng me.route.test.ts:38 dùng
-- goiDichVu: "Miễn phí". Thêm FK mà không backfill trước sẽ vỡ trên dữ liệu thật.
--
-- ⚠️ CẢNH BÁO VẬN HÀNH: tenants bật FORCE RLS (0000:128) với policy
--    id = nullif(current_setting('app.tenant_id', true), '')::uuid
-- Lúc chạy migration, GUC `app.tenant_id` KHÔNG được đặt → id = NULL → 0 hàng khớp →
-- câu UPDATE dưới đây đổi 0 hàng mà KHÔNG báo lỗi. Nó chỉ chạy được vì role migrate có
-- BYPASSRLS (Neon `neondb_owner` — xem chú thích 0001) hoặc là superuser.
-- ⇒ SAU KHI `make migrate` TRÊN PRODUCTION, PHẢI KIỂM BẰNG TAY:
--      SELECT count(*) FROM tenants WHERE goi_dich_vu NOT IN (SELECT ma FROM goi_dich_vu);
--    Kết quả phải = 0. Khác 0 nghĩa là backfill bị RLS nuốt — DỪNG, không deploy apps/api.
UPDATE "tenants" SET "goi_dich_vu" = 'free'
WHERE "goi_dich_vu" IS NULL
   OR "goi_dich_vu" NOT IN (SELECT "ma" FROM "goi_dich_vu");--> statement-breakpoint

ALTER TABLE "tenants" ALTER COLUMN "goi_dich_vu" SET DEFAULT 'free';--> statement-breakpoint
ALTER TABLE "tenants" ALTER COLUMN "goi_dich_vu" SET NOT NULL;--> statement-breakpoint

-- ON DELETE RESTRICT: không cho xóa gói khi còn tenant đang dùng.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_constraint WHERE conname = 'tenants_goi_dich_vu_fk'
  ) THEN
    ALTER TABLE "tenants" ADD CONSTRAINT "tenants_goi_dich_vu_fk"
      FOREIGN KEY ("goi_dich_vu") REFERENCES "goi_dich_vu"("ma") ON DELETE RESTRICT;
  END IF;
END $$;
```

- [ ] **Step 4: Cập nhật lược đồ Drizzle**

Sửa `packages/db/src/schema/tenants.ts` — đổi dòng `goiDichVu`:

```ts
    goiDichVu: text("goi_dich_vu")
      .notNull()
      .default("free")
      .references(() => goiDichVu.ma, { onDelete: "restrict" }),
```

Thêm import ở đầu file:

```ts
import { goiDichVu } from "./goiDichVu";
```

- [ ] **Step 5: Chạy test, xác nhận XANH**

```bash
npx vitest run packages/db/test/integration/goiDichVu.test.ts
```

Kỳ vọng: PASS, 13 test.

- [ ] **Step 6: Toàn bộ test — chú ý hồi quy**

```bash
make test
```

Kỳ vọng: toàn xanh. **Nếu `me.route.test.ts` đỏ** vì test cũ chèn `goiDichVu: "Miễn phí"` (nay bị FK chặn), sửa test đó sang `goiDichVu: "free"` — đó là hồi quy dự kiến, không phải lỗi thiết kế. Nhãn tiếng Việt sẽ quay lại ở Task 7.

- [ ] **Step 7: Lint + commit**

```bash
make lint
git add packages/db/migrations/0007_dang_ky_va_goi_dich_vu.sql packages/db/src/schema/tenants.ts \
        packages/db/test/integration/goiDichVu.test.ts apps/api/test/integration/me.route.test.ts
git commit -m "$(cat <<'EOF'
U17a-4: backfill tenants.goi_dich_vu về mã + FK tới goi_dich_vu

Cột đang chứa NHÃN chứ không phải mã (me.route.test.ts:38 dùng "Miễn phí"),
nên phải backfill trước khi thêm FK.

Kèm test KHẲNG ĐỊNH backfill thật sự đổi hàng: tenants bật FORCE RLS với
policy id = current_setting('app.tenant_id'), mà GUC đó không được đặt lúc
migrate → 0 hàng khớp → UPDATE âm thầm không làm gì. Nó chỉ chạy được nhờ
role migrate tình cờ có BYPASSRLS (Neon) hoặc superuser (PGlite) — giả định
phụ thuộc môi trường, không được tin. Migration ghi rõ lệnh kiểm tay sau khi
make migrate trên production.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `getGioiHanTkThue` đọc theo gói

**Files:**
- Create: `apps/api/src/goiDichVuConfig.ts`
- Modify: `apps/api/src/routes/taxAccounts.ts:50-58`
- Test: `apps/api/test/integration/goiDichVuConfig.test.ts`

> ### ⚠️ LỆCH SPEC CÓ CHỦ Ý — phải biết trước khi làm
>
> `U17-plan.md` §3.5 viết *"giữ nguyên chữ ký `getGioiHanTkThue(tenant)` để không vỡ call-site"*. **Plan này cố ý làm khác**: đổi sang `getGioiHanTkThue(hanMuc: HanMucGoi)`.
>
> **Lý do:** giữ chữ ký cũ `(tenant: { goiDichVu: string | null })` buộc hàm phải **tự đọc DB**, tức phải thành `async` — và thế thì chữ ký vẫn vỡ, chỉ vỡ theo kiểu khó thấy hơn (mọi call-site phải `await`). Tách phần đọc DB ra `docHanMucGoi` và để `getGioiHanTkThue` thuần lại **đúng hơn** cho test và cho việc đọc một lần dùng nhiều chỗ trong cùng transaction.
>
> **Hệ quả bắt buộc xử:** `apps/api/test/unit/taxAccountRules.test.ts` (dòng 4-16) đang gọi trực tiếp `getGioiHanTkThue({ goiDichVu: null })` và khẳng định `SUB_ACCOUNT_MODULE_ENABLED === false`. **Hai test này sẽ đỏ và phải sửa trong Task này**, không được để sang task sau.

**Interfaces:**
- Consumes: `clampInt` (Task 1); bảng `goiDichVu` (Task 2); FK `tenants.goiDichVu` (Task 4)
- Produces:
  - `interface HanMucGoi { soMstToiDa: number; soHoaDonThang: number | null; choTaiKhoanCon: boolean; ghInvoicesMoiPhut: number; ghExportsMoiPhut: number; ghReconcileMoiPhut: number }`
  - `const HAN_MUC_MAC_DINH: HanMucGoi`
  - `docHanMucGoi(db: AnyDb, maGoi: string): Promise<HanMucGoi>`

- [ ] **Step 1: Viết test đỏ**

Tạo `apps/api/test/integration/goiDichVuConfig.test.ts`:

```ts
// U17a — Đọc hạn mức theo GÓI thay hardcode. Fail-safe-to-DEFAULT: DB hỏng/thiếu hàng →
// rơi về hằng trong mã, KHÔNG fail-open (không mở toang hạn mức) và KHÔNG fail-closed
// (không khóa sạch khách). Đây là hạng thứ ba mã trước đây chưa có.
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { HAN_MUC_MAC_DINH, docHanMucGoi } from "../../src/goiDichVuConfig";
import { type Db, freshDb } from "../helpers";

describe("U17a — docHanMucGoi", () => {
  let db: Db;
  beforeEach(async () => {
    db = await freshDb();
  });

  it("gói free → hạn mức từ bảng, KHÔNG hardcode", async () => {
    const h = await docHanMucGoi(db, "free");
    expect(h.soMstToiDa).toBe(1);
    expect(h.choTaiKhoanCon).toBe(false);
    expect(h.ghInvoicesMoiPhut).toBe(120);
  });

  it("Admin đổi ngưỡng trong bảng → hạn mức đổi theo, KHÔNG cần deploy lại", async () => {
    await db.execute(
      sql`update goi_dich_vu set so_mst_toi_da = 5, gh_invoices_moi_phut = 300 where ma = 'free'`,
    );
    const h = await docHanMucGoi(db, "free");
    expect(h.soMstToiDa).toBe(5);
    expect(h.ghInvoicesMoiPhut).toBe(300);
  });

  it("giá trị phi lý trong DB → KẸP BIÊN, không khóa sạch khách", async () => {
    await db.execute(sql`update goi_dich_vu set so_mst_toi_da = 0 where ma = 'free'`);
    const h = await docHanMucGoi(db, "free");
    expect(h.soMstToiDa).toBeGreaterThanOrEqual(1);
  });

  it("giá trị phi lý lớn → KẸP BIÊN, không vô hiệu hóa chống lạm dụng", async () => {
    await db.execute(sql`update goi_dich_vu set gh_invoices_moi_phut = 9999999 where ma = 'free'`);
    const h = await docHanMucGoi(db, "free");
    expect(h.ghInvoicesMoiPhut).toBeLessThanOrEqual(10_000);
  });

  it("gói không tồn tại → rơi về mặc định trong mã (fail-safe-to-DEFAULT)", async () => {
    const h = await docHanMucGoi(db, "goi_khong_co");
    expect(h).toEqual(HAN_MUC_MAC_DINH);
  });

  it("DB hỏng (bảng bị xóa) → rơi về mặc định, KHÔNG ném ra ngoài", async () => {
    await db.execute(sql`drop table goi_dich_vu cascade`);
    const h = await docHanMucGoi(db, "free");
    expect(h).toEqual(HAN_MUC_MAC_DINH);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận ĐỎ**

```bash
npx vitest run apps/api/test/integration/goiDichVuConfig.test.ts
```

Kỳ vọng: FAIL — `Failed to resolve import "../../src/goiDichVuConfig"`.

- [ ] **Step 3: Hiện thực**

Tạo `apps/api/src/goiDichVuConfig.ts`:

```ts
// U17a (QĐ-5 hạng A) — Đọc hạn mức theo GÓI DỊCH VỤ, thay hardcode. Admin sửa hàng
// goi_dich_vu ở U18 là áp cho toàn bộ tenant dùng gói đó, không cần deploy.
//
// FAIL-SAFE-TO-DEFAULT: DB hỏng / gói không tồn tại → rơi về hằng trong mã. KHÔNG
// fail-open (mở toang hạn mức cho khách chưa trả tiền) và KHÔNG fail-closed (khóa sạch
// khách vì sự cố DB của mình). Mọi lần rơi về mặc định đều phát log có cấu trúc để phân
// biệt "admin đặt vậy" với "DB hỏng".
import { goiDichVu } from "@vat/db";
import { eq } from "drizzle-orm";
import { clampInt } from "./configClamp";
import type { AnyDb } from "./types";

export interface HanMucGoi {
  soMstToiDa: number;
  soHoaDonThang: number | null;
  choTaiKhoanCon: boolean;
  ghInvoicesMoiPhut: number;
  ghExportsMoiPhut: number;
  ghReconcileMoiPhut: number;
}

/** Mặc định bảo thủ = đúng gói `free`. Dùng khi không đọc được DB. */
export const HAN_MUC_MAC_DINH: HanMucGoi = {
  soMstToiDa: 1,
  soHoaDonThang: null,
  choTaiKhoanCon: false,
  ghInvoicesMoiPhut: 120,
  ghExportsMoiPhut: 20,
  ghReconcileMoiPhut: 20,
};

// Biên cứng cho giá trị đến từ DB. CHƯA KIỂM CHỨNG bằng số thật của tenant production —
// đặt rộng rãi, chỉ để chặn giá trị phi lý (0 khóa sạch khách; 9 chữ số vô hiệu hóa
// chống lạm dụng). Siết lại sau khi đo (U17-plan §3.6).
const BIEN = {
  soMstToiDa: { min: 1, max: 1_000 },
  ghMoiPhut: { min: 1, max: 10_000 },
} as const;

export async function docHanMucGoi(db: AnyDb, maGoi: string): Promise<HanMucGoi> {
  try {
    const rows = await db
      .select({
        soMstToiDa: goiDichVu.soMstToiDa,
        soHoaDonThang: goiDichVu.soHoaDonThang,
        choTaiKhoanCon: goiDichVu.choTaiKhoanCon,
        ghInvoicesMoiPhut: goiDichVu.ghInvoicesMoiPhut,
        ghExportsMoiPhut: goiDichVu.ghExportsMoiPhut,
        ghReconcileMoiPhut: goiDichVu.ghReconcileMoiPhut,
      })
      .from(goiDichVu)
      .where(eq(goiDichVu.ma, maGoi));

    const row = rows[0];
    if (!row) {
      console.warn(JSON.stringify({ type: "goi_dich_vu_khong_thay", ma: maGoi }));
      return HAN_MUC_MAC_DINH;
    }

    return {
      soMstToiDa: clampInt(
        row.soMstToiDa,
        BIEN.soMstToiDa.min,
        BIEN.soMstToiDa.max,
        HAN_MUC_MAC_DINH.soMstToiDa,
      ),
      // NULL = không giới hạn — giữ nguyên, không kẹp.
      soHoaDonThang: row.soHoaDonThang,
      choTaiKhoanCon: row.choTaiKhoanCon,
      ghInvoicesMoiPhut: clampInt(
        row.ghInvoicesMoiPhut,
        BIEN.ghMoiPhut.min,
        BIEN.ghMoiPhut.max,
        HAN_MUC_MAC_DINH.ghInvoicesMoiPhut,
      ),
      ghExportsMoiPhut: clampInt(
        row.ghExportsMoiPhut,
        BIEN.ghMoiPhut.min,
        BIEN.ghMoiPhut.max,
        HAN_MUC_MAC_DINH.ghExportsMoiPhut,
      ),
      ghReconcileMoiPhut: clampInt(
        row.ghReconcileMoiPhut,
        BIEN.ghMoiPhut.min,
        BIEN.ghMoiPhut.max,
        HAN_MUC_MAC_DINH.ghReconcileMoiPhut,
      ),
    };
  } catch {
    // DB hỏng KHÔNG được làm hỏng luồng khách. Log rồi dùng mặc định.
    console.warn(JSON.stringify({ type: "goi_dich_vu_doc_loi", ma: maGoi }));
    return HAN_MUC_MAC_DINH;
  }
}
```

- [ ] **Step 4: Chạy test, xác nhận XANH**

```bash
npx vitest run apps/api/test/integration/goiDichVuConfig.test.ts
```

Kỳ vọng: PASS, 6 test.

- [ ] **Step 5: Nối vào `taxAccounts.ts`**

Sửa `apps/api/src/routes/taxAccounts.ts` — thay hai khối ở dòng 50-58:

```ts
// U17a — Hạn mức số tài khoản thuế / tenant, ĐỌC THEO GÓI DỊCH VỤ (thay hardcode cũ).
// Giữ nguyên CHỮ KÝ đồng bộ để không vỡ call-site; hạn mức đã được `docHanMucGoi` đọc
// và kẹp biên từ trước, hàm này chỉ lấy ra.
export function getGioiHanTkThue(hanMuc: HanMucGoi): number {
  return hanMuc.soMstToiDa;
}

// U17a — Cờ module tài khoản con nay theo GÓI (thay hằng TẮT cứng). Gói `free` để false.
export function isSubAccountEnabled(hanMuc: HanMucGoi): boolean {
  return hanMuc.choTaiKhoanCon;
}
```

Thêm import:

```ts
import { type HanMucGoi, docHanMucGoi } from "../goiDichVuConfig";
```

Trong handler `POST /tax-accounts`, trước khi đếm hạn mức (quanh dòng 127), đọc gói của tenant trong cùng transaction rồi truyền xuống:

```ts
        const hanMuc = await docHanMucGoi(tx, tenant.goiDichVu);
        if (loai === "con" && !isSubAccountEnabled(hanMuc)) {
          return { kind: "sub_disabled" as const };
        }
        // Hạn mức theo gói — đếm tài khoản thuế hiện có của tenant.
        const cnt = await tx
          .select({ n: count() })
          .from(taiKhoanThue)
          .where(eq(taiKhoanThue.tenantId, tenantId));
        if (Number(cnt[0]?.n ?? 0) >= getGioiHanTkThue(hanMuc)) {
          return { kind: "limit_reached" as const };
        }
```

**Xóa hằng `SUB_ACCOUNT_MODULE_ENABLED`.** Lưu ý chỗ dùng ở `taxAccounts.ts:101` nằm **ngoài** transaction, trước khi có `hanMuc`:

```ts
    if (loai === "con" && !SUB_ACCOUNT_MODULE_ENABLED) {
```

Không thay tại chỗ được — **xóa hẳn khối kiểm sớm này** và để việc kiểm diễn ra bên trong transaction (đã có ở đoạn trên, nhánh `sub_disabled`). Kiểm tra nhánh `sub_disabled` đã được ánh xạ sang mã lỗi HTTP đúng trong khối `switch (outcome.kind)`; nếu chưa, thêm case trả cùng mã lỗi mà khối kiểm sớm cũ đang trả.

- [ ] **Step 5b: Sửa test đơn vị đang khẳng định hành vi cũ**

`apps/api/test/unit/taxAccountRules.test.ts` dòng 4-16 sẽ đỏ. Thay hai test đó bằng:

```ts
import { getGioiHanTkThue, isSubAccountEnabled } from "../../src/routes/taxAccounts";
import { HAN_MUC_MAC_DINH } from "../../src/goiDichVuConfig";

  it("getGioiHanTkThue lấy hạn mức từ GÓI, không còn hardcode (U17a)", () => {
    expect(getGioiHanTkThue(HAN_MUC_MAC_DINH)).toBe(1);
    expect(getGioiHanTkThue({ ...HAN_MUC_MAC_DINH, soMstToiDa: 5 })).toBe(5);
  });

  it("module tài khoản con theo GÓI; gói free = tắt", () => {
    expect(isSubAccountEnabled(HAN_MUC_MAC_DINH)).toBe(false);
    expect(isSubAccountEnabled({ ...HAN_MUC_MAC_DINH, choTaiKhoanCon: true })).toBe(true);
  });
```

> **Nợ TOCTOU giữ nguyên** (`task_230e0541`): đếm-rồi-insert vẫn chưa khóa. Hiện an toàn cho tài khoản chính vì đều dùng `mst` → `UNIQUE(tenant_id, username)` chặn. Khi bật tài khoản con phải thêm `SELECT … FOR UPDATE`. **Không xử trong U17a** — ngoài phạm vi, và chỉ thành rủi ro khi gói cho phép tài khoản con.

- [ ] **Step 6: Toàn bộ test + lint**

```bash
make test && make lint
```

Kỳ vọng: toàn xanh. Test `taxAccounts` cũ phải còn xanh — gói `free` cho `soMstToiDa = 1`, đúng giá trị hardcode cũ.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/goiDichVuConfig.ts apps/api/src/routes/taxAccounts.ts \
        apps/api/test/integration/goiDichVuConfig.test.ts
git commit -m "$(cat <<'EOF'
U17a-5: hạn mức tài khoản thuế đọc theo gói, bỏ hardcode

Thay `return 1` ở getGioiHanTkThue (TODO U17 có sẵn từ U23) bằng đọc từ bảng
goi_dich_vu. Cờ SUB_ACCOUNT_MODULE_ENABLED cũng chuyển sang lấy theo gói.
Gói free giữ nguyên hạn mức 1 nên không hồi quy hành vi hiện tại.

Fail-safe-to-DEFAULT: DB hỏng hoặc gói không tồn tại thì rơi về hằng trong
mã, không fail-open (mở toang hạn mức) và không fail-closed (khóa sạch khách
vì sự cố DB của mình). Giá trị từ DB đều qua clampInt.

Nợ TOCTOU (task_230e0541) giữ nguyên: chỉ thành rủi ro khi gói cho phép tài
khoản con, xử khi tới đó.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Phân giải ngưỡng toàn cục DB → env → `DEFAULT_*`

**Files:**
- Modify: `apps/api/src/goiDichVuConfig.ts` (thêm hàm)
- Test: `apps/api/test/integration/goiDichVuConfig.test.ts` (thêm describe)

**Interfaces:**
- Consumes: `clampInt` (Task 1); bảng `cauHinhHeThong` (Task 3)
- Produces: `docCauHinhToanCuc(db: AnyDb, khoa: string, env: Record<string, string | undefined>, envKey: string, bien: { min: number; max: number }, macDinh: number): Promise<number>`

- [ ] **Step 1: Viết test đỏ**

Thêm vào `apps/api/test/integration/goiDichVuConfig.test.ts`:

```ts
describe("U17a — docCauHinhToanCuc (thứ tự DB → env → DEFAULT)", () => {
  let db: Db;
  const BIEN = { min: 1, max: 50 };
  beforeEach(async () => {
    db = await freshDb();
  });

  it("có trong DB → dùng giá trị DB (Admin thắng env)", async () => {
    await db.execute(
      sql`update cau_hinh_he_thong set gia_tri = '12' where khoa = 'dangky_max_moi_ip_gio'`,
    );
    const n = await docCauHinhToanCuc(
      db, "dangky_max_moi_ip_gio", { DANGKY_MAX_MOI_IP_GIO: "7" },
      "DANGKY_MAX_MOI_IP_GIO", BIEN, 5,
    );
    expect(n).toBe(12);
  });

  it("không có trong DB → rơi xuống env", async () => {
    await db.execute(sql`delete from cau_hinh_he_thong where khoa = 'dangky_max_moi_ip_gio'`);
    const n = await docCauHinhToanCuc(
      db, "dangky_max_moi_ip_gio", { DANGKY_MAX_MOI_IP_GIO: "7" },
      "DANGKY_MAX_MOI_IP_GIO", BIEN, 5,
    );
    expect(n).toBe(7);
  });

  it("không DB, không env → DEFAULT trong mã", async () => {
    await db.execute(sql`delete from cau_hinh_he_thong where khoa = 'dangky_max_moi_ip_gio'`);
    const n = await docCauHinhToanCuc(db, "dangky_max_moi_ip_gio", {}, "DANGKY_MAX_MOI_IP_GIO", BIEN, 5);
    expect(n).toBe(5);
  });

  it("giá trị DB ngoài biên → KẸP, không để admin tắt chống spam", async () => {
    await db.execute(
      sql`update cau_hinh_he_thong set gia_tri = '99999' where khoa = 'dangky_max_moi_ip_gio'`,
    );
    const n = await docCauHinhToanCuc(db, "dangky_max_moi_ip_gio", {}, "DANGKY_MAX_MOI_IP_GIO", BIEN, 5);
    expect(n).toBe(50);
  });

  it("DB hỏng → DEFAULT, không ném (fail-safe-to-DEFAULT)", async () => {
    await db.execute(sql`drop table cau_hinh_he_thong cascade`);
    const n = await docCauHinhToanCuc(db, "dangky_max_moi_ip_gio", {}, "DANGKY_MAX_MOI_IP_GIO", BIEN, 5);
    expect(n).toBe(5);
  });
});
```

Cập nhật dòng import ở đầu file test:

```ts
import { HAN_MUC_MAC_DINH, docCauHinhToanCuc, docHanMucGoi } from "../../src/goiDichVuConfig";
```

- [ ] **Step 2: Chạy test, xác nhận ĐỎ**

```bash
npx vitest run apps/api/test/integration/goiDichVuConfig.test.ts
```

Kỳ vọng: 6 test cũ PASS, 5 test mới FAIL — `docCauHinhToanCuc is not a function`.

- [ ] **Step 3: Hiện thực**

Nối vào cuối `apps/api/src/goiDichVuConfig.ts`:

```ts
import { cauHinhHeThong } from "@vat/db";

/**
 * U17a (QĐ-5 hạng B) — Phân giải một ngưỡng TOÀN CỤC theo thứ tự DB → env → DEFAULT.
 *
 * Vì sao giữ tầng env ở giữa: đó là đường thoát vận hành khi DB không đổi được (sự cố,
 * hoặc chưa có bảng điều khiển). Không phải dư thừa.
 *
 * Giá trị luôn qua clampInt: ngưỡng nay do người nhập, admin đặt 0 hoặc 9 chữ số đều
 * không được phép tắt cơ chế chống lạm dụng.
 */
export async function docCauHinhToanCuc(
  db: AnyDb,
  khoa: string,
  env: Record<string, string | undefined>,
  envKey: string,
  bien: { min: number; max: number },
  macDinh: number,
): Promise<number> {
  let thoDb: string | undefined;
  try {
    const rows = await db
      .select({ giaTri: cauHinhHeThong.giaTri })
      .from(cauHinhHeThong)
      .where(eq(cauHinhHeThong.khoa, khoa));
    thoDb = rows[0]?.giaTri;
  } catch {
    console.warn(JSON.stringify({ type: "cau_hinh_doc_loi", khoa }));
  }

  // Thứ tự ưu tiên; giá trị rỗng/không đọc được thì rơi xuống tầng sau.
  const tho = thoDb ?? env[envKey];
  return clampInt(tho, bien.min, bien.max, macDinh);
}
```

- [ ] **Step 4: Chạy test, xác nhận XANH**

```bash
npx vitest run apps/api/test/integration/goiDichVuConfig.test.ts
```

Kỳ vọng: PASS, 11 test.

- [ ] **Step 5: Lint + commit**

```bash
make test && make lint
git add apps/api/src/goiDichVuConfig.ts apps/api/test/integration/goiDichVuConfig.test.ts
git commit -m "$(cat <<'EOF'
U17a-6: phân giải ngưỡng toàn cục DB → env → DEFAULT

Tầng env giữ ở giữa có chủ ý: đường thoát vận hành khi DB không đổi được.
Giá trị luôn qua clampInt vì ngưỡng nay do người nhập — admin đặt 0 hoặc 9
chữ số đều không được phép tắt chống lạm dụng.

DB hỏng rơi về DEFAULT, không ném ra luồng khách.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Nhãn gói ở `GET /me` + `SettingsPage`

Sau Task 4, `tenants.goi_dich_vu` chứa **mã** (`free`) nên FE sẽ hiển thị `free` thay vì `Miễn phí`. Task này trả lại nhãn tiếng Việt, lấy từ `goi_dich_vu.ten` (QĐ-7).

**Files:**
- Modify: `apps/api/src/routes/me.ts:33-56`
- Modify: `apps/web/src/features/settings/SettingsPage.tsx:93`
- Test: `apps/api/test/integration/me.route.test.ts`

**Interfaces:**
- Consumes: bảng `goiDichVu` (Task 2); FK (Task 4)
- Produces: `GET /me` trả thêm trường `goiDichVuTen: string`

- [ ] **Step 1: Viết test đỏ**

Thêm vào `apps/api/test/integration/me.route.test.ts`:

```ts
  it("trả NHÃN gói tiếng Việt kèm mã (QĐ-7 — không để FE hiện 'free')", async () => {
    // Helper sẵn có trong file: seedTenantFull(db, ten, mst, goiDichVu) — tham số cuối
    // nay phải là MÃ ('free'), không phải nhãn, vì FK (Task 4) chặn giá trị không có
    // trong bảng gói.
    const tid = await seedTenantFull(db, "Cty A", "0100000001", "free");
    const token = await makeToken(tid, "ke_toan");
    const res = await app.request("/me", { headers: { authorization: `Bearer ${token}` } }, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { goiDichVu: string; goiDichVuTen: string };
    expect(body.goiDichVu).toBe("free");
    expect(body.goiDichVuTen).toBe("Miễn phí");
  });
```

> Dùng đúng cách dựng `app`/`env`/token mà các test khác trong chính file này đang dùng — không phát minh helper mới.

**Đồng thời sửa test cũ ở dòng 29-38** đang truyền nhãn `"Miễn phí"` vào `seedTenantFull`: đổi sang `"free"`, và khẳng định `goiDichVu === "free"`. FK (Task 4) khiến giá trị nhãn không còn chèn được.

- [ ] **Step 2: Chạy test, xác nhận ĐỎ**

```bash
npx vitest run apps/api/test/integration/me.route.test.ts
```

Kỳ vọng: FAIL — `expected undefined to be 'Miễn phí'`.

- [ ] **Step 3: Sửa `GET /me`**

Trong `apps/api/src/routes/me.ts`, thêm import:

```ts
import { auditLog, goiDichVu, tenants, withTenant } from "@vat/db";
```

Đổi truy vấn trong handler `r.get("/")` thành join trái sang bảng gói:

```ts
        const rows = await tx
          .select({
            ten: tenants.ten,
            mst: tenants.mst,
            goiDichVu: tenants.goiDichVu,
            // U17a (QĐ-7) — cột `goi_dich_vu` nay giữ MÃ ('free'); nhãn tiếng Việt lấy từ
            // bảng gói để đổi tên gói chỉ sửa một chỗ. leftJoin: gói bị xóa không làm
            // hỏng /me (FK RESTRICT khiến ca này gần như không xảy ra, nhưng /me là
            // đường tải trang — không đánh đổi).
            goiDichVuTen: goiDichVu.ten,
            banQuyen: tenants.banQuyen,
            ghiChu: tenants.ghiChu,
          })
          .from(tenants)
          .leftJoin(goiDichVu, eq(tenants.goiDichVu, goiDichVu.ma))
          .where(eq(tenants.id, tenantId));
```

Và phần trả về:

```ts
      return c.json({
        ten: row.ten,
        mst: row.mst,
        goiDichVu: row.goiDichVu,
        goiDichVuTen: row.goiDichVuTen ?? row.goiDichVu,
        banQuyen: row.banQuyen,
        ghiChu: row.ghiChu,
        role,
      });
```

- [ ] **Step 4: Chạy test, xác nhận XANH**

```bash
npx vitest run apps/api/test/integration/me.route.test.ts
```

Kỳ vọng: PASS.

- [ ] **Step 5: Sửa FE**

Trong `apps/web/src/features/settings/SettingsPage.tsx`, đổi dòng 93:

```tsx
{me.goiDichVuTen ?? me.goiDichVu ?? "—"}
```

Bổ sung trường vào kiểu phản hồi `/me` tại `apps/web/src/types/api.ts:158` (ngay dưới `goiDichVu`):

```ts
  goiDichVu: string | null;
  // U17a (QĐ-7) — nhãn tiếng Việt của gói; `goiDichVu` nay là MÃ ('free').
  goiDichVuTen: string | null;
```

- [ ] **Step 6: Toàn bộ test + lint**

```bash
make test && make lint
```

Kỳ vọng: toàn xanh, lint sạch.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/me.ts apps/api/test/integration/me.route.test.ts \
        apps/web/src/features/settings/SettingsPage.tsx
git commit -m "$(cat <<'EOF'
U17a-7: GET /me trả nhãn gói, FE hiển thị nhãn thay mã

Sau khi backfill cột goi_dich_vu sang mã ('free'), FE sẽ hiện 'free' thay vì
'Miễn phí'. Lấy nhãn từ goi_dich_vu.ten để đổi tên gói chỉ sửa một chỗ.

leftJoin có chủ ý: /me là đường tải trang, gói thiếu không được làm hỏng nó
(FK RESTRICT khiến ca này gần như không xảy ra, nhưng không đánh đổi).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Cổng hoàn thành U17a

- [ ] **Step 1: Toàn bộ cổng chất lượng**

```bash
cd /Users/tuanbao/Documents/Projects/vat-u17
make lint && make test
```

Kỳ vọng: cả hai sạch/xanh.

- [ ] **Step 2: Kiểm coverage không tụt**

```bash
npm run test -- --coverage
```

Kỳ vọng: tầng nghiệp vụ ≥ 80%. `configClamp.ts` và `goiDichVuConfig.ts` phải gần 100% (đều là logic thuần/gần thuần đã có test riêng).

- [ ] **Step 3: Kiểm migration áp sạch từ DB trống**

```bash
npx vitest run packages/db/test/integration/
```

Kỳ vọng: toàn xanh — chứng minh `0007` áp được lên DB sạch cùng `0000`–`0006`.

- [ ] **Step 4: Review chéo bảo mật**

Chạy subagent `security-reviewer` với phạm vi: 3 bảng toàn cục mới + RLS/GRANT làm tay + backfill dưới FORCE RLS + đường đọc cấu hình. Đây là bắt buộc theo `docs/plans/U17-plan.md` §6 vì U17a chạm cách ly dữ liệu.

- [ ] **Step 5: Cập nhật tài liệu tiến độ**

Thêm mục U17a vào `docs/plans/U17-plan.md` §7 đánh dấu ĐÃ XONG, ghi lại: kết quả thật của việc backfill dưới FORCE RLS (cạm bẫy 2 — có bị RLS nuốt không), và `GRANT ... TO PUBLIC` có đủ trên Neon thật không.

- [ ] **Step 6: Commit tài liệu**

```bash
git add docs/plans/U17-plan.md
git commit -m "$(cat <<'EOF'
docs(U17a): đánh dấu hoàn thành + ghi kết quả kiểm chứng thật

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Ghi chú deploy (khi tới lượt — KHÔNG làm trong U17a)

Theo `docs/plans/U17-plan.md` §8 và `.claude/rules/deploy.md`:

1. **`make migrate` TRƯỚC**, deploy `apps/api` sau — mã đọc ràng buộc mới.
2. **Ngay sau `make migrate` trên production**, chạy tay:
   ```sql
   SELECT count(*) FROM tenants WHERE goi_dich_vu NOT IN (SELECT ma FROM goi_dich_vu);
   ```
   Phải `= 0`. Khác 0 ⇒ backfill bị FORCE RLS nuốt (cạm bẫy 2) ⇒ **DỪNG, không deploy `apps/api`**, vì FK sẽ chặn và `/me` sẽ hỏng.
3. Kiểm role app đọc được bảng mới:
   ```sql
   SET ROLE <role_app>; SELECT count(*) FROM goi_dich_vu; RESET ROLE;
   ```
   Lỗi `permission denied` ⇒ `GRANT` chưa đủ trên Neon ⇒ bổ sung vào `app-role.sql`.
4. Kiểm nhánh local **không chậm hơn origin** trước khi deploy (bài học sự cố 2026-07-16).

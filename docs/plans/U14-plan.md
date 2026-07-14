# U14 — Đường login GDT + ghi/đọc token (backend, API-only) · Kế hoạch thi công

> **For agentic workers:** REQUIRED SUB-SKILL: dùng superpowers:subagent-driven-development (khuyến nghị) hoặc superpowers:executing-plans để thi công từng task. Các bước dùng cú pháp checkbox (`- [ ]`).

**Goal:** Nối đường token thuế đầu-cuối — `getCaptcha → authenticate → storeToken(mã hóa)` qua 4 endpoint HTTP, và sửa đường đọc token nền để giải mã — để hệ thống có token mà đồng bộ hóa đơn thật.

**Architecture:** Thêm router `apps/api/src/routes/taxAccounts.ts` (4 endpoint dưới `/tax-accounts`, sau `requireTenant` + `requireRole('ke_toan_truong','quan_tri')`, trong `withTenant`). Mọi gọi GDT qua `@vat/gdt-client` (`getCaptcha`/`authenticate`) trên một `GdtTransport` tiêm qua `AppDeps` (production = `createDirectCfTransport()`, test = transport giả). Token mã hóa qua seam `@vat/db` `storeToken`/`readToken` (bọc `@vat/crypto`). Sửa `loadAccountToken` ở sync-worker để giải mã.

**Tech Stack:** TypeScript · Hono · Drizzle · Zod · Vitest (PGlite) · `@vat/gdt-client` · `@vat/crypto` · `@vat/db`.

## Global Constraints

- Mọi gọi GDT CHỈ qua `packages/gdt-client` (`getCaptcha`/`authenticate`) — KHÔNG `fetch()` GDT trong route/logic (`.claude/rules/gdt-adapter.md`).
- KHÔNG lưu mật khẩu thuế thô; chỉ lưu token JWT **đã mã hóa tại nghỉ** (chuỗi sealed `v1$aesgcm$…`), gắn `token_het_han` (`.claude/rules/security.md`).
- KHÔNG log token/mật khẩu/captcha; mọi `chi_tiet` audit đi qua `maskSensitive(...)` trước khi ghi.
- Mọi truy vấn dữ liệu tenant qua `withTenant(db, tenantId, …)` + lọc `tenant_id` tường minh (`.claude/rules/multi-tenant.md`).
- 401 GDT (sai captcha/mật khẩu / hết phiên) → KHÔNG lưu token, KHÔNG retry; **không** coi là lệch hợp đồng.
- 1 KEK toàn hệ thống nạp từ secret `TOKEN_KEK` (base64 32 byte). KHÔNG hard-code.
- TDD: test đỏ → xanh trước; `make lint` sạch (Biome + `tsc --noEmit`); coverage tầng nghiệp vụ ≥ 80%.
- RBAC 4 endpoint: `ke_toan_truong` + `quan_tri` (nguồn vai: `apps/api/src/rbac.ts`). `ke_toan` → 403.

## Ghi chú phối hợp (U13 song song)

Task 1 (probe `authenticate`) và Task 9 (sửa `loadAccountToken` trong `apps/sync-worker`) chạm vùng mà phiên U13 (giám sát) cũng đang sửa. Trước khi bắt Task 9, `git pull`/rebase để lấy thay đổi U13; giữ diff Task 9 tối thiểu (chỉ hàm `loadAccountToken` + wiring caller). Task 1 tái dùng harness contract sẵn có (`make test-contract`), KHÔNG dựng probe song song.

---

## Task 1: Cổng kiểm chứng — probe `authenticate` thật (thủ công, gate cho Task 3)

> ⚠️ Task NÀY chạy MỘT LẦN có người hỗ trợ (cần MST+mật khẩu thật + gõ captcha) và **ghi lại bằng chứng** dạng token + cách suy ra hạn. KHÔNG giả định TTL trước khi có kết quả (Hiến pháp — Nguyên tắc bằng chứng). Kết quả quyết định hiện thực `deriveTokenExpiry` ở Task 3.

**Files:**
- Create: `packages/gdt-client/test/contract/authenticate.contract.test.ts`
- Modify (ghi kết quả): `docs/plans/U14-design.md` (thêm mục "Kết quả probe 2026-..") 

**Interfaces:**
- Consumes: `getCaptcha(transport)`, `authenticate(transport, {username,password,ckey,cvalue})`, `createDirectCfTransport()` từ `@vat/gdt-client`.
- Produces: bằng chứng dạng token (JWT có `exp`? độ dài? TTL) — dùng ở Task 3.

- [ ] **Step 1: Viết test contract probe (gated bằng biến môi trường, tự bỏ qua nếu thiếu)**

```ts
// packages/gdt-client/test/contract/authenticate.contract.test.ts
// CONTRACT (gọi GDT THẬT) — chỉ chạy khi có credential + captcha do NGƯỜI nhập.
// Mục tiêu: quan sát dạng token GDT trả về + cách suy ra token_het_han. KHÔNG assert
// cứng TTL (chưa có bằng chứng); LOG để ghi vào U14-design.md. testing.md nhóm `contract`.
import { describe, expect, it } from "vitest";
import { authenticate, createDirectCfTransport, getCaptcha } from "../../src";

const U = process.env.GDT_TEST_USERNAME;
const P = process.env.GDT_TEST_PASSWORD;
const CKEY = process.env.GDT_TEST_CKEY; // lấy từ getCaptcha ở lần chạy trước
const CVALUE = process.env.GDT_TEST_CVALUE; // người dùng gõ captcha

describe.skipIf(!U || !P)("contract: GDT authenticate (probe dạng token)", () => {
  it("BƯỚC A — lấy captcha để người dùng gõ (chạy trước, KHÔNG cần CKEY/CVALUE)", async () => {
    const cap = await getCaptcha(createDirectCfTransport());
    expect(cap.key).toBeTruthy();
    expect(cap.content).toContain("image/"); // SVG/PNG base64
    // Ghi ra để người dùng xem + gõ: đặt lại GDT_TEST_CKEY/CVALUE rồi chạy BƯỚC B.
    console.log("CAPTCHA_KEY=", cap.key);
    console.log("CAPTCHA_CONTENT(len)=", cap.content.length);
  });

  it.skipIf(!CKEY || !CVALUE)("BƯỚC B — login thật, LOG dạng token + exp", async () => {
    const res = await authenticate(createDirectCfTransport(), {
      username: U as string,
      password: P as string,
      ckey: CKEY as string,
      cvalue: CVALUE as string,
    });
    expect(res.token).toBeTruthy();
    // Quan sát: token có phải JWT (3 phần ngăn bởi '.')? payload có `exp`?
    const parts = res.token.split(".");
    console.log("TOKEN_PARTS=", parts.length, "TOKEN_LEN=", res.token.length);
    if (parts.length === 3) {
      const payload = JSON.parse(
        new TextDecoder().decode(
          Uint8Array.from(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")), (c) =>
            c.charCodeAt(0),
          ),
        ),
      );
      console.log("TOKEN_PAYLOAD=", JSON.stringify(payload));
      console.log("HAS_EXP=", typeof payload.exp);
    }
  });
});
```

- [ ] **Step 2: Chạy bước A lấy captcha**

Run: `GDT_TEST_USERNAME=<mst> GDT_TEST_PASSWORD=<mk> make test-contract`
Expected: in ra `CAPTCHA_KEY=...`; người dùng mở captcha, gõ giá trị.

- [ ] **Step 3: Chạy bước B với captcha đã gõ, ghi bằng chứng**

Run: `GDT_TEST_USERNAME=<mst> GDT_TEST_PASSWORD=<mk> GDT_TEST_CKEY=<key> GDT_TEST_CVALUE=<captcha> make test-contract`
Expected: in `TOKEN_PARTS=`, `TOKEN_PAYLOAD=`, `HAS_EXP=`. **Chép kết quả** vào `docs/plans/U14-design.md` mục mới "Kết quả probe" (ngày + dạng token + `exp` có/không).

- [ ] **Step 4: Commit test + bằng chứng**

```bash
git add packages/gdt-client/test/contract/authenticate.contract.test.ts docs/plans/U14-design.md
git commit -m "test(u14): probe contract authenticate — ghi bằng chứng dạng token GDT + exp"
```

---

## Task 2: Schema + migration — cột `uy_quyen_luc` trên `tai_khoan_thue`

**Files:**
- Modify: `packages/db/src/schema/taiKhoanThue.ts`
- Create: `packages/db/migrations/0003_uy_quyen_luc.sql`
- Modify: `packages/db/migrations/meta/_journal.json`
- Test: `packages/db/test/uyQuyen.test.ts`

**Interfaces:**
- Produces: cột `taiKhoanThue.uyQuyenLuc` (`timestamp withTimezone`, nullable) — Task 6/8 dùng.

- [ ] **Step 1: Viết test đỏ — cột tồn tại, mặc định null, set được**

```ts
// packages/db/test/uyQuyen.test.ts
import { PGlite } from "@electric-sql/pglite";
import { taiKhoanThue, tenants } from "../src/schema";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

const MIGRATIONS = new URL("../migrations", import.meta.url).pathname;

describe("tai_khoan_thue.uy_quyen_luc", () => {
  let db: ReturnType<typeof drizzle>;
  beforeEach(async () => {
    db = drizzle(new PGlite());
    await migrate(db, { migrationsFolder: MIGRATIONS });
  });

  it("mặc định null; set được timestamp", async () => {
    const [t] = await db.insert(tenants).values({ ten: "A", mst: "0100000001" }).returning();
    const [acc] = await db
      .insert(taiKhoanThue)
      .values({ tenantId: t.id, username: "0100000001" })
      .returning();
    expect(acc.uyQuyenLuc).toBeNull();
    const when = new Date("2026-07-14T03:00:00Z");
    await db.update(taiKhoanThue).set({ uyQuyenLuc: when }).where(eq(taiKhoanThue.id, acc.id));
    const [after] = await db.select().from(taiKhoanThue).where(eq(taiKhoanThue.id, acc.id));
    expect(after.uyQuyenLuc?.toISOString()).toBe(when.toISOString());
  });
});
```

- [ ] **Step 2: Chạy test — đỏ (cột chưa có)**

Run: `npx vitest run packages/db/test/uyQuyen.test.ts`
Expected: FAIL (property `uyQuyenLuc` không tồn tại / cột không có).

- [ ] **Step 3: Thêm cột vào schema**

Trong `packages/db/src/schema/taiKhoanThue.ts`, thêm sau `tokenHetHan`:

```ts
    // U14 — mốc ủy quyền tenant (NĐ 13/2023). null = CHƯA ủy quyền → chặn login GDT.
    uyQuyenLuc: timestamp("uy_quyen_luc", { withTimezone: true }),
```

- [ ] **Step 4: Viết migration handwritten (theo mẫu 0002) + đăng ký journal**

Create `packages/db/migrations/0003_uy_quyen_luc.sql`:

```sql
-- U14 — mốc ủy quyền tenant (NĐ 13/2023) cho tài khoản thuế. null = chưa ủy quyền.
-- Idempotent: IF NOT EXISTS để áp lại không lỗi.
ALTER TABLE "tai_khoan_thue" ADD COLUMN IF NOT EXISTS "uy_quyen_luc" timestamp with time zone;
```

Thêm entry vào cuối mảng `entries` trong `packages/db/migrations/meta/_journal.json`:

```json
    {
      "idx": 3,
      "version": "7",
      "when": 1784100000000,
      "tag": "0003_uy_quyen_luc",
      "breakpoints": true
    }
```

- [ ] **Step 5: Chạy test — xanh**

Run: `npx vitest run packages/db/test/uyQuyen.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema/taiKhoanThue.ts packages/db/migrations/0003_uy_quyen_luc.sql packages/db/migrations/meta/_journal.json packages/db/test/uyQuyen.test.ts
git commit -m "feat(u14): thêm cột uy_quyen_luc (ủy quyền tenant NĐ13) + migration 0003"
```

---

## Task 3: `deriveTokenExpiry(token)` trong `@vat/gdt-client`

> Hiện thực theo bằng chứng Task 1. Mặc định kỳ vọng: token GDT là JWT có claim `exp` (giây epoch) → hạn = `new Date(exp*1000)`. Nếu Task 1 cho thấy khác (không có `exp`), đổi cơ chế theo bằng chứng và cập nhật test cho khớp. Test dưới dùng JWT tổng hợp (không gọi mạng).

**Files:**
- Create: `packages/gdt-client/src/tokenExpiry.ts`
- Modify: `packages/gdt-client/src/index.ts`
- Test: `packages/gdt-client/test/unit/tokenExpiry.test.ts`

**Interfaces:**
- Produces: `deriveTokenExpiry(token: string): Date` — Task 8 dùng để lấy `tokenHetHan`.

- [ ] **Step 1: Viết test đỏ**

```ts
// packages/gdt-client/test/unit/tokenExpiry.test.ts
import { describe, expect, it } from "vitest";
import { deriveTokenExpiry } from "../../src";

// JWT tổng hợp: header.payload.signature; payload {exp}. base64url không cần chữ ký thật.
function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}.sig`;
}

describe("deriveTokenExpiry", () => {
  it("JWT có exp → Date đúng thời điểm", () => {
    const exp = 1_800_000_000; // giây epoch
    expect(deriveTokenExpiry(fakeJwt({ exp })).getTime()).toBe(exp * 1000);
  });

  it("token không phải JWT / thiếu exp → ném lỗi (không đoán TTL)", () => {
    expect(() => deriveTokenExpiry("khong-phai-jwt")).toThrow();
    expect(() => deriveTokenExpiry(fakeJwt({ sub: "x" }))).toThrow();
  });
});
```

- [ ] **Step 2: Chạy test — đỏ**

Run: `npx vitest run packages/gdt-client/test/unit/tokenExpiry.test.ts`
Expected: FAIL (`deriveTokenExpiry` chưa export).

- [ ] **Step 3: Hiện thực**

```ts
// packages/gdt-client/src/tokenExpiry.ts
// U14 — suy ra hạn token GDT. Cô lập trong gdt-client (kiến thức về token GDT thuộc
// adapter — gdt-adapter.md). Cơ chế chốt theo BẰNG CHỨNG probe (U14-plan Task 1):
// token GDT là JWT có claim `exp` (giây epoch). KHÔNG giả định TTL cố định.
import { GdtError } from "./errors";

function b64urlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
}

/** Hạn token = claim `exp` (giây epoch) của JWT GDT. Ném nếu không lấy được (không đoán). */
export function deriveTokenExpiry(token: string): Date {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new GdtError("Token GDT không phải JWT hợp lệ (không suy ra được hạn).");
  }
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(b64urlDecode(parts[1])) as Record<string, unknown>;
  } catch {
    throw new GdtError("Không giải mã được payload token GDT.");
  }
  if (typeof payload.exp !== "number") {
    throw new GdtError("Token GDT thiếu claim exp (không suy ra được hạn).");
  }
  return new Date(payload.exp * 1000);
}
```

Thêm vào `packages/gdt-client/src/index.ts`:

```ts
export { deriveTokenExpiry } from "./tokenExpiry";
```

- [ ] **Step 4: Chạy test — xanh**

Run: `npx vitest run packages/gdt-client/test/unit/tokenExpiry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/gdt-client/src/tokenExpiry.ts packages/gdt-client/src/index.ts packages/gdt-client/test/unit/tokenExpiry.test.ts
git commit -m "feat(u14): deriveTokenExpiry — suy ra hạn từ claim exp của JWT GDT (theo probe)"
```

---

## Task 4: Wiring — `TOKEN_KEK` + `getTransport` vào Env/AppDeps + test helpers

**Files:**
- Modify: `apps/api/src/types.ts`
- Create: `apps/api/src/gdt.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/test/helpers.ts`

**Interfaces:**
- Produces: `Env.TOKEN_KEK: string`; `AppDeps.getTransport: (env: Env) => GdtTransport`; helper test `injectDb(db, storage?, transport?)`, `TEST_KEK`, `makeTransport(overrides)`, `seedTaxAccount(db, tenantId, over?)`.

- [ ] **Step 1: Thêm field vào Env + AppDeps**

Trong `apps/api/src/types.ts`: thêm import và field.

```ts
import type { GdtTransport } from "@vat/gdt-client";
```
Trong `interface Env` thêm:
```ts
  // U14 — KEK mã hóa token thuế tại nghỉ (base64 32 byte). Workers Secret (security.md).
  TOKEN_KEK: string;
```
Trong `interface AppDeps` thêm:
```ts
  // U14 — đường ra GDT (getCaptcha/authenticate). Production = createDirectCfTransport();
  // test tiêm transport giả (không mạng). Cô lập adapter (gdt-adapter.md).
  getTransport: (env: Env) => GdtTransport;
```

- [ ] **Step 2: Wiring production transport**

```ts
// apps/api/src/gdt.ts
// Wiring production: đường ra GDT T0 (direct-cf). KHÔNG test-cover (test tiêm transport
// giả). Cô lập mọi phụ thuộc GDT trong @vat/gdt-client (gdt-adapter.md).
import { type GdtTransport, createDirectCfTransport } from "@vat/gdt-client";
import type { Env } from "./types";

export function getTransportDirect(_env: Env): GdtTransport {
  return createDirectCfTransport();
}
```

- [ ] **Step 3: Nối vào entry production**

Trong `apps/api/src/index.ts`, nơi dựng `createApp({ getDb, getStorage })`, thêm `getTransport`:

```ts
import { getTransportDirect } from "./gdt";
// ...
const deps = { getDb: getDbFromHyperdrive, getStorage: getStorageFromR2, getTransport: getTransportDirect };
```
(Khớp cấu trúc `AppDeps` hiện có — nếu `index.ts` truyền object inline vào `createApp`, thêm khóa `getTransport`.)

- [ ] **Step 4: Mở rộng test helpers**

Trong `apps/api/test/helpers.ts`:

Thêm import:
```ts
import type { GdtTransport } from "@vat/gdt-client";
import { taiKhoanThue } from "@vat/db";
```

Thêm hằng KEK test (32 byte zero, base64 hợp lệ) + `makeEnv` gắn `TOKEN_KEK`:
```ts
export const TEST_KEK = btoa(String.fromCharCode(...new Uint8Array(32)));
```
Trong `makeEnv`, thêm vào object trả về: `TOKEN_KEK: TEST_KEK,`.

Thêm transport giả (mặc định trả lỗi để ép test khai rõ hành vi):
```ts
export function makeTransport(over: Partial<GdtTransport> = {}): GdtTransport {
  return {
    name: "fake",
    fetch: async () => new Response("no", { status: 500 }),
    probe: async () => ({ transport: "fake", verdict: "OK", latencyMs: 0 }),
    ...over,
  };
}
```

Sửa `injectDb` nhận thêm transport:
```ts
export function injectDb(db: Db, storage: FakeStorage = makeStorage(), transport: GdtTransport = makeTransport()) {
  return {
    getDb: async () => ({ db: db as unknown as AnyDb, close: async () => {} }),
    getStorage: () => storage,
    getTransport: () => transport,
  };
}
```

Thêm seeder tài khoản thuế:
```ts
export async function seedTaxAccount(
  db: Db,
  tenantId: string,
  over: Partial<typeof taiKhoanThue.$inferInsert> = {},
): Promise<string> {
  const rows = await db
    .insert(taiKhoanThue)
    .values({ tenantId, username: "0100000001", ...over })
    .returning({ id: taiKhoanThue.id });
  const row = rows[0];
  if (!row) throw new Error("insert tai_khoan_thue không trả về id");
  return row.id;
}
```

- [ ] **Step 5: Chạy lint + test hiện có — không vỡ**

Run: `make lint && npx vitest run apps/api`
Expected: PASS (thay đổi kiểu tương thích; test cũ vẫn xanh).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/types.ts apps/api/src/gdt.ts apps/api/src/index.ts apps/api/test/helpers.ts
git commit -m "feat(u14): wiring TOKEN_KEK + getTransport vào Env/AppDeps + helpers test"
```

---

## Task 5: Route `POST /tax-accounts` (đăng ký tài khoản thuế) + đăng ký router

**Files:**
- Create: `apps/api/src/routes/taxAccounts.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/test/integration/taxAccounts.register.test.ts`

**Interfaces:**
- Consumes: `requireTenant`, `requireRole` (`apps/api/src/rbac.ts`), `withTenant`, `taiKhoanThue` (`@vat/db`), `AppDeps`.
- Produces: `taxAccountsRoutes(deps: AppDeps)`; `POST /tax-accounts {username, loai?}` → `201 {id}`.

- [ ] **Step 1: Viết test đỏ (đăng ký + RBAC + cách ly tenant)**

```ts
// apps/api/test/integration/taxAccounts.register.test.ts
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
      { method: "POST", headers: { ...bearer(token), "content-type": "application/json" }, body: JSON.stringify({ username: "0100000001" }) },
      makeEnv(),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string };
    const rows = await db.select().from(taiKhoanThue).where(and(eq(taiKhoanThue.id, body.id), eq(taiKhoanThue.tenantId, tenantA)));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.username).toBe("0100000001");
  });

  it("vai ke_toan → 403", async () => {
    const token = await tokenFor(tenantA, { role: "ke_toan" });
    const res = await app.request(
      "/tax-accounts",
      { method: "POST", headers: { ...bearer(token), "content-type": "application/json" }, body: JSON.stringify({ username: "x" }) },
      makeEnv(),
    );
    expect(res.status).toBe(403);
  });

  it("thiếu username → 400", async () => {
    const token = await tokenFor(tenantA, { role: "quan_tri" });
    const res = await app.request(
      "/tax-accounts",
      { method: "POST", headers: { ...bearer(token), "content-type": "application/json" }, body: JSON.stringify({}) },
      makeEnv(),
    );
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Chạy test — đỏ (route chưa có)**

Run: `npx vitest run apps/api/test/integration/taxAccounts.register.test.ts`
Expected: FAIL (404 not_found).

- [ ] **Step 3: Tạo router + endpoint đăng ký**

```ts
// apps/api/src/routes/taxAccounts.ts
// U14 — quản lý tài khoản thuế + đường login GDT (ghi token mã hóa). Mọi route sau
// requireTenant + requireRole(ke_toan_truong|quan_tri), trong withTenant (RLS lớp 2)
// + lọc tenant_id tường minh (lớp 1). Gọi GDT CHỈ qua @vat/gdt-client (gdt-adapter.md).
import { taiKhoanThue, withTenant } from "@vat/db";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { requireTenant } from "../auth";
import { requireRole } from "../rbac";
import type { AppDeps, AppEnv } from "../types";

const registerSchema = z.object({
  username: z.string().min(1),
  loai: z.enum(["chinh", "con"]).optional(),
});

export function taxAccountsRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();

  r.use("*", requireTenant);
  r.use("*", requireRole("ke_toan_truong", "quan_tri"));

  // POST /tax-accounts — đăng ký bản ghi tài khoản thuế (chưa có token).
  r.post("/", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "bad_request" }, 400);
    }
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "bad_request" }, 400);

    const tenantId = c.get("tenantId");
    const { db, close } = await deps.getDb(c.env);
    try {
      const id = await withTenant(db, tenantId, async (tx) => {
        const rows = await tx
          .insert(taiKhoanThue)
          .values({ tenantId, username: parsed.data.username, ...(parsed.data.loai ? { loai: parsed.data.loai } : {}) })
          .returning({ id: taiKhoanThue.id });
        return rows[0]?.id;
      });
      if (!id) return c.json({ error: "server_error" }, 500);
      return c.json({ id }, 201);
    } finally {
      await close();
    }
  });

  return r;
}
```

Đăng ký trong `apps/api/src/app.ts`: thêm import + route.
```ts
import { taxAccountsRoutes } from "./routes/taxAccounts";
// ... sau app.route("/reconcile", ...):
app.route("/tax-accounts", taxAccountsRoutes(deps));
```

- [ ] **Step 4: Chạy test — xanh**

Run: `npx vitest run apps/api/test/integration/taxAccounts.register.test.ts`
Expected: PASS (3 ca).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/taxAccounts.ts apps/api/src/app.ts apps/api/test/integration/taxAccounts.register.test.ts
git commit -m "feat(u14): POST /tax-accounts — đăng ký tài khoản thuế (RBAC, tenant-scoped)"
```

---

## Task 6: Route `POST /tax-accounts/:id/authorize` (ủy quyền + audit)

**Files:**
- Modify: `apps/api/src/routes/taxAccounts.ts`
- Test: `apps/api/test/integration/taxAccounts.authorize.test.ts`

**Interfaces:**
- Consumes: `auditLog`, `taiKhoanThue`, `maskSensitive` (`@vat/crypto`), `isUuid` (`../auth`).
- Produces: `POST /tax-accounts/:id/authorize` → `200 {ok:true}`; đặt `uy_quyen_luc = now`; audit `hanh_dong="uy_quyen_tai_khoan_thue"`.

- [ ] **Step 1: Viết test đỏ**

```ts
// apps/api/test/integration/taxAccounts.authorize.test.ts
import { auditLog, taiKhoanThue } from "@vat/db";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { type Db, bearer, freshDb, injectDb, makeEnv, makeTenant, seedTaxAccount, tokenFor } from "../helpers";

describe("POST /tax-accounts/:id/authorize (PGlite)", () => {
  let db: Db; let app: ReturnType<typeof createApp>; let tenantA: string; let accId: string;
  beforeEach(async () => {
    db = await freshDb();
    app = createApp(injectDb(db));
    tenantA = await makeTenant(db, "Cty A", "0100000001");
    accId = await seedTaxAccount(db, tenantA);
  });

  it("ủy quyền → 200, đặt uy_quyen_luc + ghi audit", async () => {
    const token = await tokenFor(tenantA, { role: "quan_tri" });
    const res = await app.request(`/tax-accounts/${accId}/authorize`, { method: "POST", headers: bearer(token) }, makeEnv());
    expect(res.status).toBe(200);
    const [acc] = await db.select().from(taiKhoanThue).where(eq(taiKhoanThue.id, accId));
    expect(acc.uyQuyenLuc).not.toBeNull();
    const audits = await db.select().from(auditLog).where(and(eq(auditLog.tenantId, tenantA), eq(auditLog.doiTuong, accId)));
    expect(audits.some((a) => a.hanhDong === "uy_quyen_tai_khoan_thue")).toBe(true);
  });

  it("tài khoản của tenant khác → 404 (cách ly)", async () => {
    const tenantB = await makeTenant(db, "Cty B", "0100000009");
    const token = await tokenFor(tenantB, { role: "quan_tri" });
    const res = await app.request(`/tax-accounts/${accId}/authorize`, { method: "POST", headers: bearer(token) }, makeEnv());
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Chạy test — đỏ**

Run: `npx vitest run apps/api/test/integration/taxAccounts.authorize.test.ts`
Expected: FAIL (404 cho ca đầu vì route chưa có).

- [ ] **Step 3: Thêm endpoint authorize**

Trong `apps/api/src/routes/taxAccounts.ts`, thêm import:
```ts
import { auditLog } from "@vat/db";
import { maskSensitive } from "@vat/crypto";
import { isUuid } from "../auth";
```
Thêm route (trước `return r;`):
```ts
  // POST /tax-accounts/:id/authorize — ghi nhận ủy quyền tenant (NĐ 13). Login sẽ chặn
  // nếu chưa ủy quyền. Audit (append-only). Cách ly: chỉ tài khoản thuộc tenant hiện tại.
  r.post("/:id/authorize", async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id)) return c.json({ error: "bad_request" }, 400);
    const tenantId = c.get("tenantId");
    const { db, close } = await deps.getDb(c.env);
    try {
      const ok = await withTenant(db, tenantId, async (tx) => {
        const updated = await tx
          .update(taiKhoanThue)
          .set({ uyQuyenLuc: new Date() })
          .where(and(eq(taiKhoanThue.id, id), eq(taiKhoanThue.tenantId, tenantId)))
          .returning({ id: taiKhoanThue.id });
        if (updated.length === 0) return false;
        await tx.insert(auditLog).values({
          tenantId,
          hanhDong: "uy_quyen_tai_khoan_thue",
          doiTuong: id,
          chiTiet: maskSensitive({ phase: "authorize" }),
        });
        return true;
      });
      if (!ok) return c.json({ error: "not_found" }, 404);
      return c.json({ ok: true });
    } finally {
      await close();
    }
  });
```

- [ ] **Step 4: Chạy test — xanh**

Run: `npx vitest run apps/api/test/integration/taxAccounts.authorize.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/taxAccounts.ts apps/api/test/integration/taxAccounts.authorize.test.ts
git commit -m "feat(u14): POST /tax-accounts/:id/authorize — ủy quyền tenant + audit"
```

---

## Task 7: Route `GET /tax-accounts/:id/captcha` (proxy captcha GDT)

**Files:**
- Modify: `apps/api/src/routes/taxAccounts.ts`
- Test: `apps/api/test/integration/taxAccounts.captcha.test.ts`

**Interfaces:**
- Consumes: `getCaptcha` (`@vat/gdt-client`), `deps.getTransport`.
- Produces: `GET /tax-accounts/:id/captcha` → `200 {key, content}`.

- [ ] **Step 1: Viết test đỏ (transport giả trả captcha)**

```ts
// apps/api/test/integration/taxAccounts.captcha.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { type Db, bearer, freshDb, injectDb, makeEnv, makeTenant, makeTransport, seedTaxAccount, tokenFor } from "../helpers";

describe("GET /tax-accounts/:id/captcha (PGlite)", () => {
  let db: Db; let tenantA: string; let accId: string;
  beforeEach(async () => {
    db = await freshDb();
    tenantA = await makeTenant(db, "Cty A", "0100000001");
    accId = await seedTaxAccount(db, tenantA);
  });

  it("trả {key, content} từ GDT", async () => {
    const transport = makeTransport({
      fetch: async () => new Response(JSON.stringify({ key: "K1", content: "data:image/png;base64,AAAA" }), { status: 200, headers: { "content-type": "application/json" } }),
    });
    const app = createApp(injectDb(db, undefined, transport));
    const token = await tokenFor(tenantA, { role: "ke_toan_truong" });
    const res = await app.request(`/tax-accounts/${accId}/captcha`, { headers: bearer(token) }, makeEnv());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ key: "K1", content: "data:image/png;base64,AAAA" });
  });
});
```

- [ ] **Step 2: Chạy test — đỏ**

Run: `npx vitest run apps/api/test/integration/taxAccounts.captcha.test.ts`
Expected: FAIL (404).

- [ ] **Step 3: Thêm endpoint captcha**

Trong `apps/api/src/routes/taxAccounts.ts`, thêm import:
```ts
import { getCaptcha } from "@vat/gdt-client";
```
Thêm route:
```ts
  // GET /tax-accounts/:id/captcha — proxy ảnh captcha GDT cho người dùng gõ. KHÔNG tự
  // giải captcha (ranh giới Hiến pháp). :id để gắn RBAC/ngữ cảnh; captcha GDT là công khai.
  r.get("/:id/captcha", async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id)) return c.json({ error: "bad_request" }, 400);
    const transport = deps.getTransport(c.env);
    const cap = await getCaptcha(transport);
    return c.json({ key: cap.key, content: cap.content });
  });
```

- [ ] **Step 4: Chạy test — xanh**

Run: `npx vitest run apps/api/test/integration/taxAccounts.captcha.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/taxAccounts.ts apps/api/test/integration/taxAccounts.captcha.test.ts
git commit -m "feat(u14): GET /tax-accounts/:id/captcha — proxy captcha GDT (không tự giải)"
```

---

## Task 8: Route `POST /tax-accounts/:id/login` (authenticate → storeToken)

**Files:**
- Modify: `apps/api/src/routes/taxAccounts.ts`
- Test: `apps/api/test/integration/taxAccounts.login.test.ts`

**Interfaces:**
- Consumes: `authenticate`, `deriveTokenExpiry`, `GdtError` (`@vat/gdt-client`); `storeToken`, `readToken` (`@vat/db`); `deps.getTransport`; `c.env.TOKEN_KEK`.
- Produces: `POST /tax-accounts/:id/login {password, ckey, cvalue}` → `200 {ok:true, tokenHetHan}`; ghi token **sealed**; `409` nếu chưa ủy quyền; `401` khi GDT từ chối; audit login thành công/thất bại.

- [ ] **Step 1: Viết test đỏ (5 ca: thành công-sealed · chưa ủy quyền 409 · 401 không lưu · cách ly · RBAC)**

```ts
// apps/api/test/integration/taxAccounts.login.test.ts
import { readToken, taiKhoanThue } from "@vat/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { type Db, TEST_KEK, bearer, freshDb, injectDb, makeEnv, makeTenant, makeTransport, seedTaxAccount, tokenFor } from "../helpers";

// JWT tổng hợp có exp (giây epoch) để authenticate() trả token hợp lệ.
function fakeJwt(expSec: number): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64({ alg: "HS256" })}.${b64({ exp: expSec })}.sig`;
}
const okTransport = (token: string) =>
  makeTransport({ fetch: async () => new Response(JSON.stringify({ token }), { status: 200, headers: { "content-type": "application/json" } }) });
const loginReq = (id: string, token: string) => ({
  method: "POST",
  headers: { ...bearer(token), "content-type": "application/json" },
  body: JSON.stringify({ password: "mk", ckey: "K1", cvalue: "abcd" }),
});

describe("POST /tax-accounts/:id/login (PGlite)", () => {
  let db: Db; let tenantA: string; let accId: string;
  const expSec = 1_900_000_000;
  beforeEach(async () => {
    db = await freshDb();
    tenantA = await makeTenant(db, "Cty A", "0100000001");
    accId = await seedTaxAccount(db, tenantA, { uyQuyenLuc: new Date() }); // đã ủy quyền
  });

  it("đăng nhập → 200, LƯU token SEALED (không phải token thô), readToken giải mã đúng", async () => {
    const gdtToken = fakeJwt(expSec);
    const app = createApp(injectDb(db, undefined, okTransport(gdtToken)));
    const jwt = await tokenFor(tenantA, { role: "quan_tri" });
    const res = await app.request(`/tax-accounts/${accId}/login`, loginReq(accId, jwt), makeEnv());
    expect(res.status).toBe(200);
    const [acc] = await db.select().from(taiKhoanThue).where(eq(taiKhoanThue.id, accId));
    expect(acc.tokenHienTai?.startsWith("v1$")).toBe(true); // sealed, KHÔNG phải gdtToken thô
    expect(acc.tokenHienTai).not.toBe(gdtToken);
    const dec = await readToken(db as never, tenantA, accId, TEST_KEK);
    expect(dec?.token).toBe(gdtToken);
    expect(dec?.tokenHetHan?.getTime()).toBe(expSec * 1000);
  });

  it("chưa ủy quyền → 409, KHÔNG lưu token", async () => {
    const accNoAuth = await seedTaxAccount(db, tenantA, { username: "0100000002" }); // uy_quyen_luc null
    const app = createApp(injectDb(db, undefined, okTransport(fakeJwt(expSec))));
    const jwt = await tokenFor(tenantA, { role: "quan_tri" });
    const res = await app.request(`/tax-accounts/${accNoAuth}/login`, loginReq(accNoAuth, jwt), makeEnv());
    expect(res.status).toBe(409);
    const [acc] = await db.select().from(taiKhoanThue).where(eq(taiKhoanThue.id, accNoAuth));
    expect(acc.tokenHienTai).toBeNull();
  });

  it("GDT từ chối (200 không token) → 401, KHÔNG lưu token", async () => {
    const badTransport = makeTransport({ fetch: async () => new Response(JSON.stringify({ message: "Sai captcha" }), { status: 200, headers: { "content-type": "application/json" } }) });
    const app = createApp(injectDb(db, undefined, badTransport));
    const jwt = await tokenFor(tenantA, { role: "quan_tri" });
    const res = await app.request(`/tax-accounts/${accId}/login`, loginReq(accId, jwt), makeEnv());
    expect(res.status).toBe(401);
    const [acc] = await db.select().from(taiKhoanThue).where(eq(taiKhoanThue.id, accId));
    expect(acc.tokenHienTai).toBeNull();
  });

  it("vai ke_toan → 403", async () => {
    const app = createApp(injectDb(db, undefined, okTransport(fakeJwt(expSec))));
    const jwt = await tokenFor(tenantA, { role: "ke_toan" });
    const res = await app.request(`/tax-accounts/${accId}/login`, loginReq(accId, jwt), makeEnv());
    expect(res.status).toBe(403);
  });

  it("tài khoản tenant khác → 404 (cách ly)", async () => {
    const tenantB = await makeTenant(db, "Cty B", "0100000009");
    const app = createApp(injectDb(db, undefined, okTransport(fakeJwt(expSec))));
    const jwt = await tokenFor(tenantB, { role: "quan_tri" });
    const res = await app.request(`/tax-accounts/${accId}/login`, loginReq(accId, jwt), makeEnv());
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Chạy test — đỏ**

Run: `npx vitest run apps/api/test/integration/taxAccounts.login.test.ts`
Expected: FAIL (404).

- [ ] **Step 3: Thêm endpoint login**

Trong `apps/api/src/routes/taxAccounts.ts`, cập nhật import GDT + db:
```ts
import { authenticate, deriveTokenExpiry, getCaptcha, GdtError } from "@vat/gdt-client";
import { auditLog, storeToken, taiKhoanThue, withTenant } from "@vat/db";
```
Thêm schema + route:
```ts
const loginSchema = z.object({
  password: z.string().min(1),
  ckey: z.string().min(1),
  cvalue: z.string().min(1),
});

  // POST /tax-accounts/:id/login — captcha người dùng đã gõ → authenticate() → lưu token
  // MÃ HÓA. 409 nếu chưa ủy quyền. 401 nếu GDT từ chối (KHÔNG lưu). KHÔNG lưu mật khẩu.
  r.post("/:id/login", async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id)) return c.json({ error: "bad_request" }, 400);
    let body: unknown;
    try { body = await c.req.json(); } catch { return c.json({ error: "bad_request" }, 400); }
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "bad_request" }, 400);

    const tenantId = c.get("tenantId");
    const { db, close } = await deps.getDb(c.env);
    try {
      // Tải tài khoản (tenant-scoped): lấy username + kiểm ủy quyền. Cách ly: không thấy
      // tài khoản tenant khác → 404.
      const acc = await withTenant(db, tenantId, async (tx) => {
        const rows = await tx
          .select({ username: taiKhoanThue.username, uyQuyenLuc: taiKhoanThue.uyQuyenLuc })
          .from(taiKhoanThue)
          .where(and(eq(taiKhoanThue.id, id), eq(taiKhoanThue.tenantId, tenantId)));
        return rows[0] ?? null;
      });
      if (!acc) return c.json({ error: "not_found" }, 404);
      if (!acc.uyQuyenLuc) return c.json({ error: "chua_uy_quyen" }, 409);

      // Gọi GDT qua adapter. 401/sai captcha → GdtError → KHÔNG lưu token.
      let gdtToken: string;
      try {
        const authRes = await authenticate(deps.getTransport(c.env), {
          username: acc.username,
          password: parsed.data.password,
          ckey: parsed.data.ckey,
          cvalue: parsed.data.cvalue,
        });
        gdtToken = authRes.token;
      } catch (err) {
        // Audit thất bại (mask), rồi 401 gọn. Không phân biệt sai captcha vs mật khẩu.
        await withTenant(db, tenantId, async (tx) => {
          await tx.insert(auditLog).values({
            tenantId, hanhDong: "dang_nhap_thue_that_bai", doiTuong: id,
            chiTiet: maskSensitive({ reason: err instanceof GdtError ? err.message : "loi" }),
          });
        });
        return c.json({ error: "unauthorized" }, 401);
      }

      const tokenHetHan = deriveTokenExpiry(gdtToken);
      await storeToken(db, tenantId, id, gdtToken, tokenHetHan, c.env.TOKEN_KEK);
      await withTenant(db, tenantId, async (tx) => {
        await tx.insert(auditLog).values({
          tenantId, hanhDong: "dang_nhap_thue_thanh_cong", doiTuong: id,
          chiTiet: maskSensitive({ tokenHetHan: tokenHetHan.toISOString() }),
        });
      });
      return c.json({ ok: true, tokenHetHan: tokenHetHan.toISOString() });
    } finally {
      await close();
    }
  });
```
(Gộp import trùng: đảm bảo chỉ một dòng import từ `@vat/db` và một từ `@vat/gdt-client`, gộp các tên đã dùng ở Task 5–7.)

- [ ] **Step 4: Chạy test — xanh**

Run: `npx vitest run apps/api/test/integration/taxAccounts.login.test.ts`
Expected: PASS (5 ca).

- [ ] **Step 5: Chạy toàn bộ test apps/api + lint**

Run: `make lint && npx vitest run apps/api`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/taxAccounts.ts apps/api/test/integration/taxAccounts.login.test.ts
git commit -m "feat(u14): POST /tax-accounts/:id/login — authenticate→storeToken mã hóa, 409/401/audit"
```

---

## Task 9: Sửa đường ĐỌC token nền — `loadAccountToken` giải mã (sync-worker)

> Khử mâu thuẫn ngầm: cột lưu chuỗi sealed `v1$…`, nhưng `loadAccountToken` hiện trả thẳng → `runJob` gửi `v1$…` cho GDT. Sửa để giải mã. **Trước khi bắt: `git pull`/rebase để hòa với thay đổi U13 trong sync-worker.**

**Files:**
- Modify: `apps/sync-worker/src/recorder.ts` (hàm `loadAccountToken`)
- Modify: `apps/sync-worker/src/types.ts` (Env thêm `TOKEN_KEK`)
- Modify: nơi wiring `loadAccount` (queue consumer, thường `apps/sync-worker/src/index.ts`) — truyền `env.TOKEN_KEK`
- Test: `apps/sync-worker/test/unit/loadAccountToken.test.ts`

**Interfaces:**
- Consumes: `readToken` (`@vat/db`).
- Produces: `loadAccountToken(db, msg, kekB64)` trả `AccountToken` với `tokenHienTai` = **token đã giải mã** (hoặc null).

- [ ] **Step 1: Viết test đỏ (round-trip sealed → giải mã)**

```ts
// apps/sync-worker/test/unit/loadAccountToken.test.ts
import { PGlite } from "@electric-sql/pglite";
import { storeToken, taiKhoanThue, tenants } from "@vat/db";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { loadAccountToken } from "../../src/recorder";
import type { SyncJobMessage } from "../../src/types";

const MIGRATIONS = new URL("../../../../packages/db/migrations", import.meta.url).pathname;
const KEK = btoa(String.fromCharCode(...new Uint8Array(32)));

describe("loadAccountToken (giải mã token tại nghỉ)", () => {
  let db: ReturnType<typeof drizzle>;
  beforeEach(async () => {
    db = drizzle(new PGlite());
    await migrate(db, { migrationsFolder: MIGRATIONS });
  });

  it("trả token ĐÃ GIẢI MÃ (không phải chuỗi sealed v1$)", async () => {
    const [t] = await db.insert(tenants).values({ ten: "A", mst: "0100000001" }).returning();
    const [acc] = await db.insert(taiKhoanThue).values({ tenantId: t.id, username: "0100000001" }).returning();
    const hetHan = new Date("2026-08-01T00:00:00Z");
    await storeToken(db as never, t.id, acc.id, "GDT_TOKEN_THAT", hetHan, KEK);
    const msg = { tenantId: t.id, taikhoanId: acc.id, direction: "purchase", dateFrom: "01/07/2026", dateTo: "31/07/2026", period: "2026-07" } as SyncJobMessage;
    const res = await loadAccountToken(db as never, msg, KEK);
    expect(res?.tokenHienTai).toBe("GDT_TOKEN_THAT");
    expect(res?.tokenHetHan?.getTime()).toBe(hetHan.getTime());
  });

  it("chưa có token → null", async () => {
    const [t] = await db.insert(tenants).values({ ten: "A", mst: "0100000001" }).returning();
    const [acc] = await db.insert(taiKhoanThue).values({ tenantId: t.id, username: "0100000001" }).returning();
    const msg = { tenantId: t.id, taikhoanId: acc.id, direction: "purchase", dateFrom: "01/07/2026", dateTo: "31/07/2026", period: "2026-07" } as SyncJobMessage;
    expect(await loadAccountToken(db as never, msg, KEK)).toBeNull();
  });
});
```

- [ ] **Step 2: Chạy test — đỏ**

Run: `npx vitest run apps/sync-worker/test/unit/loadAccountToken.test.ts`
Expected: FAIL (chữ ký cũ không nhận `kekB64`; trả sealed).

- [ ] **Step 3: Sửa `loadAccountToken` dùng `readToken`**

Trong `apps/sync-worker/src/recorder.ts`, thêm `readToken` vào import `@vat/db` và thay thân hàm:
```ts
export async function loadAccountToken(
  db: AnyDb,
  msg: SyncJobMessage,
  kekB64: string,
): Promise<AccountToken | null> {
  // readToken tự tenant-scoped (withTenant) + giải mã (openSecret). Trả null nếu chưa
  // có token/không thuộc tenant. tokenHienTai giờ là TOKEN THẬT (đã giải mã), không sealed.
  const dec = await readToken(db, msg.tenantId, msg.taikhoanId, kekB64);
  if (!dec) return null;
  return { tokenHienTai: dec.token, tokenHetHan: dec.tokenHetHan };
}
```

Trong `apps/sync-worker/src/types.ts` `interface Env` thêm:
```ts
  // U14 — KEK giải mã token thuế tại nghỉ (base64 32 byte). Workers Secret (security.md).
  TOKEN_KEK: string;
```

Trong nơi wiring `loadAccount` (queue consumer): truyền `env.TOKEN_KEK` vào `loadAccountToken(db, msg, env.TOKEN_KEK)`. Nếu `loadAccount` là closure `(msg) => loadAccountToken(db, msg)`, đổi thành `(msg) => loadAccountToken(db, msg, env.TOKEN_KEK)`.

- [ ] **Step 4: Chạy test — xanh + toàn bộ sync-worker**

Run: `npx vitest run apps/sync-worker`
Expected: PASS (test cũ của runJob dùng `loadAccount` tiêm sẵn, không đụng chữ ký mới).

- [ ] **Step 5: Cập nhật comment cũ trong recorder.ts**

Xóa/đổi đoạn chú thích "điểm đọc này sẽ chuyển sang readToken CÙNG với đường GHI token… tách đơn vị sau" (đầu file) thành ghi chú đã nối ở U14, để tránh drift tài liệu.

- [ ] **Step 6: Commit**

```bash
git add apps/sync-worker/src/recorder.ts apps/sync-worker/src/types.ts apps/sync-worker/src/index.ts apps/sync-worker/test/unit/loadAccountToken.test.ts
git commit -m "fix(u14): loadAccountToken giải mã token qua readToken (khử mâu thuẫn schema↔consumer)"
```

---

## Task 10: Secret `TOKEN_KEK` — khai báo `.dev.vars.example` + tài liệu (+ fix tiền tố Hyperdrive)

**Files:**
- Modify: `apps/api/.dev.vars.example`
- Modify: `apps/sync-worker/.dev.vars.example`
- Modify: `README.md`

- [ ] **Step 1: Thêm TOKEN_KEK vào cả hai `.dev.vars.example`**

Thêm dòng (kèm chú thích cách sinh KEK):
```
# U14 — KEK mã hóa token thuế tại nghỉ (base64 32 byte). Sinh: openssl rand -base64 32
# Local: đặt ở .dev.vars (đã .gitignore). Production: wrangler secret put TOKEN_KEK
TOKEN_KEK=REPLACE_WITH_BASE64_32BYTE_KEK
```

- [ ] **Step 2: Sửa sai lệch tiền tố Hyperdrive (handoff mục 3)**

Trong `apps/api/.dev.vars.example`, đổi tiền tố biến local connection string của Hyperdrive từ `WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_...` → `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_...` (Wrangler 4.110 đòi `CLOUDFLARE_`). Kiểm cả `apps/sync-worker/.dev.vars.example` nếu có dòng tương tự.

- [ ] **Step 3: Ghi tài liệu deploy secret vào README**

Thêm vào mục cấu hình/deploy của `README.md` một dòng:
```
- `wrangler secret put TOKEN_KEK` (cả apps/api và apps/sync-worker) — KEK mã hóa token thuế. Bắt buộc trước khi bật đường login GDT (U14).
```

- [ ] **Step 4: Lint sạch (không có test cho file cấu hình)**

Run: `make lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/.dev.vars.example apps/sync-worker/.dev.vars.example README.md
git commit -m "docs(u14): khai báo secret TOKEN_KEK + sửa tiền tố Hyperdrive WRANGLER_→CLOUDFLARE_"
```

---

## Kiểm tra tổng (sau tất cả task)

- [ ] `make lint` sạch (Biome + `tsc --noEmit` toàn workspace).
- [ ] `make test` xanh toàn bộ (không giảm coverage < 80% tầng nghiệp vụ).
- [ ] Task 1 (probe) đã chạy thật + ghi kết quả dạng token/exp vào `U14-design.md`; nếu bằng chứng khác kỳ vọng JWT-`exp`, đã cập nhật `deriveTokenExpiry` + test Task 3.
- [ ] Review chéo bằng subagent trước khi coi U14 xong: `contract-guardian` (đụng gdt-client: probe + deriveTokenExpiry) + `security-reviewer` (token mã hóa, cách ly tenant, không lộ bí mật/log).

## Self-review (đối chiếu spec U14-design.md)

- Mục 3 (4 endpoint): Task 5 (đăng ký) · Task 6 (authorize) · Task 7 (captcha) · Task 8 (login). ✅
- Mục 4 (ghi token + deriveTokenExpiry + probe): Task 1 (probe) · Task 3 (deriveTokenExpiry) · Task 8 (storeToken + 409 + 401 + audit). ✅
- Mục 5 (sửa đường đọc): Task 9. ✅
- Mục 6 (consent + audit): Task 2 (cột) · Task 6 (đặt + audit) · Task 8 (chặn 409 + audit login). ✅
- Mục 7 (secret TOKEN_KEK): Task 4 (Env/wiring) · Task 10 (.dev.vars.example + docs). ✅
- Mục 8 (test): mỗi task có unit/integration; ca sealed-không-thô, 409, 401-không-lưu, cách ly tenant, RBAC 403 đều có. ✅
- RBAC `ke_toan_truong`+`quan_tri`: đặt ở `r.use("*", requireRole(...))` (Task 5), phủ mọi route con. ✅

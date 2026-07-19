# H-B.6 (DLQ + EgressHealth-gate) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khép vòng job đồng bộ hỏng — đọc/cảnh báo/phát-lại DLQ + chặn enqueue/chạy khi egress GEO_BLOCKED.

**Architecture:** Thêm bảng dead-letter `dong_bo_that_bai` (tenant-scoped, RLS) làm sổ bền cho job rơi `vat-sync-dlq`. Cùng Worker `vat-sync-worker` consume THÊM queue `vat-sync-dlq` (phân nhánh trong `queue()` theo `batch.queue`) → ghi sổ + audit CRITICAL + `console.error` + ack. Mở rộng `HealthState.lastVerdict` để cả `scheduled()` (skip enqueue) lẫn `queue()` (reenqueue-delay) chặn khi `GEO_BLOCKED`. Replay thủ công qua `fetch()` sau Cloudflare Access.

**Tech Stack:** TypeScript · Cloudflare Workers (Queues + Durable Objects) · Drizzle ORM + Postgres (Hyperdrive) · **Vitest chạy Node** (KHÔNG vitest-pool-workers — `apps/sync-worker/vitest.config.ts` nói rõ PGlite/pg không chạy trong workerd) — unit dùng mock, integration dùng **PGlite** · Biome.

## Global Constraints

- **Phạm vi = (a)+(b) chỉ.** KHÔNG làm (c) DO global-egress quota (→ H-B.6c). KHÔNG UI. KHÔNG đổi schema `audit_log`. KHÔNG đổi `consumerAction`/logic job H-B.4. KHÔNG bật T1/relay.
- **TDD bắt buộc** (`.claude/rules/testing.md`): test đỏ TRƯỚC; phủ logic ≥ 80%; wiring thuần (`index.ts` handlers, DO `fetch`) loại khỏi ngưỡng như tiền lệ.
- **Multi-tenant** (`.claude/rules/multi-tenant.md`): mọi ghi/đọc `dong_bo_that_bai` qua `withTenant(db, tenantId, …)`; bảng có `tenant_id NOT NULL` + `tenantIsolationPolicy` + migration bổ sung `FORCE ROW LEVEL SECURITY` tay.
- **Che trước khi ghi** (`.claude/rules/security.md`): `chi_tiet` audit đi qua `maskSensitive(...)` (từ `@vat/crypto`, đã dùng ở `recorder.ts`).
- **Migrate-trước-deploy** (`.claude/rules/deploy.md`): migration chạy production TRƯỚC khi deploy worker đọc/ghi bảng mới.
- **Kênh cảnh báo** = `console.error` → Workers observability/Logpush (email/Slack là U24, chưa xây).
- **Verdict gate = `'GEO_BLOCKED'` cụ thể** (không gate TIMEOUT/ERROR/RATE_LIMITED ở bản này).
- **Commands:** `make lint` (Biome + `tsc --noEmit`) · test một workspace: `npx vitest run --root apps/sync-worker` hoặc `--root packages/db` (né flake PGlite) · `make migrate`.
- **⚠️ Vị trí test (bắt buộc — QA1):** `apps/sync-worker/vitest.config.ts` chỉ include `test/unit/**` + `test/integration/**`. Test đặt trong `src/` sẽ **KHÔNG được phát hiện**. Mọi test sync-worker ở đơn vị này đặt tại `apps/sync-worker/test/unit/<tên>.test.ts`, import mã nguồn bằng `../../src/<tên>`. Các file `test/unit/health.test.ts` và `test/unit/fanout.test.ts` **ĐÃ TỒN TẠI** → **APPEND** ca mới, không tạo file mới. Test DB (`packages/db`) đặt ở `packages/db/test/integration/`.
- **⚠️ Va số migration:** nhánh `feat/u29/u17` đã có `0007_dang_ky_va_goi_dich_vu.sql`; nhánh này migration mới nhất = `0006`. Migration mới ở Task 1 tạm đánh `0007_dong_bo_that_bai`. **KHI HỢP NHẤT với trục mang 0007_dang_ky → PHẢI đánh số lại (0008+) + hoà giải `meta/_journal.json`.** Hệ quả trực tiếp của nợ git-mess (BACKLOG 2026-07-19); ghi lại, không tự đoán trục đích.

---

### Task 1: Bảng dead-letter `dong_bo_that_bai` (schema + migration + RLS)

**Files:**
- Create: `packages/db/src/schema/dongBoThatBai.ts`
- Modify: `packages/db/src/schema/index.ts` (thêm 1 dòng re-export)
- Create: `packages/db/migrations/0007_dong_bo_that_bai.sql`
- Modify: `packages/db/migrations/meta/_journal.json` (thêm entry idx 7)
- Test: `packages/db/test/integration/dongBoThatBai.test.ts`

**Interfaces:**
- Produces: bảng Drizzle `dongBoThatBai` với cột `{ id, tenantId, loai, payload, lyDo, soLan, trangThai, taoLuc, phatLaiLuc }`; hằng trạng thái `TRANG_THAI_DA_DAU='da_dau'`, `TRANG_THAI_DA_PHAT_LAI='da_phat_lai'`, `TRANG_THAI_BO_QUA='bo_qua'`.

- [ ] **Step 1: Viết test đỏ** — `packages/db/test/integration/dongBoThatBai.test.ts` (mirror harness `auditAppendOnly.test.ts`):

```ts
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { dongBoThatBai, tenants, TRANG_THAI_DA_DAU } from "../../src/schema";
import { withTenant } from "../../src/tenantContext";
import * as schema from "../../src/schema";

const MIGRATIONS = fileURLToPath(new URL("../../migrations", import.meta.url));
type Db = ReturnType<typeof drizzle<typeof schema>>;

async function freshDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

async function seedTenant(db: Db, mst: string): Promise<string> {
  const t = await db.insert(tenants).values({ ten: "Cty", mst }).returning();
  const id = t[0]?.id;
  if (!id) throw new Error("thiếu tenant");
  return id;
}

describe("dong_bo_that_bai (integration, PGlite)", () => {
  let db: Db;
  beforeEach(async () => {
    db = await freshDb();
  });

  it("INSERT + đọc lại qua withTenant (RLS lọc đúng tenant)", async () => {
    const a = await seedTenant(db, "0100000001");
    const b = await seedTenant(db, "0100000002");
    await withTenant(db, a, (tx) =>
      tx.insert(dongBoThatBai).values({
        tenantId: a,
        loai: "header",
        payload: { tenantId: a, period: "2026-07", direction: "purchase" },
        lyDo: "max_retries",
        trangThai: TRANG_THAI_DA_DAU,
      }),
    );
    const seenByA = await withTenant(db, a, (tx) => tx.select().from(dongBoThatBai));
    expect(seenByA.length).toBe(1);
    const seenByB = await withTenant(db, b, (tx) => tx.select().from(dongBoThatBai));
    expect(seenByB.length).toBe(0); // RLS: tenant B không thấy hàng của A
  });
});
```

- [ ] **Step 2: Chạy test — xác nhận ĐỎ**

Run: `npx vitest run --root packages/db test/integration/dongBoThatBai.test.ts`
Expected: FAIL (`dongBoThatBai` chưa export / bảng chưa có trong migration).

- [ ] **Step 3: Tạo schema** `packages/db/src/schema/dongBoThatBai.ts`:

```ts
import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenantIsolationPolicy } from "./_rls";
import { tenants } from "./tenants";

// H-B.6 — Sổ bền job đồng bộ rơi vào dead-letter (vat-sync-dlq). Tenant-scoped (RLS)
// vì message DLQ luôn mang tenantId (multi-tenant.md). payload KHÔNG chứa bí mật
// (chỉ tenantId/period/direction/hoaDonId/bpAttempt — security.md OK). Phát lại THỦ
// CÔNG (endpoint sau Cloudflare Access) — con người giữ quyền quyết định (Hiến pháp).
export const TRANG_THAI_DA_DAU = "da_dau";
export const TRANG_THAI_DA_PHAT_LAI = "da_phat_lai";
export const TRANG_THAI_BO_QUA = "bo_qua";

export const dongBoThatBai = pgTable(
  "dong_bo_that_bai",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    loai: text("loai").notNull(), // 'header' | 'detail'
    payload: jsonb("payload").notNull(),
    lyDo: text("ly_do").notNull(), // 'max_retries' | 'backpressure_cap' | 'unexpected'
    soLan: integer("so_lan"),
    trangThai: text("trang_thai").notNull().default(TRANG_THAI_DA_DAU),
    taoLuc: timestamp("tao_luc", { withTimezone: true }).notNull().defaultNow(),
    phatLaiLuc: timestamp("phat_lai_luc", { withTimezone: true }),
  },
  (t) => [tenantIsolationPolicy("dong_bo_that_bai", t.tenantId)],
);
```

- [ ] **Step 4: Re-export** — thêm vào `packages/db/src/schema/index.ts` (sau dòng `./dongHangHoa`):

```ts
export * from "./dongBoThatBai";
```

- [ ] **Step 5: Migration** `packages/db/migrations/0007_dong_bo_that_bai.sql` (hand-authored, idempotent — theo mẫu `0002_audit_append_only.sql`):

```sql
CREATE TABLE IF NOT EXISTS "dong_bo_that_bai" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"loai" text NOT NULL,
	"payload" jsonb NOT NULL,
	"ly_do" text NOT NULL,
	"so_lan" integer,
	"trang_thai" text NOT NULL DEFAULT 'da_dau',
	"tao_luc" timestamp with time zone DEFAULT now() NOT NULL,
	"phat_lai_luc" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "dong_bo_that_bai" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dong_bo_that_bai" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "dong_bo_that_bai_tenant_isolation" ON "dong_bo_that_bai";--> statement-breakpoint
CREATE POLICY "dong_bo_that_bai_tenant_isolation" ON "dong_bo_that_bai"
	AS PERMISSIVE FOR ALL TO public
	USING ("dong_bo_that_bai"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
	WITH CHECK ("dong_bo_that_bai"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dong_bo_that_bai_tenant_trangthai_idx"
	ON "dong_bo_that_bai" ("tenant_id", "trang_thai", "tao_luc" DESC);
```

- [ ] **Step 6: Journal entry** — thêm vào cuối mảng trong `packages/db/migrations/meta/_journal.json` (sau entry idx 6):

```json
    ,{
      "idx": 7,
      "version": "7",
      "when": 1785000000000,
      "tag": "0007_dong_bo_that_bai",
      "breakpoints": true
    }
```
(Chèn trước `]` đóng mảng `entries`. `when` = hằng cố định — KHÔNG dùng Date.now.)

- [ ] **Step 7: Chạy test — xác nhận XANH**

Run: `npx vitest run --root packages/db test/integration/dongBoThatBai.test.ts`
Expected: PASS (2 assert: A thấy 1 hàng, B thấy 0).

- [ ] **Step 8: Lint + commit**

Run: `make lint` → sạch.
```bash
git add packages/db/src/schema/dongBoThatBai.ts packages/db/src/schema/index.ts \
  packages/db/migrations/0007_dong_bo_that_bai.sql packages/db/migrations/meta/_journal.json \
  packages/db/test/integration/dongBoThatBai.test.ts
git commit -m "feat(db): H-B.6 bảng dong_bo_that_bai (dead-letter, RLS FORCE) + migration"
```

---

### Task 2: `HealthState.lastVerdict` + `isEgressBlocked`

**Files:**
- Modify: `apps/sync-worker/src/health.ts`
- Test: `apps/sync-worker/test/unit/health.test.ts` (**APPEND** — file đã tồn tại)

**Interfaces:**
- Consumes: `ProbeVerdict` (`@vat/gdt-client`), `nextHealth`, `HealthState` (đã có).
- Produces: `HealthState.lastVerdict?: ProbeVerdict`; `isEgressBlocked(state: HealthState): boolean` (true ⇔ `lastVerdict === 'GEO_BLOCKED'`).

- [ ] **Step 1: Viết test đỏ** — **APPEND** vào `apps/sync-worker/test/unit/health.test.ts` (file đã có). KHÔNG lặp import: file đã có `import { describe, expect, it } from "vitest"` (dòng 5) và `import { BAD_STREAK_THRESHOLD, HEALTHY, nextHealth } from "../../src/health"` (dòng 6). **Chỉ (i) thêm `isEgressBlocked` vào dòng import health sẵn có** → `import { BAD_STREAK_THRESHOLD, HEALTHY, isEgressBlocked, nextHealth } from "../../src/health";`, rồi (ii) APPEND khối `describe` dưới đây (không thêm dòng import nào):

```ts
describe("H-B.6 — lastVerdict + isEgressBlocked", () => {
  it("nextHealth ghi lastVerdict ở nhánh XẤU; nhánh OK giữ HEALTHY (lastVerdict undefined)", () => {
    expect(nextHealth(HEALTHY, "GEO_BLOCKED").state.lastVerdict).toBe("GEO_BLOCKED");
    // OK KHÔNG đặt lastVerdict (giữ nguyên HEALTHY) → gate mở. Xem Step 3 giải thích.
    expect(nextHealth(HEALTHY, "OK").state.lastVerdict).toBeUndefined();
  });
  it("isEgressBlocked chỉ true khi lastVerdict = GEO_BLOCKED", () => {
    expect(isEgressBlocked(nextHealth(HEALTHY, "GEO_BLOCKED").state)).toBe(true);
    expect(isEgressBlocked(nextHealth(HEALTHY, "RATE_LIMITED").state)).toBe(false);
    expect(isEgressBlocked(HEALTHY)).toBe(false); // mặc định không chặn
  });
});
```

- [ ] **Step 2: Chạy test — ĐỎ**

Run: `npx vitest run --root apps/sync-worker test/unit/health.test.ts`
Expected: FAIL (`isEgressBlocked` chưa tồn tại). Các ca cũ (a)–(f) vẫn PHẢI xanh — xem Step 3 (nhánh OK không đổi).

- [ ] **Step 3: Sửa `health.ts`** — thêm `lastVerdict` vào interface + ghi trong `nextHealth` + hàm mới:

```ts
export interface HealthState {
  consecutiveBad: number;
  alerted: boolean;
  /** H-B.6 — verdict tick gần nhất, để EgressHealth-gate biết LOẠI lỗi. */
  lastVerdict?: ProbeVerdict;
}
```
Nhánh OK — **GIỮ NGUYÊN** (KHÔNG thêm `lastVerdict`): OK reset về đúng `HEALTHY` để (a) test cũ `health.test.ts:23` `toEqual(HEALTHY)` + các ca (c)/(f) vẫn xanh, và (b) sau một tick OK thì `lastVerdict` undefined → `isEgressBlocked` = false → **gate mở** (đúng nghĩa "hết chặn"). Gate chỉ cần biết verdict XẤU gần nhất có phải GEO_BLOCKED không.
```ts
  if (verdict === "OK") {
    return { state: HEALTHY, alert: null }; // KHÔNG đổi — OK reset sạch về HEALTHY
  }
```
Nhánh xấu — thêm `lastVerdict: verdict` vào state trả về:
```ts
  return {
    state: { consecutiveBad, alerted: prev.alerted || shouldAlert, lastVerdict: verdict },
    alert: shouldAlert ? { verdict, consecutiveBad } : null,
  };
```
Cuối file:
```ts
/** H-B.6 — egress đang bị CHẶN ĐỊA LÝ (403/451) theo verdict gần nhất. Chỉ GEO_BLOCKED
 * mới gate (RATE_LIMITED do backpressure H-B.4 xử; TIMEOUT/ERROR không gate — tránh
 * chặn oan khi mạng chập chờn). */
export function isEgressBlocked(state: HealthState): boolean {
  return state.lastVerdict === "GEO_BLOCKED";
}
```

- [ ] **Step 4: Chạy test — XANH**

Run: `npx vitest run --root apps/sync-worker test/unit/health.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

Run: `make lint` → sạch.
```bash
git add apps/sync-worker/src/health.ts apps/sync-worker/test/unit/health.test.ts
git commit -m "feat(sync): H-B.6 HealthState.lastVerdict + isEgressBlocked (nền EgressHealth-gate)"
```

---

### Task 3: Hàm thuần `dlqRecord(body)` (ánh xạ message → hàng sổ)

**Files:**
- Create: `apps/sync-worker/src/dlqConsumer.ts`
- Test: `apps/sync-worker/test/unit/dlqConsumer.test.ts`

**Interfaces:**
- Consumes: `VatSyncQueueMessage`, `isDetailMessage` (`@vat/sync`).
- Produces: `DlqRecord = { loai: 'header'|'detail'; lyDo: string; doiTuong: string; payload: VatSyncQueueMessage }`; `dlqRecord(body: VatSyncQueueMessage): DlqRecord`. Hằng `AUDIT_HANH_DONG_DLQ = 'dong_bo_that_bai_dlq'`.

- [ ] **Step 1: Viết test đỏ** `apps/sync-worker/test/unit/dlqConsumer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dlqRecord } from "../../src/dlqConsumer";

describe("H-B.6 — dlqRecord (thuần)", () => {
  it("message header → loai 'header' + doiTuong theo kỳ/chiều", () => {
    const r = dlqRecord({
      tenantId: "t1", taikhoanId: "a1", direction: "purchase",
      dateFrom: "01/07/2026", dateTo: "31/07/2026", period: "2026-07",
    });
    expect(r.loai).toBe("header");
    expect(r.doiTuong).toBe("ky:2026-07:purchase");
    expect(r.lyDo).toBe("max_retries"); // CHƯA KIỂM CHỨNG: CF không truyền lý do → mặc định
  });
  it("message detail → loai 'detail' + doiTuong theo hóa đơn", () => {
    const r = dlqRecord({
      kind: "detail", tenantId: "t1", taikhoanId: "a1", hoaDonId: "hd9",
      ref: { nbmst: "x", khhdon: "1", khmshdon: "1", shdon: "5", source: "normal" },
    });
    expect(r.loai).toBe("detail");
    expect(r.doiTuong).toBe("hoadon:hd9");
  });
});
```

- [ ] **Step 2: Chạy test — ĐỎ**

Run: `npx vitest run --root apps/sync-worker test/unit/dlqConsumer.test.ts`
Expected: FAIL (`dlqConsumer` chưa tồn tại).

- [ ] **Step 3: Tạo `dlqConsumer.ts` (phần thuần)**:

```ts
// H-B.6 — Xử lý job rơi dead-letter (vat-sync-dlq). Phần THUẦN (dlqRecord) test offline;
// phần ghi DB (dlqConsume) ở Task 4. "CRITICAL" mã hoá qua hanh_dong (audit_log không có
// cột severity — không đổi schema).
import { isDetailMessage, type VatSyncQueueMessage } from "@vat/sync";

export const AUDIT_HANH_DONG_DLQ = "dong_bo_that_bai_dlq";

export interface DlqRecord {
  loai: "header" | "detail";
  lyDo: string;
  doiTuong: string;
  payload: VatSyncQueueMessage;
}

/** Ánh xạ MỘT message DLQ → hàng sổ. lyDo mặc định 'max_retries' — Cloudflare Queues
 * KHÔNG truyền cho consumer DLQ lý do message vào DLQ (CHƯA KIỂM CHỨNG cách phân biệt
 * backpressure_cap; nếu cần, phải nhúng cờ vào body ở H-B.4 — ngoài phạm vi). */
export function dlqRecord(body: VatSyncQueueMessage): DlqRecord {
  if (isDetailMessage(body)) {
    return { loai: "detail", lyDo: "max_retries", doiTuong: `hoadon:${body.hoaDonId}`, payload: body };
  }
  return {
    loai: "header",
    lyDo: "max_retries",
    doiTuong: `ky:${body.period}:${body.direction}`,
    payload: body,
  };
}
```

- [ ] **Step 4: Chạy test — XANH**

Run: `npx vitest run --root apps/sync-worker test/unit/dlqConsumer.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

Run: `make lint` → sạch.
```bash
git add apps/sync-worker/src/dlqConsumer.ts apps/sync-worker/test/unit/dlqConsumer.test.ts
git commit -m "feat(sync): H-B.6 dlqRecord — ánh xạ message DLQ → hàng sổ (thuần)"
```

---

### Task 4: Ghi sổ DLQ + audit + console (`dlqConsume`) + wiring queue()

**Files:**
- Modify: `apps/sync-worker/src/dlqConsumer.ts` (thêm `dlqConsume`)
- Modify: `apps/sync-worker/src/index.ts` (phân nhánh `queue()` theo `batch.queue`)
- Modify: `apps/sync-worker/wrangler.jsonc` (thêm consumer `vat-sync-dlq`)
- Test: `apps/sync-worker/test/unit/dlqConsumer.test.ts` (thêm ca `dlqConsume`)

**Interfaces:**
- Consumes: `AnyDb`, `withTenant`, `auditLog`, `dongBoThatBai` (`@vat/db`); `maskSensitive` (`@vat/crypto`); `dlqRecord`, `AUDIT_HANH_DONG_DLQ` (Task 3).
- Produces: `dlqConsume(db: AnyDb, body: VatSyncQueueMessage): Promise<void>` — ghi 1 hàng `dong_bo_that_bai` + 1 audit, trong 1 `withTenant`.

- [ ] **Step 1: Viết test đỏ** — thêm vào `dlqConsumer.test.ts` (mock db kiểu ghi-lại):

```ts
import { dlqConsume } from "../../src/dlqConsumer";

it("dlqConsume ghi 1 hàng dong_bo_that_bai + 1 audit qua withTenant", async () => {
  const inserted: unknown[] = [];
  const tx = {
    // withTenant gọi tx.execute(set_config) TRƯỚC fn → mock phải có execute.
    execute: async () => ({ rows: [] }),
    insert: (_table: unknown) => ({
      values: async (values: unknown) => {
        inserted.push(values);
      },
    }),
  };
  // Giả withTenant: db.transaction(fn) → fn(tx). (withTenant tự gọi tx.execute bên trong.)
  const db = {
    transaction: async (fn: (t: typeof tx) => Promise<void>) => fn(tx),
  } as unknown as import("../../src/types").AnyDb;
  await dlqConsume(db, {
    tenantId: "t1", taikhoanId: "a1", direction: "sold",
    dateFrom: "01/07/2026", dateTo: "31/07/2026", period: "2026-07",
  });
  expect(inserted.length).toBe(2); // dong_bo_that_bai + audit_log
});
```
> Ghi chú test-design: `withTenant` gọi `db.transaction` rồi `tx.execute(set_config)`. Mock `db` ở trên cấp cả `transaction` lẫn (gián tiếp) `execute` trên tx. Nếu harness dự án đã có helper mock `withTenant` (xem `runJob` test), DÙNG helper đó thay vì tự dựng — giữ một mẫu mock.

- [ ] **Step 2: Chạy test — ĐỎ**

Run: `npx vitest run --root apps/sync-worker test/unit/dlqConsumer.test.ts`
Expected: FAIL (`dlqConsume` chưa tồn tại).

- [ ] **Step 3: Thêm `dlqConsume` vào `dlqConsumer.ts`**:

```ts
import { auditLog, dongBoThatBai, withTenant } from "@vat/db";
import { maskSensitive } from "@vat/crypto";
import type { AnyDb } from "./types";

/** Ghi bền MỘT job DLQ + audit CRITICAL. Gọi trong queue() khi batch.queue === 'vat-sync-dlq'. */
export async function dlqConsume(db: AnyDb, body: VatSyncQueueMessage): Promise<void> {
  const rec = dlqRecord(body);
  await withTenant(db, body.tenantId, async (tx) => {
    await tx.insert(dongBoThatBai).values({
      tenantId: body.tenantId,
      loai: rec.loai,
      payload: rec.payload,
      lyDo: rec.lyDo,
    });
    await tx.insert(auditLog).values({
      tenantId: body.tenantId,
      hanhDong: AUDIT_HANH_DONG_DLQ,
      doiTuong: rec.doiTuong,
      chiTiet: maskSensitive({ loai: rec.loai, lyDo: rec.lyDo, payload: rec.payload }),
    });
  });
  console.error(`[DLQ-CRITICAL] tenant=${body.tenantId} ${rec.doiTuong} lyDo=${rec.lyDo}`);
}
```
> Kiểm import thật: `maskSensitive` export từ `@vat/crypto` (đã dùng ở `recorder.ts` — copy đúng đường import từ file đó). `AnyDb` từ `./types`.

- [ ] **Step 4: Wiring `index.ts`** — đầu `queue()`, phân nhánh theo queue nguồn (một Worker consume 2 queue):

```ts
async queue(batch, env, _ctx) {
  const { db, close } = await getDbFromHyperdrive(env);
  try {
    if (batch.queue === "vat-sync-dlq") {
      for (const message of batch.messages) {
        try {
          await dlqConsume(db, message.body);
          message.ack();
        } catch (err) {
          // Ghi sổ lỗi → retry (max_retries:3 của DLQ consumer làm chốt). KHÔNG log body.
          console.warn(`DLQ consumer lỗi ghi sổ: ${err instanceof Error ? err.name : "unknown"}`);
          message.retry();
        }
      }
      return;
    }
    // ... (nguyên khối xử lý vat-sync hiện có, không đổi) ...
  } finally {
    await close();
  }
}
```
Thêm `import { dlqConsume } from "./dlqConsumer";` ở đầu file.

- [ ] **Step 5: wrangler consumer DLQ** — thêm vào mảng `consumers` trong `apps/sync-worker/wrangler.jsonc`:

```jsonc
      ,{
        "queue": "vat-sync-dlq",
        "max_retries": 3,
        "max_batch_size": 10
      }
```
> KHÔNG khai `dead_letter_queue` cho chính nó (tránh DLQ-của-DLQ vô hạn). Tạo queue lúc deploy: `wrangler queues create vat-sync-dlq` (nếu chưa có — nó vốn được tham chiếu là DLQ nên có thể đã tồn tại).

- [ ] **Step 6: Chạy test — XANH**

Run: `npx vitest run --root apps/sync-worker test/unit/dlqConsumer.test.ts`
Expected: PASS (3 ca: 2 của Task 3 + `dlqConsume`).

- [ ] **Step 7: Lint + commit**

Run: `make lint` → sạch.
```bash
git add apps/sync-worker/src/dlqConsumer.ts apps/sync-worker/src/index.ts \
  apps/sync-worker/wrangler.jsonc apps/sync-worker/test/unit/dlqConsumer.test.ts
git commit -m "feat(sync): H-B.6 (a) DLQ consumer — ghi sổ dong_bo_that_bai + audit CRITICAL + ack"
```

---

### Task 5: EgressHealth-gate ở `scheduled()` (skip enqueue khi GEO_BLOCKED)

**Files:**
- Modify: `apps/sync-worker/src/index.ts` (`scheduled()`, nhánh cron đồng bộ)
- Test: KHÔNG có test riêng — gate ở `scheduled()` là WIRING (index.ts đã nằm trong `coverage.exclude`); logic `isEgressBlocked` đã phủ ở Task 2. Bước 2 chỉ chạy lại toàn bộ suite để bảo đảm không hồi quy.

**Interfaces:**
- Consumes: `isEgressBlocked`, `HealthState` (Task 2); `egressHealthClient` (`./egressHealth`).
- Produces: (wiring) — trước vòng `sendBatch`, nếu `isEgressBlocked(health)` → `console.warn` + `return` (bỏ toàn bộ enqueue).

> Logic gate là một `if` thuần trên `isEgressBlocked` (đã test ở Task 2). Phần đặt trong `scheduled()` là WIRING (loại khỏi ngưỡng phủ, như tiền lệ `index.ts`). Không tạo test riêng cho wiring; Task 2 đã phủ `isEgressBlocked`.

- [ ] **Step 1: Sửa `scheduled()`** — sau nhánh probe, trước khi mở DB đồng bộ (đọc health rẻ hơn mở Postgres):

```ts
  // H-B.6 (b) — GATE: egress đang GEO_BLOCKED (403/451) thì KHÔNG enqueue lô nào
  // (chỉ nhồi DLQ vô ích). Sự kiện toàn cục → chỉ observability, không audit (cần tenant).
  const health = await egressHealthClient(env.EGRESS_HEALTH).loadHealth();
  if (isEgressBlocked(health)) {
    console.warn("[GATE] egress GEO_BLOCKED — skip cron enqueue");
    return;
  }
  const { db, close } = await getDbFromHyperdrive(env);
  // ... phần enqueue hiện có ...
```
Thêm import: `import { egressHealthClient } from "./egressHealth";` và `import { isEgressBlocked } from "./health";`.

- [ ] **Step 2: Chạy toàn bộ test sync-worker — không hồi quy**

Run: `npx vitest run --root apps/sync-worker`
Expected: PASS toàn bộ (health/dlq + các test cũ).

- [ ] **Step 3: Lint + commit**

Run: `make lint` → sạch.
```bash
git add apps/sync-worker/src/index.ts
git commit -m "feat(sync): H-B.6 (b) gate scheduled() — skip enqueue khi egress GEO_BLOCKED"
```

---

### Task 6: EgressHealth-gate ở `queue()` consumer (reenqueue-delay khi GEO_BLOCKED)

**Files:**
- Modify: `apps/sync-worker/src/index.ts` (nhánh xử lý `vat-sync`)
- Modify: `apps/sync-worker/src/fanout.ts` (thêm hàm thuần `blockedReenqueue`)
- Test: `apps/sync-worker/test/unit/fanout.test.ts` (thêm ca `blockedReenqueue`)

**Interfaces:**
- Produces: `blockedReenqueue(body, delaySeconds): { body: VatSyncQueueMessage; delaySeconds: number }` — dựng message reenqueue mang `bpAttempt+1` + delay (mirror backpressure H-B.4, KHÔNG tính max_retries).

- [ ] **Step 1: Viết test đỏ** — thêm vào `apps/sync-worker/test/unit/fanout.test.ts`:

```ts
import { blockedReenqueue } from "../../src/fanout";

describe("H-B.6 — blockedReenqueue", () => {
  it("tăng bpAttempt + gắn delay (mặc định 0 → 1)", () => {
    const r = blockedReenqueue(
      { tenantId: "t1", taikhoanId: "a1", direction: "purchase",
        dateFrom: "01/07/2026", dateTo: "31/07/2026", period: "2026-07" },
      60,
    );
    expect(r.delaySeconds).toBe(60);
    expect((r.body as { bpAttempt?: number }).bpAttempt).toBe(1);
  });
  it("giữ bpAttempt tăng dần (5 → 6)", () => {
    const r = blockedReenqueue(
      { kind: "detail", tenantId: "t1", taikhoanId: "a1", hoaDonId: "h",
        ref: { nbmst: "x", khhdon: "1", khmshdon: "1", shdon: "5", source: "normal" },
        bpAttempt: 5 },
      30,
    );
    expect((r.body as { bpAttempt?: number }).bpAttempt).toBe(6);
  });
});
```

- [ ] **Step 2: Chạy test — ĐỎ**

Run: `npx vitest run --root apps/sync-worker test/unit/fanout.test.ts`
Expected: FAIL (`blockedReenqueue` chưa tồn tại).

- [ ] **Step 3: Thêm `blockedReenqueue` vào `fanout.ts`**:

```ts
import type { VatSyncQueueMessage } from "@vat/sync";

/** H-B.6 (b) — khi egress GEO_BLOCKED, hoãn job thay vì đập GDT. Mirror backpressure
 * H-B.4: message MỚI mang bpAttempt+1 + delay, ack bản cũ (KHÔNG tính max_retries),
 * nhưng vẫn tôn trọng trần bpAttempt → rơi DLQ nếu chặn kéo dài (có điểm dừng). */
export function blockedReenqueue(
  body: VatSyncQueueMessage,
  delaySeconds: number,
): { body: VatSyncQueueMessage; delaySeconds: number } {
  const bpAttempt = (body.bpAttempt ?? 0) + 1;
  return { body: { ...body, bpAttempt }, delaySeconds };
}
```

- [ ] **Step 4: Wiring `index.ts`** — trong nhánh `vat-sync` của `queue()`, đọc health MỘT lần đầu batch; nếu blocked, reenqueue mọi message thay vì chạy job:

```ts
    // (nhánh vat-sync)
    const { backpressureDelaySeconds, maxBackpressure } = resolveFanoutConfig(env);
    const blocked = isEgressBlocked(await egressHealthClient(env.EGRESS_HEALTH).loadHealth());
    for (const message of batch.messages) {
      const body = message.body;
      if (blocked) {
        // H-B.6 (b) — egress GEO_BLOCKED: hoãn cả batch, không đập GDT.
        const r = blockedReenqueue(body, backpressureDelaySeconds);
        await env.SYNC_QUEUE.send(r.body, { delaySeconds: r.delaySeconds });
        message.ack();
        continue;
      }
      // ... khối xử lý message hiện có (H-B.4) không đổi ...
    }
```
Thêm import `blockedReenqueue` (từ `./fanout`) — `isEgressBlocked`/`egressHealthClient` đã import ở Task 5.

- [ ] **Step 5: Chạy toàn bộ test — XANH, không hồi quy**

Run: `npx vitest run --root apps/sync-worker`
Expected: PASS toàn bộ.

- [ ] **Step 6: Lint + commit**

Run: `make lint` → sạch.
```bash
git add apps/sync-worker/src/index.ts apps/sync-worker/src/fanout.ts apps/sync-worker/test/unit/fanout.test.ts
git commit -m "feat(sync): H-B.6 (b) gate consumer — reenqueue-delay khi egress GEO_BLOCKED"
```

---

### Task 7: Endpoint replay thủ công (`fetch()` sau Cloudflare Access)

**Files:**
- Modify: `apps/sync-worker/src/index.ts` (thêm `fetch()` handler)
- Create: `apps/sync-worker/src/replay.ts` (hàm thuần + ghi DB)
- Test: `apps/sync-worker/test/unit/replay.test.ts`

**Interfaces:**
- Consumes: `dongBoThatBai`, `TRANG_THAI_DA_DAU`, `TRANG_THAI_DA_PHAT_LAI`, `withTenant`, `eq`, `and`, `inArray` (`@vat/db`/`drizzle-orm`); `SYNC_QUEUE`.
- Produces: `replayMessages(rows: { payload: unknown }[]): VatSyncQueueMessage[]` (thuần — reset `bpAttempt:0`); `replayDeadLetters(db, queue, opts: { tenantId: string; ids?: string[] }): Promise<{ daPhatLai: number }>`.

> **Bảo vệ:** endpoint đặt sau **Cloudflare Access** (cấu hình hạ tầng, không phải code — security.md "khu quản trị dùng Cloudflare Access"). Code KHÔNG tự xác thực; DoD ghi rõ route `/dlq/replay` PHẢI được Access bảo vệ trước khi bật production. Yêu cầu `tenantId` tường minh (không "replay tất tenant" ẩn — multi-tenant.md).
>
> **Test-design:** `apps/sync-worker` chạy **Node + PGlite** (KHÔNG vitest-pool-workers — `vitest.config.ts`). Đơn vị này test `replayDeadLetters` bằng **mock db/queue** (đủ nhẹ, khỏi seed PGlite) + hàm THUẦN `replayMessages`; nếu muốn integration DB thật thì đặt ở `apps/sync-worker/test/integration/` (mẫu `runJob.db.test.ts`).

- [ ] **Step 1: Viết test đỏ** `apps/sync-worker/test/unit/replay.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { replayMessages, replayDeadLetters } from "../../src/replay";

describe("H-B.6 — replay", () => {
  it("replayMessages reset bpAttempt về 0 (thuần)", () => {
    const out = replayMessages([
      { payload: { tenantId: "t1", taikhoanId: "a1", direction: "purchase",
        dateFrom: "01/07/2026", dateTo: "31/07/2026", period: "2026-07", bpAttempt: 9 } },
    ]);
    expect(out.length).toBe(1);
    expect((out[0] as { bpAttempt?: number }).bpAttempt).toBe(0);
  });

  it("replayDeadLetters gửi lại + đánh dấu da_phat_lai (mock db/queue)", async () => {
    const updates: unknown[] = [];
    const sent: unknown[] = [];
    const tx = {
      execute: async () => ({ rows: [] }), // withTenant set_config
      select: () => ({ from: () => ({ where: async () => [
        { id: "r1", payload: { tenantId: "t1", taikhoanId: "a1", direction: "sold",
          dateFrom: "01/07/2026", dateTo: "31/07/2026", period: "2026-07", bpAttempt: 3 } },
      ] }) }),
      update: (_t: unknown) => ({ set: (v: unknown) => ({ where: async () => { updates.push(v); } }) }),
    };
    const db = { transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) } as unknown as import("../../src/types").AnyDb;
    const queue = { send: async (b: unknown) => { sent.push(b); } } as unknown as Queue;
    const res = await replayDeadLetters(db, queue, { tenantId: "t1" });
    expect(res.daPhatLai).toBe(1);
    expect((sent[0] as { bpAttempt?: number }).bpAttempt).toBe(0);
    expect((updates[0] as { trangThai?: string }).trangThai).toBe("da_phat_lai");
  });
});
```

- [ ] **Step 2: Chạy test — ĐỎ**

Run: `npx vitest run --root apps/sync-worker test/unit/replay.test.ts`
Expected: FAIL (`replay` chưa tồn tại).

- [ ] **Step 3: Tạo `replay.ts`**:

```ts
// H-B.6 — Phát lại THỦ CÔNG job DLQ đã đậu. Endpoint sau Cloudflare Access (con người
// giữ quyền quyết định — Hiến pháp). Reset bpAttempt=0 để job thử lại đầy đủ; nếu egress
// vẫn hỏng, gate (Task 5/6) + backpressure H-B.4 lại xử lý đúng.
import { and, eq, inArray } from "drizzle-orm";
import { dongBoThatBai, TRANG_THAI_DA_DAU, TRANG_THAI_DA_PHAT_LAI, withTenant } from "@vat/db";
import type { VatSyncQueueMessage } from "@vat/sync";
import type { AnyDb } from "./types";

/** Thuần — dựng message phát lại từ các hàng sổ (reset bpAttempt để job thử lại đầy đủ). */
export function replayMessages(rows: { payload: unknown }[]): VatSyncQueueMessage[] {
  return rows.map((r) => ({ ...(r.payload as VatSyncQueueMessage), bpAttempt: 0 }));
}

export async function replayDeadLetters(
  db: AnyDb,
  queue: Queue<VatSyncQueueMessage>,
  opts: { tenantId: string; ids?: string[] },
): Promise<{ daPhatLai: number }> {
  return withTenant(db, opts.tenantId, async (tx) => {
    const where = opts.ids?.length
      ? and(eq(dongBoThatBai.trangThai, TRANG_THAI_DA_DAU), inArray(dongBoThatBai.id, opts.ids))
      : eq(dongBoThatBai.trangThai, TRANG_THAI_DA_DAU);
    const rows = await tx.select().from(dongBoThatBai).where(where);
    const msgs = replayMessages(rows as { id: string; payload: unknown }[]);
    for (let i = 0; i < rows.length; i++) {
      await queue.send(msgs[i]);
      await tx
        .update(dongBoThatBai)
        .set({ trangThai: TRANG_THAI_DA_PHAT_LAI, phatLaiLuc: new Date() })
        .where(eq(dongBoThatBai.id, (rows[i] as { id: string }).id));
    }
    return { daPhatLai: rows.length };
  });
}
```
> ⚠️ `new Date()` chạy ở runtime Worker (OK) — KHÔNG trong workflow-script. Nếu muốn tất định trong test, `phatLaiLuc` được set ở wiring, test mock không kiểm giá trị thời gian.

- [ ] **Step 4: `fetch()` handler trong `index.ts`**:

```ts
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "POST" && url.pathname === "/dlq/replay") {
      const { tenantId, ids } = (await req.json()) as { tenantId?: string; ids?: string[] };
      if (!tenantId) return Response.json({ error: "thiếu tenantId" }, { status: 400 });
      const { db, close } = await getDbFromHyperdrive(env);
      try {
        const res = await replayDeadLetters(db, env.SYNC_QUEUE, { tenantId, ids });
        return Response.json(res);
      } finally {
        await close();
      }
    }
    return new Response("not found", { status: 404 });
  },
```
Thêm `import { replayDeadLetters } from "./replay";`.

- [ ] **Step 5: Chạy test — XANH**

Run: `npx vitest run --root apps/sync-worker test/unit/replay.test.ts`
Expected: PASS.

- [ ] **Step 6: Lint + commit**

Run: `make lint` → sạch.
```bash
git add apps/sync-worker/src/replay.ts apps/sync-worker/src/index.ts apps/sync-worker/test/unit/replay.test.ts
git commit -m "feat(sync): H-B.6 replay thủ công job DLQ (endpoint sau Cloudflare Access)"
```

---

### Task 8: Cập nhật sổ tiến độ + đóng đơn vị

**Files:**
- Modify: `docs/audit/FORDEX-PROGRESS.md`
- Modify: `docs/audit/FORDEX-BACKLOG-hardening.md` (ghi H-B.6c tách ra)

- [ ] **Step 1: Cập nhật `FORDEX-PROGRESS.md`** — dòng H-B.6:

```
| H-B.6 | CODE | Xong (a)+(b) — DLQ consumer (dong_bo_that_bai + audit CRITICAL + replay thủ công) + EgressHealth-gate GEO_BLOCKED (scheduled + consumer). Hoãn (c) quota toàn cục → H-B.6c. | (commit đơn vị) |
| H-B.6c | CODE | Chưa bắt đầu — DO global-egress quota tổng; HỢP NHẤT BACKLOG #1 (rate-limit toàn cục GDT). | — |
```

- [ ] **Step 2: Ghi chú `FORDEX-BACKLOG-hardening.md`** — dưới mục H-B.6, thêm dòng:

```
- (2026-07-20) Phạm vi H-B.6 thu hẹp còn (a)+(b) — xem docs/plans/H-B.6-plan.md + H-B.6-impl.md. Phần (c) DO global-egress quota tách thành H-B.6c, hợp nhất BACKLOG mục #1.
```

- [ ] **Step 3: Commit**

```bash
git add docs/audit/FORDEX-PROGRESS.md docs/audit/FORDEX-BACKLOG-hardening.md
git commit -m "docs(fordex): H-B.6 (a)+(b) xong; tách H-B.6c (quota toàn cục)"
```

---

## Ghi chú QA2 (trước merge/deploy — không phải task code)

- Review chéo: `dod-auditor` (luôn) + `security-reviewer` (chạm tenant/RLS/DO/endpoint Access). `contract-guardian` KHÔNG cần (không chạm `packages/gdt-client`/endpoint thuế).
- **Deploy (deploy.md):** `make migrate` áp `0007_dong_bo_that_bai` lên production TRƯỚC; `wrangler queues create vat-sync-dlq` nếu chưa có; deploy worker SAU. Smoke: đẩy 1 message hỏng vào `vat-sync-dlq` → thấy 1 hàng `dong_bo_that_bai` + audit `dong_bo_that_bai_dlq`.
- **Cloudflare Access** bảo vệ `/dlq/replay` PHẢI bật trước khi lộ endpoint ra production (điểm chủ dự án).
- **Va số migration:** hoà giải với `0007_dang_ky_va_goi_dich_vu` của nhánh U17/U29 khi hợp nhất (Global Constraints).
```

# Delta-sync chia lô + UX "Tra cứu hóa đơn" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vá lỗi gốc "thiếu hóa đơn tháng" bằng động cơ delta-sync (audit `total` GDT vs DB → chỉ kéo tháng hụt, theo lô nhỏ có checkpoint, hội tụ qua ≤3 vòng), đồng thời hợp nhất UI thành thẻ "Tra cứu hóa đơn" và thêm 4 số thống kê.

**Architecture:** Queue tự nối chuỗi trên hạ tầng có sẵn (Queues + TenantLimiter DO + backpressure H-B.4). Hai loại message mới trên queue `vat-sync`: `kind:"audit"` (kiểm đủ/hụt, rẻ) và `kind:"delta"` (kéo một lô ≤N trang một họ endpoint, commit riêng, checkpoint trong message + `lan_dong_bo`). API backfill mặc định enqueue audit cho MỌI tháng trong khoảng (bỏ coverage nhị phân); cờ `force` giữ hành vi cũ. Frontend chỉ đổi tầng trình bày + hiển thị summary có sẵn.

**Tech Stack:** TypeScript / Cloudflare Workers (Hono, Queues, DO), Drizzle + Postgres (PGlite khi test), Vitest + vitest-pool-workers, React (apps/web), Biome.

**Spec:** `docs/superpowers/specs/2026-07-26-delta-sync-va-ux-tra-cuu-design.md` (đã duyệt). Bối cảnh lỗi gốc: `docs/CHAN-DOAN-thieu-hoa-don-thang.md`.

## Global Constraints

- TDD bắt buộc: test đỏ trước, hiện thực sau (`.claude/rules/testing.md`); coverage tầng nghiệp vụ ≥ 80%.
- Mọi gọi HTTP tới GDT chỉ trong `packages/gdt-client`, qua `GdtTransport` (`.claude/rules/gdt-adapter.md`). Sau khi sửa gdt-client phải chạy `make test-contract`.
- Mọi truy vấn dữ liệu nghiệp vụ lọc `tenant_id` tường minh + chạy trong `withTenant` (`.claude/rules/multi-tenant.md`); `tenantId` tường minh trong mọi payload message.
- UI: chỉ token `--…` + primitive chung; nhãn từ Registry/`labelOf`; đủ 4 trạng thái; KHÔNG hardcode hex/px (`.claude/rules/ui.md`; convention test `apps/web/test/conventions/ui-luat.test.ts` chặn `style=` trên input/select trong `features/`).
- Không log token/`raw_json`; lỗi ghi DB đi qua `tomTatLoi` (che params).
- Số lô mặc định: `DELTA_CHUNK_PAGES = 40` trang/message (an toàn kép trần 50/1000 subrequest); trần vòng `TRAN_VONG_DELTA = 3`.
- Commit nhỏ theo từng task, thông điệp tiếng Việt kiểu hiện có (`feat(sync): …`).
- `make lint && make test` xanh trước khi coi task xong. Lệnh chạy test đúng workspace, ví dụ: `npx vitest run test/audit.test.ts` trong `packages/sync`.

---

## Slice 1 — Backend delta-sync

### Task 1: Schema `lan_dong_bo` + migration (`checkpoint`, `loai`)

**Files:**
- Modify: `packages/db/src/schema/lanDongBo.ts`
- Create: migration mới trong `packages/db/migrations/` (drizzle-kit generate)

**Interfaces:**
- Produces: cột `lanDongBo.checkpoint` (jsonb, nullable), `lanDongBo.loai` (text NOT NULL default `'sync'`). Task 4/5/8 đọc-ghi hai cột này.

- [ ] **Step 1: Sửa schema**

Trong `packages/db/src/schema/lanDongBo.ts`, thêm import `jsonb` và hai cột sau `thongDiepLoi`:

```ts
import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
// ... trong pgTable, sau thongDiepLoi:
    /** Delta-sync (spec 2026-07-26): con trỏ tiếp tục giữa các lô kéo —
     * { family: "normal"|"sco", state: string|null, totalQuanSat: number|null }.
     * NULL với run thường (full-month legacy). */
    checkpoint: jsonb("checkpoint"),
    /** 'sync' = run kéo dữ liệu; 'audit' = run kiểm-đủ (không kéo — tháng đã đủ so
     * total GDT). Cho phép UI phân biệt "đủ, không cần kéo" với "đã kéo xong". */
    loai: text("loai").notNull().default("sync"),
```

- [ ] **Step 2: Sinh migration**

Run trong `packages/db`: `npx drizzle-kit generate`
Expected: file SQL mới chứa đúng 2 lệnh:

```sql
ALTER TABLE "lan_dong_bo" ADD COLUMN "checkpoint" jsonb;
ALTER TABLE "lan_dong_bo" ADD COLUMN "loai" text DEFAULT 'sync' NOT NULL;
```

Nếu drizzle-kit sinh khác (đổi tên/di chuyển), sửa tay về đúng 2 ALTER trên — không kéo theo thay đổi ngoài phạm vi.

- [ ] **Step 3: Kiểm kiểu + test hiện có**

Run: `make lint && make test`
Expected: xanh (schema thêm cột nullable/default không phá test cũ).

- [ ] **Step 4: Commit**

```bash
git add packages/db
git commit -m "feat(db): lan_dong_bo + checkpoint (jsonb) + loai (sync|audit) cho delta-sync"
```

Lưu ý giao nộp: `make migrate` áp lên production nằm ở Task 14 (deploy) — không áp lẻ ở đây.

---

### Task 2: gdt-client — `queryInvoicesChunk` + `queryInvoiceTotal`

**Files:**
- Modify: `packages/gdt-client/src/query.ts` (tách `fetchPage` từ ruột `queryOne`, thêm 2 hàm mới)
- Modify: `packages/gdt-client/src/index.ts` (export mới)
- Test: `packages/gdt-client/test/queryChunk.test.ts` (mới; theo mẫu mock transport của test query hiện có trong `packages/gdt-client/test/`)

**Interfaces:**
- Consumes: `fetchWithRetry`, `buildSearch`, `INVOICE_ENDPOINTS`, `missingContractKeys` (sẵn có).
- Produces (Task 5/6 dùng):

```ts
export function familyEndpoint(direction: InvoiceDirection, family: "normal" | "sco"): string;
export interface InvoiceChunkResult {
  rows: InvoiceRow[];        // đã gắn _source/_direction
  state?: string;            // undefined = họ này ĐÃ HẾT trang
  total: number | null;      // total GDT trả gần nhất (bất ổn — oracle mềm)
  pages: number;
}
export function queryInvoicesChunk(
  transport: GdtTransport, token: string,
  params: { direction: InvoiceDirection; family: "normal" | "sco"; dateFrom: string;
            dateTo: string; state?: string; maxPages: number; size?: number },
  opts?: RetryOptions,
): Promise<InvoiceChunkResult>;
export function queryInvoiceTotal(
  transport: GdtTransport, token: string,
  params: { direction: InvoiceDirection; family: "normal" | "sco"; dateFrom: string; dateTo: string },
  opts?: RetryOptions,
): Promise<number | null>;   // sco 404 → null (họ không áp dụng)
```

- [ ] **Step 1: Viết test đỏ** — `packages/gdt-client/test/queryChunk.test.ts`

Mock transport trả phong bì `{datas, total, state, time}` theo kịch bản; assert:

```ts
import { describe, expect, it } from "vitest";
import { GdtError, queryInvoiceTotal, queryInvoicesChunk } from "../src";
import type { GdtTransport } from "../src";

function fakeTransport(pages: Array<{ status?: number; body: unknown }>): GdtTransport {
  let i = 0;
  return {
    fetch: async () => {
      const p = pages[Math.min(i, pages.length - 1)];
      i += 1;
      return new Response(JSON.stringify(p.body), { status: p.status ?? 200 });
    },
  } as unknown as GdtTransport;
}
const row = (shdon: number) => ({ nbmst: "1", khmshdon: "1", khhdon: "C26M", shdon, tdlap: "2026-06-01" });

describe("queryInvoicesChunk", () => {
  it("dừng ở maxPages và trả state để nối tiếp", async () => {
    const t = fakeTransport([
      { body: { datas: [row(1), row(2)], total: 5, state: "s1", time: 0 } },
      { body: { datas: [row(3), row(4)], total: 5, state: "s2", time: 0 } },
    ]);
    const r = await queryInvoicesChunk(t, "tk", {
      direction: "purchase", family: "sco", dateFrom: "01/06/2026", dateTo: "30/06/2026",
      maxPages: 2, size: 2,
    });
    expect(r.pages).toBe(2);
    expect(r.state).toBe("s2");
    expect(r.total).toBe(5);
    expect(r.rows.map((x) => x._source)).toEqual(["sco", "sco", "sco", "sco"]);
  });
  it("hết trang (datas < size) → state undefined", async () => {
    const t = fakeTransport([{ body: { datas: [row(1)], total: 1, state: "s1", time: 0 } }]);
    const r = await queryInvoicesChunk(t, "tk", {
      direction: "purchase", family: "normal", dateFrom: "01/06/2026", dateTo: "30/06/2026",
      maxPages: 40, size: 2,
    });
    expect(r.state).toBeUndefined();
  });
  it("401 → GdtError SESSION_EXPIRED", async () => {
    const t = fakeTransport([{ status: 401, body: {} }]);
    await expect(
      queryInvoicesChunk(t, "tk", {
        direction: "purchase", family: "normal", dateFrom: "01/06/2026", dateTo: "30/06/2026",
        maxPages: 1,
      }),
    ).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
  });
});

describe("queryInvoiceTotal", () => {
  it("trả total từ trang size=1", async () => {
    const t = fakeTransport([{ body: { datas: [row(1)], total: 7023, state: "s", time: 0 } }]);
    expect(
      await queryInvoiceTotal(t, "tk", {
        direction: "purchase", family: "sco", dateFrom: "01/06/2026", dateTo: "30/06/2026",
      }),
    ).toBe(7023);
  });
  it("sco 404 → null (không áp dụng), normal 404 → ném", async () => {
    const t404 = () => fakeTransport([{ status: 404, body: { message: "x" } }]);
    expect(
      await queryInvoiceTotal(t404(), "tk", {
        direction: "purchase", family: "sco", dateFrom: "01/06/2026", dateTo: "30/06/2026",
      }),
    ).toBeNull();
    await expect(
      queryInvoiceTotal(t404(), "tk", {
        direction: "purchase", family: "normal", dateFrom: "01/06/2026", dateTo: "30/06/2026",
      }),
    ).rejects.toBeInstanceOf(GdtError);
  });
});
```

(Chữ ký `GdtTransport.fetch` chỉnh theo transport thật trong `packages/gdt-client/src/transport.ts` — mirror cách các test query hiện có dựng mock.)

- [ ] **Step 2: Chạy test, xác nhận đỏ**

Run trong `packages/gdt-client`: `npx vitest run test/queryChunk.test.ts`
Expected: FAIL — `queryInvoicesChunk is not exported`.

- [ ] **Step 3: Hiện thực trong `query.ts`**

(1) Tách phần thân vòng lặp của `queryOne` thành `fetchPage` (giữ NGUYÊN xử lý 401/lỗi HTTP/parse/contract-soft hiện có, thêm parse `total`):

```ts
interface EnvelopePage {
  datas: Array<Record<string, unknown>>;
  state?: string;
  total: number | null;
}

async function fetchPage(
  transport: GdtTransport, token: string, endpoint: string, search: string,
  size: number, state: string | undefined, opts?: RetryOptions,
): Promise<EnvelopePage> {
  const query = new URLSearchParams({ sort: DEFAULT_SORT, size: String(size), search });
  if (state) query.set("state", state);
  const res = await fetchWithRetry(
    transport, `${BASE}${endpoint}?${query.toString()}`,
    { method: "GET", headers: { authorization: `Bearer ${token}` } }, opts,
  );
  if (res.status === 401) {
    throw new GdtError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", "SESSION_EXPIRED");
  }
  if (!res.ok) {
    /* GIỮ NGUYÊN khối trích detail + throw GdtError HTTP_ERROR hiện có của queryOne */
  }
  let data: Record<string, unknown>;
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    throw new GdtError(`Phản hồi không hợp lệ từ ${endpoint} (HTTP ${res.status}).`);
  }
  const missing = missingContractKeys(data, "invoice_envelope");
  if (missing.length > 0) {
    console.warn(/* GIỮ NGUYÊN thông điệp cảnh báo hiện có */);
  }
  return {
    datas: Array.isArray(data.datas) ? (data.datas as Array<Record<string, unknown>>) : [],
    ...(typeof data.state === "string" ? { state: data.state } : {}),
    total: typeof data.total === "number" ? data.total : null,
  };
}
```

`queryOne` viết lại dùng `fetchPage` (hành vi giữ nguyên — test cũ phải xanh).

(2) Hai hàm mới + helper endpoint:

```ts
/** Endpoint của một họ (normal | sco) theo chiều — một nguồn từ INVOICE_ENDPOINTS. */
export function familyEndpoint(direction: InvoiceDirection, family: "normal" | "sco"): string {
  if (family === "normal") return INVOICE_ENDPOINTS[direction];
  return INVOICE_ENDPOINTS[direction === "purchase" ? "scoPurchase" : "scoSold"];
}

export interface InvoiceChunkResult {
  rows: InvoiceRow[];
  state?: string;
  total: number | null;
  pages: number;
}

/** Delta-sync: kéo TỐI ĐA maxPages trang MỘT họ endpoint, nối từ con trỏ `state`.
 * Không khử trùng chéo lô (tầng upsert idempotent lo); rows gắn _source/_direction. */
export async function queryInvoicesChunk(
  transport: GdtTransport, token: string,
  params: { direction: InvoiceDirection; family: "normal" | "sco"; dateFrom: string;
            dateTo: string; state?: string; maxPages: number; size?: number },
  opts?: RetryOptions,
): Promise<InvoiceChunkResult> {
  const size = params.size ?? DEFAULT_SIZE;
  const endpoint = familyEndpoint(params.direction, params.family);
  const search = buildSearch(params.dateFrom, params.dateTo);
  const rows: InvoiceRow[] = [];
  let state = params.state;
  let total: number | null = null;
  let pages = 0;
  while (pages < params.maxPages) {
    if (pages > 0) await pace(opts?.minIntervalMs, opts?.sleepFn);
    const page = await fetchPage(transport, token, endpoint, search, size, state, opts);
    pages += 1;
    if (page.total !== null) total = page.total;
    for (const r of page.datas) {
      rows.push({ ...r, _source: params.family, _direction: params.direction });
    }
    state = page.state;
    if (page.datas.length < size || !state) return { rows, total, pages }; // hết trang
  }
  return { rows, ...(state ? { state } : {}), total, pages };
}

/** Delta-sync: hỏi `total` một họ (1 request, size=1). sco 404 → null. */
export async function queryInvoiceTotal(
  transport: GdtTransport, token: string,
  params: { direction: InvoiceDirection; family: "normal" | "sco"; dateFrom: string; dateTo: string },
  opts?: RetryOptions,
): Promise<number | null> {
  const endpoint = familyEndpoint(params.direction, params.family);
  try {
    const page = await fetchPage(
      transport, token, endpoint, buildSearch(params.dateFrom, params.dateTo), 1, undefined, opts,
    );
    return page.total;
  } catch (err) {
    if (params.family === "sco" && err instanceof GdtError && err.httpStatus === 404) return null;
    throw err;
  }
}
```

Export cả ba từ `packages/gdt-client/src/index.ts`.

- [ ] **Step 4: Chạy test xanh + toàn bộ test gdt-client**

Run: `npx vitest run` (trong `packages/gdt-client`)
Expected: PASS toàn bộ (kể cả test queryOne cũ sau refactor).

- [ ] **Step 5: Contract gate + commit**

Run: `make test-contract` (bắt buộc theo gdt-adapter.md sau khi sửa gdt-client).
Expected: PASS (không đổi endpoint/schema).

```bash
git add packages/gdt-client
git commit -m "feat(gdt-client): queryInvoicesChunk (kéo theo lô, con trỏ nối tiếp) + queryInvoiceTotal (oracle total)"
```

---

### Task 3: @vat/sync — message `audit`/`delta` + builders

**Files:**
- Modify: `packages/sync/src/syncJob.ts`
- Modify: `packages/sync/src/index.ts` (export)
- Test: `packages/sync/test/syncJob.test.ts` (bổ sung — file test syncJob hiện có trong `packages/sync/test/`)

**Interfaces:**
- Produces (Task 6/7/9 dùng):

```ts
export interface AuditSyncMessage {
  kind: "audit";
  tenantId: string; taikhoanId: string;
  direction: InvoiceDirection;
  dateFrom: string; dateTo: string; period: string; // dd/mm/yyyy + "YYYY-MM"
  vong: number;             // 0 = kiểm đầu; ≥1 = kiểm lại sau vòng kéo thứ `vong`
  lanDongBoId?: string;     // run đang mở (chỉ vong ≥ 1)
  prevCount?: number;       // tổng count DB ở lần kiểm trước (xét bão hòa)
  bpAttempt?: number;
}
export interface DeltaPullMessage {
  kind: "delta";
  tenantId: string; taikhoanId: string;
  direction: InvoiceDirection;
  dateFrom: string; dateTo: string; period: string;
  lanDongBoId: string;
  family: "normal" | "sco";       // họ đang kéo
  conLai: ("normal" | "sco")[];   // họ chờ kéo sau họ này
  state?: string;                 // con trỏ GDT; undefined = đầu họ
  vong: number;                   // vòng hiện tại (1-based)
  prevCount: number;              // count DB lúc audit mở vòng này (chuyển tiếp cho re-audit)
  bpAttempt?: number;
}
export function isAuditMessage(b: unknown): b is AuditSyncMessage;
export function isDeltaMessage(b: unknown): b is DeltaPullMessage;
export function buildAuditMessages(
  account: { tenantId: string; taikhoanId: string },
  windows: PeriodWindow[], directions: InvoiceDirection[],
): AuditSyncMessage[]; // vong: 0
export type VatSyncQueueMessage =
  SyncJobMessage | DetailSyncMessage | AuditSyncMessage | DeltaPullMessage;
```

- [ ] **Step 1: Test đỏ** — bổ sung vào test syncJob:

```ts
import { buildAuditMessages, isAuditMessage, isDeltaMessage, monthlyWindows } from "../src";

it("buildAuditMessages: 1 msg / (tháng × chiều), vong 0, kind audit", () => {
  const ws = monthlyWindows("2026-06-01", "2026-07-31"); // 2 tháng
  const msgs = buildAuditMessages({ tenantId: "t1", taikhoanId: "a1" }, ws, ["purchase", "sold"]);
  expect(msgs).toHaveLength(4);
  expect(msgs[0]).toMatchObject({
    kind: "audit", tenantId: "t1", taikhoanId: "a1", direction: "purchase",
    period: "2026-06", dateFrom: "01/06/2026", dateTo: "30/06/2026", vong: 0,
  });
});
it("guards phân nhánh đúng và không nhận nhầm nhau/legacy", () => {
  expect(isAuditMessage({ kind: "audit" })).toBe(true);
  expect(isDeltaMessage({ kind: "delta" })).toBe(true);
  expect(isAuditMessage({ kind: "detail" })).toBe(false);
  expect(isDeltaMessage({ period: "2026-06" })).toBe(false); // header legacy không kind
});
```

- [ ] **Step 2: Chạy đỏ** — `npx vitest run test/syncJob.test.ts` (packages/sync). Expected: FAIL.

- [ ] **Step 3: Hiện thực** trong `syncJob.ts` (interface như khối Interfaces; guards theo mẫu `isDetailMessage`):

```ts
export function isAuditMessage(body: unknown): body is AuditSyncMessage {
  return typeof body === "object" && body !== null && (body as { kind?: unknown }).kind === "audit";
}
export function isDeltaMessage(body: unknown): body is DeltaPullMessage {
  return typeof body === "object" && body !== null && (body as { kind?: unknown }).kind === "delta";
}
export function buildAuditMessages(
  account: { tenantId: string; taikhoanId: string },
  windows: PeriodWindow[],
  directions: InvoiceDirection[],
): AuditSyncMessage[] {
  return windows.flatMap((w) =>
    directions.map((direction) => ({
      kind: "audit" as const,
      tenantId: account.tenantId,
      taikhoanId: account.taikhoanId,
      direction,
      dateFrom: w.dateFrom,
      dateTo: w.dateTo,
      period: w.period,
      vong: 0,
    })),
  );
}
```

Cập nhật `VatSyncQueueMessage` union + export từ `index.ts`.

- [ ] **Step 4: Xanh** — `npx vitest run test/syncJob.test.ts`. Expected: PASS. `make lint` sạch.

- [ ] **Step 5: Commit**

```bash
git add packages/sync
git commit -m "feat(sync): message audit/delta cho delta-sync + buildAuditMessages"
```

---

### Task 4: @vat/sync — quyết định audit (`decideAudit`) + đếm DB theo nguồn

**Files:**
- Create: `packages/sync/src/audit.ts`
- Modify: `packages/sync/src/index.ts`, `packages/sync/src/coverage.ts` (export `monthStartUtc`/`nextMonthStartUtc` nếu tái dùng)
- Test: `packages/sync/test/audit.test.ts`

**Interfaces:**
- Produces (Task 6 dùng):

```ts
export const TRAN_VONG_DELTA = 3;
export interface FamilyObservation {
  family: "normal" | "sco";
  total: number | null;   // null = họ không áp dụng (sco 404) / GDT không trả total
  dbCount: number;
}
export type AuditDecision =
  | { kind: "du" }
  | { kind: "keo"; families: ("normal" | "sco")[] }
  | { kind: "dung"; hutConLai: number };
export function decideAudit(obs: FamilyObservation[], vong: number, prevCount?: number): AuditDecision;
export function demHoaDonTheoNguon<...>(db, tenantId: string, chieu: InvoiceDirection, period: string):
  Promise<{ normal: number; sco: number }>;
```

- [ ] **Step 1: Test đỏ** — `packages/sync/test/audit.test.ts`. Phần thuần:

```ts
import { describe, expect, it } from "vitest";
import { TRAN_VONG_DELTA, decideAudit } from "../src/audit";

const obs = (n: [number | null, number], s: [number | null, number]) => [
  { family: "normal" as const, total: n[0], dbCount: n[1] },
  { family: "sco" as const, total: s[0], dbCount: s[1] },
];

describe("decideAudit", () => {
  it("DB ≥ total mọi họ → du", () => {
    expect(decideAudit(obs([53, 53], [7023, 7100]), 0)).toEqual({ kind: "du" });
  });
  it("total null (sco không áp dụng) không tính là hụt", () => {
    expect(decideAudit(obs([53, 53], [null, 0]), 0)).toEqual({ kind: "du" });
  });
  it("hụt vòng 0 → keo đúng họ hụt", () => {
    expect(decideAudit(obs([53, 53], [7023, 6802]), 0)).toEqual({ kind: "keo", families: ["sco"] });
  });
  it("hụt nhưng bão hòa (count không tăng so prevCount) → dung + hutConLai", () => {
    expect(decideAudit(obs([53, 53], [7023, 6981]), 1, 53 + 6981)).toEqual({
      kind: "dung", hutConLai: 42,
    });
  });
  it("hụt còn tăng → keo vòng nữa; chạm trần vòng → dung", () => {
    expect(decideAudit(obs([53, 53], [7023, 6981]), 1, 53 + 6802).kind).toBe("keo");
    expect(decideAudit(obs([53, 53], [7023, 6981]), TRAN_VONG_DELTA).kind).toBe("dung");
  });
});
```

Phần DB (PGlite, theo mẫu test coverage/sync hiện có trong `packages/sync/test/`): seed `hoa_don` 2 tenant × 2 nguồn × 2 tháng, assert `demHoaDonTheoNguon` đếm đúng (tenant đúng, chiều đúng, nguồn tách, tháng đúng biên VN — hóa đơn `tdlap` 23:59 ngày 30/06 giờ VN thuộc tháng 6, 00:30 ngày 01/07 giờ VN thuộc tháng 7).

- [ ] **Step 2: Chạy đỏ** — `npx vitest run test/audit.test.ts`. Expected: FAIL.

- [ ] **Step 3: Hiện thực `audit.ts`**

```ts
import { hoaDon } from "@vat/db";
import type { InvoiceDirection } from "@vat/gdt-client";
import { and, count, eq, gte, lt } from "drizzle-orm";
// Db generic: cùng khuôn coverage.ts

export const TRAN_VONG_DELTA = 3;
// ... FamilyObservation / AuditDecision như Interfaces ...

export function decideAudit(
  obs: FamilyObservation[], vong: number, prevCount?: number,
): AuditDecision {
  const thieu = obs.filter((o) => o.total !== null && o.dbCount < o.total);
  if (thieu.length === 0) return { kind: "du" };
  const hutConLai = thieu.reduce((s, o) => s + ((o.total as number) - o.dbCount), 0);
  const currentCount = obs.reduce((s, o) => s + o.dbCount, 0);
  if (vong >= TRAN_VONG_DELTA) return { kind: "dung", hutConLai };
  // Bão hòa: đã kéo ≥1 vòng mà tổng count không tăng — total GDT bất ổn ±4%, kéo nữa vô ích.
  if (vong >= 1 && prevCount !== undefined && currentCount <= prevCount) {
    return { kind: "dung", hutConLai };
  }
  return { kind: "keo", families: thieu.map((o) => o.family) };
}

/** Biên tháng THEO GIỜ VN quy về UTC — PHẢI khớp `dayBoundaryUtc` của
 * packages/query/src/filters.ts (đường đọc đã kiểm chứng đúng giờ VN).
 * TRƯỚC KHI CODE: đọc filters.ts, xác nhận công thức (UTC = mốc VN − 7h). */
function vnMonthRangeUtc(period: string): { lo: Date; hi: Date } {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) throw new Error(`period phải YYYY-MM: ${period}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const VN_OFFSET_MS = 7 * 3600 * 1000;
  return {
    lo: new Date(Date.UTC(y, mo - 1, 1) - VN_OFFSET_MS),
    hi: new Date(Date.UTC(y, mo, 1) - VN_OFFSET_MS),
  };
}

export async function demHoaDonTheoNguon(db, tenantId, chieu, period) {
  const { lo, hi } = vnMonthRangeUtc(period);
  const rows = await db
    .select({ nguon: hoaDon.nguon, n: count() })
    .from(hoaDon)
    .where(and(
      eq(hoaDon.tenantId, tenantId),
      eq(hoaDon.chieu, chieu),
      gte(hoaDon.tdlap, lo),
      lt(hoaDon.tdlap, hi),
    ))
    .groupBy(hoaDon.nguon);
  const out = { normal: 0, sco: 0 };
  for (const r of rows) {
    if (r.nguon === "normal") out.normal = Number(r.n);
    if (r.nguon === "sco") out.sco = Number(r.n);
  }
  return out;
}
```

Ghi chú tường minh trong code: đếm theo `tenant` (hoa_don không có taikhoan_id) — tenant nhiều tài khoản thuế cùng MST chia sẻ hóa đơn nên count có thể ≥ total một tài khoản; thiên về "coi là đủ" (an toàn: không kéo thừa; force là lối thoát).

- [ ] **Step 4: Xanh** — `npx vitest run test/audit.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sync
git commit -m "feat(sync): decideAudit (du/keo/dung, tran 3 vong, bao hoa) + demHoaDonTheoNguon"
```

---

### Task 5: @vat/sync — `syncChunk` + vòng đời run delta (`moDeltaRun`/`ghiAuditDu`/`chotDeltaRun`)

**Files:**
- Create: `packages/sync/src/chunkSync.ts`
- Modify: `packages/sync/src/sync.ts` (export `upsertBatch`, `classifyFailure`, `parseDdmmyyyy` — đổi từ private sang export, KHÔNG đổi hành vi)
- Modify: `packages/sync/src/index.ts`
- Test: `packages/sync/test/chunkSync.test.ts` (PGlite + mock transport, theo mẫu `test/sync.test.ts` hiện có)

**Interfaces:**
- Consumes: `queryInvoicesChunk` (Task 2), `upsertBatch`/`classifyFailure`/`tomTatLoi`/`parseDdmmyyyy` (sync.ts), cột Task 1.
- Produces (Task 6 dùng):

```ts
export interface DeltaRunParams {
  taikhoanId: string; direction: InvoiceDirection;
  dateFrom: string; dateTo: string; // dd/mm/yyyy
}
export function moDeltaRun(db, tenantId: string, p: DeltaRunParams): Promise<string>;
export function ghiAuditDu(db, tenantId: string, p: DeltaRunParams): Promise<void>;
export function chotDeltaRun(db, tenantId: string, lanDongBoId: string,
  kq: { trangThai: "completed" | "failed" | "can_dang_nhap_lai"; thongDiepLoi?: string }): Promise<void>;
export interface ChunkOutcome {
  trangThai: "ok" | "failed";
  done?: boolean;              // ok: họ này đã hết trang
  state?: string;              // ok && !done: con trỏ lô kế
  totalQuanSat?: number | null;
  soHdMoi?: number; soHdCapNhat?: number;
  failureKind?: "session_expired" | "rate_limited" | "transient" | "local_limit";
  thongDiepLoi?: string;
  detailCandidates: DetailCandidate[];
}
export function syncChunk(opts: {
  db; transport: GdtTransport; token: string;
  tenantId: string; taikhoanId: string; direction: InvoiceDirection;
  family: "normal" | "sco"; dateFrom: string; dateTo: string;
  lanDongBoId: string; state?: string; maxPages: number; size?: number; retry?: RetryOptions;
}): Promise<ChunkOutcome>;
```

- [ ] **Step 1: Test đỏ** — `chunkSync.test.ts`, các ca:

1. `moDeltaRun` tạo bản ghi `lan_dong_bo` running, `loai='sync'`; `ghiAuditDu` tạo completed `loai='audit'`, soHdMoi=0, có `ketThuc`.
2. `syncChunk` lô 1 (mock transport 2 trang, state còn): upsert đúng số HĐ, run row cộng dồn `soHdMoi`, `checkpoint` = `{family, state, totalQuanSat}`, trả `{trangThai:"ok", done:false, state}`.
3. `syncChunk` lô 2 tiếp state → hết trang: `done:true`; CHẠY LẠI lô 2 (giả lập redelivery) → soHdMoi cộng dồn 0 (idempotent, không nhân đôi hóa đơn — đếm bảng `hoa_don` không đổi).
4. Transport ném 429 (GdtError httpStatus 429) → `{trangThai:"failed", failureKind:"rate_limited"}`, run row KHÔNG đổi (checkpoint giữ nguyên).
5. `chotDeltaRun` completed → trạng thái completed + `ketThuc` set; failed kèm `thongDiepLoi`.

Viết assertion cụ thể theo mẫu seed/PGlite của `test/sync.test.ts` hiện có (dựng db, tenant, tài khoản như các test đó).

- [ ] **Step 2: Chạy đỏ** — `npx vitest run test/chunkSync.test.ts`. Expected: FAIL.

- [ ] **Step 3: Hiện thực `chunkSync.ts`**

```ts
import { TRANG_THAI_LAN_DONG_BO, lanDongBo, withTenant } from "@vat/db";
import { queryInvoicesChunk } from "@vat/gdt-client";
import { and, eq, sql } from "drizzle-orm";
import { classifyFailure, parseDdmmyyyy, tomTatLoi, upsertBatch } from "./sync";

export async function moDeltaRun(db, tenantId, p) {
  return withTenant(db, tenantId, async (tx) => {
    const inserted = await tx.insert(lanDongBo).values({
      tenantId, taikhoanId: p.taikhoanId, chieu: p.direction,
      tuNgay: parseDdmmyyyy(p.dateFrom), denNgay: parseDdmmyyyy(p.dateTo),
      trangThai: TRANG_THAI_LAN_DONG_BO.DANG_CHAY, loai: "sync",
      checkpoint: {}, batDau: new Date(),
    }).returning({ id: lanDongBo.id });
    const row = inserted[0];
    if (!row) throw new Error("moDeltaRun: insert không trả id");
    return row.id;
  });
}

export async function ghiAuditDu(db, tenantId, p) {
  await withTenant(db, tenantId, async (tx) => {
    await tx.insert(lanDongBo).values({
      tenantId, taikhoanId: p.taikhoanId, chieu: p.direction,
      tuNgay: parseDdmmyyyy(p.dateFrom), denNgay: parseDdmmyyyy(p.dateTo),
      trangThai: TRANG_THAI_LAN_DONG_BO.HOAN_THANH, loai: "audit",
      batDau: new Date(), ketThuc: new Date(),
    });
  });
}

export async function chotDeltaRun(db, tenantId, lanDongBoId, kq) {
  await withTenant(db, tenantId, async (tx) => {
    await tx.update(lanDongBo).set({
      trangThai: kq.trangThai,
      ...(kq.thongDiepLoi ? { thongDiepLoi: kq.thongDiepLoi } : {}),
      ketThuc: new Date(),
    }).where(and(eq(lanDongBo.id, lanDongBoId), eq(lanDongBo.tenantId, tenantId)));
  });
}

export async function syncChunk(opts): Promise<ChunkOutcome> {
  let chunk;
  try {
    chunk = await queryInvoicesChunk(opts.transport, opts.token, {
      direction: opts.direction, family: opts.family,
      dateFrom: opts.dateFrom, dateTo: opts.dateTo,
      ...(opts.state ? { state: opts.state } : {}),
      maxPages: opts.maxPages, ...(opts.size ? { size: opts.size } : {}),
    }, opts.retry);
  } catch (err) {
    // KHÔNG đụng run row: message giữ state cũ, retry/reenqueue sẽ nối lại đúng chỗ.
    return {
      trangThai: "failed", failureKind: classifyFailure(err),
      thongDiepLoi: tomTatLoi(err), detailCandidates: [],
    };
  }
  try {
    return await withTenant(opts.db, opts.tenantId, async (tx) => {
      const { soHdMoi, soHdCapNhat, detailCandidates } = await upsertBatch(
        tx, opts.tenantId, chunk.rows,
      );
      await tx.update(lanDongBo).set({
        soHdMoi: sql`${lanDongBo.soHdMoi} + ${soHdMoi}`,
        soHdCapNhat: sql`${lanDongBo.soHdCapNhat} + ${soHdCapNhat}`,
        checkpoint: { family: opts.family, state: chunk.state ?? null, totalQuanSat: chunk.total },
      }).where(and(eq(lanDongBo.id, opts.lanDongBoId), eq(lanDongBo.tenantId, opts.tenantId)));
      return {
        trangThai: "ok" as const, done: !chunk.state,
        ...(chunk.state ? { state: chunk.state } : {}),
        totalQuanSat: chunk.total, soHdMoi, soHdCapNhat, detailCandidates,
      };
    });
  } catch (err) {
    return {
      trangThai: "failed", failureKind: classifyFailure(err),
      thongDiepLoi: tomTatLoi(err), detailCandidates: [],
    };
  }
}
```

Trong `sync.ts`: đổi `function upsertBatch` → `export function upsertBatch` (tương tự `classifyFailure`, `parseDdmmyyyy`) — không đổi thân hàm.

- [ ] **Step 4: Xanh** — `npx vitest run` (packages/sync). Expected: PASS toàn bộ.

- [ ] **Step 5: Commit**

```bash
git add packages/sync
git commit -m "feat(sync): syncChunk commit tung lo + checkpoint; vong doi run delta (mo/ghi-du/chot)"
```

---

### Task 6: sync-worker — `runAuditJob`/`runDeltaJob` + wiring queue

**Files:**
- Create: `apps/sync-worker/src/runDeltaJob.ts`
- Modify: `apps/sync-worker/src/deps.ts` (thêm `makeDeltaJobDeps`), `apps/sync-worker/src/index.ts` (nhánh consumer), `apps/sync-worker/src/types.ts` (Env + optionalize completed fields), `apps/sync-worker/wrangler.jsonc` (var `DELTA_CHUNK_PAGES`)
- Test: `apps/sync-worker/test/runDeltaJob.test.ts` (offline, deps tiêm — theo mẫu `test/runJob.test.ts` hiện có)

**Interfaces:**
- Consumes: Task 2–5 (`queryInvoiceTotal` bọc trong deps, `decideAudit`, `demHoaDonTheoNguon`, `syncChunk`, `moDeltaRun`, `ghiAuditDu`, `chotDeltaRun`), `TenantLimiterClient`, `JobRecorder`, `JobOutcome`, `consumerAction`.
- Produces:

```ts
export interface DeltaJobDeps {
  now(): number;
  loadAccount(msg: { tenantId: string; taikhoanId: string }): Promise<AccountToken | null>;
  limiter: TenantLimiterClient;
  recorder: JobRecorder;
  layTotal(token: string, direction: InvoiceDirection, family: "normal" | "sco",
           dateFrom: string, dateTo: string): Promise<number | null>;
  demTheoNguon(tenantId: string, direction: InvoiceDirection, period: string):
    Promise<{ normal: number; sco: number }>;
  moRun(msg: AuditSyncMessage): Promise<string>;
  ghiDu(msg: AuditSyncMessage): Promise<void>;
  chotRun(tenantId: string, lanDongBoId: string,
          kq: { trangThai: "completed" | "failed" | "can_dang_nhap_lai"; thongDiepLoi?: string }): Promise<void>;
  keoChunk(msg: DeltaPullMessage, token: string): Promise<ChunkOutcome>;
  enqueue(msgs: VatSyncQueueMessage[]): Promise<void>;
  enqueueDetail(msgs: DetailSyncMessage[]): Promise<void>;
  chunkPages: number; // DELTA_CHUNK_PAGES, mặc định 40
}
export function runAuditJob(deps: DeltaJobDeps, msg: AuditSyncMessage): Promise<JobOutcome>;
export function runDeltaJob(deps: DeltaJobDeps, msg: DeltaPullMessage): Promise<JobOutcome>;
```

- [ ] **Step 1: Test đỏ** — các ca chính (fake deps ghi lại lời gọi):

1. **audit vòng 0, đủ** (total ≤ count cả 2 họ) → gọi `ghiDu`, KHÔNG `moRun`/`enqueue`; outcome `completed`.
2. **audit vòng 0, hụt sco** → `moRun` rồi `enqueue` đúng MỘT `DeltaPullMessage` `{family:"sco", conLai:[], vong:1, state:undefined, lanDongBoId, prevCount: normal+sco}`; hụt CẢ 2 họ → `{family:"normal", conLai:["sco"]}`.
3. **audit vòng 1, bão hòa** (prevCount = count hiện tại) → `chotRun` completed kèm `thongDiepLoi` ghi số hụt; outcome `completed`.
4. **audit token hết hạn** → `recorder.reauthPreflight` + outcome `needs_reauth` (mirror runScheduledSync).
5. **delta chunk ok chưa hết trang** → `enqueue` lại CHÍNH message với `state` mới; `enqueueDetail` khi có candidates; outcome `completed`.
6. **delta chunk done, còn `conLai`** → enqueue pull họ kế `{family: conLai[0], conLai: [], state: undefined}` (giữ vong/prevCount/lanDongBoId).
7. **delta chunk done, hết `conLai`** → enqueue `AuditSyncMessage` `{vong: msg.vong, lanDongBoId, prevCount: msg.prevCount}` để kiểm lại.
8. **delta 429** → outcome `retry_backpressure` (KHÔNG enqueue gì); **delta 401** → `recorder.reauthRuntime` + `chotRun(can_dang_nhap_lai)` + `needs_reauth`; **local_limit/transient** → `retry` (message giữ state → nối đúng chỗ).
9. **limiter không cho** (`breaker_open`) → `recorder.breakerSkip`… CHÚ Ý: `breakerSkip` nhận `SyncJobMessage` — audit/delta message có đủ trường period/direction, truyền được; nếu type không khớp thì nới chữ ký `breakerSkip` sang `{tenantId; taikhoanId; period?; direction?}` (đổi type, không đổi hành vi).

- [ ] **Step 2: Chạy đỏ** — `npx vitest run test/runDeltaJob.test.ts` (apps/sync-worker). Expected: FAIL.

- [ ] **Step 3: Hiện thực `runDeltaJob.ts`**

```ts
import type { AuditSyncMessage, DeltaPullMessage, VatSyncQueueMessage } from "@vat/sync";
import { decideAudit } from "@vat/sync";
import type { JobOutcome } from "./types";

export async function runAuditJob(deps: DeltaJobDeps, msg: AuditSyncMessage): Promise<JobOutcome> {
  const account = await deps.loadAccount(msg);
  if (!account) return { kind: "retry", reason: "tai_khoan_khong_ton_tai" };
  if (!account.tokenHienTai || !account.tokenHetHan || account.tokenHetHan.getTime() <= deps.now()) {
    await deps.recorder.reauthPreflight(msg, "token_het_han");
    return { kind: "needs_reauth", reason: "token_het_han" };
  }
  const permit = await deps.limiter.tryAcquire();
  if (!permit.allowed) {
    if (permit.reason === "breaker_open") {
      await deps.recorder.breakerSkip(msg);
      return { kind: "retry_backpressure", reason: "breaker_open" };
    }
    return { kind: "retry_backpressure", reason: "rate_limited" };
  }
  try {
    const [totalNormal, totalSco] = [
      await deps.layTotal(account.tokenHienTai, msg.direction, "normal", msg.dateFrom, msg.dateTo),
      await deps.layTotal(account.tokenHienTai, msg.direction, "sco", msg.dateFrom, msg.dateTo),
    ];
    const dem = await deps.demTheoNguon(msg.tenantId, msg.direction, msg.period);
    const quyetDinh = decideAudit(
      [
        { family: "normal", total: totalNormal, dbCount: dem.normal },
        { family: "sco", total: totalSco, dbCount: dem.sco },
      ],
      msg.vong, msg.prevCount,
    );
    await deps.limiter.recordResult(true);

    if (quyetDinh.kind === "du") {
      if (msg.vong === 0) await deps.ghiDu(msg);
      else if (msg.lanDongBoId) {
        await deps.chotRun(msg.tenantId, msg.lanDongBoId, { trangThai: "completed" });
      }
      return { kind: "completed" };
    }
    if (quyetDinh.kind === "dung") {
      if (msg.lanDongBoId) {
        await deps.chotRun(msg.tenantId, msg.lanDongBoId, {
          trangThai: "completed",
          thongDiepLoi: `delta hội tụ nhưng còn hụt ~${quyetDinh.hutConLai} HĐ so total GDT (total bất ổn) sau ${msg.vong} vòng`,
        });
      }
      return { kind: "completed" };
    }
    // keo — mở run (vòng 0) hoặc dùng run sẵn, enqueue pull họ đầu, họ sau vào conLai.
    const lanDongBoId = msg.lanDongBoId ?? (await deps.moRun(msg));
    const [family, ...conLai] = quyetDinh.families;
    await deps.enqueue([{
      kind: "delta", tenantId: msg.tenantId, taikhoanId: msg.taikhoanId,
      direction: msg.direction, dateFrom: msg.dateFrom, dateTo: msg.dateTo,
      period: msg.period, lanDongBoId, family: family as "normal" | "sco",
      conLai: conLai as ("normal" | "sco")[],
      vong: msg.vong + 1, prevCount: dem.normal + dem.sco,
    }]);
    return { kind: "completed" };
  } catch (err) {
    // 401 giữa audit → token chết; 429 → backpressure; còn lại retry.
    /* dùng classifyFailure re-export từ @vat/sync trên err, ánh xạ như runScheduledSync:
       session_expired → recorder.reauthRuntime + needs_reauth (KHÔNG recordResult false);
       rate_limited → retry_backpressure; local_limit → retry KHÔNG recordResult false;
       transient → limiter.recordResult(false) + retry. */
  }
}

export async function runDeltaJob(deps: DeltaJobDeps, msg: DeltaPullMessage): Promise<JobOutcome> {
  const account = await deps.loadAccount(msg);
  if (!account) return { kind: "retry", reason: "tai_khoan_khong_ton_tai" };
  if (!account.tokenHienTai || !account.tokenHetHan || account.tokenHetHan.getTime() <= deps.now()) {
    await deps.recorder.reauthPreflight(msg, "token_het_han");
    return { kind: "needs_reauth", reason: "token_het_han" };
  }
  const permit = await deps.limiter.tryAcquire();
  if (!permit.allowed) {
    if (permit.reason === "breaker_open") {
      await deps.recorder.breakerSkip(msg);
      return { kind: "retry_backpressure", reason: "breaker_open" };
    }
    return { kind: "retry_backpressure", reason: "rate_limited" };
  }
  const kq = await deps.keoChunk(msg, account.tokenHienTai);
  if (kq.trangThai === "failed") {
    const laSucKhoeGdt = kq.failureKind !== "session_expired" && kq.failureKind !== "local_limit";
    if (laSucKhoeGdt) await deps.limiter.recordResult(false);
    if (kq.failureKind === "session_expired") {
      await deps.recorder.reauthRuntime(msg, "session_expired");
      await deps.chotRun(msg.tenantId, msg.lanDongBoId, { trangThai: "can_dang_nhap_lai" });
      return { kind: "needs_reauth", reason: "session_expired" };
    }
    if (kq.failureKind === "rate_limited") {
      return { kind: "retry_backpressure", reason: "rate_limited" };
    }
    if (kq.failureKind === "local_limit") {
      // XÁC MINH SUBREQUEST (spec §7): log tường minh để chốt nguyên nhân trần.
      console.warn(
        `[delta] local_limit: chunkPages=${deps.chunkPages} kỳ=${msg.period} họ=${msg.family} — kiểm gói Workers (Paid≠zone Pro) + hạ DELTA_CHUNK_PAGES nếu tái diễn`,
      );
    }
    return { kind: "retry", reason: kq.thongDiepLoi ?? "transient" };
  }
  await deps.limiter.recordResult(true);
  if (kq.detailCandidates.length > 0) {
    try {
      await deps.enqueueDetail(buildDetailMessages(msg, kq.detailCandidates));
    } catch (err) {
      return { kind: "retry", reason: `enqueue_detail_that_bai: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
  const next: VatSyncQueueMessage = !kq.done
    ? { ...msg, ...(kq.state ? { state: kq.state } : {}), bpAttempt: undefined }
    : msg.conLai.length > 0
      ? { ...msg, family: msg.conLai[0] as "normal" | "sco", conLai: msg.conLai.slice(1),
          state: undefined, bpAttempt: undefined }
      : { kind: "audit", tenantId: msg.tenantId, taikhoanId: msg.taikhoanId,
          direction: msg.direction, dateFrom: msg.dateFrom, dateTo: msg.dateTo,
          period: msg.period, vong: msg.vong, lanDongBoId: msg.lanDongBoId,
          prevCount: msg.prevCount };
  await deps.enqueue([next]);
  return { kind: "completed" };
}
```

(Với `state: undefined`/`bpAttempt: undefined`: nếu tsconfig bật `exactOptionalPropertyTypes`, dựng object mới bằng destructuring bỏ trường thay vì gán undefined.)

`types.ts`: đổi `JobOutcome.completed` thành `{ kind: "completed"; lanDongBoId?: string; soHdMoi?: number; soHdCapNhat?: number }` (audit không có run id — optionalize, không phá call-site hiện có).

`deps.ts` — `makeDeltaJobDeps(env, db, msg)`: bọc `queryInvoiceTotal` (transport + retry config sẵn có của makeJobDeps), `demHoaDonTheoNguon`, `moDeltaRun`/`ghiAuditDu`/`chotDeltaRun`, `syncChunk` (maxPages = `parseNonNegInt(env.DELTA_CHUNK_PAGES, 40)`), enqueue = `chunkForQueue` + `SYNC_QUEUE.sendBatch` (mẫu enqueueDetail hiện có). `Env` thêm `DELTA_CHUNK_PAGES?: string`; `wrangler.jsonc` vars thêm `"DELTA_CHUNK_PAGES": "40"`.

`index.ts` — trong vòng for message, mở rộng phân nhánh:

```ts
const action = isDetailMessage(body)
  ? detailConsumerAction(await runDetailJob(makeDetailJobDeps(env, db, body), body), actionOpts)
  : isAuditMessage(body)
    ? consumerAction(await runAuditJob(makeDeltaJobDeps(env, db, body), body), actionOpts)
    : isDeltaMessage(body)
      ? consumerAction(await runDeltaJob(makeDeltaJobDeps(env, db, body), body), actionOpts)
      : consumerAction(await runScheduledSync(makeJobDeps(env, db, body), body), actionOpts);
```

- [ ] **Step 4: Xanh** — `npx vitest run` (apps/sync-worker) + `make lint`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/sync-worker
git commit -m "feat(sync-worker): runAuditJob/runDeltaJob — chuoi audit→keo lo→kiem lai, noi vao queue vat-sync"
```

---

### Task 7: API — backfill mặc định đi đường delta (audit mọi tháng)

**Files:**
- Modify: `apps/api/src/routes/taxAccounts.ts` (POST `/:id/backfill`)
- Modify: `apps/api/src/backfillTracker.ts` (`BackfillDef` + `mode?: "delta" | "force"`)
- Test: test route backfill hiện có của apps/api (tìm theo `grep -rn "backfill" apps/api/test`)

**Interfaces:**
- Consumes: `buildAuditMessages` (Task 3).
- Produces: hợp đồng HTTP GIỮ NGUYÊN — `202 { backfillId, thangCanLay, tongSoThang }`; khác biệt: không-force giờ LUÔN trả đủ mọi tháng trong khoảng (không còn `backfillId:null` khi "đã phủ", trừ khi khoảng rỗng — không xảy ra vì monthlyWindows ≥1 tháng).

- [ ] **Step 1: Test đỏ** — sửa/bổ sung test route:

1. Không force, khoảng 2 tháng ĐÃ phủ completed → vẫn 202 với `tongSoThang: 2`, và queue nhận 4 message `kind:"audit"` (2 tháng × 2 chiều), `vong: 0`.
2. `force: true` → giữ nguyên hành vi cũ: message dạng header legacy (không `kind`) đủ mọi tháng.
3. Token hết hạn → 409 (không đổi); audit log có `force` + `tongSoThang` (không đổi).

- [ ] **Step 2: Chạy đỏ**. Expected: FAIL (hiện trả 0 tháng khi đã phủ).

- [ ] **Step 3: Hiện thực** — thay khối tính `msgs`/`monthsNeeded` trong `withTenant`:

```ts
const outcome = await withTenant(db, tenantId, async (tx) => {
  const rows = await tx
    .select({ tokenHetHan: taiKhoanThue.tokenHetHan })
    .from(taiKhoanThue)
    .where(and(eq(taiKhoanThue.id, id), eq(taiKhoanThue.tenantId, tenantId)));
  const acc = rows[0];
  if (!acc) return { kind: "not_found" as const };
  if (!acc.tokenHetHan || acc.tokenHetHan.getTime() <= Date.now()) {
    return { kind: "token_het_han" as const };
  }
  // Delta-sync (spec 2026-07-26): mặc định KHÔNG bỏ tháng đã phủ nữa — mỗi tháng một
  // job audit rẻ (1–2 request GDT) tự quyết đủ/hụt; coverage nhị phân là lỗ hổng A2
  // đã gây kẹt 6802 (docs/CHAN-DOAN). force giữ đường legacy full-month.
  const msgs: VatSyncQueueMessage[] = parsed.data.force
    ? directions.flatMap((dir) =>
        buildBackfillMessages({ tenantId, taikhoanId: id }, windows, [dir]))
    : buildAuditMessages({ tenantId, taikhoanId: id }, windows, [...directions]);
  return { kind: "ok" as const, msgs, months: windows.map((w) => w.period) };
});
```

(Import `buildAuditMessages`, kiểu `VatSyncQueueMessage` từ `@vat/sync`; bỏ import `missingMonths` nếu không còn dùng ở route này.) `init` tracker thêm `mode: parsed.data.force ? "force" : "delta"` — `BackfillDef` thêm trường optional (def cũ trong DO không có → tương thích).

- [ ] **Step 4: Xanh** — test apps/api + `make lint`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api packages/sync
git commit -m "feat(api): backfill mac dinh enqueue audit moi thang (delta) — bo coverage nhi phan; force giu legacy"
```

---

### Task 8: Tiến độ — trạng thái tháng `du` (đủ, không kéo)

**Files:**
- Modify: `packages/sync/src/coverage.ts` (`deriveBackfillStatus`, `monthlyBackfillStatus`, `BackfillMonthStatus`)
- Test: `packages/sync/test/coverage.test.ts` (bổ sung)

**Interfaces:**
- Produces: `BackfillMonthStatus = "cho" | "dang_chay" | "xong" | "du" | "loi"` — `"du"` = tháng xong mà MỌI bản ghi completed đều `loai='audit'` (không phải kéo gì). `deriveBackfillStatus` nhận rows có thêm `loai?: string`; `monthlyBackfillStatus` select thêm cột `loai`. Frontend (Task 12) coi `du` ⊂ nhóm-đã-xong.

- [ ] **Step 1: Test đỏ**:

```ts
it("tháng chỉ có audit-completed (mọi chiều) → 'du'; có sync-completed → 'xong'", () => {
  const rows = [
    { period: "2026-06", chieu: "purchase" as const, trangThai: "completed", loai: "audit" },
    { period: "2026-06", chieu: "sold" as const, trangThai: "completed", loai: "audit" },
    { period: "2026-07", chieu: "purchase" as const, trangThai: "completed", loai: "sync" },
    { period: "2026-07", chieu: "sold" as const, trangThai: "completed", loai: "audit" },
  ];
  const p = deriveBackfillStatus(rows, ["purchase", "sold"], ["2026-06", "2026-07"]);
  expect(p.thang).toEqual([
    { period: "2026-06", trangThai: "du" },
    { period: "2026-07", trangThai: "xong" },
  ]);
  expect(p.soXong).toBe(2); // du tính là xong
  expect(p.trangThaiTong).toBe("hoan_thanh");
});
it("rows không có loai (legacy) → hành vi cũ ('xong')", () => {
  const rows = [{ period: "2026-06", chieu: "purchase" as const, trangThai: "completed" }];
  expect(deriveBackfillStatus(rows, ["purchase"], ["2026-06"]).thang[0].trangThai).toBe("xong");
});
```

- [ ] **Step 2: Chạy đỏ**. Expected: FAIL.

- [ ] **Step 3: Hiện thực** — trong `deriveBackfillStatus`: bên cạnh map trạng thái, giữ map `coCompletedSync: Set<"period|chieu">` (row completed mà `loai !== "audit"` — legacy không `loai` tính là sync). Tháng đạt điều kiện "xong" hiện tại → nếu KHÔNG chiều nào nằm trong `coCompletedSync` → `"du"`, ngược lại `"xong"`; `soXong` đếm cả hai. `monthlyBackfillStatus` select thêm `loai: lanDongBo.loai` và truyền xuống.

- [ ] **Step 4: Xanh** — `npx vitest run test/coverage.test.ts` + toàn packages/sync. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sync
git commit -m "feat(sync): tien do backfill phan biet 'du' (audit đủ, không kéo) với 'xong' (đã kéo)"
```

---

### Task 9: Cron — audit tháng liền trước (đóng lỗ hổng A1)

**Files:**
- Modify: `packages/sync/src/syncJob.ts` (thêm `previousPeriodWindow`), `apps/sync-worker/src/schedule.ts` (re-export nếu file này là facade), `apps/sync-worker/src/index.ts` (`scheduled()`)
- Test: `packages/sync/test/syncJob.test.ts` + test schedule hiện có của apps/sync-worker

**Interfaces:**
- Produces: `export function previousPeriodWindow(nowMs: number): PeriodWindow` — tháng LIỀN TRƯỚC theo giờ VN (cuộn năm: 01/2027 → 12/2026).

- [ ] **Step 1: Test đỏ**:

```ts
it("previousPeriodWindow: giữa tháng 7 VN → kỳ 2026-06; 01/01 00:30 VN → 2025-12", () => {
  const t1 = Date.UTC(2026, 6, 15); // 15/07/2026 UTC ≈ VN cùng ngày
  expect(previousPeriodWindow(t1)).toEqual({
    period: "2026-06", dateFrom: "01/06/2026", dateTo: "30/06/2026",
  });
  const t2 = Date.UTC(2025, 11, 31, 17, 30); // = 00:30 01/01/2026 giờ VN
  expect(previousPeriodWindow(t2).period).toBe("2025-12");
});
```

- [ ] **Step 2: Chạy đỏ**. Expected: FAIL.

- [ ] **Step 3: Hiện thực** trong `syncJob.ts` (tái dùng `monthWindow` private):

```ts
/** Kỳ THÁNG LIỀN TRƯỚC theo giờ VN — cron audit để hóa đơn người bán đẩy trễ tự được
 * vá (đóng lỗ hổng A1, docs/CHAN-DOAN). */
export function previousPeriodWindow(nowMs: number): PeriodWindow {
  const vn = new Date(nowMs + VN_OFFSET_MS);
  let y = vn.getUTCFullYear();
  let m0 = vn.getUTCMonth() - 1;
  if (m0 < 0) { m0 = 11; y -= 1; }
  return monthWindow(y, m0);
}
```

Trong `index.ts` `scheduled()`, sau khối enqueue msgs hiện có, thêm (cùng chunk + jitter):

```ts
// Delta-sync: audit tháng LIỀN TRƯỚC mỗi ngày — vá hóa đơn về muộn (A1). Chi phí
// 1–2 request GDT / (account × chiều) / ngày; hụt mới kéo.
const prev = previousPeriodWindow(nowMs);
const auditMsgs = due.flatMap((a) =>
  buildAuditMessages({ tenantId: a.tenantId, taikhoanId: a.taikhoanId }, [prev], [
    "purchase", "sold",
  ]),
);
for (const chunk of chunkForQueue(auditMsgs, QUEUE_MAX_BATCH_COUNT, QUEUE_MAX_BATCH_BYTES)) {
  await env.SYNC_QUEUE.sendBatch(
    chunk.map((body) => ({
      body,
      delaySeconds: jitterDelaySeconds(body.tenantId, jitterSpreadSeconds),
    })),
  );
}
```

(`due` phần tử có shape `{tenantId, taikhoanId}` — đối chiếu `enumerateDueAccounts` trong `schedule.ts` trước khi code, chỉnh tên trường theo thực tế.)

- [ ] **Step 4: Xanh** + `make lint`. **Step 5: Commit**

```bash
git add packages/sync apps/sync-worker
git commit -m "feat(sync-worker): cron audit thang lien truoc — thang cu tu lanh (A1)"
```

---

### Task 10: Xác minh bằng chứng subrequest (spec §7) + cập nhật tài liệu chẩn đoán

**Files:**
- Modify: `docs/CHAN-DOAN-thieu-hoa-don-thang.md` (mục mới "Xác minh trần subrequest 2026-07-26")

Log tại chỗ đã nằm trong Task 6 (nhánh `local_limit` của `runDeltaJob`). Task này là bước VẬN HÀNH + tài liệu:

- [ ] **Step 1:** Ghi vào tài liệu chẩn đoán mục hướng dẫn xác minh (để thực hiện ở Task 14 sau deploy): (a) Dashboard Cloudflare → Workers & Pages → Plan: chụp/chép nguyên văn gói (phân biệt **Workers Paid** với **zone Pro**); (b) `npx wrangler tail vat-sync-worker --search "local_limit"` trong lúc chạy delta tháng 6; (c) kết luận + ngày + điều chỉnh `DELTA_CHUNK_PAGES` nếu cần. Đánh dấu rõ ràng mọi ô chưa điền là "CHƯA KIỂM CHỨNG — điền ở bước nghiệm thu".
- [ ] **Step 2: Commit**

```bash
git add docs/CHAN-DOAN-thieu-hoa-don-thang.md
git commit -m "docs(chan-doan): khung xac minh tran subrequest (Paid vs Free) — dien so lieu khi nghiem thu"
```

---

## Slice 2 — Frontend "Tra cứu hóa đơn"

### Task 11: Primitive `InfoTip` (icon ⓘ + tooltip)

**Files:**
- Modify: `apps/web/src/components/ui/primitives.tsx`
- Test: `apps/web/test/features/infoTip.test.tsx`

**Interfaces:**
- Produces: `export function InfoTip({ text, label }: { text: string; label?: string })` — icon ⓘ focus được (tabIndex 0), tooltip hiện khi hover/focus, `aria-describedby` trỏ id tooltip, `role="tooltip"`. Token-only.

- [ ] **Step 1: Test đỏ** (theo mẫu render test primitives hiện có, vd `primitivesSelectField.test.tsx`):

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { InfoTip } from "../../src/components/ui/primitives";

it("ẩn mặc định, hiện khi focus, aria nối đúng", () => {
  render(<InfoTip text="Kiểm tra và kéo phần còn thiếu" label="Giải thích đồng bộ" />);
  const trigger = screen.getByLabelText("Giải thích đồng bộ");
  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.focus(trigger);
  const tip = screen.getByRole("tooltip");
  expect(tip.textContent).toContain("Kiểm tra và kéo phần còn thiếu");
  expect(trigger.getAttribute("aria-describedby")).toBe(tip.id);
  fireEvent.blur(trigger);
  expect(screen.queryByRole("tooltip")).toBeNull();
});
```

- [ ] **Step 2: Chạy đỏ** — `npx vitest run test/features/infoTip.test.tsx` (apps/web). Expected: FAIL.

- [ ] **Step 3: Hiện thực** (cuối primitives.tsx):

```tsx
// --- InfoTip (ⓘ + tooltip) ------------------------------------------------------------
// Ghi chú giải thích KHÔNG chiếm mặt tiền (spec 2026-07-26): icon ⓘ nhỏ, hover/focus mới
// hiện. a11y: trigger focus được (tabIndex 0), aria-describedby ↔ role="tooltip".
let infoTipSeq = 0;
export function InfoTip({ text, label = "Giải thích" }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [id] = useState(() => `infotip-${++infoTipSeq}`);
  return (
    <span
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span
        tabIndex={0}
        aria-label={label}
        aria-describedby={open ? id : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        style={{
          cursor: "help",
          color: "var(--text-tertiary)",
          fontSize: "var(--fs-sm)",
          lineHeight: 1,
          padding: "var(--sp-1)",
        }}
      >
        ⓘ
      </span>
      {open && (
        <span
          role="tooltip"
          id={id}
          style={{
            position: "absolute",
            bottom: "100%",
            left: "50%",
            transform: "translateX(-50%)",
            marginBottom: "var(--sp-2)",
            width: "max-content",
            maxWidth: 280,
            padding: "var(--sp-2) var(--sp-3)",
            borderRadius: "var(--radius-md)",
            background: "var(--surface-inverse, var(--text-primary))",
            color: "var(--surface-base, #fff)",
            fontSize: "var(--fs-xs)",
            zIndex: 10,
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}
```

Token `--surface-inverse`/`--radius-md`: đối chiếu `apps/web/src/styles/tokens.css` — nếu tên khác thì dùng đúng token sẵn có (KHÔNG bịa token mới, KHÔNG hex trần; nếu thiếu token nền tooltip thì thêm token vào `tokens.css`).

- [ ] **Step 4: Xanh** + convention test (`ui-luat.test.ts`) vẫn xanh (style nội tuyến ở `components/ui/` được phép).
- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web/ui): primitive InfoTip (icon ⓘ + tooltip a11y) — ghi chú không chiếm mặt tiền"
```

---

### Task 12: Thẻ "Tra cứu hóa đơn" — gộp lọc + đồng bộ, bỏ tự tải file, bấm lại được

**Files:**
- Modify: `apps/web/src/features/invoices/InvoicesPage.tsx`, `FilterBar.tsx`, `RangeSyncPanel.tsx`, `useRangeBackfill.ts`, `apps/web/src/types/api.ts`
- Test: `apps/web/test/features/invoiceRangeSync.test.tsx` (sửa) + case mới

**Interfaces:**
- Consumes: `InfoTip` (Task 11); trạng thái tháng mới `"du"` (Task 8).
- Produces:
  - `FilterBar` thêm prop `hanhDongPhu?: ReactNode` — render LIỀN SAU nút "Lọc dữ liệu" trong cùng hàng.
  - `RangeSyncPanel` KHÔNG còn nút — chỉ tiến độ + cảnh báo (props `backfill` giữ, bỏ `loiTaiXuong`).
  - `useRangeBackfill`: `start()` chạy lại được sau khi kết thúc (mỗi lần bấm một lượt mới).
  - `types/api.ts`: `BackfillProgress.thang[].trangThai` union thêm `"du"`.

- [ ] **Step 1: Test đỏ** — sửa `invoiceRangeSync.test.tsx`:

1. Trang render MỘT thẻ có `SectionLabel` "Tra cứu hóa đơn" chứa cả ô lọc lẫn nút "Đồng bộ từ Thuế"; KHÔNG còn thẻ "Đồng bộ từ Tổng cục Thuế" riêng; KHÔNG còn chữ "Đồng bộ và tải xuống".
2. Bấm "Đồng bộ từ Thuế" → POST backfill được gọi (mock apiClient như test hiện có); sau khi progress `hoan_thanh` → KHÔNG có gọi tải file (mock `taiXuatHoaDon` KHÔNG được gọi).
3. Bấm nút lần HAI sau khi xong → POST backfill được gọi LẦN NỮA (case chống staleTime cũ).
4. Tháng trả `trangThai: "du"` được đếm vào tiến độ đã-xong (banner "Đã đồng bộ xong…" khi tổng hoàn thành).
5. Có icon ⓘ với tooltip chứa "kéo phần còn thiếu" (getByLabelText "Giải thích đồng bộ" → focus → thấy text).
6. Vai `ke_toan` → không thấy nút Đồng bộ (gate `canSync` giữ nguyên).

- [ ] **Step 2: Chạy đỏ**. Expected: FAIL.

- [ ] **Step 3: Hiện thực**

`useRangeBackfill.ts` — thay `clickedRange` bằng bộ đếm lượt:

```ts
// `lan` tăng mỗi lần bấm → queryKey đổi → chạy lượt MỚI kể cả cùng khoảng (sửa lỗi
// staleTime Infinity nuốt lần bấm thứ hai — spec 2026-07-26 §4).
const [lan, setLan] = useState(0);
const [clickedRange, setClickedRange] = useState<string | null>(null);
const manual = hasRange && clickedRange === rangeKey;
// ...
const startQ = useQuery({
  queryKey: ["range-backfill", tuNgay, denNgay, lan],
  // ... giữ nguyên phần còn lại
});
// ...
return {
  state,
  lineResult: startQ.data ? startQ.data.dongHang : null,
  start: () => {
    setClickedRange(rangeKey);
    setLan((n) => n + 1);
  },
};
```

`FilterBar.tsx` — thêm prop và render:

```tsx
export function FilterBar({ value, onApply, hanhDongPhu }: {
  value: InvoiceFilter;
  onApply: (next: InvoiceFilter) => void;
  hanhDongPhu?: ReactNode;
}) {
  // ... hàng nút cuối:
        <Button variant="secondary" onClick={() => onApply(draft)}>
          Lọc dữ liệu
        </Button>
        {hanhDongPhu}
```

`RangeSyncPanel.tsx` — xóa khối nút + câu phụ (dòng 64-73) và prop `loiTaiXuong`; giữ ProgressBar + alerts; `thangHienTai` tính bỏ qua cả `"du"`:

```ts
const thangHienTai = x.progress.thang.find(
  (t) => t.trangThai !== "xong" && t.trangThai !== "du",
)?.period;
```

(sửa trong `deriveRangeBackfillState` của useRangeBackfill — nơi logic này đang sống.)

`InvoicesPage.tsx`:

```tsx
{/* (a) Tra cứu hóa đơn — lọc (đọc nhẹ) + đồng bộ (kéo nặng) trong MỘT thẻ; hai nút
    tách bạch theo hợp đồng tương tác ui.md. Ghi chú dài → InfoTip (spec 2026-07-26). */}
<Card style={{ marginBottom: "var(--sp-4)" }}>
  <SectionLabel>Tra cứu hóa đơn</SectionLabel>
  <FilterBar
    value={filter}
    onApply={applyFilter}
    hanhDongPhu={
      nenHienPanelDongBo(filter, canSync) ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--sp-1)" }}>
          <Button onClick={backfill.start} disabled={backfillRunning}>
            {backfillRunning ? "Đang đồng bộ…" : "Đồng bộ từ Thuế"}
          </Button>
          <InfoTip
            label="Giải thích đồng bộ"
            text="Kiểm tra và kéo phần còn thiếu từ máy chủ thuế cho kỳ đã chọn — chạy nền."
          />
        </span>
      ) : undefined
    }
  />
  {nenHienPanelDongBo(filter, canSync) && <RangeSyncPanel backfill={backfill} />}
  <div style={{ marginTop: "var(--sp-4)", fontSize: "var(--fs-xs)", color: "var(--text-disabled)" }}>
    Đã ghi nhớ bộ lọc gần nhất · Giờ hiển thị theo VN (UTC+7)
  </div>
</Card>
```

XÓA: state `taiSauDongBo`, mutation `xuatSauDongBo`, effect tự tải, prop `loiTaiXuong`, thẻ Card "Đồng bộ từ Tổng cục Thuế" cũ; `backfill` giờ = `backfillGoc` trực tiếp. `types/api.ts`: union tháng thêm `"du"`.

- [ ] **Step 4: Xanh** — `npx vitest run` (apps/web) + `make lint`. Expected: PASS, không còn tham chiếu `taiXuatHoaDon` trong InvoicesPage (nút Xuất ở thẻ Kết quả vẫn dùng).
- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web/invoices): the 'Tra cuu hoa don' — gop loc + dong bo, bo tu tai file, bam lai duoc"
```

---

### Task 13: Thẻ Kết quả — 4 số thống kê

**Files:**
- Modify: `apps/web/src/features/invoices/InvoicesPage.tsx`
- Test: `apps/web/test/features/invoiceSummaryStats.test.tsx` (mới)

**Interfaces:**
- Consumes: `summary.data.total: MoneyTotals` (sẵn có: `tongTcthue`/`tongTthue`/`tongTtbso` chuỗi numeric), `formatMoney` (`lib/format.ts` — chuỗi-an-toàn, KHÔNG Number()), `labelOf` (`@vat/domain` Registry: `tgtcthue`→"Tiền chưa thuế", `tgtthue`→"Tiền thuế", `tgtttbso`→"Tổng thanh toán").

- [ ] **Step 1: Test đỏ**:

```tsx
it("hiện đủ 4 số từ summary, tiền in đầy đủ + ₫, null → —", async () => {
  // mock api.getSummary → { byChieu: [...], total: { count: 6802,
  //   tongTcthue: "12480350200", tongTthue: "1198412016", tongTtbso: null } }
  // render InvoicesPage (mẫu setup test invoiceRangeSync)
  expect(await screen.findByText("6.802")).toBeTruthy();
  expect(screen.getByText("12.480.350.200 ₫")).toBeTruthy();
  expect(screen.getByText("Tiền chưa thuế")).toBeTruthy();
  expect(screen.getByText("1.198.412.016 ₫")).toBeTruthy();
  expect(screen.getByText("—")).toBeTruthy(); // tongTtbso null
});
```

- [ ] **Step 2: Chạy đỏ**. Expected: FAIL.

- [ ] **Step 3: Hiện thực** — trong nhánh `count > 0` của thẻ Kết quả, thay `Stat` đơn bằng cụm 4 `Stat` (nhãn từ Registry — ui.md nhãn một-nguồn):

```tsx
import { labelOf } from "@vat/domain";
import { formatMoney } from "../../lib/format";

/** "12480350200" → "12.480.350.200 ₫"; null/rỗng → "—" (không giá trị giả). */
export function tienStat(v: string | null | undefined): string {
  const s = formatMoney(v ?? null);
  return s ? `${s} ₫` : "—";
}

// ... trong JSX:
<div style={{ display: "flex", gap: "var(--sp-6)", flexWrap: "wrap", alignItems: "flex-start" }}>
  <Stat
    value={count}
    label="hóa đơn khớp bộ lọc"
    badge={badgeKy ? <Badge><span className="tabular">Kỳ {badgeKy}</span></Badge> : undefined}
  />
  <Stat value={tienStat(summary.data?.total.tongTcthue)} label={labelOf("tgtcthue")} />
  <Stat value={tienStat(summary.data?.total.tongTthue)} label={labelOf("tgtthue")} />
  <Stat value={tienStat(summary.data?.total.tongTtbso)} label={labelOf("tgtttbso")} />
</div>
```

(Nếu `apps/web` chưa import được `@vat/domain`: kiểm `package.json` workspace — FilterBar đã import `INVOICE_FIELDS` từ `@vat/domain` nên sẵn đường dẫn.) Kích thước chữ 4 Stat nếu quá lớn khi đứng cạnh nhau: giữ nguyên primitive, KHÔNG tô kiểu nội tuyến đè — nếu cần cỡ nhỏ hơn, thêm biến thể `co?: "sm"` vào `Stat` trong primitives (một nơi).

- [ ] **Step 4: Xanh** + `make lint`. **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web/invoices): 4 so thong ke ket qua — so HD + chua thue + tien thue + thanh toan (summary san co)"
```

---

### Task 14: Cổng cuối — lint/test toàn repo, review chéo, deploy, nghiệm thu end-to-end

**Files:** không sửa code mới (chỉ số liệu nghiệm thu vào `docs/CHAN-DOAN-thieu-hoa-don-thang.md`).

- [ ] **Step 1: Toàn cổng cục bộ**

Run: `make lint && make test && make test-contract`
Expected: tất cả xanh; dán kết quả vào báo cáo giao nộp.

- [ ] **Step 2: Review chéo bằng subagent** (Định nghĩa hoàn thành + CLAUDE.md quy trình): chạy `contract-guardian` (đụng packages/gdt-client) và `dod-auditor` (toàn đơn vị). Sửa finding trước khi đi tiếp.

- [ ] **Step 3: Migration + deploy** (thứ tự: DB → worker → api → web)

```bash
make migrate                                # ALTER lan_dong_bo (checkpoint, loai)
cd apps/sync-worker && npx wrangler deploy  # consumer hiểu audit/delta TRƯỚC khi producer gửi
cd ../api && npx wrangler deploy
cd ../web && npm run build
grep -l "Đồng bộ từ Thuế" dist/assets/*.js  # bài học: luôn grep bundle trước deploy
npx wrangler deploy
```

Ghi lại Version ID từng app.

- [ ] **Step 4: Nghiệm thu end-to-end (production, MST 4201969169)**

1. Đăng nhập vatengine.tourdao.vn (tài khoản quản trị) → thẻ "Tra cứu hóa đơn" → kỳ 01/06–30/06, chiều **Mua vào** → "Đồng bộ từ Thuế".
2. Theo dõi tiến độ (kiểm → kéo); đồng thời `npx wrangler tail vat-sync-worker --search "delta"` quan sát chuỗi lô.
3. Sau hoàn thành: số Mua vào tháng 6 kỳ vọng 6802 → **≥6981** (mức probe đã chứng minh); 4 số thống kê hiện đúng.
4. Xuất Excel đúng chiều **Mua vào** (KHÔNG nhầm Bán ra như file 26/07) → đối chiếu với `docs/doi_chieu_data/MUA_VAO_4201969169.xlsx`.
5. Điền kết quả xác minh subrequest (Task 10) + số liệu sau-nghiệm-thu vào `docs/CHAN-DOAN-thieu-hoa-don-thang.md` (lệnh + con số + ngày).
6. Nếu vẫn kẹt 429/không tăng: ghi nhận bằng chứng `wrangler tail`, hạ `DELTA_CHUNK_PAGES` (var, không cần build lại) và/hoặc tăng backoff — báo lại chủ dự án, KHÔNG mở rộng phạm vi.

- [ ] **Step 5: Commit chốt tài liệu**

```bash
git add docs/CHAN-DOAN-thieu-hoa-don-thang.md
git commit -m "docs(chan-doan): so lieu nghiem thu delta-sync thang 6 + ket luan tran subrequest"
```

---

## Self-review đã chạy (khi soạn plan)

- **Spec coverage:** §3.1 delta engine → Task 2–6; §3.2 cron A1 → Task 9; §3.3 progress → Task 8; §3.4 migration → Task 1; §4 UX → Task 11–12; §5 stats → Task 13; §6 test đan xuyên từng task; §7 xác minh → Task 6 (log) + 10 + 14; §8 phạm vi: không UI force (route force giữ nguyên Task 7), không Workflows.
- **Type consistency:** `ChunkOutcome`/`DeltaJobDeps`/message unions dùng thống nhất Task 5→6; `BackfillMonthStatus` mở rộng Task 8 → types/api.ts Task 12.
- **Điểm executor PHẢI đối chiếu code thật trước khi viết** (đã ghi tại chỗ trong từng task): shape mock `GdtTransport` (Task 2), helper PGlite test sync (Task 5), chữ ký `breakerSkip` (Task 6), shape `enumerateDueAccounts` (Task 9), tên token tooltip trong `tokens.css` (Task 11), `exactOptionalPropertyTypes` (Task 6).

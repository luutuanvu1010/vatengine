// U26 (pha 2) — Test END-TO-END một message chi tiết trên Postgres WASM (PGlite):
// persist THẬT qua withTenant + persistInvoiceLines (idempotent xóa-chèn, quyết định
// C), token chết THẬT qua dbRecorder.reauthRuntime, RLS cách ly tenant. Mock
// fetchLines (offline). Unit test (runDetailJob.test.ts) đã lái logic; file này chốt
// composition với DB thật theo luật multi-tenant.md ("ít nhất một ca 2 tenant").
import { PGlite } from "@electric-sql/pglite";
import {
  auditLog,
  dongHangHoa,
  hoaDon,
  storeToken,
  taiKhoanThue,
  tenants,
  withTenant,
} from "@vat/db";
import { GdtError } from "@vat/gdt-client";
import type { InvoiceLine } from "@vat/gdt-client";
import { type DetailSyncMessage, persistInvoiceLines } from "@vat/sync";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { dbRecorder, loadAccountToken } from "../../src/recorder";
import { runDetailJob } from "../../src/runDetailJob";
import type { RunDetailJobDeps } from "../../src/runDetailJob";
import type { TenantLimiterClient } from "../../src/types";

const MIGRATIONS = new URL("../../../../packages/db/migrations", import.meta.url).pathname;
const NOW = Date.UTC(2026, 6, 17, 3, 0, 0);
const KEK = btoa(String.fromCharCode(...new Uint8Array(32)));

type Db = ReturnType<typeof drizzle>;

async function freshDb(): Promise<Db> {
  const db = drizzle(new PGlite());
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

async function makeTenant(db: Db, ten: string, mst: string): Promise<string> {
  const rows = await db.insert(tenants).values({ ten, mst }).returning({ id: tenants.id });
  const row = rows[0];
  if (!row) throw new Error("insert tenant không trả về id");
  return row.id;
}

async function makeAccountWithToken(db: Db, tenantId: string, username: string): Promise<string> {
  const rows = await db
    .insert(taiKhoanThue)
    .values({ tenantId, username })
    .returning({ id: taiKhoanThue.id });
  const row = rows[0];
  if (!row) throw new Error("insert tai_khoan_thue không trả về id");
  await withTenant(db, tenantId, (tx) =>
    storeToken(tx, tenantId, row.id, "jwt-token-detail", new Date(NOW + 3_600_000), KEK),
  );
  return row.id;
}

async function makeInvoice(db: Db, tenantId: string, shdon: string): Promise<string> {
  const rows = await withTenant(db, tenantId, (tx) =>
    tx
      .insert(hoaDon)
      .values({
        tenantId,
        nbmst: "0100000001",
        khmshdon: "1",
        khhdon: "C26TAA",
        shdon,
        tdlap: new Date("2026-04-12T17:00:00Z"),
        chieu: "purchase",
        nguon: "normal",
        rawJson: {},
      })
      .returning({ id: hoaDon.id }),
  );
  const row = rows[0];
  if (!row) throw new Error("insert hoa_don không trả về id");
  return row.id;
}

function msgFor(tenantId: string, taikhoanId: string, hoaDonId: string): DetailSyncMessage {
  return {
    kind: "detail",
    tenantId,
    taikhoanId,
    hoaDonId,
    ref: { nbmst: "0100000001", khhdon: "C26TAA", khmshdon: "1", shdon: "42", source: "normal" },
  };
}

const LINES: InvoiceLine[] = [
  {
    stt: 1,
    ten: "VW tiêu chuẩn NL",
    dvtinh: "Gói",
    sluong: 13,
    ltsuat: "8%",
    tsuat: 0.08,
    tthue: null,
    raw: { ten: "VW tiêu chuẩn NL" },
  },
  {
    stt: 2,
    ten: "VW tiêu chuẩn TE",
    dvtinh: "Gói",
    sluong: 2,
    ltsuat: "8%",
    tsuat: 0.08,
    tthue: null,
    raw: { ten: "VW tiêu chuẩn TE" },
  },
];

const okLimiter: TenantLimiterClient = {
  async tryAcquire() {
    return { allowed: true };
  },
  async recordResult() {},
};

/** Deps với DB thật (cùng hình wiring production makeDetailJobDeps), fetchLines mock. */
function makeDeps(db: Db, fetchLines: RunDetailJobDeps["fetchLines"]): RunDetailJobDeps {
  return {
    now: () => NOW,
    loadAccount: (m) => loadAccountToken(db, m, KEK),
    limiter: okLimiter,
    fetchLines,
    persistLines: (tenantId, hoaDonId, lines) =>
      withTenant(db, tenantId, (tx) => persistInvoiceLines(tx, tenantId, hoaDonId, lines)),
    markTokenDead: (m, reason) =>
      dbRecorder(db).reauthRuntime({ tenantId: m.tenantId, taikhoanId: m.taikhoanId }, reason),
  };
}

describe("runDetailJob — end-to-end PGlite (U26 pha 2)", () => {
  let db: Db;
  let tenantA: string;
  let accA: string;
  let hdA: string;

  beforeEach(async () => {
    db = await freshDb();
    tenantA = await makeTenant(db, "Cty A", "0100000002");
    accA = await makeAccountWithToken(db, tenantA, "0100000002");
    hdA = await makeInvoice(db, tenantA, "42");
  });

  it("persist ĐỦ mọi dòng (HĐ nhiều dòng — bằng chứng thật HĐ 7048 có 2 dòng NL/TE); chạy 2 lần KHÔNG nhân đôi", async () => {
    const deps = makeDeps(db, async () => LINES);
    const out1 = await runDetailJob(deps, msgFor(tenantA, accA, hdA));
    expect(out1).toEqual({ kind: "completed", soDong: 2 });

    const out2 = await runDetailJob(deps, msgFor(tenantA, accA, hdA));
    expect(out2).toEqual({ kind: "completed", soDong: 2 });

    await withTenant(db, tenantA, async (tx) => {
      const lines = await tx.select().from(dongHangHoa).where(eq(dongHangHoa.hoaDonId, hdA));
      expect(lines).toHaveLength(2); // 2 lần chạy vẫn 2 dòng (xóa-chèn idempotent)
      expect(lines.map((l) => l.ten).sort()).toEqual(["VW tiêu chuẩn NL", "VW tiêu chuẩn TE"]);
      for (const l of lines) expect(l.tenantId).toBe(tenantA);
    });
  });

  it("cách ly tenant (RLS FORCE, role non-superuser): tenant B không đọc được dòng hàng của tenant A", async () => {
    const tenantB = await makeTenant(db, "Cty B", "0100000009");

    // Role app KHÔNG-superuser (mô hình production: Worker không dùng superuser) → RLS
    // FORCE thực sự chi phối. Superuser mặc định của PGlite bỏ qua RLS (khuôn @vat/sync).
    await db.execute(sql`create role app_user nosuperuser`);
    await db.execute(sql`grant usage on schema public to app_user`);
    await db.execute(
      sql`grant select, insert, update, delete on all tables in schema public to app_user`,
    );
    await db.execute(sql`set role app_user`);

    const deps = makeDeps(db, async () => LINES);
    const out = await runDetailJob(deps, msgFor(tenantA, accA, hdA));
    expect(out).toEqual({ kind: "completed", soDong: 2 });

    // Dưới ngữ cảnh tenant B → KHÔNG thấy dòng hàng của A.
    await withTenant(db, tenantB, async (tx) => {
      expect(await tx.select().from(dongHangHoa)).toHaveLength(0);
    });
    // Dưới ngữ cảnh tenant A → thấy đủ, tất cả thuộc A.
    await withTenant(db, tenantA, async (tx) => {
      const lines = await tx.select().from(dongHangHoa);
      expect(lines).toHaveLength(2);
      expect(lines.every((l) => l.tenantId === tenantA)).toBe(true);
    });
  });

  it("401 runtime → token bị XÓA (pre-flight message sau bỏ qua sạch) + audit ghi", async () => {
    const deps = makeDeps(db, async () => {
      throw new GdtError("het phien", "SESSION_EXPIRED");
    });
    const out = await runDetailJob(deps, msgFor(tenantA, accA, hdA));
    expect(out).toEqual({ kind: "needs_reauth", reason: "session_expired" });

    await withTenant(db, tenantA, async (tx) => {
      const acc = await tx
        .select({ tokenHienTai: taiKhoanThue.tokenHienTai })
        .from(taiKhoanThue)
        .where(eq(taiKhoanThue.id, accA));
      expect(acc[0]?.tokenHienTai).toBeNull();
      const audits = await tx.select().from(auditLog);
      expect(audits.length).toBeGreaterThanOrEqual(1);
    });

    // Message detail KẾ TIẾP: pre-flight thấy token mất → ack_skip, KHÔNG gọi GDT.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchCalls: number[] = [];
    const deps2 = makeDeps(db, async () => {
      fetchCalls.push(1);
      return LINES;
    });
    const out2 = await runDetailJob(deps2, msgFor(tenantA, accA, hdA));
    expect(out2).toEqual({ kind: "ack_skip", reason: "token_het_han" });
    expect(fetchCalls).toHaveLength(0);
    warn.mockRestore();
  });
});

// U9 — Test điều phối job đồng bộ nền END-TO-END (nhóm integration, PGlite): dùng
// sync() THẬT (@vat/sync) + recorder THẬT (ghi lan_dong_bo/audit, đánh dấu token
// chết) trên Postgres WASM. Mock GdtTransport (offline, không mạng). Chốt: idempotent
// (chạy lại không nhân đôi), 401 runtime → cần đăng nhập lại + token chết, pre-flight
// token hết hạn → KHÔNG chạm GDT (không captcha).
import { PGlite } from "@electric-sql/pglite";
import {
  auditLog,
  hoaDon,
  lanDongBo,
  storeToken,
  taiKhoanThue,
  tenants,
  withTenant,
} from "@vat/db";
import { INVOICE_ENDPOINTS } from "@vat/gdt-client";
import type { GdtTransport, InvoiceRow } from "@vat/gdt-client";
import { sync } from "@vat/sync";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import {
  AUDIT_HANH_DONG_BREAKER_SKIP,
  AUDIT_HANH_DONG_REAUTH,
  TRANG_THAI_CAN_DANG_NHAP_LAI,
  dbRecorder,
  loadAccountToken,
} from "../../src/recorder";
import { runScheduledSync } from "../../src/runJob";
import type { AnyDb, RunJobDeps, SyncJobMessage, TenantLimiterClient } from "../../src/types";

const MIGRATIONS = new URL("../../../../packages/db/migrations", import.meta.url).pathname;
const NOW = Date.UTC(2026, 6, 14, 3, 0, 0);
// U14 — loadAccountToken giờ giải mã qua readToken/storeToken (@vat/db); test cần
// KEK để seal/mở token thay vì lưu chuỗi thô như trước.
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

async function makeAccount(db: Db, tenantId: string, tokenHetHan: Date | null): Promise<string> {
  const rows = await db
    .insert(taiKhoanThue)
    .values({
      tenantId,
      username: `${mstOf(tenantId)}-user`,
      tokenHienTai: null,
      tokenHetHan,
    })
    .returning({ id: taiKhoanThue.id });
  const row = rows[0];
  if (!row) throw new Error("insert tai_khoan_thue không trả về id");
  if (tokenHetHan) {
    await storeToken(db as unknown as AnyDb, tenantId, row.id, "jwt-token", tokenHetHan, KEK);
  }
  return row.id;
}
function mstOf(s: string): string {
  return s.slice(0, 8);
}

function inv(shdon: string, over: Record<string, unknown> = {}): InvoiceRow {
  return {
    nbmst: "0100000001",
    nbten: "Cty Bán X",
    nmmst: "0100000002",
    nmten: "Cty Mua Y",
    khmshdon: "1",
    khhdon: "C26TAA",
    shdon,
    tdlap: "2026-07-12T17:00:00Z",
    ncnhat: "2026-07-13T09:44:51.456Z",
    tgtcthue: 1000000,
    tgtthue: 80000,
    tgtttbso: 1080000,
    ttxly: 8,
    tthai: 1,
    _source: "normal",
    _direction: "purchase",
    ...over,
  };
}

/** Mock transport phục vụ endpoint purchase; đếm số lần gọi để chứng minh nhánh
 * pre-flight KHÔNG chạm GDT. */
function makeTransport(reply: (p: URLSearchParams) => Response): {
  transport: GdtTransport;
  calls: () => number;
} {
  let n = 0;
  const transport: GdtTransport = {
    name: "mock",
    async fetch(url: string) {
      n += 1;
      const u = new URL(url);
      if (u.pathname !== INVOICE_ENDPOINTS.purchase)
        return new Response("not found", { status: 404 });
      return reply(u.searchParams);
    },
    async probe() {
      throw new Error("không dùng");
    },
  };
  return { transport, calls: () => n };
}
const onePage = (rows: InvoiceRow[]) => () =>
  new Response(JSON.stringify({ datas: rows, state: null }), { status: 200 });

const allowAll: TenantLimiterClient = {
  async tryAcquire() {
    return { allowed: true };
  },
  async recordResult() {},
};

function makeDeps(db: Db, transport: GdtTransport): RunJobDeps {
  const anyDb = db as unknown as AnyDb;
  return {
    now: () => NOW,
    loadAccount: (msg) => loadAccountToken(anyDb, msg, KEK),
    limiter: allowAll,
    // db được BOUND vào sync() ở đây (giống deps.ts production) → runJob không cần db.
    sync: (o) => sync({ db: anyDb, ...o }),
    transport,
    recorder: dbRecorder(anyDb),
    syncParams: { includeSco: false },
  };
}

function msgFor(tenantId: string, taikhoanId: string): SyncJobMessage {
  return {
    tenantId,
    taikhoanId,
    direction: "purchase",
    dateFrom: "01/07/2026",
    dateTo: "31/07/2026",
    period: "2026-07",
  };
}

describe("runScheduledSync — end-to-end với sync() + recorder thật (PGlite)", () => {
  let db: Db;
  let tenantId: string;
  let taikhoanId: string;

  beforeEach(async () => {
    db = await freshDb();
    tenantId = await makeTenant(db, "Cty A", "0100000001");
    taikhoanId = await makeAccount(db, tenantId, new Date(NOW + 3_600_000)); // token còn hạn
  });

  it("idempotent: chạy job 2 lần cùng kỳ → KHÔNG nhân đôi hóa đơn", async () => {
    const { transport } = makeTransport(onePage([inv("1"), inv("2"), inv("3")]));
    const deps = makeDeps(db, transport);
    const msg = msgFor(tenantId, taikhoanId);

    const o1 = await runScheduledSync(deps, msg);
    expect(o1.kind).toBe("completed");
    expect((await db.select().from(hoaDon)).length).toBe(3);

    const o2 = await runScheduledSync(deps, msg);
    expect(o2.kind).toBe("completed");
    expect((await db.select().from(hoaDon)).length).toBe(3); // vẫn 3
  });

  it("401 runtime → needs_reauth; token bị đánh dấu chết; audit ghi; sync đã ghi phiên failed; KHÔNG ném", async () => {
    const { transport } = makeTransport(() => new Response("{}", { status: 401 }));
    const deps = makeDeps(db, transport);

    const out = await runScheduledSync(deps, msgFor(tenantId, taikhoanId));
    expect(out.kind).toBe("needs_reauth");

    // Token bị đánh dấu chết (xóa token_hien_tai) để tick sau pre-flight bỏ qua sạch.
    // U14 (fix pass 2): tài khoản VẪN tồn tại, chỉ mất token → loadAccountToken trả
    // { tokenHienTai: null, tokenHetHan: null }, KHÔNG phải null nguyên khối (null chỉ
    // dành cho "tài khoản không tồn tại" — xem recorder.ts).
    const acc = await loadAccountToken(db as unknown as AnyDb, msgFor(tenantId, taikhoanId), KEK);
    expect(acc).not.toBeNull();
    expect(acc?.tokenHienTai).toBeNull();
    expect(acc?.tokenHetHan).toBeNull();

    // Audit ghi hành động cần đăng nhập lại.
    const audits = await db.select().from(auditLog).where(eq(auditLog.tenantId, tenantId));
    expect(audits.some((a) => a.hanhDong === AUDIT_HANH_DONG_REAUTH)).toBe(true);

    // sync() đã ghi một phiên lan_dong_bo failed (truy vết được).
    const runs = await db.select().from(lanDongBo).where(eq(lanDongBo.tenantId, tenantId));
    expect(runs.some((r) => r.trangThai === "failed")).toBe(true);
  });

  it("pre-flight token hết hạn → KHÔNG chạm GDT (0 call), ghi lan_dong_bo cần đăng nhập lại + audit", async () => {
    // Đặt token hết hạn cho tài khoản.
    await withTenant(db as unknown as AnyDb, tenantId, async (tx) => {
      await tx
        .update(taiKhoanThue)
        .set({ tokenHetHan: new Date(NOW - 1000) })
        .where(and(eq(taiKhoanThue.id, taikhoanId), eq(taiKhoanThue.tenantId, tenantId)));
    });
    const { transport, calls } = makeTransport(onePage([inv("1")]));
    const deps = makeDeps(db, transport);

    const out = await runScheduledSync(deps, msgFor(tenantId, taikhoanId));
    expect(out.kind).toBe("needs_reauth");
    // Ranh giới Hiến pháp: KHÔNG tự đăng nhập → KHÔNG một lời gọi GDT nào.
    expect(calls()).toBe(0);

    const runs = await db.select().from(lanDongBo).where(eq(lanDongBo.tenantId, tenantId));
    expect(runs.some((r) => r.trangThai === TRANG_THAI_CAN_DANG_NHAP_LAI)).toBe(true);
    const audits = await db.select().from(auditLog).where(eq(auditLog.tenantId, tenantId));
    expect(audits.some((a) => a.hanhDong === AUDIT_HANH_DONG_REAUTH)).toBe(true);
  });

  it("circuit breaker mở → không gọi GDT (0 call), ghi audit bỏ qua (recorder thật)", async () => {
    const { transport, calls } = makeTransport(onePage([inv("1")]));
    const deps: RunJobDeps = {
      ...makeDeps(db, transport),
      limiter: {
        async tryAcquire() {
          return { allowed: false, reason: "breaker_open" };
        },
        async recordResult() {},
      },
    };

    const out = await runScheduledSync(deps, msgFor(tenantId, taikhoanId));
    // H-B.4 — breaker mở nay là BACKPRESSURE (reenqueue có delay, không max_retries)
    // thay vì bỏ tick; vẫn ghi audit breakerSkip.
    expect(out).toEqual({ kind: "retry_backpressure", reason: "breaker_open" });
    expect(calls()).toBe(0);
    const audits = await db.select().from(auditLog).where(eq(auditLog.tenantId, tenantId));
    expect(audits.some((a) => a.hanhDong === AUDIT_HANH_DONG_BREAKER_SKIP)).toBe(true);
  });

  it("cách ly tenant: job tenant A không lộ dữ liệu sang tenant B (RLS FORCE, role non-superuser)", async () => {
    const tenantB = await makeTenant(db, "Cty B", "0100000002");

    // Role app KHÔNG-superuser (mô hình production: Worker không dùng superuser) → RLS
    // FORCE thực sự chi phối. Superuser mặc định của PGlite bỏ qua RLS (xem @vat/sync).
    await db.execute(sql`create role app_user nosuperuser`);
    await db.execute(sql`grant usage on schema public to app_user`);
    await db.execute(
      sql`grant select, insert, update, delete on all tables in schema public to app_user`,
    );
    await db.execute(sql`set role app_user`);

    const { transport } = makeTransport(onePage([inv("1"), inv("2")]));
    await runScheduledSync(makeDeps(db, transport), msgFor(tenantId, taikhoanId));

    // Dưới ngữ cảnh tenant B → KHÔNG thấy hóa đơn của A.
    await withTenant(db as unknown as AnyDb, tenantB, async (tx) => {
      expect((await tx.select().from(hoaDon)).length).toBe(0);
    });
    // Dưới ngữ cảnh tenant A → thấy đủ 2, tất cả thuộc A.
    await withTenant(db as unknown as AnyDb, tenantId, async (tx) => {
      const rows = await tx.select().from(hoaDon);
      expect(rows.length).toBe(2);
      expect(rows.every((r) => r.tenantId === tenantId)).toBe(true);
    });

    await db.execute(sql`reset role`);
  });
});

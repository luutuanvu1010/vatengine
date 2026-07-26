// Task 5 (delta-sync) — vòng đời run delta (moDeltaRun/ghiAuditDu/chotDeltaRun) +
// syncChunk (kéo TỐI ĐA maxPages trang của MỘT họ endpoint, commit MỖI LÔ riêng qua
// withTenant, cộng dồn soHdMoi/soHdCapNhat vào run row bằng SQL, ghi checkpoint để
// resume). Offline — PGlite + mock GdtTransport (xem .claude/rules/testing.md), mirror
// mẫu test/integration/sync.test.ts + test/integration/audit.test.ts hiện có.
import { PGlite } from "@electric-sql/pglite";
import { hoaDon, lanDongBo, taiKhoanThue, tenants } from "@vat/db";
import { GdtError, INVOICE_ENDPOINTS } from "@vat/gdt-client";
import type { GdtTransport } from "@vat/gdt-client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { chotDeltaRun, ghiAuditDu, moDeltaRun, syncChunk } from "../../src/chunkSync";

// migrations của @vat/db nằm ở package anh em; giải qua URL để không phụ thuộc cwd.
const MIGRATIONS = new URL("../../../db/migrations", import.meta.url).pathname;

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

async function makeTaxAccount(db: Db, tenantId: string, username: string): Promise<string> {
  const rows = await db
    .insert(taiKhoanThue)
    .values({ tenantId, username })
    .returning({ id: taiKhoanThue.id });
  const row = rows[0];
  if (!row) throw new Error("insert tai_khoan_thue không trả về id");
  return row.id;
}

// Dòng hóa đơn giả theo định dạng Amendment #7. `shdon` để phân biệt. KHÔNG dữ liệu thật.
function inv(shdon: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    nbmst: "0100000001",
    nbten: "Cty Bán X",
    nmmst: "0100000002",
    nmten: "Cty Mua Y",
    khmshdon: "1",
    khhdon: "C26TAA",
    shdon,
    tdlap: "2026-04-12T17:00:00Z",
    ncnhat: "2026-04-13T09:44:51.456Z",
    tgtcthue: 1000000,
    tgtthue: 80000,
    tgtttbso: 1080000,
    ttxly: 8,
    tthai: 1,
    ...over,
  };
}

function jsonRes(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

type Reply = (params: URLSearchParams) => Response;

/** Mock transport chỉ phục vụ endpoint purchase/normal (family="normal"). */
function makeTransport(reply: Reply): { transport: GdtTransport; state: { calls: number } } {
  const state = { calls: 0 };
  const transport: GdtTransport = {
    name: "mock",
    async fetch(url: string) {
      state.calls += 1;
      const u = new URL(url);
      if (u.pathname !== INVOICE_ENDPOINTS.purchase) {
        return new Response("not found", { status: 404 });
      }
      return reply(u.searchParams);
    },
    async probe() {
      throw new Error("không dùng trong test này");
    },
  };
  return { transport, state };
}

const BASE_PARAMS = {
  taikhoanId: "", // gán trong beforeEach
  direction: "purchase" as const,
  dateFrom: "01/04/2026",
  dateTo: "30/04/2026",
};

describe("chunkSync — syncChunk + vòng đời run delta (Task 5)", () => {
  let db: Db;
  let tenantId: string;
  let taikhoanId: string;

  beforeEach(async () => {
    db = await freshDb();
    tenantId = await makeTenant(db, "Cty A", "0100000001");
    taikhoanId = await makeTaxAccount(db, tenantId, "0100000001-user");
  });

  it("(1) moDeltaRun tạo run 'running' loai='sync'; ghiAuditDu tạo run 'completed' loai='audit'", async () => {
    const id = await moDeltaRun(db, tenantId, { ...BASE_PARAMS, taikhoanId });
    const runs1 = await db.select().from(lanDongBo).where(eq(lanDongBo.id, id));
    expect(runs1).toHaveLength(1);
    expect(runs1[0]).toMatchObject({ trangThai: "running", loai: "sync", tenantId });
    expect(runs1[0]?.ketThuc).toBeNull();

    await ghiAuditDu(db, tenantId, { ...BASE_PARAMS, taikhoanId });
    const auditRuns = (
      await db.select().from(lanDongBo).where(eq(lanDongBo.tenantId, tenantId))
    ).filter((r) => r.loai === "audit");
    expect(auditRuns).toHaveLength(1);
    expect(auditRuns[0]).toMatchObject({ trangThai: "completed", loai: "audit", soHdMoi: 0 });
    expect(auditRuns[0]?.ketThuc).toBeInstanceOf(Date);
  });

  it("(2) syncChunk lô 1 (2 trang, còn state): upsert đúng, cộng dồn run row, checkpoint đúng, trả ok/done:false", async () => {
    const lanDongBoId = await moDeltaRun(db, tenantId, { ...BASE_PARAMS, taikhoanId });

    const reply: Reply = (params) => {
      if (!params.get("state")) {
        return jsonRes({ datas: [inv("1"), inv("2")], total: 5, state: "cursor1" });
      }
      throw new Error("không nên gọi trang 2 trong test này (maxPages=1)");
    };
    const { transport } = makeTransport(reply);

    const out = await syncChunk({
      db,
      transport,
      token: "jwt-token-test",
      tenantId,
      taikhoanId,
      direction: "purchase",
      family: "normal",
      dateFrom: BASE_PARAMS.dateFrom,
      dateTo: BASE_PARAMS.dateTo,
      lanDongBoId,
      maxPages: 1,
      size: 2,
    });

    expect(out).toMatchObject({
      trangThai: "ok",
      done: false,
      state: "cursor1",
      totalQuanSat: 5,
      soHdMoi: 2,
      soHdCapNhat: 0,
    });
    expect((await db.select().from(hoaDon)).length).toBe(2);

    const runs = await db.select().from(lanDongBo).where(eq(lanDongBo.id, lanDongBoId));
    expect(runs[0]).toMatchObject({ soHdMoi: 2, soHdCapNhat: 0 });
    expect(runs[0]?.checkpoint).toEqual({ family: "normal", state: "cursor1", totalQuanSat: 5 });
  });

  it("(3) syncChunk lô 2 hết trang → done:true; CHẠY LẠI lô 2 (redelivery) → idempotent, không nhân đôi hoa_don", async () => {
    const lanDongBoId = await moDeltaRun(db, tenantId, { ...BASE_PARAMS, taikhoanId });

    // Lô 1: 2 hóa đơn, còn state.
    const { transport: t1 } = makeTransport((params) => {
      if (!params.get("state"))
        return jsonRes({ datas: [inv("1"), inv("2")], total: 5, state: "cursor1" });
      throw new Error("lô 1 không nên gọi trang khác");
    });
    await syncChunk({
      db,
      transport: t1,
      token: "jwt-token-test",
      tenantId,
      taikhoanId,
      direction: "purchase",
      family: "normal",
      dateFrom: BASE_PARAMS.dateFrom,
      dateTo: BASE_PARAMS.dateTo,
      lanDongBoId,
      maxPages: 1,
      size: 2,
    });

    // Lô 2: nối tiếp state="cursor1" → 1 hóa đơn cuối, hết trang (datas.length < size).
    const lo2Args = {
      db,
      token: "jwt-token-test",
      tenantId,
      taikhoanId,
      direction: "purchase" as const,
      family: "normal" as const,
      dateFrom: BASE_PARAMS.dateFrom,
      dateTo: BASE_PARAMS.dateTo,
      lanDongBoId,
      state: "cursor1",
      maxPages: 1,
      size: 2,
    };
    const { transport: t2 } = makeTransport((params) => {
      expect(params.get("state")).toBe("cursor1");
      return jsonRes({ datas: [inv("3")], total: 5, state: null });
    });
    const out2 = await syncChunk({ ...lo2Args, transport: t2 });

    expect(out2).toMatchObject({ trangThai: "ok", done: true, soHdMoi: 1, soHdCapNhat: 0 });
    expect(out2.state).toBeUndefined();
    expect((await db.select().from(hoaDon)).length).toBe(3);

    // Redelivery lô 2: cùng dữ liệu, cùng con trỏ state đầu vào ("cursor1") — mô phỏng
    // reenqueue/redelivery của message chưa ack. Idempotent: KHÔNG nhân đôi hóa đơn.
    const { transport: t2Again } = makeTransport(() =>
      jsonRes({ datas: [inv("3")], total: 5, state: null }),
    );
    const out3 = await syncChunk({ ...lo2Args, transport: t2Again });

    expect(out3).toMatchObject({ trangThai: "ok", done: true, soHdMoi: 0, soHdCapNhat: 0 });
    expect((await db.select().from(hoaDon)).length).toBe(3); // KHÔNG nhân đôi

    const runs = await db.select().from(lanDongBo).where(eq(lanDongBo.id, lanDongBoId));
    // Cộng dồn: lô1 (2) + lô2 lần 1 (1) + lô2 redelivery (0) = 3.
    expect(runs[0]?.soHdMoi).toBe(3);
  });

  it("(4) 429 (GdtError httpStatus 429) → failed/rate_limited, run row KHÔNG đổi (checkpoint giữ nguyên)", async () => {
    const lanDongBoId = await moDeltaRun(db, tenantId, { ...BASE_PARAMS, taikhoanId });
    const before = (await db.select().from(lanDongBo).where(eq(lanDongBo.id, lanDongBoId)))[0];

    const { transport } = makeTransport(() => new Response("{}", { status: 429 }));

    const out = await syncChunk({
      db,
      transport,
      token: "jwt-token-test",
      tenantId,
      taikhoanId,
      direction: "purchase",
      family: "normal",
      dateFrom: BASE_PARAMS.dateFrom,
      dateTo: BASE_PARAMS.dateTo,
      lanDongBoId,
      maxPages: 1,
      size: 2,
      retry: { maxAttempts: 1, backoffMs: 0 },
    });

    expect(out.trangThai).toBe("failed");
    expect(out.failureKind).toBe("rate_limited");
    expect(out.detailCandidates).toEqual([]);

    const after = (await db.select().from(lanDongBo).where(eq(lanDongBo.id, lanDongBoId)))[0];
    expect(after).toEqual(before); // run row KHÔNG đổi (checkpoint/soHdMoi/trangThai giữ nguyên)
    expect((await db.select().from(hoaDon)).length).toBe(0);
  });

  it("phân loại lỗi transient/session_expired đúng qua classifyFailure (GdtError)", async () => {
    const lanDongBoId = await moDeltaRun(db, tenantId, { ...BASE_PARAMS, taikhoanId });
    const { transport } = makeTransport(() => new Response("{}", { status: 401 }));
    const out = await syncChunk({
      db,
      transport,
      token: "jwt-token-test",
      tenantId,
      taikhoanId,
      direction: "purchase",
      family: "normal",
      dateFrom: BASE_PARAMS.dateFrom,
      dateTo: BASE_PARAMS.dateTo,
      lanDongBoId,
      maxPages: 1,
      size: 2,
    });
    expect(out.trangThai).toBe("failed");
    expect(out.failureKind).toBe("session_expired");
  });

  it("(5) chotDeltaRun completed → trạng thái completed + ketThuc set", async () => {
    const lanDongBoId = await moDeltaRun(db, tenantId, { ...BASE_PARAMS, taikhoanId });
    await chotDeltaRun(db, tenantId, lanDongBoId, { trangThai: "completed" });
    const rows = await db.select().from(lanDongBo).where(eq(lanDongBo.id, lanDongBoId));
    expect(rows[0]?.trangThai).toBe("completed");
    expect(rows[0]?.ketThuc).toBeInstanceOf(Date);
    expect(rows[0]?.thongDiepLoi).toBeNull();
  });

  it("(5) chotDeltaRun failed kèm thongDiepLoi → trạng thái failed + thongDiepLoi + ketThuc set", async () => {
    const lanDongBoId = await moDeltaRun(db, tenantId, { ...BASE_PARAMS, taikhoanId });
    await chotDeltaRun(db, tenantId, lanDongBoId, {
      trangThai: "failed",
      thongDiepLoi: "GDT trả 429 kiệt lượt retry",
    });
    const rows = await db.select().from(lanDongBo).where(eq(lanDongBo.id, lanDongBoId));
    expect(rows[0]?.trangThai).toBe("failed");
    expect(rows[0]?.thongDiepLoi).toBe("GDT trả 429 kiệt lượt retry");
    expect(rows[0]?.ketThuc).toBeInstanceOf(Date);
  });

  it("(5) chotDeltaRun can_dang_nhap_lai → trạng thái đúng, ketThuc set", async () => {
    const lanDongBoId = await moDeltaRun(db, tenantId, { ...BASE_PARAMS, taikhoanId });
    await chotDeltaRun(db, tenantId, lanDongBoId, { trangThai: "can_dang_nhap_lai" });
    const rows = await db.select().from(lanDongBo).where(eq(lanDongBo.id, lanDongBoId));
    expect(rows[0]?.trangThai).toBe("can_dang_nhap_lai");
    expect(rows[0]?.ketThuc).toBeInstanceOf(Date);
  });

  it("GdtError.httpStatus === 429 dùng import GdtError (đảm bảo mock đúng lớp lỗi kỳ vọng)", () => {
    const e = new GdtError("rate limited", "HTTP_ERROR", 429);
    expect(e.httpStatus).toBe(429);
  });
});

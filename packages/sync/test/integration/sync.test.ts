// U5 — Test dịch vụ đồng bộ idempotent (nhóm integration, PGlite): áp migration U4
// lên Postgres WASM sạch rồi kiểm hành vi upsert THẬT (idempotent, cập nhật trạng
// thái, đếm mới/cập nhật, cách ly tenant, 401 dừng). Offline hoàn toàn — mock
// GdtTransport, không mạng (xem .claude/rules/testing.md).
import { PGlite } from "@electric-sql/pglite";
import { hoaDon, lanDongBo, taiKhoanThue, tenants, withTenant } from "@vat/db";
import { INVOICE_ENDPOINTS } from "@vat/gdt-client";
import type { GdtTransport, InvoiceRow } from "@vat/gdt-client";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { sync } from "../../src/sync";

// migrations của @vat/db nằm ở package anh em; giải qua URL để không phụ thuộc cwd.
const MIGRATIONS = new URL("../../../db/migrations", import.meta.url).pathname;

type Db = ReturnType<typeof drizzle>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

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
function inv(shdon: string, over: Record<string, unknown> = {}): InvoiceRow {
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
    _source: "normal",
    _direction: "purchase",
    ...over,
  };
}

function jsonRes(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

type Reply = (params: URLSearchParams) => Response;

/** Mock transport chỉ phục vụ endpoint purchase (test dùng includeSco:false). */
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

/** Reply một trang cố định (state=null → dừng phân trang ngay). */
function onePage(rows: InvoiceRow[]): Reply {
  return () => jsonRes({ datas: rows, state: null });
}

/**
 * H-B.2 — mô phỏng TẤT ĐỊNH khe đua "2 sync song song": bọc `db` để mọi `SELECT` bên
 * trong transaction trả `[]` (giả lập ảnh chụp giao dịch của sync này chạy TRƯỚC khi
 * sync đối thủ commit hàng cùng khóa tự nhiên). Hàng vẫn tồn tại thật trong DB → bước
 * `INSERT` của mã đụng đúng ràng buộc `hoa_don_natural_key`. Chỉ chặn `select`; mọi
 * thao tác khác (insert/update/execute) đi thẳng tx thật. (upsertBatch chỉ SELECT
 * `hoa_don`; recordFailed không SELECT — nên phạm vi che là an toàn.)
 */
function raceBlindSelect(realDb: Db): Db {
  const blindTx = (tx: Tx): Tx =>
    new Proxy(tx, {
      get(t, p, r) {
        if (p === "select") {
          return () => ({ from: () => ({ where: () => Promise.resolve([]) }) });
        }
        const v = Reflect.get(t, p, r);
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
  return new Proxy(realDb, {
    get(t, p, r) {
      if (p === "transaction") {
        return (fn: (tx: Tx) => Promise<unknown>) => t.transaction((tx) => fn(blindTx(tx)));
      }
      const v = Reflect.get(t, p, r);
      return typeof v === "function" ? v.bind(t) : v;
    },
  });
}

const BASE_OPTS = {
  token: "jwt-token-test",
  direction: "purchase" as const,
  dateFrom: "01/04/2026",
  dateTo: "30/04/2026",
  includeSco: false,
};

describe("sync — upsert idempotent (integration, PGlite)", () => {
  let db: Db;
  let tenantId: string;
  let taikhoanId: string;

  beforeEach(async () => {
    db = await freshDb();
    tenantId = await makeTenant(db, "Cty A", "0100000001");
    taikhoanId = await makeTaxAccount(db, tenantId, "0100000001-user");
  });

  it("(a) đồng bộ 2 lần cùng kỳ → KHÔNG nhân đôi bản ghi hóa đơn", async () => {
    const { transport } = makeTransport(onePage([inv("1"), inv("2"), inv("3")]));

    const r1 = await sync({ db, transport, tenantId, taikhoanId, ...BASE_OPTS });
    expect(r1.trangThai).toBe("completed");
    expect(r1.soHdMoi).toBe(3);
    expect(r1.soHdCapNhat).toBe(0);
    expect((await db.select().from(hoaDon)).length).toBe(3);

    const r2 = await sync({ db, transport, tenantId, taikhoanId, ...BASE_OPTS });
    expect(r2.soHdMoi).toBe(0);
    expect(r2.soHdCapNhat).toBe(0);
    // Idempotent: chạy lại cùng dữ liệu → vẫn 3 bản ghi.
    expect((await db.select().from(hoaDon)).length).toBe(3);
  });

  it("(H-B.2) 2 sync song song cùng (tenant,kỳ,chiều) → không vỡ transaction, không failed oan, không nhân đôi", async () => {
    // sync đối thủ chèn xong + commit trước.
    const t1 = makeTransport(onePage([inv("1", { ttxly: 8, tthai: 1 })]));
    const r1 = await sync({ db, transport: t1.transport, tenantId, taikhoanId, ...BASE_OPTS });
    expect(r1.trangThai).toBe("completed");
    expect((await db.select().from(hoaDon)).length).toBe(1);

    // sync này: SELECT chạy TRƯỚC khi đối thủ commit (không thấy hàng) nhưng INSERT
    // chạy SAU (khóa tự nhiên đã tồn tại) — tái lập tất định qua raceBlindSelect.
    const t2 = makeTransport(onePage([inv("1", { ttxly: 6, tthai: 2 })]));
    const r2 = await sync({
      db: raceBlindSelect(db),
      transport: t2.transport,
      tenantId,
      taikhoanId,
      ...BASE_OPTS,
    });

    expect(r2.trangThai).toBe("completed"); // KHÔNG ghi 'failed' oan
    const rows = await db.select().from(hoaDon);
    expect(rows.length).toBe(1); // KHÔNG nhân đôi bản ghi
    expect(rows[0]?.ttxly).toBe(6); // ON CONFLICT DO UPDATE áp giá trị mới nhất
    expect(rows[0]?.tthai).toBe(2);
    const failed = (await db.select().from(lanDongBo)).filter((x) => x.trangThai === "failed");
    expect(failed.length).toBe(0); // không phiên thất bại oan nào
  });

  it("(b) ttxly/tthai đổi giữa 2 lần → CẬP NHẬT cùng bản ghi, không tạo mới + changes ghi cũ→mới", async () => {
    const t1 = makeTransport(onePage([inv("1", { ttxly: 8 })]));
    const r1 = await sync({ db, transport: t1.transport, tenantId, taikhoanId, ...BASE_OPTS });
    expect(r1.soHdMoi).toBe(1);
    const before = await db.select().from(hoaDon);
    const idBefore = before[0]?.id;

    const t2 = makeTransport(onePage([inv("1", { ttxly: 6, tthai: 2 })]));
    const r2 = await sync({ db, transport: t2.transport, tenantId, taikhoanId, ...BASE_OPTS });
    expect(r2.soHdMoi).toBe(0);
    expect(r2.soHdCapNhat).toBe(1);

    const after = await db.select().from(hoaDon);
    expect(after.length).toBe(1); // không tạo mới
    expect(after[0]?.id).toBe(idBefore); // cùng bản ghi (upsert, không insert mới)
    expect(after[0]?.ttxly).toBe(6);
    expect(after[0]?.tthai).toBe(2);

    expect(r2.changes).toHaveLength(1);
    expect(r2.changes[0]).toMatchObject({ ttxlyCu: 8, ttxlyMoi: 6, tthaiCu: 1, tthaiMoi: 2 });
  });

  it("(c)+(f) đếm đúng số mới/cập nhật + mỗi phiên ghi 1 bản ghi lan_dong_bo phân biệt", async () => {
    const t1 = makeTransport(onePage([inv("1"), inv("2")]));
    await sync({ db, transport: t1.transport, tenantId, taikhoanId, ...BASE_OPTS });

    // Lần 2: 1 hóa đơn đổi trạng thái + 1 hóa đơn mới.
    const t2 = makeTransport(onePage([inv("1", { ttxly: 6 }), inv("3")]));
    const r2 = await sync({ db, transport: t2.transport, tenantId, taikhoanId, ...BASE_OPTS });
    expect(r2.soHdMoi).toBe(1);
    expect(r2.soHdCapNhat).toBe(1);

    const runs = await db
      .select()
      .from(lanDongBo)
      .where(eq(lanDongBo.tenantId, tenantId))
      .orderBy(lanDongBo.batDau);
    expect(runs.length).toBe(2); // 2 phiên phân biệt (lịch sử có phiên bản)
    expect(runs[0]).toMatchObject({ soHdMoi: 2, soHdCapNhat: 0, trangThai: "completed" });
    expect(runs[1]).toMatchObject({ soHdMoi: 1, soHdCapNhat: 1, trangThai: "completed" });
    expect(runs[0]?.ketThuc).toBeInstanceOf(Date);
  });

  it("(U22 B1) tháng RỖNG THẬT (0 hóa đơn) VẪN ghi 1 phiên 'completed' → phân biệt 'đã phủ' vs 'chưa từng'", async () => {
    // Cổng chặn U22 (docs/plans/U22-plan.md §5 B1): backfill chỉ đúng nếu "đã đồng
    // bộ nhưng rỗng" để lại DẤU khác với "chưa từng đồng bộ". Nếu tháng rỗng KHÔNG
    // để dấu, mỗi lần lọc sẽ backfill lại tháng rỗng vô ích. Test này TÁI LẬP hành
    // vi hiện có làm BẰNG CHỨNG (Hiến pháp §Nguyên tắc bằng chứng) cho quyết định
    // AC2/4B: `coveredMonths` suy ra từ `lan_dong_bo` là ĐỦ, KHÔNG cần bảng/patch mới.
    const { transport } = makeTransport(onePage([])); // GDT trả 0 dòng cho kỳ này

    const r = await sync({ db, transport, tenantId, taikhoanId, ...BASE_OPTS });

    expect(r.trangThai).toBe("completed"); // rỗng thật vẫn là "hoàn thành", KHÔNG failed
    expect(r.soHdMoi).toBe(0);
    expect(r.soHdCapNhat).toBe(0);
    expect((await db.select().from(hoaDon)).length).toBe(0); // đúng: không có hóa đơn

    // DẤU tồn tại: đúng 1 bản ghi lan_dong_bo 'completed' cho (tenant,tài khoản,chiều)
    // phủ khoảng này → truy vấn coveredMonths phân biệt được "đã phủ (rỗng)" với "chưa
    // từng" (không có bản ghi nào). tu_ngay/den_ngay giữ khoảng đã phủ để đối chiếu tháng.
    const runs = await db.select().from(lanDongBo).where(eq(lanDongBo.tenantId, tenantId));
    expect(runs.length).toBe(1);
    expect(runs[0]).toMatchObject({
      trangThai: "completed",
      chieu: "purchase",
      soHdMoi: 0,
      soHdCapNhat: 0,
    });
    expect(runs[0]?.ketThuc).toBeInstanceOf(Date);
  });

  it("(7) cách ly tenant: sync tenant A không lộ dữ liệu sang tenant B (RLS FORCE, role non-superuser)", async () => {
    const tenantB = await makeTenant(db, "Cty B", "0100000002");

    // Role app KHÔNG-superuser (mô hình production: Worker không dùng superuser).
    await db.execute(sql`create role app_user nosuperuser`);
    await db.execute(sql`grant usage on schema public to app_user`);
    await db.execute(
      sql`grant select, insert, update, delete on all tables in schema public to app_user`,
    );
    await db.execute(sql`set role app_user`);

    const { transport } = makeTransport(onePage([inv("1"), inv("2")]));
    await sync({ db, transport, tenantId, taikhoanId, ...BASE_OPTS });

    // Dưới ngữ cảnh tenant B → KHÔNG thấy hóa đơn của A.
    await withTenant(db, tenantB, async (tx) => {
      expect((await tx.select().from(hoaDon)).length).toBe(0);
    });
    // Dưới ngữ cảnh tenant A → thấy đủ 2.
    await withTenant(db, tenantId, async (tx) => {
      const rows = await tx.select().from(hoaDon);
      expect(rows.length).toBe(2);
      expect(rows.every((r) => r.tenantId === tenantId)).toBe(true);
    });

    await db.execute(sql`reset role`);
  });

  it("(d) 401 → trạng thái failed, KHÔNG ghi hóa đơn, KHÔNG retry (transport gọi đúng 1 lần)", async () => {
    const { transport, state } = makeTransport(() => new Response("{}", { status: 401 }));

    const r = await sync({ db, transport, tenantId, taikhoanId, ...BASE_OPTS });

    expect(r.trangThai).toBe("failed");
    expect(r.thongDiepLoi).toBeTruthy();
    expect(r.soHdMoi).toBe(0);
    expect((await db.select().from(hoaDon)).length).toBe(0);
    expect(state.calls).toBe(1); // 401 không retry credential cũ

    // Vẫn ghi lịch sử phiên thất bại (truy được).
    const runs = await db.select().from(lanDongBo).where(eq(lanDongBo.tenantId, tenantId));
    expect(runs.length).toBe(1);
    expect(runs[0]?.trangThai).toBe("failed");
  });

  it("(U9) 401 → failureKind='session_expired' (tín hiệu KHÔNG retry cho tầng nền)", async () => {
    const { transport } = makeTransport(() => new Response("{}", { status: 401 }));
    const r = await sync({ db, transport, tenantId, taikhoanId, ...BASE_OPTS });
    expect(r.trangThai).toBe("failed");
    expect(r.failureKind).toBe("session_expired");
  });

  it("(U9) lỗi HTTP tạm (500) → failureKind='transient' (tín hiệu RETRY cho tầng nền)", async () => {
    const { transport } = makeTransport(() => new Response("{}", { status: 500 }));
    // maxAttempts:1 → không retry cấp adapter (test nhanh); 500 → GdtError HTTP_ERROR.
    const r = await sync({
      db,
      transport,
      tenantId,
      taikhoanId,
      ...BASE_OPTS,
      retry: { maxAttempts: 1, backoffMs: 0 },
    });
    expect(r.trangThai).toBe("failed");
    expect(r.failureKind).toBe("transient");
  });

  it("(U25 AC5) 429 kiệt lượt retry adapter → failureKind='rate_limited' (backpressure, không retry thật)", async () => {
    const { transport } = makeTransport(() => new Response("{}", { status: 429 }));
    // maxAttempts:1 → không retry cấp adapter (test nhanh, không chờ thật).
    const r = await sync({
      db,
      transport,
      tenantId,
      taikhoanId,
      ...BASE_OPTS,
      retry: { maxAttempts: 1, backoffMs: 0 },
    });
    expect(r.trangThai).toBe("failed");
    expect(r.failureKind).toBe("rate_limited");
  });

  it("(U9) đồng bộ thành công → không gắn failureKind", async () => {
    const { transport } = makeTransport(onePage([inv("1")]));
    const r = await sync({ db, transport, tenantId, taikhoanId, ...BASE_OPTS });
    expect(r.trangThai).toBe("completed");
    expect(r.failureKind).toBeUndefined();
  });

  it("(d) 401 giữa chừng phân trang → không ghi bản ghi dở dang (rollback)", async () => {
    // Trang 1 đầy (size=2) + có con trỏ state → adapter đi tiếp; trang 2 trả 401.
    const reply: Reply = (params) => {
      if (!params.get("state")) return jsonRes({ datas: [inv("1"), inv("2")], state: "cursor1" });
      return new Response("{}", { status: 401 });
    };
    const { transport, state } = makeTransport(reply);

    const r = await sync({ db, transport, tenantId, taikhoanId, ...BASE_OPTS, size: 2 });

    expect(r.trangThai).toBe("failed");
    // Dù trang 1 đã lấy được dữ liệu, 401 giữa chừng → KHÔNG hóa đơn nào được ghi.
    expect((await db.select().from(hoaDon)).length).toBe(0);
    expect(state.calls).toBe(2);
  });

  it("khoảng ngày sai định dạng dd/mm/yyyy → ném lỗi rõ ràng (không đoán)", async () => {
    const { transport, state } = makeTransport(onePage([inv("1")]));
    await expect(
      sync({ db, transport, tenantId, taikhoanId, ...BASE_OPTS, dateFrom: "2026-04-01" }),
    ).rejects.toThrow(/dd\/mm\/yyyy/);
    // Ném trước khi gọi mạng — không đụng adapter.
    expect(state.calls).toBe(0);
  });

  it("(b/RLS) đường UPDATE chạy đúng dưới role non-superuser + RLS FORCE (WITH CHECK)", async () => {
    // Đường upsert-cập-nhật phải hoạt động dưới role app thật (không superuser), khi
    // policy RLS chi phối cả UPDATE (using + with check theo app.tenant_id).
    await db.execute(sql`create role app_user nosuperuser`);
    await db.execute(sql`grant usage on schema public to app_user`);
    await db.execute(
      sql`grant select, insert, update, delete on all tables in schema public to app_user`,
    );
    await db.execute(sql`set role app_user`);

    const t1 = makeTransport(onePage([inv("1", { ttxly: 8 })]));
    await sync({ db, transport: t1.transport, tenantId, taikhoanId, ...BASE_OPTS });
    const t2 = makeTransport(onePage([inv("1", { ttxly: 6 })]));
    const r2 = await sync({ db, transport: t2.transport, tenantId, taikhoanId, ...BASE_OPTS });
    expect(r2.soHdCapNhat).toBe(1);

    await withTenant(db, tenantId, async (tx) => {
      const rows = await tx.select().from(hoaDon);
      expect(rows.length).toBe(1);
      expect(rows[0]?.ttxly).toBe(6); // UPDATE có hiệu lực dưới RLS FORCE
    });

    await db.execute(sql`reset role`);
  });

  it("(H-B.2/RLS) đường ON CONFLICT DO UPDATE bị RLS FORCE chi phối dưới role non-superuser", async () => {
    // Bằng chứng thực nghiệm trực tiếp: chính nhánh onConflictDoUpdate (không phải
    // UPDATE-by-id) vẫn chạy đúng dưới role app thật + RLS FORCE (WITH CHECK cùng
    // tenant). Trước đây chỉ suy luận gián tiếp từ cấu trúc khóa duy nhất.
    await db.execute(sql`create role app_user nosuperuser`);
    await db.execute(sql`grant usage on schema public to app_user`);
    await db.execute(
      sql`grant select, insert, update, delete on all tables in schema public to app_user`,
    );
    await db.execute(sql`set role app_user`);

    // sync đối thủ chèn hàng (dưới app_user).
    const t1 = makeTransport(onePage([inv("1", { ttxly: 8, tthai: 1 })]));
    await sync({ db, transport: t1.transport, tenantId, taikhoanId, ...BASE_OPTS });

    // Race: SELECT bị che → đi ĐÚNG nhánh ON CONFLICT DO UPDATE, dưới RLS FORCE.
    const t2 = makeTransport(onePage([inv("1", { ttxly: 6, tthai: 2 })]));
    const r2 = await sync({
      db: raceBlindSelect(db),
      transport: t2.transport,
      tenantId,
      taikhoanId,
      ...BASE_OPTS,
    });
    expect(r2.trangThai).toBe("completed"); // ON CONFLICT có hiệu lực dưới RLS FORCE

    await db.execute(sql`reset role`);

    await withTenant(db, tenantId, async (tx) => {
      const rows = await tx.select().from(hoaDon);
      expect(rows.length).toBe(1);
      expect(rows[0]?.ttxly).toBe(6); // giá trị mới áp qua WITH CHECK cùng tenant
    });
  });

  it("lỗi giữa transaction upsert → rollback nguyên tử: không ghi hóa đơn, ghi 1 phiên failed", async () => {
    // Một dòng có tdlap hỏng → mapper ném GIỮA transaction (sau khi withTenant mở) →
    // toàn bộ rollback (kể cả các dòng hợp lệ cùng lô), rồi ghi lan_dong_bo failed.
    const { transport } = makeTransport(
      onePage([inv("1"), inv("2", { tdlap: "khong-phai-ngay" })]),
    );

    const r = await sync({ db, transport, tenantId, taikhoanId, ...BASE_OPTS });

    expect(r.trangThai).toBe("failed");
    expect(r.thongDiepLoi).toBeTruthy();
    expect((await db.select().from(hoaDon)).length).toBe(0); // không ghi dở dang
    const runs = await db.select().from(lanDongBo).where(eq(lanDongBo.tenantId, tenantId));
    expect(runs.length).toBe(1);
    expect(runs[0]?.trangThai).toBe("failed");
  });
});

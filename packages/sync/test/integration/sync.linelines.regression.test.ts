// ─────────────────────────────────────────────────────────────────────────────
// TEST XÁC THỰC LỖI #1 — "Dữ liệu tải về thiếu TÊN SẢN PHẨM (thiếu trường dòng hàng)".
//
// NGUYÊN NHÂN CỐT LÕI (đã chứng minh bằng grep toàn repo): pipeline đồng bộ `sync()`
// CHỈ gọi `queryInvoices()` (danh sách hóa đơn = HEADER) rồi upsert vào bảng `hoa_don`.
// Nó KHÔNG BAO GIỜ gọi `getInvoiceDetail()` / `mapDetailLines()` — hai hàm U3 đã viết
// nhưng KHÔNG có call-site nào trong mã production. Tên sản phẩm (`ten`) nằm trong mảng
// `hdhhdvu` của endpoint DETAIL, mà pipeline không đụng tới → bảng `dong_hang_hoa`
// LUÔN RỖNG → mất toàn bộ trường dòng hàng (tên SP, đvt, số lượng, đơn giá, thuế suất).
//
// Test này khẳng định HÀNH VI ĐÚNG sau khi sửa: sau một lần đồng bộ, mỗi hóa đơn phải
// có các dòng hàng tương ứng trong `dong_hang_hoa`, và trường `ten` (tên sản phẩm)
// phải được lưu, không rỗng.
//
// TRẠNG THÁI KỲ VỌNG: ĐỎ trên mã hiện tại (dong_hang_hoa rỗng) → XANH sau khi nối
// getInvoiceDetail + mapDetailLines vào pipeline và persist.
//
// LƯU Ý CHO NGƯỜI SỬA (Claude Code): để test này chạy được, `sync()` (hoặc lớp gọi
// nó) cần một cách LẤY CHI TIẾT có thể mock — ví dụ nhận `fetchDetail?: (ref) =>
// Promise<InvoiceLine[]>` qua SyncOptions, mặc định dùng getInvoiceDetail+mapDetailLines
// với transport thật. Test dưới đây inject một fetchDetail giả (offline, không mạng).
// Nếu chọn thiết kế khác, chỉnh phần inject cho khớp — GIỮ NGUYÊN các assertion.
// ─────────────────────────────────────────────────────────────────────────────
import { PGlite } from "@electric-sql/pglite";
import { dongHangHoa, hoaDon, taiKhoanThue, tenants, withTenant } from "@vat/db";
import { INVOICE_ENDPOINTS } from "@vat/gdt-client";
import type { GdtTransport, InvoiceRow } from "@vat/gdt-client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { sync } from "../../src/sync";

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

/** Transport phục vụ purchase (một trang, state=null). */
function makeTransport(rows: InvoiceRow[]): GdtTransport {
  return {
    name: "mock",
    async fetch(url: string) {
      const u = new URL(url);
      if (u.pathname !== INVOICE_ENDPOINTS.purchase)
        return new Response("not found", { status: 404 });
      return new Response(JSON.stringify({ datas: rows, state: null }), { status: 200 });
    },
    async probe() {
      throw new Error("không dùng");
    },
  } as unknown as GdtTransport;
}

// fetchDetail giả (offline): trả dòng hàng theo shdon. TÊN SẢN PHẨM phải chảy vào DB.
function fakeFetchDetail(ref: { shdon: string | number }) {
  const shdon = String(ref.shdon);
  return Promise.resolve([
    {
      stt: 1,
      ten: `Sản phẩm A của HĐ ${shdon}`,
      dvtinh: "Cái",
      sluong: 2,
      dgia: 500000,
      thtien: 1000000,
      ltsuat: "8%",
      tsuat: 0.08,
      tthue: 80000,
      raw: { stt: 1, ten: `Sản phẩm A của HĐ ${shdon}` },
    },
  ]);
}

const BASE_OPTS = {
  token: "jwt-token-test",
  direction: "purchase" as const,
  dateFrom: "01/04/2026",
  dateTo: "30/04/2026",
  includeSco: false,
  // Người sửa: expose điểm inject này trên SyncOptions (mặc định = getInvoiceDetail+mapDetailLines).
  fetchDetail: fakeFetchDetail,
};

describe("sync — LƯU DÒNG HÀNG + TÊN SẢN PHẨM (regression lỗi #1)", () => {
  let db: Db;
  let tenantId: string;
  let taikhoanId: string;

  beforeEach(async () => {
    db = await freshDb();
    tenantId = await makeTenant(db, "Cty A", "0100000001");
    taikhoanId = await makeTaxAccount(db, tenantId, "0100000001-user");
  });

  it("sau đồng bộ: mỗi hóa đơn có dòng hàng trong dong_hang_hoa với TÊN SẢN PHẨM không rỗng", async () => {
    const transport = makeTransport([inv("1"), inv("2")]);
    // biome-ignore lint/suspicious/noExplicitAny: fetchDetail là điểm inject chưa có trên type cho tới khi sửa.
    const r = await sync({ db, transport, tenantId, taikhoanId, ...(BASE_OPTS as any) });
    expect(r.trangThai).toBe("completed");

    await withTenant(db, tenantId, async (tx) => {
      const invoices = await tx.select().from(hoaDon);
      expect(invoices.length).toBe(2);

      const lines = await tx.select().from(dongHangHoa);
      // LỖI #1: hiện tại lines.length === 0 (pipeline không lấy detail) → test ĐỎ.
      expect(lines.length).toBeGreaterThanOrEqual(2);

      // Mỗi dòng phải gắn đúng tenant + có TÊN SẢN PHẨM không rỗng.
      for (const l of lines) {
        expect(l.tenantId).toBe(tenantId);
        expect(l.ten).toBeTruthy();
        expect(String(l.ten).length).toBeGreaterThan(0);
      }

      // Dòng phải liên kết đúng hóa đơn (FK hoadon_id trỏ vào hóa đơn vừa lưu).
      const invoiceIds = new Set(invoices.map((i) => i.id));
      for (const l of lines) expect(invoiceIds.has(l.hoaDonId)).toBe(true);
    });
  });

  it("đồng bộ lại cùng kỳ → KHÔNG nhân đôi dòng hàng (idempotent ở tầng dòng hàng)", async () => {
    const transport = makeTransport([inv("1")]);
    // biome-ignore lint/suspicious/noExplicitAny: điểm inject chưa có trên type cho tới khi sửa.
    await sync({ db, transport, tenantId, taikhoanId, ...(BASE_OPTS as any) });
    // biome-ignore lint/suspicious/noExplicitAny: điểm inject chưa có trên type cho tới khi sửa.
    await sync({ db, transport, tenantId, taikhoanId, ...(BASE_OPTS as any) });

    const lines = await db.select().from(dongHangHoa).where(eq(dongHangHoa.tenantId, tenantId));
    // 1 hóa đơn × 1 dòng = 1; chạy 2 lần vẫn 1 (không nhân đôi).
    expect(lines.length).toBe(1);
  });

  it("(U25 AC3) giãn nhịp (retry.minIntervalMs) giữa các lần lấy detail, KHÔNG chờ trước lần đầu", async () => {
    const transport = makeTransport([inv("1"), inv("2"), inv("3")]);
    const waits: number[] = [];
    const r = await sync({
      db,
      transport,
      tenantId,
      taikhoanId,
      // biome-ignore lint/suspicious/noExplicitAny: fetchDetail là điểm inject chưa có trên type.
      ...(BASE_OPTS as any),
      retry: { minIntervalMs: 150, sleepFn: async (ms: number) => waits.push(ms) },
    });
    expect(r.trangThai).toBe("completed");
    // 3 hóa đơn → 2 khoảng nghỉ giữa các lần fetchDetail (không chờ trước lần đầu).
    expect(waits).toEqual([150, 150]);
  });
});

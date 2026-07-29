// U37b Gói 4b — REST tạo gói hóa đơn gốc cho MỘT khách hàng. Đi ĐƯỜNG THẬT: createApp +
// auth JWT + route + withTenant/RLS. Offline, không mạng.
import { goiChiaSe, taiKhoanThue } from "@vat/db";
import type { HoSoGocMessage } from "@vat/sync";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import {
  type Db,
  bearer,
  freshDb,
  injectDb,
  makeEnv,
  makeTenant,
  seedInvoice,
  tokenFor,
} from "../helpers";

const KHACH = "0312000001";
const MST_TENANT = "0100000001";

/** Queue giả ghi lại mọi message đã gửi — để khẳng định `ref` dựng từ DB chứ không từ body. */
function fakeQueue() {
  const sent: HoSoGocMessage[] = [];
  return {
    sent,
    queue: {
      send: async (body: HoSoGocMessage) => {
        sent.push(body);
      },
      sendBatch: async (msgs: Array<{ body: HoSoGocMessage }>) => {
        for (const m of msgs) sent.push(m.body);
      },
    },
  };
}

describe("REST POST /goi-chia-se (integration, PGlite)", () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;
  let tenantA: string;
  let tenantB: string;
  let q: ReturnType<typeof fakeQueue>;

  beforeEach(async () => {
    db = await freshDb();
    app = createApp(injectDb(db));
    tenantA = await makeTenant(db, "Cty A", MST_TENANT);
    tenantB = await makeTenant(db, "Cty B", "0100000009");
    q = fakeQueue();
    // Tài khoản thuế của tenant A: `username` = MST, đúng quy ước tài khoản chính.
    await db.insert(taiKhoanThue).values({ tenantId: tenantA, username: MST_TENANT });
  });

  const goi = async (
    body: unknown,
    opts: { tenantId?: string; vai?: string; coQueue?: boolean } = {},
  ) =>
    app.request(
      "/goi-chia-se",
      {
        method: "POST",
        headers: {
          ...bearer(await tokenFor(opts.tenantId ?? tenantA, { role: opts.vai ?? "quan_tri" })),
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      },
      makeEnv(opts.coQueue === false ? {} : { SYNC_QUEUE: q.queue as never }),
    );

  async function seedHoaDon(tenantId: string, shdon: string, over: Record<string, unknown> = {}) {
    return seedInvoice(db, tenantId, {
      chieu: "sold",
      nmmst: KHACH,
      nbmst: MST_TENANT,
      khhdon: "C26TQO",
      khmshdon: "1",
      shdon,
      tdlap: new Date("2026-07-15T00:00:00Z"),
      nguon: "normal",
      ...over,
    });
  }

  const HOP_LE = { nmmst: KHACH, tuNgay: "2026-07-01", denNgay: "2026-07-31" };

  // ─── QĐ-B9: khoảng ngày trống ⇒ CHẶN ────────────────────────────────────────
  it("thiếu tuNgay → 400, KHÔNG tạo gói phủ toàn bộ lịch sử", async () => {
    await seedHoaDon(tenantA, "1");
    const res = await goi({ nmmst: KHACH, denNgay: "2026-07-31" });

    expect(res.status).toBe(400);
    expect(await db.select().from(goiChiaSe)).toHaveLength(0);
    expect(q.sent).toHaveLength(0);
  });

  it("thiếu denNgay → 400", async () => {
    await seedHoaDon(tenantA, "1");
    expect((await goi({ nmmst: KHACH, tuNgay: "2026-07-01" })).status).toBe(400);
  });

  // ─── QĐ-B2: bắt buộc chọn khách hàng ────────────────────────────────────────
  it("thiếu nmmst → 400, không cho xuất 'cả tháng của mọi khách'", async () => {
    await seedHoaDon(tenantA, "1");
    const res = await goi({ tuNgay: "2026-07-01", denNgay: "2026-07-31" });

    expect(res.status).toBe(400);
    expect(q.sent).toHaveLength(0);
  });

  // ─── Đường thành công ───────────────────────────────────────────────────────
  it("hợp lệ → 201, tạo gói 'dang_tao' và enqueue đúng một message mỗi hóa đơn", async () => {
    await seedHoaDon(tenantA, "1");
    await seedHoaDon(tenantA, "2");

    const res = await goi(HOP_LE);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; soHoaDon: number };
    expect(body.soHoaDon).toBe(2);

    const rows = await db.select().from(goiChiaSe);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.trangThai).toBe("dang_tao");
    expect(rows[0]?.nmmst).toBe(KHACH);
    expect(rows[0]?.soHoaDon).toBe(2);

    expect(q.sent).toHaveLength(2);
    expect(q.sent.every((m) => m.kind === "hoso")).toBe(true);
  });

  // ─── Ràng buộc bảo mật cốt lõi ──────────────────────────────────────────────
  it("`ref` dựng TỪ DB (đúng 4 tham số định danh), không phải từ body", async () => {
    await seedHoaDon(tenantA, "13580", { khhdon: "C26TQO", khmshdon: "1" });

    await goi(HOP_LE);
    expect(q.sent[0]?.ref).toEqual({
      nbmst: MST_TENANT,
      khhdon: "C26TQO",
      khmshdon: "1",
      shdon: "13580",
      source: "normal",
    });
  });

  // `runHoSoGocJob` TIN THẲNG msg.ref, không tra lại theo tenant (review bảo mật U37a).
  // Nên body gửi kèm ref/hoaDonId phải bị TỪ CHỐI ngay ở biên, không được âm thầm bỏ qua.
  it("body gửi kèm `ref` hoặc `hoaDonId` → 400 (schema strict), KHÔNG enqueue", async () => {
    await seedHoaDon(tenantA, "1");

    const res = await goi({
      ...HOP_LE,
      ref: { nbmst: "9999999999", khhdon: "X", khmshdon: "1", shdon: "1", source: "normal" },
    });

    expect(res.status).toBe(400);
    expect(q.sent).toHaveLength(0);
  });

  it("CÁCH LY TENANT: hóa đơn cùng khách nhưng của tenant khác KHÔNG vào gói", async () => {
    await seedHoaDon(tenantA, "1");
    await seedHoaDon(tenantB, "2");

    await goi(HOP_LE);
    expect(q.sent).toHaveLength(1);
    expect(q.sent[0]?.tenantId).toBe(tenantA);
    expect(q.sent[0]?.ref.shdon).toBe("1");
  });

  it("message mang đúng taikhoanId ứng với MST người bán của hóa đơn", async () => {
    await seedHoaDon(tenantA, "1");
    const tk = await db.select().from(taiKhoanThue);

    await goi(HOP_LE);
    expect(q.sent[0]?.taikhoanId).toBe(tk[0]?.id);
  });

  // ─── Ca rỗng: không phát hành im lặng ───────────────────────────────────────
  it("không hóa đơn nào khớp → 400, KHÔNG tạo gói rỗng, KHÔNG enqueue", async () => {
    const res = await goi(HOP_LE);

    expect(res.status).toBe(400);
    expect(await db.select().from(goiChiaSe)).toHaveLength(0);
    expect(q.sent).toHaveLength(0);
  });

  // ─── Khóa R2 là thứ DUY NHẤT bảo vệ file ────────────────────────────────────
  it("khóa R2 KHÔNG chứa MST, khoảng ngày hay tenant_id — và hai gói khác khóa nhau", async () => {
    await seedHoaDon(tenantA, "1");
    await goi(HOP_LE);
    await goi(HOP_LE);

    const rows = await db.select().from(goiChiaSe);
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.khoaR2).toMatch(/^goi-hoa-don\/\d{4}-\d{2}\/[a-z0-9]{26,}\.zip$/);
      expect(r.khoaR2).not.toContain(KHACH);
      expect(r.khoaR2).not.toContain(MST_TENANT);
      expect(r.khoaR2).not.toContain("2026-07-01");
      expect(r.khoaR2).not.toContain(tenantA);
    }
    expect(rows[0]?.khoaR2).not.toBe(rows[1]?.khoaR2);
  });

  // Lúc TẠO chỉ đặt mốc tạm (cột NOT NULL); mốc THẬT được đặt lại lúc PHÁT HÀNH, vì
  // lifecycle của R2 đếm từ khi ghi object chứ không từ khi tạo hàng (điểm 2 đã chốt).
  it("hết hạn tạm lúc tạo là 7 ngày (khớp lifecycle het-han-1-tuan), không phải 30", async () => {
    await seedHoaDon(tenantA, "1");
    await goi(HOP_LE);

    const r = (await db.select().from(goiChiaSe))[0];
    if (!r) throw new Error("không tìm thấy gói vừa tạo");
    const soNgay = (r.hetHanLuc.getTime() - r.taoLuc.getTime()) / 86_400_000;
    expect(soNgay).toBeGreaterThan(6.9);
    expect(soNgay).toBeLessThan(7.1);
  });

  // ─── Quyền ──────────────────────────────────────────────────────────────────
  it("vai 'ke_toan' → 403: phát hành link CÔNG KHAI nhạy cảm hơn tra cứu", async () => {
    await seedHoaDon(tenantA, "1");
    const res = await goi(HOP_LE, { vai: "ke_toan" });

    expect(res.status).toBe(403);
    expect(q.sent).toHaveLength(0);
  });

  it("KHÔNG có JWT → 401", async () => {
    const res = await app.request(
      "/goi-chia-se",
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
      makeEnv({ SYNC_QUEUE: q.queue as never }),
    );
    expect(res.status).toBe(401);
  });

  it("thiếu binding hàng đợi → 503, KHÔNG tạo gói treo mãi ở 'dang_tao'", async () => {
    await seedHoaDon(tenantA, "1");
    const res = await goi(HOP_LE, { coQueue: false });

    expect(res.status).toBe(503);
    expect(await db.select().from(goiChiaSe)).toHaveLength(0);
  });
});

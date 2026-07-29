// U37b Gói 4c-2/4c-3/5 — xem tiến độ, đóng gói phát hành, thu hồi, danh sách, audit.
// Đi ĐƯỜNG THẬT: createApp + auth JWT + route + withTenant/RLS. Offline, không mạng.
import { auditLog, goiChiaSe, taiKhoanThue, tepHoaDonGoc } from "@vat/db";
import { unzipSync } from "fflate";
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
const enc = new TextEncoder();

/** R2 giả trong bộ nhớ — đủ cho `get`/`put`/`delete` mà route dùng. */
function fakeR2() {
  const kho = new Map<string, Uint8Array>();
  const meta = new Map<string, unknown>();
  /** Đếm SỐ LẦN ghi, không chỉ số khóa: hai lần dựng ghi đè cùng khóa thì `kho.size` vẫn
   * là 1 và lỗi lọt lưới. */
  const soLanPut = { n: 0 };
  return {
    kho,
    meta,
    soLanPut,
    bucket: {
      get: async (key: string) => {
        const v = kho.get(key);
        return v ? { arrayBuffer: async () => v.buffer.slice(0) } : null;
      },
      put: async (key: string, body: Uint8Array, opts?: unknown) => {
        soLanPut.n += 1;
        kho.set(key, body);
        meta.set(key, opts);
      },
      delete: async (key: string) => {
        kho.delete(key);
      },
    },
  };
}

describe("U37b — phát hành / thu hồi gói (integration, PGlite)", () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;
  let tenantA: string;
  let tenantB: string;
  let raw: ReturnType<typeof fakeR2>;
  let chiaSe: ReturnType<typeof fakeR2>;

  beforeEach(async () => {
    db = await freshDb();
    app = createApp(injectDb(db));
    tenantA = await makeTenant(db, "Cty A", MST_TENANT);
    tenantB = await makeTenant(db, "Cty B", "0100000009");
    raw = fakeR2();
    chiaSe = fakeR2();
    await db.insert(taiKhoanThue).values({ tenantId: tenantA, username: MST_TENANT });
    // Ba tệp tĩnh dùng chung, để MỘT bộ trong kho.
    for (const t of ["details.js", "viewinvoice-bg.jpg", "sign-check.jpg"]) {
      raw.kho.set(`hoadon-goc/_chung/${t}`, enc.encode(`noi-dung-${t}`));
    }
  });

  const env = () =>
    makeEnv({
      RAW: raw.bucket as never,
      CHIA_SE: chiaSe.bucket as never,
      SYNC_QUEUE: { send: async () => {} } as never,
    });

  const goi = async (
    duongDan: string,
    opts: { method?: string; tenantId?: string; vai?: string; body?: unknown } = {},
  ) =>
    app.request(
      duongDan,
      {
        method: opts.method ?? "GET",
        headers: {
          ...bearer(await tokenFor(opts.tenantId ?? tenantA, { role: opts.vai ?? "quan_tri" })),
          "content-type": "application/json",
        },
        ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
      },
      env(),
    );

  /** Seed một hóa đơn + (tuỳ chọn) bản ghi kho hồ sơ gốc kèm nội dung trong R2 giả. */
  async function seedHD(
    shdon: string,
    trangThai?: "da_tai" | "khong_co_ho_so_goc" | "loi",
    tenantId = tenantA,
  ): Promise<string> {
    const hoaDonId = await seedInvoice(db, tenantId, {
      chieu: "sold",
      nmmst: KHACH,
      nmten: "CÔNG TY TNHH TOUR ĐẢO",
      nbmst: MST_TENANT,
      khhdon: "C26TQO",
      khmshdon: "1",
      shdon,
      tdlap: new Date("2026-07-15T00:00:00Z"),
      nguon: "normal",
    });
    if (trangThai) {
      const kXml = `hoadon-goc/${tenantId}/${hoaDonId}.xml`;
      const kHtml = `hoadon-goc/${tenantId}/${hoaDonId}.html`;
      await db.insert(tepHoaDonGoc).values({
        tenantId,
        hoaDonId,
        trangThai,
        ...(trangThai === "da_tai" ? { khoaXml: kXml, khoaHtml: kHtml } : {}),
        ...(trangThai === "loi" ? { maLoi: "HTTP_ERROR" } : {}),
      });
      if (trangThai === "da_tai") {
        raw.kho.set(kXml, enc.encode(`<HDon>${shdon}</HDon>`));
        raw.kho.set(kHtml, enc.encode(`<html>${shdon}</html>`));
      }
    }
    return hoaDonId;
  }

  const taoGoi = async () => {
    const res = await goi("/goi-chia-se", {
      method: "POST",
      body: { nmmst: KHACH, tuNgay: "2026-07-01", denNgay: "2026-07-31" },
    });
    return ((await res.json()) as { id: string }).id;
  };

  // ─── 4c-2: GET thuần đọc ────────────────────────────────────────────────────
  describe("GET /goi-chia-se/:id — thuần đọc", () => {
    it("đang tải dở → trả tiến độ, KHÔNG tự đóng gói", async () => {
      await seedHD("1", "da_tai");
      await seedHD("2");
      const id = await taoGoi();

      const res = await goi(`/goi-chia-se/${id}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        trangThai: string;
        tienDo: { xong: number; conCho: number };
      };
      expect(body.trangThai).toBe("dang_tao");
      expect(body.tienDo).toMatchObject({ xong: 1, conCho: 1 });
      // GET không được gây tác dụng phụ — prefetch của trình duyệt/proxy sẽ kích hoạt.
      expect(chiaSe.kho.size).toBe(0);
    });

    it("CÁCH LY TENANT: tenant khác hỏi → 404, không lộ cả sự tồn tại của gói", async () => {
      await seedHD("1", "da_tai");
      const id = await taoGoi();

      expect((await goi(`/goi-chia-se/${id}`, { tenantId: tenantB })).status).toBe(404);
    });

    it("id không tồn tại → 404", async () => {
      const res = await goi("/goi-chia-se/11111111-1111-1111-1111-111111111111");
      expect(res.status).toBe(404);
    });
  });

  // ─── 4c-3: POST đóng gói ────────────────────────────────────────────────────
  describe("POST /goi-chia-se/:id/dong-goi", () => {
    it("còn hóa đơn đang chờ → 409, KHÔNG phát hành nửa vời", async () => {
      await seedHD("1", "da_tai");
      await seedHD("2");
      const id = await taoGoi();

      const res = await goi(`/goi-chia-se/${id}/dong-goi`, { method: "POST" });
      expect(res.status).toBe(409);
      expect(chiaSe.kho.size).toBe(0);
    });

    it("đủ → ghi ZIP vào bucket CÔNG KHAI, chuyển san_sang, trả link", async () => {
      await seedHD("1", "da_tai");
      await seedHD("2", "da_tai");
      const id = await taoGoi();

      const res = await goi(`/goi-chia-se/${id}/dong-goi`, { method: "POST" });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { trangThai: string; url: string };
      expect(body.trangThai).toBe("san_sang");
      expect(body.url).toContain("docs.tourdao.vn");

      // Ghi đúng bucket chia sẻ, KHÔNG ghi nhầm vào kho nội bộ.
      expect(chiaSe.kho.size).toBe(1);
      const [khoa, bytes] = [...chiaSe.kho.entries()][0] as [string, Uint8Array];
      expect(khoa).toMatch(/^goi-hoa-don\/\d{4}-\d{2}\/[a-z0-9]{26,}\.zip$/);

      const trong = Object.keys(unzipSync(bytes)).sort();
      expect(trong).toEqual([
        "C26TQO-1.html",
        "C26TQO-1.xml",
        "C26TQO-2.html",
        "C26TQO-2.xml",
        "bao-cao.txt",
        "details.js",
        "sign-check.jpg",
        "viewinvoice-bg.jpg",
      ]);

      const row = (await db.select().from(goiChiaSe))[0];
      expect(row?.trangThai).toBe("san_sang");
      expect(row?.kichThuoc).toBeGreaterThan(0);
    });

    // THU HỒI CHỈ THẬT SỰ THU HỒI KHI BIÊN KHÔNG GIỮ BẢN SAO.
    //
    // `docs.tourdao.vn` là custom domain của R2 ⇒ phản hồi đi qua CDN Cloudflare. Probe
    // THẬT trên bucket production 2026-07-29:
    //   put (không đặt cache-control) → `cache-control: max-age=14400`; GET lần 2 → `HIT`;
    //   DELETE khỏi R2 → GET vẫn `HTTP 200`, `cf-cache-status: HIT`, TRẢ NGUYÊN NỘI DUNG.
    //   ⇒ nút "Thu hồi" hứa sai: tệp còn tải được TỚI 4 GIỜ sau khi đã thu hồi.
    //   put --cache-control "no-store" → `cf-cache-status: BYPASS`; DELETE → GET 404 NGAY.
    //
    // Review bảo mật soi đúng thứ tự xóa-rồi-đổi-trạng-thái và kết luận an toàn — đúng ở
    // tầng mã, nhưng lớp CDN nằm NGOÀI mã. Chỉ probe thật mới thấy. Ca này khoá lại để
    // không ai gỡ `cacheControl` mà tưởng vô hại.
    it("đặt Cache-Control no-store — thiếu nó thì thu hồi KHÔNG thật sự thu hồi", async () => {
      await seedHD("1", "da_tai");
      const id = await taoGoi();
      await goi(`/goi-chia-se/${id}/dong-goi`, { method: "POST" });

      const khoa = [...chiaSe.kho.keys()][0] as string;
      const opts = chiaSe.meta.get(khoa) as { httpMetadata?: { cacheControl?: string } };
      expect(opts?.httpMetadata?.cacheControl).toBe("no-store");
    });

    it("hết hạn tính từ lúc PHÁT HÀNH và là 7 NGÀY (không phải 30)", async () => {
      await seedHD("1", "da_tai");
      const id = await taoGoi();
      await goi(`/goi-chia-se/${id}/dong-goi`, { method: "POST" });

      const row = (await db.select().from(goiChiaSe))[0];
      if (!row) throw new Error("không thấy gói");
      const soNgay = (row.hetHanLuc.getTime() - Date.now()) / 86_400_000;
      expect(soNgay).toBeGreaterThan(6.9);
      expect(soNgay).toBeLessThan(7.1);
    });

    it("hóa đơn thiếu hồ sơ gốc → vẫn phát hành, nhưng bao-cao.txt nêu rõ", async () => {
      await seedHD("1", "da_tai");
      await seedHD("2", "khong_co_ho_so_goc");
      await seedHD("3", "loi");
      const id = await taoGoi();

      await goi(`/goi-chia-se/${id}/dong-goi`, { method: "POST" });
      const bytes = [...chiaSe.kho.values()][0] as Uint8Array;
      const bc = new TextDecoder().decode(unzipSync(bytes)["bao-cao.txt"]);

      expect(bc).toContain("C26TQO-2");
      expect(bc).toContain("C26TQO-3");
      expect(bc).toMatch(/hồ sơ gốc/i);
    });

    it("KHÔNG hóa đơn nào tải được → 'loi', KHÔNG phát hành link", async () => {
      await seedHD("1", "khong_co_ho_so_goc");
      await seedHD("2", "loi");
      const id = await taoGoi();

      const res = await goi(`/goi-chia-se/${id}/dong-goi`, { method: "POST" });
      expect(res.status).toBe(409);
      expect(chiaSe.kho.size).toBe(0);
      expect((await db.select().from(goiChiaSe))[0]?.trangThai).toBe("loi");
    });

    it("đóng gói HAI LẦN → chỉ ghi một lần (bầu người đóng bằng UPDATE có điều kiện)", async () => {
      await seedHD("1", "da_tai");
      const id = await taoGoi();

      const [a, b] = await Promise.all([
        goi(`/goi-chia-se/${id}/dong-goi`, { method: "POST" }),
        goi(`/goi-chia-se/${id}/dong-goi`, { method: "POST" }),
      ]);

      // Bất biến THẬT: gói chỉ được DỰNG VÀ GHI đúng một lần. Cả hai cùng trả 200 là hợp
      // lệ — kẻ tới sau đi vào nhánh idempotent (thấy `san_sang` thì trả lại link cũ).
      expect(chiaSe.soLanPut.n).toBe(1);
      expect(chiaSe.kho.size).toBe(1);
      expect([a.status, b.status].every((s) => s < 500)).toBe(true);
      // Không được kẹt ở `dang_dong_goi` — kẻ thua bầu chọn không được làm hỏng trạng thái.
      expect((await db.select().from(goiChiaSe))[0]?.trangThai).toBe("san_sang");
    });

    it("CÁCH LY TENANT: tenant khác không đóng gói hộ được", async () => {
      await seedHD("1", "da_tai");
      const id = await taoGoi();

      const res = await goi(`/goi-chia-se/${id}/dong-goi`, { method: "POST", tenantId: tenantB });
      expect(res.status).toBe(404);
      expect(chiaSe.kho.size).toBe(0);
    });
  });

  // ─── Gói 5: thu hồi + danh sách + audit ─────────────────────────────────────
  describe("POST /goi-chia-se/:id/thu-hoi", () => {
    async function phatHanh(): Promise<string> {
      await seedHD("1", "da_tai");
      const id = await taoGoi();
      await goi(`/goi-chia-se/${id}/dong-goi`, { method: "POST" });
      return id;
    }

    it("thu hồi → XÓA file khỏi bucket công khai rồi mới đổi trạng thái", async () => {
      const id = await phatHanh();
      expect(chiaSe.kho.size).toBe(1);

      const res = await goi(`/goi-chia-se/${id}/thu-hoi`, { method: "POST" });
      expect(res.status).toBe(200);
      expect(chiaSe.kho.size).toBe(0);
      expect((await db.select().from(goiChiaSe))[0]?.trangThai).toBe("da_thu_hoi");
    });

    // Điểm 4 đã chốt: thu hồi là hành động GIẢM rủi ro — không chặn người phát hiện lộ.
    it("vai 'ke_toan' THU HỒI ĐƯỢC, dù không phát hành được", async () => {
      const id = await phatHanh();
      const res = await goi(`/goi-chia-se/${id}/thu-hoi`, { method: "POST", vai: "ke_toan" });

      expect(res.status).toBe(200);
      expect(chiaSe.kho.size).toBe(0);
    });

    it("thu hồi lần hai → vẫn 200 (idempotent), không lỗi", async () => {
      const id = await phatHanh();
      await goi(`/goi-chia-se/${id}/thu-hoi`, { method: "POST" });
      expect((await goi(`/goi-chia-se/${id}/thu-hoi`, { method: "POST" })).status).toBe(200);
    });

    it("CÁCH LY TENANT: tenant khác không thu hồi hộ được", async () => {
      const id = await phatHanh();
      const res = await goi(`/goi-chia-se/${id}/thu-hoi`, { method: "POST", tenantId: tenantB });

      expect(res.status).toBe(404);
      expect(chiaSe.kho.size).toBe(1);
    });
  });

  describe("GET /goi-chia-se — danh sách", () => {
    it("chỉ trả gói của tenant gọi, mới nhất trước", async () => {
      await seedHD("1", "da_tai");
      await taoGoi();
      await taoGoi();

      const res = await goi("/goi-chia-se");
      const body = (await res.json()) as { items: Array<{ id: string }> };
      expect(body.items).toHaveLength(2);

      const cuaB = await goi("/goi-chia-se", { tenantId: tenantB });
      expect(((await cuaB.json()) as { items: unknown[] }).items).toEqual([]);
    });

    // Không thể "vừa trả link vừa giấu khóa" — URL công khai CHÍNH LÀ khóa. Điều đáng
    // canh là: gói CHƯA sẵn sàng thì không được lộ URL (chưa có gì để chia sẻ, mà lộ sớm
    // là tạo ra một đường dẫn sống trước khi người dùng kịp quyết định phát hành).
    it("gói chưa sẵn sàng → url = null; sẵn sàng rồi mới có link", async () => {
      await seedHD("1", "da_tai");
      const id = await taoGoi();

      const truoc = (await (await goi("/goi-chia-se")).json()) as {
        items: Array<{ trangThai: string; url: string | null }>;
      };
      expect(truoc.items[0]?.trangThai).toBe("dang_tao");
      expect(truoc.items[0]?.url).toBeNull();

      await goi(`/goi-chia-se/${id}/dong-goi`, { method: "POST" });
      const sau = (await (await goi("/goi-chia-se")).json()) as {
        items: Array<{ url: string | null }>;
      };
      expect(sau.items[0]?.url).toContain("docs.tourdao.vn/goi-hoa-don/");
    });

    it("gói ĐÃ THU HỒI → url về null, không còn chào mời link chết", async () => {
      await seedHD("1", "da_tai");
      const id = await taoGoi();
      await goi(`/goi-chia-se/${id}/dong-goi`, { method: "POST" });
      await goi(`/goi-chia-se/${id}/thu-hoi`, { method: "POST" });

      const ds = (await (await goi("/goi-chia-se")).json()) as {
        items: Array<{ trangThai: string; url: string | null }>;
      };
      expect(ds.items[0]?.trangThai).toBe("da_thu_hoi");
      expect(ds.items[0]?.url).toBeNull();
    });
  });

  describe("audit log", () => {
    it("ghi CẢ phát hành lẫn thu hồi, và chiTiet KHÔNG chứa khóa R2", async () => {
      await seedHD("1", "da_tai");
      const id = await taoGoi();
      await goi(`/goi-chia-se/${id}/dong-goi`, { method: "POST" });
      await goi(`/goi-chia-se/${id}/thu-hoi`, { method: "POST" });

      const rows = await db.select().from(auditLog);
      const hanhDong = rows.map((r) => r.hanhDong);
      expect(hanhDong).toContain("phat_hanh_goi_chia_se");
      expect(hanhDong).toContain("thu_hoi_goi_chia_se");

      // Audit log đọc được bởi nhiều người trong tenant, mà khóa LÀ mật khẩu của file.
      expect(JSON.stringify(rows.map((r) => r.chiTiet))).not.toContain("goi-hoa-don/");
    });
  });
});

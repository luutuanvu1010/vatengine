// U37c — đường tải CÔNG KHAI `/tai/<token>`. Đi đường thật: createApp + route + PGlite.
//
// Đơn vị này sinh ra từ một lỗ hổng THẬT: trước đây file nằm trên bucket công khai gắn
// custom domain, nên "thu hồi" = xóa object. Probe production 2026-07-29 cho thấy xóa
// object KHÔNG vô hiệu hóa bản đã cache ở biên ⇒ tệp còn tải được tới 4 GIỜ sau khi thu
// hồi. Ở đây hiệu lực được hỏi lại DB ở MỖI lượt tải, nên thu hồi ăn ngay.
import { goiChiaSe } from "@vat/db";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { type Db, freshDb, injectDb, makeEnv, makeTenant } from "../helpers";

const TOKEN = "abcdefghijkmnpqrstuvwxyz23";

function fakeR2(coFile = true) {
  const kho = new Map<string, Uint8Array>();
  if (coFile) kho.set("goi-hoa-don/2026-07/x.zip", new TextEncoder().encode("PK-noi-dung"));
  return {
    kho,
    bucket: {
      get: async (key: string) => {
        const v = kho.get(key);
        return v
          ? {
              body: new ReadableStream({
                start(ctl) {
                  ctl.enqueue(v);
                  ctl.close();
                },
              }),
              httpMetadata: { contentDisposition: 'attachment; filename="hoa-don.zip"' },
            }
          : null;
      },
      put: async () => {},
      delete: async (key: string) => {
        kho.delete(key);
      },
    },
  };
}

describe("U37c — GET /tai/:token (integration, PGlite)", () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;
  let tenantId: string;
  let chiaSe: ReturnType<typeof fakeR2>;

  beforeEach(async () => {
    db = await freshDb();
    app = createApp(injectDb(db));
    tenantId = await makeTenant(db, "Cty A", "0100000001");
    chiaSe = fakeR2();
  });

  async function seed(over: Record<string, unknown> = {}) {
    await db.insert(goiChiaSe).values({
      tenantId,
      khoaR2: "goi-hoa-don/2026-07/x.zip",
      token: TOKEN,
      nmmst: "0312000001",
      tuNgay: "2026-07-01",
      denNgay: "2026-07-31",
      soHoaDon: 1,
      trangThai: "san_sang",
      hetHanLuc: new Date(Date.now() + 86_400_000),
      ...over,
    });
  }

  const tai = (token = TOKEN) =>
    app.request(`/tai/${token}`, {}, makeEnv({ CHIA_SE: chiaSe.bucket as never }));

  it("gói còn hiệu lực → 200, trả tệp, KHÔNG cần đăng nhập", async () => {
    await seed();
    const res = await tai();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect(await res.text()).toContain("PK-noi-dung");
  });

  // ĐÂY LÀ CA SINH RA CẢ ĐƠN VỊ NÀY.
  it("ĐÃ THU HỒI → 404 NGAY, dù tệp còn nguyên trong kho", async () => {
    await seed({ trangThai: "da_thu_hoi" });
    // Cố ý KHÔNG xóa object: chứng minh hiệu lực do DB quyết, không do sự tồn tại của tệp.
    expect(chiaSe.kho.size).toBe(1);

    expect((await tai()).status).toBe(404);
  });

  // Trước U37c, hết hạn chỉ do R2 Lifecycle làm — mà Cloudflare chỉ bảo đảm xóa TRONG VÒNG
  // 24h sau mốc, nên link còn sống quá hạn tới một ngày.
  it("HẾT HẠN → 404, không chờ lifecycle dọn", async () => {
    await seed({ hetHanLuc: new Date(Date.now() - 1000) });
    expect((await tai()).status).toBe(404);
  });

  it("token sai → 404", async () => {
    await seed();
    expect((await tai("zzzzzzzzzzzzzzzzzzzzzzzzzz")).status).toBe(404);
  });

  it("token dạng lạ → 404, không chạm tới DB", async () => {
    await seed();
    expect((await tai("../../etc/passwd")).status).toBe(404);
  });

  // Phân biệt được bốn ca này là xác nhận cho người dò rằng token đó TỪNG tồn tại — với
  // liên kết công khai, đó đúng là thứ duy nhất họ cần để đoán tiếp.
  it("bốn lý do từ chối trả về GIỐNG HỆT NHAU (không rò token từng tồn tại)", async () => {
    const chup = async () => {
      const res = await tai();
      return { status: res.status, than: await res.text() };
    };

    await seed();
    chiaSe.kho.clear(); // ca "mất tệp"
    const mucTep = await chup();

    db = await freshDb();
    app = createApp(injectDb(db));
    tenantId = await makeTenant(db, "Cty A", "0100000001");
    chiaSe = fakeR2();
    await seed({ trangThai: "da_thu_hoi" });
    const mucThuHoi = await chup();

    db = await freshDb();
    app = createApp(injectDb(db));
    tenantId = await makeTenant(db, "Cty A", "0100000001");
    chiaSe = fakeR2();
    await seed({ hetHanLuc: new Date(Date.now() - 1000) });
    const mucHetHan = await chup();

    const mucSaiToken = await (async () => {
      const res = await tai("zzzzzzzzzzzzzzzzzzzzzzzzzz");
      return { status: res.status, than: await res.text() };
    })();

    expect(mucThuHoi).toEqual(mucTep);
    expect(mucHetHan).toEqual(mucTep);
    expect(mucSaiToken).toEqual(mucTep);
  });

  // Thiếu dòng này là tái lập nguyên lỗi vừa sửa, chỉ đổi chỗ.
  it("phản hồi mang Cache-Control no-store — biên KHÔNG được giữ bản sao", async () => {
    await seed();
    expect((await tai()).headers.get("cache-control")).toBe("no-store");

    await db.update(goiChiaSe).set({ trangThai: "da_thu_hoi" });
    expect((await tai()).headers.get("cache-control")).toBe("no-store");
  });

  it("tải xong → tăng so_luot_tai và ghi lan_tai_cuoi", async () => {
    await seed();
    await tai();
    await tai();

    const row = (await db.select().from(goiChiaSe))[0];
    expect(row?.soLuotTai).toBe(2);
    expect(row?.lanTaiCuoi).toBeInstanceOf(Date);
  });

  it("bị từ chối thì KHÔNG đếm là một lượt tải", async () => {
    await seed({ trangThai: "da_thu_hoi" });
    await tai();

    expect((await db.select().from(goiChiaSe))[0]?.soLuotTai).toBe(0);
  });
});

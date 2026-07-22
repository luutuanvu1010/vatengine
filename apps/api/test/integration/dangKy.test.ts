// U17b (Task 5, §3.2) — POST /dang-ky: cổng đăng ký công khai CÓ KIỂM SOÁT. Khách tự đăng
// ký → tenant `cho_duyet` (chưa đăng nhập được cho tới khi Admin duyệt, U18). Integration
// Hono + PGlite, offline (testing.md).
import { auditLog, nguoiDung, tenants } from "@vat/db";
import { count, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { hashPassword } from "../../src/password";
import type { AnyDb } from "../../src/types";
import {
  type Db,
  freshDb,
  injectDb,
  makeBaoDangKySpy,
  makeEnv,
  makeTenant,
  stubTurnstile,
  voiCaptcha,
} from "../helpers";

// IP mặc định cho MỌI test trong file này (TEST-NET-3, RFC 5737 — không phải IP thật). Sau
// U33/QĐ-11, vắng header CF-Connecting-IP KHÔNG còn là lý do từ chối (Turnstile xác minh
// bằng token, IP chỉ là dữ liệu phụ chấm điểm) — nhưng vẫn đặt mặc định ở đây để test chạy
// giống đường thật đi qua biên Cloudflare. Ca THIẾU header có test riêng bên dưới.
const IP_MAC_DINH = "203.0.113.10";

function body(over: Record<string, unknown> = {}) {
  return {
    email: "chu.dn@congty.vn",
    tenDoanhNghiep: "Công ty TNHH ABC",
    mst: "0100000099",
    dongYDieuKhoan: true,
    ...over,
  };
}

// ip: chuỗi IP (mặc định IP_MAC_DINH khi bỏ qua tham số) — truyền THẲNG `null` (KHÔNG phải
// `undefined`, vì default-parameter của JS chỉ kích hoạt khi giá trị truyền vào là
// `undefined`) để mô phỏng request THIẾU HẲN header CF-Connecting-IP (Finding 3 test).
function dangKy(app: ReturnType<typeof createApp>, b: unknown, ip: string | null = IP_MAC_DINH) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (ip !== null) headers["CF-Connecting-IP"] = ip;
  // Widget Turnstile thật tự chèn `cf-turnstile-response` khi form được gửi; helper này
  // làm thay cho MỌI test đi qua đây — một chỗ, không phải mỗi ca một lần.
  return app.request(
    "/dang-ky",
    { method: "POST", headers, body: JSON.stringify(voiCaptcha(b as Record<string, unknown>)) },
    makeEnv(),
  );
}

describe("POST /dang-ky (U17b Task 5, PGlite)", () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    stubTurnstile();
    db = await freshDb();
    app = createApp(injectDb(db));
  });

  it("hợp lệ → 201 { ok, trangThai } + tenant cho_duyet/free + user quan_tri password NULL + audit dang_ky", async () => {
    const res = await dangKy(app, body());
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, trangThai: "cho_duyet" });

    const t = await db.select().from(tenants).where(eq(tenants.mst, "0100000099"));
    expect(t).toHaveLength(1);
    expect(t[0]?.trangThai).toBe("cho_duyet");
    expect(t[0]?.goiDichVu).toBe("free");
    const tenantId = t[0]?.id as string;

    const u = await db.select().from(nguoiDung).where(eq(nguoiDung.tenantId, tenantId));
    expect(u).toHaveLength(1);
    expect(u[0]?.vaiTro).toBe("quan_tri");
    expect(u[0]?.passwordHash).toBeNull();
    expect(u[0]?.email).toBe("chu.dn@congty.vn");

    const a = await db.select().from(auditLog).where(eq(auditLog.tenantId, tenantId));
    expect(a.some((x) => x.hanhDong === "dang_ky")).toBe(true);
  });

  it("thiếu dongYDieuKhoan → 400 chua_dong_y_dieu_khoan, KHÔNG tạo hàng nào", async () => {
    const [t0] = await db.select({ n: count() }).from(tenants);
    const [u0] = await db.select({ n: count() }).from(nguoiDung);

    const { dongYDieuKhoan: _drop, ...b } = body();
    const res = await dangKy(app, b);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "chua_dong_y_dieu_khoan" });

    const [t1] = await db.select({ n: count() }).from(tenants);
    const [u1] = await db.select({ n: count() }).from(nguoiDung);
    expect(t1?.n).toBe(t0?.n);
    expect(u1?.n).toBe(u0?.n);
  });

  it("dongYDieuKhoan = false → 400 chua_dong_y_dieu_khoan, KHÔNG tạo hàng nào", async () => {
    const res = await dangKy(app, body({ dongYDieuKhoan: false }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "chua_dong_y_dieu_khoan" });
    expect((await db.select().from(tenants)).length).toBe(0);
    expect((await db.select().from(nguoiDung)).length).toBe(0);
  });

  it("email rác → 400 email_khong_hop_le (KHÔNG lộ ly_do nội bộ)", async () => {
    const res = await dangKy(app, body({ email: "khong-hop-le" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "email_khong_hop_le" });
  });

  for (const mst of ["010000009", "01000000999", "010000009A"]) {
    it(`MST sai dạng (${mst}) → 400 mst_khong_hop_le`, async () => {
      const res = await dangKy(app, body({ mst, email: `khac-${mst}@abc.vn` }));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "mst_khong_hop_le" });
    });
  }

  it("MST 13 số hợp lệ → 201 (không chỉ 10 số)", async () => {
    const res = await dangKy(app, body({ mst: "0100000099123", email: "khac13@abc.vn" }));
    expect(res.status).toBe(201);
  });

  it("MST trùng → 409 da_ton_tai", async () => {
    await makeTenant(db, "Cty cũ", "0100000099");
    const res = await dangKy(app, body());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "da_ton_tai" });
  });

  it("email trùng → 409 da_ton_tai, KHÔNG tạo tenant mồ côi (rollback trọn transaction)", async () => {
    const t = await makeTenant(db, "Cty cũ", "0100000001");
    await db.insert(nguoiDung).values({
      tenantId: t,
      email: "chu.dn@congty.vn",
      vaiTro: "quan_tri",
    });

    const res = await dangKy(app, body());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "da_ton_tai" });

    // MST của body() ("0100000099") KHÔNG trùng — nếu tenant vẫn được tạo trước khi user
    // insert thất bại thì đây sẽ là một tenant "mồ côi" (không có người dùng nào đăng nhập
    // được). Phải rỗng ⇒ chứng minh cả hai insert nằm trong CÙNG một transaction.
    const orphan = await db.select().from(tenants).where(eq(tenants.mst, "0100000099"));
    expect(orphan).toHaveLength(0);
  });

  // U17b (Task 5b, F4) — lỗ hổng đo được: chỉ mục cũ nguoi_dung_email_unique là byte-exact
  // trên cột "email" trần. dangKy.ts chuẩn hoá (trim+lowercase) email MỚI trước khi ghi,
  // nhưng KHÔNG chạm được hàng ĐÃ CÓ SẴN mang case gốc (dữ liệu cũ trước khi có chuẩn hoá,
  // hoặc một đường ghi khác trong tương lai không đi qua dangKy.ts) — "Boss@Corp.vn" y hệt
  // ví dụ đo được trong báo cáo. Test chèn THẲNG (không qua /dang-ky) để dựng đúng ca đó,
  // rồi đăng ký lại bằng biến thể HOA/thường — PHẢI vẫn bị coi là trùng (409), không được
  // tạo tenant thứ hai. Migration 0010 thay chỉ mục bằng biểu thức lower(email); TRƯỚC khi
  // có 0010, test này ĐỎ (201, tạo trùng).
  it("email trùng KHÁC HOA/THƯỜNG (F4) → vẫn 409 da_ton_tai, không tạo tenant thứ hai", async () => {
    const t = await makeTenant(db, "Cty cũ", "0100000001");
    await db.insert(nguoiDung).values({
      tenantId: t,
      email: "Boss@Corp.vn",
      vaiTro: "quan_tri",
    });

    const res = await dangKy(app, body({ email: "BOSS@CORP.VN", mst: "0100000099" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "da_ton_tai" });

    const orphan = await db.select().from(tenants).where(eq(tenants.mst, "0100000099"));
    expect(orphan).toHaveLength(0);
  });

  // U33/QĐ-11 — ca này TRƯỚC ĐÂY khẳng định "vượt ngưỡng IP → 429". Ngưỡng đó đã chuyển
  // hẳn sang WAF Cloudflare. Ca được ĐẢO CHIỀU chứ không xoá: một hành vi biến mất phải có
  // test nói rõ nó biến mất là CÓ CHỦ Ý, nếu không người sau sẽ đọc khoảng trống này thành
  // "thiếu sót" và thêm lại limiter tầng ứng dụng — đúng thứ QĐ-11 vừa bỏ đi.
  it("QĐ-11 — 10 lượt liên tiếp CÙNG IP đều qua: không còn khoá nhịp ở tầng ứng dụng", async () => {
    const ketQua: number[] = [];
    for (let i = 0; i < 10; i++) {
      const res = await dangKy(
        app,
        body({ mst: `01000001${String(i).padStart(2, "0")}`, email: `a${i}@abc.vn` }),
      );
      ketQua.push(res.status);
    }
    expect(ketQua).toEqual(Array(10).fill(201));
  });

  it("cách ly: đăng ký không đọc/ghi chạm dữ liệu tenant khác đang có", async () => {
    const other = await makeTenant(db, "Cty khác", "0100000001");
    await db.insert(nguoiDung).values({
      tenantId: other,
      email: "khac@existing.vn",
      vaiTro: "quan_tri",
    });
    await db.insert(auditLog).values({ tenantId: other, hanhDong: "seed_khac", chiTiet: {} });

    const res = await dangKy(app, body());
    expect(res.status).toBe(201);

    const otherUsers = await db.select().from(nguoiDung).where(eq(nguoiDung.tenantId, other));
    expect(otherUsers).toHaveLength(1);
    const otherAudit = await db.select().from(auditLog).where(eq(auditLog.tenantId, other));
    expect(otherAudit).toHaveLength(1);
    expect(otherAudit[0]?.hanhDong).toBe("seed_khac");
  });

  it("tenant vừa đăng ký KHÔNG đăng nhập được dù CÓ mật khẩu (nối Task 4 — cổng trạng thái)", async () => {
    const res = await dangKy(app, body());
    expect(res.status).toBe(201);
    const t = await db.select().from(tenants).where(eq(tenants.mst, "0100000099"));
    const tenantId = t[0]?.id as string;

    // Đặt mật khẩu tay để chứng minh cổng trạng thái chặn vì trang_thai='cho_duyet',
    // KHÔNG PHẢI vì password_hash NULL.
    await db
      .update(nguoiDung)
      .set({ passwordHash: await hashPassword("mat-khau-bat-ky") })
      .where(eq(nguoiDung.tenantId, tenantId));

    const loginRes = await app.request(
      "/auth/login",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          voiCaptcha({ email: "chu.dn@congty.vn", password: "mat-khau-bat-ky" }),
        ),
      },
      makeEnv(),
    );
    expect(loginRes.status).toBe(401);
  });

  // U17b (Task 5b) — lỗ hổng đo được TRÊN DB THẬT (báo cáo 2026-07-20): sau đăng ký, DB lưu
  // email đã chuẩn hoá lowercase ("person@example.com"), nhưng đăng nhập lại BẰNG ĐÚNG chuỗi
  // đã gõ lúc đăng ký ("Person@Example.com") → 401, vì auth.ts (TRƯỚC sửa) truyền email THÔ
  // cho auth_lookup_user(), còn SQL của hàm so khớp byte-exact (`WHERE n.email = p_email`).
  // Chỉ đăng nhập được nếu gõ TOÀN THƯỜNG — bất kỳ ai đăng ký email có ký tự hoa đều tự khoá
  // mình khỏi tài khoản của chính họ. Test dựng nối tiếp /dang-ky → (mô phỏng active + đặt
  // mật khẩu — hai bước NGOÀI phạm vi Task 5, xảy ra ở luồng duyệt/đặt mật khẩu sau) →
  // /auth/login bằng ĐÚNG chuỗi hoa/thường gốc. TRƯỚC sửa auth.ts: 401 (ĐỎ). SAU sửa: 200.
  it("đăng ký email HOA/thường lẫn lộn rồi đăng nhập lại BẰNG ĐÚNG chuỗi đã gõ → 200 (F đăng nhập-khoá)", async () => {
    const emailGoc = "Nguoi.Dung@CongTy.VN";

    const dk = await dangKy(app, body({ email: emailGoc, mst: "0100000077" }));
    expect(dk.status).toBe(201);

    const t = await db.select().from(tenants).where(eq(tenants.mst, "0100000077"));
    const tenantId = t[0]?.id as string;

    // DB lưu email đã chuẩn hoá lowercase (dangKy.ts trim+lowercase trước insert) — đúng
    // hiện trạng đo được ("stored in DB = person@example.com").
    const u = await db.select().from(nguoiDung).where(eq(nguoiDung.tenantId, tenantId));
    expect(u[0]?.email).toBe("nguoi.dung@congty.vn");

    // Mô phỏng admin duyệt + đặt mật khẩu (luồng sau, ngoài phạm vi Task 5) để cô lập ĐÚNG
    // lỗi đang sửa: chuẩn hoá ở ĐƯỜNG LOGIN — không phải cổng trạng thái (đã có test riêng
    // ở trên) hay việc thiếu mật khẩu.
    await db.update(tenants).set({ trangThai: "active" }).where(eq(tenants.id, tenantId));
    await db
      .update(nguoiDung)
      .set({ passwordHash: await hashPassword("gi-do-sau-duyet-01") })
      .where(eq(nguoiDung.tenantId, tenantId));

    const loginRes = await app.request(
      "/auth/login",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(voiCaptcha({ email: emailGoc, password: "gi-do-sau-duyet-01" })),
      },
      makeEnv(),
    );
    expect(loginRes.status).toBe(200);
  });

  // QĐ-1 — điểm chốt hướng đi của cả route: INSERT tenant qua withTenant(UUID tự sinh) có
  // THẬT SỰ lọt qua RLS dưới role production (non-superuser, không sở hữu bảng, không
  // BYPASSRLS) hay không. Test khác trong file này chạy dưới role mặc định của PGlite
  // (postgres, SUPERUSER) nên tự động bypass RLS — không chứng minh được gì về QĐ-1. Test
  // này set ROLE thật trên cùng kết nối trước khi gọi route, mô phỏng đúng cấu hình
  // production (packages/db/provisioning/app-role.sql) để không tin theo tài liệu suông
  // (CLAUDE.md — nguyên tắc bằng chứng).
  it("QĐ-1: INSERT tenant qua withTenant lọt RLS dưới role production non-superuser", async () => {
    await db.execute(
      sql`create role vat_app_probe login nosuperuser nobypassrls nocreatedb nocreaterole`,
    );
    await db.execute(sql`grant usage on schema public to vat_app_probe`);
    await db.execute(
      sql`grant select, insert, update, delete on all tables in schema public to vat_app_probe`,
    );
    await db.execute(sql`grant usage, select on all sequences in schema public to vat_app_probe`);
    await db.execute(sql`set role vat_app_probe`);

    let res: Response;
    try {
      res = await dangKy(app, body({ mst: "0100000077", email: "probe@abc.vn" }));
    } finally {
      await db.execute(sql`reset role`);
    }

    expect(res.status).toBe(201);
    const t = await db.select().from(tenants).where(eq(tenants.mst, "0100000077"));
    expect(t).toHaveLength(1);
    expect(t[0]?.trangThai).toBe("cho_duyet");
  });

  // Finding 1 (TOCTOU) — dùng makeRacySignupLimiterFactory (helpers.ts): double mô phỏng
  // ĐÚNG một Durable Object thật (mỗi lệnh checkAndRecord/refund tới "DO" của một key được
  // xếp hàng + xử lý TUẦN TỰ, có độ trễ round-trip giả lập). 12 request đồng thời cùng IP,
  // ngưỡng 3 — implementation NGUYÊN TỬ (checkAndRecordSignup) phải để lọt ĐÚNG 3, chặn 9.
  //
  // ĐÃ XÁC NHẬN test này ĐỎ dưới implementation CŨ (check()/record() tách rời): 12/12 lọt
  // qua ngưỡng 3 — chạy TRƯỚC khi sửa (git history commit này), dùng double tương đương xây
  // trực tiếp trong file test (mô phỏng đúng cặp check()/record() rời với xếp hàng + độ trễ
  // round-trip — xem báo cáo task-5c-report.md để biết số liệu quan sát được).
  // U33/QĐ-11 — ca TOCTOU cũ đo tranh chấp trên bộ đếm của SignupLimiter. Bộ đếm không còn,
  // nhưng CÂU HỎI thì còn nguyên giá trị: N request đồng thời có sinh ra trạng thái nhân đôi
  // không? Sau khi gỡ limiter, chốt chống nhân đôi DUY NHẤT còn lại là UNIQUE(mst) ở DB —
  // nên ca này chuyển sang đo CHÍNH nó, thay vì biến mất cùng cơ chế cũ.
  it("[TOCTOU] N request đồng thời CÙNG MST → đúng 1 tenant, phần còn lại 409 (chốt UNIQUE ở DB)", async () => {
    const N = 12;
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) => dangKy(app, body({ email: `race${i}@abc.vn` }))),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(N - 1);
    expect(results.some((r) => r.status === 429)).toBe(false);
    expect(await db.select({ n: count() }).from(tenants)).toEqual([{ n: 1 }]);
  });

  // U33/QĐ-11 — trước đây thiếu CF-Connecting-IP là 503: SignupLimiter phải có IP mới đếm
  // được, và dồn tất cả vào bucket "unknown" sẽ thành tự-DoS. Turnstile xác minh bằng TOKEN;
  // IP chỉ là dữ liệu phụ giúp Cloudflare chấm điểm ⇒ vắng header không còn là lý do từ chối.
  // Giữ ca này (đảo chiều) để lần sau không ai khôi phục 503 vì tưởng nó vẫn cần.
  it("QĐ-11 — THIẾU header CF-Connecting-IP vẫn đăng ký được (IP chỉ còn là dữ liệu phụ của Turnstile)", async () => {
    const res = await dangKy(app, body(), null);
    expect(res.status).toBe(201);
    expect((await db.select().from(tenants)).length).toBe(1);
  });

  // Finding 4 — nhánh chưa test: body KHÔNG phải JSON hợp lệ → 400 bad_request (không phải
  // 500) — c.req.json() ném, xuLyDangKy bắt riêng TRƯỚC khi chạm limiter/DB.
  it("Finding 4 — body KHÔNG phải JSON hợp lệ → 400 bad_request", async () => {
    const res = await app.request(
      "/dang-ky",
      {
        method: "POST",
        headers: { "content-type": "application/json", "CF-Connecting-IP": IP_MAC_DINH },
        body: "{ khong phai json",
      },
      makeEnv(),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
  });

  // Finding 4 — nhánh chưa test: .strict() phải THẬT SỰ từ chối trường lạ không khai báo
  // trong schema (không chỉ đọc code mà tin — CLAUDE.md nguyên tắc bằng chứng).
  it("Finding 4 — trường lạ KHÔNG khai báo trong schema (.strict()) → 400 bad_request", async () => {
    const res = await dangKy(app, body({ vaiTroMongMuon: "quan_tri" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
  });

  // Finding 4 — lỗi DB KHÔNG PHẢI unique violation phải NỔI LÊN app.onError ({error:"internal"},
  // 500) — KHÔNG bị isUniqueViolation nuốt nhầm thành 409. Kết nối vẫn phải được đóng: rò
  // kết nối trên đường LỖI là kiểu rò khó thấy nhất, vì đường lỗi hiếm khi được chạy thật.
  //
  // U33/QĐ-11 — ca này trước đây kiểm thêm "hoàn lại quota (refund)": lỗi hạ tầng không phải
  // lạm dụng nên không được tính vào ngưỡng. Không còn quota để hoàn, nên nửa đó mất theo
  // SignupLimiter — cùng lý do với ca "refund() tự nó lỗi" (Finding 2/F9 mở rộng) đã gỡ hẳn.
  // Bài học của F9 thì KHÔNG mất: nó nằm ở chỗ khác, dưới dạng "một catch phụ trợ không được
  // ném đè lên kết quả chính" — xem `docs/plans/COMMERCIAL-LAYER-tinh-hinh.md` §7.
  it("Finding 4 — lỗi DB KHÔNG PHẢI unique violation → 500 {error:'internal'} (không bị nuốt thành 409), VÀ vẫn đóng kết nối", async () => {
    const closeSpy = { called: 0 };
    const brokenDb = {
      transaction: async () => {
        throw new Error("mat ket noi DB — khong phai loi unique");
      },
    } as unknown as AnyDb;
    const deps = {
      ...injectDb(db),
      getDb: async () => ({
        db: brokenDb,
        close: async () => {
          closeSpy.called += 1;
        },
      }),
    };
    const brokenApp = createApp(deps);

    const res = await dangKy(brokenApp, body());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "internal" });
    expect(closeSpy.called).toBe(1);
  });
});

// ══ U34a — báo super-admin khi có đăng ký mới ═══════════════════════════════════════════
describe("U34a — báo admin khi có hồ sơ đăng ký mới", () => {
  let db: Db;

  beforeEach(async () => {
    stubTurnstile();
    db = await freshDb();
  });

  it("đăng ký thành công → báo admin ĐÚNG MỘT LẦN, kèm đủ dữ liệu để quyết", async () => {
    const spy = makeBaoDangKySpy();
    const app = createApp(injectDb(db, undefined, undefined, undefined, spy.fn));
    const res = await dangKy(app, body());
    expect(res.status).toBe(201);

    expect(spy.goi).toHaveLength(1);
    expect(spy.goi[0]).toMatchObject({
      tenDoanhNghiep: "Công ty TNHH ABC",
      mst: "0100000099",
      email: "chu.dn@congty.vn",
    });
    // tenantId phải là id THẬT vừa ghi, không phải chuỗi bịa — nếu sai, deep link trong
    // thông báo (và U34e sau này) sẽ trỏ vào hư không.
    const [t] = await db.select().from(tenants).where(eq(tenants.mst, "0100000099"));
    expect(spy.goi[0]?.tenantId).toBe(t?.id);
  });

  it("🔴 đăng ký HỎNG (MST trùng → 409) → KHÔNG báo admin", async () => {
    // Báo về một hồ sơ không tồn tại là bắt admin đi tìm thứ không có. Lời gọi nằm SAU
    // commit chính vì vậy.
    await makeTenant(db, "Cty đã có", "0100000099");
    const spy = makeBaoDangKySpy();
    const app = createApp(injectDb(db, undefined, undefined, undefined, spy.fn));
    const res = await dangKy(app, body());
    expect(res.status).toBe(409);
    expect(spy.goi).toHaveLength(0);
  });

  it("🔴 body sai (400) → KHÔNG báo admin", async () => {
    const spy = makeBaoDangKySpy();
    const app = createApp(injectDb(db, undefined, undefined, undefined, spy.fn));
    expect((await dangKy(app, body({ mst: "123" }))).status).toBe(400);
    expect(spy.goi).toHaveLength(0);
  });

  it("🔴 (F9) thông báo NÉM LỖI → khách vẫn nhận 201 và tenant vẫn nằm trong DB", async () => {
    // Đúng lớp lỗi F9: một nhánh phụ trợ ném đè lên kết quả chính. Khách đã có tenant
    // trong DB rồi — trả 500 cho họ vì bot Telegram của ta chết là sai hai lần: vừa mất
    // niềm tin, vừa khiến họ đăng ký lại và nhận 409 khó hiểu.
    const spy = makeBaoDangKySpy({ nem: true });
    const app = createApp(injectDb(db, undefined, undefined, undefined, spy.fn));
    const res = await dangKy(app, body());
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, trangThai: "cho_duyet" });
    expect(spy.goi).toHaveLength(1);

    const rows = await db.select().from(tenants).where(eq(tenants.mst, "0100000099"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.trangThai).toBe("cho_duyet");
  });
});

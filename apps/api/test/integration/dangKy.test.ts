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
  makeEnv,
  makeRacySignupLimiterFactory,
  makeSignupLimiterFactory,
  makeTenant,
} from "../helpers";

// IP mặc định cho MỌI test trong file này (TEST-NET-3, RFC 5737 — không phải IP thật). Sau
// Finding 3 (F6), thiếu CF-Connecting-IP giờ bị TỪ CHỐI TƯỜNG MINH (503) thay vì âm thầm gộp
// vào bucket "unknown" — nếu KHÔNG đặt header này ở đây, MỌI test 201/4xx/409 hiện có sẽ vỡ.
// Test riêng cho ca THIẾU header (503) tự gọi app.request trực tiếp, không qua helper này.
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
  return app.request("/dang-ky", { method: "POST", headers, body: JSON.stringify(b) }, makeEnv());
}

describe("POST /dang-ky (U17b Task 5, PGlite)", () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
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

  it("vượt ngưỡng IP → 429 qua_nhieu_yeu_cau + Retry-After", async () => {
    const limitedApp = createApp(
      injectDb(
        db,
        undefined,
        undefined,
        undefined,
        undefined,
        makeSignupLimiterFactory({ maxMoiCuaSo: 2, cuaSoMs: 3_600_000 }),
      ),
    );
    await dangKy(limitedApp, body({ mst: "0100000001", email: "a1@abc.vn" }));
    await dangKy(limitedApp, body({ mst: "0100000002", email: "a2@abc.vn" }));
    const res = await dangKy(limitedApp, body({ mst: "0100000003", email: "a3@abc.vn" }));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "qua_nhieu_yeu_cau" });
    expect(res.headers.get("Retry-After")).toBeTruthy();
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
        body: JSON.stringify({ email: "chu.dn@congty.vn", password: "mat-khau-bat-ky" }),
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
        body: JSON.stringify({ email: emailGoc, password: "gi-do-sau-duyet-01" }),
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
  it("[TOCTOU] N request đồng thời cùng IP KHÔNG được vượt ngưỡng (Finding 1)", async () => {
    const N = 12;
    const MAX = 3;
    const racyApp = createApp(
      injectDb(
        db,
        undefined,
        undefined,
        undefined,
        undefined,
        makeRacySignupLimiterFactory({ maxMoiCuaSo: MAX, cuaSoMs: 3_600_000 }),
      ),
    );
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        dangKy(
          racyApp,
          body({ mst: `010000${String(i).padStart(4, "0")}`, email: `race${i}@abc.vn` }),
        ),
      ),
    );
    const soThanhCong = results.filter((r) => r.status === 201).length;
    const soChan = results.filter((r) => r.status === 429).length;
    expect(soThanhCong).toBe(MAX);
    expect(soChan).toBe(N - MAX);
  });

  // Finding 3 (F6) — header CF-Connecting-IP VẮNG MẶT phải bị TỪ CHỐI TƯỜNG MINH, KHÔNG âm
  // thầm dồn vào bucket "unknown" chung cho cả Internet (tự-DoS: 5 lượt/giờ khoá luôn cổng
  // đăng ký toàn cầu). 503 — không phải lỗi của người gọi, mà là điều kiện hạ tầng tạm thời.
  it("Finding 3 — THIẾU header CF-Connecting-IP → 503 khong_xac_dinh_duoc_ip, KHÔNG tạo hàng nào", async () => {
    const res = await dangKy(app, body(), null);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "khong_xac_dinh_duoc_ip" });
    expect((await db.select().from(tenants)).length).toBe(0);
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

  // Finding 4 — nhánh chưa test: lỗi DB KHÔNG PHẢI unique violation phải NỔI LÊN app.onError
  // ({error:"internal"}, 500) — KHÔNG bị isUniqueViolation nuốt nhầm thành 409. Đồng thời
  // xác nhận thiết kế refund (Finding 1): lỗi HẠ TẦNG (không phải lạm dụng) phải được HOÀN
  // lại quota — request kế tiếp CÙNG IP vẫn phải được cho qua dù ngưỡng chỉ có 1.
  it("Finding 4 — lỗi DB KHÔNG PHẢI unique violation → 500 {error:'internal'} (không bị nuốt thành 409), VÀ hoàn lại quota (refund)", async () => {
    const closeSpy = { called: 0 };
    const brokenDb = {
      transaction: async () => {
        throw new Error("mat ket noi DB — khong phai loi unique");
      },
    } as unknown as AnyDb;
    const deps = {
      ...injectDb(
        db,
        undefined,
        undefined,
        undefined,
        undefined,
        makeSignupLimiterFactory({ maxMoiCuaSo: 1, cuaSoMs: 3_600_000 }),
      ),
      getDb: async () => ({
        db: brokenDb,
        close: async () => {
          closeSpy.called += 1;
        },
      }),
    };
    const brokenApp = createApp(deps);

    const res1 = await dangKy(brokenApp, body());
    expect(res1.status).toBe(500);
    expect(await res1.json()).toEqual({ error: "internal" });
    expect(closeSpy.called).toBe(1);

    // Ngưỡng chỉ 1/giờ — nếu KHÔNG refund, request thứ hai (cùng IP) sẽ bị 429. Được cho
    // qua (kết quả KHÔNG phải 429) ⇒ quota của lượt lỗi hạ tầng ở trên đã được hoàn lại.
    // (Vẫn 500 vì cùng brokenDb — nhưng KHÔNG PHẢI 429, đó là điều đang kiểm chứng.)
    const res2 = await dangKy(brokenApp, body({ mst: "0100000098", email: "khac2@abc.vn" }));
    expect(res2.status).not.toBe(429);
  });

  // Finding 2 (F9) mở rộng — refund() CHÍNH NÓ cũng là một lệnh gọi DO, có thể trục trặc.
  // Lỗi refund() TUYỆT ĐỐI không được thay thế lỗi 500 gốc (lặp lại đúng lớp bug F9: một
  // finally/catch phụ trợ ném đè lên kết quả chính) — phải vẫn thấy {error:'internal'}, có
  // log cảnh báo (không PII), KHÔNG có exception nào rò ra ngoài route (unhandled rejection).
  it("Finding 2 (F9 mở rộng) — refund() tự nó lỗi KHÔNG được thay thế lỗi 500 gốc", async () => {
    const brokenDb = {
      transaction: async () => {
        throw new Error("mat ket noi DB — khong phai loi unique");
      },
    } as unknown as AnyDb;
    const deps = {
      ...injectDb(db),
      getDb: async () => ({ db: brokenDb, close: async () => {} }),
      getSignupLimiter: () => ({
        checkAndRecord: async () => ({ gate: { chan: false, thuLaiSauMs: 0 }, token: 123 }),
        refund: async () => {
          throw new Error("DO signup-limiter tạm thời không phản hồi");
        },
      }),
    };
    const brokenApp = createApp(deps);

    const res = await dangKy(brokenApp, body());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "internal" });
  });
});

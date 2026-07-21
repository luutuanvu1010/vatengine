// U17b (§3.3) — Cổng trạng thái tenant ở đường đăng nhập.
// Tenant chưa duyệt / bị khoá / bị từ chối KHÔNG được đăng nhập, và phải nhận ĐÚNG mã lỗi
// giống hệt sai mật khẩu — nếu khác, kẻ tấn công phân biệt được "tenant này có thật, đang
// chờ duyệt" với "không tồn tại", tức rò thông tin.
import { auditLog, nguoiDung, tenants } from "@vat/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Review finding 1 — bọc verifyPassword để CHỨNG MINH cổng trạng thái vẫn nằm SAU verify
// PBKDF2 (không có `if` riêng trả về sớm bỏ qua verify) — đúng khuôn mẫu
// auth.hardening.test.ts (H-A.5a). Nếu một refactor sau này tách cổng ra thành `if` sớm,
// guard này phải ĐỎ.
vi.mock("../../src/password", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/password")>();
  return { ...actual, verifyPassword: vi.fn(actual.verifyPassword) };
});

import { createApp } from "../../src/app";
import { verifyPassword } from "../../src/password";
import { SESSION_COOKIE } from "../../src/session";
import {
  type Db,
  freshDb,
  injectDb,
  makeEnv,
  makeTenant,
  seedUser,
  stubTurnstile,
  voiCaptcha,
} from "../helpers";

const verifySpy = vi.mocked(verifyPassword);

const EMAIL = "ke.toan@a.vn";
const MAT_KHAU_DUNG = "mat-khau-dung";
const MAT_KHAU_SAI = "mat-khau-sai";

describe("POST /auth/login — cổng trạng thái tenant (U17b)", () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;
  let tenantA: string;

  beforeEach(async () => {
    stubTurnstile();
    verifySpy.mockClear();
    db = await freshDb();
    app = createApp(injectDb(db));
    tenantA = await makeTenant(db, "Cty A", "0100000001");
    await seedUser(db, tenantA, EMAIL, MAT_KHAU_DUNG, "ke_toan");
  });

  async function setTrangThai(trangThai: string) {
    await db.update(tenants).set({ trangThai }).where(eq(tenants.id, tenantA));
  }

  function login(email: string, password: string) {
    return app.request(
      "/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(voiCaptcha({ email, password })),
      },
      makeEnv(),
    );
  }

  async function audits() {
    return db.select().from(auditLog).where(eq(auditLog.tenantId, tenantA));
  }

  for (const trangThai of ["cho_duyet", "khoa", "tu_choi"]) {
    it(`tenant '${trangThai}' + mật khẩu ĐÚNG → 401 giống hệt sai mật khẩu, KHÔNG cookie phiên`, async () => {
      // Finding 3 — chuẩn (baseline) "sai mật khẩu" phải lấy TRƯỚC khi hạ trạng thái tenant,
      // tức trên tenant vẫn còn 'active'. Lấy sau khi hạ trạng thái sẽ so sánh nhánh
      // chưa-duyệt với chính nó, không còn ý nghĩa "giống hệt sai mật khẩu" như tên test nêu.
      const wrongPw = await login(EMAIL, MAT_KHAU_SAI);

      await setTrangThai(trangThai);
      // Cô lập lần gọi verify cho request bị chặn cổng trạng thái (bỏ qua lần verify của
      // wrongPw ở trên) để đếm chính xác bên dưới.
      verifySpy.mockClear();
      const res = await login(EMAIL, MAT_KHAU_DUNG);

      expect(res.status).toBe(401);
      expect(res.status).toBe(wrongPw.status);
      // Finding 4 — so sánh CẤU TRÚC (object đã json()-parse), không phải byte-for-byte;
      // toEqual không phân biệt được thứ tự khoá hay khoảng trắng khác nhau giữa hai thân
      // phản hồi, nhưng đủ để bắt rò rỉ thêm trường/nội dung.
      expect(await res.json()).toEqual(await wrongPw.json());
      expect(res.headers.get("Set-Cookie")).toBeNull();
      // Finding 1 — cổng trạng thái PHẢI nằm SAU verify PBKDF2 (đúng 1 lần), KHÔNG được có
      // `if` riêng trả về sớm bỏ qua verify — nếu có, tenant chưa duyệt phản hồi NHANH HƠN
      // đo được từ bên ngoài so với sai mật khẩu, tức rò trạng thái qua timing.
      expect(verifySpy).toHaveBeenCalledTimes(1);
    });
  }

  it("tenant 'active' + mật khẩu đúng → 200 { ok: true } + CÓ cookie phiên (không hồi quy U8/U29)", async () => {
    const res = await login(EMAIL, MAT_KHAU_DUNG);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const raw = res.headers.get("Set-Cookie") ?? "";
    expect(raw).toContain(`${SESSION_COOKIE}=`);
  });

  it("'cho_duyet' → ghi audit login_fail_chua_duyet, KHÔNG ghi dang_nhap_saas thành công", async () => {
    await setTrangThai("cho_duyet");
    const res = await login(EMAIL, MAT_KHAU_DUNG);
    expect(res.status).toBe(401);

    const rows = await audits();
    const login_audit = rows.find((a) => a.hanhDong === "dang_nhap_saas");
    expect(login_audit).toBeDefined();
    expect(JSON.stringify(login_audit?.chiTiet)).toMatch(/login_fail_chua_duyet/);

    // Không có bản ghi thành công nào (ket_qua=thanh_cong) cho tenant chưa duyệt.
    expect(rows.some((a) => JSON.stringify(a.chiTiet).includes("thanh_cong"))).toBe(false);
  });
});

// U17b — LỖ HỔNG AUDIT ĐO ĐƯỢC (báo cáo 2026-07-20, xem đính chính docs/plans/
// U17b-plan-thuc-thi.md Task 4): tenant tạo qua POST /dang-ky (luồng THẬT) luôn có
// `password_hash IS NULL` (dangKy.ts — đặt mật khẩu là việc của luồng sau, ngoài U17b).
// Test `auth.trangThai.test.ts` ở TRÊN chỉ đi qua vì `seedUser` gán một mật khẩu thật —
// một quần thể `seedUser` KHÔNG BAO GIỜ tự sinh ra qua đăng ký công khai, nên test đó
// KHÔNG bắt được lỗ hổng: gate cũ `row?.password_hash && trang_thai !== "active"` luôn
// FALSE cho người dùng tự đăng ký (password_hash null) ⇒ nhánh audit
// `login_fail_chua_duyet` không bao giờ ghi được cho đúng quần thể nó được sinh ra để
// phục vụ. Test này đi ĐÚNG đường thật: đăng ký công khai → chưa duyệt → login → phải
// ghi được `login_fail_chua_duyet`.
describe("POST /auth/login — tenant tự đăng ký qua POST /dang-ky thật (KHÔNG seedUser)", () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    stubTurnstile();
    db = await freshDb();
    app = createApp(injectDb(db));
  });

  it("tenant tự đăng ký (password_hash NULL) đang chờ duyệt + login → 401 + ghi audit login_fail_chua_duyet", async () => {
    const email = "chu.tu.dang.ky@congty.vn";
    const signUpRes = await app.request(
      "/dang-ky",
      {
        method: "POST",
        headers: { "content-type": "application/json", "CF-Connecting-IP": "203.0.113.55" },
        body: JSON.stringify(
          voiCaptcha({
            email,
            tenDoanhNghiep: "Công ty Tự Đăng Ký",
            mst: "0100000077",
            dongYDieuKhoan: true,
          }),
        ),
      },
      makeEnv(),
    );
    expect(signUpRes.status).toBe(201);

    const [user] = await db.select().from(nguoiDung).where(eq(nguoiDung.email, email));
    expect(user).toBeDefined();
    expect(user?.passwordHash).toBeNull();
    const tenantId = user?.tenantId as string;

    const loginRes = await login(email, "bat-ky-mat-khau-nao");
    expect(loginRes.status).toBe(401);
    expect(loginRes.headers.get("Set-Cookie")).toBeNull();

    const rows = await db.select().from(auditLog).where(eq(auditLog.tenantId, tenantId));
    const loginAudit = rows.find((a) => a.hanhDong === "dang_nhap_saas");
    expect(loginAudit).toBeDefined();
    expect(JSON.stringify(loginAudit?.chiTiet)).toMatch(/login_fail_chua_duyet/);
  });

  function login(email: string, password: string) {
    return app.request(
      "/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(voiCaptcha({ email, password })),
      },
      makeEnv(),
    );
  }
});

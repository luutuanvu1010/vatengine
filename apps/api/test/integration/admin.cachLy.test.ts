// ══════════════════════════════════════════════════════════════════════════════════════
// U18 — BẤT BIẾN CÁCH LY. ĐIỀU KIỆN XONG BẮT BUỘC của cả đơn vị.
// ══════════════════════════════════════════════════════════════════════════════════════
//
// U18 cố ý mở một con đường đi vòng qua RLS (8 hàm BYPASSRLS ở migration 0011). Câu hỏi mà
// cả đơn vị phải trả lời được bằng bằng chứng, không bằng lập luận:
//
//     Việc super-admin thấy được MỌI tenant có vô tình làm token KHÁCH thấy được
//     tenant khác không?
//
// Nếu câu trả lời từng là "có", đó là sự cố rò rỉ dữ liệu giữa các doanh nghiệp — rủi ro
// pháp lý cao nhất của SaaS này (multi-tenant.md, "Khi gặp mơ hồ"). File này tồn tại để
// biến câu trả lời "không" thành thứ đo được, và để một refactor tương lai không thể âm
// thầm đảo nó.
//
// GIỚI HẠN ĐÃ BIẾT, ghi thẳng ra: PGlite chạy dưới superuser nên KHÔNG mô phỏng được việc
// Postgres *thi hành* GRANT/RLS đối với role app thật. Những gì file này chứng minh là
// **đường đi qua ứng dụng**: cùng một app, cùng một DB đã áp 0011, token khách vẫn không
// lấy được gì của tenant khác. Phần "role app không tự gọi được hàm admin_*" dựa vào
// REVOKE trong 0011 + kiểm chứng tay trên Neon, và được kiểm ở tầng catalog trong
// packages/db/test/integration/superAdmin.test.ts.
import { nguoiDung } from "@vat/db";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import {
  type Db,
  adminTokenFor,
  bearer,
  freshDb,
  injectDb,
  makeEnv,
  makeTenant,
  seedInvoice,
  seedSuperAdmin,
  tokenFor,
} from "../helpers";

describe("🔴 BẤT BIẾN: mở đường admin KHÔNG mở cách ly cho token khách", () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;
  let tenantA: string;
  let tenantB: string;
  let tokenKhachA: string;
  let tokenAdmin: string;

  beforeEach(async () => {
    db = await freshDb();
    app = createApp(injectDb(db));

    tenantA = await makeTenant(db, "Cty A", "0100000001");
    tenantB = await makeTenant(db, "Cty B", "0100000002");

    // Dữ liệu nghiệp vụ phân biệt được của từng bên — mọi assert dưới đây bám vào chuỗi
    // THẬT chỉ tồn tại ở một phía, không bám vào số lượng bản ghi.
    await seedInvoice(db, tenantA, { khhdon: "AAAAAA", shdon: "111" });
    await seedInvoice(db, tenantB, { khhdon: "BBBBBB", shdon: "222" });
    await db
      .insert(nguoiDung)
      .values({ tenantId: tenantB, email: "nguoi.cua.b@b.vn", vaiTro: "quan_tri" });

    tokenKhachA = await tokenFor(tenantA, { role: "quan_tri" });
    const adminId = await seedSuperAdmin(db, "chu@vatengine.vn", "mat-khau-chu");
    tokenAdmin = await adminTokenFor(adminId);
  });

  const nhuKhachA = (path: string) =>
    app.request(path, { headers: bearer(tokenKhachA) }, makeEnv());
  const nhuAdmin = (path: string) => app.request(path, { headers: bearer(tokenAdmin) }, makeEnv());

  it("token khách A đọc /invoices → CHỈ thấy hóa đơn của A", async () => {
    const res = await nhuKhachA("/invoices");
    expect(res.status).toBe(200);
    const s = await res.text();
    expect(s).toContain("AAAAAA");
    expect(s).not.toContain("BBBBBB");
  });

  it("token khách A đọc /me → CHỈ thấy tenant A", async () => {
    const s = await (await nhuKhachA("/me")).text();
    expect(s).toContain("0100000001");
    expect(s).not.toContain("0100000002");
    expect(s).not.toContain("nguoi.cua.b@b.vn");
  });

  it("token khách A kết xuất /exports → không kéo được dữ liệu B", async () => {
    const res = await app.request(
      "/exports",
      {
        method: "POST",
        headers: { ...bearer(tokenKhachA), "Content-Type": "application/json" },
        body: JSON.stringify({ dinh_dang: "csv" }),
      },
      makeEnv(),
    );
    // Kể cả khi hợp đồng route đổi (400/415…), điều kiện bất di bất dịch là: phản hồi
    // KHÔNG được chứa mảnh dữ liệu nào của B.
    expect(await res.text()).not.toContain("BBBBBB");
  });

  it("🔴 token khách KHÔNG gọi được BẤT KỲ endpoint /admin/* nào", async () => {
    // Khai method TƯỜNG MINH cho từng đường: gọi POST-endpoint bằng GET chỉ chứng minh
    // được router không khớp route (404), không chứng minh được cổng quyền có gác hay không.
    const duong: Array<[string, string]> = [
      ["GET", "/admin/tenants"],
      ["GET", `/admin/tenants/${tenantB}`],
      ["POST", `/admin/tenants/${tenantB}/duyet`],
      ["POST", `/admin/tenants/${tenantB}/tu-choi`],
      ["POST", `/admin/tenants/${tenantB}/khoa`],
      ["POST", `/admin/tenants/${tenantB}/mo-khoa`],
      ["POST", `/admin/tenants/${tenantB}/reset-mat-khau`],
      ["PATCH", `/admin/tenants/${tenantB}`],
    ];
    for (const [method, p] of duong) {
      const res = await app.request(
        p,
        {
          method,
          headers: { ...bearer(tokenKhachA), "Content-Type": "application/json" },
          ...(method === "PATCH" ? { body: JSON.stringify({ ten: "x" }) } : {}),
        },
        makeEnv(),
      );
      // 401 chứ KHÔNG phải 403/404: cổng phải chặn ở tầng xác thực, trước cả khi route
      // kịp nhìn tới `tenantB` — nếu ra 404 nghĩa là request đã đi qua cổng rồi mới hỏng.
      expect({ method, p, status: res.status }).toEqual({ method, p, status: 401 });
    }
  });

  it("🔴 token khách POST vào thao tác ghi của admin → 401, DB KHÔNG đổi", async () => {
    const res = await app.request(
      `/admin/tenants/${tenantB}/khoa`,
      { method: "POST", headers: bearer(tokenKhachA) },
      makeEnv(),
    );
    expect(res.status).toBe(401);
    const sau = await (await nhuAdmin(`/admin/tenants/${tenantB}`)).json();
    expect(sau).toMatchObject({ trang_thai: "active" });
  });

  it("đối chứng: CÙNG những đường đó, token ADMIN thì thấy cả hai tenant", async () => {
    // Không có ca đối chứng này, mọi test ở trên vẫn xanh khi route /admin/* hỏng hoàn
    // toàn — "không ai vào được" không phải điều ta muốn chứng minh.
    const s = await (await nhuAdmin("/admin/tenants")).text();
    expect(s).toContain("0100000001");
    expect(s).toContain("0100000002");
  });

  it("🔴 token admin KHÔNG dùng được ở miền khách (chiều ngược lại)", async () => {
    // Đối xứng của bất biến: quyền quản trị hệ thống KHÔNG tự động là quyền đọc dữ liệu
    // nghiệp vụ của một tenant. Token admin không mang tenant_id nên requireTenant từ chối.
    for (const p of ["/invoices", "/me", "/reconcile"]) {
      const res = await app.request(p, { headers: bearer(tokenAdmin) }, makeEnv());
      expect({ p, status: res.status }).toEqual({ p, status: 401 });
    }
  });

  it("🔴 super-admin KHÔNG đọc được hóa đơn của khách qua bất kỳ endpoint admin nào", async () => {
    // Ranh giới pháp lý cứng (chốt 2026-07-15). Kiểm ở tầng HTTP; tầng SQL đã kiểm riêng
    // trong superAdmin.test.ts ("không hàm admin_* nào chạm tới bảng hóa đơn").
    const ds = await (await nhuAdmin("/admin/tenants")).text();
    const chiTiet = await (await nhuAdmin(`/admin/tenants/${tenantA}`)).text();
    for (const s of [ds, chiTiet]) {
      expect(s).not.toContain("AAAAAA");
      expect(s).not.toContain("BBBBBB");
    }
  });
});

// U18 (migration 0011) — Test tích hợp PGlite cho con đường xuyên-tenant CÓ KIỂM SOÁT.
//
// Đây là migration nhạy cảm nhất dự án: nó cố ý tạo ra 8 hàm BYPASSRLS, tức 8 cái cửa đi
// vòng qua toàn bộ cách ly tenant. Test ở đây không kiểm "hàm chạy đúng không" là chính,
// mà kiểm **các cửa đó có đúng là cửa hẹp không**: ai sở hữu, ai gọi được, và chúng có với
// tới được dữ liệu nghiệp vụ của khách hay không.
//
// GIỚI HẠN ĐÃ BIẾT: PGlite chạy dưới superuser, nên KHÔNG kiểm chứng được việc *thi hành*
// quyền (superuser bỏ qua tất). Những gì test được ở đây là **sự kiện catalog** — owner,
// prosecdef, ACL, sự vắng mặt của policy — vốn đúng bất kể ai đang chạy. Phần thi hành
// thật dựa vào kiểm chứng tay trên Neon (nghi thức 0001 dòng 60-65). Đừng đọc bộ test này
// như bằng chứng "role app không đọc lén được bảng".
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "../../src/schema";
import { hoaDon, nguoiDung, tenants } from "../../src/schema";

const MIGRATIONS = new URL("../../migrations", import.meta.url).pathname;

type Db = ReturnType<typeof drizzle<typeof schema>>;

async function freshDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

// Chữ ký 8 hàm — CHÉP TAY từ migration, cố ý không import/suy ra từ đó. Nếu ai thêm hàm
// admin_* mới mà quên đưa vào vòng lặp nghi thức của 0011, test "không hàm admin_* nào
// nằm ngoài danh sách" bên dưới sẽ đỏ.
const HAM_ADMIN = [
  "admin_lookup(text)",
  "admin_ghi_dang_nhap_cuoi(uuid)",
  "admin_liet_ke_tenant(text,text,integer,integer)",
  "admin_chi_tiet_tenant(uuid)",
  "admin_doi_trang_thai_tenant(uuid,text,text)",
  "admin_sua_metadata_tenant(uuid,text,text,text)",
  "admin_dat_mat_khau_tam(uuid,text,timestamp with time zone)",
  "admin_doc_audit(integer,integer)",
] as const;

describe("0011 — bảng quan_tri_he_thong", () => {
  let db: Db;
  beforeEach(async () => {
    db = await freshDb();
  });

  it("tồn tại và KHÔNG có cột tenant_id (super-admin đứng ngoài trục tenant)", async () => {
    const r = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'quan_tri_he_thong'`);
    const cols = r.rows.map((x) => x.column_name);
    expect(cols).toEqual(
      expect.arrayContaining(["id", "email", "password_hash", "trang_thai", "dang_nhap_cuoi"]),
    );
    expect(cols).not.toContain("tenant_id");
  });

  it("RLS ENABLE + FORCE nhưng KHÔNG có policy nào — fail-closed", async () => {
    // Đây là toàn bộ cơ chế bảo vệ bảng ở tầng RLS: bật RLS mà rỗng policy nghĩa là mọi
    // role không-owner/không-BYPASSRLS đọc ra 0 hàng KỂ CẢ khi có GRANT SELECT. Nếu ai đó
    // sau này "sửa cho tiện" bằng cách thêm một policy USING(true), test này phải đỏ.
    const r = await db.execute(sql`
      SELECT c.relrowsecurity, c.relforcerowsecurity,
             (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS so_policy
      FROM pg_class c WHERE c.relname = 'quan_tri_he_thong'`);
    expect(r.rows[0]).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true });
    expect(Number(r.rows[0]?.so_policy)).toBe(0);
  });

  it("PUBLIC không có quyền nào trên bảng (đường vào duy nhất là hàm SECURITY DEFINER)", async () => {
    for (const quyen of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      const r = await db.execute(
        sql`SELECT has_table_privilege('public', 'quan_tri_he_thong', ${quyen}) AS co`,
      );
      expect({ quyen, co: r.rows[0]?.co }).toEqual({ quyen, co: false });
    }
  });

  it("email UNIQUE không phân biệt hoa/thường (cùng hợp đồng nguoi_dung sau 0010)", async () => {
    await db.execute(sql`
      INSERT INTO quan_tri_he_thong (email, password_hash) VALUES ('Chu@Vatengine.vn', 'h')`);
    await expect(
      db.execute(sql`
        INSERT INTO quan_tri_he_thong (email, password_hash) VALUES ('chu@vatengine.vn', 'h2')`),
    ).rejects.toThrow();
  });
});

describe("0011 — nghi thức ownership 8 hàm admin_*", () => {
  let db: Db;
  beforeEach(async () => {
    db = await freshDb();
  });

  it.each(HAM_ADMIN)("%s: owner=admin_api, SECURITY DEFINER, search_path ghim", async (sig) => {
    const r = await db.execute(sql`
      SELECT pg_get_userbyid(p.proowner) AS owner, p.prosecdef, p.proconfig
      FROM pg_proc p
      WHERE p.oid = ${`public.${sig}`}::regprocedure`);
    const row = r.rows[0];
    // owner=admin_api là điều làm hàm BYPASSRLS được (thuộc tính của ROLE, không của hàm).
    expect(row?.owner).toBe("admin_api");
    expect(row?.prosecdef).toBe(true);
    // SET search_path bắt buộc với SECURITY DEFINER: thiếu nó, kẻ gọi dựng được schema giả
    // đứng trước public và cướp quyền thực thi của owner BYPASSRLS.
    expect(String(row?.proconfig)).toContain("search_path=public");
  });

  it.each(HAM_ADMIN)("%s: PUBLIC KHÔNG gọi được", async (sig) => {
    // Postgres tự cấp EXECUTE cho PUBLIC mỗi lần CREATE FUNCTION. Sót một REVOKE là mở một
    // cửa BYPASSRLS cho bất kỳ ai kết nối được DB — đây là lý do 0011 áp nghi thức bằng
    // vòng lặp thay vì chép tay 8 lần.
    const r = await db.execute(
      sql`SELECT has_function_privilege('public', ${`public.${sig}`}, 'EXECUTE') AS co`,
    );
    expect(r.rows[0]?.co).toBe(false);
  });

  it("không có hàm admin_* nào nằm NGOÀI danh sách đã áp nghi thức", async () => {
    // Bắt ca "thêm hàm mới ở Bước 5 nhưng quên thêm vào mảng sigs ở Bước 6" — hàm đó sẽ
    // giữ owner mặc định và giữ nguyên EXECUTE của PUBLIC, tức một cửa mở im lặng.
    const r = await db.execute(sql`
      SELECT p.oid::regprocedure::text AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname LIKE 'admin\\_%'`);
    // `regprocedure::text` bỏ tiền tố schema khi `public` nằm trong search_path — so trên
    // tên trần, và bỏ khoảng trắng sau dấu phẩy để không phụ thuộc cách Postgres in ra.
    const chuanHoa = (s: string) => s.replace(/\s*,\s*/g, ",").replace(/^public\./, "");
    const thucTe = r.rows.map((x) => chuanHoa(String(x.sig))).sort();
    expect(thucTe).toEqual(HAM_ADMIN.map(chuanHoa).sort());
  });
});

describe("0011 — hành vi các cửa hẹp", () => {
  let db: Db;
  let tenantA: string;
  let tenantB: string;

  beforeEach(async () => {
    db = await freshDb();
    const [a] = await db
      .insert(tenants)
      .values({ ten: "Cty A", mst: "0100000001", trangThai: "cho_duyet" })
      .returning({ id: tenants.id });
    const [b] = await db
      .insert(tenants)
      .values({ ten: "Cty B", mst: "0100000002" })
      .returning({ id: tenants.id });
    tenantA = a?.id as string;
    tenantB = b?.id as string;
    await db
      .insert(nguoiDung)
      .values({ tenantId: tenantA, email: "chu.a@a.vn", vaiTro: "quan_tri" });
  });

  it("admin_liet_ke_tenant thấy XUYÊN tenant + total đúng + lọc trạng thái", async () => {
    const tatCa = await db.execute(sql`SELECT * FROM admin_liet_ke_tenant(NULL, NULL, 50, 0)`);
    expect(tatCa.rows).toHaveLength(2);
    expect(Number(tatCa.rows[0]?.total)).toBe(2);

    const loc = await db.execute(sql`SELECT * FROM admin_liet_ke_tenant('cho_duyet', NULL, 50, 0)`);
    expect(loc.rows).toHaveLength(1);
    expect(loc.rows[0]?.mst).toBe("0100000001");
  });

  it("admin_liet_ke_tenant: limit bị kẹp trần 200 (không cho quét cả bảng qua tham số)", async () => {
    const r = await db.execute(sql`
      SELECT count(*) AS n FROM admin_liet_ke_tenant(NULL, NULL, 999999, 0)`);
    // Chỉ có 2 tenant nên không đo được trần trực tiếp; đo rằng tham số vô lý không làm
    // hàm ném lỗi và vẫn trả kết quả hợp lệ (kẹp, không nổ).
    expect(Number(r.rows[0]?.n)).toBe(2);
  });

  it("admin_doi_trang_thai_tenant: chuyển ĐÚNG → 1 hàng; chuyển SAI → 0 hàng (409 ở route)", async () => {
    const ok = await db.execute(
      sql`SELECT * FROM admin_doi_trang_thai_tenant(${tenantA}::uuid, 'cho_duyet', 'active')`,
    );
    expect(ok.rows).toHaveLength(1);
    expect(ok.rows[0]?.trang_thai).toBe("active");

    // Lặp lại đúng lời gọi đó: giờ tenant đã 'active' nên `WHERE trang_thai = 'cho_duyet'`
    // không khớp → 0 hàng. Đây chính là chốt chặn TOCTOU: hai admin bấm Duyệt cùng lúc thì
    // người thứ hai nhận 409 chứ không ghi đè im lặng.
    const lai = await db.execute(
      sql`SELECT * FROM admin_doi_trang_thai_tenant(${tenantA}::uuid, 'cho_duyet', 'active')`,
    );
    expect(lai.rows).toHaveLength(0);
  });

  it("admin_sua_metadata_tenant KHÔNG đổi được mst (khoá tự nhiên) và giữ cột NULL nguyên vẹn", async () => {
    await db.execute(
      sql`SELECT * FROM admin_sua_metadata_tenant(${tenantB}::uuid, 'Tên Mới', NULL, NULL)`,
    );
    const r = await db.execute(
      sql`SELECT ten, mst, goi_dich_vu FROM tenants WHERE id = ${tenantB}::uuid`,
    );
    expect(r.rows[0]).toMatchObject({ ten: "Tên Mới", mst: "0100000002", goi_dich_vu: "free" });
  });

  it("admin_dat_mat_khau_tam đặt hash + cờ buộc đổi + hạn, trả email tài khoản chính", async () => {
    const hetHan = new Date(Date.now() + 72 * 3600_000).toISOString();
    const r = await db.execute(
      sql`SELECT * FROM admin_dat_mat_khau_tam(${tenantA}::uuid, 'hash-gia', ${hetHan}::timestamptz)`,
    );
    expect(r.rows[0]?.email).toBe("chu.a@a.vn");

    const u = await db.execute(sql`
      SELECT password_hash, phai_doi_mat_khau, mat_khau_tam_het_han
      FROM nguoi_dung WHERE tenant_id = ${tenantA}::uuid`);
    expect(u.rows[0]).toMatchObject({ password_hash: "hash-gia", phai_doi_mat_khau: true });
    expect(u.rows[0]?.mat_khau_tam_het_han).not.toBeNull();
  });

  it("🔴 RANH GIỚI PHÁP LÝ — không hàm admin_* nào chạm tới bảng hóa đơn", async () => {
    // Ranh giới "chủ phần mềm KHÔNG đọc dữ liệu nghiệp vụ của khách" (chốt 2026-07-15)
    // được thực thi bằng việc các cửa KHÔNG CÓ ĐƯỜNG TỚI hoa_don, chứ không phải bằng
    // việc route lịch sự không hỏi. Kiểm ở tầng cấu trúc: thân hàm không nhắc tới bảng
    // hóa đơn/dòng hàng ⇒ một route viết ẩu sau này cũng không moi ra được qua cửa này.
    const r = await db.execute(sql`
      SELECT p.proname, p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname LIKE 'admin\\_%'`);
    for (const row of r.rows) {
      expect({ ham: row.proname, chamHoaDon: /\bhoa_don\b|\bdong_hang_hoa\b/.test(String(row.prosrc)) })
        .toEqual({ ham: row.proname, chamHoaDon: false });
    }
  });

  it("🔴 admin_chi_tiet_tenant trả metadata nhưng KHÔNG rò token thuế thô", async () => {
    await db.insert(hoaDon).values({
      tenantId: tenantA,
      nbmst: "0100000001",
      nbten: "Cty Bán",
      nmmst: "0100000002",
      nmten: "Cty Mua",
      khmshdon: "1",
      khhdon: "C26TAA",
      shdon: "1",
      tdlap: new Date("2026-04-12T09:00:00Z"),
      tgtcthue: "1000000",
      tgtthue: "80000",
      tgtttbso: "1080000",
      ttxly: 8,
      tthai: 1,
      chieu: "purchase",
      nguon: "normal",
      rawJson: {},
    });
    await db.execute(sql`
      INSERT INTO tai_khoan_thue (tenant_id, username, token_hien_tai, token_het_han)
      VALUES (${tenantA}::uuid, '0100000001', 'TOKEN-THO-KHONG-DUOC-RO', now() + interval '1 day')`);

    const r = await db.execute(sql`SELECT * FROM admin_chi_tiet_tenant(${tenantA}::uuid)`);
    const toanBo = JSON.stringify(r.rows[0]);
    expect(toanBo).toContain("chu.a@a.vn"); // metadata thì có
    expect(toanBo).toContain("token_het_han"); // trạng thái hạn token thì có
    expect(toanBo).not.toContain("TOKEN-THO-KHONG-DUOC-RO"); // token thô thì KHÔNG
    expect(toanBo).not.toContain("C26TAA"); // và không có mảnh hóa đơn nào
  });
});

describe("0011 — cột mật khẩu tạm trên nguoi_dung", () => {
  it("phai_doi_mat_khau NOT NULL DEFAULT false + mat_khau_tam_het_han nullable", async () => {
    const db = await freshDb();
    const r = await db.execute(sql`
      SELECT column_name, is_nullable, column_default FROM information_schema.columns
      WHERE table_name = 'nguoi_dung'
        AND column_name IN ('phai_doi_mat_khau', 'mat_khau_tam_het_han')
      ORDER BY column_name`);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ column_name: "mat_khau_tam_het_han", is_nullable: "YES" });
    expect(r.rows[1]).toMatchObject({
      column_name: "phai_doi_mat_khau",
      is_nullable: "NO",
      column_default: "false",
    });
  });
});

// U17a — Bảng gói dịch vụ TOÀN CỤC (không tenant_id). Đây là bảng ĐẦU TIÊN của dự án
// không có trục tenant, nên phải kiểm hành vi RLS/quyền THẬT chứ không tin khai báo:
// drizzle KHÔNG phát ENABLE RLS cho bảng không khai báo policy (bằng chứng 0000 chỉ bật
// cho 7 bảng có tenantIsolationPolicy), và bảng mới KHÔNG thừa hưởng GRANT cũ
// (app-role.sql:28 là GRANT ON ALL TABLES chạy một lần; ALTER DEFAULT PRIVILEGES = 0).
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "../../src/schema";

const MIGRATIONS = fileURLToPath(new URL("../../migrations", import.meta.url));

type Db = ReturnType<typeof drizzle<typeof schema>>;

async function freshDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

describe("U17a — goi_dich_vu (integration, PGlite)", () => {
  let db: Db;
  beforeEach(async () => {
    db = await freshDb();
  });

  it("seed 'free' tồn tại với hạn mức 01 MST và không cho tài khoản con", async () => {
    const res = (await db.execute(
      sql`select ma, ten, so_mst_toi_da, cho_tai_khoan_con from goi_dich_vu where ma = 'free'`,
    )) as { rows: Array<Record<string, unknown>> };
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]).toMatchObject({
      ma: "free",
      so_mst_toi_da: 1,
      cho_tai_khoan_con: false,
    });
    // Nhãn tiếng Việt phải có — FE hiển thị nhãn này thay cột thô (QĐ-7).
    expect(String(res.rows[0]?.ten ?? "")).not.toBe("");
  });

  it("seed 'free' có đủ 3 ngưỡng rate-limit hạng A (QĐ-5)", async () => {
    const res = (await db.execute(
      sql`select gh_invoices_moi_phut, gh_exports_moi_phut, gh_reconcile_moi_phut
          from goi_dich_vu where ma = 'free'`,
    )) as { rows: Array<Record<string, unknown>> };
    expect(res.rows[0]).toMatchObject({
      gh_invoices_moi_phut: 120,
      gh_exports_moi_phut: 20,
      gh_reconcile_moi_phut: 20,
    });
  });

  it("RLS đã BẬT và FORCE (không để bảng toàn cục thành ngoại lệ đầu tiên)", async () => {
    const res = (await db.execute(
      sql`select relrowsecurity, relforcerowsecurity from pg_class where relname = 'goi_dich_vu'`,
    )) as { rows: Array<{ relrowsecurity: boolean; relforcerowsecurity: boolean }> };
    expect(res.rows[0]?.relrowsecurity).toBe(true);
    expect(res.rows[0]?.relforcerowsecurity).toBe(true);
  });

  it("role app KHÔNG-superuser: ĐỌC được (bắt lỗi quên GRANT — nếu quên, lỗi chỉ lộ sau deploy)", async () => {
    await db.execute(sql`create role app_user nosuperuser`);
    await db.execute(sql`grant usage on schema public to app_user`);
    await db.execute(sql`set role app_user`);
    const res = (await db.execute(sql`select ma from goi_dich_vu where ma = 'free'`)) as {
      rows: Array<{ ma: string }>;
    };
    expect(res.rows[0]?.ma).toBe("free");
    await db.execute(sql`reset role`);
  });

  it("KHÔNG có policy ghi nào trên goi_dich_vu (gác đúng tầng RLS, không phải tầng GRANT)", async () => {
    const res = (await db.execute(
      sql`select cmd from pg_policies where tablename = 'goi_dich_vu'`,
    )) as { rows: Array<{ cmd: string }> };
    expect(res.rows.map((r) => r.cmd)).toEqual(["SELECT"]);
  });

  it("role app KHÔNG-superuser CÓ đủ quyền GRANT ghi: RLS vẫn chặn (đường ghi thật là U18)", async () => {
    await db.execute(sql`create role app_user nosuperuser`);
    await db.execute(sql`grant usage on schema public to app_user`);
    // Cấp ĐỦ quyền ghi (giống production, xem app-role.sql:28) để chắc chắn lỗi phía dưới
    // đến từ tầng RLS, không phải bị chặn sớm hơn ở tầng GRANT.
    await db.execute(sql`grant select, insert, update, delete on goi_dich_vu to app_user`);
    await db.execute(sql`set role app_user`);

    // INSERT: RLS chặn bằng NÉM LỖI (đo được — không suy đoán).
    await expect(
      db.execute(sql`insert into goi_dich_vu (ma, ten, so_mst_toi_da) values ('hack', 'x', 999)`),
    ).rejects.toThrow();

    // UPDATE dưới RLS: ĐO ĐƯỢC là KHÔNG ném lỗi — chỉ ảnh hưởng 0 hàng (không có policy
    // nào cho app_user nhìn thấy hàng để sửa). Không được viết rejects.toThrow() ở đây.
    await expect(
      db.execute(sql`update goi_dich_vu set so_mst_toi_da = 999 where ma = 'free'`),
    ).resolves.not.toThrow();

    await db.execute(sql`reset role`);

    // Xác nhận dữ liệu THẬT SỰ không đổi (UPDATE "chạy" nhưng vô hại).
    const after = (await db.execute(
      sql`select so_mst_toi_da from goi_dich_vu where ma = 'free'`,
    )) as { rows: Array<{ so_mst_toi_da: number }> };
    expect(after.rows[0]?.so_mst_toi_da).toBe(1);
  });
});

describe("U17a — cau_hinh_he_thong (integration, PGlite)", () => {
  let db: Db;
  beforeEach(async () => {
    db = await freshDb();
  });

  it("seed ngưỡng đăng ký/IP = 5 (hạng B, QĐ-5), lưu dạng text", async () => {
    const res = (await db.execute(
      sql`select gia_tri from cau_hinh_he_thong where khoa = 'dangky_max_moi_ip_gio'`,
    )) as { rows: Array<{ gia_tri: string }> };
    // text CÓ CHỦ Ý: mọi resolveXxxConfig hiện nhận Record<string, string|undefined>,
    // giữ text cho phép tái dùng NGUYÊN các hàm thuần đã test, chỉ đổi nguồn nạp.
    expect(res.rows[0]?.gia_tri).toBe("5");
  });

  it("RLS bật + FORCE", async () => {
    const rls = (await db.execute(
      sql`select relrowsecurity, relforcerowsecurity from pg_class where relname = 'cau_hinh_he_thong'`,
    )) as { rows: Array<{ relrowsecurity: boolean; relforcerowsecurity: boolean }> };
    expect(rls.rows[0]?.relrowsecurity).toBe(true);
    expect(rls.rows[0]?.relforcerowsecurity).toBe(true);
  });

  it("KHÔNG có policy ghi nào (gác đúng tầng RLS, không phải tầng GRANT)", async () => {
    // Khẳng định TRỰC TIẾP trên catalog. Suy ra từ "lệnh ghi ném lỗi" là gác nhầm tầng:
    // Postgres kiểm quyền GRANT TRƯỚC RLS, nên một role thiếu GRANT sẽ ném lỗi kể cả khi
    // policy mở toang đường ghi ⇒ test kiểu đó LUÔN XANH. (Đã kiểm chứng bằng mutation
    // test ở Task 2: tiêm policy FOR ALL USING(true) mà test cũ vẫn xanh.)
    const res = (await db.execute(
      sql`select cmd from pg_policies where tablename = 'cau_hinh_he_thong'`,
    )) as { rows: Array<{ cmd: string }> };
    expect(res.rows.map((r) => r.cmd)).toEqual(["SELECT"]);
  });

  it("role app CÓ ĐỦ QUYỀN GHI vẫn bị RLS chặn (cấu hình giống production)", async () => {
    await db.execute(sql`create role app_user nosuperuser`);
    await db.execute(sql`grant usage on schema public to app_user`);
    // Cấp ĐỦ quyền ghi — đây mới là cấu hình production thật: app-role.sql:28 chạy
    // `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES`. Không cấp thì test gác nhầm tầng.
    await db.execute(sql`grant select, insert, update, delete on cau_hinh_he_thong to app_user`);
    await db.execute(sql`set role app_user`);

    const doc = (await db.execute(
      sql`select khoa from cau_hinh_he_thong where khoa = 'dangky_max_moi_ip_gio'`,
    )) as { rows: Array<{ khoa: string }> };
    expect(doc.rows).toHaveLength(1);

    // INSERT ném lỗi RLS ("new row violates row-level security policy").
    await expect(
      db.execute(sql`insert into cau_hinh_he_thong (khoa, gia_tri) values ('hack', '1')`),
    ).rejects.toThrow();

    // ⚠️ UPDATE/DELETE dưới RLS KHÔNG ném lỗi — chỉ ảnh hưởng 0 hàng (đo được ở Task 2).
    // Vì vậy phải khẳng định DỮ LIỆU KHÔNG ĐỔI, không được dùng rejects.toThrow().
    await expect(
      db.execute(
        sql`update cau_hinh_he_thong set gia_tri = '9999' where khoa = 'dangky_max_moi_ip_gio'`,
      ),
    ).resolves.not.toThrow();
    await db.execute(sql`reset role`);

    const sau = (await db.execute(
      sql`select gia_tri from cau_hinh_he_thong where khoa = 'dangky_max_moi_ip_gio'`,
    )) as { rows: Array<{ gia_tri: string }> };
    expect(sau.rows[0]?.gia_tri).toBe("5");
  });
});

describe("U17a — audit_log_admin (integration, PGlite)", () => {
  let db: Db;
  beforeEach(async () => {
    db = await freshDb();
  });

  it("ghi được nhật ký toàn cục KHÔNG cần tenant_id (gỡ hard stop QĐ-6)", async () => {
    // audit_log của khách có tenant_id NOT NULL + FK cascade + RLS for:all + trigger
    // append-only ⇒ thay đổi cấu hình TOÀN CỤC không có chỗ ghi hợp lệ. Bảng này là chỗ đó.
    await db.execute(
      sql`insert into audit_log_admin (hanh_dong, doi_tuong, nguoi_thuc_hien, chi_tiet)
          values ('doi_nguong', 'goi_dich_vu:free', 'admin@vd.vn',
                  '{"truoc": 120, "sau": 200}'::jsonb)`,
    );
    const res = (await db.execute(
      sql`select hanh_dong, nguoi_thuc_hien, chi_tiet from audit_log_admin`,
    )) as { rows: Array<Record<string, unknown>> };
    expect(res.rows).toHaveLength(1);
    // Ghi CŨ → MỚI, không chỉ tên trường như tiền lệ me.ts:89 — thiếu giá trị cũ thì
    // audit vô dụng khi điều tra sự cố (QĐ-6).
    expect(res.rows[0]?.chi_tiet).toMatchObject({ truoc: 120, sau: 200 });
  });

  it("append-only: UPDATE và DELETE bị trigger chặn kể cả owner", async () => {
    await db.execute(
      sql`insert into audit_log_admin (hanh_dong, nguoi_thuc_hien) values ('x', 'admin@vd.vn')`,
    );
    await expect(db.execute(sql`update audit_log_admin set hanh_dong = 'y'`)).rejects.toThrow();
    await expect(db.execute(sql`delete from audit_log_admin`)).rejects.toThrow();
  });

  it("append-only: TRUNCATE cũng bị chặn (trigger statement-level)", async () => {
    await expect(db.execute(sql`truncate audit_log_admin`)).rejects.toThrow();
  });

  it("role app CÓ đủ GRANT SELECT vẫn đọc ra 0 hàng (RLS gác, không phải GRANT gác)", async () => {
    // Ghi một hàng bằng owner (superuser bypass RLS) trước để có dữ liệu thật mà đọc.
    await db.execute(
      sql`insert into audit_log_admin (hanh_dong, nguoi_thuc_hien) values ('x', 'admin@vd.vn')`,
    );

    await db.execute(sql`create role app_user nosuperuser`);
    await db.execute(sql`grant usage on schema public to app_user`);
    // Cấp ĐỦ quyền SELECT — nếu chỉ cấp USAGE schema rồi khẳng định lỗi thì test LUÔN
    // XANH vì Postgres kiểm GRANT trước RLS (đây chính là bẫy review đã chỉ ra).
    await db.execute(sql`grant select on audit_log_admin to app_user`);
    await db.execute(sql`set role app_user`);

    const res = (await db.execute(sql`select id from audit_log_admin`)) as {
      rows: Array<{ id: string }>;
    };
    expect(res.rows).toHaveLength(0);

    await db.execute(sql`reset role`);
  });

  it("role app vẫn INSERT được (đường ghi cho U18 còn nguyên sau khi bật RLS)", async () => {
    await db.execute(sql`create role app_user nosuperuser`);
    await db.execute(sql`grant usage on schema public to app_user`);
    await db.execute(sql`grant insert on audit_log_admin to app_user`);
    await db.execute(sql`set role app_user`);

    await expect(
      db.execute(
        sql`insert into audit_log_admin (hanh_dong, nguoi_thuc_hien) values ('doi_nguong', 'admin@vd.vn')`,
      ),
    ).resolves.not.toThrow();

    await db.execute(sql`reset role`);

    // Xác nhận bằng owner (app_user không đọc lại được — đã kiểm ở test trên).
    const res = (await db.execute(
      sql`select hanh_dong from audit_log_admin where hanh_dong = 'doi_nguong'`,
    )) as { rows: Array<{ hanh_dong: string }> };
    expect(res.rows).toHaveLength(1);
  });
});

describe("U17a — backfill tenants.goi_dich_vu (QĐ-7)", () => {
  it("KHẲNG ĐỊNH migration 0007 thật sự backfill hàng cũ, không âm thầm 0 hàng", async () => {
    // CẠM BẪY: tenants bật FORCE RLS (0000:128) với policy id = current_setting
    // ('app.tenant_id'). Lúc migrate, GUC đó KHÔNG được đặt → id = NULL → 0 hàng khớp →
    // UPDATE không đổi gì mà KHÔNG báo lỗi. Nó chỉ chạy được nhờ role migrate tình cờ có
    // BYPASSRLS (Neon neondb_owner) hoặc superuser (PGlite) — giả định phụ thuộc môi
    // trường. Test này tồn tại để nó không lọt im lặng.
    //
    // PHẢI áp từng migration THEO THỨ TỰ: 0000→0006, chèn tenant mang NHÃN cũ, RỒI mới áp
    // 0007. Gọi migrate() một lần (áp cả 0007) rồi chạy lại câu UPDATE bằng tay sẽ chứng
    // minh SAI THỨ: nó chỉ cho thấy "một câu tương đương chạy được", không cho thấy câu
    // TRONG 0007 đã đổi hàng thật.
    const client = new PGlite();
    const db = drizzle(client, { schema });

    const thuMuc = MIGRATIONS;
    const cacFile = (await readdir(thuMuc)).filter((f) => f.endsWith(".sql")).sort(); // 0000_… → 0007_… theo thứ tự tên file

    async function apFile(ten: string): Promise<void> {
      const noiDung = await readFile(join(thuMuc, ten), "utf8");
      // drizzle phân tách câu bằng dấu mốc này; áp từng câu để giữ đúng thứ tự.
      for (const cau of noiDung.split("--> statement-breakpoint")) {
        const s = cau.trim();
        if (s) await db.execute(sql.raw(s));
      }
    }

    // Lọc theo VỊ TRÍ trong danh sách đã sắp xếp, KHÔNG lọc theo tên: filter((f) =>
    // !f.startsWith("0007")) từng để lọt một lỗi âm thầm — mọi file 0008 trở đi cũng
    // không startsWith("0007") nên sẽ rơi vào "trước 0007" và bị áp SAI THỨ TỰ (trước cả
    // 0007) ngay khi ai đó thêm migration kế tiếp. Dùng chỉ số để chỉ lấy đúng các file
    // ĐỨNG TRƯỚC 0007 trong mảng đã .sort().
    const idx0007 = cacFile.findIndex((f) => f.startsWith("0007"));
    if (idx0007 === -1) throw new Error("không tìm thấy migration 0007");
    const truoc0007 = cacFile.slice(0, idx0007);
    const file0007 = cacFile[idx0007] as string;

    for (const f of truoc0007) await apFile(f);

    // Dữ liệu CŨ đúng như production: cột giữ NHÃN, chưa có bảng gói nên chưa có FK.
    await db.execute(
      sql`insert into tenants (ten, mst, goi_dich_vu) values ('Cty Cũ', '0100000099', 'Miễn phí')`,
    );

    // DỮ LIỆU THẬT trên production 2026-07-19: nhãn 'Enterprise ' CÓ DẤU CÁCH THỪA.
    // Đây là ca nguy hiểm nhất — `NOT IN` so khớp CHÍNH XÁC nên nếu 0007 chỉ thêm hàng seed
    // 'enterprise' mà thiếu câu ánh xạ btrim/lower, tenant này bị ép về 'free' ⇒ tụt còn 1
    // tài khoản thuế + tắt tài khoản con, nhãn gốc mất (chỉ PITR cứu được).
    await db.execute(
      sql`insert into tenants (ten, mst, goi_dich_vu)
          values ('Cty Enterprise', '0100000088', 'Enterprise ')`,
    );

    // Áp 0007 — chính nó phải backfill.
    await apFile(file0007);

    // Không còn hàng nào mang nhãn cũ, và hàng đó nay trỏ đúng mã 'free'.
    const conNhan = (await db.execute(
      sql`select count(*)::int as n from tenants where goi_dich_vu = 'Miễn phí'`,
    )) as { rows: Array<{ n: number }> };
    expect(conNhan.rows[0]?.n).toBe(0);

    const hang = (await db.execute(
      sql`select goi_dich_vu from tenants where mst = '0100000099'`,
    )) as { rows: Array<{ goi_dich_vu: string }> };
    expect(hang.rows[0]?.goi_dich_vu).toBe("free");

    // KHẲNG ĐỊNH QUAN TRỌNG NHẤT: tenant mang nhãn 'Enterprise ' (dấu cách thừa) phải được
    // ÁNH XẠ sang mã 'enterprise', TUYỆT ĐỐI KHÔNG bị ép về 'free'. Nếu ai đó gỡ câu
    // btrim/lower khỏi 0007, test này đỏ ngay — đó là lý do nó tồn tại.
    const ent = (await db.execute(
      sql`select goi_dich_vu from tenants where mst = '0100000088'`,
    )) as { rows: Array<{ goi_dich_vu: string }> };
    expect(ent.rows[0]?.goi_dich_vu).toBe("enterprise");

    // Và gói đó phải giữ được quyền lợi cao hơn free — nếu không thì việc ánh xạ vô nghĩa.
    const ql = (await db.execute(
      sql`select so_mst_toi_da, cho_tai_khoan_con from goi_dich_vu where ma = 'enterprise'`,
    )) as { rows: Array<{ so_mst_toi_da: number; cho_tai_khoan_con: boolean }> };
    expect(ql.rows[0]?.so_mst_toi_da).toBeGreaterThan(1);
    expect(ql.rows[0]?.cho_tai_khoan_con).toBe(true);

    // Bất biến tổng: không tenant nào trỏ tới gói không tồn tại (chính là lệnh kiểm tay
    // bắt buộc sau `make migrate` trên production).
    const mocoi = (await db.execute(
      sql`select count(*)::int as n from tenants
          where goi_dich_vu not in (select ma from goi_dich_vu)`,
    )) as { rows: Array<{ n: number }> };
    expect(mocoi.rows[0]?.n).toBe(0);
  });

  it("FK chặn gán gói không tồn tại", async () => {
    const db = await freshDb();
    await expect(
      db.execute(
        sql`insert into tenants (ten, mst, goi_dich_vu) values ('Cty B', '0100000098', 'khong_co')`,
      ),
    ).rejects.toThrow();
  });

  it("tenant tạo mới không khai gói → mặc định 'free'", async () => {
    const db = await freshDb();
    await db.execute(sql`insert into tenants (ten, mst) values ('Cty C', '0100000097')`);
    const res = (await db.execute(
      sql`select goi_dich_vu from tenants where mst = '0100000097'`,
    )) as { rows: Array<{ goi_dich_vu: string }> };
    expect(res.rows[0]?.goi_dich_vu).toBe("free");
  });
});

// Migration 0018 — vá sự cố 2026-07-28 (docs/plans/HANDOFF-phien-2026-07-28-grant-thieu.md):
// migration 0008 (dong_bo_that_bai) và 0017 (bo_dem_phien_ban, lich_su_thay_doi_hoa_don) tạo
// bảng mà quên GRANT cho vat_app — production báo `permission denied` thật, 39 phiên đồng bộ
// failed/24h + sổ dead-letter câm 8 ngày. Test này kiểm ĐÚNG lớp lỗi từng lọt lưới: các test
// khác trong repo tự GRANT rộng `ON ALL TABLES` cho role kiểm thử (`app_user`) ở bước setup,
// nên KHÔNG BAO GIỜ chạm vào việc migration tự thân có GRANT hay không — đó chính là lý do
// vá lần đầu (0008) không bị bắt suốt 8 ngày. Ở đây role tên đúng NHƯ PRODUCTION ('vat_app')
// và KHÔNG được cấp gì thêm ngoài những gì bản thân các migration đã chạy tự cấp.
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";
import * as schema from "../../src/schema";

const MIGRATIONS = new URL("../../migrations", import.meta.url).pathname;

type Db = ReturnType<typeof drizzle<typeof schema>>;

const BANG_VA = ["bo_dem_phien_ban", "lich_su_thay_doi_hoa_don", "dong_bo_that_bai"] as const;

describe("0018 — GRANT vat_app trên 3 bảng thiếu quyền", () => {
  it("role tên ĐÚNG 'vat_app' (khớp production) được SELECT/INSERT/UPDATE trên cả 3 bảng — CHỈ từ chạy migration, không cấp thêm tay", async () => {
    const db = drizzle(new PGlite(), { schema });
    // Role phải tồn tại TRƯỚC khi migrate chạy: nhánh `IF EXISTS (SELECT FROM pg_roles
    // WHERE rolname = 'vat_app')` trong 0018 kiểm tra tại THỜI ĐIỂM migration thực thi, không
    // phải tại thời điểm test assert — tạo role sau migrate sẽ luôn rơi vào nhánh ELSE.
    await db.execute(sql`create role vat_app nosuperuser login`);
    await db.execute(sql`grant usage on schema public to vat_app`);
    await migrate(db, { migrationsFolder: MIGRATIONS });
    // KHÔNG grant gì thêm sau migrate: nếu qua được assertion dưới là nhờ chính 0018.

    for (const bang of BANG_VA) {
      for (const quyen of ["SELECT", "INSERT", "UPDATE"]) {
        const r = await db.execute(
          sql`SELECT has_table_privilege('vat_app', ${bang}, ${quyen}) AS co`,
        );
        expect({ bang, quyen, co: r.rows[0]?.co }).toEqual({ bang, quyen, co: true });
      }
    }
  });

  it("role 'vat_app' KHÔNG được cấp DELETE trên cả 3 bảng — least-privilege khớp đúng vá thật, không nới thêm", async () => {
    const db = drizzle(new PGlite(), { schema });
    await db.execute(sql`create role vat_app nosuperuser login`);
    await db.execute(sql`grant usage on schema public to vat_app`);
    await migrate(db, { migrationsFolder: MIGRATIONS });

    for (const bang of BANG_VA) {
      const r = await db.execute(
        sql`SELECT has_table_privilege('vat_app', ${bang}, 'DELETE') AS co`,
      );
      expect({ bang, co: r.rows[0]?.co }).toEqual({ bang, co: false });
    }
  });

  it("môi trường KHÔNG có role 'vat_app' (vd CI/dev PGlite mặc định) — migrate không throw, chỉ RAISE WARNING", async () => {
    const db = drizzle(new PGlite(), { schema });
    // Không tạo role vat_app nào ở đây — đúng trạng thái PGlite mặc định của MỌI test khác
    // trong repo. Khẳng định quan trọng nhất: nhánh ELSE của 0018 không chặn migrate.
    await expect(migrate(db, { migrationsFolder: MIGRATIONS })).resolves.not.toThrow();
  });
});

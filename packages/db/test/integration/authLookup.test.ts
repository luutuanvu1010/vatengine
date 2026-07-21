// U17b (Task 3) — Test tích hợp (PGlite): auth_lookup_user() trả thêm cột
// tenant_trang_thai để Task 4 chặn login của tenant chưa duyệt. Theo mẫu
// (U8-14) trong constraints.test.ts — không tự bịa cách dựng DB mới.
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tenants } from "../../src/schema";
import * as schema from "../../src/schema";

const MIGRATIONS = fileURLToPath(new URL("../../migrations", import.meta.url));

type Db = ReturnType<typeof drizzle<typeof schema>>;

async function freshDb(): Promise<Db> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

type JournalEntry = {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
};
type Journal = { version: string; dialect: string; entries: JournalEntry[] };

/**
 * Dựng một thư mục migrations TẠM chỉ chứa các entry journal TRƯỚC `tag` cho trước, bằng
 * cách sao chép NGUYÊN VĂN journal thật + các file .sql thật (không tự chế nội dung nào).
 *
 * VÌ SAO CẦN: Correction 2 đòi một test chứng minh grant EXECUTE cho `vat_app` đến từ
 * CHÍNH migration 0009 (DO-guard `IF EXISTS pg_roles`), không phải từ setup test. Guard
 * đó chỉ kích hoạt nếu role `vat_app` đã tồn tại TẠI THỜI ĐIỂM 0009 chạy — nên phải tách
 * migrate() làm hai pha: pha 1 dừng lại NGAY TRƯỚC 0009 (thư mục tạm này), tạo role ở
 * giữa, rồi pha 2 áp tiếp bằng `migrate()` trỏ THẲNG vào thư mục migrations THẬT.
 *
 * Đây KHÔNG phải chạy tay từng câu SQL: drizzle migrate() so `created_at` đã ghi trong
 * bảng theo dõi nội bộ với `when` của từng entry journal — pha 2 tự nhận ra 0000..0007 đã
 * áp (bỏ qua) và chỉ chạy 0009, đúng con đường migrate() thật mà production dùng khi thêm
 * một migration mới vào một DB đã có sẵn dữ liệu.
 */
function migrationsFolderBefore(tag: string): string {
  const journal = JSON.parse(
    readFileSync(join(MIGRATIONS, "meta/_journal.json"), "utf8"),
  ) as Journal;
  const cut = journal.entries.findIndex((e) => e.tag === tag);
  if (cut === -1) throw new Error(`không tìm thấy tag ${tag} trong journal thật`);
  const entries = journal.entries.slice(0, cut);
  const dir = mkdtempSync(join(tmpdir(), "vat-db-migrations-before-"));
  mkdirSync(join(dir, "meta"), { recursive: true });
  writeFileSync(join(dir, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
  for (const e of entries) {
    copyFileSync(join(MIGRATIONS, `${e.tag}.sql`), join(dir, `${e.tag}.sql`));
  }
  return dir;
}

async function makeTenant(db: Db, ten: string, mst: string, trangThai: string): Promise<string> {
  const rows = await db.insert(tenants).values({ ten, mst, trangThai }).returning();
  const row = rows[0];
  if (!row) throw new Error("insert tenant không trả về hàng");
  return row.id;
}

describe("U17b (Task 3) — auth_lookup_user() trả thêm tenant_trang_thai", () => {
  let db: Db;
  beforeEach(async () => {
    db = await freshDb();
  });

  it("trả đủ 5 cột, tenant_trang_thai khớp tenants.trang_thai của tenant active", async () => {
    const t = await makeTenant(db, "Cty A", "0100000001", "active");
    await db.execute(
      sql`insert into nguoi_dung (tenant_id, email, password_hash, vai_tro)
          values (${t}, 'chu@a.vn', 'hash-A', 'quan_tri')`,
    );

    const res = await db.execute(
      sql`select id, tenant_id, vai_tro, password_hash, tenant_trang_thai
          from auth_lookup_user('chu@a.vn')`,
    );
    expect(res.rows.length).toBe(1);
    const row = res.rows[0] as {
      id: string;
      tenant_id: string;
      vai_tro: string;
      password_hash: string;
      tenant_trang_thai: string;
    };
    expect(Object.keys(row).sort()).toEqual(
      ["id", "password_hash", "tenant_id", "tenant_trang_thai", "vai_tro"].sort(),
    );
    expect(row.tenant_id).toBe(t);
    expect(row.vai_tro).toBe("quan_tri");
    expect(row.password_hash).toBe("hash-A");
    expect(row.tenant_trang_thai).toBe("active");
  });

  it("tenant ở trạng thái cho_duyet → tenant_trang_thai trả đúng 'cho_duyet'", async () => {
    const t = await makeTenant(db, "Cty B", "0100000002", "cho_duyet");
    await db.execute(
      sql`insert into nguoi_dung (tenant_id, email, password_hash, vai_tro)
          values (${t}, 'chu@b.vn', 'hash-B', 'quan_tri')`,
    );

    const res = await db.execute(sql`select tenant_trang_thai from auth_lookup_user('chu@b.vn')`);
    expect(res.rows.length).toBe(1);
    const row = res.rows[0] as { tenant_trang_thai: string };
    expect(row.tenant_trang_thai).toBe("cho_duyet");
  });
});

// U17b (Task 3, Correction 2) — DROP FUNCTION xoá SẠCH grant EXECUTE cũ trên hàm, kể cả
// grant cho `vat_app` (role Hyperdrive production, cấp NGOÀI migration ở
// packages/db/provisioning/app-role.sql). Nếu 0009 quên tự cấp lại, MỌI login production
// hỏng — nhưng constraints.test.ts (U8-14) sẽ KHÔNG bắt được lỗi này vì nó tự
// `grant execute ... to app_user2` trong lúc setup, che mất việc migration có cấp hay
// không. Test dưới đây KHÔNG tự cấp EXECUTE cho vat_app ở bất kỳ đâu — nếu gọi được hàm,
// quyền đó chỉ có thể đến từ chính DO-guard ở Bước 6 của 0009.
describe("U17b (Task 3, Correction 2) — migration 0009 tự khôi phục EXECUTE cho vat_app", () => {
  let tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
    tmpDirs = [];
  });

  it("role vat_app tồn tại TRƯỚC khi 0009 chạy → gọi được auth_lookup_user() sau migrate, dù test không cấp EXECUTE", async () => {
    const client = new PGlite();
    const db = drizzle(client, { schema });

    // Pha 1: áp mọi migration TRƯỚC 0009 — mô phỏng đúng trạng thái DB production ngay
    // trước khi migration này chạy lần đầu.
    const before = migrationsFolderBefore("0009_auth_lookup_trang_thai");
    tmpDirs.push(before);
    await migrate(db, { migrationsFolder: before });

    // Tạo role vat_app giống hệt app-role.sql bước 1 (NOSUPERUSER NOBYPASSRLS, không sở
    // hữu bảng). KHÔNG có GRANT EXECUTE nào ở đây — đó chính là điểm mù Correction 2 nêu:
    // nếu test tự cấp, test vẫn xanh cả khi migration quên khôi phục quyền. Role phải tồn
    // tại TRƯỚC khi 0009 chạy để DO-guard `IF EXISTS (SELECT FROM pg_roles ...)` thấy và
    // cấp — đúng cơ chế guard trong 0009, không phải giả lập tay.
    await db.execute(
      sql`create role vat_app login password 'x' nosuperuser nobypassrls nocreatedb nocreaterole`,
    );
    await db.execute(sql`grant usage on schema public to vat_app`);

    // Pha 2: áp phần CÒN LẠI (đúng một migration: 0009) qua migrate() trỏ vào thư mục
    // migrations THẬT của repo — con đường sản xuất thật, không phải chạy tay SQL.
    await migrate(db, { migrationsFolder: MIGRATIONS });

    await db.execute(sql`set role vat_app`);
    // Gọi được (không ném permission denied) — email không tồn tại nên rỗng, đúng nghĩa.
    const res = await db.execute(
      sql`select id from auth_lookup_user('khong-ton-tai@vat-app-test.vn')`,
    );
    expect(res.rows.length).toBe(0);
    await db.execute(sql`reset role`);
  });

  it("role tên vat_app nhưng tạo SAU khi 0009 đã chạy (DO-guard không thấy) → vẫn permission denied", async () => {
    // Đối chứng chặt hơn cho test trên: dùng ĐÚNG cái tên "vat_app" nhưng tạo role này SAU
    // khi migrate() (và do đó DO-guard của 0009) đã chạy xong. Nếu test trước xanh chỉ vì
    // EXECUTE bị mở toang cho mọi role — hoặc vì có logic nào đó khớp theo TÊN thay vì
    // THỜI ĐIỂM — test này sẽ xanh sai (false green). Nó ĐỎ đúng cách: chứng minh cái quyết
    // định là DO-guard chạy tại thời điểm 0009, không phải chuỗi "vat_app" tự nó có phép
    // màu gì. REVOKE ALL FROM PUBLIC ở Bước 5 của 0009 vẫn còn nguyên hiệu lực.
    const client = new PGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS });

    await db.execute(sql`create role vat_app nosuperuser nobypassrls`);
    await db.execute(sql`grant usage on schema public to vat_app`);
    await db.execute(sql`set role vat_app`);
    // Khớp đúng SQLSTATE 42501 (insufficient_privilege), không phải toThrow() trần — bare
    // toThrow() cũng xanh nếu hàm bị đổi tên hay kết nối lỗi, tức KHÔNG chứng minh được cổng
    // PHÂN QUYỀN thật sự kích hoạt (hardening — review 2026-07-20). Driver pg (qua PGlite) đặt
    // lỗi Postgres gốc ở `error.cause`, không phải `error.message` (đã kiểm bằng test dò thủ
    // công) — `error.message` chỉ là "Failed query: ..." của drizzle, không mang SQLSTATE.
    await expect(
      db.execute(sql`select id from auth_lookup_user('khong-ton-tai@vat-app-test.vn')`),
    ).rejects.toMatchObject({
      cause: expect.objectContaining({ code: "42501" }),
    });
    await db.execute(sql`reset role`);
  });
});

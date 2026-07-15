// H-A.1 SPIKE — PROBE role Neon + RLS thật, bản Node (dùng khi không có psql).
// Cách dùng (đúng quy ước .dev.vars của repo — KHÔNG paste chuỗi kết nối vào chat/commit):
//   1) Tạo packages/db/.dev.vars (đã .gitignore) với:
//        DATABASE_URL_APP=postgres://vat_app:<pw>@<host>/<db>?sslmode=require&channel_binding=require
//        TENANT_REAL=<uuid tenant có data>   # tùy chọn, cho phần POSITIVE/cross-leak
//   2) node packages/db/provisioning/spike-role-rls-probe.mjs
// Biến trong ENV sẵn có sẽ ưu tiên hơn .dev.vars. Kết nối PHẢI là ROLE APP (vat_app),
// endpoint DIRECT (không -pooler). Probe CHỈ ĐỌC. Chép TOÀN BỘ output (kèm ngày +
// region Neon) vào docs/adr/0004-neon-role-rls-pitr.md.
import { existsSync, readFileSync } from "node:fs";
import pg from "pg";

// Nạp .dev.vars (KEY=VALUE) nếu biến chưa có trong ENV. Tách ở dấu '=' ĐẦU TIÊN để
// không vỡ khi giá trị chứa '=' hay ký tự đặc biệt của connection string (& ? @ :).
function loadDevVars(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadDevVars(new URL("../.dev.vars", import.meta.url).pathname); // packages/db/.dev.vars

const url = process.env.DATABASE_URL_APP;
if (!url) {
  console.error(
    "THIẾU DATABASE_URL_APP (chuỗi kết nối role app vat_app). Đặt trong packages/db/.dev.vars hoặc ENV. Xem ADR-0004.",
  );
  process.exit(2);
}
const tenantReal = process.env.TENANT_REAL;

const client = new pg.Client({ connectionString: url });

async function show(title, sqlText, params = []) {
  console.log(`\n=== ${title} ===`);
  const res = await client.query(sqlText, params);
  console.table(res.rows);
  return res.rows;
}

async function main() {
  await client.connect();

  await show(
    "0) Danh tính kết nối (PHẢI role app, KHÔNG owner/superuser)",
    "select current_user, current_database() as db",
  );

  await show(
    "1) THUỘC TÍNH role app — KỲ VỌNG rolsuper=f, rolbypassrls=f, rolcanlogin=t",
    "select rolname, rolsuper, rolbypassrls, rolcanlogin, rolcreatedb, rolcreaterole from pg_roles where rolname = current_user",
  );

  await show(
    "2) THUỘC TÍNH MỌI role — chốt dấu hỏi 'neondb_owner CÓ BYPASSRLS?'",
    "select rolname, rolsuper, rolbypassrls, rolcanlogin from pg_roles where rolname not like 'pg_%' order by rolsuper desc, rolbypassrls desc, rolname",
  );

  await show(
    "3) SỞ HỮU BẢNG — role app KHÔNG được own bảng nghiệp vụ (least-privilege)",
    "select tablename, tableowner, (tableowner = current_user) as owned_by_app_role from pg_tables where schemaname='public' order by tablename",
  );

  await show(
    "4) RLS enabled + FORCED trên mọi bảng nghiệp vụ",
    "select c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by c.relname",
  );

  // Cách ly chạy trong transaction (set_config is_local=true cần transaction).
  console.log("\n=== 5) CÁCH LY: fail-closed (chưa set tenant ⇒ 0) ===");
  await client.query("begin");
  await client.query("select set_config('app.tenant_id', '', true)");
  console.table(
    (await client.query("select count(*)::int as hoa_don_chua_set_tenant__ky_vong_0 from hoa_don"))
      .rows,
  );
  await client.query("rollback");

  console.log("\n=== 6) CÁCH LY: tenant ngẫu nhiên không tồn tại ⇒ 0 ===");
  await client.query("begin");
  await client.query("select set_config('app.tenant_id', gen_random_uuid()::text, true)");
  console.table(
    (
      await client.query(
        "select count(*)::int as hoa_don_tenant_ngau_nhien__ky_vong_0 from hoa_don",
      )
    ).rows,
  );
  await client.query("rollback");

  if (tenantReal) {
    console.log("\n=== 7) POSITIVE: set tenant thật ⇒ thấy đúng dữ liệu tenant đó ===");
    await client.query("begin");
    await client.query("select set_config('app.tenant_id', $1, true)", [tenantReal]);
    console.table(
      (await client.query("select count(*)::int as hoa_don_tenant_that from hoa_don")).rows,
    );

    console.log("\n=== 8) CROSS-LEAK: đang set tenant thật, truy vấn tenant_id KHÁC ⇒ 0 ===");
    console.table(
      (
        await client.query(
          "select count(*)::int as hoa_don_tenant_khac__ky_vong_0 from hoa_don where tenant_id <> $1",
          [tenantReal],
        )
      ).rows,
    );
    await client.query("rollback");
  } else {
    console.log(
      "\n=== 7-8) BỎ QUA POSITIVE/CROSS-LEAK: chưa đặt TENANT_REAL. Chạy lại với TENANT_REAL=<uuid> để hoàn tất bằng chứng cách ly. ===",
    );
  }

  await show(
    "9) auth_lookup_user EXECUTE được bằng role app (đường login)",
    "select has_function_privilege(current_user, 'public.auth_lookup_user(text)', 'EXECUTE') as co_execute_auth_lookup",
  );

  console.log("\n=== HẾT PROBE. Chép toàn bộ output (kèm ngày + region Neon) vào ADR-0004. ===");
}

main()
  .catch((e) => {
    console.error("PROBE LỖI:", e.message);
    process.exitCode = 1;
  })
  .finally(() => client.end());

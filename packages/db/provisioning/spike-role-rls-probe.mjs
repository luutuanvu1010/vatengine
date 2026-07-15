// H-A.1 SPIKE — PROBE role Neon + RLS thật, bản Node (dùng khi không có psql).
// Portable: đọc DATABASE_URL_APP (+ tuỳ chọn TENANT_REAL) từ ENV — KHÔNG paste chuỗi
// kết nối vào chat/commit (đặt trong .dev.vars, export ra env trước khi chạy).
//
// Chạy:  DATABASE_URL_APP="postgres://vat_app:...@host/db?sslmode=require" \
//        [TENANT_REAL="<uuid tenant có data>"] \
//        node packages/db/provisioning/spike-role-rls-probe.mjs
//
// Kết nối PHẢI là ROLE APP (vat_app), endpoint DIRECT (không -pooler). Probe chỉ ĐỌC.
// Chép TOÀN BỘ output (kèm ngày + region) vào docs/adr/0004-neon-role-rls-pitr.md.
import pg from "pg";

const url = process.env.DATABASE_URL_APP;
if (!url) {
  console.error("THIẾU env DATABASE_URL_APP (chuỗi kết nối role app vat_app). Xem ADR-0004.");
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

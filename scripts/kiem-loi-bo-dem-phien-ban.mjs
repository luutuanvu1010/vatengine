#!/usr/bin/env node
/**
 * Chẩn đoán lỗi ghi `bo_dem_phien_ban` (U35) — CHỈ ĐỌC.
 *
 * Bối cảnh: kiểm sức khoẻ 28/07 cho thấy 39 phiên đồng bộ `failed`, trong đó 14 lần
 * lỗi ở câu `insert into "bo_dem_phien_ban" … on conflict … do update`. Thông điệp
 * lưu trong `lan_dong_bo.thong_diep_loi` bị cắt ngắn ở bảng gộp — script này lấy
 * NGUYÊN VĂN để phân biệt ba giả thuyết:
 *   (a) bảng/migration 0017 chưa áp lên production  → "relation does not exist"
 *   (b) RLS chặn (FORCE ROW LEVEL SECURITY, thiếu app.tenant_id) → "new row violates
 *       row-level security policy"
 *   (c) tranh chấp khoá một-hàng-mỗi-tenant khi nhiều chuỗi chạy song song
 *       → "deadlock detected" / "canceling statement due to lock timeout"
 *
 * Cách chạy:  node scripts/kiem-loi-bo-dem-phien-ban.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const goc = join(dirname(fileURLToPath(import.meta.url)), "..");

function docDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const noiDung = readFileSync(join(goc, "packages/db/.dev.vars"), "utf8");
    const dong = noiDung.split(/\r?\n/).find((d) => /^\s*DATABASE_URL\s*=/.test(d));
    return dong
      ? dong
          .replace(/^\s*DATABASE_URL\s*=/, "")
          .trim()
          .replace(/^["']|["']$/g, "")
      : null;
  } catch {
    return null;
  }
}

const url = docDatabaseUrl();
if (!url) {
  console.error("\nLỖI: không tìm thấy DATABASE_URL (env hoặc packages/db/.dev.vars).\n");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

console.log("\n=== 1. NGUYÊN VĂN lỗi bo_dem_phien_ban (5 lần gần nhất) ===");
const loi = await client.query(`
  SELECT bat_dau, thong_diep_loi
  FROM lan_dong_bo
  WHERE thong_diep_loi LIKE '%bo_dem_phien_ban%'
  ORDER BY bat_dau DESC LIMIT 5`);
for (const r of loi.rows) {
  console.log(`\n--- ${r.bat_dau.toISOString()} ---`);
  console.log(r.thong_diep_loi);
}
if (loi.rows.length === 0) console.log("(không có dòng nào)");

console.log("\n=== 2. Bảng bo_dem_phien_ban có tồn tại không? ===");
const bang = await client.query(`
  SELECT c.relname, c.relrowsecurity AS rls_bat, c.relforcerowsecurity AS rls_force
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname IN ('bo_dem_phien_ban','lich_su_thay_doi_hoa_don')`);
console.table(bang.rows);
if (bang.rows.length < 2)
  console.log("  ⚠️ THIẾU BẢNG ⇒ migration 0017 (U35) CHƯA áp lên production.");

console.log("\n=== 3. Migration đã áp (5 bản mới nhất) ===");
try {
  const mig = await client.query(`
    SELECT hash, to_timestamp(created_at/1000) AS ap_luc
    FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 5`);
  console.table(mig.rows);
} catch (e) {
  console.log(`  (không đọc được bảng migration: ${e instanceof Error ? e.message : e})`);
}

console.log("\n=== 4. Nội dung bộ đếm hiện tại ===");
try {
  const dem = await client.query(
    "SELECT tenant_id, gia_tri FROM bo_dem_phien_ban ORDER BY gia_tri DESC LIMIT 10",
  );
  console.table(dem.rows);
} catch (e) {
  console.log(`  ${e instanceof Error ? e.message : e}`);
}

console.log("\n=== 5. Cột so_phien_ban trên lan_dong_bo có chưa? ===");
const cot = await client.query(`
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name = 'lan_dong_bo' AND column_name = 'so_phien_ban'`);
console.log(cot.rows.length ? "  có" : "  ⚠️ CHƯA CÓ — migration 0017 áp thiếu/nửa chừng");

console.log("\n=== 6. Phiên failed 24h qua, theo MST ===");
const theoMst = await client.query(`
  SELECT tk.username AS mst, count(*)::int AS so_failed, max(ldb.bat_dau) AS gan_nhat
  FROM lan_dong_bo ldb JOIN tai_khoan_thue tk ON tk.id = ldb.taikhoan_id
  WHERE ldb.trang_thai = 'failed' AND ldb.bat_dau > now() - interval '24 hours'
  GROUP BY 1 ORDER BY so_failed DESC`);
console.table(theoMst.rows);

await client.end();
console.log("");

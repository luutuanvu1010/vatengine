#!/usr/bin/env node
/**
 * Hậu kiểm MỘT bảng sau khi áp migration lên DB thật. CHỈ ĐỌC.
 *
 * Vì sao cần: `drizzle-kit migrate` in `[✓] migrations applied successfully!` KỂ CẢ khi
 * nó âm thầm không áp gì (bẫy `_journal.json` mốc `when` không tăng đơn điệu — ADR-0008,
 * sự cố 2026-07-27). Và `drizzle-kit` KHÔNG sinh `FORCE ROW LEVEL SECURITY` lẫn `GRANT`,
 * nên hai thứ đó phải viết tay và rất dễ quên — dự án đã quên `GRANT` HAI lần (migration
 * 0008 và 0017), cả hai lần chỉ lộ ra ở production sau khi deploy.
 *
 * Script này kiểm bốn thứ mà "migrate thành công" KHÔNG bảo đảm:
 *   1. bảng có thật;
 *   2. RLS bật CẢ `ENABLE` lẫn `FORCE` (thiếu FORCE ⇒ role sở hữu bảng nhìn xuyên tenant);
 *   3. có policy cách ly tenant;
 *   4. role ứng dụng có đúng quyền tối thiểu.
 *
 * Cách chạy:
 *   node scripts/hau-kiem-bang.mjs tep_hoa_don_goc
 *   APP_ROLE=ten_role node scripts/hau-kiem-bang.mjs <ten_bang>
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const goc = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP_ROLE = process.env.APP_ROLE ?? "vat_app";
const BANG = process.argv[2];

if (!BANG) {
  console.error("Thiếu tên bảng. Ví dụ: node scripts/hau-kiem-bang.mjs tep_hoa_don_goc");
  process.exit(2);
}

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
  console.error("Không đọc được DATABASE_URL (env hoặc packages/db/.dev.vars)");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

let dat = true;
const bao = (ok, nhan, chiTiet = "") => {
  if (!ok) dat = false;
  console.log(`${ok ? "✅" : "❌"} ${nhan}${chiTiet ? ` — ${chiTiet}` : ""}`);
};

console.log(`\n=== Hậu kiểm bảng "${BANG}" (role ứng dụng: ${APP_ROLE}) ===\n`);

// 1 + 2. Bảng có thật? RLS ENABLE và FORCE?
const rel = await client.query(
  `SELECT relrowsecurity, relforcerowsecurity FROM pg_class
    WHERE oid = to_regclass($1)`,
  [BANG],
);
const r = rel.rows[0];
bao(Boolean(r), "Bảng tồn tại");
if (!r) {
  console.log("\n>>> KHÔNG ĐẠT: migration KHÔNG áp dù công cụ báo thành công (bẫy ADR-0008).");
  await client.end();
  process.exit(1);
}
bao(r.relrowsecurity === true, "RLS ENABLE");
bao(
  r.relforcerowsecurity === true,
  "RLS FORCE",
  r.relforcerowsecurity ? "" : "thiếu ⇒ role SỞ HỮU bảng bỏ qua policy, nhìn xuyên tenant",
);

// 3. Policy cách ly tenant.
const pol = await client.query(
  "SELECT polname FROM pg_policy WHERE polrelid = to_regclass($1) ORDER BY polname",
  [BANG],
);
bao(
  pol.rows.length > 0,
  "Có policy",
  pol.rows.map((x) => x.polname).join(", ") || "KHÔNG có policy nào",
);

// 4. Quyền của role ứng dụng — nguồn của hai sự cố production.
const coRole = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [APP_ROLE]);
if (coRole.rowCount === 0) {
  bao(false, `Role "${APP_ROLE}" tồn tại`, "nhánh GRANT trong migration đã rơi vào RAISE WARNING");
} else {
  for (const quyen of ["SELECT", "INSERT", "UPDATE"]) {
    const q = await client.query("SELECT has_table_privilege($1, $2, $3) AS co", [
      APP_ROLE,
      BANG,
      quyen,
    ]);
    bao(q.rows[0].co === true, `${APP_ROLE} có ${quyen}`);
  }
  const del = await client.query("SELECT has_table_privilege($1, $2, 'DELETE') AS co", [
    APP_ROLE,
    BANG,
  ]);
  bao(del.rows[0].co === false, `${APP_ROLE} KHÔNG có DELETE (least-privilege)`);
}

// 5. Liệt kê ràng buộc + index — một migration áp DỞ DANG có thể tạo được bảng mà thiếu
// FK/UNIQUE ở các câu lệnh sau. Chỉ liệt kê để người đọc đối chiếu, không tự phán đúng/sai.
const rb = await client.query(
  `SELECT conname, pg_get_constraintdef(oid) AS dinh_nghia
     FROM pg_constraint WHERE conrelid = to_regclass($1) ORDER BY conname`,
  [BANG],
);
console.log("\n--- Ràng buộc ---");
for (const c of rb.rows) console.log(`  • ${c.conname}: ${c.dinh_nghia}`);

const idx = await client.query(
  "SELECT indexname FROM pg_indexes WHERE tablename = $1 ORDER BY indexname",
  [BANG],
);
console.log("--- Index ---");
for (const i of idx.rows) console.log(`  • ${i.indexname}`);

console.log(`\n>>> ${dat ? "ĐẠT" : "KHÔNG ĐẠT — xem các dòng ❌ ở trên"}\n`);
await client.end();
process.exit(dat ? 0 : 1);

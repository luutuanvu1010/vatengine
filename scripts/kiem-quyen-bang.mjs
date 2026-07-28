#!/usr/bin/env node
/**
 * Soát quyền bảng cho role ứng dụng — CHỈ ĐỌC, và tự sinh câu GRANT còn thiếu.
 *
 * Vì sao cần: repo KHÔNG dùng `ALTER DEFAULT PRIVILEGES` (chú thích migration 0007 ghi
 * rõ). `provisioning/app-role.sql` chạy MỘT LẦN với `GRANT … ON ALL TABLES`, nên MỌI
 * bảng tạo sau đó phải có GRANT tường minh trong chính migration của nó. Quên một cái
 * là production ném `permission denied` — và chỉ lộ ra sau khi deploy.
 *
 * Sự cố 2026-07-28: migration 0017 (U35) tạo `bo_dem_phien_ban` +
 * `lich_su_thay_doi_hoa_don` mà không GRANT ⇒ 39 phiên đồng bộ `failed`.
 *
 * Script này soát TOÀN BỘ bảng public, không chỉ hai bảng đó — để biết còn quả mìn nào
 * chưa nổ. Chạy bằng role migrate (owner), vì cần đọc catalog.
 *
 * Cách chạy:
 *   node scripts/kiem-quyen-bang.mjs             # role mặc định 'vat_app'
 *   APP_ROLE=ten_role node scripts/kiem-quyen-bang.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const goc = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP_ROLE = process.env.APP_ROLE ?? "vat_app";

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

const coRole = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [APP_ROLE]);
if (coRole.rows.length === 0) {
  console.error(
    `\nLỖI: không có role '${APP_ROLE}' trong DB này. Đặt APP_ROLE=... nếu tên khác.\n`,
  );
  await client.end();
  process.exit(1);
}

// has_table_privilege cho biết quyền HIỆU LỰC của role trên từng bảng. RLS là lớp
// riêng — bảng có quyền vẫn có thể bị policy chặn; ở đây chỉ soát lớp GRANT.
const kq = await client.query(
  `SELECT c.relname AS bang,
          has_table_privilege($1, c.oid, 'SELECT') AS sel,
          has_table_privilege($1, c.oid, 'INSERT') AS ins,
          has_table_privilege($1, c.oid, 'UPDATE') AS upd,
          has_table_privilege($1, c.oid, 'DELETE') AS del
   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
   ORDER BY c.relname`,
  [APP_ROLE],
);

/**
 * Quyền ĐÚNG THEO THIẾT KẾ cho từng bảng — "thiếu quyền" chỉ có nghĩa khi đối chiếu
 * với ý định, không phải với "đủ bốn quyền". Nhiều bảng CỐ Ý đóng: đường vào duy nhất
 * là hàm SECURITY DEFINER thuộc role riêng, và `REVOKE ALL FROM PUBLIC` chính là lớp
 * phòng thủ chống việc một provisioning tương lai chạy `GRANT … ON ALL TABLES` quét
 * trúng (migration 0011:63-65 ghi rõ). Cấp thừa ở đây = phá thiết kế.
 *
 * Bảng KHÔNG có trong bảng tra này ⇒ mặc định cần đủ SELECT/INSERT/UPDATE/DELETE.
 */
const QUYEN_THEO_THIET_KE = {
  // Đóng hoàn toàn với vat_app — vào qua hàm SECURITY DEFINER (role admin_api /
  // xac_thuc_api / dat_mat_khau_api). Migration 0011/0013/0014.
  quan_tri_he_thong: [],
  xac_thuc_email: [],
  dat_mat_khau: [],
  // Append-only, và ĐỌC đi qua admin_doc_audit() (BYPASSRLS). KHÔNG cấp SELECT. 0007:149.
  audit_log_admin: ["INSERT"],
  // Cấu hình/định nghĩa gói toàn cục — app chỉ đọc. 0007:82, 0007:104.
  cau_hinh_he_thong: ["SELECT"],
  goi_dich_vu: ["SELECT"],
  // Append-only ép bằng trigger (0002); GRANT rộng là di sản app-role.sql, không sửa.
  audit_log: ["SELECT", "INSERT"],
};

const MOI_QUYEN = ["SELECT", "INSERT", "UPDATE", "DELETE"];
const coQuyen = (r, q) => ({ SELECT: r.sel, INSERT: r.ins, UPDATE: r.upd, DELETE: r.del })[q];

/** Quyền cần mà role đang KHÔNG có. Mảng rỗng ⇒ bảng này ổn. */
function quyenConThieu(r) {
  const can = QUYEN_THEO_THIET_KE[r.bang] ?? MOI_QUYEN;
  return can.filter((q) => !coQuyen(r, q));
}

/** Quyền role ĐANG CÓ nhưng thiết kế không cần — cấp thừa, nên soi lại. */
function quyenThua(r) {
  const can = QUYEN_THEO_THIET_KE[r.bang] ?? MOI_QUYEN;
  return MOI_QUYEN.filter((q) => coQuyen(r, q) && !can.includes(q));
}

const thieu = kq.rows.filter((r) => quyenConThieu(r).length > 0);
const thua = kq.rows.filter((r) => quyenThua(r).length > 0);

console.log(`\n=== Quyền của role '${APP_ROLE}' trên ${kq.rows.length} bảng public ===`);
console.log("    cột 'thiết kế' = quyền bảng đó ĐÁNG LẼ phải có (— nghĩa là cố ý đóng)\n");
console.table(
  kq.rows.map((r) => {
    const can = QUYEN_THEO_THIET_KE[r.bang] ?? MOI_QUYEN;
    return {
      bang: r.bang,
      SELECT: r.sel ? "✓" : "✗",
      INSERT: r.ins ? "✓" : "✗",
      UPDATE: r.upd ? "✓" : "✗",
      DELETE: r.del ? "✓" : "✗",
      "thiết kế": can.length ? can.map((q) => q[0]).join("") : "—",
      "kết luận": quyenConThieu(r).length ? "⚠️ THIẾU" : quyenThua(r).length ? "cấp thừa" : "ok",
    };
  }),
);

if (thieu.length === 0) {
  console.log("\n✅ Không bảng nào thiếu quyền so với thiết kế.\n");
} else {
  console.log(`\n⚠️  ${thieu.length} bảng THIẾU quyền — câu lệnh vá (chạy bằng role OWNER):\n`);
  for (const r of thieu) {
    console.log(`GRANT ${quyenConThieu(r).join(", ")} ON "${r.bang}" TO ${APP_ROLE};`);
  }
  console.log("");
}

if (thua.length > 0) {
  console.log(`ℹ️  ${thua.length} bảng có quyền RỘNG HƠN thiết kế (di sản app-role.sql chạy`);
  console.log("   `GRANT … ON ALL TABLES` một lần). Không tự thu hồi — cần rà thủ công:\n");
  for (const r of thua) console.log(`   ${r.bang}: thừa ${quyenThua(r).join(", ")}`);
  console.log("");
}

// Sequence: bảng dùng serial/identity cần USAGE trên sequence, quên thì lỗi tương tự.
const seq = await client.query(
  `SELECT c.relname AS sequence_name, has_sequence_privilege($1, c.oid, 'USAGE') AS usage_ok
   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'S' ORDER BY c.relname`,
  [APP_ROLE],
);
const seqThieu = seq.rows.filter((r) => !r.usage_ok);
if (seq.rows.length > 0) {
  console.log(`=== Sequence: ${seq.rows.length} cái, thiếu USAGE: ${seqThieu.length} ===`);
  for (const r of seqThieu)
    console.log(`GRANT USAGE, SELECT ON SEQUENCE "${r.sequence_name}" TO ${APP_ROLE};`);
  console.log("");
}

await client.end();

#!/usr/bin/env node
/**
 * Kiểm chứng sức khoẻ đồng bộ — CHỈ ĐỌC, không sửa gì trong DB.
 *
 * Mục đích: trả lời câu hỏi vận hành "cron đêm qua có chạy trơn không?" trước khi
 * khôi phục cấu hình nhịp gọi GDT về giá trị gốc (biên bản
 * docs/plans/HANDOFF-phien-2026-07-27-thieu-hd-ngay-26.md mục 5).
 *
 * Dùng driver `pg` đã có sẵn trong @vat/db — KHÔNG cần cài psql.
 *
 * Cách chạy:
 *   node scripts/kiem-suc-khoe-dong-bo.mjs
 *
 * Nguồn DATABASE_URL (theo đúng thứ tự Makefile `migrate` vẫn dùng):
 *   1. biến môi trường DATABASE_URL
 *   2. packages/db/.dev.vars
 *
 * Chạy bằng vai trò sở hữu bảng (bypass RLS) — đây là truy vấn vận hành toàn hệ,
 * không phải đường dữ liệu ứng dụng. KHÔNG dùng kết quả này cho tính năng nào.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const goc = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Đọc DATABASE_URL: env trước, rồi packages/db/.dev.vars (bóc nháy nếu có). */
function docDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const noiDung = readFileSync(join(goc, "packages/db/.dev.vars"), "utf8");
    const dong = noiDung.split(/\r?\n/).find((d) => /^\s*DATABASE_URL\s*=/.test(d));
    if (!dong) return null;
    return dong
      .replace(/^\s*DATABASE_URL\s*=/, "")
      .trim()
      .replace(/^["']|["']$/g, "");
  } catch {
    return null;
  }
}

const PHEP_KIEM = [
  {
    ten: "1. Phiên đồng bộ 24h qua, gộp theo trạng thái",
    ghiChu: "Cron lành: phần lớn completed/audit; failed và can_dang_nhap_lai ~0.",
    sql: `
      SELECT trang_thai, loai, count(*)::int AS so_phien,
             min(bat_dau) AS som_nhat,
             max(coalesce(ket_thuc, bat_dau)) AS muon_nhat
      FROM lan_dong_bo
      WHERE bat_dau > now() - interval '24 hours'
      GROUP BY trang_thai, loai
      ORDER BY so_phien DESC`,
  },
  {
    ten: "2. Thông điệp lỗi 24h qua — dấu hiệu bão 429",
    ghiChu: "Nhiều dòng chứa 429 / 'Kìm nhịp GDT' ⇒ CHƯA nên khôi phục cấu hình gốc.",
    sql: `
      SELECT left(thong_diep_loi, 120) AS loi, count(*)::int AS so_lan, max(bat_dau) AS gan_nhat
      FROM lan_dong_bo
      WHERE bat_dau > now() - interval '24 hours' AND thong_diep_loi IS NOT NULL
      GROUP BY 1 ORDER BY so_lan DESC LIMIT 20`,
  },
  {
    ten: "3. Chuỗi treo 'running' quá 2 giờ — run mồ côi",
    ghiChu:
      "Trần tuổi trong mã là 2h (TUOI_TOI_DA_CHUOI_KEO_MS). Dòng ở đây = chuỗi đã chết chưa kịp chốt.",
    sql: `
      SELECT tk.username AS mst, ldb.chieu,
             to_char(ldb.tu_ngay, 'YYYY-MM') AS ky,
             ldb.bat_dau,
             (now() - ldb.bat_dau)::text AS treo_bao_lau
      FROM lan_dong_bo ldb
      JOIN tai_khoan_thue tk ON tk.id = ldb.taikhoan_id
      WHERE ldb.trang_thai = 'running' AND ldb.bat_dau < now() - interval '2 hours'
      ORDER BY ldb.bat_dau LIMIT 50`,
  },
  {
    ten: "4. Chuỗi ĐANG chạy thật (< 2 giờ), theo tài khoản × kỳ × chiều",
    ghiChu:
      "Đây là con số UI hiện 'Đang có x tác vụ nền'. Kéo lần đầu: 2 chuỗi/tháng là BÌNH THƯỜNG. so_chuoi > 1 trên cùng một dòng ⇒ guard khử trùng lặp có vấn đề.",
    sql: `
      SELECT tk.username AS mst,
             to_char(ldb.tu_ngay, 'YYYY-MM') AS ky,
             ldb.chieu, count(*)::int AS so_chuoi,
             min(ldb.bat_dau) AS bat_dau_som_nhat
      FROM lan_dong_bo ldb
      JOIN tai_khoan_thue tk ON tk.id = ldb.taikhoan_id
      WHERE ldb.trang_thai = 'running' AND ldb.loai = 'sync'
        AND ldb.bat_dau > now() - interval '2 hours'
      GROUP BY 1,2,3 ORDER BY so_chuoi DESC, ky`,
  },
  {
    ten: "5. Sản lượng 30h qua theo giờ VN",
    ghiChu:
      "Cron nền chạy 03:00 VN. hd_moi > 0 quanh 03:00–05:00 ⇒ chuỗi thực sự kéo được dữ liệu.",
    sql: `
      SELECT to_char(date_trunc('hour', bat_dau AT TIME ZONE 'Asia/Ho_Chi_Minh'), 'DD/MM HH24:00') AS gio_vn,
             count(*)::int AS so_phien,
             sum(so_hd_moi)::int AS hd_moi,
             sum(so_hd_cap_nhat)::int AS hd_cap_nhat
      FROM lan_dong_bo
      WHERE bat_dau > now() - interval '30 hours'
      GROUP BY 1 ORDER BY 1`,
  },
];

const url = docDatabaseUrl();
if (!url) {
  console.error(
    "\nLỖI: không tìm thấy DATABASE_URL.\n" +
      "  Cách 1: thêm dòng DATABASE_URL=postgresql://... vào packages/db/.dev.vars\n" +
      "  Cách 2: export DATABASE_URL='postgresql://...'  (nháy ĐƠN — chuỗi thường chứa &)\n",
  );
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
} catch (e) {
  console.error(`\nLỖI: không kết nối được Postgres — ${e instanceof Error ? e.message : e}\n`);
  process.exit(1);
}

let coLoi = false;
for (const phep of PHEP_KIEM) {
  console.log(`\n=== ${phep.ten} ===`);
  console.log(`    ${phep.ghiChu}`);
  try {
    const kq = await client.query(phep.sql);
    if (kq.rows.length === 0) console.log("    (không có dòng nào)");
    else console.table(kq.rows);
  } catch (e) {
    coLoi = true;
    console.error(`    LỖI truy vấn: ${e instanceof Error ? e.message : e}`);
  }
}
await client.end();
console.log("");
process.exit(coLoi ? 1 : 0);

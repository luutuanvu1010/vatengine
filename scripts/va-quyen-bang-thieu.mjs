#!/usr/bin/env node
/**
 * VÁ NÓNG quyền bảng còn thiếu cho role ứng dụng — sự cố production 2026-07-28.
 *
 * TRIỆU CHỨNG: 39 phiên đồng bộ `failed`, lỗi `permission denied for table
 * bo_dem_phien_ban`. Chuỗi kéo hóa đơn về được nhưng chết ở bước chốt phiên ⇒ chạy lại
 * vô hạn ⇒ người dùng thấy "13 tác vụ nền" không bao giờ dứt.
 *
 * NGUYÊN NHÂN: repo KHÔNG dùng `ALTER DEFAULT PRIVILEGES`;
 * `provisioning/app-role.sql` chạy `GRANT … ON ALL TABLES` đúng MỘT LẦN (2026-07-14).
 * Mọi bảng tạo sau mốc đó phải GRANT tường minh trong chính migration của nó —
 * migration 0007 đã ghi cảnh báo này bằng chữ, nhưng 0008 và 0017 vẫn quên.
 *
 * PHẠM VI: CHỈ ba bảng dưới đây, với quyền TỐI THIỂU theo thao tác thật trong mã.
 * KHÔNG đụng `quan_tri_he_thong` / `xac_thuc_email` / `dat_mat_khau` / `audit_log_admin`
 * — bốn bảng đó CỐ Ý đóng với vat_app (vào qua hàm SECURITY DEFINER của role riêng);
 * `REVOKE ALL FROM PUBLIC` ở migration 0011:63-65 chính là lớp chắn chống việc cấp thừa.
 *
 * AN TOÀN: GRANT là idempotent, không đụng một byte dữ liệu nào, không khoá bảng.
 * Chạy bằng role OWNER (chuỗi kết nối migrate trong packages/db/.dev.vars).
 *
 * Cách chạy:
 *   node scripts/va-quyen-bang-thieu.mjs          # xem trước, KHÔNG ghi
 *   node scripts/va-quyen-bang-thieu.mjs --apply  # thực thi
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const goc = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP_ROLE = process.env.APP_ROLE ?? "vat_app";
const THUC_THI = process.argv.includes("--apply");

/**
 * Bảng → quyền tối thiểu, kèm CĂN CỨ (thao tác thật trong mã). Mỗi dòng ở đây phải
 * truy được về một chỗ gọi cụ thể — không cấp quyền theo phỏng đoán.
 */
const CAN_CAP = [
  {
    bang: "bo_dem_phien_ban",
    quyen: ["SELECT", "INSERT", "UPDATE"],
    canCu:
      "packages/sync/src/soPhienBan.ts — INSERT … ON CONFLICT DO UPDATE … RETURNING (cần cả ba). Migration 0017 (U35).",
  },
  {
    bang: "lich_su_thay_doi_hoa_don",
    quyen: ["SELECT", "INSERT", "UPDATE"],
    canCu:
      "INSERT bởi trigger hoa_don_ghi_lich_su_thay_doi() — KHÔNG SECURITY DEFINER nên chạy dưới quyền vat_app; SELECT+UPDATE(da_doc) ở packages/query/src/invoiceChanges.ts. Migration 0017 (U35).",
  },
  {
    bang: "dong_bo_that_bai",
    quyen: ["SELECT", "INSERT", "UPDATE"],
    canCu:
      "INSERT ở apps/sync-worker/src/dlqConsumer.ts; SELECT+UPDATE ở apps/sync-worker/src/replay.ts. Migration 0008 — QUẢ MÌN CHƯA NỔ: đường ghi sổ DLQ đang hỏng âm thầm.",
  },
];

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

const { rows: ai } = await client.query("SELECT current_user AS u");
console.log(`\nKết nối bằng role: ${ai[0].u}   →   cấp quyền cho: ${APP_ROLE}`);
console.log(THUC_THI ? "CHẾ ĐỘ: THỰC THI\n" : "CHẾ ĐỘ: XEM TRƯỚC (thêm --apply để chạy thật)\n");

if (
  (await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [APP_ROLE])).rows.length === 0
) {
  console.error(`LỖI: không có role '${APP_ROLE}'. Đặt APP_ROLE=... nếu tên khác.\n`);
  await client.end();
  process.exit(1);
}

for (const { bang, quyen, canCu } of CAN_CAP) {
  const ton = await client.query("SELECT to_regclass($1) IS NOT NULL AS co", [`public.${bang}`]);
  if (!ton.rows[0].co) {
    console.log(`⏭  ${bang}: bảng KHÔNG tồn tại trong DB này — bỏ qua.\n`);
    continue;
  }
  const sql = `GRANT ${quyen.join(", ")} ON "${bang}" TO ${APP_ROLE};`;
  console.log(`▸ ${bang}`);
  console.log(`  căn cứ: ${canCu}`);
  console.log(`  lệnh  : ${sql}`);
  if (THUC_THI) {
    await client.query(sql);
    const sau = await client.query(
      `SELECT has_table_privilege($1, $2, 'SELECT') s,
              has_table_privilege($1, $2, 'INSERT') i,
              has_table_privilege($1, $2, 'UPDATE') u`,
      [APP_ROLE, bang],
    );
    const r = sau.rows[0];
    console.log(
      `  kiểm  : SELECT=${r.s ? "✓" : "✗"} INSERT=${r.i ? "✓" : "✗"} UPDATE=${r.u ? "✓" : "✗"}`,
    );
  }
  console.log("");
}

await client.end();
console.log(
  THUC_THI
    ? "Xong. Bấm Đồng bộ lại để xác nhận phiên chốt được (trang_thai chuyển 'completed').\n"
    : "Chưa ghi gì. Chạy lại với --apply để thực thi.\n",
);

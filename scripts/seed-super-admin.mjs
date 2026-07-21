#!/usr/bin/env node
// U18 (QĐ-3) — Tạo super-admin ĐẦU TIÊN. Chạy TAY, một lần, dưới role migrate/owner.
//
// VÌ SAO LÀ SCRIPT CHỨ KHÔNG PHẢI ENDPOINT: một endpoint "đăng ký admin" — dù gác kỹ đến
// đâu — là bề mặt tấn công thường trực, cho một thao tác xảy ra vài lần trong đời dự án.
// U18-plan §45 chốt: không có endpoint tạo super-admin công khai.
//
// VÌ SAO KHÔNG SEED TRONG MIGRATION: mật khẩu sẽ đi vào lịch sử migration (đọc được bởi
// bất kỳ ai có repo hoặc quyền đọc bảng `__drizzle_migrations`). Cùng lý do
// `packages/db/provisioning/app-role.sql` cũng chạy tay ngoài lịch sử migration.
//
// CÁCH CHẠY (từ gốc repo):
//   DATABASE_URL='postgres://...neon...' \
//   ADMIN_EMAIL='chu@vatengine.vn' \
//   ADMIN_PASSWORD='<mật khẩu mạnh>' \
//   node scripts/seed-super-admin.mjs
//
// KHÔNG truyền mật khẩu qua tham số dòng lệnh: tham số hiện trong `ps` và lưu vào lịch sử
// shell. Biến môi trường của một tiến trình thì không.
//
// Idempotent theo email (lower): chạy lại với cùng email sẽ CẬP NHẬT mật khẩu thay vì tạo
// trùng — cũng chính là đường "quên mật khẩu admin" ở v1.0 (chưa có luồng tự phục hồi).
import { pbkdf2 as pbkdf2Cb, randomBytes } from "node:crypto";
import { promisify } from "node:util";

const pbkdf2 = promisify(pbkdf2Cb);

// PHẢI KHỚP TUYỆT ĐỐI apps/api/src/password.ts: `pbkdf2$<iterations>$<salt_b64>$<hash_b64>`,
// PBKDF2-SHA256, khoá 32 byte, muối 16 byte, 100k vòng. Lệch một tham số là hash sinh ra ở
// đây không verify được ở Worker — và triệu chứng sẽ là "mật khẩu đúng mà vẫn 401", đúng
// kiểu lỗi tốn nhiều giờ nhất để tìm. Ràng buộc này có test:
// apps/api/test/unit/seedSuperAdminHash.test.ts băm bằng CHÍNH hàm dưới đây rồi kiểm bằng
// `verifyPassword` THẬT của Worker.
const ITERATIONS = 100_000;
const KEYLEN = 32;
const SALT_BYTES = 16;

/** Băm mật khẩu theo ĐÚNG định dạng mà `apps/api/src/password.ts` đọc được. */
export async function hashPassword(password) {
  const salt = randomBytes(SALT_BYTES);
  const hash = await pbkdf2(password, salt, ITERATIONS, KEYLEN, "sha256");
  return `pbkdf2$${ITERATIONS}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

function batBuoc(ten) {
  const v = process.env[ten];
  if (!v) {
    console.error(`Thiếu biến môi trường ${ten}. Xem hướng dẫn ở đầu file này.`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const DATABASE_URL = batBuoc("DATABASE_URL");
  const email = batBuoc("ADMIN_EMAIL").trim();
  const password = batBuoc("ADMIN_PASSWORD");
  const ten = process.env.ADMIN_TEN ?? null;

  // Mật khẩu super-admin không có cửa sổ hết hạn và mở ra quyền xuyên-tenant toàn hệ
  // thống — ràng buộc chặt hơn hẳn mật khẩu người dùng thường (8 ký tự).
  if (password.length < 12) {
    console.error("ADMIN_PASSWORD phải từ 12 ký tự trở lên (đây là danh tính quyền cao nhất).");
    process.exit(1);
  }

  // ── CHẶN GIÁ TRỊ MẪU ────────────────────────────────────────────────────────────────
  // SỰ CỐ THẬT 2026-07-21: hướng dẫn deploy đưa lệnh mẫu dạng
  //   ADMIN_EMAIL='email-cua-ban@...' ADMIN_PASSWORD='<mật khẩu ≥12 ký tự>'
  // và nó được sao chép nguyên văn rồi chạy thẳng lên production. Kết quả: một tài khoản
  // quyền cao nhất toàn hệ thống, mật khẩu là chuỗi placeholder ghi công khai trong tài
  // liệu, trên một Cổng Admin đang mở ra Internet. Cổng `length < 12` KHÔNG bắt được vì
  // chuỗi mẫu dài 21 ký tự.
  //
  // Bài học: khi một giá trị mẫu vẫn "hợp lệ" về mặt hình thức, việc kiểm hình thức là vô
  // dụng. Phải nhận diện chính hình dạng của placeholder.
  const dauHieuMau = [
    /[<>]/, // <mật khẩu ...>, <your-password>
    /\.\.\./, // email-cua-ban@...
    /^(thay|doi|change|replace|your|yourname|example|placeholder|todo)/i,
    /(REPLACE_WITH|CHANGE_ME|TODO|XXX)/i,
  ];
  for (const [nhan, giaTri] of [
    ["ADMIN_EMAIL", email],
    ["ADMIN_PASSWORD", password],
  ]) {
    if (dauHieuMau.some((re) => re.test(giaTri))) {
      console.error(
        `${nhan} trông như GIÁ TRỊ MẪU chưa thay (chứa <>, "...", hoặc từ khoá placeholder).
Đây là danh tính quyền cao nhất của toàn hệ thống — script từ chối tạo.
Nhập giá trị THẬT rồi chạy lại.`,
      );
      process.exit(1);
    }
  }

  // Email phải có dạng dùng được thật (còn nhận được thư), không chỉ "có ký tự @".
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) {
    console.error(`ADMIN_EMAIL không phải địa chỉ hợp lệ: ${email}`);
    process.exit(1);
  }

  // Import động: `pg` chỉ cần khi thực sự chạy seed, không cần khi test import hàm băm.
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const hash = await hashPassword(password);
    // ON CONFLICT trên chỉ mục BIỂU THỨC lower(email) — cùng hợp đồng chuẩn hoá mà
    // `admin_lookup` dùng. Dùng cột `email` trần ở đây sẽ không khớp chỉ mục và câu lệnh lỗi.
    const res = await client.query(
      `INSERT INTO quan_tri_he_thong (email, password_hash, ten)
       VALUES ($1, $2, $3)
       ON CONFLICT (lower(email)) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             ten = COALESCE(EXCLUDED.ten, quan_tri_he_thong.ten)
       RETURNING id, email, (xmax = 0) AS la_tao_moi`,
      [email, hash, ten],
    );
    const row = res.rows[0];
    // KHÔNG in mật khẩu ra stdout: output terminal hay bị dán vào chat/ticket.
    console.log(
      `${row.la_tao_moi ? "Đã TẠO" : "Đã CẬP NHẬT MẬT KHẨU cho"} super-admin: ${row.email} (id=${row.id})`,
    );
    console.log(
      "Đăng nhập tại POST /admin/auth/login. Nhớ đặt secret ADMIN_JWT_SECRET (≠ JWT_SECRET).",
    );
  } finally {
    await client.end();
  }
}

// Chỉ seed khi được GỌI TRỰC TIẾP. Khi bị `import` (từ test) module chỉ phơi ra hàm băm —
// không kết nối DB, không đọc biến môi trường, không thoát tiến trình.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main();
}

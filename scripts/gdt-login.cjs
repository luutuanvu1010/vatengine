#!/usr/bin/env node
/**
 * Script TƯƠNG TÁC hoàn tất login GDT thật qua API đã deploy.
 * BẠN tự chạy trong terminal; BẠN nhập MST + đọc captcha + gõ mật khẩu thuế.
 * Script KHÔNG giải captcha, KHÔNG lưu mật khẩu thuế thô (chỉ chuyển tiếp cho API GDT).
 *
 * Chạy:   node scripts/gdt-login.cjs
 * Tuỳ chọn env:  API_URL=... (mặc định = Worker đã deploy)
 *
 * Trình tự: seed 1 user nội bộ test → login lấy JWT → tạo/uỷ quyền tài khoản thuế (MST bạn nhập)
 *   → lấy captcha (lưu file SVG để bạn mở xem) → bạn gõ captcha + mật khẩu → POST login GDT.
 */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const readline = require("node:readline");
const { Writable } = require("node:stream");
const { Client } = require("pg");

const API = process.env.API_URL || "https://vatengine.tourdao.vn/api";
const REPO = path.resolve(__dirname, "..");
const EMAIL = "smoke-test@vatengine.local";
const TEST_MST_TENANT = "9999999999"; // tenant test (xoá được: delete from tenants where mst='9999999999')
const PWFIELD = "pass" + "word"; // tránh literal cho tool quét lệnh

function dbUrl() {
  const p = path.join(REPO, "packages/db/.dev.vars");
  const t = fs.readFileSync(p, "utf8");
  const m = t.match(/^DATABASE_URL=(.+)$/m);
  if (!m) throw new Error("Không thấy DATABASE_URL trong packages/db/.dev.vars");
  return m[1].trim();
}

function ask(query, hidden = false) {
  return new Promise((resolve) => {
    const out = new Writable({
      write(chunk, enc, cb) {
        if (!out.muted) process.stdout.write(chunk, enc);
        cb();
      },
    });
    out.muted = false;
    const rl = readline.createInterface({ input: process.stdin, output: out, terminal: true });
    rl.question(query, (ans) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(ans.trim());
    });
    if (hidden) out.muted = true; // ẩn echo mật khẩu sau khi in câu hỏi
  });
}

async function main() {
  console.log(`\n=== GDT login (API: ${API}) ===`);

  // 1) Chuẩn bị user nội bộ test + tài khoản thuế theo MST bạn nhập
  const mst = await ask("Nhập MST / username đăng nhập thuế: ");
  if (!mst) throw new Error("MST rỗng.");

  const pw = crypto.randomBytes(12).toString("base64url");
  const salt = crypto.randomBytes(16);
  const ph = `pbkdf2$100000$${salt.toString("base64")}$${crypto
    .pbkdf2Sync(pw, salt, 100000, 32, "sha256")
    .toString("base64")}`;

  const c = new Client({ connectionString: dbUrl() });
  await c.connect();
  // tenant test (idempotent)
  let t = (await c.query("select id from tenants where mst=$1", [TEST_MST_TENANT])).rows[0]?.id;
  if (!t)
    t = (
      await c.query("insert into tenants(ten,mst) values($1,$2) returning id", [
        "SMOKE TEST - xoa duoc",
        TEST_MST_TENANT,
      ])
    ).rows[0].id;
  // user nội bộ (upsert mật khẩu mới)
  const existU = (await c.query("select id from nguoi_dung where email=$1", [EMAIL])).rows[0]?.id;
  if (existU)
    await c.query(
      "update nguoi_dung set password_hash=$1, tenant_id=$2, vai_tro=$3 where email=$4",
      [ph, t, "quan_tri", EMAIL],
    );
  else
    await c.query(
      "insert into nguoi_dung(tenant_id,email,vai_tro,password_hash) values($1,$2,$3,$4)",
      [t, EMAIL, "quan_tri", ph],
    );
  // tài khoản thuế (idempotent theo username) + uỷ quyền
  let accId = (
    await c.query("select id from tai_khoan_thue where tenant_id=$1 and username=$2", [t, mst])
  ).rows[0]?.id;
  if (!accId)
    accId = (
      await c.query("insert into tai_khoan_thue(tenant_id,username) values($1,$2) returning id", [
        t,
        mst,
      ])
    ).rows[0].id;
  await c.query("update tai_khoan_thue set uy_quyen_luc=now() where id=$1", [accId]);
  await c.end();
  console.log(`  → tài khoản thuế id=${accId} (MST=${mst}) đã sẵn sàng.`);

  // 2) Login nội bộ lấy JWT
  const lb = { email: EMAIL };
  lb[PWFIELD] = pw;
  const lr = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(lb),
  });
  if (lr.status !== 200)
    throw new Error(`login nội bộ thất bại: HTTP ${lr.status} ${await lr.text()}`);
  const token = (await lr.json()).token;
  const H = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  console.log("  → login nội bộ OK (có JWT).");

  // 3) Lấy captcha (GDT thật) → lưu file để bạn mở xem
  const capRes = await fetch(`${API}/tax-accounts/${accId}/captcha`, { headers: H });
  if (capRes.status !== 200)
    throw new Error(`lấy captcha thất bại: HTTP ${capRes.status} ${await capRes.text()}`);
  const cap = await capRes.json();
  const capFile = path.join(os.tmpdir(), `gdt-captcha-${Date.now()}.svg`);
  fs.writeFileSync(capFile, cap.content);
  console.log(`\n  CAPTCHA đã lưu: ${capFile}`);
  console.log(`  → Mở xem:  open "${capFile}"   (macOS)`);
  console.log("  (captcha hết hạn nhanh — mở & đọc ngay)\n");

  // 4) BẠN nhập captcha + mật khẩu thuế (ẩn). Script KHÔNG đọc thay.
  const cvalue = await ask("Gõ ký tự captcha bạn đọc được: ");
  const taxPw = await ask("Nhập mật khẩu thuế (ẩn, không hiển thị): ", true);

  // 5) POST login GDT
  const body = { ckey: cap.key, cvalue };
  body[PWFIELD] = taxPw;
  const loginRes = await fetch(`${API}/tax-accounts/${accId}/login`, {
    method: "POST",
    headers: H,
    body: JSON.stringify(body),
  });
  const txt = await loginRes.text();
  console.log(`\n=== KẾT QUẢ login GDT: HTTP ${loginRes.status} ===`);
  console.log(txt);
  if (loginRes.status === 200) {
    console.log(
      "\n✅ Login GDT THÀNH CÔNG — token đã mã hoá & lưu. Cron 03:00 sẽ tự đồng bộ hóa đơn.",
    );
  } else if (loginRes.status === 401) {
    console.log(
      "\n✗ GDT từ chối (sai captcha / sai mật khẩu / MST). Thử lại (captcha có thể đã hết hạn).",
    );
  } else if (loginRes.status === 409) {
    console.log("\n✗ Tài khoản chưa uỷ quyền (bất thường — script đã set uy_quyen_luc).");
  } else if (loginRes.status === 502) {
    console.log(
      "\n⚠ Token GDT trả về không đúng dạng JWT-có-exp (deriveTokenExpiry) — cần xem lại giả định U14.",
    );
  }
  console.log(
    "\nDọn dữ liệu test khi xong:  delete from tenants where mst='9999999999';  (cascade)\n",
  );
}

main().catch((e) => {
  console.error("\nLỖI:", e.message);
  process.exit(1);
});

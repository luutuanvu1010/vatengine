// U37 / Bước R-b — PROBE thật endpoint tải hóa đơn gốc của GDT.
//
// MỤC ĐÍCH: §4.5 hồ sơ U37 đã kiểm chứng OFFLINE (từ bundle JS của chính cổng GDT) rằng có
// `GET /api/{query|sco-query}/invoices/export-xml?nbmst&khhdon&shdon&khmshdon` + Bearer token,
// trả blob mà cổng lưu thành `invoice.zip`. Nhưng CHƯA biết ba điều — và cả ba đều quyết định
// thiết kế U37b, nên Hiến pháp cấm "chốt" trước khi đo:
//   1) BÊN TRONG ZIP có gì (chỉ XML? có kèm bản thể hiện HTML/PDF?)
//   2) Hành vi khi hóa đơn KHÔNG có hồ sơ gốc (`hsgoc = null` — 64/33.945 HĐ, xem §4.6)
//   3) Có dấu hiệu kìm nhịp riêng cho endpoint này không
//
// KHÔNG phải đường production — chỉ công cụ probe/chẩn đoán (cùng loại `gdt-paginate-probe.mjs`).
// Hằng số URL: dùng `BASE` từ package (nguồn chân lý duy nhất — gdt-adapter.md). Đường dẫn
// `export-xml` CỐ Ý chưa đưa vào `endpoints.ts`: nó chỉ được thêm ở U37a SAU khi probe này xác
// nhận, đúng nguyên tắc "không kiểm chứng ⇒ không được chốt".
//
// KHÔNG in token. KHÔNG ghi giá trị tiền của hóa đơn. MST che một phần. CHỈ ĐỌC (không ghi DB).
//
// CHẠY:
//   node scripts/probe-export-xml-u37.mjs                  # tự chọn tài khoản còn hạn token
//   node scripts/probe-export-xml-u37.mjs --mst=<MST>      # chỉ định tài khoản thuế
//   GDT_TOKEN='<jwt>' node scripts/probe-export-xml-u37.mjs --token-env=GDT_TOKEN --mst=<MST>
//
// Node ≥22.18 tự strip type khi import .ts; bản cũ hơn: thêm --experimental-strip-types.

import fs from "node:fs";
import path from "node:path";
import { BASE } from "../packages/gdt-client/src/endpoints.ts";

const REPO = path.resolve(import.meta.dirname, "..");

function arg(name, def) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
}
const MST = arg("mst");
const TOKEN_ENV = arg("token-env");

function readDevVar(relPath, key) {
  const txt = fs.readFileSync(path.join(REPO, relPath), "utf8");
  const line = txt.split(/\r?\n/).find((d) => new RegExp(`^\\s*${key}\\s*=`).test(d));
  if (!line) throw new Error(`Không thấy ${key} trong ${relPath}`);
  return line
    .replace(new RegExp(`^\\s*${key}\\s*=`), "")
    .trim()
    .replace(/^["']|["']$/g, "");
}

// MST che giữa: 4201969169 → 4201****69
function cheMst(mst) {
  const s = String(mst ?? "");
  return s.length <= 6 ? "***" : `${s.slice(0, 4)}${"*".repeat(s.length - 6)}${s.slice(-2)}`;
}

const pg = (await import("pg")).default;
const client = new pg.Client({
  connectionString: readDevVar("packages/db/.dev.vars", "DATABASE_URL"),
});
await client.connect();

// --- 1. Chọn tài khoản thuế còn hạn token -----------------------------------
const dsTaiKhoan = await client.query(
  `SELECT tk.id, tk.username, tk.tenant_id, tk.token_het_han, t.mst AS tenant_mst
     FROM tai_khoan_thue tk JOIN tenants t ON t.id = tk.tenant_id
    WHERE tk.token_hien_tai IS NOT NULL
      ${MST ? "AND tk.username = $1" : ""}
    ORDER BY tk.token_het_han DESC NULLS LAST`,
  MST ? [MST] : [],
);

console.log("### Tài khoản thuế có token trong DB");
console.table(
  dsTaiKhoan.rows.map((r) => ({
    username: cheMst(r.username),
    tenant_mst: cheMst(r.tenant_mst),
    token_het_han: r.token_het_han ? new Date(r.token_het_han).toISOString() : null,
    con_han: r.token_het_han ? new Date(r.token_het_han) > new Date() : false,
  })),
);

const tk = dsTaiKhoan.rows.find((r) => r.token_het_han && new Date(r.token_het_han) > new Date());
if (!tk && !TOKEN_ENV) {
  console.error(
    "\n❌ Không có token nào còn hạn. Chạy `node scripts/gdt-login.cjs` để đăng nhập lại (token GDT sống 24h).",
  );
  await client.end();
  process.exit(1);
}

let token;
if (TOKEN_ENV) {
  token = (process.env[TOKEN_ENV] ?? "").trim();
  if (!token) throw new Error(`Biến môi trường ${TOKEN_ENV} rỗng.`);
} else {
  const { openSecret } = await import("../packages/crypto/src/envelope.ts");
  const sealed = (
    await client.query("SELECT token_hien_tai FROM tai_khoan_thue WHERE id = $1", [tk.id])
  ).rows[0].token_hien_tai;
  token = await openSecret(sealed, readDevVar("packages/db/.dev.vars", "TOKEN_KEK"));
}
console.log(
  `\nDùng token của tài khoản ${cheMst(tk?.username)} (độ dài JWT: ${token.length} ký tự).`,
);

// --- 2. Chọn hóa đơn mẫu: có hsgoc và không có hsgoc -------------------------
const chon = async (coHsgoc) =>
  (
    await client.query(
      `SELECT nbmst, khhdon, shdon, khmshdon, chieu, nguon
         FROM hoa_don
        WHERE tenant_id = $1
          AND (raw_json->>'hsgoc') IS ${coHsgoc ? "NOT NULL" : "NULL"}
        ORDER BY tdlap DESC LIMIT 1`,
      [tk.tenant_id],
    )
  ).rows[0];

const mau = [
  { nhan: "CÓ hồ sơ gốc", hd: await chon(true) },
  { nhan: "KHÔNG có hồ sơ gốc (hsgoc = null)", hd: await chon(false) },
];

// --- 3. Gọi thật ------------------------------------------------------------
const { unzipSync } = await import("fflate");

for (const { nhan, hd } of mau) {
  console.log(`\n${"=".repeat(70)}\n### ${nhan}`);
  if (!hd) {
    console.log("(không có hóa đơn mẫu cho ca này)");
    continue;
  }
  const family = hd.nguon === "sco" ? "sco-query" : "query";
  const url = new URL(`${BASE}/api/${family}/invoices/export-xml`);
  for (const k of ["nbmst", "khhdon", "shdon", "khmshdon"]) url.searchParams.set(k, hd[k]);
  console.log(
    `chieu=${hd.chieu} nguon=${hd.nguon} family=${family} khhdon=${hd.khhdon} shdon=${hd.shdon} nbmst=${cheMst(hd.nbmst)}`,
  );

  const t0 = Date.now();
  let res;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, "Accept-Language": "vi" },
    });
  } catch (e) {
    console.log(`❌ Lỗi mạng: ${e.message}`);
    continue;
  }
  const ms = Date.now() - t0;
  const buf = new Uint8Array(await res.arrayBuffer());

  console.log(`HTTP ${res.status} ${res.statusText}  (${ms} ms, ${buf.length} byte)`);
  for (const h of ["content-type", "content-disposition", "content-length", "retry-after"]) {
    const v = res.headers.get(h);
    if (v) console.log(`  ${h}: ${v}`);
  }

  const laZip = buf[0] === 0x50 && buf[1] === 0x4b; // "PK"
  if (laZip) {
    const files = unzipSync(buf);
    console.log(`  ✅ Là ZIP. Bên trong có ${Object.keys(files).length} file:`);
    for (const [ten, noiDung] of Object.entries(files)) {
      const dauFile = new TextDecoder().decode(noiDung.slice(0, 120)).replace(/\s+/g, " ");
      console.log(`   - ${ten}  (${noiDung.length} byte)`);
      console.log(`     120 ký tự đầu: ${dauFile}`);
    }
    // Bản thể hiện HTML tham chiếu tài nguyên nào? Quyết định được có tách dùng chung
    // 3 file tĩnh (jQuery + 2 ảnh) ra khỏi từng hóa đơn hay không — xem §4.7.
    const html = files["invoice.html"];
    if (html) {
      const s = new TextDecoder().decode(html);
      const refs = new Set();
      for (const m of s.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)) refs.add(m[1]);
      for (const m of s.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) refs.add(m[1]);
      console.log(`  → invoice.html tham chiếu ${refs.size} tài nguyên ngoài:`);
      for (const r of refs) console.log(`     • ${r.length > 90 ? `${r.slice(0, 90)}…` : r}`);
      console.log(
        `  → invoice.html có nhúng base64 không: ${/data:image\//.test(s) ? "CÓ" : "KHÔNG"}`,
      );
    }
  } else {
    // Không phải ZIP ⇒ nhiều khả năng là JSON lỗi. In nguyên văn (không chứa tiền).
    console.log(`  Không phải ZIP. Thân phản hồi: ${new TextDecoder().decode(buf.slice(0, 600))}`);
  }
}

await client.end();

#!/usr/bin/env node
/**
 * U37 / Bước R-a — ĐO cờ `hsgoc` trong `raw_json`. CHỈ ĐỌC (SELECT), không ghi gì.
 *
 * Vì sao cần: cổng GDT chặn đường tải hóa đơn gốc bằng đúng một điều kiện —
 *   `const { hsgoc } = selectedRow; if (!hsgoc) return error("Không tồn tại hồ sơ gốc");`
 * (bundle `1121-a47aace172e5b7dc.js` của hoadondientu.gdt.gov.vn, lưu trong
 * docs/doi_chieu_data/). Trước khi thiết kế U37 phải biết dữ liệu đã đồng bộ của ta
 * có mang cờ đó không, và bao nhiêu phần trăm hóa đơn có.
 *
 * KHÔNG in giá trị hóa đơn, KHÔNG in MST, KHÔNG in token — chỉ số đếm và tên khóa.
 *
 * Cách chạy:
 *   node scripts/do-hsgoc-u37.mjs
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
  console.error("Không đọc được DATABASE_URL (env hoặc packages/db/.dev.vars)");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

function inBang(ten, rows) {
  console.log(`\n### ${ten}`);
  if (rows.length === 0) {
    console.log("(0 dòng)");
    return;
  }
  console.table(rows);
}

const tong = await client.query("SELECT count(*)::int AS tong_hoa_don FROM hoa_don");
inBang("Tổng số hóa đơn", tong.rows);

const theoChieu = await client.query(`
  SELECT chieu, nguon,
         count(*)::int                                  AS tong,
         count(*) FILTER (WHERE raw_json ? 'hsgoc')::int AS co_khoa_hsgoc,
         count(*) FILTER (WHERE (raw_json->>'hsgoc') IS NOT NULL
                            AND (raw_json->>'hsgoc') <> ''
                            AND lower(raw_json->>'hsgoc') NOT IN ('false','0','null'))::int
           AS hsgoc_that
  FROM hoa_don
  GROUP BY chieu, nguon
  ORDER BY chieu, nguon
`);
inBang("Cờ hsgoc theo chieu × nguon", theoChieu.rows);

const giaTri = await client.query(`
  SELECT jsonb_typeof(raw_json->'hsgoc') AS kieu,
         left(raw_json->>'hsgoc', 40)    AS gia_tri,
         count(*)::int                   AS so_luong
  FROM hoa_don
  WHERE raw_json ? 'hsgoc'
  GROUP BY 1, 2
  ORDER BY so_luong DESC
  LIMIT 15
`);
inBang("Các giá trị hsgoc gặp được", giaTri.rows);

// Điều tra dân số khóa cấp 1 của raw_json — phục vụ U38 (dựng bản thể hiện từ XML/dữ liệu)
const khoa = await client.query(`
  SELECT k AS khoa, count(*)::int AS so_hoa_don
  FROM hoa_don, LATERAL jsonb_object_keys(raw_json) AS k
  GROUP BY k
  ORDER BY so_hoa_don DESC
`);
console.log(`\n### Khóa cấp 1 trong raw_json (${khoa.rows.length} khóa)`);
console.log(khoa.rows.map((r) => `${r.khoa}=${r.so_hoa_don}`).join("  "));

await client.end();

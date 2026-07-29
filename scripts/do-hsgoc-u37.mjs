#!/usr/bin/env node
/**
 * U37 — CÁC PHÉP ĐO cho kế hoạch. CHỈ ĐỌC (SELECT), không ghi gì.
 *
 * Gồm: (R-a) cờ `hsgoc` trong `raw_json`; điều tra khóa `raw_json`; và (2026-07-29) quy mô
 * MỘT LẦN XUẤT theo nhu cầu thật — một khách hàng × một tháng — cùng độ sạch dữ liệu tên/MST
 * để thiết kế live search chọn khách hàng ở U37b.
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

// ── Quy mô MỘT LẦN XUẤT (U37b) ───────────────────────────────────────────────
// Một lần bấm "Xuất hóa đơn" = một tenant × một kỳ × (một hoặc hai chiều). Con số
// này quyết định hạ tầng hàng đợi hiện tại có đủ cho U37b hay không: ngân sách đẩy
// lùi mỗi message là FANOUT_MAX_BACKPRESSURE(10) × FANOUT_BACKPRESSURE_DELAY_SEC(180)
// = 30 phút, nhịp phát phiếu 2/giây ⇒ phục vụ được ~3.600 hóa đơn MỚI mỗi lần xuất.
const quyMo = await client.query(`
  SELECT to_char(tdlap AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM') AS ky,
         count(*)::int                                              AS ca_hai_chieu,
         count(*) FILTER (WHERE chieu = 'purchase')::int            AS mua_vao,
         count(*) FILTER (WHERE chieu = 'sold')::int                AS ban_ra
  FROM hoa_don
  GROUP BY tenant_id, 1
  ORDER BY ca_hai_chieu DESC
  LIMIT 8
`);
inBang("Kỳ NẶNG NHẤT của một tenant (= một lần bấm Xuất hóa đơn)", quyMo.rows);

// Quy mô THẬT theo nhu cầu khách nêu 2026-07-29: "tải hóa đơn ĐÃ XUẤT cho MỘT khách
// hàng cụ thể trong tháng" ⇒ một lần xuất = tenant × tháng × chieu='sold' × MỘT nmmst.
const quyMoThat = await client.query(`
  SELECT so_hd, count(*)::int AS so_lan_xuat_co_quy_mo_nay
  FROM (
    SELECT count(*)::int AS so_hd
    FROM hoa_don
    WHERE chieu = 'sold' AND nmmst IS NOT NULL AND nmmst <> ''
    GROUP BY tenant_id, to_char(tdlap AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM'), nmmst
  ) t
  GROUP BY so_hd ORDER BY so_hd DESC LIMIT 10
`);
inBang("Số hóa đơn MỖI LẦN XUẤT (tenant × tháng × 1 người mua) — lớn nhất trước", quyMoThat.rows);

const thongKe = await client.query(`
  SELECT max(so_hd)::int AS lon_nhat,
         round(avg(so_hd), 1)                                          AS trung_binh,
         percentile_cont(0.95) WITHIN GROUP (ORDER BY so_hd)           AS p95,
         count(*)::int                                                 AS tong_so_lan_xuat_kha_di
  FROM (
    SELECT count(*)::int AS so_hd
    FROM hoa_don
    WHERE chieu = 'sold' AND nmmst IS NOT NULL AND nmmst <> ''
    GROUP BY tenant_id, to_char(tdlap AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM'), nmmst
  ) t
`);
inBang("Thống kê quy mô một lần xuất", thongKe.rows);

// U37b — "tìm live theo tên/MST khách hàng, phải đảm bảo chính xác". Hai rủi ro cần đo:
// (1) bao nhiêu hóa đơn bán ra KHÔNG có MST người mua (khách lẻ dùng CCCD) — nhóm này
//     sẽ không bao giờ xuất được nếu bắt buộc chọn MST;
// (2) một MST có bao nhiêu cách viết tên khác nhau — quyết định danh sách gợi ý có bị
//     trùng lặp gây chọn nhầm hay không.
const coMst = await client.query(`
  SELECT count(*) FILTER (WHERE nmmst IS NOT NULL AND nmmst <> '')::int AS co_mst,
         count(*) FILTER (WHERE nmmst IS NULL OR nmmst = '')::int       AS khong_co_mst,
         count(*)::int                                                   AS tong
  FROM hoa_don WHERE chieu = 'sold'
`);
inBang("Hóa đơn BÁN RA — có/không có MST người mua", coMst.rows);

const lechTen = await client.query(`
  SELECT so_cach_viet_ten, count(*)::int AS so_mst
  FROM (
    SELECT nmmst, count(DISTINCT nmten)::int AS so_cach_viet_ten
    FROM hoa_don
    WHERE chieu = 'sold' AND nmmst IS NOT NULL AND nmmst <> ''
    GROUP BY tenant_id, nmmst
  ) t
  GROUP BY so_cach_viet_ten ORDER BY so_cach_viet_ten DESC LIMIT 6
`);
inBang("MỘT mã số thuế được viết bằng bao nhiêu kiểu tên khác nhau", lechTen.rows);

// Soi 2 MST bị đếm "0 cách viết tên": cột nmten của TA rỗng — nhưng raw_json (phản hồi
// nguyên bản của GDT) có tên không? Có ⇒ lỗi ánh xạ phía ta, không phải hóa đơn thiếu tên.
const soiTenRong = await client.query(`
  SELECT left(nmmst, 4) || '****'                       AS mst_che,
         nmten IS NULL                                  AS cot_nmten_null,
         coalesce(nmten, '') = ''                       AS cot_nmten_rong,
         (raw_json ? 'nmten')                           AS raw_co_khoa_nmten,
         coalesce(length(raw_json->>'nmten'), -1)       AS do_dai_ten_trong_raw,
         nguon, count(*)::int                           AS so_hd
  FROM hoa_don
  WHERE chieu = 'sold' AND nmmst IS NOT NULL AND nmmst <> '' AND coalesce(nmten, '') = ''
  GROUP BY 1,2,3,4,5,6 ORDER BY so_hd DESC LIMIT 10
`);
inBang("Hóa đơn có MST nhưng cột nmten RỖNG — GDT có trả tên không?", soiTenRong.rows);

// Danh sách gợi ý của live search U37b = khách hàng có ĐỦ cả MST lẫn tên. Đếm chính xác
// để biết quy mô danh sách (quyết định lọc trên máy khách hay phải phân trang server).
const khachHang = await client.query(`
  SELECT count(*)::int                                        AS khach_hien_trong_goi_y,
         count(*) FILTER (WHERE mst LIKE '8%')::int            AS trong_do_mst_bat_dau_bang_8,
         sum(so_hd)::int                                       AS tong_hd_xuat_duoc
  FROM (
    SELECT nmmst AS mst, count(*)::int AS so_hd
    FROM hoa_don
    WHERE chieu = 'sold' AND coalesce(nmmst,'') <> '' AND coalesce(nmten,'') <> ''
    GROUP BY tenant_id, nmmst
  ) t
`);
inBang("Khách hàng sẽ hiện trong live search (có ĐỦ MST + tên)", khachHang.rows);

await client.end();

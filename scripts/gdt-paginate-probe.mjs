// Probe CÓ ĐO ĐẠC tính ổn định phân trang con trỏ `state` của GDT khi sort MỘT
// trường (`tdlap:desc`) trên tenant có >50 HĐ/kỳ (nhiều trang, nhiều HĐ trùng tdlap).
//
// MỤC ĐÍCH (bằng chứng cho comment CHƯA KIỂM CHỨNG ở packages/gdt-client/src/query.ts):
// `queryInvoices` khử trùng bằng khóa tự nhiên → nếu con trỏ LẶP hóa đơn thì bị nuốt
// im lặng (an toàn), nhưng nếu con trỏ BỎ SÓT thì MẤT dữ liệu âm thầm. Cách duy nhất
// phát hiện mất: so số HĐ distinct thu được với `total` GDT trả. `queryInvoices` vứt bỏ
// `total`, nên probe này TỰ phân trang có đo đạc (ghi total/datas/state từng trang).
//
// XÁC NHẬN CƠ CHẾ (2026-07-25): nghi ngờ con trỏ bỏ sót ở RANH GIỚI TRANG khi trang cắt
// ngang cụm HĐ CÙNG NGÀY (tdlap phân giải theo ngày). Hai bằng chứng probe đưa ra:
//   1) distinct < total ở truy vấn CẢ THÁNG (mất dữ liệu thật).
//   2) `--sweep=daily`: quét TỪNG NGÀY rồi cộng lại — nếu tổng distinct theo ngày > distinct
//      cả tháng (tiến sát total) thì CHÍNH cửa sổ tháng cắt ngang cụm là thủ phạm, và thu
//      hẹp cửa sổ là hướng vá đúng.
//
// KHÔNG phải đường production. Chỉ là công cụ probe/chẩn đoán (cùng loại spikes/).
// Tái dùng hằng số URL TỪ package (nguồn chân lý duy nhất — gdt-adapter.md);
// KHÔNG in token, KHÔNG ghi giá trị hóa đơn nhạy cảm, CHỈ đọc (không ghi DB).
//
// CHẠY — hai cách lấy token:
//  (A) Token từ DB local (đã đăng nhập qua scripts/gdt-login.cjs):
//      node scripts/gdt-paginate-probe.mjs --mst=<MST> --from=01/06/2026 --to=30/06/2026 --kind=sco
//  (B) Token trực tiếp qua biến môi trường (khỏi cần DB local) — BẠN tự lấy JWT sau khi
//      đăng nhập, KHÔNG dán vào chat:
//      GDT_TOKEN='<jwt>' node scripts/gdt-paginate-probe.mjs --token-env=GDT_TOKEN \
//        --from=01/06/2026 --to=30/06/2026 --kind=sco --sweep=daily
// Tuỳ chọn: --direction=purchase|sold (mặc định purchase), --kind=normal|sco (mặc định
//   normal), --size=50, --sweep=daily, --tenant-mst=9999999999 (tenant test gdt-login.cjs).
//
// Node ≥22.18 tự strip type khi import .ts; nếu bản cũ hơn: thêm --experimental-strip-types.

import fs from "node:fs";
import path from "node:path";
import { BASE, INVOICE_ENDPOINTS } from "../packages/gdt-client/src/endpoints.ts";

const REPO = path.resolve(import.meta.dirname, "..");

// --- Tham số dòng lệnh -------------------------------------------------------
function arg(name, def) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
}
const MST = arg("mst");
const FROM = arg("from");
const TO = arg("to");
const DIRECTION = arg("direction", "purchase");
const KIND = arg("kind", "normal"); // normal | sco
const SIZE = Number(arg("size", "50"));
const SWEEP = arg("sweep"); // "daily" → quét từng ngày để đối chứng cơ chế
const TOKEN_ENV = arg("token-env"); // tên biến môi trường chứa JWT (đường B)
const TENANT_MST = arg("tenant-mst", "9999999999");
const MAX_PAGES = 2000; // trần chống lặp vô hạn (khớp query.ts)

if (!FROM || !TO || (!TOKEN_ENV && !MST)) {
  console.error(
    "Thiếu tham số. Ví dụ:\n" +
      "  node scripts/gdt-paginate-probe.mjs --mst=0101243150 --from=01/06/2026 --to=30/06/2026 --kind=sco\n" +
      "  GDT_TOKEN='<jwt>' node scripts/gdt-paginate-probe.mjs --token-env=GDT_TOKEN --from=01/06/2026 --to=30/06/2026 --kind=sco --sweep=daily\n" +
      "Tuỳ chọn: --direction=purchase|sold --kind=normal|sco --size=50 --sweep=daily",
  );
  process.exit(2);
}
if (!/^\d{2}\/\d{2}\/\d{4}$/.test(FROM) || !/^\d{2}\/\d{2}\/\d{4}$/.test(TO)) {
  console.error("--from/--to phải định dạng dd/mm/yyyy.");
  process.exit(2);
}

const endpointKey =
  KIND === "sco" ? (DIRECTION === "purchase" ? "scoPurchase" : "scoSold") : DIRECTION;
const endpoint = INVOICE_ENDPOINTS[endpointKey];
if (!endpoint) {
  console.error(`Không xác định endpoint cho direction=${DIRECTION} kind=${KIND}.`);
  process.exit(2);
}

function readDevVar(relFile, key) {
  const p = path.join(REPO, relFile);
  const t = fs.readFileSync(p, "utf8");
  const m = t.match(new RegExp(`^${key}=(.+)$`, "m"));
  if (!m) throw new Error(`Không thấy ${key} trong ${relFile}`);
  return m[1].trim();
}

// --- RSQL search: BẢN SAO của buildSearch (query.ts) cho probe (không lọc ttxly). --
function buildSearch(dateFrom, dateTo) {
  return `tdlap=ge=${dateFrom}T00:00:00;tdlap=le=${dateTo}T23:59:59`;
}
// --- Khóa tự nhiên: BẢN SAO của naturalKey (query.ts) ------------------------
function naturalKey(row) {
  return [row.nbmst, row.khmshdon, row.khhdon, row.shdon, row.tdlap]
    .map((v) => String(v ?? ""))
    .join("|");
}
// dd/mm/yyyy → Date UTC (để lặp ngày)
function ddmmToDate(s) {
  const [d, m, y] = s.split("/").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function dateToDdmm(dt) {
  return `${String(dt.getUTCDate()).padStart(2, "0")}/${String(dt.getUTCMonth() + 1).padStart(2, "0")}/${dt.getUTCFullYear()}`;
}

// --- Lấy token: đường B (env) hoặc đường A (DB local qua gdt-login.cjs) -------
async function getToken() {
  if (TOKEN_ENV) {
    const tk = process.env[TOKEN_ENV];
    if (!tk) throw new Error(`Biến môi trường ${TOKEN_ENV} rỗng. Đặt token JWT vào đó.`);
    return { token: tk.trim(), tokenHetHan: null };
  }
  // Đường A: đọc token đã mã hoá từ DB local (import động để đường B không cần pg/crypto).
  const pg = (await import("pg")).default;
  const { openSecret } = await import("../packages/crypto/src/envelope.ts");
  const DATABASE_URL = readDevVar("packages/db/.dev.vars", "DATABASE_URL");
  const TOKEN_KEK = readDevVar("packages/db/.dev.vars", "TOKEN_KEK");
  const c = new pg.Client({ connectionString: DATABASE_URL });
  await c.connect();
  try {
    const tRow = (await c.query("select id from tenants where mst=$1", [TENANT_MST])).rows[0];
    if (!tRow)
      throw new Error(`Không thấy tenant test mst=${TENANT_MST}. Chạy gdt-login.cjs trước.`);
    const acc = (
      await c.query(
        "select token_hien_tai, token_het_han from tai_khoan_thue where tenant_id=$1 and username=$2",
        [tRow.id, MST],
      )
    ).rows[0];
    if (!acc?.token_hien_tai)
      throw new Error(`Tài khoản MST=${MST} chưa có token. Chạy gdt-login.cjs.`);
    return {
      token: await openSecret(acc.token_hien_tai, TOKEN_KEK),
      tokenHetHan: acc.token_het_han ? new Date(acc.token_het_han) : null,
    };
  } finally {
    await c.end();
  }
}

// --- Vòng phân trang CÓ ĐO ĐẠC cho MỘT khoảng ngày --------------------------
async function paginate(token, dateFrom, dateTo, { verbose = false } = {}) {
  const search = buildSearch(dateFrom, dateTo);
  const keyCount = new Map();
  const totals = new Set();
  const pageRows = [];
  let state;
  let page = 0;
  let collected = 0;
  let truncated = false;

  while (true) {
    if (page >= MAX_PAGES) {
      truncated = true;
      break;
    }
    page += 1;
    if (page > 1) await new Promise((r) => setTimeout(r, 300)); // tôn trọng máy chủ thuế

    const q = new URLSearchParams({ sort: "tdlap:desc", size: String(SIZE), search });
    if (state) q.set("state", state);
    const res = await fetch(`${BASE}${endpoint}?${q.toString()}`, {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    });
    if (res.status === 401) throw new Error("HTTP 401 — phiên hết hạn. Đăng nhập lại.");
    if (!res.ok) {
      const body = (await res.text()).replace(/\s+/g, " ").slice(0, 300);
      throw new Error(`Trang ${page}: HTTP ${res.status}. GDT: ${body}`);
    }
    const data = await res.json();
    const datas = Array.isArray(data.datas) ? data.datas : [];
    if (data.total !== undefined && data.total !== null) totals.add(Number(data.total));

    let dup = 0;
    let tdMin = null;
    let tdMax = null;
    for (const row of datas) {
      const k = naturalKey(row);
      const prev = keyCount.get(k) ?? 0;
      keyCount.set(k, prev + 1);
      if (prev > 0) dup += 1;
      const td = String(row.tdlap ?? "");
      if (tdMin === null || td < tdMin) tdMin = td;
      if (tdMax === null || td > tdMax) tdMax = td;
    }
    collected += datas.length;
    const nextState = typeof data.state === "string" ? data.state : undefined;
    if (verbose)
      pageRows.push({
        trang: page,
        dòng: datas.length,
        total: data.total ?? "—",
        trùng: dup,
        state: nextState ? "có" : "hết",
        // biên tdlap của trang: nếu trang kết thúc GIỮA một ngày (tdMin===tdMax cụm lớn)
        // và trang sau bắt đầu ở ngày CŨ HƠN → dấu hiệu bỏ phần còn lại của ngày.
        tdlapĐầu: (tdMax ?? "").slice(0, 10),
        tdlapCuối: (tdMin ?? "").slice(0, 10),
      });
    state = nextState;
    if (datas.length < SIZE || !state) break;
  }
  return {
    pages: page,
    collected,
    distinct: keyCount.size,
    dupCrossPage: collected - keyCount.size,
    total: totals.size === 1 ? [...totals][0] : null,
    totalsRaw: [...totals],
    truncated,
    pageRows,
    keys: keyCount,
  };
}

async function main() {
  const { token, tokenHetHan } = await getToken();
  if (tokenHetHan && tokenHetHan.getTime() < Date.now())
    console.warn(`⚠ Token đã hết hạn (${tokenHetHan.toISOString()}). GDT có thể trả 401.`);

  console.log("\n=== PROBE phân trang GDT (sort=tdlap:desc) ===");
  console.log(`endpoint : ${endpoint}  (${DIRECTION}/${KIND})`);
  console.log(`kỳ       : ${FROM} → ${TO}   size=${SIZE}`);

  // 1) Truy vấn CẢ THÁNG (như production).
  const month = await paginate(token, FROM, TO, { verbose: true });
  console.table(month.pageRows);
  console.log("--- CẢ THÁNG ---");
  console.log(
    `Trang: ${month.pages}${month.truncated ? " (CHẠM TRẦN!)" : ""} | dòng thô: ${month.collected} | distinct: ${month.distinct} | trùng chéo trang: ${month.dupCrossPage}`,
  );
  console.log(
    `GDT total: ${month.total ?? `KHÔNG ỔN ĐỊNH (${month.totalsRaw.join(",") || "trống"})`}`,
  );
  if (month.total !== null) {
    const thiếu = month.total - month.distinct;
    console.log(
      thiếu > 0
        ? `\n✗ MẤT DỮ LIỆU: distinct (${month.distinct}) < total (${month.total}) → con trỏ BỎ SÓT ${thiếu} HĐ ở ranh giới trang (HĐ trùng tdlap).`
        : `\n✓ distinct (${month.distinct}) === total (${month.total}) — cả tháng không mất.`,
    );
  }

  // 2) (tuỳ chọn) QUÉT TỪNG NGÀY — đối chứng cơ chế + hướng vá.
  if (SWEEP === "daily") {
    console.log("\n=== QUÉT TỪNG NGÀY (đối chứng cơ chế cắt-ngang-cụm) ===");
    const start = ddmmToDate(FROM);
    const end = ddmmToDate(TO);
    const unionKeys = new Set();
    let sumTotals = 0;
    let daysWithTotal = 0;
    const worstDays = [];
    for (
      let dt = new Date(start);
      dt.getTime() <= end.getTime();
      dt = new Date(dt.getTime() + 86400000)
    ) {
      const d = dateToDdmm(dt);
      const r = await paginate(token, d, d, {});
      for (const k of r.keys.keys()) unionKeys.add(k);
      if (r.total !== null) {
        sumTotals += r.total;
        daysWithTotal += 1;
      }
      const miss = r.total !== null ? r.total - r.distinct : 0;
      if (miss > 0)
        worstDays.push(
          `${d}: distinct ${r.distinct}/total ${r.total} (thiếu ${miss}, ${r.pages} trang)`,
        );
    }
    console.log(`Tổng distinct HỢP theo ngày : ${unionKeys.size}`);
    console.log(`Tổng 'total' cộng theo ngày : ${daysWithTotal ? sumTotals : "—"}`);
    console.log(
      `So với CẢ THÁNG distinct    : ${month.distinct}  → chênh ${unionKeys.size - month.distinct}`,
    );
    if (worstDays.length) {
      console.log(
        "\nNgày CÒN thiếu ngay cả khi quét riêng (nếu >50 HĐ/ngày vẫn bị cắt trong nội bộ ngày):",
      );
      for (const w of worstDays.slice(0, 15)) console.log(`   • ${w}`);
    }
    console.log("\n--- PHÁN QUYẾT CƠ CHẾ ---");
    if (unionKeys.size > month.distinct)
      console.log(
        `✓ Quét theo NGÀY lấy thêm ${unionKeys.size - month.distinct} HĐ so với cả tháng → cửa sổ THÁNG cắt ngang cụm cùng-ngày CHÍNH là thủ phạm. Hướng vá: thu hẹp cửa sổ (theo ngày) + đối chiếu 'total'.`,
      );
    else
      console.log(
        "= Quét theo ngày KHÔNG lấy thêm → cơ chế mất KHÔNG phải do cửa sổ tháng; xem lại (con trỏ bỏ sót nội-bộ-ngày, hoặc trần subrequest).",
      );
    if (worstDays.length)
      console.log(
        `  Lưu ý: vẫn còn ngày thiếu khi quét riêng → những ngày >50 HĐ vẫn bị cắt TRONG NGÀY; cần thêm đối chiếu 'total' để chốt đủ (không chỉ thu hẹp cửa sổ).`,
      );
  }
  console.log("");
}

main().catch((e) => {
  console.error("\nLỖI:", e.message);
  process.exit(1);
});

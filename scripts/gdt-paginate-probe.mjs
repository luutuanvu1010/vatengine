// Probe CÓ ĐO ĐẠC tính ổn định phân trang con trỏ `state` của GDT khi sort MỘT
// trường (`tdlap:desc`) trên tenant có >50 HĐ/kỳ (nhiều trang, nhiều HĐ trùng tdlap).
//
// MỤC ĐÍCH (bằng chứng cho comment CHƯA KIỂM CHỨNG ở packages/gdt-client/src/query.ts):
// `queryInvoices` khử trùng bằng khóa tự nhiên → nếu con trỏ LẶP hóa đơn thì bị nuốt
// im lặng (an toàn), nhưng nếu con trỏ BỎ SÓT thì MẤT dữ liệu âm thầm. Cách duy nhất
// phát hiện mất: so số HĐ distinct thu được với `total` GDT trả. `queryInvoices` vứt bỏ
// `total`, nên probe này TỰ phân trang có đo đạc (ghi total/datas/state từng trang).
//
// KHÔNG phải đường production. Chỉ là công cụ probe/chẩn đoán (cùng loại spikes/).
// Tái dùng hằng số URL + openSecret TỪ package (nguồn chân lý duy nhất — gdt-adapter.md);
// KHÔNG in token, KHÔNG ghi giá trị hóa đơn, CHỈ đọc (không ghi DB).
//
// Chạy (từ bản chính repo, sau khi đã đăng nhập GDT qua scripts/gdt-login.cjs):
//   node scripts/gdt-paginate-probe.mjs --mst=<MST> --from=01/06/2026 --to=30/06/2026
// Tuỳ chọn: --direction=purchase|sold (mặc định purchase), --kind=normal|sco (mặc định
//   normal), --size=50, --tenant-mst=9999999999 (tenant test của gdt-login.cjs).
//
// Node ≥22.18 tự strip type khi import .ts; nếu bản cũ hơn: thêm --experimental-strip-types.

import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { openSecret } from "../packages/crypto/src/envelope.ts";
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
const TENANT_MST = arg("tenant-mst", "9999999999");
const MAX_PAGES = 2000; // trần chống lặp vô hạn (khớp query.ts)

if (!MST || !FROM || !TO) {
  console.error(
    "Thiếu tham số. Ví dụ:\n  node scripts/gdt-paginate-probe.mjs --mst=0101243150 --from=01/06/2026 --to=30/06/2026\n" +
      "Tuỳ chọn: --direction=purchase|sold --kind=normal|sco --size=50",
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

// --- Đọc bí mật cục bộ (như gdt-login.cjs) -----------------------------------
function readDevVar(relFile, key) {
  const p = path.join(REPO, relFile);
  const t = fs.readFileSync(p, "utf8");
  const m = t.match(new RegExp(`^${key}=(.+)$`, "m"));
  if (!m) throw new Error(`Không thấy ${key} trong ${relFile}`);
  return m[1].trim();
}

// --- RSQL search: BẢN SAO của buildSearch (query.ts) cho probe (không lọc ttxly). --
// Giữ đồng bộ thủ công với query.ts:buildSearch; probe không import query.ts vì chuỗi
// import extensionless của nó không strip-type được ngoài bundler.
function buildSearch(dateFrom, dateTo) {
  return `tdlap=ge=${dateFrom}T00:00:00;tdlap=le=${dateTo}T23:59:59`;
}

// --- Khóa tự nhiên: BẢN SAO của naturalKey (query.ts) ------------------------
function naturalKey(row) {
  return [row.nbmst, row.khmshdon, row.khhdon, row.shdon, row.tdlap]
    .map((v) => String(v ?? ""))
    .join("|");
}

async function main() {
  const DATABASE_URL = readDevVar("packages/db/.dev.vars", "DATABASE_URL");
  const TOKEN_KEK = readDevVar("packages/db/.dev.vars", "TOKEN_KEK");

  // 1) Đọc + giải mã token của (tenant test, username=MST). KHÔNG in token.
  const c = new pg.Client({ connectionString: DATABASE_URL });
  await c.connect();
  let token;
  let tokenHetHan;
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
    if (!acc)
      throw new Error(`Không thấy tài khoản thuế MST=${MST} (tenant test). Đăng nhập trước.`);
    if (!acc.token_hien_tai)
      throw new Error(`Tài khoản MST=${MST} chưa có token (chưa đăng nhập). Chạy gdt-login.cjs.`);
    token = await openSecret(acc.token_hien_tai, TOKEN_KEK);
    tokenHetHan = acc.token_het_han ? new Date(acc.token_het_han) : null;
  } finally {
    await c.end();
  }
  if (tokenHetHan && tokenHetHan.getTime() < Date.now()) {
    console.warn(
      `⚠ Token đã hết hạn (${tokenHetHan.toISOString()}). GDT có thể trả 401 — đăng nhập lại nếu cần.`,
    );
  }

  const search = buildSearch(FROM, TO);
  console.log("\n=== PROBE phân trang GDT (sort=tdlap:desc) ===");
  console.log(`endpoint : ${endpoint}  (${DIRECTION}/${KIND})`);
  console.log(`kỳ       : ${FROM} → ${TO}   size=${SIZE}`);
  console.log(`token exp : ${tokenHetHan ? tokenHetHan.toISOString() : "(không rõ)"}`);
  console.log("");

  // 2) Vòng phân trang CÓ ĐO ĐẠC.
  const keyCount = new Map(); // key -> số lần xuất hiện (đếm trùng chéo trang)
  const firstSeenPage = new Map(); // key -> trang đầu tiên thấy
  const totals = new Set(); // các giá trị `total` GDT trả (kỳ vọng ổn định 1 giá trị)
  let state;
  let page = 0;
  let collected = 0;
  let truncated = false;
  const pageRows = [];

  while (true) {
    if (page >= MAX_PAGES) {
      truncated = true;
      break;
    }
    page += 1;

    // Nghỉ ngắn giữa các trang — tôn trọng máy chủ thuế (CLAUDE.md), tránh 429 khi kéo
    // nhiều trang. Không phải đường production (production dùng rate-limit ở Durable Object).
    if (page > 1) await new Promise((r) => setTimeout(r, 300));

    const q = new URLSearchParams({ sort: "tdlap:desc", size: String(SIZE), search });
    if (state) q.set("state", state);
    const url = `${BASE}${endpoint}?${q.toString()}`;

    const res = await fetch(url, {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      console.error("\n✗ HTTP 401 — phiên hết hạn. Đăng nhập lại (gdt-login.cjs) rồi chạy lại.");
      process.exit(1);
    }
    if (!res.ok) {
      const body = (await res.text()).replace(/\s+/g, " ").slice(0, 300);
      console.error(`\n✗ Trang ${page}: HTTP ${res.status}. GDT: ${body}`);
      process.exit(1);
    }
    const data = await res.json();
    const datas = Array.isArray(data.datas) ? data.datas : [];
    const total = data.total;
    if (total !== undefined && total !== null) totals.add(Number(total));

    let dupOnPrevPages = 0;
    for (const row of datas) {
      const k = naturalKey(row);
      const prev = keyCount.get(k) ?? 0;
      keyCount.set(k, prev + 1);
      if (prev === 0) firstSeenPage.set(k, page);
      else dupOnPrevPages += 1;
    }
    collected += datas.length;

    const nextState = typeof data.state === "string" ? data.state : undefined;
    pageRows.push({
      page,
      rows: datas.length,
      total: total ?? "—",
      dupTrùng: dupOnPrevPages,
      hasState: nextState ? "có" : "hết",
    });

    state = nextState;
    if (datas.length < SIZE || !state) break;
  }

  // 3) Báo cáo.
  console.table(pageRows);

  const distinct = keyCount.size;
  const dupCrossPage = collected - distinct;
  const totalReported = totals.size === 1 ? [...totals][0] : null;

  console.log("\n--- TỔNG HỢP ---");
  console.log(`Số trang kéo         : ${page}${truncated ? " (CHẠM TRẦN — chưa hết!)" : ""}`);
  console.log(`Tổng dòng thu (raw)  : ${collected}`);
  console.log(`Số HĐ distinct       : ${distinct}`);
  console.log(`Trùng chéo trang     : ${dupCrossPage}`);
  console.log(
    `GDT total báo        : ${totalReported ?? `KHÔNG ỔN ĐỊNH (${[...totals].join(", ") || "trống"})`}`,
  );

  // 4) Phán quyết.
  console.log("\n--- PHÁN QUYẾT ---");
  const problems = [];
  if (page <= 1) {
    problems.push(
      "CHỈ 1 TRANG — kỳ này KHÔNG kích hoạt điều kiện nhiều trang. Chọn kỳ có >50 HĐ để có ý nghĩa.",
    );
  }
  if (truncated)
    problems.push("Chạm trần MAX_PAGES — con trỏ state không dừng; nghi ngờ vòng lặp.");
  if (totalReported === null && totals.size > 1)
    problems.push(`GDT trả 'total' thay đổi giữa các trang: ${[...totals].join(", ")}.`);
  if (totalReported !== null && distinct < totalReported)
    problems.push(
      `MẤT DỮ LIỆU: distinct (${distinct}) < total GDT (${totalReported}). ` +
        `Thiếu ${totalReported - distinct} HĐ → con trỏ state BỎ SÓT khi có HĐ trùng tdlap.`,
    );
  if (totalReported !== null && distinct > totalReported)
    problems.push(
      `distinct (${distinct}) > total GDT (${totalReported}) — bất thường (total có thể không phải tổng của endpoint này).`,
    );
  if (dupCrossPage > 0)
    problems.push(
      `Con trỏ LẶP ${dupCrossPage} HĐ giữa các trang (production dedup nuốt được, nhưng là dấu hiệu cursor không ổn định).`,
    );

  if (problems.length === 0 && page > 1 && totalReported !== null && distinct === totalReported) {
    console.log(
      `✅ ỔN ĐỊNH: ${page} trang, distinct (${distinct}) === total GDT (${totalReported}), 0 trùng chéo trang.\n   → con trỏ state có tie-breaker ẩn đủ tin cậy khi HĐ trùng tdlap. Cập nhật comment query.ts:50.`,
    );
  } else {
    console.log("⚠ CẦN CHÚ Ý:");
    for (const p of problems) console.log(`   • ${p}`);
    if (totalReported !== null && distinct < totalReported) {
      console.log(
        "\n   Bước tiếp theo (nếu MẤT dữ liệu): thử tie-breaker — sort=tdlap:desc,shdon:desc bị 500;\n" +
          "   dò tham số cursor khác GDT hỗ trợ, hoặc chuyển chiến lược quét theo ngày (mỗi ngày 1 truy vấn).",
      );
    }
  }
  console.log("");
}

main().catch((e) => {
  console.error("\nLỖI:", e.message);
  process.exit(1);
});

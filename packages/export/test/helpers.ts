// Tiện ích test cho @vat/export (U7). Gồm: (1) reader xlsx tự viết bằng fflate.unzipSync
// + parse SpreadsheetML để ĐỌC LẠI file kiểm cột + ĐỊNH DẠNG TIỀN (tiêu chí lõi U7);
// (2) parser CSV tối giản; (3) seed PGlite (Postgres WASM, offline) cho test `rows`.
// KHÔNG mạng, KHÔNG dữ liệu thật (testing.md).
import { PGlite } from "@electric-sql/pglite";
import { hoaDon, tenants } from "@vat/db";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { unzipSync } from "fflate";

// ----------------------------- Reader xlsx ----------------------------- //

export interface XlsxCell {
  value: string; // giá trị thô (chuỗi với ô text/số — số giữ nguyên chuỗi, không ép float)
  isNumber: boolean; // true nếu ô kiểu số (<v>), false nếu inline string
  numFmt: string; // mã định dạng số của ô ("" nếu mặc định) — dùng kiểm "#,##0"
}

/** Đọc lại xlsx do toXlsx sinh ra: unzip → parse sheet1 + styles → lưới ô.
 * Chỉ hỗ trợ đúng định dạng encoder này phát ra (inline string + numeric <v> + numFmt). */
export function readXlsx(bytes: Uint8Array): {
  files: string[];
  rows: XlsxCell[][];
} {
  const zip = unzipSync(bytes);
  const dec = new TextDecoder();
  const files = Object.keys(zip);
  const sheet = dec.decode(zip["xl/worksheets/sheet1.xml"]);
  const stylesXml = zip["xl/styles.xml"] ? dec.decode(zip["xl/styles.xml"]) : "";

  // numFmts: numFmtId -> formatCode
  const numFmtById = new Map<string, string>();
  for (const m of stylesXml.matchAll(/<numFmt numFmtId="(\d+)" formatCode="([^"]*)"\/>/g)) {
    numFmtById.set(m[1] as string, m[2] as string);
  }
  // cellXfs: chỉ số xf -> numFmtId (mặc định "0")
  const xfNumFmt: string[] = [];
  const cellXfsBlock = stylesXml.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? "";
  for (const m of cellXfsBlock.matchAll(/<xf\b([^>]*)\/?>/g)) {
    const attrs = m[1] as string;
    xfNumFmt.push(/numFmtId="(\d+)"/.exec(attrs)?.[1] ?? "0");
  }

  const rowsOut: XlsxCell[][] = [];
  for (const rowM of sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const rowXml = rowM[1] as string;
    const cells: XlsxCell[] = [];
    for (const cM of rowXml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cM[1] as string;
      const inner = (cM[2] as string) ?? "";
      const s = /\bs="(\d+)"/.exec(attrs)?.[1] ?? "0";
      const numFmtId = xfNumFmt[Number(s)] ?? "0";
      const numFmt = numFmtById.get(numFmtId) ?? "";
      const isInline = /t="inlineStr"/.test(attrs);
      if (isInline) {
        const t = /<t[^>]*>([\s\S]*?)<\/t>/.exec(inner)?.[1] ?? "";
        cells.push({ value: unescapeXml(t), isNumber: false, numFmt });
      } else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        cells.push({ value: v ?? "", isNumber: v !== undefined, numFmt });
      }
    }
    rowsOut.push(cells);
  }
  return { files, rows: rowsOut };
}

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

// ----------------------------- Parser CSV ------------------------------ //

/** Parse CSV RFC-4180 (dấu phẩy, nháy kép escape đôi, CRLF). Bỏ BOM nếu có. */
export function parseCsv(text: string): string[][] {
  let s = text;
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1); // bỏ BOM
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      field = "";
      row = [];
    } else if (ch === "\r") {
      // bỏ; \n kế tiếp đóng dòng
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export const utf8 = new TextDecoder();

// --------------------------- Seed PGlite (rows) ------------------------ //

const MIGRATIONS = new URL("../../db/migrations", import.meta.url).pathname;

export type Db = ReturnType<typeof drizzle>;

export async function freshDb(): Promise<Db> {
  const db = drizzle(new PGlite());
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

export async function makeTenant(db: Db, ten: string, mst: string): Promise<string> {
  const rows = await db.insert(tenants).values({ ten, mst }).returning({ id: tenants.id });
  const row = rows[0];
  if (!row) throw new Error("insert tenant không trả về id");
  return row.id;
}

type HoaDonInsert = typeof hoaDon.$inferInsert;

export async function seedInvoice(
  db: Db,
  tenantId: string,
  over: Partial<HoaDonInsert> = {},
): Promise<string> {
  const base: HoaDonInsert = {
    tenantId,
    nbmst: "0100000001",
    nbten: "Cty Bán",
    nmmst: "0100000002",
    nmten: "Cty Mua",
    khmshdon: "1",
    khhdon: "C26TAA",
    shdon: "1",
    tdlap: new Date("2026-04-12T09:00:00Z"),
    tgtcthue: "1000000",
    tgtthue: "80000",
    tgtttbso: "1080000",
    ttxly: 8,
    tthai: 1,
    chieu: "purchase",
    nguon: "normal",
    rawJson: {},
  };
  const rows = await db
    .insert(hoaDon)
    .values({ ...base, ...over })
    .returning({ id: hoaDon.id });
  const row = rows[0];
  if (!row) throw new Error("insert hoa_don không trả về id");
  return row.id;
}

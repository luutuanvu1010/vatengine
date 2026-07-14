// Spike (U7): kiểm chứng encoder xlsx của @vat/export chạy trên runtime WORKERD thật —
// KHÔNG chỉ Node/vitest. Nhập CHÍNH `toXlsx` production (fflate.zipSync + TextEncoder),
// sinh file trong Worker, rồi TỰ unzip (fflate.unzipSync + TextDecoder) kiểm cấu trúc +
// numFmt "#,##0". Trả JSON để bên ngoài (curl) khẳng định. Không mạng, không GDT, không DB.
//
// Chạy: `npx wrangler dev --config spikes/xlsx-workers/wrangler.jsonc` rồi
//       `curl http://127.0.0.1:8787`. `ok:true` ⇒ encoder workerd-native (không nodejs_compat).
import type { HoaDonRow } from "@vat/query";
import { unzipSync } from "fflate";
import { toXlsx } from "../../../packages/export/src/xlsx";

function fakeRow(tgtttbso: string | null, shdon: string): HoaDonRow {
  return {
    id: `00000000-0000-0000-0000-0000000000${shdon.padStart(2, "0")}`,
    tenantId: "00000000-0000-0000-0000-0000000000aa",
    nbmst: "0100000001",
    nbten: 'Cty "Bán" <&>',
    nmmst: "0100000002",
    nmten: "Cty Mua",
    khmshdon: "1",
    khhdon: "C26TAA",
    shdon,
    tdlap: new Date("2026-04-12T09:05:03Z"),
    ncnhat: null,
    tgtcthue: "1000000",
    tgtthue: "80000",
    tgtttbso,
    ttcktmai: null,
    dvtte: "VND",
    tgia: null,
    ttxly: 8,
    tthai: 1,
    chieu: "purchase",
    nguon: "normal",
    rawJson: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  } as HoaDonRow;
}

export default {
  async fetch(): Promise<Response> {
    try {
      const bytes = toXlsx([fakeRow("9007199254740993", "1"), fakeRow(null, "2")]);
      const zip = unzipSync(bytes);
      const dec = new TextDecoder();
      const styles = dec.decode(zip["xl/styles.xml"]);
      const sheet = dec.decode(zip["xl/worksheets/sheet1.xml"]);
      const dataRows = [...sheet.matchAll(/<row\b/g)].length - 1;
      const result = {
        runtime: "workerd",
        nodejsCompat: false,
        zipMagicPK: bytes[0] === 0x50 && bytes[1] === 0x4b,
        parts: Object.keys(zip),
        hasMoneyNumFmt: styles.includes('formatCode="#,##0"'),
        keepsBigMoneyExact: sheet.includes("<v>9007199254740993</v>"),
        dataRows,
        ok:
          bytes[0] === 0x50 &&
          styles.includes('formatCode="#,##0"') &&
          sheet.includes("<v>9007199254740993</v>") &&
          dataRows === 2,
      };
      return Response.json(result);
    } catch (e) {
      return Response.json({ ok: false, error: String(e) }, { status: 500 });
    }
  },
};

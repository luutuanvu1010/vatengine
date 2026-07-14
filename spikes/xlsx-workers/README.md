# Spike: encoder xlsx chạy trên runtime Workers (workerd)

**Mục đích.** Cổng kiểm chứng bắt buộc của U7 (xem `docs/plans/U7-plan.md` §"Điểm mơ hồ #2"):
chứng minh encoder xlsx của `@vat/export` (`toXlsx` = `fflate.zipSync` + `TextEncoder`, và
`fflate.unzipSync` + `TextDecoder` khi đọc lại) **chạy thật trên workerd**, không chỉ Node/vitest —
theo nguyên tắc bằng chứng của Hiến pháp (bài học `:30000`: không "chốt" thư viện chỉ vì
tài liệu nói chạy được).

**Điểm mấu chốt:** `wrangler.jsonc` **CỐ Ý KHÔNG bật `nodejs_compat`** → nếu encoder chạy được
thì nó là **workerd-native** (fflate đường `import` không dùng Node builtin; ta chỉ dùng
hàm sync thuần + API chuẩn Web).

## Cách tái chạy

```bash
npx wrangler dev --config spikes/xlsx-workers/wrangler.jsonc --port 8799 --ip 127.0.0.1 &
curl -s http://127.0.0.1:8799
```

Worker nhập **chính** `toXlsx` production, sinh file trong workerd, tự unzip kiểm cấu trúc +
`numFmt "#,##0"` + giữ số tiền lớn chính xác, rồi trả JSON.

## Kết quả đã kiểm chứng (2026-07-14, wrangler 4.110.0)

```json
{"runtime":"workerd","nodejsCompat":false,"zipMagicPK":true,
 "parts":["[Content_Types].xml","_rels/.rels","xl/workbook.xml","xl/_rels/workbook.xml.rels","xl/styles.xml","xl/worksheets/sheet1.xml"],
 "hasMoneyNumFmt":true,"keepsBigMoneyExact":true,"dataRows":2,"ok":true}
```

- `nodejsCompat:false` + `ok:true` ⇒ encoder xlsx **workerd-native**, KHÔNG cần shim Node.
- `hasMoneyNumFmt:true` ⇒ định dạng tiền `#,##0` có trong file (tiêu chí lõi U7).
- `keepsBigMoneyExact:true` ⇒ tiền `9007199254740993` (2^53+1) giữ nguyên, KHÔNG mất qua float.

⇒ **Chốt #2 hợp lệ:** thư viện nhẹ (fflate) + tự dựng SpreadsheetML đạt cổng spike. Phần còn
lại chưa kiểm chứng runtime là **binding R2 thật** — probe khi deploy (như Hyperdrive ở U6).

# U36 — Prompt điều phối tuần tự (3 đơn vị) theo Loop Engineering

> **Một prompt duy nhất** vận hành vòng lặp điều phối (`TRIEN_KHAI_BANG_CLAUDE_CODE.md` mục 5):
> chạy lần lượt ba đơn vị, mỗi đơn vị đi trọn vòng lặp con (spec → test trước → hiện thực → tự
> kiểm chứng → review chéo → commit), giữa các đơn vị chạy **hồi quy toàn bộ** + ghi nhật ký,
> rồi mới sang đơn vị kế. Đặc tả chốt ở `docs/plans/U36-plan.md` (đã qua **2 vòng review chéo
> độc lập**, vá 19 blocker). Bằng chứng nền ở `docs/BANG-CHUNG-ma-trang-thai-hoa-don-2026-07-28.md`.
>
> **Cách dùng:** dán toàn bộ khối mã dưới vào một phiên Claude Code. Có **2 cổng dừng bắt buộc**
> — phiên dừng chờ bạn duyệt trước khi sang đơn vị kế (không chạy hết một mạch).
> Viết theo skill `write-prompt` của dự án.

---

```
NHIỆM VỤ ĐIỀU PHỐI: Thực thi tuần tự 3 đơn vị của U36 — trạng thái hóa đơn trong tổng hợp và kết
xuất. Thứ tự CỐ ĐỊNH: U36.1 (nền tảng bằng chứng) → U36.2 (cột kết xuất) → U36.3 (API summary +
giao diện + tài liệu). BA COMMIT TÁCH BẠCH — không trộn đơn vị.

ĐỌC TRƯỚC KHI BẮT ĐẦU:
- `CLAUDE.md` (Hiến pháp — đặc biệt §Nguyên tắc bằng chứng, §Kiến trúc quy tắc cứng, §Định nghĩa
  hoàn thành, §Khi gặp mơ hồ).
- `TRIEN_KHAI_BANG_CLAUDE_CODE.md` mục 1/4/5/6 (vòng lặp, mẫu prompt, DoD).
- `docs/plans/U36-plan.md` — TOÀN BỘ. Đây là spec chốt, đã vá 19 blocker qua 2 vòng review.
  Đặc biệt §2 (12 quyết định QĐ-1..QĐ-12), §4 (thiết kế theo gói), §5 (22 tiêu chí nghiệm thu),
  §6 (golden test sẽ đỏ và KHÔNG đỏ), §7 (rủi ro).
- `docs/BANG-CHUNG-ma-trang-thai-hoa-don-2026-07-28.md` — nguồn bằng chứng cho ý nghĩa mã `tthai`.
  ĐỌC CẢ §6.5 (đính chính đã RÚT kết luận về chiều mua vào).
- `.claude/rules/*.md` áp cho file mỗi đơn vị chạm (nêu ở từng đơn vị).

QUY TẮC ĐIỀU PHỐI (bắt buộc, áp cho CẢ BA đơn vị):
1. Làm ĐÚNG MỘT đơn vị mỗi lần, thứ tự cố định. KHÔNG gộp, KHÔNG nhảy, KHÔNG làm trước phần đơn
   vị sau. Thứ tự gói bên trong U36 cũng cố định: Gói 1 → 0 → 0b → 2 → 3 → 4 → 5 (Gói 0 phụ
   thuộc `@vat/domain` do Gói 1 tạo — đảo là gãy).
2. Với mỗi đơn vị chạy trọn vòng lặp con qua `/start-unit`:
   (a) đọc spec đơn vị trong `docs/plans/U36-plan.md` + rules áp dụng;
   (b) trình bày kế hoạch ngắn (file sẽ sửa, test sẽ viết, tiêu chí nghiệm thu);
   (c) VIẾT TEST TRƯỚC (đỏ) theo nhóm đúng của `testing.md`;
   (d) hiện thực tối thiểu để test xanh — không dư phạm vi;
   (e) tự kiểm chứng bằng `/verify` (make lint && make test). Đỏ → tự sửa và lặp (d)-(e).
3. Cổng review chéo bằng `/qa-unit` khi lint/test đã xanh (agent bắt buộc nêu ở mỗi đơn vị).
   QA trả Critical → CHẶN, sửa rồi chạy lại /verify + /qa-unit. Không đóng đơn vị khi còn Critical.
4. Đóng đơn vị: commit nhỏ, thông điệp rõ. Đổi hợp đồng API → cập nhật `docs/06-BINDING_MAP.md`
   TỪ MÃ (đọc mã rồi ghi, không chép từ kế hoạch).
5. HỒI QUY giữa các đơn vị: sau khi đóng mỗi đơn vị chạy TOÀN BỘ `make test` (không chỉ test đơn
   vị đó). Đỏ hồi quy → dừng, sửa trước khi đi tiếp.
6. NHẬT KÝ TIẾN ĐỘ: sau mỗi đơn vị ghi một dòng vào `docs/plans/U36-tien-do.md` (tạo nếu chưa
   có): [đơn vị] — DONE/BLOCKED — commit hash — ghi chú.
7. CỔNG DỪNG sau U36.1 và sau U36.2: đóng đơn vị + hồi quy xanh + ghi nhật ký → DỪNG, báo cáo gọn
   (đơn vị vừa xong, kết quả verify/QA, commit, đơn vị kế). CHỜ tôi duyệt "tiếp". Không chạy một mạch.
8. GOLDEN TEST: `docs/plans/U36-plan.md` §6 liệt kê CHÍNH XÁC test nào sẽ đỏ và test nào KHÔNG đỏ
   (đã kiểm từng file). Nếu thực tế lệch danh sách đó → DỪNG và BÁO, đừng âm thầm sửa test cho
   xanh. Mỗi lần sửa golden phải ghi trong commit: "đổi có chủ đích + lý do + dẫn chiếu".

RÀNG BUỘC BẰNG CHỨNG (Hiến pháp — áp cho toàn U36):
- Mọi khẳng định về mã/hệ thống phải truy được về file:line hoặc lệnh+kết quả tái lập.
- Mã `tthai` 1–5 ĐÃ KIỂM CHỨNG (20 cặp thật, 0 ngoại lệ) — dẫn `docs/BANG-CHUNG-…-2026-07-28.md`.
- Mã "HỦY" thật CHƯA CÓ BẰNG CHỨNG → `STATUS_CODE_MAP.huy` GIỮ RỖNG. Ý nghĩa `ttxly` CHƯA KIỂM
  CHỨNG → GIỮ RỖNG. TUYỆT ĐỐI KHÔNG suy đoán từ việc đã biết 1–5.
- Chiều mua vào hiện 0 hóa đơn mã 4 — ĐÂY KHÔNG PHẢI QUY LUẬT (biên bản §6.5 đã rút kết luận cũ,
  cỡ mẫu = 1). Mã và test phải xử lý HAI CHIỀU NHƯ NHAU, không tối ưu theo giả định này.
- Nếu gặp yêu cầu chưa rõ, hoặc dữ liệu thật mâu thuẫn với biên bản → DỪNG và HỎI kèm phương án +
  một test để kiểm chứng. Không tự vá.

═══════════════════════════════════════════════════════════════════════════════
ĐƠN VỊ 1 — U36.1: Nền tảng bằng chứng (Gói 1 + Gói 0 + Gói 0b)
═══════════════════════════════════════════════════════════════════════════════
MỤC TIÊU: khai nhãn `tthai` + quy tắc "tính vào tổng" MỘT LẦN ở `packages/domain`; gỡ khóa bảng mã
ở reconcile + web; xử lý hệ quả đổi hành vi `GET /reconcile`. KHÔNG đụng cột xuất, KHÔNG đụng
summary, KHÔNG đụng giao diện trang danh sách.

SPEC: `docs/plans/U36-plan.md` §4 Gói 1, Gói 0, Gói 0b. RULES: `testing.md`, `ui.md`, `security.md`.

FILE CHẠM (đã soi 2026-07-28):
- TẠO `packages/domain/src/trangThaiHoaDon.ts` — mã mẫu đầy đủ ở §4 Gói 1 của kế hoạch.
- `packages/domain/src/index.ts` — BẮT BUỘC thêm `export * from "./trangThaiHoaDon";`. Hiện file
  chỉ có 2 dòng (registry, flatExport). Thiếu dòng này thì mọi gói sau không import được.
- `apps/web/src/lib/statusLabels.ts` — `labelTthai` thành WRAPPER MỎNG gọi `nhanTthai` +
  `daKiemChungTthai` từ `@vat/domain`. `TTXLY_VERIFIED` GIỮ RỖNG. Xóa chú thích lỗi thời dòng 2-4,12,17.
- `apps/web/src/features/invoices/chips.tsx` — QĐ-11: `TthaiChip` dòng ~30 đang tô `--success-50/700`
  cho MỌI mã verified. Sửa: mã 1 giữ success; mã 2,3,4,5 dùng `--neutral-chip-*`. Xóa chuỗi/chú
  thích "chưa được kiểm chứng" dòng 1-3, 36, 49.
- `packages/reconcile/src/statusCodes.ts` — `thayThe.tthai = [4]`; `huy` GIỮ `{}`; `ttxly` GIỮ rỗng;
  thay khối chú thích dòng 5-13 bằng dẫn chiếu biên bản + ngày.
- `packages/reconcile/test/contract/statusCodes.contract.test.ts:32` — `toEqual([4])`, GIỮ vai trò cổng.
- Chú thích lỗi thời trong MÃ: `packages/reconcile/src/statusAnomaly.ts:4,42` · `reconcile.ts:17` ·
  `types.ts:5` · `apps/api/src/routes/reconcile.ts:4-5` · `apps/web/src/features/invoices/InvoiceChangesBadge.tsx:28`.
- Chú thích lỗi thời trong TEST: `packages/reconcile/test/unit/statusAnomaly.test.ts:3-6,37` ·
  `test/integration/reconcile.test.ts:10,89` · `apps/api/test/integration/reconcile.route.test.ts:55`.
- `docs/adr/0001-nen-tang-cloudflare.md:31` (bảng bằng chứng `tthai | 1`) VÀ `:45` — CẢ HAI lỗi thời.
- `apps/web/src/features/reconcile/ReconcilePage.tsx:5` (chú thích) và `:92`.

RÀNG BUỘC BẮT BUỘC:
- MỘT NGUỒN SỰ THẬT (`ui.md`): logic fallback "<mã> (chưa rõ)" khai ĐÚNG MỘT LẦN trong
  `nhanTthai()`. `statusLabels.labelTthai` và cột xuất (đơn vị 2) đều gọi hàm này. Nếu bạn thấy
  mình viết lại logic fallback ở nơi thứ hai → sai, dừng lại.
- `nhanTthai(null)` trả `""` (không phải "—") — nhất quán `06-BINDING_MAP.md` "null → trống".
- CHỈ token + primitive; cấm hardcode hex/px (máy kiểm `apps/web/test/conventions/ui-luat.test.ts`).
- KHÔNG bật cờ `SHOW_RECONCILE` — giữ `false`.

⚠️ HỆ QUẢ PHẢI XỬ LÝ (Gói 0b): điền `STATUS_CODE_MAP` khiến `statusAnomaly.ts:43` thoát nhánh "map
rỗng → không truy vấn", nên `GET /reconcile` ĐỔI HÀNH VI (production sẽ trả 17 finding thay_the).
NHƯNG bộ test hiện có KHÔNG đỏ vì `apps/api/test/integration/reconcile.route.test.ts:31-45` seed
toàn `tthai:1`. ⇒ BẮT BUỘC THÊM SEED `tthai:4` vào test hợp đồng rồi khẳng định `thayThe === 1`.
Không làm bước này thì đổi hành vi API đi vào production mà không test nào phủ.

TDD — test trước:
- `@vat/domain`: `nhanTthai` (mã 1-5, mã lạ, null), `daKiemChungTthai`, `tinhVaoTong` (mã 4 →
  false; 1/2/3/5/null/mã lạ → true), ca `TTHAI_LOAI_KHOI_TONG` rỗng.
- `apps/web`: `statusLabels` (mã 1-5 có nhãn + verified=true; mã lạ "(chưa rõ)" + verified=false);
  `chips.tsx` mã 4/5 KHÔNG dùng token success (tiêu chí #14).
- `packages/reconcile` + `apps/api`: cổng contract `[4]`; hợp đồng reconcile với seed `tthai:4`.

GOLDEN SẼ ĐỎ (chủ đích): `apps/web/test/lib/statusLabels.test.ts:9` · cổng
`statusCodes.contract.test.ts:32`. Danh sách đầy đủ: kế hoạch §6.

LỆNH TỰ KIỂM CHỨNG: `make lint && make test`. (Không đụng gdt-client → không cần test-contract.)

CỔNG REVIEW CHÉO (`/qa-unit`): `dod-auditor` (LUÔN). security-reviewer KHÔNG bắt buộc (không đổi
phạm vi tenant, không endpoint mới). contract-guardian KHÔNG (không đụng adapter GDT).

DoD U36.1: make lint + make test XANH toàn repo; phủ không giảm; `huy` và `ttxly` VẪN RỖNG;
`GET /reconcile` có test phủ hành vi mới; chip mã 4/5 không xanh; commit riêng.
→ Ghi nhật ký, hồi quy toàn bộ, DỪNG ở cổng dừng chờ duyệt.

═══════════════════════════════════════════════════════════════════════════════
ĐƠN VỊ 2 — U36.2: Ba cột trạng thái trong file kết xuất (Gói 2)
═══════════════════════════════════════════════════════════════════════════════
MỤC TIÊU (QĐ-1): file tải về có thêm 3 cột BẬT MẶC ĐỊNH, đặt NGAY SAU `Tổng tiền (sau thuế)`:
`Trạng thái HĐ (mã)` · `Trạng thái` (chữ) · `Tính vào tổng` (Có/Không).

SPEC: `docs/plans/U36-plan.md` §4 Gói 2. RULES: `ui.md` (một nguồn sự thật cột), `testing.md`.

FILE CHẠM:
- `packages/domain/src/flatExport.ts` — ĐÂY là catalog sinh file thật (KHÔNG phải `registry.ts`).
  Chèn 3 mục ngay sau `tongSauThue` (dòng ~54), đẩy `dvtte` (~:60) xuống. `tthai` đang ở ~:68 và
  TẮT → CHUYỂN VỊ TRÍ lên 23 và bật (không tạo key trùng). `ttxly` (~:62) GIỮ vị trí và GIỮ TẮT.
  Catalog 29 → 31; mặc định 16 → 19.
- `packages/export/src/columns.ts` — gắn ô ở `O_THEO_KEY` (~:326). Helper thật tên `strCell`
  (KHÔNG phải `textCell`). Mã mẫu ở kế hoạch §4 Gói 2.
- `apps/web/src/features/invoices/ChonCotXuat.tsx:73` — chuỗi cứng "Về mặc định (16 cột)" → dẫn
  xuất `FLAT_EXPORT_DEFAULT_KEYS.length`.
- ⚠️ `apps/web/src/lib/exportColsStore.ts:6` — khóa `vat.exportCols.v1` chỉ LỌC key lạ, KHÔNG bổ
  sung key mới ⇒ người dùng đã từng bấm "Tùy chỉnh cột" sẽ KHÔNG BAO GIỜ thấy 3 cột mới, làm QĐ-1
  vô hiệu với họ. BUMP khóa lên `vat.exportCols.v2`.
- Chú thích lạc hậu: `apps/web/src/lib/apiClient.ts:243`, `InvoiceExportButtons.tsx:18`.

RÀNG BUỘC BẮT BUỘC:
- KHÔNG đổi nhãn `tthai` thành "Mã TT" — trùng nhãn với `registry.ts:161`; đổi một nơi sinh hai
  nhãn cho một trường (vi phạm `ui.md` "Nhãn một nguồn") và làm đỏ `xlsxMapping.test.ts:87`.
- Nhãn chữ PHẢI gọi `nhanTthai()` từ `@vat/domain` (đơn vị 1) — không viết lại logic.
- `tthai = null` → cột Mã TT trống, Trạng thái trống, Tính vào tổng = "Có".
- Thiếu hàm sinh ô ⇒ `flatRenderColumns` ném lỗi fail-loud (`columns.ts:375`) — đó là thiết kế,
  đừng bọc try/catch.

TDD — test trước: 19 cột mặc định đúng thứ tự; 3 cột trạng thái ngay sau `Tổng tiền (sau thuế)`;
`Tính vào tổng` = "Không" cho mã 4, "Có" cho 1/2/3/5/null/mã lạ; nhãn khớp `@vat/domain` (tiêu chí
#12 — cùng gọi `nhanTthai`); `exportColsStore` với khóa v1 tồn tại vẫn cho ra 3 cột mới (tiêu chí #13).

GOLDEN SẼ ĐỎ (chủ đích — kế hoạch §6 đã kiểm từng dòng):
- `packages/domain/test/unit/flatExport.test.ts:17, :29, :60, :127, :157, :195` (và chữ ở :2,:15,:154,:165).
  Sửa `FLAT_EXPORT_COLUMNS[28]` → `.at(-1)` để không cột-hoá chỉ số lần nữa.
- `packages/export/test/unit/lineDetail.test.ts:109-127` (`DEFAULT_HEADERS` 16 nhãn cứng → 19).
KHÔNG đỏ (đừng sửa nhầm): `exportCols.test.tsx:36,42,43` · `lineDetail.test.ts:140-150` ·
`flatExport.test.ts:52,:167` · `xlsxMapping.test.ts:87,112-113`.
`xlsxMapping.test.ts` PHẢI XANH — nó dựng HEADERS động, chỉ đỏ khi quên gắn ô (tiêu chí #10).

LỆNH TỰ KIỂM CHỨNG: `make lint && make test`.

CỔNG REVIEW CHÉO (`/qa-unit`): `dod-auditor` (LUÔN).

DoD U36.2: make lint + make test XANH; golden cập nhật CÓ CHỦ ĐÍCH kèm lý do trong commit; file
xuất thật có 19 cột đúng thứ tự; người dùng có localStorage cũ vẫn thấy cột mới; commit riêng.
→ Ghi nhật ký, hồi quy toàn bộ, DỪNG ở cổng dừng chờ duyệt.

═══════════════════════════════════════════════════════════════════════════════
ĐƠN VỊ 3 — U36.3: Tổng hợp loại mã 4 + thông báo + tài liệu (Gói 3 + 4 + 5)
═══════════════════════════════════════════════════════════════════════════════
MỤC TIÊU: `/invoices/summary` loại `tthai=4` khỏi TỔNG TIỀN và trả thêm số liệu thay đổi theo
chiều; trang "Danh sách hóa đơn" hiện thông báo; đồng bộ tài liệu + luật.

SPEC: `docs/plans/U36-plan.md` §4 Gói 3, Gói 4, Gói 5 + §2.1 (vì sao bỏ công thức ròng) + §2.2
(vì sao giữ count) + §2.3 (thuế phải nộp). RULES: `multi-tenant.md`, `testing.md`, `ui.md`, `security.md`.

⚠️ BA ĐIỂM CHẶN — ĐỌC KỸ TRƯỚC KHI VIẾT DÒNG NÀO:

(1) `count` GIỮ NGUYÊN (QĐ-7). `apps/web/src/features/invoices/InvoicesPage.tsx:92-107`:
    count → khongCoHoaDon → `useRangeBackfill({ auto })`. Trừ mã 4 khỏi `count` ⇒ kỳ chỉ chứa mã 4
    cho count=0 ⇒ trang TỰ GỌI ĐỒNG BỘ LÊN TỔNG CỤC THUẾ. GDT đã phạt 429 nguồn ta ngày 27/07.
    Thêm `countTinhTong` + `soLoaiKhoiTong` bên cạnh, KHÔNG đụng `count`.
    Hệ quả: `packages/query/src/listInvoices.ts:49` KHÔNG SỬA — bất biến
    `listInvoices.test.ts:277` (`ds.total === tong.total.count`) vẫn xanh.

(2) `packages/reconcile` GIỮ NGUYÊN — KHÔNG áp loại trừ (Gói 3d). Reconcile không có phép cộng
    tiền nào. Loại mã 4 khỏi `sequenceGaps.ts` sẽ tạo "thiếu số đầu ra" GIẢ; khỏi `taxIntegrity.ts`
    sẽ GIẤU hóa đơn mã 4 bị lệch thuế. KHÔNG thêm `@vat/domain` vào `packages/reconcile/package.json`.

(3) BỐN BẪY SQL (kế hoạch §4 Gói 3b có mã mẫu ĐÃ CHẠY THỬ — dùng nguyên, đừng tự chế):
    - `NOT IN` + NULL → viết `(tthai is null or tthai not in (…))`
    - `sum()` tập rỗng → NULL lan cả biểu thức → `coalesce(…,0)` TỪNG số hạng cho trường MỚI
    - `count(col)` đếm non-null ≠ số dòng → `count(*) filter (…)`
    - Loại trừ đặt vào WHERE làm BIẾN MẤT cả nhóm khỏi `group by chieu` → đặt vào AGGREGATE
    Lưu ý drizzle-orm 0.45.2 KHÔNG có API `FILTER`, dựng bằng `sql` template; và Drizzle KHÔNG
    sinh `AS "alias"` cho biểu thức `sql` (map theo VỊ TRÍ) → đừng viết `AS` trong template.
    Nhánh bảo vệ `TTHAI_LOAI_KHOI_TONG` rỗng: `NOT IN ()` là lỗi cú pháp SQL.

HỢP ĐỒNG API (QĐ-9 — KHÔNG thêm mảng top-level, nhồi vào `ChieuSummary` đã có):
- `MoneyTotals`: + `countTinhTong`, `soLoaiKhoiTong`. `tongT*` GIỮ NULLABLE (QĐ-10 — không
  COALESCE, để không đổi hành vi "—" của `InvoicesPage.tsx:32 tienStat()`).
- `ChieuSummary extends MoneyTotals`: + `soDuocDieuChinh`, `soHdThayThe`, `soHdDieuChinh`,
  `soMaLa`, `thueDaLoai`, `ttbsoDaLoai`, `thueThayTheDieuChinh`, `ttbsoThayTheDieuChinh`.
  Bốn trường tiền MỚI: DƯƠNG (QĐ-8), có `coalesce(…,0)`, kiểu `string`.
- Khối "thay đổi" CHỈ ở cấp chiều, KHÔNG ở `total` (không trộn mua vào với bán ra).
- Client `apps/web/src/types/api.ts:103-115` phải sửa khớp.

GIAO DIỆN (Gói 4):
- 4 thẻ số: BA SỐ TIỀN đã loại mã 4; SỐ ĐẾM HÓA ĐƠN GIỮ NGUYÊN + dòng phụ "(N hóa đơn bị thay thế
  - không tính vào tổng)" khi `soLoaiKhoiTong > 0`.
- Thông báo `Alert` tone `info`, tách THEO CHIỀU. Mẫu chữ đầy đủ ở kế hoạch §4 Gói 4b.
- QĐ-12 — dòng "Thuế phải nộp trên báo cáo giảm X ₫" đặt MỘT LẦN cho cả hai chiều (không lặp trong
  từng khối chiều). Công thức: `− thueDaLoai(sold) + thueDaLoai(purchase)` — HAI CHIỀU NGƯỢC DẤU.
  TÍNH BẰNG BigInt trên chuỗi, CẤM `Number()`/`parseFloat`. Kiểm `apps/web/src/lib/format.ts` và
  `packages/**` xem đã có helper trừ chuỗi tiền chưa TRƯỚC KHI tự viết; viết mới thì đặt một nơi
  dùng chung + unit test ca > 2^53. Ẩn dòng này khi cả hai chiều không có mã 4.
  Kèm chú giải: "số thuế phải nộp thật không đổi - trước đây phần mềm tính dư".
- QĐ-6 — cảnh báo khi `soMaLa > 0`: "Có N hóa đơn mang mã trạng thái chưa xác định - cần kiểm tra."
- Dòng bắt buộc: "Từ 28/07/2026, hóa đơn bị thay thế không còn được cộng vào tổng." + ghi
  `apps/web/src/lib/changelog.ts`.
- QĐ-8 — dấu trừ dùng `-` ASCII. KHÔNG sửa `apps/web/src/lib/format.ts:30`.
- Chịu được shape CŨ: `queryKey: ["invoices-summary", filter]` không đổi sau deploy ⇒ tab đang mở
  giữ dữ liệu cũ tới lần refetch. Mọi trường mới phải xử lý `undefined`, không chỉ mảng rỗng.
  Tenant chưa có dữ liệu → `byChieu = []` ⇒ ẩn toàn bộ khối thông báo, không crash.
- Token `--info-700/50/200` ĐÃ CÓ (`apps/web/src/styles/tokens.css:15-18`), `Alert` đã map đúng ⇒
  KHÔNG cần thêm token, chỉ thêm một dòng ánh xạ ngữ nghĩa vào `docs/07-DESIGN_TOKENS.md`.
- Bốn trạng thái (rảnh/đang tải/rỗng/lỗi); cấm hardcode hex/px; không tô kiểu nội tuyến trong `features/`.

TÀI LIỆU (Gói 5) — số dòng đã kiểm 2026-07-28:
`.claude/rules/ui.md:19` · `docs/06-BINDING_MAP.md:91,:104,:143` (cột phẳng ở §4.4 dòng :104, KHÔNG
phải §4.1 :81-83) · `docs/07-DESIGN_TOKENS.md:12,:56,:137` · `README.md:30` ·
`docs/CHECKLIST-NGHIEM-THU.md:44,:208,:212,:247` · `docs/plans/EXPORT-cot-tuy-chon-2026-07-23.md` ·
`docs/BANG-CHUNG-…-2026-07-28.md` (đánh dấu §8.1 đã làm) · `docs/BACKLOG-y-tuong-va-de-xuat.md`
(ghi mục `FindingKind` mở rộng, đẩy khỏi U36).
CỐ Ý KHÔNG SỬA: `docs/plans/U10-plan.md`, `U15-*.md` — hồ sơ thời điểm.

TDD — test trước (tiêu chí #1..#22 ở kế hoạch §5, ưu tiên các ca bẫy):
- tổng tiền loại mã 4; `tthai=NULL` VẪN cộng; `tthai=5` VẪN cộng (cặp 3/5 → tổng 0);
- kỳ chỉ có mã 4 → `thueDaLoai` là SỐ không null; `count > 0` ⇒ KHÔNG tự kích hoạt đồng bộ;
- một `chieu` toàn mã 4 vẫn CÒN trong `byChieu` với `countTinhTong=0`;
- tenant chưa có dữ liệu → `byChieu=[]` ⇒ ẩn thông báo, không crash;
- client chịu được shape cũ (`soMaLa === undefined`) không ném;
- thuế phải nộp ĐÚNG DẤU (bán ra làm giảm, mua vào làm tăng) + ca > 2^53 bằng BigInt;
- `soMaLa > 0` → hiện cảnh báo (seed `tthai=9`);
- chuỗi nhiều đời A→B→C (A=4,B=4,C=2): quy tắc loại mã 4 vẫn đúng;
- cách ly tenant nguyên vẹn (owner + non-owner).

⚠️ MOCK SUMMARY SẼ CRASH nếu không sửa (không phải "golden đỏ"):
`apps/web/test/helpers/renderApp.tsx:62-66` (dùng chung MỌI test web) ·
`apps/web/test/features/invoicesUK4.test.tsx:25-30` · `invoiceSummaryStats.test.tsx:61-63`.
Cùng với `apps/api/test/integration/invoices.route.test.ts` (hợp đồng summary thêm trường).

SỐ LIỆU NGHIỆM THU THỦ CÔNG (đo thật 2026-07-28, tenant MST 4201969169, chiều BÁN RA):
kỳ 2026-07 → 3 HĐ mã 4, thuế giảm ĐÚNG 1.711.111 ₫, tổng thanh toán giảm 23.100.000 ₫.
(2026-04: 6 HĐ / 7.787.702 ₫ · 2026-05: 5 HĐ / 9.257.482 ₫ · 2026-06: 3 HĐ / 1.579.630 ₫.)
KHÔNG dùng con số 20.335.925 ₫ để nghiệm thu một kỳ — đó là tổng TOÀN BỘ 3 tenant, 5 tháng.

LỆNH TỰ KIỂM CHỨNG: `make lint && make test`. (Không đụng gdt-client → không cần test-contract.)

CỔNG REVIEW CHÉO (`/qa-unit`): `dod-auditor` (LUÔN) + `security-reviewer` (BẮT BUỘC — sửa tầng truy
vấn tổng hợp có lọc tenant, đổi hợp đồng API). contract-guardian KHÔNG.

DoD U36.3: make lint + make test XANH toàn repo; phủ ≥ 80% mọi gói chạm; `count` KHÔNG đổi ngữ
nghĩa; RLS/cách ly tenant nguyên vẹn; thông báo hiện đúng theo chiều + dòng giải thích + dòng thuế
phải nộp; `06-BINDING_MAP.md` cập nhật TỪ MÃ; số nghiệm thu thủ công khớp; commit riêng.
→ Ghi nhật ký, báo cáo cuối.

BẮT ĐẦU NGAY với U36.1: trình bày kế hoạch ngắn cho U36.1, không cần tôi duyệt kế hoạch — chạy
trọn vòng lặp U36.1 tới khi đóng đơn vị, rồi DỪNG ở cổng dừng (quy tắc 7) chờ tôi duyệt "tiếp".
```

---

## Ghi chú vận hành

- **Vì sao chia 3 đơn vị:** U36.1 thuần khai báo + gỡ khóa (không đổi hợp đồng API); U36.2 chạm
  catalog cột + golden test (bề mặt hồi quy rộng nhưng nông); U36.3 đổi hợp đồng API + tầng truy
  vấn + giao diện (rủi ro cao nhất). Cổng dừng đặt đúng chỗ bề mặt rủi ro nhảy bậc.
- **Phụ thuộc cứng giữa các đơn vị:** U36.2 gọi `nhanTthai()` do U36.1 tạo; U36.3 dùng
  `TTHAI_LOAI_KHOI_TONG` cũng từ U36.1. Chạy sai thứ tự là gãy ngay ở bước import.
- **Nếu một phiên không đủ dài:** nhật ký `docs/plans/U36-tien-do.md` cho phiên sau đọc trạng thái
  và tiếp đúng đơn vị dở.
- **Nếu thực tế golden test lệch danh sách §6:** prompt buộc DỪNG-BÁO thay vì tự sửa test cho
  xanh. Danh sách đó đã kiểm từng dòng ngày 2026-07-28; lệch nghĩa là mã đã đổi từ lúc đó, cần
  đánh giá lại chứ không phải vá.
- **Rủi ro tồn dư đã chấp nhận có ý thức** (kế hoạch §7.1): mã "hủy" thật chưa biết — nếu GDT trả
  mã 6, hóa đơn đã hủy VẪN được cộng vào tổng. Cơ chế giảm nhẹ là trường `soMaLa` + cảnh báo mã
  lạ. Nếu phiên thực thi thấy `soMaLa > 0` trên dữ liệu thật → BÁO NGAY, đó là tín hiệu cần probe.
- **Kế hoạch đã qua 2 vòng review chéo độc lập** (19 blocker đã vá, gồm 6 lỗi do chính vòng vá đầu
  sinh ra); prompt này nhắc lại các chốt then chốt để phiên thực thi không tự đi chệch.

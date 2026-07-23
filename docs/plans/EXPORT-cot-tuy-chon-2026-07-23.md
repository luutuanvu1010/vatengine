# Design spec — Kết xuất: thứ tự cột mới + chọn ẩn/hiện cột

> **Loại:** design spec (đầu vào cho writing-plans). **Ngày:** 2026-07-23.
> **Trạng thái:** đã duyệt thiết kế (chủ dự án 2026-07-23), CHƯA có kế hoạch triển khai.
> **Nguồn quy tắc:** `CLAUDE.md`, `.claude/rules/ui.md` (một nguồn sự thật cột, token/primitive,
> 4 trạng thái, đa tenant), `docs/06-BINDING_MAP.md` (S1/S3 + hợp đồng `/exports`).

## 1. Mục tiêu

File kết xuất (xlsx/csv) hiện là **một sheet phẳng** — mỗi mặt hàng một dòng, kèm ngữ cảnh
hóa đơn (`packages/export/src/columns.ts::lineDetailRenderColumns`). Cần:

1. **Đổi thứ tự cột** cho logic hơn, đưa **STT lên cột đầu**.
2. Cho người dùng **ẩn/hiện cột** ngay ở giao diện; **file xuất tuân theo lựa chọn**; không
   chọn → xuất **tập mặc định**.

Thuần cải thiện trình bày dữ liệu xuất — KHÔNG đổi phạm vi dữ liệu tenant, KHÔNG thêm màn.

## 2. Quyết định đã chốt (chủ dự án 2026-07-23)

- **Phạm vi cột:** 12 cột yêu cầu là **mặc định HIỆN**; các cột còn lại **giữ nguyên nhưng ẩn**
  (người dùng bật khi cần). KHÔNG bỏ cột nào.
- **Nơi đặt UI:** ngay tại **S1** (Danh sách hóa đơn), cạnh nút Xuất Excel/CSV. S3 dùng chung sau.
- **"Tổng tiền (sau thuế)":** mức **DÒNG** = `Thành tiền (thtien)` + `Tiền thuế dòng (tsuatTien)`;
  là cột **TÍNH THÊM** (GDT không trả sẵn) — thiếu một vế thì **để trống**, không bịa số.
- **Thứ tự dòng hàng:** giữ đúng **thứ tự mảng GDT tải về** (KHÔNG sắp lại theo `stt`).
- **STT (cột đầu):** **số chạy TOÀN FILE 1..N** (không reset theo hóa đơn). Số dòng gốc GDT
  chuyển thành cột riêng **"STT dòng (HĐ)"** (ẩn mặc định).
- **Nhớ lựa chọn cột:** localStorage (như đã nhớ bộ lọc).

## 3. Phạm vi thay đổi (đa gói — file sinh ở SERVER)

| Gói | Việc |
|---|---|
| `@vat/domain` | Thêm **catalog cột phẳng** (metadata thuần: `key`, `nhan`, `nhom`, `macDinhHien`, thứ tự) — nguồn sự thật DUY NHẤT. |
| `@vat/export` | `lineDetailRenderColumns()` **dẫn xuất từ catalog** (hết hardcode); nhận danh sách cột được chọn → lọc + sắp theo catalog; thêm 2 cột mới (STT toàn file, Tổng sau thuế). |
| `@vat/query` | Mở rộng schema chọn kết xuất (`exportSelectionSchema`) thêm `cols?: string[]` (validate). |
| `apps/api` | `POST /exports` (+`/convert`) đọc `cols` từ body → truyền xuống encoder; allowlist theo catalog. |
| `apps/web` | Panel **"Chọn cột"** ở S1 (primitive + token); state + nhớ localStorage; đẩy `cols` vào lời gọi xuất. |

> Đây KHÔNG phải đơn vị apps/web-only: file kết xuất sinh ở server nên lựa chọn cột phải đi
> tới server qua hợp đồng `/exports`.

## 4. Catalog cột (nguồn sự thật — `@vat/domain`)

Thứ tự dưới đây = thứ tự cột trong file khi hiện. **12 cột đầu = mặc định HIỆN.**

| # | key | Nhãn | Nhóm | Mặc định | Nguồn dữ liệu |
|---|---|---|---|---|---|
| 1 | `sttFile` | STT | stt | ✅ | **MỚI** — bộ đếm 1..N ở encoder |
| 2 | `nbten` | Người bán | nguoi | ✅ | ngữ cảnh HĐ |
| 3 | `nbmst` | MST người bán | nguoi | ✅ | ngữ cảnh HĐ |
| 4 | `nmten` | Người mua | nguoi | ✅ | ngữ cảnh HĐ |
| 5 | `nmmst` | MST người mua | nguoi | ✅ | ngữ cảnh HĐ |
| 6 | `ten` | Hàng hóa/dịch vụ | dong | ✅ | dòng hàng |
| 7 | `sluong` | Số lượng | dong | ✅ | dòng hàng |
| 8 | `dgia` | Đơn giá | dong | ✅ | dòng hàng (tiền) |
| 9 | `thtien` | Thành tiền (trước thuế) | dong | ✅ | dòng hàng (tiền) |
| 10 | `tsuat` | Thuế suất | dong | ✅ | dòng hàng |
| 11 | `tsuatTien` | Tiền thuế | dong | ✅ | dòng hàng (tiền) |
| 12 | `tongSauThue` | Tổng tiền (sau thuế) | dong | ✅ | **MỚI** — `thtien`+`tsuatTien` (tiền) |
| 13 | `dvtinh` | ĐVT | dong | ⬜ | dòng hàng |
| 14 | `ltsuat` | Mã thuế suất | dong | ⬜ | dòng hàng |
| 15 | `sttDong` | STT dòng (HĐ) | dong | ⬜ | dòng hàng (`stt` GDT cũ) |
| 16 | `tdlap` | Ngày lập | hd | ⬜ | ngữ cảnh HĐ |
| 17 | `ncnhat` | Ngày cập nhật | hd | ⬜ | ngữ cảnh HĐ |
| 18 | `khmshdon` | Ký hiệu mẫu số | hd | ⬜ | ngữ cảnh HĐ |
| 19 | `khhdon` | Ký hiệu HĐ | hd | ⬜ | ngữ cảnh HĐ |
| 20 | `shdon` | Số HĐ | hd | ⬜ | ngữ cảnh HĐ |
| 21 | `chieu` | Chiều | hd | ⬜ | ngữ cảnh HĐ |
| 22 | `nguon` | Nguồn | hd | ⬜ | ngữ cảnh HĐ |
| 23 | `dvtte` | Tiền tệ | hd | ⬜ | ngữ cảnh HĐ |
| 24 | `ttxly` | Trạng thái xử lý (mã) | trangthai | ⬜ | ngữ cảnh HĐ |
| 25 | `tthai` | Trạng thái HĐ (mã) | trangthai | ⬜ | ngữ cảnh HĐ |
| 26 | `tgtcthue` | Tiền chưa thuế (cả HĐ) | hdTien | ⬜ | ngữ cảnh HĐ (tiền) |
| 27 | `ttcktmai` | Chiết khấu (cả HĐ) | hdTien | ⬜ | ngữ cảnh HĐ (tiền) |
| 28 | `tgtthue` | Tiền thuế (cả HĐ) | hdTien | ⬜ | ngữ cảnh HĐ (tiền) |
| 29 | `tgtttbso` | Tổng thanh toán (cả HĐ) | hdTien | ⬜ | ngữ cảnh HĐ (tiền) |

**Ghi chú giữ nguyên nghĩa cũ:** các cột tiền "(cả HĐ)" LẶP mỗi dòng của cùng hóa đơn — nhãn
giữ hậu tố "(cả HĐ)" để không cộng nhầm (một HĐ nhiều mặt hàng). `ttxly`/`tthai` xuất **MÃ số**
(không nhãn tiếng Việt — giữ quyết định U6, tránh nguồn sự thật thứ hai). "Tiền thuế" (dòng,
`tsuatTien`) khác "Tiền thuế (cả HĐ)" (`tgtthue`) — hai cột phân biệt được nhờ hậu tố.

**Vị trí cột ẩn khi bật hiện (quyết định tường minh):** thứ tự file = **thứ tự catalog** — 12
cột mặc định đứng TRƯỚC (đúng yêu cầu chủ dự án), các cột ẩn xếp SAU theo nhóm (§4 #13→#29).
Do đó khi người dùng bật một cột ẩn (vd "ĐVT"), nó xuất hiện ở **sau khối 12 mặc định** (đúng
vị trí catalog #13), KHÔNG chen vào giữa cạnh "Số lượng". Đây là đánh đổi có chủ đích để giữ
khối mặc định gọn; nếu muốn cột ẩn chen đúng vị trí logic khi bật, chỉ cần sắp lại THỨ TỰ trong
catalog (một chỗ) — không đổi kiến trúc. **Cần chủ dự án xác nhận ở bước review spec.**

## 5. Kiến trúc dẫn xuất

```
@vat/domain  FLAT_EXPORT_COLUMNS: {key,nhan,nhom,macDinhHien}[]   ← nguồn sự thật (metadata)
      │
      ├── @vat/export   flatRenderColumns(chonKeys?) : RenderColumn<LineDetailRow>[]
      │        • map key → hàm sinh ô (cell)     • lọc theo chonKeys, sắp theo catalog
      │        • chonKeys rỗng/thiếu → tập macDinhHien
      │        • `sttFile`: cột đặc biệt, encoder bơm chỉ số chạy 1..N
      │        • `tongSauThue`: cell = cộng thập phân(thtien, tsuatTien)
      │
      └── apps/web   danh sách checkbox đọc {key,nhan,nhom,macDinhHien} (KHÔNG import cell/logic server)
```

- **Một nguồn:** thứ tự + nhãn + mặc định khai đúng MỘT chỗ (catalog). Web và server cùng đọc;
  hết cảnh hardcode `lineDetailRenderColumns` (dọn nợ lệch chuẩn ui.md "cột dẫn xuất từ Registry").
- **`sttFile` (số chạy toàn file):** encoder giữ bộ đếm dòng dữ liệu (đã có biến `r`); cột này
  đọc chỉ số đó. Bền qua streaming lô-by-lô (không gom cả tập vào RAM).
- **`tongSauThue`:** cộng **thập phân theo chuỗi** (KHÔNG `parseFloat` — tiền `numeric` Postgres
  có thể vượt 2^53, mục 7.1 export). Một vế null → ô **trống**.

## 6. Hợp đồng API

`POST /exports?format=xlsx|csv&<bộ lọc>` — body mở rộng:

```
{ ids?: string[],            // đã có (U30): xuất các dòng đã tick
  cols?: string[] }          // MỚI: key cột người dùng chọn (thứ tự bỏ qua — server sắp theo catalog)
```

- `exportSelectionSchema` (@vat/query) thêm `cols: z.array(z.string()).optional()`.
- Server: **allowlist = catalog** — bỏ key lạ (an toàn như allowlist `ORDER BY`), KHÔNG tin
  input thô. `cols` rỗng/thiếu → tập `macDinhHien`.
- `/exports/convert` (profile kế toán) **KHÔNG đổi** ở đơn vị này (profile có bộ cột riêng);
  chỉ mẫu phẳng chịu `cols`.
- Đa tenant: `cols` chỉ là trình bày — dữ liệu vẫn lọc `tenant_id` như cũ (không nới an toàn).

## 7. UI — Panel "Chọn cột" (S1)

- Nút **"Chọn cột"** (primitive `Button variant="secondary"`) cạnh Xuất Excel/CSV, chỉ vai
  `canExport` (như nút Xuất). Mở panel:
  - Checkbox từng cột, **nhóm theo `nhom`** (Người bán/mua · Chi tiết dòng · Thông tin HĐ ·
    Trạng thái · Tiền cả HĐ), tick sẵn theo `macDinhHien`.
  - Nút **"Về mặc định"** đặt lại tập macDinhHien.
  - Thuần token + primitive; thêm primitive `Checkbox`/`Popover` nếu thiếu (KHÔNG tô inline).
- **State:** danh sách key đang chọn ở `InvoicesPage`; **nhớ localStorage** (khóa riêng, KHÔNG
  chứa dữ liệu tenant → an toàn qua phiên). Truyền vào `InvoiceExportButtons` → `taiXuatHoaDon`
  → `createExport(format, filter, ids?, cols)`.
- Không chọn gì đặc biệt (lần đầu) → localStorage trống → gửi `cols` = macDinhHien (hoặc bỏ
  `cols` để server tự mặc định — chọn: **bỏ `cols` khi = đúng tập mặc định** để URL/body gọn).

## 8. Kiểm thử (TDD — đỏ trước)

- **`@vat/domain`:** catalog có đủ 29 key, không trùng, 12 cột `macDinhHien`; thứ tự khớp §4.
- **`@vat/export`:**
  - `flatRenderColumns()` (không tham số) = đúng 12 cột mặc định, đúng thứ tự.
  - `flatRenderColumns([...])` lọc + sắp theo catalog; **bỏ key lạ**.
  - Golden: file có `sttFile` chạy 1..N liên tục qua nhiều hóa đơn/lô.
  - `tongSauThue` = thtien+tsuatTien (ca số lớn > 2^53); thiếu vế → trống.
  - Dòng hàng giữ **thứ tự mảng vào** (không sắp lại theo stt).
  - Cập nhật golden cũ của thứ tự cột (đổi có chủ đích — ghi rõ).
- **`apps/api`:** `/exports` với `cols` hợp lệ → file đúng tập; `cols` có key lạ → bị loại;
  không `cols` → tập mặc định; RBAC 403 cho `ke_toan` giữ nguyên.
- **`apps/web`:** panel render đúng nhóm + tick mặc định; đổi lựa chọn → `createExport` nhận
  `cols` đúng; "Về mặc định" khôi phục; nhớ qua reload (localStorage); `ui-luat.test.ts` XANH.

## 9. Tiêu chí nghiệm thu (cổng)

1. Một nguồn: catalog là chỗ khai DUY NHẤT; web + export + api cùng dẫn xuất (sửa 1 nơi, cả 3 hưởng).
2. Nhãn/thứ tự/mặc định đúng §4; không chuỗi nhãn rời trong màn.
3. Chỉ token + primitive; panel không tô inline input/select; `ui-luat.test.ts` XANH.
4. File xuất tuân `cols`; không `cols` → 12 mặc định; key lạ bị loại (an toàn).
5. `sttFile` 1..N toàn file; `tongSauThue` cộng chính xác (không ép float), thiếu vế → trống;
   dòng hàng giữ thứ tự mảng.
6. Đa tenant nguyên vẹn; RBAC xuất nguyên vẹn.
7. `make lint` + `make test` XANH toàn repo; không giảm phủ.

## 10. Rủi ro / lưu ý

- **Cộng thập phân chính xác:** cần helper cộng chuỗi số (kiểm tra `packages/**` có sẵn helper
  tiền/decimal trước khi tự viết — tránh nguồn thứ hai). Không dùng `parseFloat`.
- **Đổi output có chủ đích:** golden test thứ tự/nội dung file SẼ đỏ → cập nhật cùng đơn vị,
  ghi rõ "đổi có chủ đích" (không âm thầm sửa golden để né).
- **`convert`/profile kế toán** ngoài phạm vi — chỉ mẫu phẳng chịu `cols`. Ghi rõ để không
  hiểu nhầm profile cũng đổi.
- **Web import metadata:** chỉ import phần metadata thuần từ `@vat/domain` (đã import sẵn),
  KHÔNG kéo logic encoder server vào bundle.

# BÀN GIAO — Phiên 29/07/2026: cỡ chữ neo ở thân 18px

> Đọc file này là đủ để nối tiếp. Nguồn chi tiết: `docs/07-DESIGN_TOKENS.md` §4 (QĐ-9b) và
> `.claude/rules/ui.md`.

## 1. Mục tiêu phiên và mức đạt

| Mục tiêu | Đạt |
|---|---|
| Tìm nguồn token / luật giao diện đang chi phối cỡ chữ | ✅ **Xong** |
| Thân đạt ≥ 16px, phông tiếng Việt | ✅ **Xong** — chốt **18px** sau nghiệm thu bằng mắt |
| Tiêu đề có cỡ tương ứng thân | ✅ **Xong** (22 / 26 / 32 / 40) |
| Cho chủ dự án soi bằng mắt trên local, bỏ qua đăng nhập | ✅ **Xong** (chế độ xem thử chỉ-dev) |
| Commit · deploy · ghi changelog | ✅ **Xong** — `vat-web 7f7c7777` |

## 2. Vấn đề đã sửa — nói bằng tiếng người

Chữ trong phần mềm bị bé tới mức khó đọc. Ví dụ chủ dự án chỉ ra: đoạn mô tả trong thẻ
*Tải hóa đơn gốc* — *"Kéo bản gốc có chữ ký số từ Tổng cục Thuế…"* — bị đặt ở **13px**.

Gốc rễ **không phải** ở màn đó. Token `--fs-base` vốn đã là 16px, nhưng nhiều chỗ dùng
`--fs-sm` (13px) — thứ vốn chỉ dành cho *nhãn* — cho cả **câu văn hoàn chỉnh**. Sắc độ "phụ"
lẽ ra biểu đạt bằng **màu chữ**, không phải bằng cách bóp cỡ.

**Đây là lần thứ hai lỗi này quay lại.** QĐ-9 (U20, 21/07) đã chốt đúng nguyên tắc *"đoạn văn
để ĐỌC luôn `--fs-base`"* — nhưng chỉ vá lẻ trang Giới thiệu và Cài đặt, **không đụng tầng
token**. Nên nó tái phát ở U37b. Phiên này sửa ở đúng tầng và khoá bằng phép kiểm máy.

## 3. Người dùng thấy gì mới

Thang mới, neo ở thân, bước ~1.22×:

| Token | Cũ | Mới | Dùng |
|---|---|---|---|
| `--fs-xs` | 12 | **14** | caption, mã |
| `--fs-sm` | 13 | **15** | nhãn, meta bảng |
| `--fs-base` | 16 | **18** | **thân — MỌI câu văn** |
| `--fs-lg` | 18 | **22** | tiêu đề thẻ |
| `--fs-xl` | 20 | **26** | tiêu đề mục |
| `--fs-2xl` | 24 | **32** | tiêu đề trang |
| `--fs-3xl` | 30 | **40** | số liệu KPI |

Primitive `ChuPhu` chuyển `--fs-sm` → `--fs-base`, và 4 màn còn dùng `--fs-sm` cho câu văn
(Đối chiếu, Kết xuất, Tổng quan, tiến độ đồng bộ) đã đổi theo.

**Phông tiếng Việt vốn đã đúng, không phải sửa:** `Be Vietnam Pro`, subset `vietnamese`,
weight 400–800, nạp cục bộ qua `@fontsource` ở `apps/web/src/main.tsx` — kiểm trên trình duyệt
`document.fonts.check('16px "Be Vietnam Pro"') === true`.

Changelog người dùng cuối: **v2.1 · 29/07/2026** trong `apps/web/src/lib/changelog.ts`.

### Vì sao 18 chứ không phải 16

Bản 16px **đã dựng và đã soi tại chỗ**; chủ dự án xem rồi vẫn thấy bé. 18 là con số đến từ
**mắt người dùng trên máy thật**, không phải suy ra từ thang lý thuyết. Đối tượng dùng là kế
toán đọc số liệu liên tục nhiều giờ ⇒ ưu tiên đọc lâu không mỏi hơn là nhồi nhiều dòng vào
một màn. Đừng "tối ưu" ngược lại mà không hỏi.

## 4. Phép kiểm máy đã đặt — đừng gỡ

`apps/web/test/conventions/ui-luat.test.ts` thêm 3 phép kiểm:

1. **`tokens.css` phải khớp NGUYÊN VĂN thang trong `07-DESIGN_TOKENS.md` §7.** Tài liệu đó tự
   tuyên bố là nguồn DUY NHẤT, nhưng trước nay **không có gì ép hai bên khớp** — lệch được mà
   không ai biết.
2. **Thân = 18px, và `--fs-xs`/`--fs-sm` phải NHỎ HƠN thân.** Chặn vòng lặp "chữ bé" tái diễn
   theo cả hai chiều.
3. **`ChuPhu` phải dùng `--fs-base`**, không được `--fs-sm`.

Đã thử làm lệch 20→19px để xác nhận phép kiểm **thật sự đỏ**, không xanh giả.

Luật tương ứng đã ghi vào `.claude/rules/ui.md` (mục đầu phần "Bắt buộc").

## 5. Chế độ XEM THỬ chỉ-dev — đọc trước khi đụng

`apps/web/src/dev/xemThuGiaoDien.ts`, bật bằng `?xem-thu=1`:

```
http://localhost:5173/invoices?xem-thu=1
```

Chặn `fetch`, trả dữ liệu bịa (tên doanh nghiệp/mặt hàng tiếng Việt dài, đủ dấu, để chữ bị ép
xuống dòng như hàng thật). Kèm **thanh dò cỡ chữ 14–24px** ở góc phải dưới — kéo là cả thang
giãn/co theo tỉ lệ, dùng để chốt con số tại chỗ thay vì đoán qua lại từng lượt.

**Vì sao phải dựng thứ này:** API local không chạy được — `apps/api/.dev.vars` trỏ
`postgres://…@localhost:5432/vat` nhưng máy không có Postgres lẫn Docker; tên biến
`WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` cũng đã lỗi thời so với wrangler
4.110 (nay là `CLOUDFLARE_…`). **Đây là nợ riêng, đáng sửa** — xem §7.

⚠️ **NÓ LÀ ĐƯỜNG VÒNG QUA XÁC THỰC** (giả `/me` trả 200 nên vào thẳng, không cần đăng nhập).
`security.md` buộc mọi endpoint phải xác thực ⇒ nó **không được phép tồn tại trong bản chạy
thật**. Ba lớp chặn:

1. Nơi gọi trong `main.tsx` nằm trong `import.meta.env.DEV` + `import()` **động** → Vite thay
   hằng bằng `false`, Rollup vứt luôn cả chunk.
2. Trong dev vẫn phải bật tường minh `?xem-thu=1`.
3. Module tự chặn theo `location.hostname` — chỉ localhost.

`apps/web/test/conventions/xem-thu-chi-dev.test.ts` canh 4 điểm ở tầng nguồn, phòng mai ai đó
"dọn cho gọn" rồi bỏ mất cổng DEV. Lớp còn lại là **grep `dist/` trước deploy**.

Đã kiểm trên bundle production **đang chạy thật**: 0/6 dấu vết, đúng 1 chunk JS.

## 6. Đã deploy gì

| Thành phần | Phiên bản | Ghi chú |
|---|---|---|
| `vat-web` | **`7f7c7777`** | Thang chữ 18px + changelog v2.1 |
| `vat-api` | `354ff45c` | **Không đụng** |
| Migration | tới `0019` | **Không áp thêm** |
| `vat-sync-worker` | `e7a641fc` | **Không đụng** |

Nghiệm thu trên bundle production thật: CSS mang đúng `14/15/18/18/22/26/32/40`, changelog
v2.1 có mặt, 0 dấu vết chế độ xem thử.

Commit: `4cd0f62` (thang chữ + changelog), `f3866e7` (chế độ xem thử). Đã push trục.

### ⚠️ Kỹ thuật deploy khi phiên khác đang sửa cùng app

Lúc deploy, `apps/web/worker.ts` đang mang route `/tai/` **chưa commit, chưa QA** của U37c.
`wrangler deploy` bình thường sẽ đóng gói luôn nó — tức ship code của đơn vị khác. Cách né mà
**không đụng file của họ**:

```bash
git show HEAD:apps/web/worker.ts > apps/web/worker.deploy.tmp.ts
sed 's#"main": "worker.ts"#"main": "worker.deploy.tmp.ts"#' apps/web/wrangler.jsonc > apps/web/wrangler.deploy.tmp.jsonc
npx wrangler deploy --config wrangler.deploy.tmp.jsonc   # chạy trong apps/web
rm apps/web/worker.deploy.tmp.ts apps/web/wrangler.deploy.tmp.jsonc
```

Rẻ hơn dựng worktree (khỏi `npm install`). Đã kiểm `git status` trước và sau: cây làm việc của
phiên kia nguyên vẹn.

### ⚠️ `/tai/<gì đó>` trả 200 KHÔNG có nghĩa route đã ship

`vat-web` đặt `not_found_handling: single-page-application` ⇒ **mọi** path lạ đều trả
`index.html` với mã 200. Muốn biết một route có thật hay không thì **grep bundle/worker**,
đừng đọc mã HTTP.

## 7. Nợ kỹ thuật phát sinh trong phiên

| Nợ | Mức | Ghi chú |
|---|---|---|
| `apps/api/.dev.vars` không dùng được: trỏ Postgres localhost không tồn tại + tên biến Hyperdrive lỗi thời (`WRANGLER_…` → `CLOUDFLARE_…`) | **trung bình** | Chặn mọi việc cần chạy API local. Sửa được trong ~15 phút nếu có Postgres cục bộ hoặc trỏ thẳng Neon |
| Chế độ xem thử chỉ phủ ~8 endpoint đọc; ghi/hành động trả `{ok:true}` giả | thấp | Đủ để soi giao diện, KHÔNG phải bằng chứng về hành vi hệ thống |
| QĐ-9b mới phủ `apps/web`; `apps/admin` có thang token **riêng** (16/14) chưa đồng bộ | thấp | Chủ ý để ngoài phạm vi phiên này |

## 8. Vệ sinh repo đã bị vi phạm — CHƯA sửa

Phiên **U37c chạy song song trên cùng cây làm việc** đã `git add` gộp file của phiên này vào
commit của họ:

- `e088d51` — *"feat(U37c): Gói 1 — migration 0021 token/nmten/so_luot_tai"* — **nuốt**
  `primitives.tsx`, `DashboardPage.tsx`, `tokens.css` (phần 16px của QĐ-9b).

Trái quy ước *"commit nhỏ, không trộn nhiều đơn vị công việc"* của Hiến pháp. **Không viết lại
lịch sử** vì commit đã đẩy lên trục và phiên kia vẫn đang chạy — sửa lúc đó hại hơn để nguyên.

**Hệ quả cần biết khi truy vết:** phần 16px của QĐ-9b nằm dưới nhãn U37c; chỉ phần 16→18 mới ở
commit đúng tên (`4cd0f62`). Muốn dọn thì làm **sau khi U37c đóng lại**.

## 9. Trạng thái cổng DoD lúc đóng phiên

`make lint` **ĐỎ**, nhưng lỗi **không thuộc phiên này**:

```
apps/api/test/integration/taiCongKhai.test.ts(24,47): error TS2304: Cannot find name 'BlobPart'
```

File **chưa track**, thuộc U37c, đang được viết dở. `@vat/web` và mọi workspace khác đều
**SẠCH**; `apps/web` có 411/411 test xanh, Biome sạch 128 file.

Hook DoD gác **toàn repo**, không gác riêng diff của ai — nên việc dở của phiên khác chặn cổng
của mọi người. **Cổng tự hết đỏ khi họ commit.** Không sửa file họ vừa chạm vài phút trước:
dễ xung đột hoặc xoá mất việc đang viết.

## 10. Việc cần quyết

1. **18px đã ưng chưa, sau khi dùng thật vài ngày?** Thanh dò trong chế độ xem thử vẫn còn —
   dò ra số khác thì báo, sửa 2 file là xong (`07-DESIGN_TOKENS.md` §4+§7, `tokens.css`).
2. **Có sửa `apps/api/.dev.vars` cho chạy được API local không?** Sẽ bỏ được phần lớn nhu cầu
   dùng chế độ xem thử.
3. **Có đồng bộ thang chữ sang `apps/admin` không?** Hiện là nguồn token thứ hai, thân 16px.

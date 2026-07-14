# Kế hoạch U15 — Frontend: SPA khách-hàng-thấy (cụm duy nhất: đặc tả · ánh xạ dữ liệu · UX)

> Trạng thái: **⬜ KẾ HOẠCH — CHƯA HIỆN THỰC.** Đây là **lớp thứ ba** (Tầng trình bày) mà U0–U12 cố ý chưa chạm (chỉ có PoC `frontend/index.html`). U15 khép lỗ hổng đó.
>
> Nguồn "làm gì": kiến trúc mục 5 (Tầng trình bày = Web SPA + API kế toán + Cổng Admin), mục 12 GĐ4; ADR-0001 mục 6 ("Frontend: React/Next.js hoặc SvelteKit trên Workers Static Assets/Pages"); `CLAUDE.md` §Ngăn xếp. Nguồn "làm thế nào": `TRIEN_KHAI_BANG_CLAUDE_CODE.md` mục 1 (vòng lặp) + mục 4 (khuôn prompt). Luật áp dụng: `security.md`, `multi-tenant.md`, `testing.md`. **KHÔNG** đụng `gdt-adapter.md` (U15 không gọi GDT — chỉ gọi API Worker nội bộ).
>
> **Vì sao "1 cụm U15" nhưng có lát cắt con:** chủ dự án yêu cầu một cụm frontend duy nhất. Để không vi phạm nguyên tắc "mỗi vòng lặp một đơn vị nhỏ, kiểm thử được" (`TRIEN_KHAI` mục 0), U15 là **một mục trong danh sách** nhưng chạy qua **lát cắt con U15.0→U15.5 theo thứ tự**, mỗi lát tự chạy + tự test. `/start-unit 13` xử lý tuần tự từng lát.

---

## Tiền đề đã kiểm chứng — bề mặt API/dữ liệu TÁI DÙNG, KHÔNG dựng lại

U15 **thuần frontend**: chỉ tiêu thụ API Worker `apps/api` đã có (U6–U11). Không thêm endpoint backend, không đụng DB/GDT. Bề mặt thật (đọc từ mã, không suy đoán):

| Endpoint (đã có) | Vai trò UI | RBAC | Nguồn |
|---|---|---|---|
| `POST /auth/login` `{email,password}` → `{token}` | Đăng nhập nội bộ, phát JWT HS256 (`tenant_id`+`role`, 8h) | công khai | `apps/api/src/routes/auth.ts` |
| `GET /invoices?<lọc>&limit&offset` | Danh sách hóa đơn + lọc + phân trang | 3 vai | `routes/invoices.ts`, `@vat/query` |
| `GET /invoices/summary?<lọc>` | Thẻ tổng hợp (count + tổng tiền theo chiều) | 3 vai | `@vat/query summarize` |
| `GET /invoices/:id` | Chi tiết hóa đơn (**chỉ header**, không dòng hàng) | 3 vai | `routes/invoices.ts` (U6 #2) |
| `POST /exports?format=xlsx\|csv&<lọc>` → `{id,key,url}` | Nút kết xuất → nhận link tải | **kế toán trưởng + quản trị** | `routes/exports.ts:45` |
| `POST /exports/convert?profile&format&<lọc>` | Convert phần mềm kế toán (profile) | kế toán trưởng + quản trị | `routes/exports.ts:90` |
| `GET /exports/:id` | Tải file kết xuất (stream R2, giới hạn tenant) | (như trên) | `routes/exports.ts:130` |
| `GET /reconcile?<lọc>` | Màn đối chiếu (4 loại phát hiện + tóm tắt) | 3 vai (kế toán+) | `routes/reconcile.ts`, `@vat/reconcile` |

**Bộ lọc chuẩn (một tập dùng chung mọi màn)** — `packages/query/src/filters.ts`: `chieu`∈{`purchase`,`sold`}, `nguon`∈{`normal`,`sco`}, `tuNgay`/`denNgay` (`YYYY-MM-DD`), `ttxly`(int), `tthai`(int), `nbmst`, `nmmst`; phân trang `limit`≤**200**, `offset`≥0 (mặc định 50/0).

**RBAC 3 vai** (`apps/api/src/rbac.ts`, nguồn chân lý): `ke_toan` < `ke_toan_truong` < `quan_tri`. Đọc `/invoices*`,`/reconcile` = cả 3 vai; kết xuất `/exports*` = **chỉ `ke_toan_truong`+`quan_tri`** (`ke_toan` → 403). UI phải phản chiếu đúng ma trận này (ẩn/khóa nút, không dựa vào server chặn để giấu).

**Ràng buộc dữ liệu bắt buộc tôn trọng ở UI:**
- **Tiền = CHUỖI numeric, có thể vượt 2^53** (`columns.ts:33`, mục 7.1). UI **KHÔNG** `Number(x)`/`parseFloat` — định dạng phân nhóm nghìn bằng thao tác chuỗi/`BigInt`/thư viện decimal. Sai số tiền là lỗi nghiêm trọng.
- **`tdlap` là thời khắc UTC** (`YYYY-MM-DDTHH:mm:ssZ`, quan sát luôn `17:00:00Z` = `00:00` giờ VN — `CHECKLIST` U2 dòng 124–126). UI hiển thị theo **giờ VN (UTC+7)**, không lệch ngày.
- **`ttxly`/`tthai` lưu MÃ SỐ; nhãn tiếng Việt do FRONTEND gắn** (`columns.ts:2-3`, `U6-plan:31`, `U7-plan:15` đều "để tầng frontend"). Đây là **trách nhiệm dữ liệu của U15** (xem §4B).

---

## Phạm vi

Dựng SPA production cho **các API đã tồn tại**, thay thế PoC `frontend/index.html`. Ba trục theo yêu cầu: **đặc tả (4A) · ánh xạ dữ liệu (4B) · trải nghiệm người dùng (4C)**.

### 4A. Đặc tả kỹ thuật

- **Ngăn xếp (đề xuất mặc định, chốt ở Điểm mơ hồ #1):** React + TypeScript + **Vite** SPA, triển khai **Workers Static Assets** (cùng account API — Service Binding khi cần), dữ liệu qua **TanStack Query**, form/validate **Zod** (dùng lại schema kiểu từ `@vat/query` nếu chia sẻ được), i18n **tiếng Việt trước**. Kiểm thử: **Vitest + Testing Library** (unit/component, jsdom) + **Playwright** (E2E happy-path). Lint/format **Biome**, kiểu `tsc --noEmit` — nối vào `make lint`/`make test` sẵn có.
- **API client gõ kiểu:** một module `apiClient` bọc `fetch`, tự đính `Authorization: Bearer <jwt>`; ánh xạ mã lỗi backend → hành vi UI: **401** (thiếu/hết hạn token) → về màn đăng nhập; **403** (sai vai) → chặn hành động + thông báo; **400** → lỗi nhập liệu; **404** → không tìm thấy. Timeout + báo lỗi mạng thân thiện.
- **Không bí mật ở client** (`security.md`): JWT giữ **trong bộ nhớ** (không `localStorage` cho token nếu tránh được XSS-exfil; nếu cần bền phiên → chốt ở Điểm mơ hồ #3). **Không** MST/mật khẩu thuế trong mã; **không** log token.

### 4B. Ánh xạ dữ liệu (API → giao diện)

**Cột bảng hóa đơn** = `EXPORT_COLUMNS` (`packages/export/src/columns.ts`, nguồn chân lý — không bịa cột mới): `tdlap` Ngày lập · `khmshdon` Ký hiệu mẫu số · `khhdon` Ký hiệu HĐ · `shdon` Số HĐ · `nbmst`/`nbten` Người bán · `nmmst`/`nmten` Người mua · `tgtcthue` Tiền chưa thuế · `tgtthue` Tiền thuế · `tgtttbso` Tổng thanh toán · `dvtte` Tiền tệ · `ttxly`/`tthai` Trạng thái (mã) · `chieu`/`nguon`.

| Trường | Loại | Quy tắc hiển thị |
|---|---|---|
| `tdlap`, `ncnhat` | thời khắc UTC | Đổi sang giờ VN (UTC+7), format `dd/MM/yyyy` (giờ khi cần); không lệch ngày |
| `tgtcthue`,`tgtthue`,`tgtttbso`,`ttcktmai`,`tgia` | chuỗi numeric | Phân nhóm nghìn KHÔNG ép float; căn phải; giữ chính xác >2^53 |
| `ttxly`,`tthai` | mã int | Ánh xạ nhãn (bảng dưới) — **chỉ mã đã kiểm chứng**; mã lạ → hiện số + "(chưa rõ)" |
| `chieu` | `purchase`/`sold` | "Mua vào" / "Bán ra" |
| `nguon` | `normal`/`sco` | "HĐĐT thường" / "Máy tính tiền" |

**Bảng nhãn trạng thái do U15 sở hữu — gán theo Nguyên tắc bằng chứng:** chỉ ánh xạ mã **đã kiểm chứng** (`tthai=1` đã quan sát — ADR-0001 dòng 45). Mã hủy/thay thế `tthai`/`ttxly` **CHƯA KIỂM CHỨNG** (map production trong `@vat/reconcile statusCodes.ts` đang RỖNG có chủ đích). ⇒ Bảng nhãn frontend **cùng kỷ luật**: mã chưa probe hiển thị **số + "(chưa rõ)"**, KHÔNG đoán nhãn. Khi có probe (đơn vị đối chiếu), điền đồng bộ hai nơi.

**Đối chiếu (`GET /reconcile`)** → `ReconcileReport` (`packages/reconcile/src/types.ts`): 4 loại `Finding` — `lech_thue` (kèm `tgtcthue/ttcktmai/tgtthue/tgtttbso` + `lech` chuỗi), `thieu_so_dau_ra` (`nbmst/khhdon/shdonThieu` — là **nghi ngờ**, nhãn UI phải nói "nghi thiếu", không khẳng định), `huy`, `thay_the`; + `summary` (4 con số). UI: thẻ tóm tắt + danh sách nhóm theo loại, mỗi phát hiện dẫn tới hóa đơn liên quan.

### 4C. Trải nghiệm người dùng

- **Luồng chính:** Đăng nhập → Danh sách hóa đơn (lọc theo kỳ + chiều + nguồn + MST) → Chi tiết → Kết xuất/tải → Đối chiếu.
- **Mọi màn có 4 trạng thái tường minh:** loading (skeleton), rỗng (hướng dẫn), lỗi (thông báo + thử lại), dữ liệu. Không "màn trắng".
- **Phân quyền hiển thị:** vai `ke_toan` KHÔNG thấy nút kết xuất/convert (khớp 403 backend); `quan_tri`/`ke_toan_truong` thấy đầy đủ. Không hiển thị dữ liệu tenant khác (tin token, không nhận `tenant_id` từ client).
- **Bộ lọc kỳ thân thiện kế toán:** nút nhanh Tháng/Quý/Năm/Khoảng ngày → quy ra `tuNgay/denNgay`; nhớ bộ lọc gần nhất.
- **Tiền & số:** căn phải, phân nhóm nghìn, đơn vị tiền tệ; cảnh báo trực quan cho phát hiện lệch thuế.
- **i18n tiếng Việt, khả truy cập (WCAG AA):** nhãn form, điều hướng bàn phím, tương phản, `lang="vi"`, ARIA cho bảng/trạng thái.

### Lát cắt con (thứ tự thực thi, mỗi lát tự test)

1. **U15.0 — Khung + hạ tầng:** dựng `apps/web` (Vite/React/TS), build ra Workers Static Assets, harness test (Vitest+TL, Playwright), design tokens + i18n scaffold, `apiClient` gõ kiểu (JWT + ánh xạ 401/403/400/404), smoke test. → `make test` xanh trên khung.
2. **U15.1 — Đăng nhập + phiên + RBAC guard:** `POST /auth/login`, giữ JWT (mục 4A), guard route theo vai, đăng xuất, xử lý hết hạn (401→login). Test: đăng nhập đúng/sai, guard ẩn hành động theo vai.
3. **U15.2 — Tra cứu + lọc + tổng hợp:** bảng `GET /invoices` + `GET /invoices/summary`, toàn bộ bộ lọc + phân trang, formatter tiền-chuỗi + ngày-VN + nhãn trạng thái (§4B). Test: ánh xạ trường, formatter (ca >2^53), lọc→query params, phân trang.
4. **U15.3 — Chi tiết hóa đơn (header):** `GET /invoices/:id`; nêu rõ "dòng hàng chưa khả dụng" (backend U6 #2 chỉ header). Test render + 404.
5. **U15.4 — Kết xuất & convert + tải:** `POST /exports`, `POST /exports/convert` (chỉ profile khả dụng — U11 hiện chặn profile chưa kiểm chứng → UI ẩn/nêu rõ), `GET /exports/:id`; RBAC ẩn với `ke_toan`. Test: gọi đúng params, tải link, vai `ke_toan` không thấy nút.
6. **U15.5 — Đối chiếu:** `GET /reconcile`, render 4 loại finding + tóm tắt, nhãn "nghi thiếu" cho gap. Test theo bộ dữ liệu tình huống (mock API).

### NGOÀI phạm vi U15 (fence — phụ thuộc đơn vị BACKEND chưa có)

- ❌ **UI đăng nhập tài khoản THUẾ + nhập captcha:** backend **chưa có đường GHI token GDT** (`U12-plan:18`: token GDT hiện chỉ đọc/xóa, không nơi nào persist) và **chưa expose route captcha/authenticate** qua API Worker (U1 nằm trong adapter). ⇒ Chờ **đơn vị backend "đăng nhập/lưu token GDT"** rồi mới có U15 kế tiếp cho màn này. Captcha **do người dùng nhập** (Hiến pháp — không bao giờ tự giải).
- ❌ **Nút "Đồng bộ ngay" (on-demand sync):** `apps/sync-worker` chạy Cron/Queue, **chưa có endpoint HTTP** kích hoạt đồng bộ. Chờ backend expose "trigger sync".
- ❌ **Màn lịch sử đồng bộ:** chưa có route đọc `lan_dong_bo`. Chờ backend endpoint.
- ❌ **Cổng Admin (quản lý tenant/người dùng/gói):** chưa có API quản trị người dùng/tenant (U8 chỉ có `/auth/login`). Chờ đơn vị backend "Admin API".
- ❌ **Tích hợp webhook/pull API** cho phần mềm kế toán (U11 đã hoãn "webhook/pull tách sau").
- ❌ Không gọi GDT trực tiếp; không đụng lược đồ/DB; không thêm endpoint backend trong U15.

---

## File sẽ tạo (đề xuất — chốt sau Điểm mơ hồ #1)

```
apps/web/                         (mới — service frontend trong monorepo)
├── package.json, tsconfig.json, vite.config.ts, wrangler.jsonc   # workspace + Static Assets
├── vitest.config.ts, playwright.config.ts                         # test harness
├── src/
│   ├── main.tsx, app.tsx, routes/                                 # khung SPA + điều hướng + guard vai
│   ├── lib/apiClient.ts                                           # fetch bọc JWT + ánh xạ 401/403/400/404
│   ├── lib/format.ts                                              # tiền-chuỗi (không float), ngày-VN
│   ├── lib/statusLabels.ts                                        # nhãn ttxly/tthai — CHỈ mã đã kiểm chứng
│   ├── lib/i18n/vi.ts                                             # chuỗi tiếng Việt
│   ├── features/auth/  invoices/  exports/  reconcile/            # theo lát cắt U15.1–U15.5
│   └── components/                                                # bảng, bộ lọc kỳ, trạng thái loading/empty/error
└── test/ (unit + e2e)
```
Sửa: `Makefile`/CI (đưa test frontend vào `make test`/`make lint`), `README.md` (cách chạy web), gỡ/đánh dấu `frontend/index.html` là PoC lịch sử. **Không** đụng `apps/api`, `packages/*` (trừ import kiểu chia sẻ nếu an toàn).

## Test viết trước (TDD)

- **unit/component (Vitest + Testing Library, offline, mock `apiClient`):** formatter tiền (round-trip chuỗi, ca `>2^53`, âm, null→trống), ngày UTC→VN (không lệch ngày ở `17:00:00Z`), nhãn trạng thái (mã đã kiểm chứng → nhãn; mã lạ → "số (chưa rõ)"); bộ lọc → đúng query params (`limit`≤200); guard vai ẩn nút kết xuất với `ke_toan`; 4 trạng thái mỗi màn.
- **integration (mock API layer):** đăng nhập lưu/hết hạn token (401→login); danh sách + phân trang + summary; 403 chặn kết xuất; đối chiếu render 4 loại finding.
- **e2e (Playwright, API giả/hoặc `apps/api` PGlite):** happy-path đăng nhập → lọc kỳ → xem danh sách → tải kết xuất → xem đối chiếu; a11y smoke (điều hướng bàn phím, `lang=vi`).

## Tiêu chí nghiệm thu (đo được)

1. **Đăng nhập + phiên + RBAC:** login đúng phát JWT + vào app; sai → lỗi gọn; 401 → về đăng nhập; nút kết xuất **ẩn với `ke_toan`**, hiện với `ke_toan_truong`/`quan_tri` (khớp `rbac.ts`). Có test.
2. **Tra cứu:** mọi bộ lọc (`chieu/nguon/tuNgay/denNgay/ttxly/tthai/nbmst/nmmst`) + phân trang (`limit`≤200) hoạt động; bảng đúng `EXPORT_COLUMNS`.
3. **Ánh xạ dữ liệu đúng:** tiền hiển thị **không ép float** (test `>2^53` chính xác); ngày theo giờ VN; nhãn trạng thái **chỉ cho mã đã kiểm chứng**, mã lạ → số+"(chưa rõ)" (không đoán — Nguyên tắc bằng chứng).
4. **Kết xuất/đối chiếu:** tạo được kết xuất + tải link; convert chỉ profile khả dụng; đối chiếu render 4 loại + tóm tắt, gap nhãn "nghi thiếu".
5. **Cách ly tenant ở client:** UI không gửi/không tin `tenant_id` từ client (lấy từ token); không lộ dữ liệu tenant khác. **Không bí mật trong mã/log.**
6. **Chất lượng:** `make lint` sạch (Biome + `tsc`); `make test` xanh gồm test frontend; coverage tầng logic UI (formatter/mapping/guard) ≥ **80%**; a11y smoke đạt; cập nhật README + checklist; commit nhỏ theo lát cắt. Chạy **hồi quy U0–U15 xanh** trước khi coi cụm là xong.

## Ràng buộc bắt buộc chạm tới

- ✅ **`security.md`:** không bí mật ở client; JWT giữ an toàn (mục 4A/#3); không log token; không mật khẩu thuế; captcha (khi tới) do người dùng nhập.
- ✅ **`multi-tenant.md`:** client KHÔNG là biên tin cậy — `tenant_id` luôn từ token phía server; UI chỉ hiển thị thứ API trả trong phạm vi tenant.
- ✅ **Nguyên tắc bằng chứng:** nhãn `ttxly`/`tthai` chỉ gán cho mã đã kiểm chứng; đồng bộ kỷ luật với `@vat/reconcile statusCodes` (không tạo nguồn nhãn "đoán").
- ✅ **`testing.md`:** TDD đỏ→xanh; test offline (mock API/PGlite); ≥80% tầng logic UI.
- ⚪ **`gdt-adapter.md`:** KHÔNG áp dụng (U15 không gọi GDT).

## Rủi ro & phụ thuộc

- 🟠 **Phụ thuộc hợp đồng API `apps/api`** (U6–U11) — ổn định, đã test. Nếu backend đổi shape phản hồi, cập nhật `apiClient` + test (một chỗ).
- 🔴 **Màn giá trị cao nhất (đăng nhập thuế + đồng bộ) bị chặn bởi backend chưa có đường ghi token/route captcha/trigger sync.** ⇒ U15 giao **sản phẩm đọc-và-kết-xuất hoàn chỉnh**, nhưng "kéo hóa đơn mới từ UI" cần đơn vị backend trước. Nêu rõ trong bàn giao, không giả vờ đủ.
- 🟠 **Nợ hạ tầng kế thừa** (Hyperdrive/role app U6/U8/U9) vẫn treo — E2E thật cần backend deploy được; test U15 dùng API giả/PGlite để không bị chặn.
- 🟠 **Precision tiền**: bẫy `Number()` phổ biến — chốt formatter chuỗi + test `>2^53` ngay ở U15.2, không để lọt.

## Điểm mơ hồ — DỪNG và hỏi (Hiến pháp §"Khi gặp mơ hồ")

### #1 — Ngăn xếp frontend: React+Vite SPA (đề xuất) hay Next.js/SvelteKit?
- **Bằng chứng:** ADR-0001 để mở "React/Next.js hoặc SvelteKit". Dữ liệu per-tenant sau đăng nhập ⇒ SSR không bắt buộc → SPA client-render đủ và đơn giản nhất trên Static Assets.
- **Đề xuất mặc định:** **React + TypeScript + Vite SPA**. Đổi sang Next.js nếu sau này cần SSR/SEO cho trang marketing; SvelteKit nếu muốn bundle nhỏ hơn.

### #2 — Phạm vi cụm: chỉ SPA đọc/kết-xuất (đề xuất) hay gồm cả màn "đăng nhập thuế + captcha"?
- **Bằng chứng:** chưa có backend ghi token GDT / route captcha (fenced ở trên).
- **Đề xuất mặc định:** U15 **chỉ** dựng trên API đã có; màn đăng nhập-thuế tách **U14 (sau khi có backend token-write)**. Nếu chủ dự án muốn gộp → phải chèn một đơn vị backend trước, U15 sẽ phình + phụ thuộc việc chưa chốt.

### #3 — Lưu JWT: chỉ trong bộ nhớ (đề xuất, an toàn XSS) hay bền phiên (localStorage/cookie)?
- **Bằng chứng:** `security.md` ưu tiên tối thiểu lộ bí mật; token 8h.
- **Đề xuất mặc định:** **in-memory + đăng nhập lại khi tải trang**; nếu cần "nhớ phiên" → **cookie `HttpOnly` do một Worker phát** (không `localStorage` cho token). Chốt trước U15.1.

---

**Bàn giao.** U15 là **một cụm frontend** chạy qua 6 lát cắt (U15.0→U15.5), phủ trọn **spec + ánh xạ dữ liệu + UX** cho bề mặt API đã tồn tại — khép lớp thứ ba của kiến trúc. Ba việc "kéo dữ liệu mới từ UI" (đăng nhập thuế/captcha, đồng bộ ngay, Admin) **fenced** vì cần đơn vị backend trước. **Chờ 3 quyết định** (#1 ngăn xếp · #2 phạm vi · #3 lưu JWT). Sau khi chốt: `/write-prompt 13` → `/start-unit 13` (chạy lát cắt tuần tự). Review chéo: `dod-auditor` + `security-reviewer` (client secret/tenant leak) mỗi lát; rà UX/a11y thủ công.

# Kế hoạch triển khai Production — `vatengine.tourdao.vn`

> ## ⚠️ SỰ CỐ 2026-07-22 — build thiếu biến ⇒ MẤT ĐĂNG NHẬP toàn hệ thống (đã khắc phục)
>
> **Việc đang làm:** deploy `vat-web` cho thay đổi ẩn trang Đối chiếu (PR #32, chỉ đụng `apps/web`).
>
> **Chuyện gì xảy ra:** `VITE_TURNSTILE_SITE_KEY` (U33) được **nhúng lúc build**, nhưng **KHÔNG có trong `apps/web/.env.production`** — bản deploy trước đó truyền nó qua dòng lệnh. Lần build này chạy `npm run build -w apps/web` trơn ⇒ bundle **mất site key** ⇒ SPA hiện *"Hệ thống chưa cấu hình kiểm tra bảo mật"* và **khoá nút Đăng nhập**. Toàn bộ khách hàng không đăng nhập được. Version hỏng: `8e2a83ec-125f-4896-8172-31b4c2abc083`.
>
> **Vì sao smoke không bắt được:** bộ smoke đã chạy (`/` → 200, đúng bundle mới, `to:"/reconcile"` → 0, `/api/health` → 200, đủ 4 security header) **toàn bộ đều XANH** trong khi đăng nhập đã chết. Đây đúng là cái bẫy `.claude/rules/deploy.md` đã cảnh báo: *"`/health` vẫn 200 trong khi `/me` đã 500; `/health` không đủ để kết luận deploy an toàn."* Lần này biến thể mới: **lỗi nằm ở tầng SPA render**, không lộ ra ở bất kỳ mã HTTP nào.
>
> **Khắc phục:** build lại kèm `VITE_TURNSTILE_SITE_KEY=…` → deploy Version `0de14f64-36b1-4c19-83e6-0b5ea95d2885` → xác minh bằng MẮT trên production: widget Turnstile hiện, nút Đăng nhập bật lại. Tổng thời gian mất đăng nhập ≈ 4 phút.
>
> **Luật rút ra (bắt buộc từ nay):**
> 1. **Mọi biến `VITE_*` mà production cần PHẢI nằm trong `apps/web/.env.production`.** Truyền qua dòng lệnh là bẫy: `wrangler deploy` vẫn báo thành công, không ai biết cho tới khi khách kêu. **CÒN NỢ: `VITE_TURNSTILE_SITE_KEY=0x4AAAAAAD6d5RwMpZVh-PZq` chưa được ghi vào file đó** (hook chặn Claude ghi file `.env`) — chủ dự án phải tự thêm, nếu không lần build sau lặp lại y hệt sự cố này.
> 2. **Smoke SPA phải mở trang bằng mắt, không chỉ curl mã trạng thái.** Tối thiểu: `/login` render đủ widget captcha + nút Đăng nhập KHÔNG bị khoá.
> 3. **Trước khi deploy SPA, so bundle cũ với bundle mới xem có mất hằng số cấu hình nào không** — lệnh dưới bắt được đúng lớp lỗi này:
>    ```bash
>    curl -s "https://vatengine.tourdao.vn$(curl -s https://vatengine.tourdao.vn/ | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js')" \
>      | grep -oE '0x4[A-Za-z0-9_-]{10,}'      # site key phải còn; rỗng = SẮP mất đăng nhập
>    ```
>
> Trạng thái: **🟢 PRODUCTION LIVE — đã deploy sheet xuất PHẲNG (2026-07-21, sau tinh chỉnh xuất).** Site chạy tại `https://vatengine.tourdao.vn` (same-origin, **phiên bằng cookie HttpOnly**, đủ 4 security header). **Cổng đăng ký công khai `POST /api/dang-ky` đã sống.** Còn treo: HSTS+WAF tầng zone (Bước 5), **màn duyệt tenant `cho_duyet` (U18 — chưa có, nên tenant đăng ký mới hiện KHÔNG ai duyệt được)**, verify đồng bộ HĐ thật (cần token GDT + captcha của chủ dự án).
>
> **Nhật ký deploy cụm U-K registry-UI (K1→K4) — 2026-07-23 (đã kiểm chứng):** Merge nhánh `feat/uk-registry-ui` (K1→K4) vào trục qua merge-commit `821dc76`, push origin (`59d758a..821dc76`). Cụm: Registry miền hoá đơn (`packages/domain`) làm một-nguồn-sự-thật; `EXPORT_COLUMNS`+bảng+allowlist ORDER BY+FilterBar dẫn xuất từ đó; 3 yêu cầu giao diện xong — (1) chọn kỳ dropdown (Tháng/Quý/Năm cụ thể, kể cả quá khứ), (2) mặc định tháng hiện tại, (3) đổi tên nút "Lọc dữ liệu"/"Đồng bộ và tải xuống" + tự tải sau đồng bộ thủ công. **(0) KHÔNG có migration mới** — cụm thuần frontend/domain (`git diff` trên `packages/db/migrations` chỉ hiện `0015` của doi-mst đã có sẵn trên trục; luật `deploy.md` "migrate trước" KHÔNG áp dụng cho cụm này). File xuất csv/xlsx **bất biến** (test golden K1 không đổi vẫn xanh). **Merge sạch, KHÔNG xung đột** (`git merge-tree` rỗng — doi-mst đụng `apps/admin`+`apps/api`, registry-UI đụng `apps/web`+`packages`, không giao). **CHỈ deploy `vat-web`** (registry-UI thuần frontend; `packages/query`/`packages/export` chỉ refactor dẫn xuất, đầu ra byte-identical nên hành vi `vat-api` KHÔNG đổi ⇒ khỏi deploy `vat-api`, tránh phải áp migration `0015` của doi-mst — đó là deploy riêng của chủ dự án). **(1)** `make lint` sạch trên trục GỘP; `make test` xanh (apps/web 307, apps/api 48/48 khi chạy riêng — full-run flaky do máy ngủ giữa chừng làm PGlite timeout, chạy lại xác nhận xanh). **(2)** Build SPA `npm run build -w apps/web` (tự nạp `.env.production`: `VITE_API_BASE=/api` + `VITE_TURNSTILE_SITE_KEY` — chủ dự án ĐÃ vá "CÒN NỢ" sự cố 2026-07-22, key nay nằm trong file) → bundle `index-Bny4TU46.js`. **Chốt chặn sự cố 2026-07-22:** grep bundle **có** `0x4AAAAAAD6d5RwMpZVh-PZq` trước deploy. **(3)** Deploy `vat-web` (Version `f475ddef-af76-4e01-90ab-a92428d1e2e8`; custom domain `vatengine.tourdao.vn`, binding `env.API`→vat-api + `env.ASSETS`). **(4) Smoke production 6/6:** SPA `/` **200** nạp đúng bundle mới `index-Bny4TU46.js`; **site key CÒN trong bundle production** (không lặp mất-đăng-nhập); nhãn nút registry-UI "Lọc dữ liệu"+"Đồng bộ và tải xuống" **có trong bundle live**; `/api/health` **200 `env=production`** (front-door→vat-api thông); `POST /api/auth/login` → **400 `{"error":"thieu_captcha"}`** (chính handler auth vat-api trả lời ⇒ front-door→vat-api healthy; login bắt Turnstile là ĐÚNG U33, curl không có token nên dừng ở lớp captcha — KHÔNG phải lỗi); **đủ 4 security header**. **CHƯA kiểm chứng bằng mắt/tính năng trên production** (ranh giới thành thật): mở màn Hóa đơn thấy dropdown chọn kỳ + mặc định tháng này + bấm "Lọc dữ liệu"/"Đồng bộ và tải xuống" ra file — **cần đăng nhập tenant thật + giải captcha của chủ dự án** (Claude không giải captcha, không đăng nhập tenant); smoke ở trên chỉ chứng minh bundle CHỨA tính năng + trang PHỤC VỤ, chưa chạm UX đầu-cuối. **CÒN LẠI riêng của chủ dự án:** deploy doi-mst (PR #35 — `vat-api` với `0015 doi_mst_tenant` + `vat-admin`) là deploy độc lập cần `make migrate` áp `0015` TRƯỚC (cần `DATABASE_URL` production — Claude không có). **(5) Bổ sung changelog + redeploy:** thêm mục `v1.6` "Chọn kỳ nhanh hơn & thao tác rõ ràng hơn" vào `apps/web/src/lib/changelog.ts` (Lịch sử cập nhật, ngôn ngữ người dùng cuối) + cập nhật test about (`v1.5`→`v1.6`); rebuild → bundle `index-CVqtcPl4.js` → redeploy `vat-web` (Version `b197148d-2760-4005-a455-33ec379ae35c`). Smoke: bundle mới live, `v1.6`+"Chọn kỳ nhanh hơn" hiển thị production, site key còn, `/api/health` 200, 4/4 header.
>
> **Nhật ký deploy sheet xuất PHẲNG — 2026-07-21 (đã kiểm chứng):** PR #25 merge (`--merge`) vào trục (`9e91a537`). File xuất xlsx/csv gộp về MỘT sheet phẳng: mỗi mặt hàng một dòng kèm đủ ngữ cảnh hóa đơn; bỏ cột "Số dòng hàng" + sheet tổng quan; tiền cấp HĐ nhãn "(cả HĐ)"; hóa đơn chưa có dòng hàng vẫn xuất MỘT dòng. (0) **KHÔNG có migration mới**; PR này CHỈ đụng `packages/export` (chạy trong `vat-api`) + route `apps/api`, **KHÔNG đụng `apps/web`** ⇒ **chỉ deploy `vat-api`, KHỎI build/deploy SPA** (kiểm: `git diff origin/trunk~1 origin/trunk -- apps/web` trống). Deploy từ worktree khớp origin trunk (`git diff origin/feat/cloudflare-stack-u0 HEAD` **trống**). (1) Deploy `vat-api` (Version `ba430143-ebea-445e-a3ff-956c1185cc26`; Hyperdrive `1011ff82…`, `env=production`). (2) Smoke: `/api/health` **200 `env=production`**; login sai → **401**; SPA `/` **200** (bundle cũ, không đổi). **ĐÃ nghiệm thu bằng mắt trên APP LOCAL trước deploy** (chủ dự án duyệt): HĐ vé tách 3 dòng đúng, HĐ chưa có dòng vẫn hiện, một sheet, số lượng bỏ đơn vị. **CHƯA smoke tính năng trên production** (cần đăng nhập tenant thật — smoke ở trên KHÔNG đăng nhập). **Gotcha:** PR chỉ đụng logic export server-side ⇒ chỉ cần `vat-api`; đừng deploy thừa `vat-web` (encoder xlsx/csv chạy TRONG vat-api, không phải ở SPA).
>
> **Nhật ký deploy tinh chỉnh xuất — 2026-07-21 (đã kiểm chứng):** PR #24 merge (`--merge`) vào trục (`9d217eaf`) — 3 tinh chỉnh sau nghiệm thu: (1) bỏ đơn vị ở cột số lượng (màn hình + ô sheet 1; đơn vị vẫn còn ở cột ĐVT sheet 2); (2) tên file tải về `vatengine-export-<ddmmyyyy>-<ddmmyyyy>.xlsx` theo khoảng ngày lọc — dùng đuôi THẬT `.xlsx` chứ KHÔNG `.xls` (file OOXML, đặt `.xls` khiến Excel cảnh báo lệch định dạng); (3) sheet 2 "Chi tiết dòng hàng" thành sheet PHẲNG — mỗi mặt hàng một dòng KÈM ngữ cảnh hóa đơn (Ngày lập/Ký hiệu/Số HĐ/MST+Tên bán/MST+Tên mua/Chiều/Nguồn) để lọc/pivot/cộng thẳng. (0) **KHÔNG có migration mới**; đổi cả `packages/export` (chạy trong `vat-api`) lẫn `apps/web` (SPA) ⇒ deploy CẢ HAI worker. Deploy từ worktree khớp origin trunk (`git diff origin/feat/cloudflare-stack-u0 HEAD` **trống**). (1) Build lại SPA → bundle `index-C9jHC_aU.js`. (2) **`vat-api` TRƯỚC** (Version `72d0362b-e696-4a94-b6d9-49193dec240e`; Hyperdrive `1011ff82…`, `env=production`), **`vat-web` SAU** (Version `a7343d34-9c4e-4993-82c1-d44c3abe4534`). (3) Smoke: `/api/health` **200 `env=production`**; login sai → **401**; SPA `/` **200** + nạp đúng bundle mới `index-C9jHC_aU.js`; **đủ 4 security header**. **CHƯA kiểm chứng bằng mắt trên production (chủ dự án xác nhận sau):** cột số lượng đã bỏ đơn vị, tên file, và sheet 2 phẳng lọc/cộng được — smoke ở trên KHÔNG đăng nhập nên chưa chạm dữ liệu thật.
>
> **Nhật ký deploy U29–U32 — 2026-07-21 (đã kiểm chứng):** PR #22 merge (`--merge`) vào trục (`ce9108c0`) — gồm U29 (xuất đủ field nghiệp vụ), U30 (chọn dòng để xuất + `/convert` nhất quán), U31 (lọc/sắp xếp theo cột server-side), U32 (khối pháp nhân ở Tổng quan), các bản vá sau nghiệm thu (hiện đủ mặt hàng kèm số lượng riêng, bỏ tổng số lượng vô nghĩa, vá lệch cột html.zip, test canh ánh xạ file xuất), và một vá CI (`on.push.branches` thêm trunk — trước đó chỉ có `main` vốn chậm 159 commit ⇒ push trunk chưa từng chạy CI). (0) **KHÔNG có migration mới** trong PR này (`git diff origin/trunk HEAD -- packages/db/migrations` trống) ⇒ luật `deploy.md` "migrate trước" không áp dụng; production đã có `0009`/`0010` từ deploy U17b, mã U29–U32 chỉ đọc cột `hoa_don`/`dong_hang_hoa` có sẵn. Deploy từ worktree **đã đối chiếu khớp origin trunk** (`git diff origin/feat/cloudflare-stack-u0 HEAD` **trống** — vết sự cố 2026-07-16). (1) **Build lại SPA BẮT BUỘC** (15 file `apps/web` đổi): `VITE_API_BASE=/api vite build` → bundle `index-Ci5Hk3V5.js`. (2) Deploy **`vat-api` TRƯỚC** (Version `c0bbc542-49dd-4f5a-835e-c56bd187eeef`; bindings đúng: Hyperdrive `1011ff82…`, R2 `vat-raw`, 3 DO, `env=production`, `PBKDF2_ITERATIONS=100000`), **`vat-web` SAU** (Version `894fe6cb-356e-45a5-9307-589fa6a3f331`; custom domain `vatengine.tourdao.vn`). Thứ tự này an toàn: API mới tương thích SPA cũ trong cửa sổ giữa hai lần deploy. (3) Smoke production (sau ~15s chờ biên lan truyền): `/api/health` **200 `env=production`**; login sai → **401 chứ không 500** (chứng minh Hyperdrive→Neon→`auth_lookup_user` thông); SPA `/` **200** + nạp đúng bundle mới `index-Ci5Hk3V5.js`; **đủ 4 security header** (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy). **CHƯA kiểm chứng trên production (giới hạn quyền):** ① tính năng cột "Hàng hóa, dịch vụ (số lượng)" hiện đủ mặt hàng — cần **đăng nhập tenant thật của chủ dự án** (dữ liệu production là tenant cây xăng 22.350 HĐ; smoke ở trên KHÔNG đăng nhập); ② mở file xlsx bằng Excel thật (mới kiểm ở mức cấu trúc XML + test mutation). **Gotcha ghi lại:** ① `git diff origin/trunk HEAD` trống KHÔNG có nghĩa HEAD của worktree = commit trunk — PR `--merge` tạo commit gộp `ce9108c0` khác hash HEAD nhánh (`4e506b4`), nhưng **CÂY MÃ** khớp (do đã rebase lên trunk trước khi merge) nên deploy hợp lệ; kiểm bằng `git diff` (nội dung), không bằng so hash. ② Trunk đang bị **worktree khác giữ** (`u25-detail-queue` ở commit cũ `7f5ceae`) nên không `checkout` trunk ở repo chính được — deploy thẳng từ worktree `vat-export-field` (đã xác nhận cây mã khớp origin trunk). ③ Nhật ký này landing qua nhánh `docs/deploy-log-u29-u32` (trunk bị worktree giữ, không push thẳng được).
>
> **Nhật ký deploy Sửa MST trong Cổng Admin — 2026-07-23 (đã kiểm chứng):** PR #35 merge vào trục (`59d758a`, sau đó Registry UI merge tiếp `d09510f`). **(0) Tiền kiểm** (chỉ đọc): `doi_mst_tenant`/`doi_mst_api` chưa tồn tại; 6 tenant với `lan_dong_bo` phân biệt đúng hai ca (`4201969169`=593 → sẽ chặn, `1234567899`=0 → cho đổi). **(1)** `make migrate` áp `0015` — `[✓] applied successfully`. **(2) Hậu kiểm quyền 5/5:** hàm thuộc `doi_mst_api`; `vat_app` EXECUTE được; PUBLIC không; **`doi_mst_api` KHÔNG có quyền nào trên `hoa_don`** (ranh giới pháp lý — chỉ có SELECT `lan_dong_bo`, SELECT/UPDATE `tenants`, SELECT/DELETE `tai_khoan_thue`). **(3)** Deploy `vat-api` (`690eef1e`) + `vat-admin` (`ee12b31f`, bundle `index-DDvL8xmu` — verify chứa "Đổi mã số thuế" TRƯỚC khi deploy). KHÔNG deploy `vat-web` (đổi MST không đụng app khách). **⚠️ SỰ CỐ PHỐI HỢP:** lần deploy ĐẦU thất bại — một phiên Registry chạy SONG SONG trong cùng working directory đã checkout nhánh của nó giữa chừng, làm hai `wrangler deploy` build từ code KHÔNG có đổi MST (bắt được vì bundle admin ra hash y hệt bản cũ). Production không vỡ (Registry không đụng apps/api|admin) — chỉ thiếu tính năng. Deploy lại thành công sau khi phiên kia xong và working tree về trunk sạch. **Bài học: hai tác nhân KHÔNG được dùng chung một working directory để deploy; và luôn verify bundle chứa tính năng mới TRƯỚC khi `wrangler deploy`, không tin `wrangler` báo thành công.** **(4)** Cách ly hai cửa còn nguyên: khách→`/api/admin/doi-mst` = 404, origin admin = 302 (Access). **CÒN LẠI: nghiệm thu bằng người thật** — đăng nhập Cổng Admin, đổi MST `1234567899` (phải được + ngắt 1 kết nối), thử `4201969169` (phải 409 "đã có dữ liệu").

> **Nhật ký deploy Lát cắt 3 (U34/QĐ-14) — 2026-07-22 (đã kiểm chứng):** PR #34 merge vào trục (`d6a1565`). Thứ tự đúng luật `deploy.md`. **(0) Tiền kiểm TRƯỚC migrate** (chỉ đọc): `dat_mat_khau` và role `dat_mat_khau_api` **chưa tồn tại**; ảnh chụp ACL `auth_lookup_user` = `{auth_lookup=X/auth_lookup,vat_app=X/auth_lookup}`; `vat_app` non-superuser + NOBYPASSRLS; **2 hàng `nguoi_dung` còn `mat_khau_tam_het_han` đang sống** — bằng chứng cho quyết định GIỮ cổng chặn ở `routes/auth.ts` (Lát cắt 3 gỡ đường CẤP, không gỡ đường CHẶN). **(1)** `make migrate` áp `0014` — báo `[✓] migrations applied successfully` tường minh, không im lặng thoát. ⚠️ `make migrate` **không tự nạp** `.dev.vars`, phải `export DATABASE_URL` tay (gotcha U17b, vẫn đúng). **(2) Hậu kiểm 7/7 ĐẠT:** bảng có; RLS enable+force + **0 policy**; 2 hàm `dat_mat_khau_tao`/`dat_mat_khau_dung` thuộc `dat_mat_khau_api`; `vat_app` **có** EXECUTE; **PUBLIC KHÔNG** EXECUTE ← *ca PGlite không kiểm được vì chạy superuser*; **ACL `auth_lookup_user` GIỐNG HỆT trước migrate** ⇒ không lặp sự cố `0009`. **(3)** Deploy `vat-api` (`a27e6148`) → `vat-web` (`77202d7b`) → `vat-admin` (`f66b8984`). Trước khi deploy `vat-web` đã **grep bundle xác nhận `VITE_TURNSTILE_SITE_KEY` có nhúng** — chốt chặn sự cố 2026-07-22 lặp lại. **(4) Smoke 13/13:** `/dat-mat-khau` trả HTML SPA (không trang trắng); `POST /api/dat-mat-khau` token bịa → **`khong_thay`** (chứng minh chuỗi HTTP→front-door→vat-api→Hyperdrive→Neon→hàm mới thông dưới role `vat_app`; sai quyền sẽ ra 500), mật khẩu ngắn → `mat_khau_qua_ngan`, body thiếu → `bad_request`; route CŨ `reset-mat-khau` → **404** (đã xoá đúng); cách ly hai cửa còn nguyên (khách→`/api/admin/*` = 404, admin origin = 302 Access); hồi quy `/auth/login`, `/dang-ky`, `/xac-thuc-email` đều còn sống. **CÒN LẠI: nghiệm thu bằng một lượt đăng ký THẬT** — smoke curl không chứng minh được đường SES gửi thư tới hộp thư thật.

> **Nhật ký deploy U18 + U19 — 2026-07-21 (đã kiểm chứng):** PR #27 (U18 Admin API) + #28 (U19 Cổng Admin) merge vào trục (`b9cd7de`, `cb2ca0f`); `make lint` sạch + **1303 test xanh trên trục ĐÃ GỘP**. (0) **Tiền kiểm production TRƯỚC migrate** (chỉ đọc, 5/5 đạt): mốc đã áp = `0010`; **ảnh chụp ACL `auth_lookup_user` = `{auth_lookup=X/auth_lookup,vat_app=X/auth_lookup}`**; role app `vat_app` có thật, `NOBYPASSRLS`+`NOSUPERUSER`; `quan_tri_he_thong`/`admin_api`/hàm `admin_*` đều CHƯA tồn tại. (1) `make migrate` áp `0011` (bảng `quan_tri_he_thong`, role `admin_api` NOLOGIN BYPASSRLS, **8 hàm SECURITY DEFINER**, 2 cột mật khẩu tạm). **Hậu kiểm: ACL `auth_lookup_user` GIỐNG HỆT trước** ⇒ không lặp lại sự cố `0009`; 8/8 hàm `owner=admin_api` + `prosecdef` + PUBLIC **không** EXECUTE + `vat_app` **có** EXECUTE; `vat_app` **không** SELECT được `quan_tri_he_thong`; RLS ENABLE+FORCE **0 policy**; **`SET ROLE admin_api` từ role migrate BỊ TỪ CHỐI** (ca này PGlite không kiểm được — superuser luôn SET ROLE được). Smoke ngay sau migrate: login khách sai mật khẩu → **401 chứ không 500** (chứng minh `vat_app` vẫn gọi được `auth_lookup_user`). (2) `wrangler secret put ADMIN_JWT_SECRET` (khoá mới, khác `JWT_SECRET`). (3) Deploy THEO THỨ TỰ `vat-api` (`b730366f`) → `vat-web` (`13f4b80f`, worker.ts đổi: chặn `/api/admin/*`) → `vat-admin` (`99a978d3`, MỚI, custom domain `adminvatengine.tourdao.vn` do wrangler tự tạo). (4) Smoke **đối xứng hai cửa** 5/5: khách→`/api/admin/*` = 404, admin→`/api/invoices` = 404, khách→`/health` = 200. (5) Cloudflare Access gắn cho subdomain admin. (6) Seed super-admin + **nghiệm thu đầu-cuối**: duyệt tenant `cho_duyet` → khách đăng nhập được bằng mã 6 số → Khóa → khách 401.
>
> **🔴 SỰ CỐ 1 — CACHE HYPERDRIVE NUỐT THAO TÁC GHI (nghiêm trọng, đã vá).** Nghiệm thu phơi ra: bấm **Duyệt lần hai** trả **200 kèm mật khẩu tạm MỚI** thay vì 409. Nhật ký ghi hai lần `duyet_tenant {cu:"cho_duyet"}` cách nhau 2 giây — bất khả thi, vì giữa hai lần đó khách đã đăng nhập thành công (tức tenant đang `active`). Triệu chứng thứ hai: `mo-khoa` trả `200 {trang_thai:"active"}` nhưng đọc lại qua API vẫn `khoa` trong khi DB thật là `active`. **Nguyên nhân:** route admin diễn đạt mọi thao tác GHI dưới dạng `SELECT ... FROM admin_*(...)` (vì chúng là hàm SECURITY DEFINER) — với lớp phân tích SQL của Hyperdrive, chúng trông y hệt truy vấn ĐỌC nên bị cache. Hậu quả: **chốt chặn TOCTOU 409 bị vô hiệu hoàn toàn**. **Vá:** `wrangler hyperdrive update <id> --caching-disabled`. **KIỂM CHỨNG NHÂN QUẢ:** cùng mã nguồn, cùng phép thử, chỉ đổi cache → Duyệt lần 2 trả đúng **409**, đọc danh sách khớp DB tức thì. **Chi phí tắt cache ~ bằng 0** vì mọi truy vấn có lưu lượng thật đã chạy trong `withTenant` (transaction) nên vốn không được cache; cache chỉ từng áp vào đường quản trị và `auth_lookup_user` — đúng hai chỗ cần tươi nhất. ⚠️ **ĐỪNG BẬT LẠI** (cảnh báo dài đã ghi trong `apps/api/wrangler.jsonc`). **Bài học tổng quát: một thao tác ghi được diễn đạt như câu đọc sẽ bị mọi tầng trung gian đối xử như câu đọc.**
>
> **🔴 SỰ CỐ 2 — TẠO SUPER-ADMIN BẰNG GIÁ TRỊ MẪU (đã xoá + vá).** Hướng dẫn deploy đưa lệnh sao-chép-là-chạy-được chứa placeholder `ADMIN_EMAIL='email-cua-ban@...' ADMIN_PASSWORD='<mật khẩu ≥12 ký tự>'`; nó được chạy nguyên văn lên production, tạo một tài khoản quyền xuyên-tenant toàn hệ thống với mật khẩu ghi công khai trong tài liệu, trên Cổng Admin lúc đó chưa gắn Access. Cổng `password.length < 12` KHÔNG bắt được vì chuỗi mẫu dài 21 ký tự. Tài khoản đã xoá ngay (`quan_tri_he_thong` về rỗng). **Vá:** PR #29 thêm cổng nhận diện placeholder trên cả email lẫn mật khẩu. **Bài học: khi giá trị mẫu vẫn HỢP LỆ về hình thức thì kiểm hình thức là vô dụng — phải nhận diện chính hình dạng của placeholder.**
>
> **Gotcha khác ghi lại:** ① Cửa sổ lan truyền sau `wrangler deploy` có thể trả **500** chứ không chỉ 404 như ghi nhận trước đây — smoke lại sau ~20 giây. ② Access service token: `service_token_status: false` trong JWT `meta` của redirect nghĩa là Access **không nhận ra token**, đây KHÔNG phải lỗi policy — kiểm lại cặp ID/Secret có thuộc cùng một token không (Cloudflare chỉ hiện Secret một lần). Đường dẫn UI hiện hành: **Zero Trust → Access controls → Service credentials → Service Tokens**; policy phải đặt **Action = `Service Auth`**. ③ Front-door admin dùng **allowlist** `/api/admin/*` chứ không denylist — endpoint khách mới thêm sau này mặc định không tới được từ origin admin.

> **Nhật ký deploy U17b — 2026-07-20 (đã kiểm chứng):** PR #21 merge vào trục (`bbc6e97`). Deploy từ nhánh **đã đối chiếu khớp origin** (`git diff origin/trunk HEAD` trống — vết sự cố 2026-07-16). (0) **Tiền kiểm production TRƯỚC migrate** (bắt buộc, chỉ đọc): mốc đã áp `1785000000000` = `0008` ⇒ `0009`/`0010` nối tiếp đúng thứ tự, không khoảng trống; trùng `lower(email)` = **0 nhóm** ⇒ guard fail-loud của `0010` không nổ; email lưu có chữ hoa = **0 hàng** ⇒ bán kính lỗi khoá-đăng-nhập bằng 0; ảnh chụp ACL `auth_lookup_user` = `{auth_lookup=X/auth_lookup,vat_app=X/auth_lookup}`. (1) `make migrate` áp `0009` + `0010`. **Hậu kiểm: ACL SAU migrate GIỐNG HỆT trước** ⇒ `DROP FUNCTION` + cấp lại đã bảo toàn `GRANT EXECUTE` của `vat_app` (đây là điểm nếu sai thì **toàn bộ login sập**); hàm trả 5 cột có `tenant_trang_thai`; so khớp `lower(n.email)`; index nay `btree(lower(email))`. (2) Precheck Hyperdrive = `vat_app` ✓. Deploy `vat-api` (Version `d846dc5c`, DO `SignupLimiter` tag `v5` — thuần cộng dồn, tạo được). **U17b KHÔNG đụng `apps/web`** nên không cần build lại SPA. (3) Smoke: `/api/health` 200 `env=production`; login sai → **401 chứ không 500** (chứng minh Hyperdrive→Neon→`auth_lookup_user` 5 cột thông); `POST /api/dang-ky` hợp lệ → **201** `{ok:true,trangThai:"cho_duyet"}`; email rác → 400; **429 `qua_nhieu_yeu_cau` + `Retry-After` giảm dần** (ca BẮT BUỘC — limiter fail-open nên hỏng sẽ im lặng). DB xác minh: tenant `cho_duyet`/`free`, người dùng `quan_tri` `password_hash NULL`, audit `dang_ky`; các ca 400 **không tạo hàng nào**. **Gotcha ghi lại:** ① `make migrate` **không tự nạp** `packages/db/.dev.vars` — `drizzle.config.ts` đọc `process.env.DATABASE_URL`, phải export thủ công; và `source .dev.vars` **vỡ** vì connection string chứa `&` không đóng ngoặc. ② Ngay sau `wrangler deploy`, vài request đầu tới route MỚI trả **404** trong ~10–20 giây do biên Cloudflare chưa lan truyền hết phiên bản — **không phải lỗi**, smoke lại sau ít giây. ③ Còn **1 tenant smoke** trong DB: `mst=9999999901`, id `b9937258-e268-4138-81a9-5455887f5a44`, trạng thái `cho_duyet` (trơ — không mật khẩu, không đăng nhập được) — xoá khi tiện.
>
> **Nhật ký deploy U29 (+U17) — 2026-07-19 (đã kiểm chứng):** PR #14 (U29 — phiên cookie HttpOnly, ADR-0003 Amendment #1) merge vào trục (`1940687`); PR #15 (U17 — gói dịch vụ) đã merge trước đó (`7c2adea`) nên **cùng ra production một lượt**. (0) **Migration `0007_dang_ky_va_goi_dich_vu.sql` đã được áp TRƯỚC đó** (kiểm: `to_regclass('goi_dich_vu')` không null) — U29 tự nó KHÔNG có migration. Chạy bước kiểm bắt buộc §4 của `HANDOFF-U17a-2026-07-19.md` trên production: `SELECT goi_dich_vu, count(*) FROM tenants GROUP BY 1` → `enterprise`×1, `free`×1, **không có nhãn lạ** ⇒ bản vá `ddb56e0` đã cứu đúng tenant `'Enterprise '` (thừa dấu cách) khỏi bị backfill ép về `free`. (1) `make lint` sạch + **897 test xanh trên trục ĐÃ GỘP** (bắt buộc: U29 vốn chỉ test trên nền chưa có U17; U17 thêm `goiDichVuTen` vào `MeResponse`). (2) **Build lại SPA** rồi deploy `vat-api` (Version `b5191239`) **TRƯỚC**, `vat-web` (Version `84d34d61`) sau — thứ tự này an toàn nhờ C3 (API mới vẫn nhận `Authorization: Bearer`) nên SPA cũ không gãy trong cửa sổ giữa hai lần deploy. (3) Smoke production: `/api/me` không cookie → 401; **`POST /api/auth/logout` → 200** (chứng minh code mới đã live, endpoint này trước đây không tồn tại); `POST` kèm `Origin` lạ → **403** (lớp CSRF sống); login sai → **0 header `Set-Cookie`**; SPA `/` → 200, khởi động ra màn Đăng nhập, **0 lỗi console**. **Gotcha ghi lại:** cookie phải mang `Path=/` chứ KHÔNG `/auth` — trình duyệt thấy `/api/auth/*` còn front-door mới bóc `/api`, đặt `/auth` thì cookie **không bao giờ được gửi** và hỏng câm không báo lỗi. Dev cũng phải same-origin (proxy `/api` trong `vite.config.ts` + `apps/web/.env.development`), nếu không `SameSite=Strict` chặn cookie khiến **dev hỏng trong khi production chạy tốt**.
>
> **Nhật ký deploy U23 — 2026-07-16 (đã kiểm chứng):** PR #5 (U23) squash-merge vào trục (`0c0873d`). Thứ tự đúng luật `deploy.md` (migrate TRƯỚC, deploy SAU): (1) `make migrate` áp `0006_unique_mst_username.sql` lên Neon — xác minh DB: migration #7, 2 index UNIQUE `tenants_mst_unique` + `tai_khoan_thue_tenant_username_unique` tồn tại; 0 bản trùng `mst`/`(tenant_id,username)` trước khi áp. (2) Deploy `vat-api` (Version `853b5984`, DO `LoginLimiter` v1→v2→v3 — **KHÔNG** dính `10074`), `sync-worker` (`49d7c992`), `vat-web` (`5b79b880`). (3) SPA phải **build lại** trước deploy (`vite build` không tự chạy trong `wrangler deploy`; `dist/` cũ trước U23) → bundle `index-BptFAtCS.js` đã live. (4) Smoke: `/api/health` 200 `env=production`; `POST /api/auth/login` giả → 401 (Hyperdrive→Neon thông); 4 security header đủ. **Gotcha ghi lại:** sau khi xoay mật khẩu `neondb_owner`, `packages/db/.dev.vars` (`DATABASE_URL`) phải cập nhật mật khẩu mới, nếu không `make migrate` fail `password authentication failed` (Hyperdrive dùng `vat_app` nên site KHÔNG ảnh hưởng, chỉ đường migrate CLI bị chặn).
>
> ~~KẾ HOẠCH — CHƯA THỰC THI~~ · Đưa VATCrawlbot lên production thật trên một domain, same-origin (SPA + API cùng gốc, không CORS). Tối đa **2 phase**.
>
> Nguồn "làm gì/thế nào": `CLAUDE.md` §Ngăn xếp + §Kiến trúc; ADR-0001 (Cloudflare), ADR-0003 (React+Vite). Luật áp dụng: `security.md`, `multi-tenant.md`. Quyết định hạ tầng: [[vat-quyet-dinh-ha-tang-2026-07-14]].

---

## 1. Trạng thái hiện tại (đã kiểm chứng, 2026-07-15)

| Hạng mục | Trạng thái |
|---|---|
| Backend `vat-api` + `vat-sync-worker` | ĐÃ deploy **staging** trên Workers Free, `.workers.dev`. Smoke + **login GDT thật HTTP 200** đã pass. |
| Neon (Hyperdrive `1011ff82…`, role app `vat_app` NOBYPASSRLS) | Sống, RLS kiểm chứng thật. **Có dữ liệu test** (tenant `mst=9999999999` + token MST thật). |
| Frontend `apps/web` (SPA 8 màn) + backend A1 `GET /me`, A2 `GET /tax-accounts` | XONG (`make lint` sạch, `make test` 453 xanh, security-reviewer ĐẠT) nhưng **CHƯA commit** (untracked/uncommitted). |
| Mật khẩu `neondb_owner` | **Đã lộ trong chat** → phải xoay. |
| Dry-run build (chuẩn bị deploy, không chạm production) | ✅ **Sạch 2026-07-16** trên nhánh `fordex-hardening`: `vat-api` (`wrangler deploy --dry-run`, 763 KiB), `vat-sync-worker` (506 KiB), SPA (`vite build`, 278 KiB), front-door `vat-web` (`--dry-run`, đọc 14 asset). Xác nhận binding khớp cấu hình: cả `vat-api` và `vat-sync-worker` bind **cùng** Hyperdrive `1011ff82…` (liên quan H-A.4 tách 2 config), `PBKDF2_ITERATIONS="100000"` (Free; flip 600k khi Paid — O2). |

**Điểm mấu chốt kiến trúc:** `vat-web` là SPA **tĩnh thuần** (Workers Static Assets), không route API. `vat-api` là Worker riêng ⇒ khác origin. Chọn **same-origin qua Cloudflare Worker Routes** để KHÔNG cần CORS.

## 2. Quyết định đã chốt (chủ dự án)

| Mã | Quyết định |
|---|---|
| D1 | Domain = **`vatengine.tourdao.vn`** |
| D2 | **Same-origin** qua Cloudflare Routes: `…/api/*` → `vat-api`, `…/*` → `vat-web`. Không CORS. |
| D3 | **Giữ Workers Free** (nâng Paid + khôi phục `limits` CHỈ KHI sync đụng trần CPU 10ms) |
| D4 | **Tái dùng Neon hiện tại**, dọn dữ liệu test (không tạo DB mới) |

## 3. Cách làm same-origin (kỹ thuật, không CORS) — Front-door trên `vat-web`

> **Vì sao KHÔNG dùng Routes + mount `/api`:** Cloudflare Worker Routes cần **1 bản ghi DNS proxied tạo tay** cho hostname (wrangler KHÔNG tự tạo cho `routes`). Cách dưới dùng **Custom Domain** (wrangler TỰ tạo DNS) + service binding ⇒ thực thi trọn bằng wrangler, KHÔNG đụng code/test `apps/api`, và ẩn được API.

- **`vat-web` thành Worker front-door** (thay vì assets thuần): thêm `main` + `fetch` handler + **service binding** `API` → `vat-api` + `assets` binding `ASSETS`.
  - `fetch`: `pathname` bắt đầu `/api/` → **strip `/api`** → `env.API.fetch(...)` (vat-api giữ gốc `/auth`,`/invoices`… KHÔNG đổi); còn lại → `env.ASSETS.fetch(...)` (SPA fallback).
- **Frontend build với `VITE_API_BASE=/api`** ⇒ SPA gọi `/api/...` cùng gốc.
- **Custom Domain** `vatengine.tourdao.vn` gán lên `vat-web` (wrangler tự tạo DNS proxied).
- **Ẩn `vat-api`**: `"workers_dev": false` ⇒ chỉ gọi được qua service binding (không lộ hostname công khai).

> **Điều kiện hạ tầng:** zone `tourdao.vn` đã nằm trong tài khoản Cloudflare `luutuanvu.gl@gmail.com` (chủ dự án xác nhận 2026-07-15).

## 4. Điều kiện tiên quyết (trước Phase 1)

- [ ] **U15 đã commit + merge** (apps/web + apps/api A1/A2), `make lint` + `make test` **xanh trên nhánh** → deploy từ trạng thái sạch, không phải WIP.
- [ ] Zone `tourdao.vn` sẵn trong Cloudflare (điều kiện hạ tầng ở trên).

---

## PHASE 1 — Backend production-ready

**Mục tiêu:** `vat-api` (+A1/A2) + `vat-sync-worker` chạy đúng ở chế độ production, DB sạch + an toàn. (Vẫn qua `.workers.dev` để verify; ẩn API để Phase 2.)

**Bước:**
1. **⚠️ PRECHECK Hyperdrive = `vat_app` (CHẶN — bỏ qua có thể SẬP dịch vụ).** Xác nhận cả 2 binding Hyperdrive (`1011ff82e7154531883f0f2e62d344f0`, dùng chung ở `apps/api` **và** `apps/sync-worker`) trỏ chuỗi `postgresql://vat_app:...`, KHÔNG phải `neondb_owner`. **Cách kiểm:** `wrangler hyperdrive get 1011ff82e7154531883f0f2e62d344f0` (hoặc xem trong dashboard). Nếu là owner → tạo lại config trỏ `vat_app` (`packages/db/provisioning/app-role.sql`) trước khi deploy. *(Lý do: H-A.2 `roleGuard.ts` TỪ CHỐI khởi động nếu role có `rolsuper`/`rolbypassrls`/sở-hữu-bảng — kiểm chứng ADR-0004 E1–E2: `neondb_owner` CÓ BYPASSRLS. Sai role ⇒ Worker fail-fast **mọi** request.)*
2. **⚠️ PRECHECK migration Drizzle đang chờ (CHẶN — xem `.claude/rules/deploy.md`, sự cố thật 2026-07-16).** `wrangler deploy` KHÔNG tự chạy migration DB. So `packages/db/migrations/meta/_journal.json` với lần `make migrate` gần nhất đã chạy trên production; nếu có migration mới hơn (kể cả migration mang theo từ nhánh khác merge vào) → **chạy `make migrate` TRƯỚC bước 5 (deploy code)**, không phải sau. Mọi migration trong repo cộng dồn/idempotent (`ADD COLUMN IF NOT EXISTS`) nên chạy lại luôn AN TOÀN kể cả khi không chắc đã áp — không suy đoán.
3. **Dọn DB:** `delete from tenants where mst='9999999999';` (cascade xoá user/tài khoản thuế/token test).
4. **Xoay mật khẩu `neondb_owner`** trên Neon console (chủ dự án) → cập nhật `DATABASE_URL` trong `packages/db/.dev.vars`. Chỉ ảnh hưởng credential migrate; Hyperdrive dùng `vat_app` — KHÔNG đổi. *(Không chặn deploy — có thể làm song song.)*
5. Thêm `"vars": { "ENVIRONMENT": "production" }` vào `apps/api/wrangler.jsonc` (KHÔNG đụng code app — same-origin xử lý ở `vat-web`).
6. **Deploy** `vat-api` + `vat-sync-worker` (bản đã commit, có A1/A2) — **CHỈ sau khi bước 2 đã xong**. **Lưu ý migration Durable Object:** `vat-api` mang DO `LOGIN_LIMITER` (migration `v1`, H-A.5b) và `vat-sync-worker` mang `TENANT_LIMITER`/`EGRESS_HEALTH` — `wrangler deploy` tự áp migration DO; xác nhận log **không lỗi migration**.

**Definition of Done (bằng chứng bắt buộc):**
- [ ] **roleGuard qua:** Worker khởi động được (không fail-fast) ⇒ Hyperdrive role hợp lệ (`vat_app`). Nếu deploy xong `/health` trả 5xx đồng loạt + log báo role → precheck bước 1 sai.
- [ ] `curl https://vat-api.<...>.workers.dev/health` → **200** `{"status":"ok","env":"production"}`. *(Lưu ý: `/health` KHÔNG đụng schema mới — 200 ở đây KHÔNG chứng minh migration đã áp, xem mục DoD kế tiếp.)*
- [ ] `POST /auth/login` email giả → **401** (Hyperdrive→Neon thông).
- [ ] **`GET /me` với session thật ngay sau một lượt đăng nhập thật** (không chỉ JWT seed dựng tay) → 200, không 500. *(Đây là smoke test đụng đúng cột schema mới nhất — JWT seed dựng tay có thể né qua cột mới nếu seed cũ; sự cố 2026-07-16 chỉ lộ ra khi đăng nhập thật.)*
- [ ] `GET /tax-accounts` (A1/A2) trả đúng.
- [ ] Query DB: KHÔNG còn tenant `mst=9999999999`.

---

## PHASE 2 — Front-door same-origin + Frontend + go-live đầu-cuối

**Mục tiêu:** SPA + API cùng gốc `https://vatengine.tourdao.vn`, dùng được đầu-cuối qua trình duyệt.

**Bước:**
1. **Build SPA:** `VITE_API_BASE=/api npm run build -w apps/web` → `apps/web/dist/`.
2. **`vat-web` thành front-door** (§3): thêm `main` `src/index.ts` (fetch: `/api/*`→strip→`env.API.fetch`; else `env.ASSETS.fetch`) + `wrangler.jsonc` thêm `assets.binding=ASSETS`, `services:[{binding:API,service:vat-api}]`, `routes`/`custom_domains` = `vatengine.tourdao.vn`.
3. **Ẩn API:** `"workers_dev": false` ở `apps/api/wrangler.jsonc` → redeploy `vat-api`.
4. **Deploy** `vat-web` (tự tạo DNS cho custom domain).
5. **Onboarding tenant thật đầu tiên:** seed 1 tenant + user thật (SQL tay tạm — xem mục treo O1).
6. **Kiểm chứng đầu-cuối trên trình duyệt:** mở `https://vatengine.tourdao.vn` → SPA load → đăng nhập nội bộ → màn Kết nối thuế → login GDT (UI hoặc `scripts/gdt-login.cjs` trỏ domain) → **đồng bộ hóa đơn thật** → thấy hóa đơn trên UI.

**Definition of Done (bằng chứng bắt buộc):**
- [ ] Mở domain trên trình duyệt: SPA render (không màn trắng), gọi `/api/...` cùng gốc **không lỗi CORS**.
- [ ] Đăng nhập nội bộ → thấy Dashboard + danh sách (dữ liệu tenant thật).
- [ ] **Đồng bộ hóa đơn thật thành công** → hóa đơn hiện trên S1/S2. *(Nếu đụng trần CPU 10ms → kích hoạt mục treo O2.)*
- [ ] **Bảo mật biên (H-A.6):** `curl -I https://vatengine.tourdao.vn` thấy đủ `content-security-policy`, `x-frame-options: DENY`, `x-content-type-options: nosniff`, `referrer-policy` (do front-door `vat-web` phát — tự động).
- [ ] **HSTS ở TẦNG ZONE Cloudflare** (front-door CỐ Ý không phát HSTS — chỉ bật trên HTTPS, phủ cả redirect): bật `SSL/TLS → Edge Certificates → Always Use HTTPS` **và** `HSTS` (`max-age ≥ 15552000`, `includeSubDomains`) cho zone `tourdao.vn`; xác minh `curl -I` thấy `strict-transport-security`. *(Không có bước này ⇒ site chạy HTTPS nhưng KHÔNG có HSTS ở bất kỳ tầng nào — rủi ro SSL-stripping.)*
- [ ] **WAF Rate-limit per-IP cho login (H-A.5b — lớp EDGE của phòng thủ 2 lớp):** Cloudflare `Security → WAF → Rate limiting rules` cho `tourdao.vn`: match `http.request.uri.path eq "/api/auth/login" and http.request.method eq "POST"`, ngưỡng ví dụ **10 req / 1 phút / IP**, action **Block** (hoặc Managed Challenge), thời gian chặn ~1 phút. *(Lớp app đã có: Durable Object `LoginLimiter` khóa per-account — chặn dò 1 tài khoản qua nhiều IP mà WAF per-IP không thấy. Hai lớp bù nhau: WAF chặn 1 IP dò nhiều tài khoản; DO chặn nhiều IP dò 1 tài khoản.)* Xác minh: gửi >ngưỡng POST/phút từ 1 IP → nhận 429 từ Cloudflare (trước cả khi chạm Worker).

---

## 5. Mục treo & rủi ro (ngoài 2 phase, quyết khi gặp)

| Mã | Mục | Xử lý |
|---|---|---|
| **O1** | **Onboarding tenant tự phục vụ CHƯA có** — tạo tenant/user bằng SQL tay. Tầm nhìn 100k khách cần luồng đăng ký/admin. | **Hạng mục sản phẩm riêng**, không thuộc deploy. Tạm: seed SQL cho khách đầu. **⚠️ Khi xây luồng tạo user/đặt mật khẩu (H-A.5a):** PHẢI gọi `hashPassword(pw, resolvePbkdf2Iterations(c.env))` (KHÔNG dùng mặc định) để var `PBKDF2_ITERATIONS` (flip 600k khi Paid) thực sự có tác dụng. |
| **O2** | **Trần CPU 10ms (Free)** — sync HĐ nặng có thể vượt. | Nếu Phase 2 DoD sync fail vì CPU → **nâng Workers Paid ($5)** + bỏ comment `limits` ở 2 `wrangler.jsonc` → deploy lại. **Kèm khi lên Paid (H-A.5a):** đổi `PBKDF2_ITERATIONS` trong `apps/api/wrangler.jsonc` từ `"100000"` → `"600000"` (OWASP) — 600k ~42ms vượt trần Free 10ms nên chỉ bật sau Paid; hash cũ vẫn verify (định dạng tự mô tả số vòng). |
| **O3** | A3 remember-me (cookie HttpOnly) + A4 quên-mật-khẩu(email) còn treo (S0 hiện "sắp có"). | Tách unit sau go-live. **Ghi chú H-A.5b:** khóa đăng nhập per-account (DO) đánh đổi có chủ đích — kẻ xấu biết email nạn nhân có thể khóa TẠM ~15' (khóa tự hết hạn, không vĩnh viễn). Khi làm **A4 (reset-password qua email)**, đó cũng là **kênh tự mở khóa** cho chủ tài khoản hợp lệ → hạ rủi ro account-lockout DoS. |
| **O4** | Test tự động chạy PGlite, KHÔNG đụng Neon thật (bài học migration 0001). | Cân nhắc nhóm test `db-real` trên Neon branch — hạng mục riêng. |

## 6. Rollback

- **Route:** gỡ Worker Routes → traffic ngừng vào domain; các Worker vẫn truy cập được qua `.workers.dev` (staging).
- **Worker:** `wrangler rollback` về version trước (Phase 1/2 độc lập version).
- **DB:** dọn test data là thao tác không hồi — nhưng chỉ xoá dữ liệu test, không đụng schema/role.

## 7. Ranh giới (không vượt)

- Thanh toán/nâng Paid, đổi nameserver zone, nhập mật khẩu thuế/captcha: **chủ dự án tự làm** (Claude không nhập credential/không giải captcha — `security.md`).
- Mọi secret qua `wrangler secret` / Neon console, KHÔNG commit.

## Phụ lục A — Chuỗi lệnh (CHỦ DỰ ÁN chạy; Claude soạn, KHÔNG chạy production)

> Soạn 2026-07-16 (HANDOFF-DEPLOY §26.3). Chạy **tuần tự** từ gốc repo; mỗi bước có kiểm chứng — **dừng nếu kiểm chứng fail**. `<...>` = giá trị điền theo tài khoản. KHÔNG chạy khi nhánh chưa hợp nhất về nhánh chính sạch (§4 điều kiện tiên quyết).

**Bước 0 — build sạch (an toàn, lặp lại được, không chạm production):**
```sh
npm run -w apps/api  deploy -- --dry-run --outdir /tmp/dr-api     # → EXIT 0, in bindings
npm run -w apps/sync-worker deploy -- --dry-run --outdir /tmp/dr-sync  # → EXIT 0
VITE_API_BASE=/api npm run -w apps/web build                      # → dist/ dựng xong
```
_Kiểm chứng:_ cả 3 EXIT 0 (đã xác nhận 2026-07-16 trên `fordex-hardening`).

**Bước 1 — PRECHECK Hyperdrive = `vat_app` (CHẶN):**
```sh
wrangler hyperdrive get 1011ff82e7154531883f0f2e62d344f0
```
_Kiểm chứng:_ connection string là `vat_app@...`, KHÔNG `neondb_owner`. Nếu sai → tạo lại config (`packages/db/provisioning/app-role.sql`) rồi lặp lại.

**Bước 1b — ⚠️ PRECHECK + áp migration Drizzle đang chờ (CHẶN — `.claude/rules/deploy.md`):**
```sh
DATABASE_URL="$(grep '^DATABASE_URL=' packages/db/.dev.vars | cut -d= -f2-)" npm run migrate -w packages/db
```
_Kiểm chứng:_ `[✓] migrations applied successfully!`. **Chạy TRƯỚC Bước 2 mọi lần**, kể cả khi không chắc đã có migration mới — an toàn để chạy lại (idempotent). Bỏ qua bước này là nguyên nhân sự cố "đăng nhập vỡ" 2026-07-16 (`/me` 500 vì cột `ban_quyen`/`ghi_chu` chưa có trên DB dù code đã deploy).

**Bước 2 — Phase 1 backend (sau khi dọn DB + xoay owner theo §PHASE 1):**
```sh
npm run -w apps/api deploy            # áp DO migration LOGIN_LIMITER v1 — xem log KHÔNG lỗi
npm run -w apps/sync-worker deploy    # DO TENANT_LIMITER / EGRESS_HEALTH
curl -s https://vat-api.<subdomain>.workers.dev/health   # → 200 {"status":"ok","env":"production"}
```
_Kiểm chứng:_ `/health` 200 ⇒ roleGuard qua (role hợp lệ). 5xx đồng loạt + log role ⇒ Bước 1 sai. **Sau đó đăng nhập thật qua UI → xác nhận `/me` KHÔNG 500** (`/health` không đụng schema, không đủ để kết luận an toàn).

**Bước 3 — Phase 2 front-door + ẩn API (chi tiết §PHASE 2 bước 2–4):**
```sh
# (đã build SPA ở Bước 0 với VITE_API_BASE=/api)
# apps/api/wrangler.jsonc: "workers_dev": false   → rồi:
npm run -w apps/api deploy
npm run -w apps/web deploy             # front-door + tự tạo DNS custom domain
curl -I https://vatengine.tourdao.vn   # → 200 + CSP/XFO/nosniff/Referrer (H-A.6)
```
_Kiểm chứng đầu-cuối:_ theo DoD Phase 2 (SPA render, login, đồng bộ HĐ thật).

**Bước 4 — Sau go-live (dashboard Cloudflare, không phải wrangler):** bật HSTS + Always-HTTPS zone (H-A.6) và WAF rate-limit `/api/auth/login` (H-A.5b) — xem DoD Phase 2. Xác minh: `curl -I` thấy `strict-transport-security`; POST login >ngưỡng/phút từ 1 IP → 429.

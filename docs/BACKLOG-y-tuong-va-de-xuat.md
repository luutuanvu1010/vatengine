# Giỏ ý tưởng & đề xuất (Backlog nghiên cứu sản phẩm)

> **Đây KHÔNG phải kế hoạch đã chốt.** Đây là nơi gom lại ý tưởng, rủi ro phát hiện được, hoặc đề xuất cải tiến nảy sinh trong quá trình làm việc — nhưng **chưa đến lượt** hoặc **chưa quyết định** triển khai ngay. Không có gì ở đây tự động thực thi.
>
> Được tham chiếu từ `CLAUDE.md` (mục "Tài liệu nguồn") — mọi phiên làm việc trong dự án đều biết file này tồn tại và nên ghé đọc khi: (a) tìm việc để làm ở một thời điểm rảnh, (b) chuẩn bị roadmap/kế hoạch mới, hoặc (c) phát hiện điều gì đáng ghi lại nhưng không thuộc phạm vi đơn vị công việc đang làm (ghi vào đây thay vì lạc đề).

## Cách dùng

- Mỗi mục có: ngày phát hiện, mô tả ngắn, bối cảnh/bằng chứng, rủi ro nếu bỏ qua, đề xuất hướng xử lý, mức ưu tiên đề xuất (Cao/Trung bình/Thấp), nguồn phát hiện.
- Khi một mục được **quyết định triển khai**: tạo file kế hoạch riêng trong `docs/plans/` (theo khuôn U-unit), rồi quay lại đánh dấu mục này là "Đã lên kế hoạch → xem `docs/plans/<tên-file>.md`". Không xóa mục cũ — giữ lại làm lịch sử.
- Không cần review/duyệt gì để **thêm** một mục mới vào đây — đây là giỏ mở, ghi thoải mái. Chỉ khi **chuyển từ đây thành việc làm thật** mới cần qua quy trình chuẩn (kế hoạch → TDD → review chéo).

## Đối chiếu với lớp thương mại `U18–U21` (đọc trước khi bắt đầu bất kỳ mục nào bên dưới liên quan tới Admin/thành viên/audit)

Phiên 2026-07-16 đã đọc toàn bộ `docs/plans/U18-plan.md` → `U21-plan.md` (Admin API → Cổng Admin/quản lý thành viên → Đăng ký khách + pháp lý → Dashboard giám sát). Cả 4 đơn vị đều **⬜ KẾ HOẠCH — CHƯA HIỆN THỰC** (0% code, xác nhận qua `ls apps/api/src/routes/` + `git log --all --grep="admin"` rỗng). Trước khi làm bất kỳ mục nào dưới đây đụng tới Admin/thành viên/audit, **đọc 4 file đó trước** — tránh thiết kế trùng hoặc lệch:

| Mục backlog | Quan hệ với U18–U21 |
|---|---|
| Quản lý người dùng nội bộ tenant (mời/đổi vai) | **KHÔNG trùng, vẫn cần làm riêng** — U18/U19 chỉ cho **super-admin** (chủ dự án) quản lý ở cấp tenant (duyệt/khóa/reset mật khẩu người dùng chính), không có luồng "một `quan_tri` tự mời thêm `ke_toan`/`ke_toan_truong` vào CHÍNH công ty mình". |
| Hạ tầng gửi email (AWS SES) | **Trùng khớp — dùng chung.** U18 tự ghi phần hạ tầng email là "CHƯA KIỂM CHỨNG provider" (dùng cho email onboarding mật khẩu tạm). Khi làm U18, dùng lại thẳng phần nghiên cứu SES đã chốt ở mục tương ứng bên dưới, không nghiên cứu lại. |
| Audit log — thiếu cột "ai" | **U18 (`GET /admin/audit`) + U19 (trang audit) + U21 (khối nhật ký gần đây) chỉ xây MÀN XEM ở cấp platform-admin — KHÔNG sửa lỗ hổng schema** (`audit_log` hiện vẫn thiếu cột định danh người dùng). Phải vá schema trước, U18/U19/U21 mới có "ai" để hiển thị. |
| "Công ty dịch vụ" đọc nhiều doanh nghiệp | **Không có trong U18–U21.** Đường xuyên-tenant của U18 chỉ dành cho MỘT super-admin (chủ dự án) ở mức metadata, không phải mô hình đại lý kế toán bên ngoài đọc nhiều khách hàng. Vẫn là ý tưởng độc lập, cần thiết kế riêng nếu làm. |
| 10 lượt tải miễn phí/tháng | Không nằm trong U18–U21 (cột `goi_dich_vu='free'` đã có ở nơi khác trong schema nhưng chưa gắn hạn mức). Không xung đột, làm độc lập được. |
| VNeID | Không nằm trong U18–U21. Không xung đột. |

Một điểm đáng chú ý trong các plan này: câu hỏi "admin có đọc được toàn bộ dữ liệu không" đã có hướng trả lời sẵn — về mặt kỹ thuật super-admin *có khả năng* đọc mọi bảng, nhưng API theo thiết kế **cố tình chỉ mở "cửa hẹp" ở mức metadata** (tên, MST, trạng thái, gói, thời điểm đồng bộ, audit — xem nguyên tắc "cửa hẹp"/SECURITY DEFINER trong U18, "chỉ query rẻ" trong U21 §5), **tuyệt đối không** expose nội dung hóa đơn/dòng hàng/token GDT/mật khẩu. Đây là quyết định kiến trúc đã có trong plan — không cần bàn lại từ đầu khi triển khai, chỉ cần thực thi đúng như đã thiết kế.

---

## Danh sách

### [2026-07-16] Chưa có giới hạn tốc độ TOÀN CỤC khi gọi ra cổng thuế GDT

- **Trạng thái:** Đề xuất — chưa triển khai.
- **Bối cảnh/bằng chứng:** `apps/sync-worker/src/tenantLimiter.ts` — mỗi `TenantLimiter` (Durable Object) chỉ giữ token-bucket + circuit breaker **cho một tenant/MST riêng lẻ** (`ns.idFromName(key)` theo key tenant). `EGRESS_HEALTH` (DO khác, xem `apps/sync-worker/src/types.ts` dòng ~21) chỉ theo dõi **sức khỏe đường mạng** (phát hiện chặn địa lý), không giới hạn tốc độ. Hàng đợi `vat-sync` trong `apps/sync-worker/wrangler.jsonc` không đặt `max_concurrency` cho consumer.
- **Rủi ro nếu bỏ qua:** Nếu nhiều tenant khác nhau đồng bộ gần như đồng thời (nhiều người bấm "Đồng bộ ngay" cùng lúc, hoặc cron dispatch hàng loạt vào 3h sáng), mỗi tenant tự tuân thủ giới hạn riêng của mình nhưng **tổng số lượt gọi cộng dồn** có thể vượt mức "tôn trọng máy chủ thuế" (nguyên tắc trong `CLAUDE.md` §Ranh giới đạo đức & pháp lý) — nguy cơ bị GDT chặn IP/rate-limit ở tầng hạ tầng khi mở rộng tới 100.000 khách hàng.
- **Đề xuất hướng xử lý:** (a) Thêm một Durable Object đơn nhất giữ token-bucket **toàn cục** cho toàn bộ lượt gọi GDT, hoặc (b) đặt `max_concurrency` cho consumer hàng đợi `vat-sync` để giới hạn số lượt xử lý song song, hoặc (c) kết hợp cả hai. Cần một contract test/probe đo tải thật trước khi chốt ngưỡng cụ thể (theo "Nguyên tắc bằng chứng" của Hiến pháp).
- **Mức ưu tiên đề xuất:** Trung bình–Cao (ảnh hưởng tuân thủ pháp lý + rủi ro vận hành khi scale).
- **Nguồn phát hiện:** Phiên Cowork 2026-07-16 — phát hiện khi giải thích câu hỏi "1000 tài khoản MST cùng bấm Đồng bộ thì hệ thống sập không?", xác minh qua đọc code (không suy đoán).

### [2026-07-16] Lọc "Danh sách hóa đơn" theo giai đoạn quá khứ chưa đồng bộ → phải tự backfill ngầm + báo tiến trình

- **Trạng thái:** ✅ **ĐÃ HIỆN THỰC — U22 B1–B7** (`docs/plans/U22-plan.md`, hoàn tất 2026-07-17). Backend B1–B6 (monthlyWindows/coveredMonths/BackfillTracker DO ADR-0005/POST `/backfill`/GET `/backfill/:id`) **đã merge vào `feat/cloudflare-stack-u0`** (a4fe80d). Frontend B7 (thanh tiến độ theo tháng + tự chạy khi kỳ rỗng, tích hợp với nút "Đồng bộ khoảng này" + đồng bộ dòng hàng U26) trên nhánh `claude/u22-b7-progress` (chờ PR). Cả 7 AC đạt + có test; `make lint`/`make test` xanh.
- **Bối cảnh/bằng chứng:** `GET /invoices` (`apps/api/src/routes/invoices.ts` dòng 1-2) **chỉ đọc dữ liệu đã đồng bộ trong Neon, không gọi GDT**. Đồng bộ (cả cron lẫn nút "Đồng bộ ngay") luôn cố định khoảng thời gian là **"tháng hiện tại"** (`currentPeriodWindow()` trong `packages/sync/src/syncJob.ts`) — không nhận tham số khoảng ngày tùy ý. Hệ quả: lọc một giai đoạn **trước ngày tài khoản thuế được kết nối lần đầu** (hoặc một tháng bị bỏ sót vì token hết hạn cả tháng) sẽ luôn trả về rỗng, vì dữ liệu đó **chưa từng tồn tại trong Neon** — không phải lỗi lọc, mà là chưa có gì để lọc.
- **Rủi ro nếu bỏ qua:** Người dùng lọc một giai đoạn cũ (ví dụ để kê khai/đối chiếu quý trước) thấy danh sách rỗng, dễ hiểu nhầm là phần mềm lỗi hoặc mất dữ liệu, trong khi thực chất dữ liệu đó chưa bao giờ được lấy về. Ảnh hưởng trực tiếp tới lòng tin người dùng và giá trị cốt lõi (đối chiếu — kê khai) của sản phẩm.
- **Đề xuất hướng xử lý (yêu cầu của chủ dự án 2026-07-16):**
  1. Khi người dùng lọc một giai đoạn **nằm ngoài phạm vi đã từng đồng bộ** cho tenant đó, hệ thống phải **tự động kích hoạt một lượt đồng bộ ngầm (backfill)** đúng giai đoạn được lọc — người dùng không cần tự bấm "Đồng bộ ngay" hay biết gì về khái niệm "kỳ đồng bộ".
  2. Trong lúc backfill chạy ngầm, giao diện **phải hiển thị tiến trình rõ ràng** cho người dùng thấy (ví dụ "Đang lấy hóa đơn tháng 5/2026… " kèm chỉ báo tiến độ), **không được** để màn hình trắng/rỗng gây hiểu nhầm là hết dữ liệu hoặc lỗi.
  3. Sau khi backfill xong, tự động áp lại bộ lọc và hiển thị kết quả.
- **Ghi chú kỹ thuật (chưa thiết kế, chỉ liệt kê phần việc thấy trước):** cần (a) một cách để hệ thống biết "giai đoạn nào của tenant này đã từng đồng bộ" (có thể dựa vào lịch sử `lan_dong_bo`), (b) một API để chủ động enqueue backfill cho khoảng ngày tùy ý (khác với `currentPeriodWindow` cố định hiện tại), (c) một cơ chế theo dõi tiến độ job (job id + trạng thái) để frontend poll và hiển thị, (d) cân nhắc giới hạn CPU/wall-time (xem mục "chưa có giới hạn tốc độ toàn cục" ở trên) khi backfill nhiều tháng cùng lúc. Đây là một tính năng có phạm vi tương đối lớn, nên tách thành kế hoạch U-unit riêng khi tới lượt làm, không phải sửa nhỏ.
- **Mức ưu tiên đề xuất:** Cao (ảnh hưởng trực tiếp trải nghiệm và lòng tin — người dùng tưởng mất dữ liệu).
- **Nguồn phát hiện:** Phiên Cowork 2026-07-16 — phát hiện khi giải thích khoảng thời gian đồng bộ, chủ dự án xác nhận đây là yêu cầu quan trọng cần có.

### [2026-07-16] Quản lý người dùng nội bộ tenant (tạo/mời/đổi vai) + hạ tầng gửi email

- **Trạng thái:** ✅ **Đã lên kế hoạch → xem `docs/plans/U24-plan.md`** (phiên Cowork 2026-07-16). Gồm: API quản lý thành viên (mời/đổi vai/vô hiệu), hạ tầng email AWS SES (`packages/email` + `aws4fetch`), đặt-mật-khẩu-lần-đầu + quên mật khẩu (đóng luôn nợ O3/A4). Chưa hiện thực code.
- **Bối cảnh/bằng chứng:**
  - Xác nhận qua `ls apps/api/src/routes/`: chỉ có `auth.ts, exports.ts, invoices.ts, me.ts, reconcile.ts, taxAccounts.ts` — **không có route nào tạo/sửa/xóa `nguoi_dung`**. Cách duy nhất hiện nay để một tenant có thêm người dùng thứ 2/3 là chèn SQL tay (đúng như `docs/plans/production-deploy.md` mục treo O1 đã ghi).
  - `PATCH /me` (`apps/api/src/routes/me.ts`) chỉ cho `quan_tri` sửa `ten`/`ghiChu`, **không đụng `vai_tro`** — không có cách đổi vai một người dùng đã tồn tại qua sản phẩm.
  - Hệ quả trực tiếp: 3 vai RBAC (`ke_toan` < `ke_toan_truong` < `quan_tri`) đã xây dựng đầy đủ ở tầng backend/frontend (xem `apps/api/src/rbac.ts`, `apps/web/src/lib/rbac.ts`) nhưng **chưa có tenant thật nào có cơ hội dùng tới 2 vai còn lại**, vì không tạo được người dùng thứ hai.
  - **Nghiên cứu hạ tầng gửi email (2026-07-16, dẫn nguồn cụ thể):** đã đọc tài liệu chính thức Cloudflare tại `https://developers.cloudflare.com/email-routing/email-workers/send-email-workers/` — binding `send_email` của Workers **chỉ gửi được tới địa chỉ đã "verified" trong Email Routing** (trích nguyên văn: *"send an email... to an email address verified on Email Routing"*; các thuộc tính `destination_address`/`allowed_destination_addresses` đều giới hạn theo danh sách đã xác minh/cho phép trước). Đây là tính năng thiết kế cho mục đích "Worker tự báo tin cho chủ sở hữu", **không phù hợp** để gửi email tới địa chỉ tùy ý của người dùng cuối (email mời thành viên, email đặt lại mật khẩu) — vì sẽ phải xác minh thủ công từng email khách hàng trước, phá vỡ luồng tự phục vụ.
- **Rủi ro nếu bỏ qua:** Giữ nguyên hiện trạng thì phân quyền 3 cấp chỉ là "trang trí" — không tenant nào tận dụng được; không thể scale onboarding tới 100.000 doanh nghiệp bằng SQL tay; thiếu cả luồng "quên mật khẩu" (mục treo O3 cũ) vì cùng phụ thuộc hạ tầng gửi email.
- **Đề xuất hướng xử lý:**
  1. **API quản lý thành viên** (chỉ `quan_tri` gọi được): `POST /users` (mời qua email — tạo `nguoi_dung` ở trạng thái chờ kích hoạt + gửi email link đặt mật khẩu lần đầu), `GET /users` (danh sách thành viên trong tenant), `PATCH /users/:id` (đổi `vai_tro`), vô hiệu hóa/xóa thành viên.
  2. **UI:** màn "Quản lý thành viên" trong Cài đặt, chỉ `quan_tri` thấy — đúng nguyên tắc RBAC ẩn/khóa đã có.
  3. **Hạ tầng gửi email — ĐÃ CHỐT: AWS SES** (quyết định chủ dự án 2026-07-16, không cân nhắc thêm dịch vụ khác). Nghiên cứu cách tích hợp vào Cloudflare Workers (đã kiểm chứng qua tài liệu chính thức AWS + mã nguồn thư viện, 2026-07-16):
     - **API dùng:** SES **v2 REST** (`POST https://email.<region>.amazonaws.com/v2/email/outbound-emails`, JSON) — KHÔNG dùng SDK AWS chính thức cho JS (dựa nhiều API Node, không tương thích tốt với runtime Workers). Nguồn: `docs.aws.amazon.com/ses/latest/APIReference-V2/API_SendEmail.html`.
     - **Ký request (SigV4):** mọi gọi API AWS đều cần chữ ký AWS Signature v4. Dùng thư viện **`aws4fetch`** (~6.4kb, chỉ phụ thuộc `fetch` + `SubtleCrypto`) — tài liệu của chính thư viện này nêu đích danh **Cloudflare Workers** là môi trường mục tiêu. Cùng nền tảng WebCrypto mà `packages/crypto/src/envelope.ts` của dự án đã dùng, nên không xung đột runtime.
     - **Bí mật:** `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` của một IAM user/role **thu hẹp quyền tối thiểu** (chỉ `ses:SendEmail`) — nạp qua `wrangler secret put`, đúng khuôn `JWT_SECRET`/`TOKEN_KEK` đã có, không hardcode.
     - **Điều kiện hạ tầng phải làm trước (không phải code):** xác minh domain gửi (vd `mail.tourdao.vn`) trong SES bằng bản ghi DNS — vì `tourdao.vn` đã nằm trên Cloudflare nên thêm bản ghi thuận tiện.
     - **Hạn mức gửi:** theo xác nhận của chủ dự án (2026-07-16), tài khoản AWS SES đang dùng đã có **hạn mức 50.000 email/24h** — tức **đã ở ngoài chế độ sandbox** (sandbox mặc định chỉ 200 email/24h + chỉ gửi được người nhận đã xác minh, xem `docs.aws.amazon.com/ses/latest/dg/request-production-access.html`). Thông tin hạn mức này do chủ dự án cung cấp, chưa tự kiểm chứng lại từ AWS Console — nên xác nhận lại trực tiếp trong SES Console (mục "Account dashboard" → "Sending limits") ngay trước khi triển khai thật, để chắc quota + region đang dùng khớp với region sẽ tích hợp vào Worker.
     - **Vùng (region):** nên chọn region gần Việt Nam (vd Singapore) để độ trễ thấp — cần xác nhận SES đã hỗ trợ đủ tính năng ở region đó lúc triển khai.
  4. Nên làm chung một lượt với luồng "Quên mật khẩu" (A4, mục treo O3 cũ) vì dùng chung hạ tầng gửi email.
- **Ràng buộc cần chạm:** `tenant_id` (mời thành viên phải gắn đúng tenant người mời), audit log hành động mời/đổi vai (security.md), không log nội dung email nhạy cảm.
- **Mức ưu tiên đề xuất:** Cao (mở khóa giá trị thật của RBAC 3 vai đã xây, điều kiện để scale tự phục vụ thay vì SQL tay).
- **Nguồn phát hiện:** Phiên Cowork 2026-07-16 — phát hiện qua đối chiếu route thật + nghiên cứu trực tiếp tài liệu Cloudflare (dẫn URL ở trên).

### [2026-07-16] Đăng nhập bằng username hoặc email + mở rộng "công ty dịch vụ" đọc dữ liệu nhiều doanh nghiệp

- **Trạng thái:** Đề xuất — chưa triển khai.
- **Bối cảnh/bằng chứng:** Hiện `nguoi_dung.email` (UNIQUE toàn cục) là định danh đăng nhập duy nhất — không có cột "tên người dùng" riêng để đăng nhập thay email. Mọi người dùng gắn CHẶT với đúng một `tenant_id`; `.claude/rules/multi-tenant.md` ghi rõ quy tắc cứng: *"không cho một tenant dùng token của tenant khác dù có quyền admin"*. Ba vai hiện có (`ke_toan`/`ke_toan_truong`/`quan_tri`) đều là vai **nội bộ của một doanh nghiệp** — không có khái niệm một tài khoản xem được nhiều doanh nghiệp.
- **Rủi ro/lưu ý quan trọng:** "Công ty dịch vụ" (đại lý kế toán/dịch vụ thuê ngoài, phục vụ nhiều khách hàng cùng lúc) là mô hình kinh doanh rất phổ biến ở Việt Nam — SME thường thuê ngoài kế toán thay vì có phòng riêng, đây có thể là kênh bán hàng B2B2B quan trọng (một đại lý mang theo nhiều khách hàng). **Nhưng đây KHÔNG phải chỉ là "thêm vai thứ 4" vào enum hiện có** — cho một tài khoản xem nhiều tenant khác nhau đối lập trực tiếp với quy tắc cách ly tenant đang là nguyên tắc cứng của toàn hệ thống (RLS + lọc `tenant_id` tường minh mọi nơi). Cần một mô hình riêng biệt (ví dụ: bảng "ủy quyền truy cập" cấp quyền đọc hạn chế của một identity bên ngoài vào nhiều tenant cụ thể, tách khỏi bảng `nguoi_dung` nội bộ từng tenant), không được lẫn vào cơ chế 3 vai hiện tại.
- **Đề xuất hướng xử lý:**
  1. Đăng nhập bằng username **hoặc** email — thay đổi UX nhỏ, rủi ro thấp.
  2. Thiết kế riêng mô hình "đại lý/công ty dịch vụ": một identity được cấp quyền đọc (có thể giới hạn — chỉ xem, không xuất/không kết nối thuế) vào nhiều tenant qua cơ chế ủy quyền tường minh + audit đầy đủ, không phá vỡ RLS/cách ly tenant hiện có (mỗi thao tác vẫn phải xác định rõ đang ở tenant nào).
- **Mức ưu tiên đề xuất:** Trung bình (giá trị kênh bán hàng tiềm năng, nhưng đụng kiến trúc cách ly tenant — cần thiết kế cẩn thận, không làm vội).
- **Nguồn phát hiện:** Yêu cầu chủ dự án, phiên Cowork 2026-07-16.

#### BỔ SUNG [2026-07-19] — chủ dự án mô tả rõ tầm nhìn: mô hình THÀNH VIÊN + CHIA SẺ hồ sơ MST

Nguyên văn ý tưởng chủ dự án (phiên 2026-07-19):

> *"Quản lý tài khoản theo thành viên (thành viên này có các vai trò khác nhau với 1 doanh nghiệp: Chủ/giám đốc, kế toán trưởng, nhân viên, cty dịch vụ kế toán). Một hồ sơ mã số thuế có thể đồng thời chia sẻ việc xem, xuất dữ liệu cho chủ doanh nghiệp, nhân viên kế toán hoặc công ty dịch vụ kế toán; trong khi đó, 1 công ty dịch vụ kế toán có thể có nhiều nhân viên, đồng thời có thể xem và xuất dữ liệu được đối với nhiều doanh nghiệp (MST được chia sẻ, mời xem)."*

Đây **rộng hơn hẳn** mục gốc ở trên: không chỉ là "đại lý đọc nhiều tenant", mà là một mô hình **thành viên ↔ hồ sơ MST nhiều-nhiều, có vai trò theo từng quan hệ, kèm luồng mời/chia sẻ**.

**Vì sao KHÔNG phải là một hạn mức trong bảng gói** (khảo sát 2026-07-19, có bằng chứng):

- `so_mst_toi_da` **không hề đếm MST**. Nó đếm số hàng `tai_khoan_thue`, mà mọi hàng đó bị ép **cùng một MST gốc**: `username = tenant.mst` (`taxAccounts.ts:134`), tài khoản con phải `startsWith(mst)` (`taxAccounts.ts:67`). Tức "tài khoản con" hiện tại = **nhánh của cùng một MST** (vd chi nhánh `4201969169-001`), hoàn toàn khác "nhiều doanh nghiệp khác nhau".
- `tenants.mst` **UNIQUE toàn cục** (migration `0006`) ⇒ doanh nghiệp thứ hai **bắt buộc** là một hàng `tenants` riêng.
- `nguoi_dung.tenant_id` **NOT NULL** + `email` UNIQUE toàn cục (`nguoiDung.ts:19,27`) ⇒ một người dùng thuộc đúng một tenant.
- JWT mang đúng **một** `tenant_id`; RLS keyed theo `tenant_id`.

⇒ Đây là **thay đổi mô hình cách ly dữ liệu**, chạm trục rủi ro pháp lý cao nhất của dự án (NĐ 13/2023), **không phải** thêm một con số vào bảng gói.

**Các trục thiết kế cần chốt trước khi code** (chưa có câu trả lời — đừng đoán):

1. **Đơn vị được chia sẻ là gì** — cả tenant, hay từng *hồ sơ MST*? Chủ dự án nói "một hồ sơ mã số thuế", gợi ý đơn vị chia sẻ **nhỏ hơn** tenant. Điều này có thể buộc tách khái niệm "hồ sơ MST" ra khỏi `tenants`.
2. **Danh tính đăng nhập** hiện gắn cứng vào một tenant. Mô hình mới cần identity **độc lập tenant**, rồi mới nối vào các hồ sơ qua bảng quan hệ — đụng `nguoi_dung`, JWT, và `auth_lookup_user`.
3. **Vai trò theo từng quan hệ**, không phải theo người dùng: cùng một người có thể là *kế toán trưởng* ở doanh nghiệp A và *nhân viên công ty dịch vụ* với doanh nghiệp B. Ba vai hiện có (`ke_toan`/`ke_toan_truong`/`quan_tri`) là vai **trong một tenant** — không đủ.
4. **Công ty dịch vụ kế toán là một thực thể** có nhiều nhân viên, và quyền của nhân viên suy ra từ quyền công ty được cấp. Tức có **hai tầng** quan hệ, không phải một.
5. **Luồng mời/chấp nhận + thu hồi**, và **audit** mọi truy cập xuyên tổ chức.
6. **Quyền chi tiết**: chủ dự án nêu "xem, xuất dữ liệu" — cần chốt tập quyền tối thiểu (xem / xuất / kết nối tài khoản thuế / đổi cấu hình), vì cấp nhầm quyền *kết nối thuế* cho bên thứ ba là rủi ro pháp lý.

**Đề xuất:** đơn vị RIÊNG, có spec riêng + `security-reviewer` bắt buộc. **Không gộp** vào U17 (gói dịch vụ) — đã quyết 2026-07-19. Khi mô hình này có rồi, hạn mức liên quan (vd *số hồ sơ MST một công ty dịch vụ được nhận chia sẻ*) mới trở thành một quyền lợi theo gói bình thường.

- **Mức ưu tiên (cập nhật):** Cao về giá trị kinh doanh, nhưng **phải sau** khi có spec và review bảo mật riêng.
- **Nguồn:** Yêu cầu chủ dự án phiên 2026-07-19; khảo sát mã cùng phiên (4 agent + thẩm định đối kháng).

### [2026-07-16] Tích hợp đăng nhập bằng Định danh điện tử (VNeID) — ƯU TIÊN CAO, cần nghiên cứu kỹ

- **Trạng thái:** Đề xuất — chưa triển khai. Chủ dự án nhấn mạnh **quan trọng và cần nghiên cứu kỹ** trước khi lên kế hoạch code.
- **Bối cảnh:** Đăng nhập nội bộ hiện chỉ có email + mật khẩu (PBKDF2, `apps/api/src/password.ts`). Chủ dự án muốn có thêm lựa chọn đăng nhập bằng tài khoản **Định danh điện tử (VNeID)** — hệ thống định danh điện tử quốc gia (Bộ Công an), ngày càng được yêu cầu/khuyến khích tích hợp ở các dịch vụ tài chính/hành chính tại Việt Nam.
- **CHƯA KIỂM CHỨNG (đúng Nguyên tắc bằng chứng — không suy đoán):** phiên này **chưa nghiên cứu** cơ chế tích hợp VNeID cho bên thứ ba — cụ thể: VNeID có cổng/API mở cho doanh nghiệp tư nhân tích hợp không (hay chỉ dùng nội bộ cơ quan nhà nước), cơ chế xác thực (OAuth2/SAML/khác), thủ tục pháp lý/đăng ký để được phép tích hợp, chi phí, và mức độ bắt buộc đối với ngành hóa đơn điện tử/thuế. **Không tự giả định bất kỳ chi tiết kỹ thuật nào ở đây.**
- **Đề xuất hướng xử lý:** Khi tới lượt làm, dành hẳn **một bước nghiên cứu độc lập riêng** (research-only, chưa code — có thể dùng `/propose-feature` cho bước này) để xác minh 4 điều CHƯA KIỂM CHỨNG ở trên trước khi thiết kế bất kỳ luồng đăng nhập nào. Không bắt đầu code cho tới khi có câu trả lời xác thực (tài liệu chính thức/liên hệ cơ quan quản lý), theo đúng mục "Khi gặp mơ hồ" của Hiến pháp.
- **Mức ưu tiên đề xuất:** Cao (theo yêu cầu chủ dự án) — nhưng lộ trình thực tế phụ thuộc hoàn toàn vào kết quả nghiên cứu khả thi.
- **Nguồn phát hiện:** Yêu cầu chủ dự án, phiên Cowork 2026-07-16 (nhấn mạnh hai lần, coi là quan trọng).

### [2026-07-16] Hạn mức tải xuống miễn phí — 10 lượt/tháng/doanh nghiệp

- **Trạng thái:** Đề xuất — chưa triển khai.
- **Bối cảnh/bằng chứng:** `tenants.goi_dich_vu` đã tồn tại trong schema, mặc định `'free'` (xem `docs/plans/U17-plan.md`), nhưng **chưa gắn bất kỳ giới hạn định lượng nào** theo gói. Hành động xuất/convert đã được ghi audit log (`hanhDong: "export"`/`"convert"` trong `apps/api/src/routes/exports.ts`) — đây là nguồn dữ liệu tự nhiên để đếm số lượt theo tháng nếu cần.
- **Đề xuất hướng xử lý:** Thêm kiểm tra hạn mức trước khi cho phép `POST /exports`/`POST /exports/convert` khi `goi_dich_vu='free'`: đếm số lượt trong tháng hiện tại của tenant (từ audit log hoặc một bảng đếm riêng cho hiệu năng tốt hơn); vượt quá 10 → chặn kèm thông báo rõ + gợi ý nâng gói. Cần quyết định rõ: tính "10 lượt" theo mỗi lần bấm xuất, hay theo mỗi file tải về (có thể khác nhau).
- **Rủi ro/phụ thuộc:** Theo `U17-plan.md`, hiện **chưa có gói trả phí nào** ngoài `free` — nên "vượt hạn mức" hiện chưa có lối nâng cấp thật. Nếu làm hạn mức trước khi có gói trả phí, sẽ chặn người dùng mà không cho họ lối ra — nên cân nhắc làm cùng lúc với lớp thương mại/thanh toán.
- **Mức ưu tiên đề xuất:** Trung bình (phụ thuộc lớp thương mại chưa xây xong).
- **Nguồn phát hiện:** Yêu cầu chủ dự án, phiên Cowork 2026-07-16.

### [2026-07-16] Audit log toàn hệ thống — nâng cấp phần đã có, đang thiếu "tài khoản NÀO" và chưa có nơi xem

- **Trạng thái:** Đề xuất — chưa triển khai (đây là NÂNG CẤP một cơ chế đã tồn tại một phần, không phải xây từ đầu).
- **Bối cảnh/bằng chứng (đã đọc mã nguồn thật, không suy đoán):** Bảng `audit_log` đã tồn tại (`packages/db/src/schema/auditLog.ts`), bất biến — chỉ ghi thêm, có trigger chặn UPDATE/DELETE kể cả chủ sở hữu (U12). Tuy nhiên:
  1. Schema hiện chỉ có `tenant_id, hanh_dong, doi_tuong, chi_tiet, tao_luc` — **KHÔNG có cột định danh người dùng cụ thể** đã thực hiện hành động. Hiện tại log chỉ biết "tenant nào", không biết "người nào trong tenant đó" — không trả lời được câu "tài khoản NÀO đã làm gì" như yêu cầu.
  2. Mới ghi **6 loại hành động** (`export, convert, cap_nhat_cau_hinh, uy_quyen_tai_khoan_thue, dang_nhap_thue_that_bai, dang_nhap_thue_thanh_cong` — grep toàn bộ `apps/api/src`). Bản thân việc **đăng nhập nội bộ** (`POST /auth/login`) **không được ghi audit**.
  3. Không có cột "ở đâu" (địa chỉ IP/thiết bị).
  4. Không có route API hay màn hình nào để **xem lại** audit log — khớp với phát hiện trước đó (chưa có Cổng Admin).
- **Đề xuất hướng xử lý:**
  1. Thêm cột `nguoi_dung_id` (nullable — một số hành động nền như cron không gắn người dùng cụ thể) vào `audit_log`.
  2. Bổ sung ghi audit cho hành động nhạy cảm còn thiếu — tối thiểu: đăng nhập nội bộ thành công/thất bại.
  3. Cân nhắc ghi địa chỉ IP nguồn (từ header Cloudflare `CF-Connecting-IP`) — cần cân nhắc quy định bảo vệ dữ liệu cá nhân (NĐ 13/2023) khi quyết định lưu IP.
  4. Xây `GET /audit-log` (phạm vi tenant, `quan_tri` xem log của chính doanh nghiệp mình) + màn hình xem, lọc theo người/hành động/thời gian.
- **Ràng buộc cần chạm:** `security.md` — không log token/mật khẩu/dữ liệu nhạy cảm thô trong `chi_tiet` (đã có tiền lệ `maskSensitive` ở `taxAccounts.ts`, tái dùng thay vì viết lại).
- **Mức ưu tiên đề xuất:** Cao (an toàn/truy vết — không biết "ai" làm gì là lỗ hổng nghiêm trọng cho một SaaS xử lý dữ liệu thuế của khách hàng).
- **Nguồn phát hiện:** Yêu cầu chủ dự án, phiên Cowork 2026-07-16; xác nhận qua đọc `auditLog.ts` + rà toàn bộ điểm ghi audit hiện có trong `apps/api/src`.

### [2026-07-16] Đồng bộ DÒNG HÀNG (chi tiết hóa đơn) không chạy nổi ở quy mô thật — cần kiến trúc queue 2 pha + backfill

- **Trạng thái:** Đề xuất — chưa triển khai. **Nợ kỹ thuật** ghi lại theo quyết định chủ dự án (phiên 2026-07-16: dừng thiết kế, làm gọn từng phiên, chốt U23 trước). Đã brainstorm và **chọn Hướng A**; CHƯA viết spec/plan. Khi tới lượt: tạo `docs/plans/<U-mới>-plan.md` (U24 đã dùng cho quản lý thành viên — chọn số kế tiếp còn trống).
- **Triệu chứng người dùng:** "Không thấy dòng tên hàng hóa + số lượng." Lưu ý: dòng hàng nằm ở **màn CHI TIẾT hóa đơn** (mục "Dòng hàng"), KHÔNG ở danh sách — đây là **đúng thiết kế U23-A**, không phải lỗi hiển thị.
- **Bối cảnh/bằng chứng (đọc DB production + mã nguồn 2026-07-16, không suy đoán):**
  - DB thật: **2029 hóa đơn** (`hoa_don`, một tenant thật) nhưng **0 dòng hàng** (`dong_hang_hoa`) — mọi HĐ đều trống. Frontend đúng: mỗi HĐ hiện "Chưa có dữ liệu dòng hàng (cần đồng bộ chi tiết)" (`InvoiceDetailPage.tsx:136-140`). API: chỉ `GET /invoices/:id` trả `dongHangHoa`; danh sách không (đúng thiết kế).
  - Lịch sử đồng bộ (`lan_dong_bo`): 188 lần — **18 completed** (tạo 2029 HĐ header, 0 dòng hàng), **170 FAILED**. Lý do fail (`thong_diep_loi`): GDT **HTTP 429 Too Many Requests** (~99), Cloudflare **"Too many subrequests by single Worker invocation"** (~33), **"operation aborted"**/timeout (~28). Token GDT **còn sống** (KHÔNG có 401/session_expired).
  - Gốc rễ: `packages/sync/src/sync.ts:385-395` — pha lấy chi tiết (`fetchDetail`, ĐV3 commit `98f3270`) fetch detail **TUẦN TỰ cho TỪNG hóa đơn trong MỘT lần gọi Worker**. Với ~2000 HĐ/kỳ → vượt trần Cloudflare Free (50 subrequest/lần gọi + CPU 10ms) và đập 429 vào GDT. Chính `sync.ts` ghi TODO: rate-limit per-request detail là phần của **kiến trúc queue 2 pha** (mỗi message detail tự lấy permit) — **chưa xây**. `TenantLimiter` DO hiện chỉ tiêu **1 permit/JOB**, không phải /request.
- **Rủi ro nếu bỏ qua:**
  1. Tính năng cốt lõi (xem dòng hàng — nền của đối chiếu/kê khai) **không dùng được với dữ liệu thật**.
  2. **CẤP THỜI:** cron đang chạy và **fail mỗi lần với 429** (lần cuối ~13:50Z 2026-07-16) — **liên tục đập request lỗi vào máy chủ thuế**, vi phạm "tôn trọng máy chủ thuế" (Hiến pháp §Ranh giới). Nên có bước **"cầm máu"** (giảm nhịp/tạm dừng pha detail nặng) sớm, độc lập với bản sửa lớn.
- **Đề xuất hướng xử lý (đã brainstorm 2026-07-16 — chọn Hướng A):**
  - **Queue 2 pha:** Pha 1 (header, như hiện tại) lưu header → **enqueue 1 message chi tiết / hóa đơn** (kèm `hoadon_id` + detail ref). Pha 2: mỗi message xử **1 hóa đơn** — lấy **1 permit `TenantLimiter` / request**, fetch detail, lưu dòng hàng idempotent (`persistInvoiceLines` đã có: xóa-chèn theo `hoadon_id`+tenant), ack; 429/breaker → reenqueue có delay (**dùng lại `consumerAction` backpressure**); 401 → đánh dấu token chết.
  - **Nhắm chạy được trên Workers Free** (1 fetch/lần gọi vừa 50 subrequest + CPU 10ms); Paid ($5) chỉ để backfill nhanh hơn (tùy chọn — quyết định chủ dự án).
  - **Backfill 2029 HĐ đang trống**: một trigger enqueue message detail cho mọi HĐ thiếu dòng hàng (`hoa_don` LEFT JOIN `dong_hang_hoa` where lines=0), **dùng lại y hệt pha 2**.
  - Hướng B (gom lô nhỏ 5–10 HĐ/message) = tinh chỉnh sau của A; Hướng C (Cloudflare Workflows) = over-engineering, để dành.
- **Quan hệ với các mục khác:**
  - **NỀN cho U22** (`docs/plans/U22-plan.md`): U22 (backfill header theo tháng) cố ý để "đổi pipeline U5" + "rate-limit toàn cục" NGOÀI phạm vi (§2, §6, §7) — nhưng U22 enqueue thêm nhiều tháng header, mỗi tháng lại kéo detail hàng loạt → **U22 không chạy đáng tin cho tới khi pipeline detail này được sửa**. Nên làm đơn vị này TRƯỚC/độc lập; giữ nguyên message header của U22 chạy được (không đổi `SyncJobMessage` cũ).
  - Liên quan mục **"Chưa có giới hạn tốc độ TOÀN CỤC khi gọi GDT"** (đầu danh sách): permit-per-request của đơn vị này là một phần lời giải; ngưỡng cụ thể cần **đo tải thật (contract/probe)** trước khi chốt (Nguyên tắc bằng chứng).
- **Mức ưu tiên đề xuất:** Cao (tính năng cốt lõi hỏng với dữ liệu thật + đang chủ động đập GDT bằng request lỗi — mục "cầm máu" nên xử sớm).
- **Nguồn phát hiện:** Phiên 2026-07-16 (Code) — báo lỗi người dùng "không thấy dòng hàng"; điều tra có phương pháp (query DB production + đọc `sync.ts`/`detailLines.ts`/`deps.ts`/`fanout.ts`/`syncJob.ts`); brainstorm chọn Hướng A; chủ dự án quyết định ghi nợ, làm sau.

---

<!--
Mẫu để copy khi thêm mục mới:

### [YYYY-MM-DD] Tên ngắn gọn ý tưởng/rủi ro
- **Trạng thái:** Đề xuất — chưa triển khai.
- **Bối cảnh/bằng chứng:** ...
- **Rủi ro nếu bỏ qua:** ...
- **Đề xuất hướng xử lý:** ...
- **Mức ưu tiên đề xuất:** Cao/Trung bình/Thấp.
- **Nguồn phát hiện:** ...
-->

## [2026-07-18] "The operation was aborted" — chưa phân loại được là lỗi nền tảng hay GDT chậm

**Ngày phát hiện:** 2026-07-18 (phát sinh khi vá sự cố circuit breaker kẹt mở).

**Mô tả:** `classifyFailure()` (`packages/sync/src/sync.ts`) hiện nhận diện được trần
nền tảng Workers qua chuỗi `"Too many subrequests"` → `failureKind: "local_limit"` →
**không** tính vào circuit breaker GDT. Nhưng chuỗi **`"The operation was aborted"`**
vẫn rơi vào `transient` mặc định ⇒ **vẫn** tính vào breaker.

**Bối cảnh/bằng chứng:** trong sự cố production 2026-07-18, `lan_dong_bo` ghi
`"The operation was aborted"` **n=43** — nhóm lỗi LỚN THỨ HAI, chỉ sau
`"Too many subrequests"` (n=61). Chưa xác định được đây là (a) Workers ép hủy do trần
CPU/wall-time (⇒ lỗi CỤC BỘ, không nên tính vào breaker), hay (b) timeout thật khi gọi
GDT (⇒ đúng là tín hiệu sức khỏe GDT, nên tính). **CHƯA KIỂM CHỨNG** — không đoán,
nên chưa match chuỗi này (nguyên tắc bằng chứng, CLAUDE.md).

**Rủi ro nếu bỏ qua:** nếu phần lớn n=43 đó là lỗi nền tảng, sự cố "breaker mở oan
chặn sạch đồng bộ" có thể **tái diễn một phần** dù đã vá `local_limit`.

**Đề xuất hướng xử lý:** sau khi deploy bản vá, theo dõi `lan_dong_bo` + `wrangler tail`
xem `"The operation was aborted"` còn xuất hiện không và đi kèm ngữ cảnh nào (có
`AbortError` từ `AbortController` timeout của adapter không, hay lỗi runtime Workers).
Có bằng chứng rồi mới thêm nhánh phân loại tường minh + test — **không nới chuỗi match
một cách ẩu**.

**Ưu tiên đề xuất:** Trung bình (chỉ Cao nếu quan sát thấy breaker lại mở oan sau deploy).

**Nguồn phát hiện:** review chéo `dod-auditor` trên nhánh `claude/fix-subrequest-breaker`
(Finding 2), phiên 2026-07-18.

## [2026-07-18] `max_batch_size: 1` có thể vẫn chưa đủ cho tenant nhiều hóa đơn

**Ngày phát hiện:** 2026-07-18 (cùng phiên trên).

**Mô tả:** đã hạ `max_batch_size` 10 → **5** (ban đầu định 1, nhưng cùng ngày chủ dự án
nâng **Workers Paid** ⇒ trần thành 1000 subrequest/invocation, gấp 20×, nên 1 là quá dè
dặt). **CHƯA KIỂM CHỨNG** số subrequest thực tế của MỘT job nặng nhất: `queryInvoices`
phân trang **2 nguồn** (normal + sco), mỗi trang 1 subrequest, cộng ghi DB + gọi Durable
Object limiter. Chưa đo phân bố hóa đơn/tenant thật nên chưa khẳng định được biên an toàn.

**Rủi ro nếu bỏ qua:** tenant lớn tiếp tục fail `"Too many subrequests"`, kỳ quá khứ
không đồng bộ được — đúng triệu chứng gốc.

**Đề xuất hướng xử lý:** đo phân bố số hóa đơn/tenant/tháng thật; nếu có tenant vượt,
chia nhỏ theo **TRANG** (chunk kỳ thành nhiều message, mỗi message vài trang) chứ không
chỉ theo message; hoặc nâng Workers Paid (1000 subrequest/invocation).

**Ưu tiên đề xuất:** Trung bình.

**Nguồn phát hiện:** review chéo `dod-auditor` (Finding 3), phiên 2026-07-18.

## [2026-07-18] Sau U28: hợp nhất hai cơ chế kìm nhịp pha 1 + dedupe job backfill trùng

**Ngày phát hiện:** 2026-07-18 (phiên chẩn đoán "1 tháng chưa kéo được dữ liệu").

> **ĐÍNH CHÍNH cùng ngày:** bản đầu của mục này đề xuất "sco-429 → persist normal +
> `hoan_thanh_mot_phan`, ưu tiên Cao" — **RÚT LẠI**. Phiên song song cùng ngày đã bác
> tiền đề (xem `docs/plans/U28-plan.md` §0b, nhánh `claude/fix-subrequest-breaker`):
> toàn bộ hoá đơn bán ra của tenant hiện tại là `sco` (normal = 0), nên "dữ liệu normal
> bị vứt" gần như không tồn tại; tỷ lệ 429 nghiêng về sco chỉ là **phân bố khối lượng
> request** (normal đứng trước, sco lãnh 429 ở cuối chuỗi). Gốc thật (xác thực 3 lớp):
> pha 1 lấy **1 permit rồi bắn tới 42 request** — U28 (permit-per-request qua decorator
> `GdtTransport`) là lời giải đã được duyệt kế hoạch. Ghép all-or-nothing normal+sco
> chỉ còn đáng bàn khi có tenant TRỘN thật sự hai họ — chưa quan sát được.

**Còn lại đáng làm (sau khi U28 hiện thực):**

1. **Hợp nhất kìm nhịp:** PR #11 (vá nóng cùng ngày) wire `SYNC_PAGE_MIN_INTERVAL_MS=500`
   (giãn nhịp bằng sleep — U25 AC3) vào pha 1. Khi U28 (permit-per-request) hoạt động,
   hai cơ chế CHỒNG nhau → mỗi trang chờ ~2×500ms. Không sai nhưng lãng phí wall-time:
   sau khi nghiệm thu U28 trên production, cân nhắc hạ `SYNC_PAGE_MIN_INTERVAL_MS`
   → `"0"` (tắt tường minh, permit làm chủ nhịp) — chỉ đổi vars, không đổi code.
2. **Dedupe job backfill trùng:** POST /backfill tính "tháng thiếu" từ `lan_dong_bo`,
   nên tháng đang failed/đang backpressure vẫn bị enqueue LẠI mỗi lần người dùng bấm
   (quan sát production: 2 run cùng tháng cùng phút, nhiều lần trong 07:38–09:10Z).
   Dưới cửa sổ phạt 429, mỗi cú bấm nhân thêm tải đúng lúc tệ nhất. Hướng: tracker DO
   đã có sẵn — kiểm "backfill đang sống cho (tài khoản, tháng, chiều)" trước khi enqueue.

**Ưu tiên đề xuất:** Trung bình (cả hai đều là dọn-sau-U28; U28 mới là việc chính).

**Nguồn phát hiện:** phiên chẩn đoán 2026-07-18 (bằng chứng `lan_dong_bo` production),
đối chiếu `docs/plans/U28-plan.md` (phiên song song cùng ngày, nhánh
`claude/fix-subrequest-breaker`).

## [2026-07-19] Rủi ro quy trình: nhiều agent cùng MỘT thư mục repo + nợ dọn sau U27

**Ngày phát hiện:** 2026-07-18 → 19 (phiên thực thi U27).

**1. Rủi ro quy trình — ĐÃ GÂY THIỆT HẠI THẬT (ưu tiên Cao).**
Hai phiên Claude chạy song song trong **cùng thư mục repo chính** dùng chung `.git/index`
và working tree. Hậu quả đo được trong phiên này:

- Một `git commit` (chủ ý chỉ `add` 2 file) đã **nuốt 23 file / +925 dòng** của phiên kia
  — kể cả `apps/api` — vào commit `e7ad31b`. `git status` ngay trước đó chỉ hiện 2 file.
- File nguồn bị **đồng-sửa theo thời gian thực**: một dòng `import` biến mất rồi hiện lại
  giữa hai lệnh bash liên tiếp; Edit tool báo "file modified on disk since last read".

**Đề xuất:** khi chạy nhiều agent trên cùng repo, mỗi agent làm trong **git worktree
riêng** (`git worktree add -b <nhánh> <dir> <base>` — index/HEAD/working tree riêng).
Muốn bảo toàn việc chưa-commit của phiên khác mà KHÔNG chạm cây của họ: dựng snapshot
bằng **index tạm** (`GIT_INDEX_FILE=<tmp> git read-tree HEAD && … add -A && write-tree`
→ `git commit-tree` → `git branch <backup>`). Cân nhắc ghi thành luật trong
`.claude/rules/` vì đây là lần **thứ hai** (xem sự cố git-race 2026-07-15).

**2. Nợ dọn cụ thể (ưu tiên Thấp):**

- Nhánh **`feat/u27-web-loc-ketxuat-dongbo`** (commit `ba8c41e`) chỉ tồn tại ở máy local,
  là bản U27 **trùng lặp** với PR #10 đã merge (`5410337`), và còn chứa `yesterdayVN`
  (mặc-định-hôm-qua) mà chủ dự án đã quyết **BỎ**. Nên xoá để tránh nhầm lẫn về sau.
- Worktree `Documents/Projects/vat-u27-clean`, nhánh cứu hộ
  `wip/line-view-snapshot-20260717`, và stash trên `claude/u22-backfill` — xoá được khi
  chắc không cần.

**3. Nghiệm thu U27 còn thiếu (ưu tiên Thấp):** hành vi (c) — bấm "Đồng bộ khoảng này" và
xem báo kết quả — **chưa smoke-test được** trên production vì kỳ quá khứ chiều mua vào còn
bị 429 chặn (xem mục 2026-07-18 phía trên). Hai hành vi còn lại đã kiểm trên production và
**ĐẠT**: (a) chọn Mua vào/Bán ra ẩn đúng ô MST; (b) nút Xuất Excel/CSV hiện với vai đủ quyền.

**Nguồn phát hiện:** phiên thực thi U27 (2026-07-18 → 19).

## [2026-07-20] Thiếu UI admin — replay & quản trị hệ thống chỉ có endpoint máy

**Ngày phát hiện:** 2026-07-20 (phiên deploy H-B.6).

**Vấn đề:** H-B.6 dựng endpoint `POST /dlq/replay` (phát lại job đồng bộ hỏng) nhưng **chỉ gọi được bằng `curl`** — không có giao diện. Chủ dự án muốn một **trang admin để một mình quản lý mọi thứ** (xem/replay job hỏng từ `dong_bo_that_bai`, xem tình trạng đồng bộ mọi tenant, quản người dùng/tenant/phân quyền, xem audit log/cảnh báo). App hiện tại (`vatengine.tourdao.vn`) chỉ là màn tra cứu/kết xuất hoá đơn **theo từng tenant**, KHÔNG có tầng quản trị hệ thống.

**Phân rã đề xuất (2 mức, tách được):**
- **Nhỏ — trang replay có giao diện:** một màn admin (sau Cloudflare Access) liệt kê `dong_bo_that_bai` trạng thái `da_dau` + nút "Phát lại", gọi `/dlq/replay`. Phạm vi vừa, làm nhanh.
- **Lớn — trang quản trị toàn hệ thống:** thuộc vùng **U24** (quản lý người dùng nội bộ) + hơn thế. Cần đặc tả riêng: định nghĩa "super-admin" là ai; RLS/pháp lý khi một identity đọc **nhiều tenant** (đối lập quy tắc cách ly tenant — xem mục "công ty dịch vụ đọc nhiều DN" phía trên); audit truy cập admin. KHÔNG làm ẩu — dễ thành lỗ rò dữ liệu giữa khách hàng.

**Ưu tiên:** Cao (chủ dự án chủ động nêu). Bắt đầu bằng mức Nhỏ nếu chỉ cần thao tác vận hành; mức Lớn cần brainstorm → spec như H-B.6.

**Nguồn phát hiện:** phiên deploy H-B.6 2026-07-20 (`docs/audit/HANDOFF-2026-07-20.md`).
### [2026-07-20] Không có nhật ký audit cho lượt đăng ký bị từ chối (`/dang-ky`)

- **Trạng thái:** Đề xuất — chưa triển khai. Phát hiện trong review chéo U17b.
- **Bối cảnh/bằng chứng:** `apps/api/src/routes/dangKy.ts` chỉ ghi `audit_log` (hành động `dang_ky`) khi request THÀNH CÔNG (201, trong cùng transaction `withTenant`). Các nhánh 400 (`bad_request`/`chua_dong_y_dieu_khoan`/`email_khong_hop_le`/`mst_khong_hop_le`), 409 (`da_ton_tai`), và 429 (`qua_nhieu_yeu_cau`) đều KHÔNG ghi gì. Cảnh báo khi chạm ngưỡng limiter (`signupLimiterDO.ts` dòng ~47-49, `signup_rate_limited`) cố ý CHỈ log `at` (thời điểm) — không kèm IP, theo đúng nguyên tắc `security.md` (không log PII/IP tràn lan). Gốc ràng buộc: `audit_log.tenant_id` là `NOT NULL` + RLS (`packages/db/src/schema/auditLog.ts`) — một lượt đăng ký thất bại không có tenant nào để gắn.
- **Rủi ro nếu bỏ qua:** không có bằng chứng pháp lý để điều tra dò quét/lạm dụng `/dang-ky` — đúng lúc ADR-0006 (rủi ro dò danh bạ MST/email) xác nhận việc dò quét này khả thi về kỹ thuật. Không biết được ai/khi nào/bao nhiêu lượt đã thử dò trước khi bị limiter chặn.
- **Đề xuất hướng xử lý:** cần một thiết kế riêng, không phải vá nhanh — hoặc (a) một nhật ký KHÔNG gắn tenant, tái dùng bảng `audit_log_admin` đã có sẵn cho hành động xuyên-tenant (`U17-plan.md` QĐ-6) thay vì tạo bảng thứ ba, hoặc (b) Cloudflare Analytics Engine (định lượng, không cần khóa ngoại tenant). Route sang U18 (đơn vị kế tiếp chạm audit xuyên-tenant).
- **Mức ưu tiên đề xuất:** Trung bình (không chặn vận hành, nhưng là khoảng trống điều tra sự cố).
- **Nguồn phát hiện:** Review chéo phiên U17b, 2026-07-20.

### [2026-07-20] `SignupLimiter` fail-open khi thiếu binding — rủi ro triển khai, không phải lỗi hiện tại

- **Trạng thái:** Ghi nhận rủi ro — không hành động ngay, giám sát qua smoke test bắt buộc.
- **Bối cảnh/bằng chứng:** `signupLimiterClient()` (`apps/api/src/signupLimiterDO.ts` dòng ~72-82): nếu `ns` (namespace `SIGNUP_LIMITER`) là `undefined`, trả về client giả luôn `chan:false` — KHÔNG chặn gì, không có token để hoàn (`refund` no-op). Đây là khuôn giống hệt `loginLimiterDO.ts` fail-open đã có tiền lệ trong dự án — hợp lý cho khóa đăng nhập (một lớp trong nhiều lớp phòng thủ của `/auth`), nhưng RỦI RO HƠN ở đây vì `/dang-ky` là **cổng ghi công khai duy nhất** và `SignupLimiter` là **lớp chống lạm dụng DUY NHẤT** của nó — không có lớp thứ hai. Binding + migration tag `v5` (`apps/api/wrangler.jsonc` dòng ~59) hiện ĐÃ khai báo đúng, nên đây KHÔNG phải lỗi đang tồn tại — mà là rủi ro nếu triển khai sai thứ tự (deploy thiếu binding) hoặc rollback về bản trước `v5`.
- **Rủi ro nếu bỏ qua:** một lần cấu hình sai hoặc rollback sẽ ÂM THẦM cho phép tạo tenant `cho_duyet` không giới hạn — chỉ lộ ra qua một dòng `console.warn` (`signup_limiter_unavailable`), không có cảnh báo chủ động nào theo dõi log này realtime.
- **Đề xuất hướng xử lý:** không đổi code — hạ tầng hiện đã đúng. Bắt buộc smoke test đường 429 (bấm liên tiếp vượt ngưỡng từ cùng IP, xác nhận lượt vượt ngưỡng trả 429) SAU MỖI lần deploy `apps/api`, không chỉ smoke test `/health` hay đường 201. Cân nhắc, khi tới lượt, một cảnh báo chủ động (không chỉ log) khi limiter fail-open lặp lại.
- **Mức ưu tiên đề xuất:** Trung bình — không sửa code, chỉ là kỷ luật vận hành (đưa vào checklist deploy).
- **Nguồn phát hiện:** Review chéo phiên U17b, 2026-07-20.

### [2026-07-20] `/dang-ky` không xác minh quyền sở hữu email lẫn MST — U18 phải biết khi duyệt

- **Trạng thái:** Đề xuất — cần được phản ánh trong spec U18, chưa triển khai.
- **Bối cảnh/bằng chứng:** `apps/api/src/routes/dangKy.ts` chấp nhận bất kỳ `email` hợp dạng (qua `validateEmailDangKy` — chỉ lọc dạng/alias/miền dùng-1-lần/allowlist đuôi, KHÔNG xác minh chủ sở hữu hộp thư) và bất kỳ `mst` đúng 10/13 chữ số (KHÔNG đối chiếu với cơ quan thuế hay bất kỳ nguồn xác thực nào). Cổng kiểm soát thật duy nhất là bước duyệt thủ công của Admin ở U18 (`tenants.trang_thai: cho_duyet → active`).
- **Rủi ro nếu bỏ qua:** nếu spec U18 không nói rõ điều này, người duyệt (Admin) có thể ngầm định "email hiển thị trong hồ sơ chờ duyệt là email thật của MST đó" — sai. Một địa chỉ email giả mạo/gần giống (lookalike) đăng ký kèm MST thật của người khác có thể bị duyệt nhầm nếu Admin không được cảnh báo rằng email CHƯA XÁC MINH.
- **Đề xuất hướng xử lý:** khi viết spec U18 (`docs/plans/U18-plan.md`), ghi rõ trong màn duyệt: email hiển thị là **CHƯA XÁC MINH** (chưa có bước gửi email/xác nhận liên kết) — Admin cần tự đối chiếu thông tin doanh nghiệp (vd tra cứu MST công khai) trước khi duyệt, không chỉ tin theo dữ liệu người đăng ký tự khai.
- **Mức ưu tiên đề xuất:** Cao (ảnh hưởng trực tiếp bước quyết định duyệt/từ chối của U18 — cần vào spec trước khi U18 code, không phải vá sau).
- **Nguồn phát hiện:** Review chéo phiên U17b, 2026-07-20.

### [2026-07-21] KHÔNG XOÁ ĐƯỢC TENANT — trigger append-only của `audit_log` chặn cascade. Ảnh hưởng quyền xoá dữ liệu (NĐ 13/2023)

- **Trạng thái:** Phát hiện khi dọn tenant smoke sau deploy U20. Chưa xử lý.
- **Bối cảnh/bằng chứng (ĐO ĐƯỢC, không suy đoán):** `DELETE FROM tenants WHERE mst='9999999902'` trên production ném lỗi:
  `error: audit_log là append-only: không được DELETE (security.md)` — `P0001`, từ `audit_log_no_mutate()`, phát sinh bởi `DELETE FROM ONLY "public"."audit_log" WHERE tenant_id = $1` tức **cascade** của FK. Chạy dưới role migrate/owner vẫn bị chặn, đúng thiết kế của trigger (0002).
- **Vì sao đây là mâu thuẫn thật, không phải lỗi:** hai ràng buộc đều đúng và đang húc nhau. (a) `security.md`: *"Audit log không được ghi đè, chỉ append"* — nhật ký phải bất biến để có giá trị pháp lý. (b) Hiến pháp: tuân thủ **NĐ 13/2023** về dữ liệu cá nhân, trong đó có quyền **yêu cầu xoá dữ liệu**. Hiện (a) chặn (b) một cách tuyệt đối: **không tenant nào từng phát sinh audit có thể bị xoá khỏi hệ thống.**
- **Rủi ro nếu bỏ qua:** khi một doanh nghiệp khách yêu cầu xoá tài khoản và dữ liệu, hệ thống **không thực hiện được** bằng bất kỳ thao tác nào — kể cả chủ dự án với quyền cao nhất. Đây là rủi ro pháp lý, không phải bất tiện vận hành. Hiện chưa lộ vì mới có 1 khách thật.
- **Đề xuất hướng xử lý (chưa chốt — cần quyết định ở tầng kiến trúc, KHÔNG tự quyết khi code):**
  - **A.** Xoá mềm: `tenants.trang_thai='da_xoa'` + xoá dữ liệu nghiệp vụ (hóa đơn, dòng hàng, tài khoản thuế), GIỮ audit. Nhật ký còn nguyên nhưng chỉ còn id không quy được về người — có thể đủ cho NĐ13 nếu audit không chứa dữ liệu cá nhân.
  - **B.** Cho phép xoá audit theo tenant qua một hàm `SECURITY DEFINER` hẹp, có ghi vào `audit_log_admin` rằng đã xoá. Phá tính bất biến, nhưng có vết.
  - **C.** Tách audit sang nơi lưu trữ khác khi tenant bị xoá (archive), rồi mới xoá hàng.
  - Cần đối chiếu NĐ 13/2023 xem audit log có nằm trong phạm vi "dữ liệu cá nhân phải xoá" hay thuộc ngoại lệ lưu trữ theo nghĩa vụ pháp luật.
- **Hệ quả vận hành ngay:** tenant smoke **không xoá được**, chỉ vô hiệu hoá bằng `trang_thai='khoa'`. Trên production hiện có 3 tenant smoke ở tình trạng này (`9999999999`, `9999999901`, `9999999902`).
- **Mức ưu tiên đề xuất:** **Cao** — phải có câu trả lời TRƯỚC khi nhận khách hàng trả phí, vì đây là cam kết pháp lý chứ không phải tính năng.
- **Nguồn phát hiện:** Dọn dẹp sau smoke test deploy U20, 2026-07-21.

### [2026-07-21] U19 còn thiếu: panel chi tiết doanh nghiệp + form sửa metadata

- **Trạng thái:** Ghi nợ có ý thức — chủ dự án chốt 2026-07-21 ship U19 ở mức hiện tại để gỡ chỗ kẹt duyệt tenant trước. **Đề xuất làm CÙNG U21**, không làm riêng.
- **Bối cảnh:** `docs/plans/U19-plan.md` §3/§4 liệt kê `TenantDetail.tsx` (panel xem người dùng của tenant, lịch sử `lan_dong_bo`, trạng thái hạn token GDT) và form sửa metadata. Backend đã sẵn sàng từ U18: `GET /admin/tenants/:id` (`admin_chi_tiet_tenant`) trả đủ dữ liệu, `PATCH /admin/tenants/:id` nhận `ten`/`goi_dich_vu`/`ghi_chu`, và `adminApi.suaMetadata` + `adminApi.chiTietTenant` đã có trong `apps/admin/src/lib/adminApiClient.ts` — chỉ thiếu tầng UI.
- **Ảnh hưởng hiện tại:** KHÔNG chặn việc chính. Chủ dự án vẫn duyệt/từ chối/khóa/mở khóa/cấp lại mật khẩu được, vẫn xem được nhật ký. Thiếu phần "nhìn sâu vào một doanh nghiệp" và sửa tên/gói (hiện phải sửa bằng SQL tay nếu cần).
- **Vì sao đề xuất gộp với U21:** U21 (dashboard giám sát) tiêu thụ đúng cùng tập dữ liệu — trạng thái token GDT sắp hết hạn, lịch sử đồng bộ, sức khỏe theo tenant. Dựng `TenantDetail` riêng bây giờ nhiều khả năng phải viết lại khi U21 định hình cách trình bày các chỉ số đó.
- **Lưu ý ràng buộc khi làm:** form sửa metadata **KHÔNG được có ô email và ô MST** — `admin_sua_metadata_tenant` (migration 0011) không nhận hai trường đó, và backend trả 400 nếu gửi lên. Email là danh tính đăng nhập, MST là khoá tự nhiên (U23-D: 1 MST ↔ 1 tenant); cả hai đáng là thao tác riêng có audit riêng.
- **Mức ưu tiên đề xuất:** Trung bình — làm khi tới U21.
- **Nguồn phát hiện:** Chốt phạm vi U19, 2026-07-21.

### [2026-07-21] Khoá tenant KHÔNG cắt phiên khách đang sống — nút "Khoá" của U18 trễ tới 8 giờ

- **Trạng thái:** Ghi nợ có ý thức — chủ dự án chốt 2026-07-21 KHÔNG xử lý ở U18 (hiện mới 1 tài khoản, rủi ro thật gần bằng 0). Phải xử lý TRƯỚC khi có khách hàng thật thứ hai.
- **Bối cảnh/bằng chứng:** ĐO ĐƯỢC, không phải suy đoán (test tạm chạy thật trong phiên U18, đã xoá sau khi kết luận): khách đăng nhập thật → nhận cookie phiên TTL 8h (`TOKEN_TTL_SEC`, `apps/api/src/auth.ts`) → super-admin gọi `POST /admin/tenants/:id/khoa` → DB đổi `trang_thai='khoa'`, 200 OK → khách dùng **đúng cookie cũ** gọi `GET /invoices` → **200, đọc đủ hóa đơn**. Nguyên nhân: `requireTenant` (`apps/api/src/auth.ts:42-76`) chỉ verify chữ ký + `exp`, KHÔNG tra lại `tenants.trang_thai`. Cổng trạng thái U17b/U18 chỉ tồn tại ở `/auth/login` (`routes/auth.ts`) nên chặn **đăng nhập mới**, không thu hồi phiên đang chạy. Đã grep `invoices.ts`/`me.ts`/`exports.ts`/`reconcile.ts`/`taxAccounts.ts` — không route nào kiểm lại.
- **Vì sao test U18 không bắt được:** `admin.tenants.test.ts` có ca "Khóa → khách KHÔNG đăng nhập được nữa" — ĐÚNG nhưng chỉ thử **đăng nhập lại**, không thử token còn sống. Điểm mù của chính người viết; phát hiện ra nhờ pass red-team độc lập.
- **Rủi ro nếu bỏ qua:** nút "Khoá" tồn tại để cắt truy cập KHẨN (tài khoản bị chiếm, gian lận, chấm dứt hợp đồng). Trễ tới 8 tiếng làm nó gần như vô hiệu đúng trong kịch bản nó sinh ra để phục vụ. Về câu chữ spec (`U18-plan.md` §5: "khóa → chặn login ngay") thì hiện thực KHÔNG sai — nhưng ý nghĩa nghiệp vụ thì hụt.
- **Đề xuất hướng xử lý — 4 hướng đã cân, đề xuất C tách thành ĐƠN VỊ RIÊNG:**
  - **A.** Tra `trang_thai` mỗi request trong `requireTenant`. Cắt tức thì, nhưng `requireTenant` chạy TRƯỚC khi route mở kết nối DB ⇒ phải mở thêm một kết nối cho MỌI request khách. Ở mục tiêu 100k tenant là chi phí thật trên đường găng.
  - **B.** Hạ `TOKEN_TTL_SEC` 8h → 1h. Một dòng, không thêm chi phí/request, nhưng chỉ **thu hẹp** cửa sổ chứ không đóng.
  - **C. (đề xuất)** Đưa điều kiện `trang_thai='active'` vào chính RLS policy (`packages/db/src/schema/_rls.ts`). Thi hành ở tầng DB, không thêm truy vấn ứng dụng nào, tenant bị khoá thấy 0 hàng ở MỌI bảng. Đúng bài toán nhất — nhưng bán kính ảnh hưởng lớn (đụng policy của tất cả bảng) nên KHÔNG được nhét vào cuối một đơn vị đã đóng phạm vi; cần đơn vị riêng + đo chi phí subquery trong policy trước khi chốt.
  - **D.** Chấp nhận + ghi nợ. ← đang ở đây.
- **Mức ưu tiên đề xuất:** Trung bình bây giờ, **Cao ngay khi có khách hàng trả phí đầu tiên ngoài chủ dự án**.
- **Nguồn phát hiện:** Pass red-team cách ly tenant, review chéo U18, 2026-07-21.

### [2026-07-21] Không có test tự động nào chạy dưới role Postgres non-superuser thật — RLS FORCE chỉ được kiểm bằng tay

- **Trạng thái:** Ghi nhận khoảng trống bằng chứng. Không phải lỗi đang tồn tại.
- **Bối cảnh/bằng chứng:** Toàn bộ test integration dùng **PGlite**, vốn chạy dưới **superuser** — superuser bỏ qua RLS kể cả `FORCE`, và bỏ qua mọi kiểm tra GRANT. Nghĩa là bộ test KHÔNG thi hành được lớp phòng thủ thứ hai mà `multi-tenant.md` đặt ra. Dự án đã bù một phần bằng kiểm **catalog** (`packages/db/test/integration/superAdmin.test.ts` dùng `has_table_privilege`/`has_function_privilege`/`pg_policy`/`pg_proc.proowner` — đúng bất kể ai truy vấn), nhưng đó là kiểm *khai báo*, không phải kiểm *thi hành*. Bằng chứng duy nhất cho "RLS FORCE thực sự chặn role app" là lần kiểm tay trên Neon ghi ở đầu `0001` (dòng 60-65) và `0011` — **không tái lập tự động, không chạy lại mỗi PR**.
- **Rủi ro nếu bỏ qua:** một migration tương lai gỡ nhầm `FORCE ROW LEVEL SECURITY`, đổi owner bảng, hoặc provision role app sai thuộc tính (`BYPASSRLS`) sẽ KHÔNG bị bộ test bắt được — chỉ lộ ra ở lần kiểm tay kế tiếp, hoặc không bao giờ. Đây đúng loại "giả định chưa kiểm chứng đã hoá thành chốt" mà Hiến pháp cảnh báo.
- **Đề xuất hướng xử lý:** một job CI (chạy theo lịch, không chặn PR — như `contract`/`coverage-apps` hiện có) dựng Postgres thật trong container, áp toàn bộ migration, chạy `packages/db/provisioning/app-role.sql` để tạo role app đúng thuộc tính, rồi khẳng định: (a) role app đọc bảng của tenant khác ra 0 hàng, (b) role app KHÔNG SELECT được `quan_tri_he_thong`, (c) role app GỌI ĐƯỢC cả 8 hàm `admin_*`. Ca (c) quan trọng ngang hai ca đầu — nó bắt đúng lỗi mà `0009` đã gây ra trên production.
- **Mức ưu tiên đề xuất:** Trung bình — không chặn U19, nhưng nên có trước khi lớp thương mại (U17–U21) đón khách thật.
- **Nguồn phát hiện:** Pass red-team cách ly tenant, review chéo U18, 2026-07-21.

### [2026-07-20] CHƯA KIỂM CHỨNG — nguyên tử hóa `checkAndRecordSignup` dựa vào input-gating của Durable Object, chưa chạy trên `workerd` thật

- **Trạng thái:** CHƯA KIỂM CHỨNG (nhãn bắt buộc theo Hiến pháp — nguyên tắc bằng chứng).
- **Bối cảnh/bằng chứng:** Bản vá TOCTOU (commit `7b43790`, F1 — gộp check+record thành một `checkAndRecordSignup` nguyên tử, xem `apps/api/src/signupLimiter.ts` + `signupLimiterDO.ts`) dựa vào tiền đề: input-gating của Durable Object đảm bảo không lệnh gọi nào khác xen được vào giữa đọc và ghi của MỘT `fetch()`. Tiền đề này đã được kiểm chứng bằng test đối kháng (RED-PROOF: 12/12 lượt lọt ngưỡng trước khi vá, xanh sau khi vá) — NHƯNG test chạy trên **mô hình in-memory trung thực** (fake DO trong test harness), KHÔNG chạy trên runtime `workerd` thật. `signupLimiterDO.ts` dòng 3-4 tự ghi chú "KHÔNG test-cover (cần runtime DO thật...)" — đúng quy ước hiện có của dự án (`loginLimiterDO.ts` cũng nằm ngoài phủ test theo cách tương tự), không phải sơ suất riêng của U17b.
- **Rủi ro nếu bỏ qua:** nếu hành vi input-gating thật của `workerd` sai khác mô hình giả lập (ví dụ ở biên: timeout, eviction, hibernation giữa chừng một `fetch()`), lỗ hổng TOCTOU đã vá có thể **tái xuất hiện** mà không có test nào bắt được, vì bài test hiện tại không chạm runtime thật.
- **Đề xuất hướng xử lý:** khi có cơ hội (không chặn deploy U17b) — thêm một phép kiểm chứng chạy trên `workerd` thật (`wrangler dev --remote` hoặc `vitest-pool-workers` nếu đủ độ trung thực DO) bắn N request đồng thời vào một `SignupLimiter` DO thật, đo lại đúng kịch bản RED-PROOF (N request, ngưỡng thấp, đếm số lượt lọt) để xác nhận input-gating thật khớp mô hình. Tới khi có bằng chứng đó, tiếp tục dán nhãn CHƯA KIỂM CHỨNG mọi nơi tiền đề này được viện dẫn.
- **Mức ưu tiên đề xuất:** Thấp–Trung bình (tiền đề input-gating nằm trong tài liệu chính thức Cloudflare, khả năng sai thấp — nhưng theo Hiến pháp, "đã có trong tài liệu" không tự động là "đã kiểm chứng" khi áp cho một cơ chế bảo mật cụ thể).
- **Nguồn phát hiện:** Review chéo phiên U17b, 2026-07-20.

---

## `dvtte` trống ở 100% hóa đơn `sco` — nghi lỗ hổng ánh xạ tầng adapter

**Phát hiện:** 2026-07-20, khi khảo sát production để lập `docs/plans/U29-plan.md` (§8b-E1).

**Bằng chứng (Neon production, 1 tenant, 22.350 hóa đơn, truy vấn chỉ-đọc):**

| `nguon` | số HĐ | có `dvtte` | có khóa `tgia` trong `raw_json` |
|---|---|---|---|
| `sco` (purchase + sold) | 22.229 | **0** | **0** |
| `normal` (purchase) | 121 | **121 = 100%** | **121 = 100%** |

Hai trường `dvtte`/`tgia` hiện diện ở **100%** hóa đơn `normal` và **0%** hóa đơn `sco`.
Trùng khít con số 121 ở cả hai cột ⇒ không phải ngẫu nhiên: **họ endpoint `/sco-query/`
không trả hai trường này**, không phải "hóa đơn máy tính tiền không có đơn vị tiền tệ".

**Vì sao đáng lưu:** cột "Tiền tệ" đã có trong `EXPORT_COLUMNS` từ U7 nên file kết xuất
hiện **trống 99,5%** ở cột đó. Đây là lỗi **có sẵn từ trước**, không do U29 gây ra, nhưng
U29 là lúc phát hiện ra nó.

**Câu hỏi cần quyết ở tầng adapter (KHÔNG tự quyết ở tầng export):** adapter có nên mặc
định `sco → dvtte = 'VND'` không? Hóa đơn máy tính tiền gần như chắc chắn là nội địa —
nhưng **"gần như chắc chắn" không phải bằng chứng** (Hiến pháp §"Nguyên tắc bằng chứng").
Cần kiểm chứng từ nguồn sơ cấp (tài liệu GDT hoặc phản hồi thật của `/sco-query/`) trước
khi điền giá trị mặc định vào dữ liệu người dùng.

## `tgia` (tỷ giá) — đã LOẠI khỏi U29, kèm điều kiện mở lại

**Quyết định chủ dự án 2026-07-20:** không thêm cột tỷ giá vào file kết xuất
("không cần thiết"). Là lựa chọn YAGNI hợp lệ — production **0 hóa đơn `dvtte≠'VND'`**,
79 giá trị `tgia` khác null thì **toàn bộ = 1**, phương sai bằng 0 ⇒ cột sẽ không mang
thông tin nào, và không có mẫu nào để kiểm chứng ngữ nghĩa tỷ giá-ngoại tệ.

**Điều kiện mở lại (đừng để mất dấu):** sự *hiện diện* của `tgia` do `nguon='normal'`
quyết định 100%, không do nghiệp vụ — tenant này là cây xăng, 99,5% `sco`, nên hồ sơ
**bất thường**. Một tenant B2B/xuất nhập khẩu dùng chủ yếu hóa đơn `normal` sẽ có trường
này đầy đủ. ⇒ Khi xuất hiện tenant đầu tiên có `dvtte≠'VND'`: kiểm chứng
`raw_json->>'tgia'` bằng dữ liệu thật, rồi mới thêm cột.

## Nợ tên: `ColumnKind` có cả `int` lẫn `num`

U29 thêm `num` ("số có thể thập phân, không numFmt") cạnh `int` ("số nguyên thô") trong
`packages/export/src/columns.ts`. Hai kind này hiện **cùng hành vi** (`{t:"num"}`, không
áp `#,##0`) — tách ra chỉ để `int` không nói dối trên cột thập phân. Đáng gộp thành một
kind duy nhất khi có dịp chạm vào file đó; không đáng một commit riêng.

**Ưu tiên đề xuất:** Thấp (nợ tên, không ảnh hưởng hành vi).

**Nguồn phát hiện:** `docs/plans/U29-plan.md` §8b + §9 (M1/M3).

---

## 🔔 Báo cho admin khi có người đăng ký mới (phát hiện 2026-07-22, ngay sau khi U33 live)

**Trạng thái hiện tại — đã kiểm chứng bằng mã, không phải phỏng đoán:**
- `routes/dangKy.ts` chỉ INSERT tenant + người dùng + audit log. Không gửi email, không webhook, không đẩy queue.
- `apps/api` không có bất kỳ thư viện gửi email nào (đúng QĐ-1: hạ tầng email thuộc U24).
- Cổng Admin không có polling, không badge, không đếm hồ sơ chờ.
- Thứ duy nhất đang đỡ: `TenantsPage` mặc định mở tab `cho_duyet` ⇒ vừa đăng nhập là thấy danh sách.

**Vì sao bây giờ mới thành vấn đề:** U33 vừa mở cổng đăng ký cho người lạ. Trước đó chỉ có 1 khách do chủ dự án tự tạo nên không ai cần được báo. Giờ khách đăng ký xong ngồi chờ không biết chờ bao lâu, còn chủ dự án không biết có người đang chờ. Đây là lỗ hổng VẬN HÀNH, không phải lỗi mã.

**Ba hướng, xếp theo công sức:**

| Hướng | Công sức | Đánh đổi |
|---|---|---|
| **A. Webhook Telegram/Zalo** ngay trong `routes/dangKy.ts` sau khi commit thành công | Thấp nhất — một `fetch()` + một secret | Phải fail-SILENT (webhook hỏng KHÔNG được làm hỏng đăng ký của khách). Không cần hạ tầng email. Hợp với việc dự án đã dùng Zalo làm kênh hỗ trợ |
| **B. Email cho admin** qua MailChannels/Resend | Trung bình | Kéo U24 lên sớm. Nhưng đằng nào cũng cần U24 để báo cho KHÁCH khi được duyệt — làm một lần dùng hai đầu |
| **C. Cron tổng hợp hằng ngày** đọc `tenants` trạng thái `cho_duyet` | Thấp | Trễ tới 24h. Chỉ hợp khi lượng đăng ký còn thưa |

**Lưu ý thiết kế cho cả ba hướng:** nội dung báo KHÔNG được chứa mật khẩu tạm và nên che bớt PII (`maskSensitive` đã có sẵn) — `security.md` cấm log dữ liệu nhạy cảm, và một webhook/email là nơi lưu vết nằm NGOÀI tầm kiểm soát tenant.

**Đề xuất:** làm **A** trước như một miếng vá vận hành (chi phí gần bằng không, dùng được ngay), rồi thay bằng **B** khi U24 tới — chứ không chờ U24 mới có gì báo.

---

## 🧱 PGlite không kiểm chứng được migration đụng ROLE/OWNER/GRANT (2026-07-22)

PGlite chạy **superuser**, nên mọi câu `CREATE ROLE`, `ALTER … OWNER TO`, `GRANT`, `SET ROLE` đều lọt trong test mà có thể hỏng trên production — nơi role migrate (`neondb_owner` trên Neon) **không** phải superuser.

Đã cắn thật hai lần: migration 0011 ghi nhận trước dưới dạng "giới hạn phủ test", và migration 0013 hỏng đúng vì nó (chi tiết ở `U34-KE-HOACH-LAT-CAT.md` §4b).

Hướng có thể làm, chưa chốt:
- Chạy một job CI đối chiếu bằng Postgres thật (container) dưới role **non-superuser**, chỉ cho nhóm migration có đụng quyền.
- Hoặc: quy ước bắt buộc áp migration bằng script `pg` tự viết (transaction + in lỗi từng câu) thay vì `drizzle-kit migrate` — vì công cụ đó nuốt mất thông báo lỗi.
- Hoặc: tránh hẳn việc tạo role mới trong migration; tái dùng role sẵn có (đổi lại: bán kính thiệt hại rộng hơn).


## 🧹 Hai món dọn mở ra từ Lát cắt 3 (QĐ-14, 2026-07-22)

Cả hai đều là **dọn**, không chặn gì. Ghi lại vì cả hai là loại "để lâu thì quên mất vì sao
nó còn ở đó", chứ không phải loại "để lâu thì đắt".

**1. Hàm SQL `admin_dat_mat_khau_tam` (migration 0011) nay mồ côi.**
Không route nào gọi nữa sau khi `admin/matKhauTam.ts` bị xoá. KHÔNG sửa `0011` — migration
là lịch sử, sửa file cũ là làm sai lệch thứ đã chạy trên production. Dọn bằng một migration
MỚI (`DROP FUNCTION IF EXISTS`) khi tiện.
⚠️ Nhớ bài học `0009`: `DROP FUNCTION` xoá sạch mọi `GRANT` gắn trên hàm. Ở đây vô hại vì
xoá hẳn, nhưng đừng `DROP` rồi `CREATE` lại mà quên cấp lại quyền.

**2. Cột `nguoi_dung.mat_khau_tam_het_han` và `phai_doi_mat_khau` chỉ còn phục vụ hàng CŨ.**
Đường CẤP mật khẩu tạm đã gỡ, nhưng cổng CHẶN ở `apps/api/src/routes/auth.ts` vẫn giữ — nó
bảo vệ những hàng cấp trước Lát cắt 3. Gỡ cổng khi và chỉ khi xác nhận được:

```sql
SELECT count(*) FROM nguoi_dung WHERE mat_khau_tam_het_han IS NOT NULL;  -- phải = 0
```

Bằng 0 rồi thì bỏ được cả cổng, cả hai cột, và cờ `phai_doi_mat_khau` ở `apps/web`
(`auth-context.tsx`, `DoiMatKhauCard.tsx`). Trước đó thì KHÔNG — gỡ sớm là cho một mật khẩu
6 số quá hạn bỗng đăng nhập được.

---

### [2026-07-23] Trang đăng nhập: "Ghi nhớ đăng nhập" + "Quên mật khẩu?" đang TẠM ẨN

- **Trạng thái:** Tạm ẩn UI — chưa triển khai chức năng.
- **Bối cảnh:** Chủ dự án yêu cầu (phiên Cowork 2026-07-23) ẩn hai dòng "Ghi nhớ đăng nhập (sắp có)" và "Quên mật khẩu? (sắp có)" ở `apps/web/src/features/auth/LoginPage.tsx` để làm sau, tránh nhãn "(sắp có)" gây rối mắt trên màn đăng nhập. Chỗ render đã thay bằng comment mốc, không xoá logic backend nào.
- **Việc còn nợ khi làm thật:**
  - *Ghi nhớ đăng nhập:* cần backend hỗ trợ phiên dài hạn (remember-me cookie/refresh) — hiện phiên hết khi tải lại (ADR-0003). Không bật UI trước khi backend sẵn sàng.
  - *Quên mật khẩu:* cần luồng đặt lại mật khẩu qua email (token 1 lần, hết hạn) — phụ thuộc hạ tầng gửi email (xem mục AWS SES trong backlog này) và trang đặt lại mật khẩu.
- **Đề xuất hướng xử lý:** Khi quyết định làm, tách thành đơn vị U riêng (kế hoạch → TDD → review chéo), khôi phục UI ở `LoginPage.tsx` và nối vào endpoint tương ứng.
- **Mức ưu tiên đề xuất:** Trung bình (tiện lợi người dùng, không chặn vận hành).
- **Nguồn phát hiện:** Phiên Cowork 2026-07-23 — refactor trang đăng nhập theo yêu cầu chủ dự án.

### [2026-07-26] Nợ nhỏ delta-sync (final review)

- **Trạng thái:** Đề xuất — chưa triển khai. Ghi lại từ final whole-branch review của chuỗi delta-sync (Task 3/6, `apps/sync-worker/src/runDeltaJob.ts` + `packages/sync`), sau khi đã vá riêng finding "Important" (trần tổng-trang cộng dồn, xem `.superpowers/sdd/task-6-report.md` mục "Fix final review"). Các mục dưới đây là minor, không chặn, gom lại để không lạc phạm vi lượt vá đó.
- **Danh sách (mỗi mục một câu, không thiết kế chi tiết — làm khi tới lượt):**
  1. **429 giữa vòng audit không vào circuit breaker** — `xuLyLoiAudit` nhánh `rate_limited` chỉ trả `retry_backpressure`, không gọi `deps.limiter.recordResult(false)`, trong khi nhánh delta (`runDeltaJob`) có ghi nhận tương tự cho một số lỗi khác; cân nhắc unify hai nhánh audit/delta cho nhất quán ngữ nghĩa breaker.
  2. **Thiếu cảnh báo khi audit vòng ≥1 mà `lanDongBoId` rỗng** — về lý thuyết bất khả đạt theo luồng hiện có (`runAuditJob` luôn set), nhưng không có `console.warn`/assertion phòng hờ nếu một producer tương lai vi phạm hợp đồng.
  3. **Chưa có test chốt `bpAttempt` bị strip đúng khi nối chuỗi delta** — `messageKeTiep` xoá `bpAttempt` bằng destructuring nhưng test hiện có không assert tường minh trường này biến mất ở message kế tiếp (chỉ ngầm định qua `toEqual` không liệt kê nó).
  4. **Lỗi hậu-GDT (DB/queue) trong `runAuditJob` bị tính vào breaker** — đã ghi ở mục 2 báo cáo Task 6 gốc, chưa quyết định thống nhất với `runDetailJob` (nơi lỗi DB KHÔNG tính vào breaker).
  5. **`dlqConsume` chưa nguyên tử hoá `chotDeltaRun` trong transaction** — ghi sổ `dong_bo_that_bai`/`audit_log` và gọi `chotDeltaRun` là hai bước tách rời; lỗi giữa hai bước để lại trạng thái nửa vời (đã ghi sổ nhưng chưa chốt run, hoặc ngược lại nếu đổi thứ tự).
  6. **Comment lỗi thời ở `packages/db/src/schema/dongBoThatBai.ts`** — cột `loai` ghi chú `// 'header' | 'detail'` nhưng thực tế đã nhận thêm `'audit' | 'delta'` từ Task 6 I2; nằm ngoài `apps/sync-worker` nên chưa sửa trong lượt vá liên quan.
  7. **`mockApi.exportOk` (test fixture) và mock scenario "du" trùng lặp** — chưa DRY hoá giữa các file test dùng chung kịch bản audit "đủ".
  8. **Nén row audit-"du" khi scale** — mỗi lần audit hội tụ "đủ" ghi một row `lan_dong_bo(loai='audit', completed)`; ở tenant chạy nhiều vòng lặp lại nhiều tháng, số row có thể tăng nhanh — cân nhắc nén/dọn định kỳ khi có bằng chứng về khối lượng thật.
  9. **InfoTip (Task 11, `apps/web`) chưa đóng bằng phím Esc** — vi phạm nhẹ WCAG 1.4.13 (Content on Hover or Focus — phải dismissible bằng bàn phím); cần thêm `onKeyDown` xử lý Esc.
- **Mức ưu tiên đề xuất:** Thấp (không mục nào chặn vận hành hiện tại; 1/4/5 liên quan độ tin cậy vận hành nên ưu tiên cao hơn trong nhóm này, 9 liên quan a11y).
- **Nguồn phát hiện:** Final whole-branch review delta-sync, phiên 2026-07-26.

### [2026-07-27] Chẩn đoán "thiếu hoá đơn ngày 26/07 khi trích xuất 25–26/07": GDT công bố hoá đơn MTT trễ 1–2 ngày — KHÔNG phải bug lọc/đồng bộ

- **Trạng thái:** Đã chẩn đoán xong (bằng chứng prod 2026-07-27, ~10:00 VN) — chờ chủ dự án chọn hướng xử lý sản phẩm.
- **Triệu chứng:** Trích xuất 25/07→26/07 chỉ thấy 18 HĐ cho ngày 26/07 (2 normal-purchase + 16 sco-sold), trong khi ngày thường ~420 HĐ (vd 24/07: 442, 25/07: 416).
- **Đã LOẠI TRỪ bằng bằng chứng (không phải nguyên nhân):**
  - Biên khoảng ngày phía GDT (`buildSearch` `T00:00:00`→`T23:59:59`) — đúng.
  - Biên lọc DB theo giờ VN (`dayBoundaryVn` +07:00) khớp quy ước lưu `tdlap` (khoảnh khắc UTC của 00:00 VN; toàn bộ tdlap prod đều ở giờ-VN=0, kể cả sco) — đúng, không lệch múi giờ.
  - Biên tháng của audit (`vnMonthRangeUtc`) — đúng, cùng công thức +07:00.
  - Backfill chia cửa sổ THÁNG ĐẦY ĐỦ (`monthlyWindows`) — ngày 26 nằm trong cửa sổ.
- **Nguyên nhân gốc (đã kiểm chứng qua `ncnhat` — mốc GDT nhận/cập nhật hoá đơn):** hoá đơn máy tính tiền (sco) của ngày D chỉ xuất hiện trên API tra cứu GDT **trễ 1–2 ngày**:
  - sco mua vào ngày D: `ncnhat` trải từ ~19:00 VN ngày D đến ~12:30 VN ngày D+1 (có khi D+2 — vd HĐ 24/07 có ncnhat_max 26/07T05:33Z).
  - sco bán ra ngày D: `ncnhat` chủ yếu sáng ngày D+1.
  - ⇒ Trích xuất/đồng bộ trong ngày 26/07 (hoặc sáng 27/07) không thể lấy được thứ GDT chưa công bố. Audit 26/07 16:24 VN ghi "đủ" là ĐÚNG so với total GDT tại thời điểm đó. Đây là bản chất nguồn dữ liệu, cùng họ với phát hiện "người bán đẩy trễ" trong docs/CHAN-DOAN-thieu-hoa-don-thang.md, nhưng ở thang NGÀY cho MTT.
- **Cơ chế tự-lành sẵn có:** cron 03:00Z (10:00 VN) hằng ngày đồng bộ tháng hiện tại → ngày 26 sẽ tự đầy trong 1–2 ngày. Sự cố phụ sáng 27/07: ~27 lần bấm backfill dồn dập → 429/timeout → circuit breaker mở từng đợt (217 bản ghi `dong_bo_bo_qua_breaker`/30h) → catch-up chậm + nhiều run treo `running` tạm thời (DLQ rỗng — message chỉ đang quay vòng backpressure, sẽ tự thoát).
- **Đề xuất hướng xử lý (chờ duyệt, chưa làm):**
  1. *(Khuyến nghị, rẻ)* Thêm tick cron audit thứ hai cho THÁNG HIỆN TẠI vào buổi tối (~13:00Z = 20:00 VN) để ngày đuôi tự đầy ngay trong tối cùng ngày thay vì chờ 10:00 VN hôm sau.
  2. *(Sản phẩm)* UI/kết xuất cảnh báo "ngày đuôi" của khoảng lọc (D-1, D): "Hoá đơn máy tính tiền lên Thuế trễ 1–2 ngày — số liệu 1–2 ngày gần nhất có thể chưa đầy đủ" (khai báo qua Registry/luật ui.md, cần spec riêng).
  3. *(Vận hành)* Chống dồn dập: route backfill có thể từ chối/gộp khi đã có backfill cùng (tài khoản × khoảng) đang chạy — giảm lũ 429 tự gây.
- **Mức ưu tiên đề xuất:** Cao cho (1)+(2) — đây là lần thứ hai người dùng tưởng "mất dữ liệu" vì độ trễ GDT; niềm tin sản phẩm bị xói mòn dù hệ thống đúng.
- **Nguồn phát hiện:** Phiên chẩn đoán 2026-07-27 (systematic-debugging), truy vấn trực tiếp Neon prod: phân bố `ncnhat`/`created_at` theo ngày lập, sổ `lan_dong_bo`, `audit_log`, `dong_bo_that_bai`.

### [2026-07-27] Đã làm: guard khử chuỗi kéo delta trùng lặp — và nợ còn lại (unique index)

- **Trạng thái:** Guard ĐÃ hiện thực trong cùng ngày (commit `fix(sync): khử chuỗi kéo delta trùng lặp` — `coDeltaRunDangChay` @vat/sync + dep `coChuoiKeoDangChay` trong `runAuditJob` vòng 0). Đây chính là hiện thực của đề xuất #3 mục chẩn đoán [2026-07-27] phía trên, đặt ở TẦNG CONSUMER (chặn mọi nguồn: bấm tay, cron, replay) thay vì tầng route. *Cập nhật cùng ngày (đơn vị minh bạch tác vụ nền):* guard được DỜI LÊN ĐẦU `runAuditJob` (trước cả tiền kiểm permit) — audit trùng tiêu **0 permit + 0 request GDT**; kèm API `GET /tax-accounts/:id/sync-status` + response `thangDangChay` + UI "x tác vụ nền đang chạy".
- **Nợ còn lại (finding Major, review dod-auditor 2026-07-27):** guard là SELECT best-effort — hai audit vòng 0 cùng scope chạy đồng thời (queue `max_concurrency: 3`) vẫn có thể cùng mở run (TOCTOU). Hệ quả đã bị chặn trên ~3 chuỗi (đủ thoát livelock), nhưng chặn cứng cần **partial unique index** trên `lan_dong_bo (tenant_id, taikhoan_id, chieu, tu_ngay) WHERE trang_thai='running' AND loai='sync'` + xử lý conflict ở `moDeltaRun` (insert đụng index → coi như "đã có chuỗi", không mở). Là MIGRATION nên tách đơn vị riêng (plan → TDD → review).
- **Kèm theo dõi (finding Minor):** trần tuổi `TUOI_TOI_DA_CHUOI_KEO_MS` = 2h CHƯA KIỂM CHỨNG dưới tải lớn — nếu quan sát chuỗi lành chạy >2h bị mở trùng, nâng trần.
- **Nguồn phát hiện:** Review chéo dod-auditor sau fix livelock 2026-07-27.

### [2026-07-27] Chuyển cron nền sang đường delta-audit (tiết kiệm ~98% request ngày thường)

- **Trạng thái:** Đề xuất — chưa triển khai.
- **Bối cảnh:** Cron nền (nay 20:00 UTC = 03:00 VN, QĐ chủ dự án 27/07) vẫn đi đường LEGACY: kéo đủ cả tháng hiện tại mỗi ngày (~200 request/ngày với tenant ~10k HĐ/tháng). Đường delta (backfill tay) chỉ tốn 4 request/tháng khi đã đủ. Sự cố 27/07 chứng minh tiết kiệm request là phòng thủ trực tiếp trước tường lửa GDT.
- **Việc:** scheduled() enqueue `buildAuditMessages` (kind:"audit") cho tháng hiện tại thay vì message legacy; giữ legacy cho `force`. Cần cân nhắc: run legacy hằng ngày hiện cũng là cơ chế cập nhật `ttxly/tthai` đổi trạng thái — audit "đủ" sẽ KHÔNG refresh trạng thái → có thể cần vòng refresh trạng thái riêng (tần suất thưa hơn).
- **Kết quả ncnhat 27/07 (bằng chứng chốt):** GDT nạp HĐ MTT ngày D thành batch ~19:00 VN tối D + rải tới ~12:30 trưa D+1 (303/303 hoá đơn ngày 26 có ncnhat sau 16:24 hôm 26 — audit "đủ" lúc 16:24 là ĐÚNG, giả thuyết A thắng, không có bug đếm audit).
- **Nguồn phát hiện:** Câu hỏi chủ dự án về số request mỗi lần đồng bộ, phiên 27/07.

### [2026-07-27] `invoiceDoc.ts` (renderer XML/HTML "chứng từ", U22) chưa hưởng sửa 3 trường thuế của U35b

- **Trạng thái:** Ghi nhận — cố ý KHÔNG sửa trong U35b (ngoài phạm vi spec `docs/plans/U35-plan.md` Phần B, vốn chỉ nêu `columns.ts`/`xlsx.ts`/`flatExport.ts`).
- **Bối cảnh:** U35b sửa 3 trường thuế (`tsuat` → hiện %, `tsuatTien` tự tính khi GDT thiếu, `tongSauThue` chuẩn hóa) ở đường kết xuất PHẲNG (xlsx/csv, `packages/export/src/columns.ts` + `xlsx.ts`). `packages/export/src/invoiceDoc.ts` (renderer XML/HTML một-hóa-đơn-một-file, dùng cho `xml.zip`/`html.zip`, U22) là ĐƯỜNG RENDER KHÁC — `lineValue()` chỉ làm `String(v)` thẳng từ `InvoiceLineLike`, nên vẫn in `tsuat` thô (`0.08`, không phải "8%") và KHÔNG tự tính `tsuatTien` khi GDT thiếu.
- **Rủi ro nếu bỏ qua:** người dùng xuất `xml.zip`/`html.zip` thay vì xlsx/csv sẽ thấy hành vi cũ (số thô, có thể trống Tiền thuế) — KHÔNG nhất quán với file xlsx/csv đã sửa.
- **Đề xuất hướng xử lý:** khi tới lượt, cân nhắc cho `invoiceDoc.ts` dùng chung `tsuatTienChuan()`/định dạng percent từ `columns.ts` (hiện là hàm module-private, cần export thêm nếu tái dùng) — hoặc chấp nhận khác biệt có chủ đích nếu `xml.zip`/`html.zip` được coi là "bản dựng thô từ dữ liệu đã đồng bộ", không phải file kê khai.
- **Mức ưu tiên đề xuất:** Thấp (đường xlsx/csv là đường kê khai/đối chiếu chính; xml/html là phụ).
- **Nguồn phát hiện:** Rà soát phạm vi khi thực thi U35b, phiên 27/07.

### [2026-07-27] `make test` (toàn repo, 12 workspace chạy đồng thời) có flakiness — `apps/sync-worker` ngẫu nhiên vài test đỏ, KHÔNG phải regression

- **Trạng thái:** Ghi nhận — đã cô lập bằng chứng, chưa sửa (ngoài phạm vi U35).
- **Triệu chứng:** Chạy `make test` (root, `npm run test --workspaces` — 12 workspace ĐỒNG THỜI) 3 lần liên tiếp trong cùng phiên: 2/3 lần `apps/sync-worker` báo đỏ 5–7 test (tập hợp KHÁC NHAU mỗi lần: lần 1 = `{recorderMask, loadAccountToken, enumerate, detailJob×3, runJob}`, lần 2 = `{detailJob×1, enumerate, recorderMask, runJob, loadAccountToken}`) trong khi TOÀN BỘ 11 workspace còn lại (gồm `packages/db` mang thay đổi U35 thật) LUÔN xanh cả 3 lần.
- **Bằng chứng loại trừ regression:** chạy `npx vitest run` CHỈ RIÊNG `apps/sync-worker` (cô lập, không tranh chấp tài nguyên với 11 workspace khác) → **168/168 xanh, ổn định**, thời gian mỗi test NHANH HƠN RÕ RỆT (vd `loadAccountToken` ~2–6s cô lập vs ~10–30s trong lúc chạy đồng thời cả repo). Tập hợp test đỏ đổi ngẫu nhiên giữa các lần chạy đồng thời — dấu hiệu kinh điển của tranh chấp tài nguyên (nhiều PGlite WASM instance + thao tác giải mã token chạy song song), KHÔNG phải lỗi tất định trong mã.
- **Không đụng gì trong `apps/sync-worker`/token vault/crypto ở U35** — U35 chỉ chạm `packages/db`, `packages/sync`, `packages/query`, `apps/api`, `apps/web`.
- **Rủi ro nếu bỏ qua:** nếu CI cũng chạy `make test` với mức song song tương tự trên máy giới hạn tài nguyên, PR KHÔNG LIÊN QUAN tới `apps/sync-worker` có thể bị đỏ giả ngẫu nhiên, gây mất niềm tin vào cổng test.
- **Đề xuất hướng xử lý:** khi tới lượt — (a) đo xem CI có tái hiện được flakiness này không (máy CI thường ít lõi hơn máy dev, có thể RÕ hơn); (b) cân nhắc giảm mức song song của `npm run test --workspaces` (vd `--workspaces --if-present` tuần tự hoặc giới hạn `--max-old-space-size`/số worker vitest) hoặc tách `apps/sync-worker` (nhóm test PGlite+crypto nặng nhất) chạy riêng.
- **Nguồn phát hiện:** 3 lần chạy `make test` toàn repo khi đóng đơn vị U35, phiên 27/07.

### [2026-07-27] Kết xuất giữa lúc đồng bộ đang chạy → dòng hàng trống (race export × sync)

- **Trạng thái:** Chẩn đoán xong — dữ liệu KHÔNG mất; chưa cần fix dữ liệu, chỉ còn đề xuất UX.
- **Hiện tượng:** File `vatengine-export-01042026-30042026.xlsx` (tạo 15:14:19 VN 27/07) có 2 dòng (STT 91, 324 — HĐ 2014 & 1788, C26MYY, sco) trống toàn bộ cột hàng hóa/số lượng/đơn giá/thành tiền.
- **Nguyên nhân gốc (đã kiểm chứng Neon prod):** 2 HĐ này có header từ đợt sync 24/07 (521 HĐ, xmin 230561) nhưng pha 2 chi tiết bị SÓT riêng 2 HĐ (DLQ = 0 dòng, không còn dấu vết lý do sót). Run sold tháng 4 hôm 27/07 chạy 15:12:48→15:17:54; export bấm lúc 15:14:18 — GIỮA run, trước khi run vá chi tiết (~15:17:21, xmin 292727/292729 kề HĐ mới 1785). Sheet phẳng xuất `EMPTY_LINE` đúng thiết kế ("HĐ chưa đồng bộ chi tiết vẫn phải xuất hiện"). Sau run: 523/523 HĐ sold T4 đủ dòng hàng — xuất lại là đủ.
- **Đề xuất (chờ duyệt):** cùng họ với đề xuất "UI cảnh báo ngày đuôi": khi tenant có run `running` chồng lấn khoảng lọc, UI/export cảnh báo "Đang đồng bộ — file có thể thiếu chi tiết, nên xuất lại sau khi đồng bộ xong" (đọc `GET /tax-accounts/:id/sync-status` sẵn có). Cân nhắc thêm cột/ô đánh dấu "chi tiết chưa đồng bộ" trong file thay vì ô trống câm.
- **Nguồn phát hiện:** Phiên chẩn đoán 2026-07-27 (systematic-debugging), truy vấn trực tiếp Neon prod (xmin bracket + audit_log export + lan_dong_bo).

### [2026-07-28] SỰ CỐ ĐÃ VÁ + nợ phòng ngừa: migration tạo bảng mà quên `GRANT` → `permission denied` chỉ lộ ra ở production

- **Trạng thái:** Sự cố đã vá nóng (GRANT ba bảng) **+ đã codify thành migration
  `0018_u35_grant_bang_thieu.sql` (2026-07-28, áp production, hậu kiểm `has_table_privilege`
  xác nhận)** — DB mới/staging/DR từ nay không lặp lại lỗi này. **Cổng phòng ngừa (CI đối
  chiếu bảng quyền tự động) VẪN CHƯA làm** — chủ dự án hoãn, vẫn đúng, giữ nguyên đề xuất
  bên dưới.
- **Hiện tượng:** 39 phiên `lan_dong_bo` trạng thái `failed` trong 24h (MST 019197004411: 16, 4201969169: 13, 4200730402: 5). Người dùng thấy "13 tác vụ đồng bộ chạy nền" không bao giờ dứt và tưởng hệ thống bị GDT chặn tốc độ.
- **Nguyên nhân gốc (đã kiểm chứng, `lan_dong_bo.thong_diep_loi` nguyên văn):** `permission denied for table bo_dem_phien_ban`. Chuỗi kéo hoá đơn về ĐƯỢC, nhưng chết ở bước `capSoPhienBan` khi chốt phiên ⇒ run `failed` ⇒ queue retry ⇒ lặp vô hạn. **Không liên quan rate-limit GDT** (24h chỉ 1 lần breaker mở).
- **Cơ chế:** repo KHÔNG có `ALTER DEFAULT PRIVILEGES` (grep = 0); `packages/db/provisioning/app-role.sql:28` chạy `GRANT … ON ALL TABLES` đúng MỘT LẦN (2026-07-14). Mọi bảng tạo sau mốc đó KHÔNG thừa hưởng quyền nào. Migration `0007:72-75` đã ghi cảnh báo này bằng chữ — nhưng `0008` (`dong_bo_that_bai`) và `0017` (U35: `bo_dem_phien_ban`, `lich_su_thay_doi_hoa_don`) vẫn quên. **Lỗi này chỉ lộ ra SAU deploy production**, vì test chạy trên PGlite với role owner (không có `vat_app`).
- **Đã vá:** `scripts/va-quyen-bang-thieu.mjs` cấp quyền tối thiểu cho 3 bảng. Cần codify thành migration khi merge U35 (xem mục lệch nhánh bên dưới).
- **Rủi ro nếu bỏ qua cổng phòng ngừa:** đây là lần thứ HAI dự án dính đúng bẫy này. Mọi migration tạo bảng trong tương lai đều có thể lặp lại, và triệu chứng luôn là "đồng bộ hỏng bí ẩn ở production" — tốn nhiều giờ chẩn đoán mỗi lần, như phiên 28/07.
- **Đề xuất cổng chặn (chờ duyệt):** test tích hợp chạy dưới role non-owner thật, hoặc đơn giản hơn — test đọc `pg_class` liệt kê mọi bảng `public` rồi đối chiếu với bảng tra "quyền theo thiết kế" (đã có sẵn trong `scripts/kiem-quyen-bang.mjs`); bảng mới không khai quyền ⇒ CI đỏ. Liên quan mục `[2026-07-21] Không có test tự động nào chạy dưới role Postgres non-superuser thật`.
- **Nợ kèm theo:** `scripts/kiem-quyen-bang.mjs` phát hiện một số bảng có quyền RỘNG HƠN thiết kế (di sản `GRANT … ON ALL TABLES`) — chưa rà, chưa thu hồi.
- **Nguồn phát hiện:** Phiên chẩn đoán 2026-07-28, khởi đầu từ câu hỏi "quy tắc rate-limit đã áp cho mọi tài khoản chưa?".

### [2026-07-28] Cron nền 03:00 sáng 28/07 KHÔNG sinh phiên nào — chưa rõ nguyên nhân

- **Trạng thái:** Phát hiện, CHƯA điều tra (cần log Cloudflare, DB không trả lời được).
- **Bằng chứng:** `lan_dong_bo` trống hoàn toàn từ 16:00 VN 27/07 đến 09:00 VN 28/07. Toàn bộ 307 hoá đơn sáng 28/07 là do chủ dự án bấm tay lúc 09:00–09:36.
- **Ba giả thuyết (chưa phân xử):** (a) cổng egress đóng — `isEgressBlocked(health)` ở `apps/sync-worker/src/index.ts:91` khiến `scheduled()` bỏ qua im lặng, log `[GATE] egress GEO_BLOCKED`; (b) `enumerateDueAccounts` trả rỗng nên không có message nào; (c) cron `0 20 * * *` (commit `4c5e7d1`) chưa thực sự deploy lên production.
- **Rủi ro nếu bỏ qua:** đồng bộ nền coi như không tồn tại — mọi dữ liệu phụ thuộc thao tác tay của người dùng, phá vỡ lời hứa "chạy nền" của sản phẩm.
- **Cách phân xử:** `npx wrangler tail --name vat-sync-worker` quanh 03:00 VN, hoặc mục Logs/Cron của Worker trên dashboard Cloudflare.
- **Nguồn phát hiện:** Phiên chẩn đoán 2026-07-28.

### [2026-07-28] ⭐ ƯU TIÊN 1 — Xuất hóa đơn theo MẪU CHUẨN (bản thể hiện giống GDT) + gói ZIP chia sẻ công khai qua R2 có hạn 1 tháng

- **Trạng thái:** ✅ **ĐÃ TÁCH HỒ SƠ KHỞI ĐỘNG → `docs/plans/U37-HO-SO-KHOI-DONG-xuat-hoa-don-theo-mau.md`** (2026-07-28). Mục backlog này giữ lại làm **lịch sử hỏi–đáp**; **mọi việc tiếp theo đọc file U37**. **Mức ưu tiên: 1 (cao nhất trong giỏ)** — chỉ định trực tiếp của chủ dự án, phiên 2026-07-28.
- **🔄 ĐỔI HƯỚNG (2026-07-28, cùng ngày, chủ dự án):** **không dựng bản thể hiện từ dữ liệu nữa — tải thẳng hóa đơn gốc từ GDT.** Tiền đề đã kiểm chứng bằng bundle JS của chính cổng GDT: `GET /api/{query|sco-query}/invoices/export-xml?nbmst&khhdon&shdon&khmshdon` + `Authorization: Bearer <token>` trả blob ZIP chứa **XML gốc có chữ ký số**; điều kiện là cờ `hsgoc` (có ở 100% hóa đơn đã đồng bộ). Chi tiết + bằng chứng: U37 §4.5/§4.6. **Bốn quyết định cũ bị vô hiệu hóa** (QĐ-1 chỉ bán ra, QĐ-2 PDF, QĐ-4 logo tự tải lên, QĐ-8 dòng tuyên bố) — xem U37 §3. Kế hoạch mới đã duyệt; còn treo **R-b** (probe thật `export-xml`) trước khi code.
- **Yêu cầu nguyên văn của chủ dự án (3 điều kiện):**
  1. Nút **"Xuất hóa đơn"** đặt **cạnh nút Xuất Excel** hiện có; file kết xuất phải **đúng mẫu hóa đơn GTGT của GDT** — gồm **logo**, thông tin người bán đầy đủ, và các thông tin cần thiết của người mua. Mẫu tham chiếu: `docs/doi_chieu_data/hoa_don_mau.pdf`.
  2. File tải về ở **định dạng nén (nghiêng về ZIP)**, lưu trong **R2** (hoặc dịch vụ Cloudflare phù hợp) **giữ 1 tháng rồi tự xóa** để giải phóng dung lượng; đặt ở chế độ **công khai, chỉ-đọc** để chia sẻ được qua **link / email / Zalo / WhatsApp** — người nhận **đọc + tải xuống được mà không cần đăng nhập**.
  3. Khâu **kiểm tra chất lượng trước khi phát hành**: đảm bảo hóa đơn tạo ra **đạt chuẩn, không sai, không thiếu thông tin**.
- **Bối cảnh/bằng chứng (đã kiểm chứng 2026-07-28, không suy đoán):**
  - **Mẫu tham chiếu có thật và đọc được:** `docs/doi_chieu_data/hoa_don_mau.pdf` — 25,3 MB, **~171 trang** (nhiều hóa đơn nối nhau). Trích văn bản trang 1 (`pdftotext -f 1 -l 1`) cho thấy khung trường chuẩn của **"Bản thể hiện của hóa đơn điện tử"**: tiêu đề *HÓA ĐƠN GIÁ TRỊ GIA TĂNG*, `Ký hiệu` (1C26TMF), `Số` (7608), ngày lập, **Đơn vị bán hàng + MST + Địa chỉ + Fax + Điện thoại + Địa điểm bán hàng**, **Đơn vị mua hàng + MST + Địa chỉ + Họ tên người nhận**, `Hợp đồng số`, `Phương thức thanh toán`, `Phương thức vận chuyển`, `Ghi chú`, rồi bảng dòng hàng (`STT | Tên hàng hóa, dịch vụ | ĐVT | Số lượng | Đơn giá | Thành tiền`) và dòng `Thuế suất thuế GTGT (%)`.
  - **Hạ tầng R2 ĐÃ CÓ, đang dùng cho kết xuất:** `apps/api/wrangler.jsonc:42-44` — binding `RAW` → bucket `vat-raw` (ghi chú trong file: "U7: R2 lưu file kết xuất (xlsx/csv)").
  - **Bộ khung kết xuất ĐÃ CÓ, tái dùng được nhiều:** `packages/export/src/` gồm `zipStream.ts` (đã biết nén ZIP), `invoiceDoc.ts` (renderer XML/HTML **một-hóa-đơn-một-file**, U22 — chính là điểm bám gần nhất cho "một hóa đơn = một trang mẫu"), `columns.ts`/`xlsx.ts`/`csv.ts`/`lineRows.ts`, `profiles/`.
  - **Điểm đặt nút đã xác định:** `apps/web/src/features/invoices/InvoiceExportButtons.tsx` (và `apps/web/src/features/exports/ExportsPage.tsx`).
#### Vòng 2 — chủ dự án trả lời 6 điểm (2026-07-28), kèm kết quả kiểm chứng của phiên

**(1) Giả định "GDT có lưu logo" — ⚠️ BẰNG CHỨNG NGƯỢC LẠI, KHÔNG ĐƯỢC CHỐT.**
Chủ dự án nêu: *"Hoá đơn tải về từ trang GDT vẫn có logo, có nghĩa là nó được lưu sẵn ở 1 nơi nào đó trong cơ sở dữ liệu của GDT rồi."* Phiên này đã **giám định trực tiếp chính file mẫu** và kết luận **file mẫu KHÔNG đến từ GDT**:

- **Chân trang mỗi hóa đơn trong `hoa_don_mau.pdf` (trích nguyên văn, `pdftotext -f 1 -l 1`):** *"Đơn vị cung cấp dịch vụ Hóa đơn điện tử: Tập đoàn Công nghiệp - Viễn thông Quân đội (Viettel), MST: 0100109106. **Tra cứu hóa đơn điện tử tại Website: https://vinvoice.viettel.vn/utilities/invoice-search**. Mã số bí mật: 5666OK7MZX1R3CK."* — lặp lại ở mọi trang kiểm tra (dòng 87, 176, 265, 354, 443…), mỗi hóa đơn một "Mã số bí mật" riêng. **"Mã số bí mật" là khóa tra cứu của NHÀ CUNG CẤP (Viettel vinvoice), không phải trường của GDT.**
- **Metadata PDF (`pdfinfo`):** `Producer: iText® 5.5.13`, 152 trang, tạo 01/07/2026 14:54 — bản kết xuất hàng loạt từ hệ thống nhà cung cấp.
- **Ảnh nhúng (`pdfimages -list`):** đúng **3 ảnh/trang**, kích thước **giống hệt nhau ở mọi trang** (179×364, 512×106, 130×54) — tức logo/con dấu của **một** người bán (Xăng dầu Quân đội KV3), do **hệ thống Viettel** chèn khi dựng bản thể hiện, không phải dữ liệu đi kèm từng hóa đơn.
- **Adapter của ta biết gì về GDT:** `packages/gdt-client/src/endpoints.ts` + `detail.ts` chỉ có `/query/invoices/{purchase,sold}`, `/sco-query/...` và `/…/invoices/detail` (4 tham số định danh) — **không có endpoint PDF/logo nào**.
- **Tín hiệu thị trường (đối thủ):** `KHAO_SAT_TINH_NANG_NIBOT.md:31` — *"mỗi hóa đơn có nút tải XML và PDF; **với PDF gốc có logo/màu, NIBOT chào dịch vụ DOLAGO để tải từ nhà cung cấp**"*. Nếu GDT phát PDF có logo, NIBOT đã không phải bán thêm một dịch vụ bên thứ ba để lấy nó.

⇒ **Suy luận có cơ sở (chưa phải kết luận cuối):** logo nằm ở hệ thống **nhà cung cấp dịch vụ HĐĐT của người bán** (Viettel/VNPT/MISA/…), **không** ở kho GDT. Đây đúng dạng bẫy mà Hiến pháp cảnh báo (bài học `:30000`) — **một tiền đề chưa kiểm chứng suýt định hình cả tính năng ưu tiên 1**.
**Phép kiểm chứng dứt điểm còn thiếu (phải làm trước khi thiết kế):** đăng nhập `hoadondientu.gdt.gov.vn` bằng tài khoản thật, mở một hóa đơn, dùng DevTools → tab Network ghi lại **có request nào trả về PDF/ảnh logo không** (và endpoint là gì). Có → ghi endpoint vào adapter; không → chốt phương án B dưới đây.
**Phương án B (nếu GDT không phát logo):** hóa đơn BÁN RA thì **tenant tự tải logo lên** một lần (lưu R2, tham chiếu ở hồ sơ tenant) → bản thể hiện của ta có logo của chính họ. Hóa đơn MUA VÀO thì **không có logo** người bán — chấp nhận, và nói rõ trên bản in.

##### ✅ QUYẾT ĐỊNH CHỦ DỰ ÁN 2026-07-28 (vòng 3): chốt Phương án B — người dùng tự tải logo lên

> *"Thêm trường Logo vào trong Cài đặt thông tin doanh nghiệp (Menu Cài đặt chung), để người dùng tải nó lên. Lúc tạo hoá đơn (bán ra) thì lấy thông tin này để chèn vào hoá đơn."*

Không chờ probe GDT nữa — đi thẳng Phương án B. (Probe GDT vẫn nên làm khi rảnh: nếu GDT có phát logo thật thì đó là **cải tiến cho hóa đơn MUA VÀO**, vốn không có đường nào khác để có logo người bán.)

**Hiện trạng đã kiểm chứng (2026-07-28) — phần việc này lớn hơn "thêm một trường":**

- **Màn Cài đặt đã có:** `apps/web/src/features/settings/SettingsPage.tsx` (+ `DoiMatKhauCard.tsx`, `ThongTinSanPham.tsx`) — có chỗ để gắn.
- **Bảng `tenants` (`packages/db/src/schema/tenants.ts`) hiện chỉ có:** `id, ten, mst, trang_thai, goi_dich_vu, ghi_chu, ban_quyen, ngay_tao`. **Không có `logo`.** ⇒ cần **migration** (nhớ `GRANT` — xem mục bẫy GRANT ngày 28/07 phía trên, đã dính 2 lần).
- **`PATCH /me` (`apps/api/src/routes/me.ts:22-28`) chỉ cho `quan_tri` sửa `ten`/`ghi_chu`**, schema `strict` ⇒ phải mở rộng tường minh.
- **⚠️ Dự án CHƯA TỪNG có luồng tải file lên:** `grep "multipart/form-data\|formData()" apps/api/src` = **0 kết quả**. Đây là **đường upload đầu tiên** của hệ thống ⇒ mở một bề mặt tấn công mới, **bắt buộc `security-reviewer`**. Tối thiểu phải chốt: giới hạn dung lượng (đề xuất ≤ 500 KB); **danh sách trắng định dạng PNG/JPEG**, **KHÔNG nhận SVG** (SVG nhúng được script → XSS khi hiển thị); **xác thực magic bytes chứ không tin `Content-Type`/đuôi file**; chặn ảnh kích thước bất thường (decompression bomb); khóa object gắn `tenant_id` để không ghi đè chéo tenant.
- **⚠️ Logo phải nằm ở bucket NỘI BỘ (`vat-raw`), KHÔNG phải bucket công khai** — bản PDF nhúng ảnh vào file, nên logo không cần URL public. Đưa logo lên bucket công khai là mở rộng lộ diện vô ích.
- **⚠️ Thiếu nhiều hơn logo:** mẫu hóa đơn cần **địa chỉ, điện thoại, fax** của người bán. Với hóa đơn BÁN RA, người bán chính là tenant — mà `tenants` **cũng không có các cột này**. ⇒ Đơn vị này thực chất là **"hồ sơ doanh nghiệp đầy đủ để in hóa đơn"** (logo + địa chỉ + điện thoại + fax…), không phải chỉ một trường logo. Nên gom một lượt để tránh migration hai lần.

##### ✅ QUYẾT ĐỊNH CHỦ DỰ ÁN 2026-07-28 (vòng 3): tên miền công khai cho R2 = `docs.tourdao.vn`

Dùng **tên miền phụ `docs.tourdao.vn`** làm địa chỉ công khai của bucket chia sẻ (đúng khuyến nghị "custom domain, không dùng `r2.dev`" ở mục (3) trên).

- **Điều kiện tài liệu Cloudflare yêu cầu:** *"The domain being used must have been added as a zone in the same account as the R2 bucket."* — `tourdao.vn` đã nằm trên Cloudflare (xem mục AWS SES 2026-07-16), nên chỉ cần thêm bản ghi; Cloudflare tự tạo CNAME khi kết nối bucket. Trạng thái đi từ **Initializing → Active** sau vài phút.
- **Vì là custom domain nên bật được** WAF / Cache / Bot Management / Zero Trust Access / WAF Token Authentication — dự phòng nếu sau này muốn siết link.
- **⚠️ Cảnh báo trong tài liệu, phải làm:** nếu đã bật `r2.dev` để thử nghiệm thì **PHẢI tắt** — *"If you do not disable public access, your bucket will remain publicly available through your r2.dev subdomain"* (tắt tên miền chính mà quên `r2.dev` = vẫn lộ).
- **Đặt tên gợi ý cho rõ nghĩa:** dùng `docs.tourdao.vn` cho **bucket chia sẻ riêng** (vd `vat-chia-se`), tách hẳn khỏi `vat-raw`. URL cuối có dạng `https://docs.tourdao.vn/goi-hoa-don/2026-07/<token-ngẫu-nhiên>.zip`.

**(2) Định dạng bên trong ZIP: ✅ CHỐT = PDF.** Mục đích chủ dự án nêu: *"chỉ phục vụ cho mục đích lưu trữ nội bộ hoặc thống kê cơ bản"* ⇒ không cần đua độ đẹp với bản gốc của nhà cung cấp.
**CHƯA KIỂM CHỨNG (kỹ thuật, phải khảo sát trước khi code):** **chưa có thư viện sinh PDF nào được xác nhận chạy trên Cloudflare Workers** trong dự án này. Ba hướng cần đo: (a) thư viện JS thuần (vd `pdf-lib`) — cần kiểm font tiếng Việt có dấu (nhúng font Unicode, không dùng font chuẩn PDF); (b) dựng HTML rồi convert bằng **Cloudflare Browser Rendering** (Puppeteer) — đẹp nhất, nhưng là dịch vụ trả phí riêng, phải đo chi phí/throughput; (c) dựng PDF trong **Queue consumer** từng lô nhỏ để né trần CPU/wall-time. **Không chọn hướng nào trước khi có phép đo thật.**

**(3) R2 public — ✅ ĐÃ NGHIÊN CỨU (tài liệu chính thức Cloudflare, đọc 2026-07-28):**
- Nguồn: `https://developers.cloudflare.com/r2/buckets/public-buckets/` và `https://developers.cloudflare.com/r2/buckets/object-lifecycles/`.
- **Hai cách công khai:** (i) **Custom domain** (tên miền của mình, vd `hoadon.tourdao.vn`) — **BẮT BUỘC dùng cái này cho production**; (ii) **`r2.dev` subdomain** — tài liệu ghi rõ *"intended for non-production traffic"*, *"rate-limited and should only be used for development purposes"* ⇒ **KHÔNG dùng để chia sẻ khách hàng**. Chỉ custom domain mới bật được **WAF / Cache / Bot Management / Zero Trust Access / WAF Token Authentication**.
- **Điểm an toàn sẵn có:** *"public buckets do not let you list the bucket contents at the root"* ⇒ **không ai liệt kê được toàn bộ file**. Hệ quả: **an toàn hoàn toàn phụ thuộc vào khóa object đoán-không-ra** — đây là lý do quy tắc đặt tên dưới đây là **yêu cầu bảo mật, không phải thẩm mỹ**.
- **Quy tắc đặt tên đề xuất (khóa = bí mật, tách phần định danh khỏi phần đoán được):**
  `goi-hoa-don/<YYYY-MM>/<token-ngẫu-nhiên-≥128-bit-base32url>.zip`
  - Tiền tố `<YYYY-MM>` là **tháng phát hành** → khớp thẳng với lifecycle rule theo prefix, và cho phép dọn/thống kê theo tháng.
  - **TUYỆT ĐỐI KHÔNG** nhúng MST, tên doanh nghiệp, khoảng ngày, số hóa đơn hay `tenant_id` vào khóa — vì khóa **là** thứ duy nhất bảo vệ file; nhúng MST là mời người khác dò.
  - Tên file **hiển thị khi tải về** (thân thiện, có MST/kỳ) đặt riêng qua metadata `contentDisposition` lúc `put()` — **không** đặt vào khóa.
  - Ánh xạ khóa ↔ (tenant, kỳ, người tạo, `het_han_luc`) lưu ở bảng Postgres, có `tenant_id` + audit log.
- **Tự xóa sau 1 tháng — ✅ có sẵn, không cần viết cron:** **Object Lifecycle Rules**, khai theo prefix: `npx wrangler r2 bucket lifecycle add <bucket> …` với `Expiration: { Days: 30 }`, hoặc `lifecycle set` từ file JSON. **Lưu ý vận hành (trích tài liệu):** *"Objects will typically be removed from a bucket within 24 hours of the `x-amz-expiration` value"* ⇒ **xóa trong vòng ~24h sau mốc, không đúng phút** — UI phải nói "khoảng 30 ngày", đừng hứa mốc chính xác. Giới hạn 1000 rule/bucket ⇒ **dùng MỘT rule theo prefix chung**, không tạo rule mỗi file.
- **Khuyến nghị:** **bucket RIÊNG** (vd `vat-chia-se`) cho file công khai — **không** đặt chung `vat-raw` (đang chứa dữ liệu nội bộ). Bật public **chỉ** trên bucket mới. Đây là hàng rào chống lỗi cấu hình vô ý làm lộ toàn bộ kho.

**(4) Trường dữ liệu — ✅ CHỐT: chỉ làm cho hóa đơn BÁN RA; trường rỗng thì để trống.** Lấy tối đa các trường người mua có trong dữ liệu đã đồng bộ; **không bịa, không suy diễn**.
**CHƯA KIỂM CHỨNG:** bảng `hoa_don` chỉ có cột người mua là `nmmst` + `nmten` (`packages/db/src/schema/hoaDon.ts:30-31`); các trường còn lại của mẫu (**địa chỉ người mua, họ tên người nhận, hình thức thanh toán, đơn vị tiền tệ, MCCQT, ký hiệu mẫu số**) nếu có thì nằm trong `raw_json`. **Việc đầu tiên khi mở đơn vị này: rà `raw_json` thật trên prod, lập bảng "trường mẫu ↔ khóa GDT ↔ tỷ lệ có dữ liệu"** — rồi mới thiết kế template.

**(5) Cảnh báo rủi ro link công khai — ✅ CHỐT: phải có.** Hiển thị trước khi tạo link (checkbox xác nhận, không phải dòng chữ mờ ở góc): *"Bất kỳ ai có link đều xem và tải được file này mà không cần đăng nhập. File chứa thông tin doanh nghiệp và đối tác. Chỉ chia sẻ với người bạn tin tưởng."* Kèm nút **thu hồi ngay** (xóa object trước hạn 30 ngày) và ghi audit log mỗi lần phát hành/thu hồi.

**(6) Tuyên bố mục tiêu file — ✅ CHỐT: phải in TRÊN chính bản PDF (không chỉ trên web).** Nội dung: *"Tài liệu này hỗ trợ tổng hợp và đối soát thông tin. **Không thay thế hóa đơn điện tử gốc (bản XML có chữ ký số)** do người bán phát hành."* Đặt ở chân mỗi trang để không mất khi tách lẻ file.
- **Rủi ro nếu bỏ qua / làm ẩu:**
  - **PHÁP LÝ — rủi ro cao nhất:** đặt file hóa đơn ở chế độ **công khai không cần đăng nhập** nghĩa là **bất kỳ ai có link đều đọc được dữ liệu doanh nghiệp + đối tác** (tên, MST, địa chỉ, mặt hàng, giá trị giao dịch). Đây là **dữ liệu cá nhân/kinh doanh** thuộc phạm vi **NĐ 13/2023/NĐ-CP**. Link R2 phải **không đoán được** (khóa ngẫu nhiên đủ dài, không nhúng MST/kỳ vào tên file), và nên có cách **thu hồi sớm** trước 1 tháng. Cần `security-reviewer` bắt buộc.
  - **NHẦM LẪN PHÁP LÝ về giá trị chứng từ:** thứ ta tạo ra là **"bản thể hiện"** (đúng như chữ in trên mẫu), **KHÔNG phải hóa đơn điện tử gốc có giá trị pháp lý** (gốc là XML có chữ ký số). Giao diện và bản in **phải nói rõ điều này**, nếu không người dùng có thể dùng sai mục đích khi làm việc với cơ quan thuế.
  - **Cách ly tenant:** file công khai nằm ngoài hàng rào RLS/JWT — mọi kiểm tra quyền phải làm **tại thời điểm tạo**, vì sau đó không còn cửa nào chặn.
  - **Dung lượng/chi phí:** hàng nghìn hóa đơn/tenant/tháng × 100.000 tenant ⇒ cần ước lượng chi phí R2 trước khi mở rộng.
- **Đề xuất hướng xử lý (khung, chưa phải thiết kế chốt):**
  1. **Registry-first** (bắt buộc theo `.claude/rules/ui.md` + `docs/design/CHUAN-giao-dien-va-anh-xa-du-lieu.md`): khai báo bộ trường của "mẫu hóa đơn" trong Registry miền hóa đơn — một nguồn sự thật, không hardcode nhãn trong template.
  2. **Renderer** mở rộng từ `invoiceDoc.ts`, gom qua `zipStream.ts` → 1 file ZIP; job chạy **nền qua Queue** (không dựng đồng bộ trong request) vì khối lượng có thể lớn.
  3. **Khâu kiểm tra (yêu cầu 3) — cụ thể hóa thành cổng tự động, không phải "xem bằng mắt":** trước khi phát hành ZIP, chạy **validator** trên từng hóa đơn — (a) đủ trường bắt buộc theo mẫu; (b) **đối chiếu số học**: `Σ thành tiền dòng hàng` khớp `tổng trước thuế`, `tiền thuế` khớp `thuế suất × tiền hàng`, `tổng sau thuế` khớp (tái dùng logic đã sửa ở U35b `columns.ts`); (c) hóa đơn **chưa đồng bộ dòng hàng** thì **từ chối xuất** kèm thông báo rõ (liên quan mục `[2026-07-27] race export × sync` phía trên — đừng lặp lại lỗi ô trống câm). Có lỗi ⇒ báo cáo kèm danh sách hóa đơn hỏng, **không phát hành file im lặng**.
  4. **Lưu trữ:** khóa object ngẫu nhiên; bảng theo dõi (`tenant_id`, khóa, thời điểm tạo, `het_han_luc`, người tạo) + audit log hành động "phát hành link công khai"; lifecycle 30 ngày + nút **thu hồi ngay**.
- **Phụ thuộc/liên quan:** `invoiceDoc.ts` chưa hưởng sửa 3 trường thuế của U35b (xem mục `[2026-07-27]` phía trên) — **phải xử lý trước hoặc cùng lúc**, nếu không bản thể hiện sẽ in `0.08` thay vì `8%` và có thể trống Tiền thuế. Cũng liên quan mục hạn mức tải xuống miễn phí (link công khai là một dạng "lượt tải" cần đếm).
- **Nguồn phát hiện:** Yêu cầu trực tiếp của chủ dự án, phiên Cowork 2026-07-28; bằng chứng hạ tầng/mẫu do phiên này tự kiểm chứng (trích `hoa_don_mau.pdf` trang 1, `wrangler.jsonc:42-44`, `ls packages/export/src/`).

---

## [2026-07-28] `FindingKind` chưa phân biệt điều chỉnh với thay thế (đẩy khỏi U36)

- **Phát hiện khi:** thực thi U36 (`docs/plans/U36-plan.md`), sau khi biên bản
  `docs/BANG-CHUNG-ma-trang-thai-hoa-don-2026-07-28.md` §8.1 mục 4 nêu việc này.
- **Hiện trạng (đã kiểm chứng, đọc từ mã):** `packages/reconcile/src/types.ts` khai
  `FindingKind = "lech_thue" | "thieu_so_dau_ra" | "huy" | "thay_the"`, và
  `packages/reconcile/src/statusCodes.ts` chỉ có hai nhóm `huy` / `thayThe`. Từ U36.1
  `thayThe.tthai = [4]`, nên hóa đơn **bị điều chỉnh** (`tthai=5`) và hóa đơn **điều chỉnh**
  (`tthai=3`) hiện **không sinh finding nào** — màn Đối chiếu im lặng với cả một nhánh
  nghiệp vụ đã có bằng chứng (3 cặp `3↔5` trong dữ liệu thật).
- **Vì sao chưa làm trong U36:** thêm nhánh kéo theo chuỗi `StatusCodeMap` → `classifyStatus`
  → `ReconcileSummary` → route → `apps/web/src/types/api.ts` → `ReconcilePage`; rộng hơn hẳn
  phạm vi "trạng thái trong tổng hợp và kết xuất". Màn Đối chiếu lại đang ẩn sau cờ
  `SHOW_RECONCILE=false` nên chưa cấp bách.
- **Lưu ý khi làm:** `huy` phải TIẾP TỤC rỗng (mã hủy pháp lý chưa từng xuất hiện trong
  33.929 hóa đơn — biên bản §5.1). Đừng nhân tiện "điền cho đủ".

## [2026-07-28] Số học chuỗi thập phân đang có HAI nơi (drift, phát hiện ở U36.3)

- **Hiện trạng:** `packages/export/src/columns.ts` có `tachThapPhan`/`congThapPhan`/
  `tinhTienThue`/`nhanTram` (BigInt, ra đời ở U7/U35b). U36.3 cần phép TRỪ tiền cho
  `apps/web`, nhưng `apps/web` **không phụ thuộc `@vat/export`**, nên helper mới
  (`truTienChuoi`) được đặt ở `packages/domain/src/tienChuoi.ts`.
- **Hệ quả:** hai gói cùng làm số học chuỗi thập phân bằng BigInt — một nguồn sự thật rưỡi.
  Sửa quy tắc làm tròn/định dạng ở một nơi sẽ không lan sang nơi kia.
- **Đề xuất:** gom bộ số học về `@vat/domain` (gói lá, mọi gói khác đã phụ thuộc), để
  `@vat/export` re-export cho tương thích ngược. Việc cơ học, có test dày ở cả hai bên nên
  rủi ro thấp — nhưng nó đụng `columns.ts` (vùng vừa qua QA của U36.2) nên cố ý hoãn.
- **Ghi lại thay vì âm thầm chọn một bên** — `CLAUDE.md` §8 "khi phát hiện drift, ghi lại".

## [2026-07-28] `kiem-quyen-bang.mjs` báo "THIẾU quyền" sai — và `audit_log` cấp thừa thật

Phát hiện khi hậu kiểm migration 0018 trước lúc deploy U36.

**(a) Báo động giả — đừng chạy câu vá nó gợi ý.** Script kết luận 3 bảng
`bo_dem_phien_ban` · `dong_bo_that_bai` · `lich_su_thay_doi_hoa_don` "⚠️ THIẾU"
vì thiếu `DELETE`, rồi in sẵn `GRANT DELETE … TO vat_app`. Nhưng:

- Migration `0018_u35_grant_bang_thieu.sql` **cố ý** chỉ cấp `SELECT, INSERT, UPDATE`.
- `scripts/kiem-quyen-bang.mjs:83` ghi rõ: bảng không nằm trong bảng tra thì **mặc định**
  kỳ vọng đủ `SELECT/INSERT/UPDATE/DELETE`. Đó là giả định mặc định, không phải bằng chứng.
- Mã ứng dụng **không có lệnh DELETE nào** trên cả ba bảng (đã grep `packages/*/src`,
  `apps/*/src`).

⇒ Chạy câu vá đó là **cấp quyền thừa**, ngược nguyên tắc đặc quyền tối thiểu. Việc cần làm
là bổ sung ba bảng này vào bảng tra của script với tập quyền ĐÚNG (`SIU`), để lần sau nó
không dụ người trực cấp thừa.

**(b) Cấp thừa THẬT, cần rà:** `audit_log` hiện cho `vat_app` cả `UPDATE` và `DELETE`
(di sản `app-role.sql` chạy `GRANT … ON ALL TABLES` một lần). `.claude/rules/security.md`
quy định *"Audit log không được ghi đè, chỉ append"* — quyền hiện tại **mâu thuẫn với luật**.
Chưa thu hồi ngay vì cần xác nhận không có đường ghi hợp lệ nào đang dùng tới, và việc này
lạc phạm vi U36.

## [2026-07-28] U38 — Bản thể hiện hóa đơn xem-bằng-mắt, dựng TỪ kho XML gốc đã tải

- **Trạng thái:** Đề xuất — **và đã CO LẠI RẤT NHIỀU sau probe R-b (2026-07-28)**. Ban đầu tưởng
  phải dựng bản thể hiện từ đầu; probe thật cho thấy **GDT kèm sẵn `invoice.html` trong ZIP tải
  về** (U37 §4.7) ⇒ "xem bằng mắt" đã có, miễn phí, không phải dựng gì. **U38 chỉ còn lý do tồn
  tại nếu người dùng cần PDF để IN HÀNG LOẠT** — và cả khi đó cũng là bài toán "HTML → PDF",
  không phải dựng template từ dữ liệu. **Chỉ làm sau khi U37 chạy thật** và có nhu cầu thật.
- **Bối cảnh:** U37 giao ZIP gồm `invoice.xml` (bản gốc có chữ ký số) **+ `invoice.html`** (bản
  thể hiện của chính GDT) cho mỗi hóa đơn. Nếu U38 làm thì dựng từ kho đã tải, **không phải gọi
  GDT thêm lần nào** (kho bất biến, U37 đã lưu ở `vat-raw`).
- **Ba việc đo còn nợ (chuyển nguyên từ U37 §5):** (R2) thư viện sinh PDF chạy được trên
  Workers — `pdf-lib` thuần JS phải **nhúng font Unicode cho tiếng Việt có dấu**, hoặc
  Cloudflare Browser Rendering (trả phí riêng), hoặc dựng theo lô trong Queue consumer;
  (R3) trần CPU/wall-time/RAM khi dựng hàng trăm–hàng nghìn PDF; (R4) chi phí R2 ở quy mô mục tiêu.
  **Không chọn hướng nào trước khi có phép đo thật.**
- **Hai thứ tưởng phải viết nhưng KHÔNG cần** (đo thật `raw_json` production 2026-07-28,
  `node scripts/do-hsgoc-u37.mjs`, U37 §4.6): GDT trả sẵn **`tgtttbchu`** (tổng tiền thanh toán
  **bằng chữ**) và **`qrcode`** ⇒ không cần bộ đọc số thành chữ tiếng Việt, không cần bộ sinh QR.
- **Mẫu trình bày đích:** **chính `invoice.html` mà GDT phát kèm** (U37 §4.7) — không phải dựng
  lại. Nếu cần bản dựng tay để tham chiếu thì dùng khối "Xem hóa đơn" trong
  `docs/doi_chieu_data/Hóa Đơn Điện Tử.html`. **Không** bám `hoa_don_mau.pdf` (bản kết xuất của
  Viettel vinvoice, có trường của nhà cung cấp mà ta không có — U37 §4.1).
- **⚠️ Nếu HTML → PDF:** `invoice.html` phụ thuộc `details.js` (jQuery 1.8.2) + 2 ảnh JPEG theo
  **tên phẳng tương đối**, không nhúng base64 ⇒ bộ chuyển phải nạp được tài nguyên kèm theo.
- **⚠️ Hai mức độ đầy đủ dữ liệu:** các khóa `raw_json` như `htttoan`, `dvtte`, `tgia`, `nbfax`,
  `nmstkhoan` **chỉ có ở hóa đơn `purchase/normal`** (322/33.945); hóa đơn `sco` (33.623) nghèo
  trường hơn. Template phải xử lý được cả hai, theo QĐ-3 "trường rỗng thì để trống, không bịa".
- **Nợ kéo theo:** nếu U38 muốn in logo doanh nghiệp thì mới cần đường **tải file lên đầu tiên**
  của hệ thống — spec bảo mật đã soạn sẵn ở U37 §6.3 (≤500 KB, whitelist PNG/JPEG, **cấm SVG**,
  xác thực magic bytes, khóa gắn `tenant_id`, bucket nội bộ). Kèm `security-reviewer` bắt buộc.
- **Mức ưu tiên đề xuất:** Trung bình — phụ thuộc phản hồi thật sau U37.
- **Nguồn phát hiện:** Phiên lập kế hoạch U37, 2026-07-28.

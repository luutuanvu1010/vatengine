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
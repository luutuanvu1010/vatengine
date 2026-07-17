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

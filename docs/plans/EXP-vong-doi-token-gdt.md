# Kế hoạch MỞ RỘNG — Nối vòng đời token GDT đầu-cuối

> **Trạng thái: NGHIÊN CỨU — PHẢN BIỆN — CHỜ CHỐT.** Đây là kế hoạch mở rộng **ngoài lộ trình U0–U12** (không phải đơn vị vòng lặp đã đánh số). **KHÔNG hiện thực** cho tới khi chủ dự án chốt. Ngày ghi: 2026-07-14.
>
> Nguồn phát hiện: rà soát trước deploy (2026-07-14). Quyết định chủ dự án cùng ngày: *"ghi vào 1 kế hoạch mở rộng riêng để nghiên cứu – phản biện – chốt sau"*.

## 1. Vấn đề (bằng chứng, không suy đoán)

U12 đã dựng và test **primitive mã hóa token** nhưng **chưa nối vào luồng chạy thật**. Ba mảnh rời:

- **Primitive (XONG, có test):** `sealSecret(plaintext, kekB64)` / `openSecret(sealed, kekB64)` — [packages/crypto/src/envelope.ts:41](../../packages/crypto/src/envelope.ts). Định dạng tự mô tả `v1$aesgcm$…`. 14 test crypto xanh.
- **Seam vault (XONG, có test):** `storeToken(db, tenantId, taikhoanId, token, tokenHetHan, kekB64)` và `readToken(db, tenantId, taikhoanId, kekB64)` — [packages/db/src/tokenVault.ts:31](../../packages/db/src/tokenVault.ts). Tenant-scoped qua `withTenant`.
- **Chưa nối (KHOẢNG TRỐNG):**
  - **Không có đường GHI token.** `apps/api/src/routes/auth.ts` chỉ login **nội bộ** (email+mật khẩu → JWT SaaS). Không có route: captcha (`getCaptcha`, U1) + `authenticate` (U1) → `storeToken(...)`. Vì thế **không token tenant nào được lưu**.
  - **Đường ĐỌC không giải mã.** [apps/sync-worker/src/runJob.ts:27](../../apps/sync-worker/src/runJob.ts) đọc `account.tokenHienTai` **dùng thẳng làm token** — không gọi `readToken`.
  - **Mâu thuẫn schema ↔ consumer.** [taiKhoanThue.ts:20](../../packages/db/src/schema/taiKhoanThue.ts) khẳng định cột lưu chuỗi sealed `v1$aesgcm$…`; consumer coi là token thô. Nối `storeToken` mà quên đổi `runJob→readToken` ⇒ sync gửi `v1$aesgcm$…` cho GDT ⇒ hỏng.

**Hệ quả:** hệ thống U0–U12 chạy được phần *nội bộ* (đăng nhập người dùng, tra cứu/đối chiếu/kết xuất dữ liệu ĐÃ có trong DB) nhưng **không tự kéo được hóa đơn mới từ GDT cho tenant nào** vì không có token được lưu. [apps/sync-worker/src/recorder.ts:7](../../apps/sync-worker/src/recorder.ts) tự ghi nhận đây là seam CHỜ nối.

## 2. Câu hỏi cần nghiên cứu — phản biện trước khi chốt

Đây là các **điểm mơ hồ ranh giới pháp lý + kỹ thuật**, đúng loại Hiến pháp bắt "DỪNG và hỏi":

1. **Captcha do người dùng nhập — luồng UX nào?** Hiến pháp cấm phá captcha máy. Đăng nhập thuế cần người dùng nhập captcha → cần luồng đồng bộ (người dùng đang online) hay bán-đồng bộ (nhập captcha → server hoàn tất trong vài giây)? Token GDT vòng đời ngắn ⇒ hết hạn thì **phải người dùng đăng nhập lại**, KHÔNG tự động (đã chốt ở U9: hết hạn → `can_dang_nhap_lai`, không tự login).
2. **KEK quản lý thế nào?** 1 KEK toàn hệ thống + version-tag (`v1`) như U12 giả định? Hay KEK theo tenant? Xoay vòng KEK ra sao? Nạp KEK từ `wrangler secret put TOKEN_KEK` — **secret này CHƯA khai báo ở đâu**.
3. **Ai giữ credential đăng nhập thuế?** Hiến pháp + `security.md`: **KHÔNG lưu mật khẩu thuế thô**. Vậy mỗi lần token hết hạn, người dùng nhập lại username+mật khẩu+captcha? Không có đường "tự đăng nhập lại".
4. **Ủy quyền tenant (NĐ 13/2023):** mỗi tenant phải ủy quyền rõ ràng trước khi lưu/ dùng token. Luồng consent đặt ở đâu?

## 3. Phác thảo hiện thực (SAU KHI chốt — chưa làm)

- Route `POST /tax-accounts/:id/login` (trong `withTenant`, RBAC phù hợp): nhận captcha người dùng đã nhập → `authenticate()` (gdt-client) → `storeToken(db, tenantId, id, token, hetHan, env.TOKEN_KEK)`.
- Đổi [runJob.ts:27](../../apps/sync-worker/src/runJob.ts): `account.tokenHienTai` → `readToken(db, tenantId, id, env.TOKEN_KEK)` (giải mã), giữ nhánh 401/hết hạn hiện có.
- Khai báo secret `TOKEN_KEK` ở `.dev.vars.example` (api + sync-worker) + `wrangler secret put TOKEN_KEK`.
- **Contract test kiểm chứng** trước khi chốt: probe thật `authenticate` trả token dạng gì, độ dài, TTL (`token_het_han`) — ghi lại kết quả, không giả định.

## 4. Chốt chặn tạm thời (giảm rủi ro NGAY, không đợi chốt lớn)

Để tránh **bug ngầm** khi ai đó nối một nửa: cân nhắc thêm một **cổng guard** hoặc sửa comment để `runJob` và schema không hiểu nhầm nhau (ví dụ: assert `tokenHienTai` bắt đầu bằng `v1$` trước khi coi là sealed, hoặc ngược lại làm rõ cột hiện GIỮ token thô cho tới khi seam được nối). Đây là thay đổi cơ khí nhỏ, tách khỏi quyết định lớn ở mục 2.

## 5. KHÔNG thuộc phạm vi kế hoạch này

Không viết code hiện thực; không chốt phương án KEK/consent; không tự thêm route. Kế hoạch chỉ để **nghiên cứu – phản biện – chốt** ở tầng chủ dự án.

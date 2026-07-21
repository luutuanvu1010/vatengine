# ADR-0006 — Chấp nhận rủi ro dò danh bạ khách hàng (MST/email) qua `POST /dang-ky`

- **Trạng thái:** ✅ Rủi ro được CHẤP NHẬN có chủ đích (Accepted risk, KHÔNG PHẢI đã khắc phục) — 2026-07-20. Đơn vị: U17b (`docs/plans/U17-plan.md` §3.2).
- **Người quyết định:** Chủ dự án.
- **Liên quan:** `apps/api/src/routes/dangKy.ts`; đối chiếu `docs/BACKLOG-y-tuong-va-de-xuat.md` mục cùng ngày (audit trail lượt bị từ chối, limiter fail-open).

## Bối cảnh

`U17-plan.md` §3.2 yêu cầu: phản hồi 409 khi MST hoặc email trùng phải **không phân biệt được** đâu là trường trùng, để `/dang-ky` không trở thành oracle tra cứu "MST/email này đã có khách hàng chưa". Hiện thực đúng yêu cầu này: `isUniqueViolation()` (`apps/api/src/routes/dangKy.ts` dòng ~40-46) chỉ nhận diện SQLSTATE Postgres `23505`, không đọc tên ràng buộc UNIQUE nào bị vi phạm; nhánh xử lý (dòng ~161-168) trả cùng một `{error:"da_ton_tai"}` 409 bất kể `tenants_mst_unique` hay `nguoi_dung_email_unique` là bên vỡ.

## Rủi ro (xác nhận qua đọc mã, không suy đoán)

Yêu cầu trên đạt đúng nhưng **không đóng được** bài toán dò danh bạ tổng thể, vì kẻ tấn công kiểm soát **cả hai trường** trong cùng một request:

- Gửi một **email chưa dùng** + một **MST mục tiêu**: MST đó đã là khách hàng ⇒ 409; MST đó chưa từng đăng ký ⇒ 201 (và tạo thêm một tenant `cho_duyet` rác làm tác dụng phụ).
- Đảo vai trò hai trường (MST chưa dùng + email mục tiêu) dò được sự tồn tại của một địa chỉ email theo cách tương tự.

Đây là hệ quả **cố hữu** của việc dùng phát hiện vi phạm UNIQUE làm cơ chế chống trùng, không phải một lỗi hiện thực có thể vá bằng cách gộp nhãn lỗi. Không có kiểm soát ở tầng row-level (RLS) nào che được va chạm ở tầng chỉ mục UNIQUE — chỉ mục đó buộc phải nhìn xuyên tenant để bảo đảm tính duy nhất toàn cục.

## Quyết định

Chủ dự án **chấp nhận rủi ro này tường minh** (2026-07-20). Lý do: mã số thuế (MST) của doanh nghiệp Việt Nam vốn là thông tin công khai — tra cứu tự do trên chính cổng của cơ quan thuế — nên việc lộ ra "MST này đang dùng VATEngine" là mức độ lộ thấp. Lớp giảm nhẹ còn lại là rate-limiter theo IP (`SignupLimiter`, mặc định 5 lượt/IP/giờ — QĐ-2, `U17-plan.md`), giới hạn quy mô dò quét chứ không loại bỏ khả năng dò.

## KHÔNG được hiểu nhầm

Gộp hai nhánh lỗi 409 thành một mã lỗi duy nhất **giải quyết đúng** yêu cầu hẹp "409 không được phân biệt trường trùng" — nhưng **KHÔNG giải quyết** bài toán dò danh bạ tổng thể mô tả ở trên. Đây là **rủi ro được chấp nhận**, không phải **rủi ro đã khắc phục**. Một phiên đọc lại sau này không được kết luận mục này "đã đóng" chỉ vì thấy 409 đã gộp nhánh đúng spec — ADR này tồn tại chính để ngăn kết luận đó.

## Đánh đổi đã chấp nhận (consequences)

- Kẻ tấn công dò được tập MST khách hàng hiện có của VATEngine (chỉ biết "có" hay "không", không kèm thông tin nào khác), dưới giới hạn 5 lượt/IP/giờ.
- Mỗi lượt dò bằng "MST chưa dùng" tạo một tenant `cho_duyet` rác — dọn dẹp thuộc phạm vi duyệt/từ chối của U18.
- Nếu sau này mức lộ này bị đánh giá lại nghiêm trọng hơn (quy định đổi khiến MST không còn là thông tin công khai, hoặc quan sát được lạm dụng thật), giải pháp đúng là đổi **cơ chế** kiểm trùng — ví dụ phản hồi đồng nhất bất kể kết quả kiểm tồn tại (constant-response pattern) kết hợp xác nhận không đồng bộ qua email, không phải tinh chỉnh thêm nhánh lỗi hiện tại.

## Bằng chứng

- `apps/api/src/routes/dangKy.ts` dòng ~40-46 (`isUniqueViolation`, chỉ khớp SQLSTATE), dòng ~161-168 (409 gộp nhánh, không phân biệt ràng buộc).
- Phát hiện qua hai lượt review chéo độc lập trên nhánh U17b, phiên 2026-07-20; xác nhận lại bằng đọc mã trực tiếp trước khi ghi ADR này (nguyên tắc bằng chứng, `CLAUDE.md`).

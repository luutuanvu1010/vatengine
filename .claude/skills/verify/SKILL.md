---
name: verify
description: Tự kiểm chứng một đơn vị đang làm — chạy make lint + make test (+ test-contract nếu đụng adapter GDT), đối chiếu checklist Definition of Done, báo cáo pass/fail cụ thể. Không sửa code.
disable-model-invocation: true
---

Kiểm chứng trạng thái hiện tại (đối tượng: **$ARGUMENTS** nếu có, mặc định toàn bộ thay đổi chưa commit).

Đây là cổng "tự kiểm chứng" gọi được bất cứ lúc nào, độc lập với Stop hook. **Không sửa code** — chỉ chạy kiểm tra và báo cáo; nếu đỏ, chỉ ra chỗ hỏng để phiên thực thi tự sửa.

1. **Xác định phạm vi thay đổi:** `git status --porcelain` + `git diff --name-only`. Lưu ý có đụng `packages/gdt-client` (adapter GDT) không.
2. **Chạy kiểm tra:**
   - `make lint` — Biome + `tsc --noEmit`.
   - `make test` — Vitest (unit + integration).
   - Nếu có thay đổi trong `packages/gdt-client`: `make test-contract` (best-effort — có thể fail do không có mạng/credential; ghi rõ, không coi là lỗi của diff).
3. **Đối chiếu checklist Definition of Done** (Hiến pháp mục "Definition of Done"):
   - [ ] Có test tự động phủ đúng tiêu chí nghiệm thu và toàn bộ xanh.
   - [ ] `make lint` sạch.
   - [ ] Không giảm coverage tầng nghiệp vụ dưới 80%.
   - [ ] Không lộ bí mật trong code/log (không mật khẩu thô, token, key).
   - [ ] Mọi truy vấn dữ liệu gắn `tenant_id`; khóa tự nhiên đủ trường.
   - [ ] Tài liệu liên quan đã cập nhật nếu hành vi đổi.
   - [ ] Commit nhỏ, rõ, không trộn nhiều đơn vị.
4. **Báo cáo:** PASS/FAIL tổng, kèm output lỗi rút gọn (dòng/file) cho từng mục fail. Không tự tạo vấn đề giả.

Nếu PASS toàn bộ và đơn vị đã sẵn sàng đóng: gợi ý `/qa-unit $ARGUMENTS` để review chéo độc lập trước khi merge.

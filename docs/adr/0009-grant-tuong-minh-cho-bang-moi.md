# ADR-0009 — Mọi migration TẠO BẢNG mới bắt buộc GRANT tường minh cho `vat_app` (lỗi đã dính 2 lần: 0008, 0017)

- **Trạng thái:** ✅ CHỐT 2026-07-28 (vá nóng + codify migration `0018` cùng phiên). Đơn vị:
  U35 (`docs/plans/U35-tien-do.md`), phát hiện trong phiên vận hành
  `docs/plans/HANDOFF-phien-2026-07-28-grant-thieu.md`.
- **Người quyết định:** Claude (Code), ghi lại để ép thi hành cho mọi phiên sau — thuộc loại
  quy trình vận hành nội bộ, không đổi kiến trúc/chi phí/rủi ro pháp lý nên không cần chủ dự
  án duyệt riêng (đã đồng ý áp migration `0018` trong phiên).
- **Liên quan:** `packages/db/provisioning/app-role.sql` (nguồn của toàn bộ vấn đề);
  migration `0007` dòng 72-75 (cảnh báo bằng chữ, đã có sẵn, hai migration sau vẫn quên);
  `0018_u35_grant_bang_thieu.sql` (vá lần này); `docs/plans/HANDOFF-phien-2026-07-28-grant-thieu.md`;
  `docs/BACKLOG-y-tuong-va-de-xuat.md` mục `[2026-07-28]` (đề xuất cổng CI tự động, còn hoãn).

## Bối cảnh — lỗi đã dính hai lần, cách nhau 8 ngày

`packages/db/provisioning/app-role.sql:28` chạy `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL
TABLES IN SCHEMA public TO vat_app` đúng **MỘT LẦN**, lúc provision role (2026-07-14). Repo
**không** dùng `ALTER DEFAULT PRIVILEGES` (xác nhận `grep -c "ALTER DEFAULT PRIVILEGES"
packages/db/migrations/*.sql` = 0). Hệ quả: **bất kỳ bảng nào được tạo bởi một migration sau
mốc đó không thừa hưởng quyền nào** — vai trò `vat_app` (role Hyperdrive production, không
phải superuser) sẽ gặp `permission denied` ngay khi code chạm bảng đó, và lỗi này **chỉ lộ ra
sau khi deploy production**, vì mọi test tích hợp chạy trên PGlite dưới role owner (không có
`vat_app`) hoặc tự cấp quyền rộng `ON ALL TABLES` cho role kiểm thử ở bước setup — che mất
đúng lớp lỗi này.

Migration `0007` (2026-07-19) đã ghi cảnh báo này thành chữ, dài và rõ, ngay cạnh câu GRANT
đúng của chính nó. Nhưng:

- Migration `0008` (`dong_bo_that_bai`, 2026-07-20) tạo bảng mà **không** GRANT.
- Migration `0017` (`bo_dem_phien_ban`, `lich_su_thay_doi_hoa_don` — U35, 2026-07-27) tạo
  bảng mà **cũng không** GRANT.

Hậu quả thật, đo được trên production (§2 của handoff dẫn ở trên): 39 phiên đồng bộ `failed`
trong 24 giờ, và **8 ngày** sổ dead-letter (`dong_bo_that_bai`) ghi nhận bằng KHÔNG một bản
ghi nào dù có job chết thật — vì chính bảng dùng để ghi lỗi cũng thiếu quyền ghi.

## Vì sao cảnh báo bằng chữ không đủ (đã CHỨNG MINH, không suy đoán)

Một dòng comment cảnh báo đúng, chi tiết, nằm ngay cạnh ví dụ đúng — vẫn bị bỏ qua **hai
lần** bởi hai đơn vị công việc khác nhau, cách nhau hơn một tuần. Cảnh báo dạng văn bản đòi
hỏi người viết migration sau phải **nhớ tự tra cứu** nó tại đúng thời điểm cần; không có gì
buộc việc đó xảy ra. Đây là bằng chứng trực tiếp rằng lớp phòng thủ hiện tại (comment) không
đủ — không phải một giả định.

## Quyết định

**Từ nay, mọi migration Drizzle tạo bảng nghiệp vụ mới (không phải bảng chỉ-đọc kiểu
`goi_dich_vu`/`cau_hinh_he_thong` vốn cố ý mở `GRANT SELECT ... TO PUBLIC`) bắt buộc kèm một
khối GRANT tường minh cho `vat_app`, viết ngay trong CÙNG migration tạo bảng đó — không tách
sang migration sau, không dựa vào "sẽ nhớ vá sau".**

Mẫu bắt buộc (khớp `0018`, kế thừa idiom guard đã có ở `0009`/`0011`):

```sql
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'vat_app') THEN
    GRANT SELECT, INSERT, UPDATE ON "ten_bang_moi" TO vat_app;
  ELSE
    RAISE WARNING '<mã đơn vị>: role "vat_app" không tồn tại — BỎ QUA GRANT cho ten_bang_moi. ...';
  END IF;
END $$;--> statement-breakpoint
```

- **Phạm vi quyền mặc định: SELECT, INSERT, UPDATE — KHÔNG DELETE**, trừ khi đơn vị công
  việc chứng minh cụ thể cần xoá hàng qua đường ứng dụng (least-privilege — khớp đúng những
  gì `0018` đã vá, không nới rộng "cho chắc").
- **Guard theo tên role, không hard-fail nếu vắng mặt** — bắt buộc, để migration vẫn chạy
  được trên PGlite (dev/CI, không có role `vat_app`) mà không cần giả lập role đó chỉ để
  qua cổng.
- Áp dụng cho **mọi bảng nghiệp vụ mới**, không chỉ bảng do sync/queue ghi — cùng bẫy áp
  dụng cho bất kỳ đường ghi/đọc nào từ Worker.

## Vì sao không chọn phương án khác

- **`ALTER DEFAULT PRIVILEGES`** (tự động cấp quyền cho bảng tạo sau) bị loại: thay đổi hành
  vi TOÀN CỤC của role tạo bảng, khó soát từng bảng được cấp gì, và không tương thích với
  các bảng cố ý ĐÓNG (vd `quan_tri_he_thong`, chỉ vào qua hàm SECURITY DEFINER — một
  `ALTER DEFAULT PRIVILEGES` rộng sẽ vô tình mở đúng những bảng cần đóng chặt nhất).
- **Cổng CI tự động đối chiếu bảng quyền** (test dưới role non-superuser thật, hoặc so khớp
  `pg_class` với danh sách "quyền theo thiết kế" — đã phác thảo trong
  `scripts/kiem-quyen-bang.mjs`) là lớp phòng thủ TỐT HƠN vì máy ép thay vì người nhớ — chủ
  dự án đã được đề xuất, **chủ động hoãn** (ghi ở `docs/BACKLOG-y-tuong-va-de-xuat.md`, mục
  `[2026-07-28]`). Quyết định này (ADR-0009) là lớp phòng thủ **tối thiểu, làm ngay được**
  trong lúc chờ; không thay thế đề xuất cổng CI, chỉ giảm khả năng lặp lỗi trong lúc đó.

## Đánh đổi đã chấp nhận (consequences)

- Vẫn phụ thuộc con người nhớ áp mẫu này — chỉ giảm khả năng quên (mẫu ngắn, dễ chép, đã có
  3 ví dụ thật trong repo: `0009`, `0011`, `0018`) chứ không loại bỏ hoàn toàn như một cổng
  máy-kiểm sẽ làm. Nếu lỗi này dính lần THỨ BA, đó là tín hiệu đủ mạnh để ngừng hoãn cổng CI.
- Không hồi tố: các bảng cũ hơn `0007` (trước khi cảnh báo tồn tại) không được rà lại trong
  quyết định này — chúng đã được `app-role.sql:28` cấp quyền lúc provision (mọi bảng tồn tại
  TRƯỚC mốc đó đều có quyền), nên không thuộc diện rủi ro này.

## Bằng chứng

- Vá nóng + hậu kiểm `has_table_privilege` trên production: `docs/plans/production-deploy.md`
  mục "Migration 0018".
- Chẩn đoán đầy đủ, nguyên văn thông điệp lỗi, số liệu 39 phiên failed + 8 ngày dead-letter
  câm: `docs/plans/HANDOFF-phien-2026-07-28-grant-thieu.md` §2.
- Migration codify: `packages/db/migrations/0018_u35_grant_bang_thieu.sql`.
- Test chứng minh quyền đến từ đúng migration (không phải cấp tay trong test):
  `packages/db/test/integration/grantVatApp.test.ts`.

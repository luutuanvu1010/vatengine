# U37c — Nhật ký tiến độ

Đặc tả: `docs/plans/U37c-plan.md` · Prompt: `docs/plans/U37c-prompt-dieu-phoi.md`

| Gói | Trạng thái | Commit | Ghi chú |
|---|---|---|---|
| Gói 1 — migration 0021 | ✅ DONE | `e088d51`, `d0cd7bf` | `token`/`nmten`/`so_luot_tai`/`lan_tai_cuoi`. Bảng đã có dữ liệu ⇒ thêm cột nullable → backfill token từ `khoa_r2` → siết NOT NULL. Hậu kiểm DB thật: 4/4 cột, UNIQUE + index, backfill đúng 26 ký tự; `hau-kiem-bang.mjs` **8/8 ĐẠT** |
| Gói 2 — đường tải `/tai/<token>` | ✅ DONE | `5a65a8a` | Hàm `SECURITY DEFINER` gộp 3 điều kiện hiệu lực; 4 ca 404 giống hệt nhau; `Cache-Control: no-store`; đếm lượt tải. 9 test |
| Gói 3 — đấu dây token | ✅ DONE | `d0cd7bf` | Gộp vào Gói 1 vì `token` NOT NULL bắt buộc route phải cấp ngay |
| **Gói 4 — bucket riêng tư** | ✅ DONE | `<gói 4>` | Cổng dừng đã CHẶN đúng: có 1 gói `san_sang` đang lưu hành. Kiểm thêm thì đường CŨ vẫn trả `200` ⇒ gỡ sẽ giết nó thật, không phải thao tác vô hại. Hỏi chủ dự án: gói đó chưa gửi khách, 6 lượt tải là tự thử ⇒ **được phép gỡ**. Đã gỡ, hậu kiểm: đường cũ `530`, đường mới `200`, bucket **không còn custom domain nào** |
| Gói 5 — trang Liên kết chia sẻ | ✅ DONE | `<gói 5+6>` | Mục điều hướng riêng `/lien-ket`, đủ 4 trạng thái, hiện tên khách + số lượt tải |
| Gói 6 — anchor + Sao chép/Chia sẻ/Email | ✅ DONE | `<gói 5+6>` | `HanhDongLienKet` dùng chung; mailto bằng hàm thuần; nút Chia sẻ ẩn khi trình duyệt không hỗ trợ |
| Gói 7 — tài liệu + review | 🔶 MỘT PHẦN | — | Tài liệu xong. **Review chéo `dod-auditor` + `security-reviewer` CHƯA CHẠY** |

## Cổng dừng

### Cổng dừng Gói 2 — ✅ ĐẠT (probe thật production 2026-07-29)

```
Gói ĐÃ THU HỒI → HTTP 404 · cache-control: no-store
Token bịa      → HTTP 404 · cache-control: no-store
diff hai phản hồi → GIỐNG HỆT NHAU
```

So với hành vi TRƯỚC U37c (cùng ngày, cùng cách đo): gói đã thu hồi trả `HTTP 200`,
`cf-cache-status: HIT`, `age: 2856` — tức còn tải được tới 4 giờ.

⚠️ Lần đo đầu báo `200` cho token bịa: web chưa lan xong bản deploy. Probe lại bằng `curl`
cho kết quả nhất quán. **Ghi lại để không ai đọc nhầm số đo đầu là kết luận.**

### Cổng dừng Gói 4 — ✅ ĐẠT (sau khi hỏi chủ dự án)

Phân bố lúc đo: `san_sang` 1 · `dang_tao` 1 · `da_thu_hoi` 2 ⇒ cổng dừng CHẶN đúng như thiết kế.

Kiểm thêm trước khi quyết (không suy đoán): đường **CŨ** của chính gói đó vẫn trả `HTTP 200`
⇒ gỡ domain **sẽ giết nó thật**. Bộ đếm 6 lượt chỉ tăng ở đường `/tai/` nhưng KHÔNG chứng
minh được khách đang dùng đường nào — R2 không cho tra nhật ký truy cập từng object. Đã hỏi
chủ dự án thay vì đoán: gói chưa gửi khách, 6 lượt là tự thử ⇒ được phép gỡ.

Hậu kiểm sau khi gỡ:

```
CŨ  (bucket công khai) → 530   (không còn origin)
MỚI (/tai/, qua DB)    → 200
wrangler r2 bucket domain list vat-chia-se → "no custom domains connected"
```

Từ đây **không còn cửa nào tới file mà không qua kiểm tra hiệu lực trong DB** — lớp rủi ro
"bucket công khai" biến mất khỏi hệ thống.

## Ba lỗi chỉ lộ khi chạy thật (không đọc mã ra được)

1. `tai_tra_goi($1)` — tham số chưa có kiểu nên Postgres không phân giải được hàm. `::text`.
2. `auth_lookup` sở hữu hàm nhưng **chưa có quyền trên bảng mới**. BYPASSRLS **không** thay
   thế GRANT. Tái lập trên PGlite: `permission denied for table goi_chia_se`.
3. `ALTER FUNCTION … OWNER TO auth_lookup` đòi chủ mới có CREATE trên schema; PG15+ đã thu
   hồi CREATE mặc định của PUBLIC nên `auth_lookup` không còn tự có (0001 chạy thời còn có).
   Lỗi này làm migrate **dừng giữa chừng khi 5 câu đầu đã áp vào production** ⇒ file phải
   sửa thành idempotent (`CREATE OR REPLACE`) mới chạy lại được.

## Hai bẫy quy trình đã nổ lại

- **ADR-0008 lần thứ ba**: journal có mốc `when` ở tương lai (2026-08-02) trong khi hôm nay
  29/07 ⇒ drizzle-kit đóng dấu `when = now`, nhỏ hơn, và bỏ qua im lặng.
- **Thiếu `--> statement-breakpoint`**: drizzle tách câu lệnh theo dấu này; file viết tay
  không có nên cả file bị gửi thành MỘT câu → 116 test đỏ.

# U37b Gói 3 — Dựng bucket công khai `vat-chia-se` (chủ dự án thao tác)

> **Vì sao Claude không tự chạy:** tạo bucket công khai + gắn tên miền là hành động hạ tầng
> đối ngoại, mở một bề mặt ai-có-link-cũng-tải-được. Claude soạn lệnh và hậu kiểm; **bạn bấm**.
>
> Cú pháp dưới đây lấy từ chính `wrangler` đang cài (`npx wrangler r2 bucket … --help`,
> bản 4.110.0, 2026-07-29), **không** chép từ trí nhớ hay tài liệu chung.

---

## 0. Trước khi bắt đầu — thứ bạn cần có sẵn

**Zone ID của `tourdao.vn`.** Lấy ở Cloudflare dashboard → chọn miền `tourdao.vn` → trang
**Overview**, cột phải, mục **API** → **Zone ID**. Lệnh `wrangler r2 bucket domain add` bắt
buộc có `--zone-id`, không suy ra được từ tên miền.

Xác nhận bucket chưa tồn tại (đã kiểm 2026-07-29 — hiện chỉ có `astro`, `khanhhoatravel`,
`nha-trang-media`, `nhatrangtravel`, `vat-raw`):

```
npx wrangler r2 bucket list
```

---

## 1. Tạo bucket

```
npx wrangler r2 bucket create vat-chia-se
```

⚠️ **KHÔNG dùng lại `vat-raw`.** `vat-raw` chứa hồ sơ gốc + file kết xuất của **mọi tenant**
và phải ở chế độ riêng tư. Mở công khai bucket đó là lộ toàn bộ kho.

## 2. Gắn tên miền công khai (QĐ-5)

```
npx wrangler r2 bucket domain add vat-chia-se \
  --domain docs.tourdao.vn \
  --zone-id <ZONE_ID_CUA_tourdao.vn> \
  --min-tls 1.2
```

Cloudflare tự tạo bản ghi CNAME. Trạng thái đi từ **Initializing → Active** sau vài phút.

## 3. ⚠️ Xác nhận `r2.dev` ĐANG TẮT

Đây là bước dễ bỏ sót nhất và là **lỗ hổng thật**, không phải chuyện sạch sẽ. Tài liệu
Cloudflare ghi rõ: *"If you do not disable public access, your bucket will remain publicly
available through your r2.dev subdomain"* — tức tắt tên miền riêng mà quên `r2.dev` thì
**vẫn lộ**, qua một URL bạn không kiểm soát và không có WAF.

```
npx wrangler r2 bucket dev-url get vat-chia-se
```

Nếu nó **đang bật** thì tắt ngay:

```
npx wrangler r2 bucket dev-url disable vat-chia-se
```

## 4. Lifecycle tự xóa sau ~30 ngày (QĐ-6)

```
npx wrangler r2 bucket lifecycle add vat-chia-se het-han-30-ngay goi-hoa-don/ \
  --expire-days 30
```

Ba tham số vị trí: `<bucket> <tên rule> <prefix>`.

- **Một rule theo prefix**, không tạo rule mỗi file — trần là 1000 rule/bucket.
- Prefix `goi-hoa-don/` khớp đúng quy ước khóa
  `goi-hoa-don/<YYYY-MM>/<token>.zip`.
- Cloudflare chỉ bảo đảm xóa **trong vòng 24 giờ sau mốc** ⇒ giao diện phải nói
  **"khoảng 30 ngày"**, không hứa mốc chính xác (Gói 6).

---

## 5. Hậu kiểm — chạy xong dán kết quả cho Claude

```
npx wrangler r2 bucket list                      # có vat-chia-se
npx wrangler r2 bucket domain list vat-chia-se   # docs.tourdao.vn, status Active
npx wrangler r2 bucket dev-url get vat-chia-se   # PHẢI là disabled
npx wrangler r2 bucket lifecycle list vat-chia-se # đúng MỘT rule, 30 ngày, prefix goi-hoa-don/
```

**Đạt** khi cả bốn đúng. Riêng mục `dev-url` mà không phải `disabled` thì **dừng lại**, đừng
đi tiếp sang Gói 4 — lúc đó mọi gói phát hành sau này đều có thêm một đường truy cập không
kiểm soát.

---

## 6. Phần Claude đã làm trong gói này

- `apps/api/wrangler.jsonc` — thêm binding `CHIA_SE` → `vat-chia-se`, đặt cạnh `RAW` kèm
  chú thích vì sao phải tách hai bucket. (`vat-api` là nơi đóng gói — QĐ-B7.)
- `apps/api/src/types.ts` — thêm `CHIA_SE: R2Bucket` vào `Env`.
- `apps/api/test/helpers.ts` — thêm dummy cho binding mới ở ranh giới test.

**Chưa deploy `vat-api`.** Binding chỉ có hiệu lực sau khi deploy, mà chưa có code nào dùng
tới nó — để Gói 4 làm xong rồi deploy một lượt, đúng thứ tự `deploy.md` (DB → worker → api).

## 7. Nếu muốn hoàn tác

```
npx wrangler r2 bucket domain remove vat-chia-se --domain docs.tourdao.vn
npx wrangler r2 bucket delete vat-chia-se
```

Xóa bucket chỉ được khi bucket rỗng.

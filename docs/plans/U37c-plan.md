# U37c — Đường tải qua Worker + không gian quản lý liên kết

> **Trạng thái: CHỜ DUYỆT QA1.** Chưa được code. Đặc tả này là hệ quả trực tiếp của một
> lỗ hổng THẬT phát hiện 2026-07-29, không phải ý tưởng làm đẹp.

## 1. Vì sao có đơn vị này

Chủ dự án báo: *"Sau khi Thu hồi thì link vẫn còn mở được."* Đúng.

### Bằng chứng gốc (probe thật trên bucket production, 2026-07-29, tái lập được)

```
put (không đặt cache-control)  → cache-control: max-age=14400
GET lần 2                      → cf-cache-status: HIT
DELETE khỏi R2                 → "Delete complete."
GET sau khi xóa                → HTTP 200 · HIT · TRẢ NGUYÊN NỘI DUNG
```

`docs.tourdao.vn` là custom domain của R2 ⇒ mọi phản hồi đi qua CDN Cloudflare và được
cache ở biên. **Xóa object KHÔNG vô hiệu hóa bản đã cache.** Nút "Thu hồi" hứa sai: tệp còn
tải được **tới 4 giờ** sau khi thu hồi, bởi bất kỳ ai có liên kết.

Đo trên dữ liệu thật cùng ngày: 2 gói ở trạng thái `da_thu_hoi` vẫn trả `HTTP 200 · HIT`
với `age` 2856s và 1983s.

### Đã vá tạm (`fac690d`+, đã deploy)

`put(..., httpMetadata: { cacheControl: "no-store" })` → `cf-cache-status: BYPASS`, DELETE
→ GET trả **404 ngay**. Kiểm chứng bằng probe.

### Vì sao vẫn cần U37c

Bản vá đóng được lỗ hổng nhưng **giữ nguyên mô hình sai**: *"thu hồi = xóa được file"*.
Mô hình đó phụ thuộc vào ba thứ nằm ngoài tầm kiểm soát của mã — lệnh xóa có thành công
không, cache có nhả không, lifecycle có chạy đúng hạn không. Phương án gốc là làm cho
**thu hồi trở thành một sự thật trong cơ sở dữ liệu**.

### Bài học phải ghi vào quy trình

Review bảo mật đã soi **đúng** đoạn thu hồi và kết luận thứ tự xóa-R2-trước là an toàn —
**đúng ở tầng mã**, nhưng CDN nằm **ngoài mã**, không có file nào để đọc ra nó. Đồng thời
kho R2 giả trong test tuy có giữ `meta` nhưng chưa ca nào khẳng định gì về nó, nên thiếu
`cacheControl` không làm test nào đỏ.

⇒ **Với mọi tài nguyên phục vụ qua HTTP công khai, tầng cache PHẢI được probe thật, không
suy luận từ mã.** Đây đúng khuôn bài học `:30000` của Hiến pháp.

## 2. Quyết định đã chốt (chủ dự án, 2026-07-29)

| # | Quyết định | Ghi chú |
|---|---|---|
| **QĐ-C1** | **Phục vụ tải qua Worker**, bucket chuyển thành RIÊNG TƯ | Thu hồi hiệu lực tức thì, độc lập cache và độc lập việc xóa file |
| **QĐ-C2** | Không gian quản lý liên kết là **mục điều hướng riêng** | Quản lý link độc lập với tra cứu hóa đơn — vào thẳng, không phải lọc lại mới thấy |
| **QĐ-C3** | "Gửi Email" dùng **`mailto:`** | Không backend, không rủi ro uy tín tên miền; thư đi từ hòm thư của chính khách nên người nhận tin hơn |
| **QĐ-C4** | "Gửi Zalo" dùng **Web Share API** | `zalo.me/share/link` trả **302 về trang không tồn tại**; `sp.zalo.me/plugins/share` trả 200 nhưng **CHƯA KIỂM CHỨNG** là chèn được liên kết. Không xây trên tiền đề chưa kiểm chứng |

## 3. Thiết kế

### 3.1 Đường tải mới

`GET https://vatengine.tourdao.vn/tai/<token>` — phục vụ bởi **`vat-web`**, không mở
hostname mới và **không phơi `vat-api` ra công cộng**.

Vì sao đặt ở `vat-web`: worker này đã có `run_worker_first: true` và service binding tới
`vat-api`. Nếu gắn `docs.tourdao.vn` thẳng vào `vat-api` thì **toàn bộ** route của `vat-api`
thành công khai trên hostname đó — mở rộng bề mặt tấn công để đổi lấy đúng một đường tải.

Luồng: `vat-web` nhận `/tai/*` → chuyển qua service binding tới route nội bộ của `vat-api`
→ `vat-api` tra `goi_chia_se` theo `token`, và **chỉ trả file khi ĐỦ CẢ BA**:

1. `trang_thai === "san_sang"`
2. `het_han_luc > now` — **ép ở tầng DB**, không chờ lifecycle (Cloudflare chỉ bảo đảm xóa
   *trong vòng 24h sau mốc*, nên hiện tại link còn sống quá hạn tới một ngày)
3. object còn trong R2

Sai bất kỳ vế nào → **404**, không phân biệt "không có" với "đã thu hồi" (không xác nhận
cho người dò rằng token từng tồn tại).

Phản hồi: stream thẳng `R2ObjectBody.body` (không đọc trọn vào RAM), kèm
`Content-Disposition: attachment`, `Content-Type: application/zip`, và
**`Cache-Control: no-store`** — nếu thiếu, ta tái lập đúng lỗi đang sửa, chỉ đổi chỗ.

> ⚠️ **Cổng dừng 1:** trước khi coi phần này xong, phải probe thật: tải được → thu hồi →
> `curl` lại **phải 404 NGAY**, không có cửa sổ 4 giờ.

### 3.2 Thay đổi dữ liệu — migration `0021`

Thêm vào `goi_chia_se`:

| Cột | Kiểu | Lý do |
|---|---|---|
| `token` | `text NOT NULL UNIQUE` (toàn cục) | Định danh công khai của liên kết. Tách khỏi `khoa_r2` để khóa R2 thành thuần nội bộ. Sinh bằng `sinhToken()` sẵn có — **26 ký tự × 5 bit = 130 bit**, đã kiểm |
| `nmten` | `text` | Tên khách hàng **chụp tại thời điểm tạo**. Danh sách cần hiện tên; nối bảng `hoa_don` mỗi lần vừa chậm vừa sai bản chất — đây là bản ghi lịch sử, tên lúc phát hành mới là tên đúng |
| `so_luot_tai` | `integer NOT NULL DEFAULT 0` | Biết link đã bị dùng mấy lần — dữ kiện điều tra khi nghi lộ, và là nền cho hạn mức 10 lượt/tháng ở backlog |
| `lan_tai_cuoi` | `timestamptz` | Mốc dùng gần nhất |

Ràng buộc bắt buộc theo khuôn `0008`/`0018`/`0020`: `ENABLE` **và** `FORCE ROW LEVEL
SECURITY`, policy cách ly, khối `DO $$ GRANT SELECT, INSERT, UPDATE TO vat_app $$` — **vẫn
KHÔNG cấp DELETE**.

> ⚠️ **Bẫy ADR-0008 sẽ NỔ:** `_journal.json` có các mốc `when` ở TƯƠNG LAI (2026-08-02).
> `drizzle-kit generate` đóng dấu `when = now` ⇒ `0021` sẽ **bị bỏ qua im lặng** mà vẫn báo
> thành công. Phải đặt lại `when = <mốc trước đó> + 60000` **và hậu kiểm trên DB thật** bằng
> `node scripts/hau-kiem-bang.mjs goi_chia_se`. Bẫy này đã nổ ở `0019` và `0020`.

### 3.3 Bucket chuyển thành riêng tư

Gỡ custom domain `docs.tourdao.vn` khỏi bucket `vat-chia-se`. Sau đó **toàn bộ lớp rủi ro
"bucket công khai" biến mất** — không còn đường nào tới file mà không qua kiểm tra DB.

Lifecycle 7 ngày **giữ nguyên** (dọn rác), nhưng nó thôi là cơ chế hết hạn — hết hạn nay do
DB ép (§3.1).

> ⚠️ **Cổng dừng 2:** gỡ custom domain sẽ làm mọi liên kết đã phát hành chết. Hiện chỉ có 2
> gói và **cả hai đã `da_thu_hoi`** (đã đo), nên không ảnh hưởng ai. **Phải đo lại ngay
> trước khi gỡ** — nếu lúc đó đã có gói `san_sang` thật thì dừng và hỏi.

### 3.4 Không gian quản lý liên kết (QĐ-C2)

Mục điều hướng mới **"Liên kết chia sẻ"** → `/lien-ket`, đọc `GET /goi-chia-se` đã có.

Mỗi dòng: khách hàng (tên + MST) · kỳ · số hóa đơn · tạo lúc · hết hạn · trạng thái · số
lượt tải · hành động.

Đủ **bốn trạng thái** theo `ui.md`: rảnh / đang tải / rỗng / lỗi. Rỗng phải nói được việc
cần làm tiếp, không để màn trắng.

RBAC giữ đúng hiện trạng: xem = mọi vai; thu hồi = mọi vai (đã chốt ở U37b — thu hồi là
hành động **giảm** rủi ro); tạo = `ke_toan_truong` + `quan_tri`.

### 3.5 Trình bày liên kết (QĐ-C3, C4)

Thay URL trần bằng **anchor "Liên kết tải hóa đơn"**, kèm hàng hành động:

| Nút | Cách làm | Ghi chú |
|---|---|---|
| **Sao chép liên kết** | `navigator.clipboard.writeText` | Phải có phản hồi thấy được ("Đã sao chép"), không im lặng. Cần secure context — production là HTTPS nên đủ |
| **Chia sẻ** | `navigator.share({ title, text, url })` | **Ẩn hẳn nút** khi `navigator.share` không tồn tại (máy tính), không hiện nút bấm-không-ăn-gì. Trên di động mở khay chia sẻ của hệ điều hành, trong đó có Zalo nếu đã cài |
| **Gửi Email** | `mailto:?subject=…&body=…` | Dựng bằng **hàm thuần** (test được), mã hóa URL đúng cách |
| **Thu hồi** | Đã có | |

Dùng `Hang`/`Cot`/`ChuPhu` vừa thêm ở `22bccff`. Nếu thiếu primitive thì **thêm vào thư
viện**, không tô kiểu nội tuyến trong `features/`.

## 4. Việc KHÔNG làm

- Không gửi thư từ máy chủ (QĐ-C3 đã chốt `mailto:`).
- Không dựng nút Zalo riêng khi chưa kiểm chứng được endpoint (QĐ-C4).
- Không làm hạn mức 10 lượt tải/tháng — `so_luot_tai` chỉ **mở đường**, phụ thuộc lớp
  thương mại chưa có.
- Không đụng `runHoSoGocJob` hay đường tải hồ sơ gốc từ GDT (U37a) — đã chạy đúng.

## 5. Tiêu chí nghiệm thu

1. `make lint` sạch; `make test` xanh; coverage tầng nghiệp vụ không tụt dưới 80%.
2. **Thu hồi → `curl` liên kết trả 404 NGAY** (probe thật, ghi lệnh + kết quả). Đây là tiêu
   chí sinh ra cả đơn vị này — nếu chỉ nó đỏ thì mọi thứ còn lại vô nghĩa.
3. **Hết hạn ép ở DB**: đặt `het_han_luc` về quá khứ → tải trả 404, **không** chờ lifecycle.
4. Cách ly tenant: tenant A không thấy/không thu hồi được liên kết của tenant B.
5. `node scripts/hau-kiem-bang.mjs goi_chia_se` ĐẠT sau migration `0021` (RLS ENABLE+FORCE,
   policy, `vat_app` S/I/U và **không** DELETE).
6. Bucket `vat-chia-se` **không còn custom domain**; truy cập trực tiếp không còn đường nào.
7. Token sai / gói đã thu hồi / gói hết hạn → **đều 404 giống hệt nhau** (không rò rằng
   token từng tồn tại).
8. `Cache-Control: no-store` có mặt trên phản hồi tải — **có test khóa**, vì đây đúng chỗ đã
   trượt một lần.
9. Trang `/lien-ket` đủ bốn trạng thái; nút Chia sẻ **ẩn** khi trình duyệt không hỗ trợ.
10. Review chéo `dod-auditor` **+** `security-reviewer`, ghi kết quả vào `U37c-tien-do.md`.
11. **Nghiệm thu thật bằng tay** (chủ dự án): tạo liên kết → mở ở cửa sổ ẩn danh tải được →
    thu hồi → tải lại **404 ngay** → mở trang Liên kết chia sẻ thấy đúng trạng thái.

## 6. Rủi ro

| Rủi ro | Xử lý |
|---|---|
| **Gỡ custom domain làm chết link đang dùng** | Đo lại ngay trước khi gỡ; hiện 2 gói đều đã thu hồi. Có gói `san_sang` thật ⇒ **dừng và hỏi** |
| **Ghi DB trên endpoint không xác thực** (`so_luot_tai`) | Token 130 bit không dò được; phép ghi là một `UPDATE` tăng đếm, rất nhẹ. Nếu lo hơn thì gộp ghi hoặc bỏ đếm — **không** dựng bảng log mỗi lượt tải |
| **Bẫy journal ADR-0008** (đã nổ 2 lần) | Đặt lại `when` + hậu kiểm DB thật, không tin CLI báo thành công |
| **Worker thành đường truyền băng thông** | Stream thẳng `R2ObjectBody.body`, không đọc vào RAM. Quy mô đo thật: lớn nhất 56 hóa đơn/gói |
| **Tái lập lỗi cache ở chỗ mới** | `Cache-Control: no-store` + tiêu chí nghiệm thu 8 khóa lại bằng test |
| **`navigator.share` chỉ chạy trong cử chỉ người dùng và cần HTTPS** | Gọi thẳng trong `onClick`; feature-detect để ẩn nút |

## 7. Cần cập nhật tài liệu

- `docs/06-BINDING_MAP.md` §3d: endpoint tải công khai + các cột mới, **đọc TỪ MÃ**.
- `docs/plans/U37b-tien-do.md`: ghi lỗ hổng cache và bản vá `no-store`.
- `docs/BACKLOG-y-tuong-va-de-xuat.md`: (a) hạn mức 10 lượt/tháng nay đã có `so_luot_tai`
  làm nền; (b) endpoint chia sẻ Zalo — probe lại khi có nhu cầu thật.
- `CLAUDE.md` hoặc `.claude/rules/security.md`: ghi thành luật — **tài nguyên phục vụ qua
  HTTP công khai phải probe tầng cache, không suy luận từ mã**.

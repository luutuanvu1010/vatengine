# Lớp thương mại U17→U21 — Tình hình & lộ trình

> Cập nhật **2026-07-21**. Đây là **sổ tầng chương trình**: nó không thay `COMMERCIAL-LAYER-plan.md` (chiến lược) hay các `U*-plan-thuc-thi.md` (chiến thuật từng đơn vị), mà trả lời ba câu mà không file nào đang trả lời được:
>
> **Đang ở đâu · Đang nợ gì · Làm gì tiếp, vì sao thứ tự đó.**
>
> Lý do file này ra đời: sau một phiên dài đưa U18+U19 lên production, công việc ở tầng đơn vị vẫn theo kế hoạch, nhưng ở tầng chương trình đã trôi — chủ dự án nhận ra và yêu cầu dừng lại chốt (2026-07-21).

---

## 1. Đang ở đâu (số liệu đo được, không phải trí nhớ)

| Đơn vị | Nội dung | Mã | Production |
|---|---|---|---|
| **U17a** | Nền gói dịch vụ + ngưỡng cấu hình + `audit_log_admin` | ✅ merged | ✅ live (migration 0007, 2026-07-19) |
| **U17b** | `POST /dang-ky` + cổng trạng thái tenant + SignupLimiter | ✅ merged | ✅ live (2026-07-20) |
| **U18** | Admin API — super-admin, 8 hàm xuyên-tenant, vòng đời tenant | ✅ merged (PR #27) | ✅ live (migration 0011, 2026-07-21) |
| **U19** | Cổng Admin `adminvatengine.tourdao.vn` | ✅ merged (PR #28) | ✅ live (2026-07-21) — **~85%** |
| **U20** | Đăng ký khách + đổi mật khẩu + Cài đặt pháp lý + font | ✅ merged (PR #30) | ✅ **live (2026-07-21)** — smoke đầu-cuối 10/10 |
| **U21** | Dashboard giám sát | ⬜ chưa bắt đầu | ❌ |
| **U24** | Hạ tầng email (AWS SES) + quên mật khẩu | ⬜ chưa bắt đầu | ❌ |
| **U33** | Gỡ rate-limit tầng ứng dụng → Turnstile | 🟡 **ĐANG DỞ** — lõi xong, test đỏ | ❌ |

**Chuỗi nghiệp vụ hiện tại — chỗ nào đã thông, chỗ nào chưa:**

```
khách vào web ──[U20 ✅ live]──▶ cho_duyet ──[U19 ✅ live]──▶ active
                                                                │
                    [U20 ✅ live] tự đổi mật khẩu ◀────────────┘
```

**Chuỗi onboard đã thông toàn tuyến trên production** (kiểm chứng 2026-07-21, smoke đầu-cuối 10/10 ca). Khách tự đăng ký, chủ dự án duyệt trong Cổng Admin, khách đăng nhập bằng mã 6 số rồi tự đặt mật khẩu riêng. Không còn khúc nào phải làm tay.

---

## 2. Đã trôi ở đâu — 4 dạng, ghi để không lặp

1. **Đơn vị "xong" rồi mở lại.** U18 được tuyên bố xong, rồi trong lúc làm U19 phải thêm `GET /admin/auth/me` và `POST /admin/auth/logout`. Cả hai đều đúng chỗ (`U19-plan` §1b đã dự liệu "thiếu endpoint thì bổ sung ngược vào U18"), nhưng hệ quả là mốc "U18 xong" dịch hai lần mà không ai ghi lại.
2. **Mở đơn vị mới khi đơn vị trước còn nợ.** U19 ship ở 85% (thiếu panel chi tiết + form metadata) rồi chuyển sang U20. Quyết định có ý thức và có ghi backlog — nhưng nó tạo tiền lệ, và lần sau sẽ dễ hơn.
3. **Quyết định phân tán.** QĐ-1…QĐ-6 nằm trong `U18-plan-thuc-thi.md`; ba quyết định U20 nằm trong `U20-plan-thuc-thi.md`; một số chỉ tồn tại trong hội thoại. Không có sổ chung ⇒ phiên sau phải đọc lại ba file để biết cái gì đã chốt.
4. **Sự cố chen ngang, không có nhịp dừng.** Hai sự cố production (cache Hyperdrive, tài khoản placeholder) ăn phần lớn phiên. Sau mỗi lần vá xong là quay lại code tiếp ngay, không dừng để hỏi "việc này đổi gì trong bức tranh chung".

---

## 3. Triết lý đang thực sự chi phối (rút từ việc đã làm, không phải lý thuyết)

Năm nguyên tắc dưới đây **đã tự chứng minh** trong phiên vừa rồi. Chúng nên là thước đo cho mọi đơn vị còn lại.

**① An toàn đến từ CẤU TRÚC, không từ kỷ luật người viết.**
`AdminEnv` không có `tenantId` nên code nhánh admin *không thể* dựng truy vấn thiếu điều kiện lọc — hỏng ở `tsc` chứ không âm thầm nhận `undefined`. 8 hàm SQL *không có đường tới* `hoa_don` nên ranh giới pháp lý không phụ thuộc việc route có lịch sự không hỏi. Front-door dùng **allowlist**, nên endpoint khách thêm sau này mặc định không rò sang miền admin. Lý do: route sẽ được người khác sửa, sau này, khi không ai nhớ vì sao.

**② Bằng chứng đứng trên tự tin.**
Mọi khẳng định về hệ thống ngoài phải gắn nhãn *ĐÃ KIỂM CHỨNG* hoặc *CHƯA KIỂM CHỨNG*. Hai lần vi phạm trong phiên đều trả giá ngay: một lệnh shell nối `&&` từ `echo` làm cổng lint mất tác dụng và đẩy code sai phạm vi lên remote; và chẩn đoán Hyperdrive suýt được vá khi mới là suy luận. Cách sửa cả hai đều giống nhau — **đo, rồi mới kết luận**.

**③ Fail-closed ở mọi cổng.**
Secret admin trùng secret khách ⇒ 503 chứ không chạy tiếp với một lớp phòng thủ. RLS bật mà **rỗng policy** ⇒ đọc ra 0 hàng. Trạng thái không hiểu được ⇒ từ chối thao tác. Nguyên tắc: khi không chắc, đóng lại.

**④ Nợ phải ghi thành chữ, kèm điều kiện kích hoạt.**
Mỗi thứ bỏ qua đều vào backlog với *bối cảnh đo được*, *rủi ro nếu bỏ qua*, và **mốc phải xử lý** (ví dụ: "nâng lên Cao ngay khi có khách trả phí đầu tiên"). Nợ không ghi là nợ sẽ quên.

**⑤ Một thao tác ghi diễn đạt như câu đọc sẽ bị mọi tầng đối xử như câu đọc.**
Bài học đắt nhất của phiên. Các thao tác ghi của admin viết dưới dạng `SELECT ... FROM admin_*()` vì chúng là hàm `SECURITY DEFINER`; Hyperdrive thấy `SELECT` nên cache, và chốt chặn TOCTOU 409 bị vô hiệu hoàn toàn. Không test nào bắt được (PGlite không có Hyperdrive), không review nào bắt được (đọc mã nguồn, không đọc topo runtime). **Bài học tổng quát: kiểm tra giả định ở ranh giới giữa các tầng, không chỉ trong tầng của mình.**

---

## 4. Sổ quyết định — một chỗ duy nhất

| Mã | Quyết định | Ngày | Hệ quả còn hiệu lực |
|---|---|---|---|
| **QĐ-1** | U18 **không gửi email**; `duyet`/`reset` trả mật khẩu tạm **một lần** trong response | 21-07 | Hạ tầng email là AWS SES, thuộc **U24**. UI **không được hứa gửi email** cho khách |
| **QĐ-2** | `POST /auth/doi-mat-khau` thuộc **U18** (backend), UI thuộc U20 | 21-07 | ✅ đã làm cả hai |
| **QĐ-3** | Seed super-admin bằng **script chạy tay**, không endpoint công khai | 21-07 | ✅ đã làm; đã bổ sung cổng chặn giá trị mẫu sau sự cố |
| **QĐ-4** | Bảo vệ biên bằng **Cloudflare Access**, không 2FA app-level | 15-07 | ✅ đã gắn. `requireSuperAdmin` vẫn phải tự đứng vững khi không có Access |
| **QĐ-5** | **Rate-limit + tường lửa do hạ tầng Cloudflare**, không thêm ở tầng ứng dụng | 21-07 | ⚠️ WAF theo IP **không thay** được khoá theo tài khoản (lý do H-A.5b tồn tại) |
| **QĐ-6** | Khoá tenant **không cắt phiên đang sống** — ghi nợ, không xử lý | 21-07 | Trễ tới 8h. Nâng ưu tiên khi có khách trả phí đầu tiên |
| **QĐ-7** | **Không buộc** đổi mật khẩu lần đầu; chỉ có mục tự nguyện trong Cài đặt | 21-07 | ✅ đã làm. Test khẳng định lời nhắc **không** chặn đường |
| **QĐ-8** | Câu chữ pháp lý nói **đúng hành vi thật**: lưu token GDT **đã mã hoá**, không lưu mật khẩu thuế thô | 21-07 | Dùng ở U20 W3 |
| **QĐ-9** | Giữ `--fs-base: 16px`; chỉ sửa chỗ lạm dụng `--fs-sm` ở **văn bản đọc** | 21-07 | U20 W4 |
| **QĐ-10** | **Tắt cache Hyperdrive**, không bọc transaction | 21-07 | ⚠️ Mã vẫn diễn đạt ghi bằng `SELECT fn()`. **Bật lại cache = lỗi quay về, im lặng** |
| **QĐ-11** | **Gỡ toàn bộ rate-limit tầng ứng dụng** (`SignupLimiter` + `LoginLimiter`), thay bằng WAF Cloudflare + **Turnstile** ở Đăng ký và Đăng nhập | 21-07 | ⚠️ WAF chặn theo **IP**, `LoginLimiter` chặn theo **TÀI KHOẢN** — không thay thế nhau. Hệ quả: mật khẩu tạm 6 số **chỉ còn 1/3 điều kiện bù** (hạn 72h); QĐ-7 đã bỏ "buộc đổi". Đánh đổi được nêu rõ và chủ dự án chọn có ý thức. Xem `U33-plan-thuc-thi.md` §2 |

---

## 5. Sổ nợ

| Nợ | Mức | Điều kiện phải xử lý |
|---|---|---|
| U19 thiếu panel chi tiết + form sửa metadata | Trung bình | Làm **cùng U21** (chia chung dữ liệu) |
| Khoá tenant không cắt phiên đang sống (trễ 8h) | Trung bình → **Cao** | **Ngay khi có khách trả phí đầu tiên** |
| Không có test CI dưới role Postgres non-superuser thật | Trung bình | Trước khi lớp thương mại đón khách thật |
| Mã vẫn diễn đạt thao tác ghi bằng `SELECT fn()` | Thấp (đã bù bằng tắt cache) | Nếu ai muốn bật lại cache Hyperdrive |
| ~~Service token Access chưa dùng được~~ | — | ✅ đã xong 2026-07-21 |
| 🔴 **Không xoá được tenant** — trigger append-only của `audit_log` chặn cascade | **Cao** | **Trước khi nhận khách trả phí.** Mâu thuẫn thật giữa `security.md` (audit bất biến) và NĐ 13/2023 (quyền xoá dữ liệu). Ba hướng đã ghi ở BACKLOG, **chưa chốt** — quyết định tầng kiến trúc |
| Mật khẩu tạm 6 số chỉ còn **1/3** điều kiện bù sau QĐ-7 + QĐ-11 | Trung bình | Nếu thấy cần siết: đổi sang chuỗi dài hơn, hoặc rút hạn 72h |

---

## 6. Lộ trình — thứ tự và lý do

**Nguyên tắc sắp thứ tự:** ưu tiên thứ **rút ngắn khoảng cách giữa "đã làm" và "khách dùng được"**, rồi mới tới thứ làm sản phẩm đầy đủ hơn.

### ~~Bước 1 — Đóng U20 rồi deploy~~ ✅ XONG 2026-07-21

*(giữ lại để thấy lộ trình đã đi tới đâu)*

### Bước 1b — U33: gỡ rate-limit → Turnstile ← **ĐANG Ở ĐÂY**
Chủ dự án chốt 2026-07-21. Chặn bởi: cần Site Key + Secret Key của Turnstile.

### ~~Bước 1 cũ — Đóng U20 (2 khối còn lại) rồi **deploy**~~
`W3` Cài đặt 4 card (chứa cam kết ủy quyền MST + chính sách bảo mật — **điều kiện pháp lý để nhận khách thật**) · `W4` rà `--fs-sm`.

*Vì sao trước tiên:* U20 W1+W2 đã xong nhưng nằm trên nhánh. **Trên production khách vẫn chưa đăng ký được.** Đây là khoảng cách lớn nhất giữa công sức đã bỏ ra và giá trị thực nhận.

### Bước 2 — Đóng nợ U19 **cùng** U21
Panel chi tiết + form metadata + Dashboard giám sát. Chúng tiêu thụ cùng tập dữ liệu (hạn token GDT, lịch sử đồng bộ, sức khỏe theo tenant); tách ra làm sẽ phải viết lại.

*Điều kiện vào:* U20 đã live.

### Bước 3 — U24 (email SES + quên mật khẩu)
Mở khoá ba thứ đang treo: gửi mật khẩu tạm tự động (thay QĐ-1), thông báo Duyệt/Từ chối (P9), và luồng quên mật khẩu.

*Vì sao sau cùng:* phụ thuộc điều kiện **ngoài code** (verify DNS domain trong SES, quota AWS), nên không nên chặn đường đi của những đơn vị thuần phần mềm.

### Xen kẽ — trả nợ theo điều kiện kích hoạt
Không xếp lịch cứng; kích hoạt theo mốc ở §5. Riêng "test CI dưới role non-superuser" nên làm **trước** khi có khách thật thứ hai.

---

## 7. Luật làm việc — để không trôi lại

1. **Một đơn vị chỉ "đóng" khi:** merged + deploy + nợ đã ghi vào §5 + sổ quyết định §4 đã cập nhật. Chưa đủ bốn thì chưa mở đơn vị mới.
2. **Mỗi quyết định vào §4 NGAY khi chốt**, không để trong hội thoại. Sổ này là nguồn duy nhất.
3. **Sau mỗi sự cố production: dừng, cập nhật §2/§4/§5 trước khi code tiếp.** Sự cố luôn đổi một giả định nào đó — code tiếp ngay là code trên giả định cũ.
4. **Bổ sung ngược vào đơn vị trước** (như U19 → U18) được phép, nhưng phải ghi vào §2 rằng mốc "xong" đã dịch.
5. **Cổng kiểm chứng không được nối bằng `&&` từ lệnh in ra màn hình.** Chạy `make lint && make test` rồi mới commit — kiểm mã thoát của *chính nó*, không phải của `echo`.

---

## 8. 🟡 U33 đang dở — điểm dừng phiên 2026-07-21

Nhánh **`feat/u33-turnstile`**, commit cuối `8be6fd3` (**WIP, `make lint` và `make test` ĐỎ**). Chưa push, chưa deploy. Production đang chạy U20 bình thường, không có gì hỏng.

### Đã xong
- `apps/api/src/turnstile.ts` — xác minh server-side, **14 test unit xanh**. Hợp đồng lấy từ tài liệu Cloudflare (tra 2026-07-21), không phải trí nhớ.
- `routes/dangKy.ts` + `routes/auth.ts` — thay limiter bằng cổng Turnstile, fail-closed.
- Xoá `loginLimiter{,DO}.ts`, `signupLimiter{,DO}.ts` + 2 test unit của chúng.
- Dọn `types.ts`, `index.ts`, `test/helpers.ts`.

### Còn lại — theo thứ tự nên làm

**① Helper test dùng chung (làm TRƯỚC — nó gỡ phần lớn màu đỏ).**
~25 test gọi `/dang-ky` và `/auth/login` **không kèm token Turnstile** nên giờ bị cổng captcha chặn, và route sẽ cố gọi ra `challenges.cloudflare.com` **thật** trong test. Cách sạch: **một** helper trong `test/helpers.ts` vừa stub `fetch` tới `siteverify` vừa chèn `cf-turnstile-response` vào body — sửa một chỗ thay vì hai mươi lăm.

**② Viết lại 9 test kiểm hành vi vừa gỡ.**
- `auth.hardening.test.ts` dòng ~186/197/203/212 — 4 ca lockout.
- `dangKy.test.ts` dòng ~167/313/343/378/419 — rate-limit, TOCTOU, thiếu `CF-Connecting-IP`, và 2 ca refund.

⚠️ **Không xoá cho xong.** Thay bằng ca khẳng định hành vi MỚI: *"đăng nhập sai 20 lần liên tiếp vẫn trả 401, không còn khoá"*. Nếu chỉ xoá, người sau sẽ không biết việc mất lockout là **có chủ ý** (QĐ-11) hay là hồi quy.
Ghi chú: ca `khong_xac_dinh_duoc_ip` (503 khi thiếu `CF-Connecting-IP`) **không còn đúng** — cổng Turnstile không cần IP để hoạt động, IP chỉ là dữ liệu phụ giúp Cloudflare chấm điểm.

**③ Frontend.** Widget ở `DangKyPage` + `LoginPage`; script `https://challenges.cloudflare.com/turnstile/v0/api.js`; đặt trong `<form>` thì tự sinh input ẩn `cf-turnstile-response`. Site key qua `VITE_TURNSTILE_SITE_KEY`.

**④ 🔴 Nới CSP `apps/web/worker.ts`** — `script-src` và `frame-src` thêm `https://challenges.cloudflare.com`. **KHÔNG nới `apps/admin`** (đã sau Access, giữ bề mặt hẹp).
Đây là điểm hỏng-CÂM: thiếu bước này widget không hiện và **không báo lỗi rõ ràng**.

**⑤ 🔴 `wrangler.jsonc`** — bỏ binding `LOGIN_LIMITER`/`SIGNUP_LIMITER` **và khai `deleted_classes`** cho hai Durable Object. Xoá class DO mà không khai `deleted_classes` thì **deploy sẽ lỗi**.

**⑥ Deploy.** `wrangler secret put TURNSTILE_SECRET_KEY`; build `apps/web` với `VITE_TURNSTILE_SITE_KEY`. Hai khoá đã có sẵn trong `packages/db/.dev.vars`.

### Dọn sau khi xong
`cau_hinh_he_thong.dangky_max_moi_ip_gio` (=5) trên production **không còn ai đọc**. Xoá hàng để không ai tưởng nó còn tác dụng.

### Bài học rút ra ngay tại đây
Kế hoạch U33 §5 liệt kê "21 file bị đụng" — đúng về **file nguồn**, nhưng **không tính hệ quả lên bộ test**. Gỡ một cổng nằm ở đầu hai route công khai làm đỏ mọi test đi qua hai route đó, kể cả những test chẳng liên quan gì tới cổng ấy. Lần sau, khi lập kế hoạch cho việc gỡ/thêm một **middleware ở đầu route**, phải đếm luôn số test đi qua route đó — không chỉ số file chứa tên module bị gỡ.

# Kế hoạch — Lớp thương mại (Commercial Layer) gắn vào toàn engine

> Trạng thái: **⬜ KẾ HOẠCH — CHƯA HIỆN THỰC.** Đây là **cụm đơn vị U17–U21**, nối tiếp sau U14 (login/token GDT), U15 (Frontend SPA), U16 (Giới thiệu & Ủng hộ). Lớp này biến engine kỹ thuật thành **sản phẩm SaaS phát hành được**: cổng đăng ký, duyệt khách, **Cổng Admin toàn diện** (quản lý thành viên + dashboard giám sát) trên `adminvatengine.tourdao.vn`, thông tin pháp lý & thương hiệu.
>
> **Hạ tầng mới phát sinh (chốt 2026-07-15):** ① App admin riêng `apps/admin` (subdomain `adminvatengine.tourdao.vn`). ② **Gửi email giao dịch** (mật khẩu tạm 6 số khi duyệt) — provider CHƯA KIỂM CHỨNG, phải probe (U18 §6). ③ Endpoint stats rẻ cho dashboard (U18/U21).
>
> **Nguồn "làm gì":** yêu cầu chủ dự án (phiên 2026-07-15) + `KIEN_TRUC_VA_KE_HOACH.md` mục 5 (Tầng trình bày = SPA + API + **Cổng Admin**) + mục 12 GĐ4. **Nguồn "làm thế nào":** `TRIEN_KHAI_BANG_CLAUDE_CODE.md` (vòng lặp U0–U12, mỗi lần một đơn vị nhỏ, TDD). **Luật áp dụng:** `security.md`, `multi-tenant.md`, `testing.md`. Đơn vị backend (U17–U18) tuân `multi-tenant.md` chặt; frontend (U19–U20) không đụng `gdt-adapter.md`.
>
> **Quan hệ với U15 fence:** U15-plan đã ghi rõ *"Cổng Admin (quản lý tenant/người dùng/gói): chưa có API quản trị… Chờ đơn vị backend Admin API"* và *"UI đăng nhập… Chờ đơn vị backend"*. **Cụm U17–U20 chính là các đơn vị lấp fence đó** — không phá vỡ ranh giới U15 đã đặt, mà hoàn thành phần bị hoãn có chủ đích.

---

## 0. Quyết định đã chốt với chủ dự án (2026-07-15)

| # | Chủ đề | Quyết định |
|---|---|---|
| A | **Tách Admin** | **Tách hoàn toàn**: Cổng Admin có **đường dẫn riêng** (`/admin/*`) + **màn đăng nhập riêng**, **token riêng**, KHÔNG dùng chung màn login khách. Đây là yêu cầu "vô cùng quan trọng" của chủ dự án. |
| B | **Quyền Admin** | **Super-admin toàn hệ thống (vai MỚI)** đứng NGOÀI mô hình tenant — thấy & điều khiển mọi tenant. Cần cơ chế **bỏ qua RLS có kiểm soát** (không phải vai `quan_tri` trong-tenant sẵn có). |
| C | **Đăng ký khách** | **Đăng ký → chờ duyệt → Admin bật.** Khách tự điền form; hệ thống lọc miền email + chặn rác; bản ghi ở trạng thái `cho_duyet`; **chỉ đăng nhập được sau khi Admin duyệt** trong Cổng Admin. |
| D | **Miền email cho phép** | `gmail.com`, `yahoo.com`, **và email tên miền doanh nghiệp** (đuôi `.com`/`.com.vn`/`.net`… hợp lệ). Chặn phần còn lại. |
| E | **Chặn rác bổ sung** | Chặn **miền dùng-1-lần** (mailinator, guerrilla…) + chặn **alias `+`** lạm dụng (`user+spam@`). |
| F | **Chia đơn vị** | **Chia nhỏ theo U** (U17→U20), mỗi U tự chạy + tự test — đúng kỷ luật dự án. |
| G | **Thương hiệu & pháp lý** | Tên sản phẩm **VATEngine v1.0**; **miễn phí** cho doanh nghiệp VN; trang Cài đặt chung nêu đầy đủ mục tiêu, chính sách, cam kết ủy quyền, thông tin tác giả (Công ty TNHH Tour Đảo, MST 4201969169), quyền lợi gói **Free / 01 MST / hỗ trợ Email + cộng đồng**. |
| H | **Giao diện** | **Body font 16–17px** (tăng độ đọc). |

---

## 0b. QUYẾT ĐỊNH CHỐT — phiên rà soát 2026-07-17 (đặt tên thực thi: "U Plus")

> Chủ dự án đã rà lại toàn cụm U17→U21 và **chốt kế hoạch**. Cụm được gọi là **"U Plus"** khi viết prompt thực thi. Các quyết định dưới **ghi đè/bổ sung** cho §0 (2026-07-15) khi mâu thuẫn.

| # | Chủ đề | Quyết định 2026-07-17 |
|---|--------|------------------------|
| P1 | Câu pháp lý (trang Cài đặt) | **Dùng bản ĐÃ ĐIỀU CHỈNH** khớp thực tế: *"Chúng tôi không lưu mật khẩu tài khoản thuế của bạn; phiên kết nối được mã hóa và chỉ dùng để đồng bộ hóa đơn theo yêu cầu của bạn."* (Bỏ bản gốc "không lưu thông tin kết nối".) Nên tham vấn luật sư trước phát hành. |
| P2 | Hạ tầng email | **Để quyết khi code** — cô lập sau interface `EmailTransport`, ghi cả 2 hướng (MailChannels/Cloudflare vs Resend/SendGrid), **probe gửi thật** trước khi chốt provider. |
| P3 | Cổng Admin | **App riêng `apps/admin`** trên subdomain `adminvatengine.tourdao.vn` (tách vật lý token). |
| P4 | Cỡ chữ | `--fs-base: 17px` + `--fs-sm: 15px`; rà thay `--fs-sm`→`--fs-base` ở văn bản đọc. |
| P5 | 2FA super-admin | **Để giai đoạn sau** — v1.0 bảo vệ subdomain admin bằng **Cloudflare Zero Trust (Access)**, chưa làm 2FA app-level. |
| P6 | Mật khẩu tạm khi duyệt | **Nâng lên 8–10 ký tự chữ+số** (bỏ mã 6 số) + hết hạn + buộc đổi lần đầu + rate-limit login. |
| P7 | Chính sách mật khẩu khách | **Độ dài + độ phức tạp cổ điển** (≥8, buộc hoa/thường/số/ký tự đặc biệt). |
| P8 | Chống dò mật khẩu (khóa login sai) | **Để sau v1.0** — v1.0 chỉ rate-limit cơ bản. |
| P9 | Email trạng thái | Gửi email khi **Duyệt + Từ chối**; Khóa/Mở chỉ audit nội bộ. |
| P10 | Consent điều khoản | **Bắt buộc tick đồng ý** điều khoản khi đăng ký; không đồng ý → từ chối & thoát. **KHÔNG** lưu lịch sử phiên bản consent ở v1.0. |
| P11 | Audit log Admin xem | **Cơ bản v1.0** (danh sách + phân trang + lọc theo loại). |
| P12 | Rate-limit API khách | **Cơ bản MỌI endpoint** (theo tenant/IP), không chỉ đăng ký/login. |
| P13 | Gói dịch vụ | **Chuẩn bị bảng gói linh hoạt** (bảng gói + hạn mức dạng dữ liệu) ngay từ đầu; v1.0 chỉ bật **Free**. Thay hardcode `getGioiHanTkThue` (U17). |
| P14 | Quy mô Admin (100k tenant) | Danh sách tenant **phân trang + lọc + tìm server-side** trên index. |
| P15 | Giám sát lỗi | **Cảnh báo chủ động** cho chủ (email/thông báo) khi egress GDT lỗi kéo dài / đồng bộ thất bại liên tục — ngoài hiển thị dashboard (U21). |


---

## 1. Bức tranh tổng — lớp thương mại gồm gì

Engine hiện tại (U0–U16) đã: kéo hóa đơn 2 chiều từ GDT, lưu đa tenant có RLS, API tra cứu/kết xuất/đối chiếu, SPA khách, login/token GDT, trang Giới thiệu & Ủng hộ. **Thiếu để thành SaaS phát hành được:**

1. **Cửa vào khách hàng mới** — người lạ tự đăng ký, không cần bạn tạo tay từng tài khoản.
2. **Cổng kiểm soát của chủ** — bạn duyệt/từ chối/khóa/mở từng khách, nhìn toàn hệ thống.
3. **Danh tính thương mại** — sản phẩm có tên, phiên bản, gói dịch vụ, ràng buộc pháp lý & ủy quyền rõ ràng.
4. **Ranh giới chủ ↔ khách** — hai thế giới đăng nhập tách biệt, không lẫn.

Bốn nhu cầu này ánh xạ thành **5 đơn vị** (U19 tách khung+thành viên, U21 dashboard giám sát — chốt chủ dự án 2026-07-15):

```
U17  Backend: schema trạng thái duyệt + gói dịch vụ + luồng ĐĂNG KÝ công khai (lọc email, chặn rác)
      │  (mở đường ghi bản ghi "chờ duyệt"; chưa cho đăng nhập)
      ▼
U18  Backend: ADMIN API — vai super-admin toàn hệ thống + bỏ-qua-RLS có kiểm soát
      │  (auth admin, duyệt/khóa/mở/từ chối/liệt kê, PATCH metadata, reset mật khẩu,
      │   stats rẻ, gửi email mật khẩu tạm 6 số; audit mọi thao tác chủ)
      ▼
U19  Frontend: CỔNG ADMIN tách biệt (adminvatengine.tourdao.vn) — login riêng, token riêng
      │  + QUẢN LÝ THÀNH VIÊN đầy đủ (duyệt/khóa/mở/từ chối, sửa metadata, reset mật khẩu, chi tiết tenant)
      ▼
U20  Frontend: Trang ĐĂNG KÝ khách + Settings pháp lý/thương hiệu + font 16→17px + chặn login khi chưa duyệt
      │  (tiêu thụ U17; hoàn thiện trải nghiệm app khách; ra mắt cho khách)
      ▼
U21  Frontend: DASHBOARD GIÁM SÁT toàn diện (trong Cổng Admin) — sức khỏe hệ thống, tăng trưởng,
      nhật ký, cảnh báo token GDT (tiêu thụ stats U18 + probe U13; số liệu rẻ, không full-scan)
```

**Thứ tự bắt buộc:** U17 → U18 → U19 → U20 → U21 (chốt 2026-07-15: ra mắt luồng khách trước, dashboard giám sát cuối). Lý do: frontend chỉ dựng khi API đã có (bài học U15). U19/U21 (Cổng Admin) cần U18; U20 cần U17; U21 cần cả endpoint stats (U18) + probe (U13).

**Cổng Admin = U19 (quản lý thành viên) + U21 (dashboard giám sát)** — cùng app `apps/admin` trên `adminvatengine.tourdao.vn`, chia hai đơn vị để mỗi U nhỏ & test trọn (kỷ luật dự án).

---

## 2. Mô hình dữ liệu — thay đổi tối thiểu, bám schema hiện có

**Đã có sẵn (đọc từ mã, không dựng lại):**
- `tenants`: `id, ten, mst, trang_thai (default 'active'), goi_dich_vu (nullable), ngay_tao`. → **`trang_thai` và `goi_dich_vu` là chỗ gắn lớp thương mại — không cần bảng mới cho gói.**
- `nguoi_dung`: `id, tenant_id, email (UNIQUE toàn cục), password_hash, vai_tro (default 'ke_toan'), ngay_tao`. RBAC 3 vai: `ke_toan < ke_toan_truong < quan_tri` (`apps/api/src/rbac.ts` — nguồn chân lý).
- `audit_log`: append-only (migration 0002), keyed tenant.
- Hàm `auth_lookup_user(email)` SECURITY DEFINER (bề mặt hẹp) — login tra trước khi biết tenant.

**Thay đổi lớp thương mại (chi tiết ở từng U):**

| Thay đổi | Đơn vị | Ghi chú |
|---|---|---|
| `tenants.trang_thai` mở rộng tập giá trị: `cho_duyet` \| `active` \| `khoa` \| `tu_choi` | U17 | Mặc định khi đăng ký = `cho_duyet`. Login khách **từ chối** nếu ≠ `active`. |
| `tenants.goi_dich_vu` chuẩn hóa giá trị: `free` (mặc định phát hành) | U17 | Gói Free = 01 MST, hỗ trợ Email + cộng đồng. Cột đã tồn tại. |
| Bảng **`dang_ky_cho_duyet`** (đăng ký thô trước khi thành tenant) HOẶC dùng thẳng `tenants.trang_thai='cho_duyet'` | U17 | **Quyết định thiết kế ở U17** — xem §U17. Ưu tiên: tạo tenant+user ở trạng thái `cho_duyet` ngay (đơn giản, ít bảng), thay vì bảng đệm riêng. |
| Vai **super-admin** — **KHÔNG** thêm vào enum `ROLES` 3-vai (giữ nguyên tắc "1 nguồn chân lý"), mà là **cơ chế danh tính riêng** (bảng `quan_tri_he_thong` + token riêng) | U18 | Super-admin đứng NGOÀI tenant ⇒ không thể là 1 giá trị trong `vai_tro` của `nguoi_dung` (vốn buộc `tenant_id`). |
| Migration RLS: chính sách cho super-admin đọc xuyên tenant **có kiểm soát** | U18 | Xem §U18 — không nới lỏng RLS toàn cục; dùng role DB riêng hoặc hàm SECURITY DEFINER bề mặt hẹp. |

**Khóa nguyên tắc (Hiến pháp):** mọi truy vấn dữ liệu tenant vẫn gắn `tenant_id`; RLS là lớp phòng thủ 2. Super-admin **không** được là một lỗ hổng nới toàn cục — nó phải đi qua **con đường riêng, hẹp, có audit từng thao tác** (`security.md`).

---

## 3. Ranh giới bảo mật cứng của lớp này

Lớp thương mại chạm vào phần nhạy cảm nhất (kiểm soát chủ, ranh giới khách). Các bất biến:

1. **Hai miền token tách biệt.** Token khách (JWT `tenant_id`+`role`, phát bởi `/auth/login`) và token admin (phát bởi `/admin/auth/login`) **không hoán đổi được**. Middleware admin **không bao giờ** chấp nhận token khách và ngược lại (khác `aud`/khác secret/khác đường xác minh). *Tách hoàn toàn ở tầng token, không chỉ tầng UI.*
2. **Super-admin không rò dữ liệu chéo cho khách.** Việc super-admin thấy mọi tenant KHÔNG được vô tình mở RLS cho token khách. Con đường xuyên-tenant chỉ mở cho danh tính admin đã xác minh.
3. **Login khách chặn ở cổng trạng thái.** Tenant `cho_duyet`/`khoa`/`tu_choi` → `/auth/login` trả lỗi gọn (không phân biệt lý do để tránh dò), audit login-fail. Chỉ `active` mới phát token.
4. **Đăng ký không phải là tấn công khuếch đại.** Rate-limit endpoint đăng ký công khai (Durable Object token-bucket đã có cho GDT — tái dùng pattern), chống spam tạo tenant. Lọc miền + chặn rác ở tầng validate.
5. **Không lộ bí mật.** Không log mật khẩu (khách hay admin), không log token; audit chỉ ghi hành động + đối tượng (`security.md`).
6. **Nguyên tắc bằng chứng.** Không phần nào của lớp này giả định hành vi hệ thống ngoài. Các quyết định thuần nội bộ (schema, RBAC) — kiểm bằng test. Không đụng GDT nên không có contract test GDT mới.

---

## 4. Bốn đơn vị — tóm tắt (chi tiết ở file plan riêng mỗi U)

### U17 — Backend: Đăng ký công khai + trạng thái duyệt + gói dịch vụ
Migration mở rộng `trang_thai` + chuẩn `goi_dich_vu='free'`; endpoint **`POST /dang-ky`** (công khai, có rate-limit) nhận `{email, tenTos, mst}`; **validate miền email** (allowlist gmail/yahoo/tên-miền-DN) + **chặn rác** (miền dùng-1-lần, alias `+`, MST hợp lệ 10/13 số); tạo `tenants(trang_thai='cho_duyet', goi_dich_vu='free')` + `nguoi_dung(vai_tro='quan_tri')` chờ đặt mật khẩu; audit. **Sửa `/auth/login`**: chặn tenant ≠ `active`. → *Chi tiết:* `docs/plans/U17-plan.md`.

### U18 — Backend: Admin API (super-admin toàn hệ thống)
Bảng `quan_tri_he_thong` (danh tính chủ, ngoài tenant) + **`POST /admin/auth/login`** phát **token admin riêng** (khác secret/aud). Middleware `requireSuperAdmin`. Con đường **đọc xuyên-tenant có kiểm soát** (role DB riêng BYPASSRLS hẹp HOẶC hàm SECURITY DEFINER liệt kê tenant — chốt ở U18). Endpoint: `GET /admin/tenants` (liệt kê + lọc trạng thái), `POST /admin/tenants/:id/duyet`, `.../khoa`, `.../mo-khoa`, `.../tu-choi`. Mọi thao tác **audit** (ai, khi nào, tenant nào). → *Chi tiết:* `docs/plans/U18-plan.md`.

### U19 — Frontend: Cổng Admin tách biệt + Quản lý thành viên (`adminvatengine.tourdao.vn`)
App admin riêng (`apps/admin`) trên **subdomain tách** — **login riêng, token riêng** (không lẫn với khách). **Quản lý thành viên đầy đủ:** danh sách tenant + lọc trạng thái + tìm MST/email, Duyệt/Khóa/Mở/Từ chối, **sửa metadata** (tên/email/gói, KHÔNG MST/hóa đơn), **reset mật khẩu** (gửi lại 6 số), **chi tiết tenant** (người dùng + lịch sử đồng bộ + trạng thái token, KHÔNG hóa đơn), xem audit. → *Chi tiết:* `docs/plans/U19-plan.md`.

### U20 — Frontend: Đăng ký khách + Settings pháp lý/thương hiệu + font 16→17px
Trang **Đăng ký** công khai (trước login) gọi `POST /dang-ky` + checkbox cam kết ủy quyền, hiển thị "chờ duyệt". Màn login khách gợi ý trạng thái chờ duyệt. **Trang Cài đặt chung** viết lại đầy đủ: VATEngine v1.0 + mục tiêu + chính sách sử dụng & bảo mật + **cam kết ủy quyền MST** + tác giả + **quyền lợi gói Free**. **Sửa gốc chữ nhỏ:** nâng `--fs-base: 17px` + `--fs-sm: 15px` + rà thay `--fs-sm`→`--fs-base` ở văn bản đọc. Buộc đổi mật khẩu lần đầu (`phai_doi_mat_khau`). → *Chi tiết:* `docs/plans/U20-plan.md`.

### U21 — Frontend: Dashboard giám sát toàn diện (trong Cổng Admin)
Trang mặc định sau đăng nhập Admin: **KPI** (tenant theo trạng thái, đăng ký mới) · **Sức khỏe** (API/egress GDT probe U13/circuit breaker) · **Cảnh báo** (token sắp/hết hạn, đồng bộ lỗi) · **Tăng trưởng** (biểu đồ đăng ký) · **Nhật ký** (audit gần đây). Tiêu thụ endpoint `GET /admin/stats/*` (thêm ở U18). **Số liệu rẻ** — không full-scan `hoa_don` (số nặng chờ bảng tổng hợp, đơn vị tương lai). → *Chi tiết:* `docs/plans/U21-plan.md`.

---

## 5. Nội dung Trang Cài đặt chung (chủ dự án cấp — Claude biên tập, chủ duyệt)

> Đưa vào U20. Văn phong: trang trọng, rõ ràng, đúng pháp lý; KHÔNG cam kết vượt thực tế.

**Về phần mềm**
> **VATEngine — phiên bản v1.0.** VATEngine là phần mềm giúp doanh nghiệp **trích xuất đầy đủ hóa đơn điện tử đầu vào (mua vào)** — và đầu ra — **trực tiếp từ tài khoản chính thức của doanh nghiệp trên Hệ thống Hóa đơn điện tử của Tổng cục Thuế**. Mục tiêu cao nhất: giúp doanh nghiệp tự chủ dữ liệu hóa đơn của mình, phục vụ đối chiếu – kê khai – tích hợp kế toán, mà không phụ thuộc phần mềm đắt tiền hay thao tác thủ công.
>
> **Phần mềm phục vụ miễn phí cho doanh nghiệp Việt Nam.**

**Chính sách sử dụng & cam kết bảo mật**
> Khi sử dụng VATEngine, người dùng cần tuân thủ **Chính sách sử dụng** và **Điều khoản bảo mật**. Đặc biệt, khi cung cấp **tài khoản để kết nối mã số thuế**, người dùng **cam kết mình được ủy quyền hợp pháp** sử dụng tài khoản đó.
>
> **Chúng tôi không lưu trữ thông tin đăng nhập của người dùng cũng như thông tin kết nối đã cung cấp**, và **không chịu trách nhiệm pháp lý** đối với các vấn đề khác có liên quan phát sinh ngoài phạm vi phần mềm.

**Tác giả phần mềm**
> **Công ty TNHH Tour Đảo**
> Địa chỉ: 19 đường B2, khu đô thị Vĩnh Điềm Trung, Phường Tây Nha Trang, Tỉnh Khánh Hòa.
> MST: **4201969169**

**Thông tin tài khoản (quyền lợi)**
> - **Gói dịch vụ:** Free
> - **Số mã số thuế được kết nối:** 01
> - **Hỗ trợ:** qua Email · Cộng đồng

*Lưu ý pháp lý (Claude đề xuất, chủ duyệt):* câu "không lưu trữ thông tin kết nối" phải **khớp thực tế kỹ thuật** — hệ thống hiện lưu **token GDT đã mã hóa** (U14) để đồng bộ nền, và **không lưu mật khẩu thuế thô** (Hiến pháp). Cần diễn đạt chính xác để không thành cam kết sai: gợi ý *"Chúng tôi không lưu mật khẩu tài khoản thuế của bạn; phiên kết nối được mã hóa và chỉ dùng để đồng bộ hóa đơn theo yêu cầu của bạn."* → **điểm cần chủ dự án xác nhận câu chữ ở U20** (Nguyên tắc bằng chứng: tuyên bố với người dùng phải khớp hành vi hệ thống thật).

---

## 6. Định nghĩa hoàn thành (cả cụm)

Mỗi U tuân DoD chuẩn (`CLAUDE.md`): test tự động phủ tiêu chí + **toàn bộ xanh**; `make lint` sạch; không giảm coverage dưới ngưỡng (≥80% tầng nghiệp vụ backend); không lộ bí mật; cập nhật tài liệu; commit nhỏ; **review chéo bằng subagent độc lập** (`security-reviewer` cho U17–U18 do chạm ranh giới bảo mật/tenant; review UI/RBAC cho U19–U20) trước khi coi xong. Cổng `Stop` hook ép lint+test.

**Kiểm chứng riêng lớp này (bắt buộc trong DoD từng U):**
- U17: test **cách ly** — đăng ký tenant A không tạo được dữ liệu chạm tenant B; test **lọc email** phủ ca hợp lệ/rác; test login chặn tenant chưa duyệt.
- U18: test **hai miền token không hoán đổi** (token khách bị admin từ chối & ngược lại); test super-admin thấy đa tenant nhưng **token khách vẫn KHÔNG** xuyên tenant; audit mọi thao tác.
- U19/U20: test guard route (khách không vào được `/admin`), test trạng thái UI (chờ duyệt/khóa), snapshot nội dung pháp lý, kiểm font-size token.

---

## 7. Rủi ro & điểm cần chủ dự án chốt tiếp (ghi để không "giả định thầm")

1. **Câu chữ pháp lý "không lưu thông tin kết nối"** vs thực tế lưu token mã hóa (U14) — **cần chủ dự án duyệt câu diễn đạt chính xác** (§5). Rủi ro pháp lý nếu tuyên bố sai.
2. **Cơ chế bỏ-qua-RLS cho super-admin** — hai lựa chọn (role DB BYPASSRLS hẹp vs hàm SECURITY DEFINER). Sẽ trình bày trade-off + chốt ở U18; không tự quyết trước.
3. **`apps/admin` app riêng vs route `/admin` trong `apps/web`** — cả hai đạt "tách hoàn toàn token"; app riêng an toàn hơn (bề mặt tách vật lý), route chung ít hạ tầng hơn. Chốt ở U19.
4. **Đặt mật khẩu lần đầu — ĐÃ CHỐT (2026-07-15):** Duyệt → hệ thống **tự sinh mật khẩu tạm 6 số** (nguồn mật mã) + **tự gửi email** cho khách + **buộc đổi mật khẩu lần đầu**. ⚠️ **Hạ tầng gửi email từ Cloudflare Workers là CHƯA KIỂM CHỨNG** — phải probe gửi thật + chốt provider (MailChannels/Resend/SendGrid) sau interface `EmailTransport` trước khi đưa vào kiến trúc (U18 §6). Mật khẩu 6 số phải kèm **hết hạn + buộc đổi + rate-limit login** (bù entropy thấp).
5. **Rate-limit đăng ký công khai** — tái dùng Durable Object token-bucket; ngưỡng cụ thể chốt ở U17.
6. **Miền dùng-1-lần** cập nhật động hay danh sách tĩnh nhúng — chốt ở U17 (đề xuất: danh sách tĩnh có thể mở rộng, không gọi dịch vụ ngoài lúc chạy).

## 8. Ghi chú thực thi (từ review chéo độc lập 2026-07-15)

Review đã xác nhận cụm plan tuân Hiến pháp, mọi tiền đề khớp mã thật. Hai lưu ý kỹ thuật khi hiện thực (nằm trong phạm vi, chỉ cần làm đúng):

- **Rate-limit đăng ký (U17):** Durable Object token-bucket hiện ở `apps/sync-worker` (`rateLimiter.ts`/`tenantLimiter.ts`), KHÔNG ở `apps/api`. Tái dùng cho `POST /dang-ky` = **đấu nối DO namespace làm binding mới cho `apps/api`**, không phải import trực tiếp. Tính công cho việc này.
- **INSERT tenant dưới RLS (U17):** `tenants` bật FORCE RLS keyed theo chính `id` ⇒ INSERT tenant mới dưới role app non-superuser **có thể bị chặn**. Bắt buộc kiểm con đường ghi bằng integration test với role production; nếu bị chặn, dùng hàm SECURITY DEFINER bề mặt hẹp `dang_ky_tenant(...)` (pattern `auth_lookup_user`). Không giả định INSERT chạy được.

---

*Các file plan chi tiết mỗi đơn vị: `U17-plan.md`, `U18-plan.md`, `U19-plan.md`, `U20-plan.md` (soạn kèm). Bắt đầu hiện thực bằng `/start-unit 17`.*

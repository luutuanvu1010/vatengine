# Nghiên cứu: Tích hợp đăng nhập Google & VNeID cho người dùng SaaS

> **Loại tài liệu:** Báo cáo nghiên cứu + đề xuất (KHÔNG phải plan đã chốt, CHƯA code).
> **Ngày:** 2026-07-21. **Người yêu cầu:** chủ dự án.
> **Phạm vi đã chốt với chủ dự án:** Google = đăng nhập nhanh; VNeID = xác minh danh tính (KYC); phục vụ **cả doanh nghiệp và cá nhân**.
> **Tuân thủ Hiến pháp — Nguyên tắc bằng chứng:** mọi khẳng định về hệ thống bên ngoài (đặc biệt VNeID) được gắn nhãn **[ĐÃ KIỂM CHỨNG]** hoặc **[CHƯA KIỂM CHỨNG]**. Trong phiên này công cụ tra web (WebSearch/web_fetch/trình duyệt) đều timeout, nên phần VNeID chủ yếu là **[CHƯA KIỂM CHỨNG]** — phải xác nhận nguồn chính thức trước khi chốt.

---

## 0. Tóm tắt cho người quyết định (đọc mục này là đủ)

VATCrawlbot **đã có sẵn** hệ thống đăng nhập người dùng nội bộ: email + mật khẩu (PBKDF2), phát hành JWT nội bộ (HS256), phiên bằng cookie HttpOnly, gắn `tenant_id` + `role` vào token. Google/VNeID **không thay thế** hệ thống này — chúng chỉ là **thêm cách để có được phiên đăng nhập đó**.

Hai công nghệ **khác nhau về bản chất và độ chín**, nên khuyến nghị **tách làm hai giai đoạn, không làm cùng lúc**:

| | **Google Sign-In** | **VNeID** |
|---|---|---|
| Vai trò | Đăng nhập nhanh (thay mật khẩu) | Xác minh danh tính thật (KYC) |
| Độ chín kỹ thuật | Chuẩn OIDC toàn cầu, ổn định, tài liệu công khai | Nền tảng định danh quốc gia, kết nối bên thứ ba **cần xin phép**, thủ tục pháp lý |
| Khả thi cắm vào Workers | **Cao** — vài trăm dòng, không phụ thuộc bên thứ ba | **Chưa xác định** — phụ thuộc điều kiện kết nối C06/nhà cung cấp |
| Chi phí | Gần như 0 (chỉ phí Google Cloud project, miễn phí ở mức này) | **Chưa rõ** — có thể qua trung gian eKYC có phí/giao dịch |
| Rào cản chính | Kỹ thuật (nhỏ) | **Pháp lý + thủ tục** (lớn) |
| **Khuyến nghị** | **Làm trước** (giai đoạn 1) | **Nghiên cứu khả thi riêng** (giai đoạn 2), chưa cam kết ngày |

**Kết luận nhanh:** nên triển khai **Google Sign-In trước** vì rẻ, nhanh, khả thi cao và phục vụ ngay nhu cầu "đăng nhập nhanh". **VNeID để giai đoạn sau**, và trước khi chốt phải làm **một đơn vị nghiên cứu khả thi** xác minh: (a) bên thứ ba tư nhân có được kết nối trực tiếp không, (b) nếu không thì đi qua nhà cung cấp eKYC được cấp phép nào, (c) chi phí thật.

---

## 1. Hiện trạng đăng nhập của dự án (ĐÃ KIỂM CHỨNG — đọc từ mã 2026-07-21)

Đây là bằng chứng đọc trực tiếp từ mã nguồn, không phải giả định:

- **`apps/api/src/routes/auth.ts`** — `POST /auth/login` nhận `{email, password}`, tra `auth_lookup_user(email)` (hàm SECURITY DEFINER vì `nguoi_dung` bật FORCE RLS), so mật khẩu bằng `verifyPassword` (PBKDF2), rồi phát hành JWT.
- **`apps/api/src/auth.ts`** — `signToken({tenantId, role, sub}, JWT_SECRET)` ký HS256, claim `exp` = 8 giờ (`TOKEN_TTL_SEC`). Middleware `requireTenant` đọc cookie `vat_session` (hoặc `Authorization: Bearer`) → verify → set `tenantId`/`role` vào context.
- **`apps/api/src/session.ts`** — cookie HttpOnly, `SameSite=Strict`, `Secure` khi HTTPS, `Max-Age` khớp TTL. Có middleware `requireSameOrigin` chống CSRF.
- **`packages/db/src/schema/nguoiDung.ts`** — bảng `nguoi_dung`: `id, tenant_id, email (UNIQUE toàn cục theo lower(email)), password_hash (nullable), vai_tro`. Mỗi user thuộc đúng **một** tenant.
- **`apps/api/src/routes/dangKy.ts`** — đăng ký công khai tạo tenant `cho_duyet`, user vai `quan_tri`, `password_hash` để NULL (đặt mật khẩu ở luồng sau). Chỉ tenant `active` mới đăng nhập được (cổng trạng thái ở `auth.ts`).

**Hệ quả quan trọng cho thiết kế:** hệ thống đã có "hình dạng" chuẩn để cắm đăng nhập liên kết (federated login). Cả Google lẫn VNeID chỉ cần, sau khi xác thực xong ở nhà cung cấp, **tìm/tạo `nguoi_dung` tương ứng rồi gọi đúng `signToken` + `setSessionCookie` hiện có**. Không phải xây lại tầng phiên.

---

## 2. Google Sign-In (OAuth 2.0 / OpenID Connect)

### 2.1. Cơ chế (ĐÃ KIỂM CHỨNG — chuẩn OIDC ổn định)

Luồng chuẩn **Authorization Code Flow**:

1. Người dùng bấm "Đăng nhập với Google" → app chuyển hướng tới `accounts.google.com/o/oauth2/v2/auth` kèm `client_id`, `redirect_uri`, `scope=openid email profile`, `state` (chống CSRF), `nonce`.
2. Người dùng đồng ý → Google chuyển về `redirect_uri` kèm `code`.
3. Backend (Worker) đổi `code` lấy `id_token` (JWT) tại `oauth2.googleapis.com/token`.
4. Backend **xác minh chữ ký** `id_token` bằng khóa công khai Google (JWKS tại `www.googleapis.com/oauth2/v3/certs`), kiểm `iss`, `aud`, `exp`, `nonce`.
5. Lấy `email` (đã xác thực) + `sub` (ID Google ổn định) từ token → tìm/tạo `nguoi_dung` → phát hành phiên nội bộ.

### 2.2. Khả thi trên Cloudflare Workers (ĐÃ KIỂM CHỨNG về mặt năng lực nền tảng)

Rất phù hợp. Workers có sẵn `fetch()` (đổi code lấy token) và `crypto.subtle` (verify JWT RS256 — chính là thứ `packages/gdt-client` và `password.ts` đã dùng). **Không cần thư viện nặng, không phụ thuộc dịch vụ ngoài.** Ước lượng vài trăm dòng cho toàn bộ luồng + test.

Điểm tích hợp cụ thể vào mã hiện có:
- Thêm 2 route: `GET /auth/google` (tạo `state`+`nonce`, lưu tạm KV/cookie ngắn hạn, chuyển hướng) và `GET /auth/google/callback` (đổi code, verify, tìm/tạo user, `setSessionCookie`).
- Tận dụng nguyên `signToken` + `session.ts` hiện có → phiên sau đăng nhập Google **giống hệt** phiên email/mật khẩu, mọi middleware RLS/RBAC không đổi.

### 2.3. Chi phí (ĐÃ KIỂM CHỨNG ở mức nguyên tắc; con số cần soát lại khi làm)

Tạo OAuth Client trong Google Cloud Console **miễn phí**. Không có phí theo số lần đăng nhập cho OIDC cơ bản. Chi phí thực tế ≈ 0 ở quy mô dự án.

### 2.4. Vấn đề multi-tenant CẦN QUYẾT ĐỊNH (đây là điểm mấu chốt, không phải kỹ thuật thuần)

Email Google là **toàn cục**, còn `nguoi_dung.email` UNIQUE toàn cục và mỗi user thuộc **một** tenant. Ba câu hỏi phải chốt trước khi code:

1. **Đăng nhập Google chỉ dành cho user ĐÃ tồn tại, hay tạo mới tự động?**
   Khuyến nghị: **chỉ liên kết user đã tồn tại** (email Google phải khớp một `nguoi_dung` đã được admin duyệt). Tạo tenant mới tự động qua Google sẽ phá vỡ cổng duyệt `cho_duyet` (U17) và mở đường lạm dụng.
2. **Một email Google thuộc nhiều tenant thì sao?** Hiện schema không cho (email UNIQUE toàn cục) → không phải xử lý ngay, nhưng cần ghi nhận là giới hạn.
3. **Bắt buộc email Google đã xác thực (`email_verified=true`)** trước khi liên kết — nếu không, kẻ xấu có thể mượn email chưa xác thực.

### 2.5. Rủi ro bảo mật đã lường

`state` chống CSRF (bắt buộc), `nonce` chống replay, verify chữ ký + `aud` (chống token của app khác), chỉ nhận `email_verified`. Tất cả nằm trong tầm xử lý của mã hiện tại (đã có văn hoá chống CSRF/timing trong `auth.ts`/`session.ts`).

---

## 3. VNeID — Xác minh danh tính

> **CẢNH BÁO BẰNG CHỨNG:** phần này KHÔNG xác minh được nguồn web trong phiên (công cụ tra cứu timeout). Nội dung dưới đây phản ánh hiểu biết tới ~5/2025 và **được gắn nhãn [CHƯA KIỂM CHỨNG] ở mọi điểm chưa có nguồn chính thức tái lập được**. **Không dùng làm tiền đề chốt kiến trúc/ADR/hợp đồng cho tới khi kiểm chứng.**

### 3.1. VNeID là gì

VNeID là ứng dụng định danh điện tử quốc gia do Bộ Công an (Cục C06) phát triển, gắn với Cơ sở dữ liệu quốc gia về dân cư. Nó cung cấp **tài khoản định danh điện tử** mức 1/mức 2 cho công dân. **[ĐÃ KIỂM CHỨNG ở mức phổ thông — đây là kiến thức nền công khai, ổn định.]**

### 3.2. Khung pháp lý liên quan (CẦN XÁC MINH NGUỒN)

- **Nghị định 69/2024/NĐ-CP** về định danh và xác thực điện tử. **[CHƯA KIỂM CHỨNG chi tiết điều khoản trong phiên này]** — cần đọc bản chính thức để biết điều kiện nào cho phép "tổ chức" khai thác dịch vụ xác thực điện tử.
- **Nghị định 13/2023/NĐ-CP** (bảo vệ dữ liệu cá nhân) — dự án đã ràng buộc tuân thủ (xem `CLAUDE.md`). VNeID chạm dữ liệu định danh nhạy cảm nên NĐ13 áp dụng chặt.

### 3.3. Câu hỏi cốt lõi CHƯA CÓ CÂU TRẢ LỜI ĐÃ KIỂM CHỨNG

Đây là những điều **phải xác minh nguồn chính thức** trước khi cân nhắc triển khai:

1. **[CHƯA KIỂM CHỨNG]** Một SaaS **tư nhân** như VATCrawlbot có được kết nối trực tiếp API VNeID để xác thực danh tính người dùng không, hay chỉ cơ quan nhà nước / tổ chức được cấp phép mới được?
2. **[CHƯA KIỂM CHỨNG]** Nếu được, quy trình đăng ký kết nối (với C06 / Trung tâm dữ liệu quốc gia về dân cư / đơn vị vận hành) gồm những gì, mất bao lâu, điều kiện hạ tầng/bảo mật nào?
3. **[CHƯA KIỂM CHỨNG]** Có SDK/OIDC công khai không, hay bắt buộc qua **nhà cung cấp trung gian được cấp phép** (các nhà mạng/đơn vị eKYC)?
4. **[CHƯA KIỂM CHỨNG]** Chi phí: miễn phí, thu phí theo giao dịch xác thực, hay phí thiết lập?
5. **[CHƯA KIỂM CHỨNG]** Egress: API VNeID có chặn địa lý với Cloudflare Workers không (giống rủi ro GDT trong ADR-0001)? Nếu có, cần relay VN.

### 3.4. Phương án thay thế nếu VNeID trực tiếp không khả thi (CẦN KIỂM CHỨNG)

**[CHƯA KIỂM CHỨNG]** Trên thị trường VN có các dịch vụ **eKYC/định danh** của nhà cung cấp tư nhân (ví dụ nhóm VNPT, FPT và các đơn vị eKYC khác) thường **đã được cấp phép kết nối** với cơ sở dữ liệu dân cư và bán lại dưới dạng API/SDK. Đây có thể là con đường thực tế hơn để "xác minh danh tính" mà không phải tự xin kết nối trực tiếp C06. **Cần khảo sát cụ thể: nhà cung cấp nào, có OIDC/API sạch không, giá, điều khoản dữ liệu (NĐ13).**

### 3.5. Vai trò thực tế của VNeID trong sản phẩm (đề xuất định hướng)

Vì người dùng VATCrawlbot **đã phải có tài khoản MST thuế hợp pháp** để dùng phần mềm, mức độ "cần KYC bằng VNeID" nên được cân nhắc: MST bản thân nó đã là một mức định danh doanh nghiệp. VNeID hợp lý nhất ở vai trò **tăng độ tin cậy pháp lý cho bước ủy quyền truy xuất hóa đơn** (gắn hành vi ủy quyền với một cá nhân định danh thật) — chứ chưa chắc cần cho mọi lần đăng nhập. Đây là **quyết định sản phẩm**, nên chốt trước khi bỏ công tích hợp.

---

## 4. Đề xuất lộ trình

### Giai đoạn 1 — Google Sign-In (khả thi cao, làm trước)
Một đơn vị U mới (ví dụ **U32 — Đăng nhập liên kết Google**), phụ thuộc kiến trúc auth hiện có. Trước khi code, chốt 3 câu hỏi multi-tenant ở §2.4. Rủi ro thấp, giá trị tức thì.

### Giai đoạn 2 — Nghiên cứu khả thi VNeID (nghiên cứu trước, cam kết sau)
Một đơn vị **nghiên cứu khả thi riêng** (không phải đơn vị hiện thực) để trả lời dứt điểm 5 câu hỏi ở §3.3 bằng **nguồn chính thức tái lập được** (văn bản pháp luật, cổng đăng ký kết nối, báo giá nhà cung cấp). Chỉ sau khi có bằng chứng mới quyết định: (a) kết nối trực tiếp, (b) qua nhà cung cấp eKYC, hay (c) tạm hoãn.

### Việc cần chủ dự án quyết trước khi tôi làm tiếp
1. Google chỉ liên kết user đã duyệt, hay cho tạo mới? (§2.4)
2. VNeID dùng cho **mọi lần đăng nhập** hay chỉ cho **bước ủy quyền hóa đơn**? (§3.5)
3. Có muốn tôi chạy đơn vị nghiên cứu khả thi VNeID (tra cứu nguồn chính thức, cần công cụ web hoạt động) không?

---

## 5. Giới hạn của báo cáo này (minh bạch)

- Phần Google OIDC: dựa trên chuẩn công khai ổn định — độ tin cậy cao.
- Phần VNeID: **KHÔNG xác minh được nguồn web trong phiên** (công cụ tra cứu timeout). Mọi điểm về điều kiện kết nối, chi phí, nhà cung cấp đều **[CHƯA KIỂM CHỨNG]** và có thể đã thay đổi. Đúng tinh thần Hiến pháp: thà nói "chưa biết" còn hơn khẳng định tự tin sai.
- Phần hiện trạng mã dự án: **[ĐÃ KIỂM CHỨNG]** đọc trực tiếp từ mã 2026-07-21.

# Kế hoạch U8 — Auth người dùng nội bộ + RBAC + đa tenant

> Trạng thái: **ĐÃ THỰC THI ✅** (`make lint && make test` xanh; review `security-reviewer` PASS + 1 Medium đã sửa, `dod-auditor` PASS). Xem tóm tắt nghiệm thu ở `docs/CHECKLIST-NGHIEM-THU.md` mục U8.
> Nguồn: `TRIEN_KHAI_BANG_CLAUDE_CODE.md` dòng 106 (U8); `KIEN_TRUC_VA_KE_HOACH.md` mục 5 (Auth & RBAC),
> 7 (mô hình dữ liệu `NguoiDung`), 6.2 (kiểm soát truy cập); `.claude/rules/multi-tenant.md`, `security.md`, `testing.md`.
> Xây trên seam `requireTenant` của U6/U7 (`apps/api/src/auth.ts` — hiện chỉ *verify* JWT nội bộ + trích `tenant_id`).

## Quyết định phạm vi (chủ dự án, 2026-07-14)

- **#1 Cơ chế login = email + mật khẩu (PBKDF2 qua WebCrypto).** Thêm cột băm mật khẩu vào `nguoi_dung`; `POST /auth/login`
  băm bằng WebCrypto PBKDF2 (tương thích workerd — **KHÔNG** dùng Node `bcrypt`). Đây là mật khẩu người dùng **SaaS nội bộ**,
  hoàn toàn tách khỏi mật khẩu tài khoản thuế (`security.md` chỉ cấm lưu **mật khẩu thuế thô** — không cấm auth người dùng SaaS).
- **#2 RBAC = 3 vai theo kiến trúc:** `ke_toan` (kế toán), `ke_toan_truong` (kế toán trưởng), `quan_tri` (quản trị) — khớp mục 5 KIEN_TRUC.
- **#3 Role nằm trong claim JWT** (đọc từ token, không truy DB mỗi request → giữ tầng ứng dụng phi trạng thái). Đổi quyền ⇒ phát lại token.

## Phạm vi

Mở rộng seam xác thực U6/U7 thành hệ auth người dùng nội bộ đầy đủ: **phát hành JWT nội bộ** (email+mật khẩu) và
**RBAC theo vai** trên các route hiện có, giữ nguyên cách ly hai lớp (lọc `tenant_id` tường minh + RLS).

**NGOÀI phạm vi:** đăng nhập *tài khoản thuế* (GDT Adapter U1); mã hóa envelope token thuế + audit log runtime đầy đủ +
rate limit client (U12); đồng bộ nền (U9); UI/frontend đăng nhập; quản lý gói dịch vụ/billing (Giai đoạn 4);
tự phục vụ đăng ký/CRUD người dùng (seed người dùng qua migration/script cho U8 — CRUD quản trị là đơn vị sau).
Không đụng `packages/gdt-client`.

## File sẽ tạo/sửa

| File | Thay đổi |
|---|---|
| `packages/db/src/schema/nguoiDung.ts` | Thêm cột `password_hash` (text, nullable để backfill an toàn); chuẩn hóa mặc định `vai_tro` → enum 3 vai (`ke_toan`\|`ke_toan_truong`\|`quan_tri`). |
| `packages/db/migrations/000X_*.sql` | Migration thêm cột + đổi default `vai_tro`. Sinh bằng `drizzle-kit generate`. |
| `apps/api/src/auth.ts` | Tách: giữ `requireTenant`; thêm `signToken(payload)` (phát hành), `requireRole(...roles)` (RBAC → 403), helper băm/so khớp PBKDF2. `requireTenant` trích thêm `role` từ claim. |
| `apps/api/src/routes/auth.ts` | **Mới:** `POST /auth/login` (email+mật khẩu → JWT). Miễn `requireTenant`. |
| `apps/api/src/app.ts` | Mount `app.route("/auth", authRoutes(deps))` (ngoài `requireTenant`, giống `/health`). |
| `apps/api/src/routes/invoices.ts` | Gắn `requireRole` theo ma trận (đọc = cả 3 vai). |
| `apps/api/src/routes/exports.ts` | Gắn `requireRole("ke_toan_truong","quan_tri")` cho `POST /exports` + `GET /exports/:id`. |
| `apps/api/src/types.ts` | Thêm `role` vào `Variables`. (JWT_SECRET đã có; PBKDF2 dùng WebCrypto — không cần binding mới.) |

## Ma trận quyền (RBAC)

| Route | `ke_toan` | `ke_toan_truong` | `quan_tri` |
|---|:---:|:---:|:---:|
| `GET /invoices`, `/invoices/summary`, `/invoices/:id` | ✅ | ✅ | ✅ |
| `POST /exports`, `GET /exports/:id` | ❌ 403 | ✅ | ✅ |
| (route quản trị — đơn vị sau) | ❌ | ❌ | ✅ |

## Test viết trước (TDD)

**`unit` (`apps/api/test/unit/`):**
- `auth.test.ts` (mở rộng): `signToken` phát hành token verify được, mang `tenant_id`+`role`; token thiếu `role` → 401; sai chữ ký/hết hạn → 401.
- `rbac.test.ts` (mới): `requireRole` cho qua đúng vai; sai vai → **403** (phân biệt 401 thiếu token); role lạ → 403.
- `password.test.ts` (mới): PBKDF2 hash rồi verify khớp; sai mật khẩu không khớp; hash khác nhau giữa hai lần (salt ngẫu nhiên).

**`integration` (`apps/api/test/integration/`, PGlite tiêm):**
- `auth.route.test.ts` (mới): seed người dùng → `POST /auth/login` đúng → 200 + token; sai mật khẩu/email → 401 gọn (không rò lý do); thiếu field → 400; token nhận được gọi `/invoices` thành công.
- `rbac.route.test.ts` (mới): token vai `ke_toan` → `POST /exports` **403**; token `ke_toan_truong` → thành công.
- **Cách ly tenant (tiêu chí cốt lõi):** 2 tenant + người dùng mỗi bên; token tenant A **không** đọc dữ liệu tenant B qua `/invoices` và `/exports` (rỗng/404), **kể cả khi vai của A = `quan_tri`** (admin không vượt tenant — `multi-tenant.md` §19).

**`db` unit (`packages/db/test/unit/schema.test.ts`):** cột `password_hash` + default `vai_tro` hợp lệ.

## Tiêu chí nghiệm thu (đo được)

1. `POST /auth/login` phát hành JWT nội bộ HS256 verify được bằng `JWT_SECRET`, mang `tenant_id`+`role`; mật khẩu băm/so khớp PBKDF2.
2. Route gate theo vai: thiếu token → 401; đúng token sai quyền → 403; đúng vai → 2xx.
3. Test cách ly 2 tenant xanh qua route API (gồm vai `quan_tri`) — không rò dữ liệu chéo.
4. `make lint && make test` xanh; coverage tầng nghiệp vụ ≥ 80% (giữ mức ~100% dòng của `apps/api`).

## Ràng buộc bắt buộc chạm tới

- **`tenant_id`/RLS (`multi-tenant.md`):** token gắn đúng một `tenant_id`; `quan_tri` của A **không** vượt sang B. RBAC **không** thay cách ly tenant — giữ `withTenant` + lọc `tenant_id` tường minh.
- **401 vs 403:** thiếu/sai token = 401 (authn); đúng token sai quyền = 403 (authz). Không rò lý do login sai.
- **Bí mật (`security.md`):** JWT ký bằng Workers Secret `JWT_SECRET`; **không** log token/mật khẩu; mật khẩu SaaS băm PBKDF2 + salt (không lưu thô); không liên quan mật khẩu thuế.
- Không đụng captcha/GDT.

## Rủi ro & phụ thuộc

- **PBKDF2 trên workerd:** dùng WebCrypto (`crypto.subtle.deriveBits`) — cân nhắc spike nhỏ như `spikes/xlsx-workers` (U7) nếu nghi ngờ tương thích. Chọn số vòng lặp hợp lý (ví dụ ≥100k) — cân bằng CPU Worker (trần 5').
- **Migration `nguoi_dung`:** `password_hash` nullable để backfill an toàn (hiện chưa có dữ liệu thật); seed người dùng test qua helper, không commit mật khẩu.
- **Wiring Hyperdrive/Postgres thật** vẫn CHƯA kiểm chứng (nợ U6, checklist dòng 159) — test đi PGlite tiêm.
- **Thay đổi quyền cần phát lại token** (hệ quả của quyết định #3 role-in-claim) — chấp nhận cho U8; nếu sau cần thu hồi tức thì, chuyển sang tra DB (đơn vị sau).

## Không có điểm mơ hồ còn treo

Ba quyết định phạm vi (login, tập vai, nguồn role) đã được chủ dự án chốt 2026-07-14. Không phải đoán cấu trúc phản hồi API thuế (U8 không gọi GDT).

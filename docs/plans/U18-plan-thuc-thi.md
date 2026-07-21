# U18 — Kế hoạch thực thi (đối chiếu schema thật sau U17b)

> Nguồn: `docs/plans/U18-plan.md` (spec gốc, lập **trước** U17a/U17b). File này **không thay thế** spec gốc — nó ghi lại kết quả **đối chiếu với schema đang chạy production** và chốt các điểm spec gốc đã lỗi thời.
>
> Nhánh: `feat/u18-admin-api`, cắt từ `origin/feat/cloudflare-stack-u0` @ `9e91a53`.
> Ngày lập: 2026-07-21.
>
> Luật áp dụng: `security.md`, `multi-tenant.md` (U18 là **ngoại lệ xuyên-tenant duy nhất** — phải chứng minh không phá cách ly cho token khách), `testing.md`. **KHÔNG** đụng GDT.

---

## 0. Đối chiếu spec gốc ↔ schema thật — 5 điểm lệch

Kiểm chứng bằng đọc trực tiếp `packages/db/src/schema/*.ts` + `packages/db/migrations/*.sql` trên `9e91a53`, không suy đoán.

| # | Spec gốc nói | Thực tế đo được | Xử lý ở U18 |
|---|---|---|---|
| **D1** | Migration `0005_super_admin.sql` | `0005` đã bị chiếm (`0005_real_wendell_vaughn.sql`); mới nhất là `0010_email_khong_phan_biet_hoa_thuong.sql` | Đơn vị mới = **`0011_super_admin.sql`** |
| **D2** | Audit qua `auditLog` | Bảng **`audit_log_admin` ĐÃ TỒN TẠI** (U17a, migration 0007). `auditLogAdmin.ts` ghi rõ: *"U17a chỉ TẠO bảng. Đường ghi vào nó là U18."* RLS ENABLE+FORCE, **đúng một policy `FOR INSERT WITH CHECK(true)`**, GRANT hẹp còn đúng `INSERT`, trigger append-only chặn UPDATE/DELETE/TRUNCATE kể cả owner | Ghi vào **`audit_log_admin`** (KHÔNG phải `audit_log` — bảng đó có `tenant_id NOT NULL` + FK cascade, không có chỗ hợp lệ cho hành động xuyên-tenant). U18 **mở đường ĐỌC** như comment đã hẹn |
| **D3** | `nguoi_dung.phai_doi_mat_khau` "cột mới (migration U18 hoặc gộp U17)" | U17-plan §123 và U-PLUS-prompt-U17 §50 đều **hẹn đặt sẵn ở U17** — nhưng `nguoiDung.ts` **KHÔNG có cột này**, và không có tham chiếu nào trong `apps/**`/`packages/**`. U17 đã bỏ | **U18 phải tự thêm** cột trong `0011` |
| **D4** | `tenants.trang_thai` có `CHECK` enum | `tenants.ts` là `text().notNull().default("active")` — **không CHECK**. Tập hợp lệ chỉ được ép ở tầng ứng dụng (`routes/auth.ts:60` comment + cổng `!== "active"`) | State machine U18 ép ở **tầng ứng dụng + test**, không thêm CHECK (khớp tiền lệ `0004`: *"cột text không CHECK — không khoá cứng enum"*) |
| **D5** | Token khách/admin tách bằng `aud` | Token khách hiện **KHÔNG có claim `aud`** (`auth.ts` `signToken` phát đúng `tenant_id`/`role`/`sub`/`exp`) | Vẫn thêm `aud:"admin"` cho token admin (phòng thủ tầng 2). Tách **chính** vẫn là secret riêng. Bổ sung: khẳng định `ADMIN_JWT_SECRET !== JWT_SECRET`, fail-closed — xem §5 R3 |

**Bất biến đã có sẵn, U18 không được phá:** token khách không mang `tenant_id` hợp lệ → `requireTenant` từ chối (`auth.ts` `isUuid` gate). Token admin **không có** `tenant_id` ⇒ dù hai secret có bị đặt trùng do nhầm lẫn cấu hình, token admin vẫn **không** lọt qua `requireTenant`. Chiều ngược lại do `aud` gác.

---

## 1. Phạm vi

Dựng danh tính **super-admin đứng ngoài trục tenant** + con đường **đọc/ghi xuyên-tenant có kiểm soát**, đủ để chủ phần mềm duyệt/khóa/mở/từ chối tenant. Đóng đúng vấn đề đang kẹt: **tenant tự đăng ký (U17b, đã live) nằm ở `cho_duyet` mà không ai duyệt được.**

**Trong phạm vi:** bảng `quan_tri_he_thong`; `POST /admin/auth/login` + token admin secret riêng; middleware `requireSuperAdmin`; 6 hàm `SECURITY DEFINER` xuyên-tenant hẹp; endpoint quản trị tenant (liệt kê/chi tiết/duyệt/từ chối/khóa/mở/PATCH metadata/reset mật khẩu); `GET /admin/audit`; cột `phai_doi_mat_khau` + `POST /auth/doi-mat-khau`; script seed super-admin.

**NGOÀI phạm vi:** UI Cổng Admin (**U19**); hạ tầng gửi email (**U24** — xem §6 QĐ-1); dashboard giám sát (**U21**); quản lý gói trả phí; **đọc/sửa hóa đơn của khách** (ranh giới pháp lý cứng — chủ chỉ quản trị vòng đời tài khoản, v1.0).

---

## 2. File sẽ tạo/sửa

```
packages/db/
├── migrations/0011_super_admin.sql            (MỚI) bảng quan_tri_he_thong + 6 hàm admin_*
│                                                     + cột nguoi_dung.phai_doi_mat_khau
│                                                     + policy đọc audit_log_admin
├── migrations/meta/_journal.json + snapshot    (SỬA) Drizzle
└── src/schema/quanTriHeThong.ts                (MỚI) + export ở index.ts (SỬA)
                                                       + nguoiDung.ts (SỬA — cột mới)

apps/api/src/
├── admin/adminAuth.ts                          (MỚI) signAdminToken / TTL 2h / aud="admin"
├── admin/requireSuperAdmin.ts                  (MỚI) middleware
├── admin/tenantStateMachine.ts                 (MỚI) logic thuần, không I/O — dễ test unit
├── admin/auditAdmin.ts                         (MỚI) ghi audit_log_admin qua maskSensitive
├── routes/admin/auth.ts                        (MỚI)
├── routes/admin/tenants.ts                     (MỚI)
├── routes/admin/audit.ts                       (MỚI)
├── routes/auth.ts                              (SỬA) + POST /auth/doi-mat-khau; login trả
│                                                      cờ phai_doi_mat_khau
├── types.ts                                    (SỬA) Env += ADMIN_JWT_SECRET; AdminEnv mới
└── app.ts                                      (SỬA) mount /admin/*

apps/api/test/
├── unit/tenantStateMachine.test.ts             (MỚI)
├── unit/adminTokenIsolation.test.ts            (MỚI)
├── integration/admin.auth.test.ts              (MỚI)
├── integration/admin.tenants.test.ts           (MỚI)
├── integration/admin.cachLy.test.ts            (MỚI) ← bất biến cách ly, điều kiện xong
└── integration/auth.doiMatKhau.test.ts         (MỚI)

scripts/seed-super-admin.ts                     (MỚI)
.dev.vars.example                               (SỬA) ADMIN_JWT_SECRET
apps/api/wrangler.jsonc                         (SỬA) khai báo secret (không giá trị)
```

---

## 3. Con đường xuyên-tenant — **Phương án A** (chốt 2026-07-21, chủ dự án)

Mỗi thao tác admin = **một hàm `SECURITY DEFINER` bề mặt hẹp**, owner là role `NOLOGIN BYPASSRLS` riêng — lặp đúng nghi thức `auth_lookup_user` ở `0001`/`0009`.

```
admin_lookup(email)                     → id, email, password_hash, trang_thai
admin_liet_ke_tenant(trang_thai, q, limit, offset)
admin_chi_tiet_tenant(id)
admin_doi_trang_thai_tenant(id, tu, den)   -- ép state machine TRONG SQL: WHERE trang_thai = tu
admin_sua_metadata_tenant(id, ten, email, goi)
admin_doc_audit(limit, offset)          -- đường ĐỌC audit_log_admin mà 0007 hẹn để dành U18
```

**Vì sao A:** bề mặt hẹp, mỗi hàm là một "cửa" review được; khớp pattern đã có; không cấp role rộng cho app. Phương án B (role `BYPASSRLS` + connection riêng) bị loại: mọi bug ở route admin sẽ thành lỗ rò toàn cục.

**⚠️ Nghi thức bắt buộc, sao chép từ `0009` — bài học đã có sự cố thật:** `DROP FUNCTION` xoá sạch mọi `GRANT EXECUTE`, kể cả grant cho `vat_app` được cấp **ngoài** lịch sử migration (`packages/db/provisioning/app-role.sql`, chạy tay lúc provision). `0009` đã làm hỏng toàn bộ login production vì điều này. Mỗi hàm mới trong `0011` phải đủ 7 bước: `GRANT <owner> TO CURRENT_USER` → `CREATE FUNCTION` → `GRANT CREATE ON SCHEMA` + `ALTER OWNER` + `REVOKE CREATE` → `GRANT SELECT` bảng cần JOIN (BYPASSRLS **không** thay quyền BẢNG) → `REVOKE ALL FROM PUBLIC` → `SET ROLE` + `GRANT EXECUTE TO vat_app` (guard `IF EXISTS pg_roles`, nhánh `ELSE` `RAISE WARNING` — tên role app khác nhau theo môi trường) → `REVOKE <owner> FROM CURRENT_USER`.

**State machine — ép ở SQL, không chỉ ở TS:**
```
cho_duyet ──duyet──▶ active ──khoa──▶ khoa ──mo-khoa──▶ active
    └────tu-choi───▶ tu_choi
```
`admin_doi_trang_thai_tenant` mang `WHERE trang_thai = tu` ⇒ chuyển sai không cập nhật hàng nào → route trả **409**. Kiểm ở hai tầng, không tin một tầng.

---

## 4. Test viết trước (TDD)

**`unit`**
1. `tenantStateMachine` — mọi cặp (từ, tới) trong **toàn bộ 16 ô** (4 hành động × 4 trạng thái). *(Đính chính khi hiện thực: bản kế hoạch viết "6 chuyển hợp lệ" là SAI — đếm lại từ sơ đồ §3 chỉ có **4**: `cho_duyet→active`, `cho_duyet→tu_choi`, `active→khoa`, `khoa→active`. Test khẳng định đúng con số 4 để một đường chuyển thứ năm không lọt vào im lặng.)*
2. Token khách verify bằng `ADMIN_JWT_SECRET` → **fail**; token admin verify bằng `JWT_SECRET` → **fail**.
3. Token admin **không có** `tenant_id` ⇒ kể cả khi ép hai secret bằng nhau, `requireTenant` vẫn 401.
4. Mật khẩu tạm 6 số sinh từ `crypto.getRandomValues`, phân phối đều 000000–999999, **không** `Math.random`.

**`integration`** (Hono + PGlite, chạy dưới role production-like)
5. `POST /admin/auth/login` đúng → token có `aud:"admin"`, TTL 2h. Sai → 401 gọn (không phân biệt email sai / mật khẩu sai).
6. `requireSuperAdmin`: token khách → 401; thiếu token → 401; token admin hợp lệ → qua.
7. `GET /admin/tenants` với token admin thấy **≥2 tenant** (xuyên tenant thật sự).
8. **🔴 BẤT BIẾN CÁCH LY (điều kiện xong bắt buộc):** dựng 2 tenant có hóa đơn. Sau khi `0011` đã mở con đường admin, token **khách** của tenant A gọi `/invoices`, `/exports`, `/me` → **vẫn chỉ thấy dữ liệu A**. Ca này là lý do tồn tại của cả bộ test U18.
9. Duyệt: `cho_duyet` → `active`, sau đó khách **login được** (nối U17b `auth.trangThai.test.ts`). Khóa → login **401 ngay**. Mở → login lại được.
10. Chuyển sai (`active` → duyet, `tu_choi` → khoa, …) → **409**, DB không đổi.
11. `PATCH /admin/tenants/:id` sửa được `ten`/email/`goi_dich_vu`; gửi `mst` → **400**, MST trong DB **không đổi**.
12. Mọi thao tác ghi đúng 1 hàng `audit_log_admin` (ai / hành động / tenant đích / cũ→mới). **Không** hàng nào chứa mật khẩu tạm hay `password_hash`.
13. `GET /admin/tenants/:id` trả trạng thái token GDT dạng `{con_han|sap_het|het_han, token_het_han}` — **assert phản hồi không chứa token thô** (suy từ `token_het_han` đã lưu ở U14).
14. `POST /auth/doi-mat-khau` tắt cờ `phai_doi_mat_khau`; mật khẩu tạm cũ sau đó **không** login được.
15. Mật khẩu tạm quá 72h → login **401** dù gõ đúng.
16. **QĐ-1 — mật khẩu tạm trả một lần:** `POST …/duyet` trả `{mat_khau_tam}` trong body; `GET /admin/tenants/:id` **sau đó không bao giờ** trả lại nó; `audit_log_admin` ghi hành động nhưng `chi_tiet` **không chứa** giá trị mật khẩu (assert theo chuỗi thật, không chỉ theo tên khoá).
17. `POST …/reset-mat-khau` sinh mật khẩu tạm **mới**, vô hiệu cái cũ, đặt lại `phai_doi_mat_khau=true`.

---

## 5. Ràng buộc bắt buộc chạm tới

- **R1 — Cách ly tenant (`multi-tenant.md`):** U18 là ngoại lệ xuyên-tenant **duy nhất** của dự án. Ngoại lệ chỉ mở **sau** `requireSuperAdmin`, qua **hàm hẹp**, không qua role rộng. Test #8 là bằng chứng.
- **R2 — Không lưu/không rò bí mật (`security.md`):** không log mật khẩu tạm, `password_hash`, token GDT. Audit đi qua `maskSensitive` (`@vat/crypto`). `GET /admin/tenants/:id` **không bao giờ** trả token thuế.
- **R3 — Bí mật không hardcode:** `ADMIN_JWT_SECRET` qua `wrangler secret put`, khai báo ở `.dev.vars.example`. **Fail-closed khi khởi tạo:** nếu `ADMIN_JWT_SECRET` trống **hoặc bằng `JWT_SECRET`** → mọi route `/admin/*` trả 503, có test. Đây là lớp chặn cấu hình sai, không phải lý thuyết.
- **R4 — Audit append-only:** `audit_log_admin` có trigger chặn UPDATE/DELETE/TRUNCATE (0007). Code chỉ được INSERT.
- **R5 — Nghi thức migration:** xem §3 (bài học 0009).
- **R6 — Không đụng GDT** (`gdt-adapter.md` không áp dụng cho đơn vị này).
- **R7 — Mật khẩu tạm 6 số là điểm yếu có chủ ý** (10⁶ không gian). Điều kiện bù **bắt buộc, không thương lượng**: hết hạn 72h + buộc đổi lần đầu + rate-limit login. Tái dùng `LOGIN_LIMITER` DO (H-A.5b) đã có, keyed theo email chuẩn hoá — không dựng limiter thứ hai.

---

## 6. Quyết định

### QĐ-1 ✅ **ĐÃ CHỐT 2026-07-21 (chủ dự án): Phương án A — U18 KHÔNG gửi email**

**Bối cảnh mâu thuẫn hai tầng tài liệu:**
- `U18-plan.md` §6 (2026-07-15) chốt *"khi Admin bấm Duyệt, hệ thống **tự gửi email** mật khẩu tạm"*.
- `COMMERCIAL-LAYER-plan.md:35` (cùng ngày) lại treo lại: *"P2 | Hạ tầng email | **Để quyết khi code** — cô lập sau interface `EmailTransport` … **probe gửi thật** trước khi chốt provider"*, và §186 gắn nhãn **CHƯA KIỂM CHỨNG**.
- `U24-plan.md` §1 (2026-07-16, **muộn hơn**) chốt cứng *"Hạ tầng gửi email = AWS SES (không cân nhắc dịch vụ khác)"*; §27 đo được grep `SES|EMAIL|aws4fetch|send_email` trên `apps/api/src` + `wrangler.jsonc` → **KHÔNG có gì**. U24 xây `packages/email` từ đầu, phụ thuộc điều kiện **ngoài code** (verify DNS domain trong SES, quota/region ở AWS Console, smoke test `aws4fetch` trên workerd).

⇒ Provider **hết mơ hồ** (SES), nhưng nó được xây ở **U24 — sau U21**. U18 đứng trước, không có gì để gọi. Tự dựng đường gửi email riêng ở U18 sẽ tạo **nguồn sự thật thứ hai** cho hạ tầng email — Hiến pháp cấm.

**Chốt:** `POST /admin/tenants/:id/duyet` và `POST /admin/tenants/:id/reset-mat-khau` trả mật khẩu tạm **một lần duy nhất** trong response body (HTTPS, sau `requireSuperAdmin`). Admin chuyển cho khách ngoài luồng (điện thoại/Zalo). **KHÔNG** log, **KHÔNG** ghi vào `audit_log_admin` (chỉ ghi *đã sinh mật khẩu tạm cho tenant X*, không ghi giá trị). U24 sau này thay đường giao bằng email SES mà **không đổi hợp đồng route**.

**Hệ quả với P9** (`COMMERCIAL-LAYER-plan.md:42` — *"gửi email khi Duyệt + Từ chối; Khóa/Mở chỉ audit nội bộ"*): P9 **hoãn sang U24** cùng hạ tầng email. U18 chỉ audit nội bộ cho cả 4 thao tác vòng đời.

**Ghi nhận bảo mật:** bề mặt phương án A **hẹp hơn** email — không có bản sao mật khẩu tạm nằm lại trong hộp thư khách. Đổi lại là nợ UX (admin phải chuyển tay), đóng ở U24.

### QĐ-2 — `POST /auth/doi-mat-khau` thuộc U18 hay U20?

`COMMERCIAL-LAYER-plan.md:135` xếp *"Buộc đổi mật khẩu lần đầu (`phai_doi_mat_khau`)"* vào **U20**. Nhưng nếu U18 phát mật khẩu tạm mà chưa có đường đổi, **mật khẩu tạm 6 số thành mật khẩu vĩnh viễn** — vi phạm chính điều kiện bù R7 mà U18 §6 tự đặt ra.

**Chốt (hệ quả bắt buộc của QĐ-1):** U18 làm **endpoint backend** `POST /auth/doi-mat-khau` + cột `phai_doi_mat_khau` + cờ trong phản hồi login (thuần backend, đúng phạm vi U18, ~40 dòng). U20 giữ phần **UI buộc đổi**. Không làm phần này thì mật khẩu tạm 6 số trở thành mật khẩu vĩnh viễn — R7 sụp, và QĐ-1 (admin đọc mật khẩu tạm trên màn hình) càng làm điều đó nghiêm trọng hơn. Đây là **thu hẹp lỗ hổng do U18 tự mở**, không phải lấn phạm vi U20.

### QĐ-3 — Seed super-admin trên production chạy thế nào?

`scripts/seed-super-admin.ts` cần kết nối Postgres **production (Neon)** + nhận email/mật khẩu chủ dự án. Chưa có tiền lệ trong repo: `app-role.sql` chạy **tay một lần lúc provision** (ngoài lịch sử migration). Ba đường: (a) script Node chạy tay tại máy chủ dự án với `DATABASE_URL` từ Neon, giống `app-role.sql`; (b) migration `0011` seed từ biến môi trường; (c) endpoint bootstrap dùng-một-lần rồi tự vô hiệu.

**Mặc định (a)** — cùng nghi thức đã có, không để mật khẩu chạm lịch sử migration, không mở endpoint công khai nào (khớp `U18-plan.md` §45: *"không endpoint tạo super-admin công khai"*). Quyết định vận hành, đảo được: nếu chủ dự án không tự chạy được lệnh Node với `DATABASE_URL` của Neon, đổi sang (b) mà không ảnh hưởng phần còn lại của U18. **Không chặn việc code.**

### QĐ-4 — Bảo vệ tầng biên: **Cloudflare Zero Trust (Access)**, không 2FA app-level

`COMMERCIAL-LAYER-plan.md:38` (P5) chốt: v1.0 bảo vệ subdomain admin bằng **Cloudflare Access**, 2FA app-level để giai đoạn sau. ⇒ U18 **không** làm 2FA/TOTP. Nhưng Access là lớp **biên**, không thay thế `requireSuperAdmin` — nếu route `/admin/*` mount chung Worker API với route khách (đang là vậy), Access **không** che được chúng. Hai hệ quả ghi vào DoD:
- `requireSuperAdmin` phải tự đứng vững **giả định không có Access phía trước** (fail-closed, test #6).
- Việc gắn Access cho `adminvatengine.tourdao.vn` là **hạ tầng của U19** (khi `apps/admin` ra đời), không phải U18. U18 ghi nợ này vào bàn giao U19.

---

## 7. Rủi ro & phụ thuộc

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| `DROP/CREATE FUNCTION` trong `0011` phá `GRANT EXECUTE` của `vat_app` → **hỏng login production** | 🔴 Cao — **đã xảy ra một lần** (0009) | Lặp đủ 7 bước §3; test migration trên PGlite + đọc chéo với `0009`; deploy theo luật **migrate-trước-deploy** (`docs/deploy/`) |
| Route admin rò xuyên-tenant cho token khách | 🔴 Cao nhất về hệ quả | Test #8 là điều kiện xong; `security-reviewer` + một pass rà cách ly riêng |
| Hai secret bị đặt trùng do nhầm cấu hình | Trung bình | R3 fail-closed 503 + test |
| Mật khẩu tạm 6 số bị dò | Trung bình | R7: hết hạn 72h + buộc đổi + `LOGIN_LIMITER` |
| PGlite chạy dưới superuser ⇒ **không** kiểm chứng được `REVOKE`/BYPASSRLS thật | Trung bình | Giới hạn đã ghi ở `0009`; xác minh tay trên Neon trước deploy, ghi lại kết quả (nguyên tắc bằng chứng) |
| Phạm vi lấn sang U19/U20/U24 | Trung bình | QĐ-1/2 chốt trước khi code |

**Phụ thuộc:** không có binding/hạ tầng mới ngoài secret `ADMIN_JWT_SECRET`. Không đụng Queue/DO/R2/GDT. Tái dùng `LOGIN_LIMITER` DO sẵn có.

---

## 8. Tiêu chí nghiệm thu

1. `make lint` sạch; `make test` xanh; coverage tầng nghiệp vụ ≥ 80%.
2. **Test #8 (bất biến cách ly khách) xanh và tường minh** — điều kiện xong bắt buộc, không có ngoại lệ.
3. Tách token khách/admin có test ở cả hai chiều (#2, #3).
4. Toàn bộ 6 chuyển trạng thái hợp lệ đúng; mọi chuyển sai → 409, DB không đổi (#9, #10).
5. Mọi thao tác admin ghi đúng `audit_log_admin`, cũ→mới, không bí mật (#12).
6. Không phản hồi nào chứa token GDT thô hay `password_hash` (#13).
7. `0011` chạy sạch trên PGlite **và** đã rà tay nghi thức grant với `0009`.
8. **Hai review chéo:** `security-reviewer` + một pass rà cách ly tenant riêng.
9. Commit nhỏ, một đơn vị.

**Điểm chuyển U19:** Admin API sẵn sàng cho Cổng Admin frontend tiêu thụ (`/admin/auth/login`, `/admin/tenants*`, `/admin/audit` ổn định).

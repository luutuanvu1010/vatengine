# Kế hoạch — U4: Mô hình dữ liệu + migration (PostgreSQL)

> Sản phẩm của `/plan-unit U4`. **Không viết code hiện thực** — chỉ kế hoạch để rà soát trước khi `/write-prompt U4` → `/start-unit U4`.
> Ngày: 2026-07-13. Ngăn xếp theo **ADR-0001 (4A=A2)**: Postgres ngoài (Neon/Supabase, region SG) + Hyperdrive, ORM **Drizzle**, JSONB cho `raw_json`, **RLS** theo `tenant_id`. Nguồn "làm gì": KIEN_TRUC_VA_KE_HOACH.md **mục 7.1** (thực thể) + **7.2/7.3** (upsert/`ttxly`). Luật áp dụng: `multi-tenant.md` (đã tham chiếu sẵn `packages/db/migrations/**`), `security.md`, `testing.md`.
> Tiền đề đã kiểm chứng: khóa tự nhiên 5 trường + `_source`/`_direction` (U2, Amendment #5); cấu trúc dòng hàng detail `hdhhdvu` + thuế suất kép `ltsuat`(chuỗi)/`tsuat`(số) + `tthue` (U3, Amendment #6). **U4 KHÔNG chạm API thuế** → không có điểm "đoán cấu trúc phản hồi".
>
> **Hai quyết định hạ tầng ĐÃ CHỐT (chủ dự án, 2026-07-13):** **#1 = PGlite** (engine test offline, `@electric-sql/pglite`). **#2 = RLS gồm ngay trong U4** (chọn 2A). Toàn kế hoạch dưới đây bám hai lựa chọn này (test 13 + `tenantContext.ts` + policy RLS trong migration đều trong phạm vi).

## Phạm vi

Tạo package dữ liệu mới `packages/db`: **định nghĩa lược đồ Drizzle** cho các thực thể mục 7.1 (Tenant, TaiKhoanThue, HoaDon, DongHangHoa, LanDongBo, NguoiDung, AuditLog), **sinh migration SQL** versioned, và làm `make migrate` tạo được schema. Trọng tâm nghiệm thu: **ràng buộc khóa tự nhiên hóa đơn** `(tenant_id, nbmst, khmshdon, khhdon, shdon, tdlap)` là UNIQUE và được **thực thi thật** (chèn trùng → lỗi), `tenant_id` NOT NULL trên mọi bảng nghiệp vụ, `raw_json` là JSONB, và **không có cột mật khẩu thô** trên `TaiKhoanThue`.

**NGOÀI phạm vi (nêu rõ để không lấn):**
- **Không** viết logic đồng bộ/**upsert** — `sync()`, gộp hai họ endpoint, đếm `so_hd_moi`/`so_hd_cap_nhat`, cập nhật `ttxly`/`tthai` là **U5**. U4 chỉ dựng *bàn* (schema + ràng buộc) để U5 upsert lên.
- **Không** gọi adapter/GDT, không phân trang, không token. U4 thuần tầng dữ liệu.
- **Không** wiring Worker đọc DB: binding **Hyperdrive** trong `apps/api/wrangler.jsonc` và truy vấn từ route là **U6** (API tra cứu). U4 chạy migration từ CLI (máy dev/CI) qua `DATABASE_URL` trực tiếp, **không** qua Hyperdrive.
- **Không** mã hóa envelope thật cho token/secret — U4 chỉ dựng cột `secret_ref`/token mã hóa + `token_het_han` (schema-level); cơ chế KMS/envelope + audit runtime là **U12**.
- **Không** seed dữ liệu, không API RBAC (**U8**), không bảng tra cứu nhãn `ttxly` tiếng Việt (hiển thị — cân nhắc **U6**; U4 lưu **mã** `ttxly`).

## File sẽ tạo/sửa

**Mới — package `packages/db` (`@vat/db`):**
- `packages/db/package.json` — scripts: `typecheck` (`tsc --noEmit`), `test` (`vitest run --dir test/unit`), `test:integration` (PGlite), `generate` (`drizzle-kit generate`), `migrate` (áp migration lên `DATABASE_URL`). Script `migrate` là thứ `make migrate` gọi (Makefile đã delegate `npm run migrate --workspaces`, **không cần sửa Makefile**).
- `packages/db/drizzle.config.ts` — cấu hình drizzle-kit: `dialect: "postgresql"`, `schema: "./src/schema"`, `out: "./migrations"`, `dbCredentials` từ `process.env.DATABASE_URL`.
- `packages/db/src/schema/` — định nghĩa bảng (tách file cho gọn, như phong cách module của `gdt-client`):
  - `tenants.ts`, `taiKhoanThue.ts`, `hoaDon.ts`, `dongHangHoa.ts`, `lanDongBo.ts`, `nguoiDung.ts`, `auditLog.ts`, `index.ts` (re-export).
- `packages/db/src/naturalKey.ts` — hằng danh sách 6 trường khóa tự nhiên + helper dựng khóa (nguồn chân lý DUY NHẤT ở tầng DB; đối xứng `naturalKey()` của adapter nhưng có `tenant_id`).
- `packages/db/src/tenantContext.ts` — helper `withTenant(db, tenantId, fn)` đặt `SET LOCAL app.tenant_id` trong transaction (nền cho RLS + U5/U6). *(Trong phạm vi — #2 đã chốt gồm RLS ở U4.)*
- `packages/db/src/index.ts` — export schema + helper.
- `packages/db/migrations/0000_*.sql` (+ `migrations/meta/*`) — **sinh bằng `drizzle-kit generate`**, gồm DDL bảng + UNIQUE khóa tự nhiên + FK + `ENABLE/FORCE ROW LEVEL SECURITY` + policy (#2 đã chốt).
- `packages/db/test/unit/schema.test.ts` — nhóm `unit` (introspect object Drizzle, **không cần DB**).
- `packages/db/test/integration/constraints.test.ts` — nhóm `integration` (**PGlite**, engine Postgres thật chạy offline trong Vitest).
- `packages/db/tsconfig.json`, `packages/db/vitest.config.ts`, `packages/db/.dev.vars.example` (mẫu `DATABASE_URL`, nằm trong `.gitignore`).

**Sửa:**
- Root `package.json` / `package-lock.json` — thêm deps: `drizzle-orm`, `drizzle-kit` (dev), `pg` + `@types/pg`, `@electric-sql/pglite` (dev). *(workspaces đã gồm `packages/*` — không cần khai báo package mới.)*
- `docs/CHECKLIST-NGHIEM-THU.md` — thêm mục U4, đánh dấu sau khi xanh.

**Ghi chú drift (không sửa trong U4):** `TRIEN_KHAI_BANG_CLAUDE_CODE.md` mục 3 vẫn ghi `make migrate = alembic` (ngăn xếp Python cũ). ADR-0001 thắng → U4 dùng Drizzle. Ghi lại drift, không tự đổi hai tài liệu nguồn ngoài phạm vi (nếu cần đính chính, làm ở đơn vị tài liệu riêng).

## Test viết trước (TDD)

**unit** (introspect lược đồ Drizzle, offline, không DB — bắt các luật mô hình hóa mà không cần engine):
1. **`tenant_id` NOT NULL trên mọi bảng nghiệp vụ:** `hoa_don, dong_hang_hoa, lan_dong_bo, tai_khoan_thue, nguoi_dung, audit_log` đều có cột `tenant_id` `notNull` *(dong_hang_hoa gián tiếp qua FK tới hoa_don — xác nhận nó có `tenant_id` trực tiếp hay bắt buộc join; quyết định: có `tenant_id` trực tiếp để RLS + lọc tường minh, khớp `multi-tenant.md`)*.
2. **Khóa tự nhiên HoaDon đúng 6 trường, đúng thứ tự:** ràng buộc UNIQUE của `hoa_don` gồm đúng `(tenant_id, nbmst, khmshdon, khhdon, shdon, tdlap)` — không thiếu `tenant_id`, không thừa.
3. **`TaiKhoanThue` KHÔNG có cột mật khẩu thô:** có `secret_ref`, `token_hien_tai` (mã hóa), `token_het_han`; **không** có cột tên kiểu `password/matkhau/pwd`.
4. **`HoaDon.raw_json` kiểu JSONB** (không `text`); có đủ cột nghiệp vụ mục 7.1 (`nbmst, nbten, nmmst, nmten, khmshdon, khhdon, shdon, tdlap, ncnhat, tgtcthue, tgtthue, tgtttbso, ttcktmai, dvtte, tgia, ttxly, tthai, chieu, nguon`).
5. **`DongHangHoa` giữ thuế suất KÉP + tiền thuế dòng + raw:** có cả `ltsuat` (chuỗi hiển thị) và `tsuat` (số), cột tiền thuế dòng (`tsuat_tien` theo 7.1 ≡ `tthue` của adapter — xem Ghi chú ánh xạ), và `raw_json` JSONB. *(Bảo toàn bằng chứng U3: ép số làm mất mã "KCT"/"KKKNT".)*
6. **`LanDongBo` đủ trường nhật ký:** `tenant_id, taikhoan_id, chieu, tu_ngay, den_ngay, so_hd_moi, so_hd_cap_nhat, trang_thai, thong_diep_loi, bat_dau, ket_thuc` (nền cho U5 ghi kết quả đồng bộ).

**integration** (PGlite — áp migration đã sinh lên DB sạch, rồi assert hành vi **thật**):
7. **Khóa tự nhiên UNIQUE được thực thi:** chèn 2 hóa đơn cùng `(tenant_id, nbmst, khmshdon, khhdon, shdon, tdlap)` → **lỗi unique violation** ở lần 2. *(Đây là tiêu chí nghiệm thu lõi của U4.)*
8. **`tenant_id` là một phần khóa:** cùng 5 trường hóa đơn nhưng **khác `tenant_id`** → cả hai chèn **thành công** (không đụng UNIQUE).
9. **`tenant_id` NOT NULL thực thi:** chèn hóa đơn `tenant_id = NULL` → **lỗi not-null**.
10. **FK `dong_hang_hoa.hoadon_id` → `hoa_don.id` thực thi:** chèn dòng hàng trỏ hóa đơn không tồn tại → lỗi FK; xóa hóa đơn có dòng hàng → theo `onDelete` đã khai (cascade — dòng hàng là phụ thuộc).
11. **`raw_json` round-trip JSONB:** ghi object lồng nhau vào `raw_json`, đọc lại đúng cấu trúc (chứng minh JSONB, không phải chuỗi).
12. **`make migrate` idempotent-an-toàn ở mức schema:** áp migration lên DB sạch tạo đủ bảng; áp lần hai không lỗi (drizzle journal). *(Idempotent **dữ liệu** là U5; đây chỉ là schema.)*
13. **Cách ly RLS ở tầng DB (#2 đã chốt — trong phạm vi):** bật `FORCE ROW LEVEL SECURITY`, `SET app.tenant_id = A`, chèn HĐ cho A và B → `SELECT` chỉ trả HĐ của A; đổi sang B chỉ thấy của B. *(Test cách ly tenant tối thiểu mà `multi-tenant.md` yêu cầu, ở tầng DB; test cách ly tầng **API** để U8.)*

**Không có nhóm `contract`** cho U4 (không gọi GDT). `make test` (unit + integration) chạy **offline** (PGlite, không mạng) — đúng `testing.md`.

## Tiêu chí nghiệm thu

- Mục checklist U4 xanh: **(a)** `make migrate` tạo schema (test 12); **(b)** ràng buộc khóa tự nhiên thực thi thật (test 7) + `tenant_id` là một phần khóa (8) + NOT NULL (9).
- `make lint` sạch (Biome + `tsc --noEmit`); `make test` xanh (unit + integration PGlite); coverage tầng nghiệp vụ `packages/db` ≥ 80% (không tụt ngưỡng).
- Lược đồ khớp mục 7.1: đủ thực thể/trường; `raw_json` JSONB; **không** cột mật khẩu thô (test 3); thuế suất dòng giữ kép (test 5).
- Migration SQL sinh ra được **commit** (versioned, review được), không chỉ `push` runtime.
- Review chéo `security-reviewer` (tenant_id/RLS/không mật khẩu thô) + `dod-auditor` (DoD tổng quát). *(Không cần `contract-guardian` — U4 không đụng adapter.)*

## Ràng buộc bắt buộc chạm tới

- **Khóa tự nhiên + tiền đề idempotent:** UNIQUE `(tenant_id, nbmst, khmshdon, khhdon, shdon, tdlap)` — chính là điều kiện để U5 upsert idempotent. `tenant_id` **luôn** trong khóa (`multi-tenant.md`).
- **`tenant_id`/RLS:** mọi bảng nghiệp vụ có `tenant_id` NOT NULL; RLS bật làm lớp phòng thủ thứ hai (Quyết định #2). Index theo `tenant_id` + khóa tự nhiên (KIEN_TRUC mục 11).
- **Không lưu mật khẩu thô** (`security.md` + Hiến pháp): `TaiKhoanThue` chỉ `secret_ref` + token mã hóa + `token_het_han`. Đây là ranh giới pháp lý — test 3 canh gác.
- **`raw_json` JSONB** giữ nguyên bản phản hồi (không mất trường khi lược đồ mở rộng) — KIEN_TRUC 7.1/9.
- **Cô lập adapter** — *không áp dụng trực tiếp* (U4 không gọi GDT), nhưng schema là *đích đến* của dữ liệu adapter: cột phản chiếu đúng khóa tự nhiên + biểu diễn thuế suất đã kiểm chứng ở U2/U3.
- **401 / captcha** — không áp dụng (không gọi mạng).

**Ghi chú ánh xạ (không phải mơ hồ — cấu trúc đã kiểm chứng, chỉ là quyết định đặt tên cột):** 7.1 gọi tiền thuế dòng là `tsuat_tien`; adapter U3 (đã kiểm chứng) trả `tthue`. Đề xuất: cột lưu tiền thuế dòng, ghi rõ comment `tsuat_tien ≡ tthue (GDT)`; giữ **cả** `ltsuat` (chuỗi) + `tsuat` (số) vì bằng chứng U3 cho thấy GDT trả cả hai và mã chữ (KCT/KKKNT) chỉ có ở dạng chuỗi.

## Rủi ro & phụ thuộc

- **Postgres thật chưa provision:** Neon/Supabase (region SG) + connection string production **chưa có**. U4 hoàn tất được **schema + migration sinh ra + ràng buộc kiểm bằng PGlite** mà không cần DB thật; nhưng "`make migrate` lên Neon production" cần DB tồn tại + `DATABASE_URL` (việc ops, ngoài phạm vi code U4). Nêu rõ: nghiệm thu U4 dựa trên PGlite, không chặn bởi việc provision.
- **PGlite vs Postgres thật — độ trung thực:** PGlite là Postgres biên dịch WASM, hỗ trợ DDL/JSONB/constraint/RLS; rủi ro lệch nhỏ với Hyperdrive/Neon (phiên bản, extension). Chấp nhận cho U4 (chỉ kiểm constraint/RLS chuẩn). Nếu muốn trung thực tuyệt đối → Testcontainers (cần Docker) — xem Quyết định #1.
- **RLS trên PGlite chạy dưới role owner** → owner **bỏ qua** RLS; test 13 phải dùng `ALTER TABLE ... FORCE ROW LEVEL SECURITY` để owner cũng bị chính sách chi phối. Ghi chú kỹ thuật cho người thực thi.
- **Hyperdrive binding chưa tạo** — cố ý hoãn tới U6 (lần đầu Worker đọc DB). U4 không cần binding; migration chạy từ CLI qua `DATABASE_URL` trực tiếp.
- **Giới hạn Workers (CPU 5'/wall 15')** — **không áp dụng** U4 (không có đường chạy trong Worker runtime).
- **Drizzle-kit sinh RLS:** Drizzle bản mới hỗ trợ `pgPolicy`/`.enableRLS()` để `generate` phát ra DDL RLS; nếu bản ghim không hỗ trợ đủ, thêm policy bằng SQL nối vào migration đã sinh (vẫn versioned). Ghim phiên bản `drizzle-orm`/`drizzle-kit` trong khi thực thi.
- **Phụ thuộc xuôi:** U5 (upsert idempotent) và U6 (API tra cứu) dựng trên schema này; đặt tên cột/khóa sai ở đây lan xuống hai đơn vị sau → giữ khóa tự nhiên + tên trường bám đúng adapter đã kiểm chứng.

## ✅ Điểm hạ tầng ĐÃ CHỐT (không có điểm "đoán cấu trúc API thuế")

Không có điểm nào phải đoán phản hồi GDT (schema lấy từ KIEN_TRUC 7.1 + đã kiểm chứng U2/U3). Hai quyết định hạ tầng/phạm vi dưới đã được chủ dự án chốt (2026-07-13):

**Quyết định #1 — Engine kiểm "ràng buộc khóa tự nhiên": ĐÃ CHỐT = (A) PGlite (`@electric-sql/pglite`).** Postgres WASM chạy trong Vitest **offline** (không Docker/mạng), nhóm `integration` nằm trong `make test`; đủ để chứng minh UNIQUE/NOT-NULL/FK/JSONB/RLS **thực thi thật**. (Không chọn Testcontainers/Neon — dành cho lane định kỳ nếu sau này cần độ trung thực tuyệt đối.)

**Quyết định #2 — RLS: ĐÃ CHỐT = (A) gồm ngay trong U4.** RLS là DDL → đặt cùng migration tạo bảng (tránh migration thứ hai đụng mọi bảng ở U8); kèm **test 13** (cách ly tầng DB, dùng `FORCE ROW LEVEL SECURITY` vì PGlite chạy dưới role owner). U8 vẫn giữ test cách ly tầng **API** (phòng thủ nhiều lớp).

## Bước kế tiếp

Sau khi chốt #1 + #2: `/write-prompt U4` (sinh prompt thực thi tự chứa) → `/start-unit U4`. U4 **không** cần phiên đăng nhập thật (khác U1–U3) — thuần tầng dữ liệu, kiểm bằng PGlite offline.

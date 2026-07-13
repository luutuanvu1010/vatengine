# Prompt thực thi — U4: Mô hình dữ liệu + migration (PostgreSQL/Drizzle)

> Sản phẩm của `/write-prompt U4`. Prompt tự chứa để dán vào một phiên `/start-unit U4` (hoặc chạy tay). Bám kế hoạch `docs/plans/U4-plan.md` (đã chốt **#1 = PGlite**, **#2 = RLS gồm ngay ở U4**). Ngày: 2026-07-13.

---

## NHIỆM VỤ (U4): Mô hình dữ liệu + migration (PostgreSQL/Drizzle)

Tạo package dữ liệu mới `packages/db` (`@vat/db`): định nghĩa **lược đồ Drizzle** cho các thực thể mục 7.1, **sinh migration SQL versioned**, và làm `make migrate` tạo được schema trên PostgreSQL. Đây là tầng dữ liệu mà U5 (upsert idempotent) và U6 (API tra cứu) sẽ dựng lên.

**QUAN TRỌNG — U4 KHÔNG chạm API thuế.** Thuần tầng dữ liệu: không gọi GDT, không token, không adapter, không phiên đăng nhập thật. Lược đồ lấy trọn từ tài liệu kiến trúc + các trường đã kiểm chứng ở U2/U3 → **không có điểm "đoán cấu trúc phản hồi API thuế"**.

### Hai quyết định hạ tầng ĐÃ CHỐT (chủ dự án, không tự đổi)
- **#1 — Engine test = PGlite (`@electric-sql/pglite`).** Postgres biên dịch WASM, chạy trong Vitest **offline** (không Docker/mạng), nhóm `integration` vẫn nằm trong `make test`. Dùng để chứng minh UNIQUE/NOT-NULL/FK/JSONB/RLS **thực thi thật**, không chỉ khai báo.
- **#2 — RLS gồm ngay trong U4.** Row-Level Security là DDL → viết chung migration tạo bảng. Kèm test cách ly tenant ở tầng DB.

---

## BỐI CẢNH & MỤC TIÊU — Tiêu chí nghiệm thu (trích `docs/CHECKLIST-NGHIEM-THU.md` mục B/U4)

Bốn tiêu chí đóng đơn vị:
1. `make migrate` tạo schema (Drizzle) trên Postgres.
2. Test ràng buộc **khóa tự nhiên** (unique) trên bảng hóa đơn — chèn trùng → lỗi.
3. Mọi bảng nghiệp vụ có `tenant_id` NOT NULL; `raw_json` kiểu **JSONB**.
4. Bật **Row-Level Security** theo `tenant_id`.

**Khóa tự nhiên hóa đơn (6 trường, đúng thứ tự):** `(tenant_id, nbmst, khmshdon, khhdon, shdon, tdlap)` — khác adapter (5 trường), **thêm `tenant_id`**. Đây là tiền đề để U5 upsert idempotent.

---

## TÀI LIỆU PHẢI ĐỌC TRƯỚC (chỉ phần liên quan, không nạp toàn bộ)

- `docs/plans/U4-plan.md` — **kế hoạch đã duyệt của chính đơn vị này** (phạm vi, 13 test, file, quyết định đã chốt). Đọc TRƯỚC TIÊN.
- `KIEN_TRUC_VA_KE_HOACH.md` **mục 7.1** (thực thể + trường), **7.2** (logic upsert — chỉ để hiểu U4 phục vụ gì, KHÔNG hiện thực), **7.3** (`ttxly`); **mục 11** (index theo `tenant_id` + khóa tự nhiên).
- `docs/adr/0001-nen-tang-cloudflare.md` **mục 4A** (chốt A2: Postgres ngoài + Hyperdrive), **mục 5** (ánh xạ thành phần: JSONB `raw_json`, RLS `tenant_id`).
- `.claude/rules/multi-tenant.md` — mọi bảng có `tenant_id` NOT NULL; RLS lớp phòng thủ thứ hai; khóa tự nhiên luôn gồm `tenant_id`; ≥1 test cách ly tenant.
- `.claude/rules/security.md` — **không lưu mật khẩu thuế thô**; token JWT mã hóa + vòng đời ngắn (`token_het_han`); không log dữ liệu nhạy cảm.
- `.claude/rules/testing.md` — TDD; nhóm `unit`/`integration`/`contract`; `make test` = unit + integration (offline); coverage nghiệp vụ ≥ 80%.
- **Tham chiếu trường đã kiểm chứng** (đích đến của dữ liệu adapter): `packages/gdt-client/src/query.ts` (`InvoiceRow`, khóa tự nhiên 5 trường) + `packages/gdt-client/src/detail.ts` (`InvoiceLine`: `ltsuat` chuỗi + `tsuat` số + `tthue`).

---

## THỰC THỂ & TRƯỜNG (mục 7.1 — nguồn "làm gì")

- **Tenant:** `id, ten, mst, trang_thai, goi_dich_vu, ngay_tao`.
- **TaiKhoanThue:** `id, tenant_id, username, loai` (chính/con), `secret_ref` (tham chiếu bí mật đã mã hóa — **KHÔNG cột mật khẩu thô**), `token_hien_tai` (mã hóa, vòng đời ngắn), `token_het_han`.
- **HoaDon** (bảng trung tâm): `id` nội bộ + **UNIQUE** `(tenant_id, nbmst, khmshdon, khhdon, shdon, tdlap)`. Cột nghiệp vụ: người bán `nbmst, nbten`; người mua `nmmst, nmten`; định danh `khmshdon, khhdon, shdon`; thời gian `tdlap, ncnhat`; tiền `tgtcthue` (chưa thuế), `tgtthue` (tiền thuế), `tgtttbso` (tổng thanh toán), `ttcktmai` (chiết khấu), `dvtte` (tiền tệ), `tgia` (tỷ giá); trạng thái `ttxly` (xử lý — lưu **mã**), `tthai` (hóa đơn); phân loại nội bộ `chieu` (purchase/sold), `nguon` (normal/sco); **`raw_json` kiểu JSONB** (nguyên bản phản hồi).
- **DongHangHoa** (chi tiết dòng): `id, hoadon_id` (FK→HoaDon, `onDelete cascade`), `tenant_id`, `stt, ten, dvtinh, sluong, dgia, thtien`, thuế suất **giữ cả hai dạng** `ltsuat` (chuỗi hiển thị "8%"/mã "KCT"/"KKKNT") + `tsuat` (số thập phân), tiền thuế dòng `tsuat_tien` (**≡ `tthue` của adapter** — ghi comment rõ), `raw_json` JSONB.
- **LanDongBo** (nhật ký đồng bộ): `id, tenant_id, taikhoan_id, chieu, tu_ngay, den_ngay, so_hd_moi, so_hd_cap_nhat, trang_thai, thong_diep_loi, bat_dau, ket_thuc`.
- **NguoiDung** và **AuditLog:** tạo bảng khung tối thiểu (đủ `id, tenant_id` NOT NULL + vài trường lõi) để giữ ràng buộc đa tenant; RBAC/audit runtime đầy đủ là U8/U12 — **không** hiện thực logic ở U4.

**Ghi chú ánh xạ (KHÔNG phải mơ hồ — cấu trúc đã kiểm chứng U3, chỉ là quyết định đặt tên cột):** tiền thuế dòng — mục 7.1 gọi `tsuat_tien`, adapter U3 trả `tthue`. Dùng một cột lưu tiền thuế dòng + comment `tsuat_tien ≡ tthue (GDT)`. Giữ **cả** `ltsuat` (chuỗi) lẫn `tsuat` (số): ép số làm mất mã chữ KCT/KKKNT (bằng chứng U3).

---

## RÀNG BUỘC BẮT BUỘC (trích Hiến pháp + Luật — chỉ cái áp dụng cho U4)

- **Khóa tự nhiên + tiền đề idempotent:** UNIQUE `(tenant_id, nbmst, khmshdon, khhdon, shdon, tdlap)` trên `HoaDon`. `tenant_id` LUÔN trong khóa (`multi-tenant.md`). Không dùng khóa thiếu `tenant_id`.
- **`tenant_id` NOT NULL** trên MỌI bảng nghiệp vụ (`hoa_don, dong_hang_hoa, lan_dong_bo, tai_khoan_thue, nguoi_dung, audit_log`).
- **RLS bật** làm lớp phòng thủ thứ hai: `ENABLE ROW LEVEL SECURITY` + policy lọc theo `current_setting('app.tenant_id')`. **KHÔNG** thay cho lọc tường minh ở tầng ứng dụng (đó là U5/U6). Index theo `tenant_id` + khóa tự nhiên.
- **Không lưu mật khẩu thuế thô** (`security.md` + Hiến pháp — ranh giới pháp lý): `TaiKhoanThue` chỉ `secret_ref` + token mã hóa + `token_het_han`. Không cột `password/matkhau/pwd`.
- **`raw_json` JSONB** trên `HoaDon` và `DongHangHoa` — giữ nguyên bản, không mất trường khi lược đồ mở rộng.
- **Migration versioned:** sinh SQL bằng `drizzle-kit generate`, **commit file SQL** (review được). Không chỉ `push` runtime.
- **Migration chạy từ CLI** qua `DATABASE_URL` trực tiếp (máy dev/CI), **KHÔNG** qua Hyperdrive binding (binding là U6).
- *KHÔNG áp dụng cho U4 (nêu để khỏi lạc):* cô lập adapter `GdtTransport`, xử lý 401, timeout/retry backoff, không phá captcha — U4 không gọi mạng.

---

## YÊU CẦU TDD (viết test TRƯỚC, đỏ → xanh; nhóm theo `.claude/rules/testing.md`)

### Nhóm `unit` — introspect object lược đồ Drizzle, OFFLINE, không DB (`packages/db/test/unit/schema.test.ts`)
1. Mọi bảng nghiệp vụ có cột `tenant_id` `notNull` (`hoa_don, dong_hang_hoa, lan_dong_bo, tai_khoan_thue, nguoi_dung, audit_log`).
2. Ràng buộc UNIQUE của `hoa_don` gồm **đúng 6 trường, đúng thứ tự** `(tenant_id, nbmst, khmshdon, khhdon, shdon, tdlap)` — không thiếu `tenant_id`, không thừa.
3. `tai_khoan_thue` có `secret_ref` + `token_hien_tai` + `token_het_han`; **KHÔNG** cột tên kiểu `password/matkhau/pwd`.
4. `hoa_don.raw_json` kiểu **JSONB** (không `text`); có đủ cột nghiệp vụ mục 7.1 (liệt kê ở trên).
5. `dong_hang_hoa` giữ **cả** `ltsuat` (chuỗi) và `tsuat` (số), cột tiền thuế dòng (`tsuat_tien`), và `raw_json` JSONB.
6. `lan_dong_bo` đủ trường nhật ký (`tenant_id, taikhoan_id, chieu, tu_ngay, den_ngay, so_hd_moi, so_hd_cap_nhat, trang_thai, thong_diep_loi, bat_dau, ket_thuc`).

### Nhóm `integration` — PGlite (áp migration đã sinh lên DB sạch, assert hành vi THẬT) (`packages/db/test/integration/constraints.test.ts`)
7. **Khóa tự nhiên UNIQUE thực thi:** chèn 2 hóa đơn cùng `(tenant_id, nbmst, khmshdon, khhdon, shdon, tdlap)` → **lỗi unique violation** lần 2. *(Tiêu chí lõi.)*
8. **`tenant_id` là một phần khóa:** cùng 5 trường HĐ nhưng **khác `tenant_id`** → cả hai chèn **thành công**.
9. **`tenant_id` NOT NULL thực thi:** chèn HĐ `tenant_id = NULL` → **lỗi not-null**.
10. **FK `dong_hang_hoa.hoadon_id`→`hoa_don.id`:** trỏ hóa đơn không tồn tại → lỗi FK; xóa HĐ có dòng hàng → cascade theo `onDelete`.
11. **`raw_json` round-trip JSONB:** ghi object lồng nhau, đọc lại đúng cấu trúc (chứng minh JSONB, không phải chuỗi).
12. **`make migrate` mức schema:** áp migration lên DB sạch tạo đủ bảng; áp lần hai không lỗi (drizzle journal). *(Idempotent **dữ liệu** là U5.)*
13. **Cách ly RLS tầng DB:** `ALTER TABLE ... FORCE ROW LEVEL SECURITY` (PGlite chạy dưới role owner → không FORCE thì owner **bỏ qua** RLS), `SET app.tenant_id = A`, chèn HĐ cho A và B → `SELECT` chỉ trả HĐ của A; đổi sang B chỉ thấy của B.

**Không có nhóm `contract`** cho U4 (không gọi GDT).

---

## LỆNH TỰ KIỂM CHỨNG (dán kết quả vào báo cáo)

- `make lint` — Biome + `tsc --noEmit`, phải sạch.
- `make test` — unit + integration (PGlite offline), phải xanh; coverage `packages/db` ≥ 80% (loại `src/index.ts` wiring thuần, theo mẫu `vitest.config.ts` của `gdt-client`).
- `make migrate` — chạy được (áp migration Drizzle); tối thiểu chạy trên PGlite/DB dev. *(KHÔNG chạy `make test-contract` — U4 không đụng `packages/gdt-client`.)*

---

## QUY TRÌNH BẮT BUỘC

1. Đọc `docs/plans/U4-plan.md` + các mục tài liệu trên. Trình bày kế hoạch ngắn (file sẽ tạo, test sẽ viết) **rồi mới code**.
2. **Viết test trước** (unit + integration) thể hiện 13 tiêu chí — kể cả ca lỗi/biên. Chạy để thấy **đỏ**.
3. Hiện thực tối thiểu: schema Drizzle → `drizzle-kit generate` sinh migration (gồm RLS) → helper `withTenant` → script `migrate`. Ghim phiên bản `drizzle-orm`/`drizzle-kit`.
4. `make lint && make test`. Dán kết quả. Đỏ thì tự sửa, lặp tối đa N vòng.
5. Tự rà checklist bảo mật: không mật khẩu thô (test 3), `tenant_id` NOT NULL (1/9), RLS (13), không log dữ liệu nhạy cảm.
6. Commit nhỏ, thông điệp rõ (một đơn vị). **Không** chuyển nhiệm vụ khác.

---

## FILE SẼ TẠO/SỬA (theo `apps/`+`packages/`, ADR-0001)

**Mới — `packages/db` (`@vat/db`):** `package.json` (scripts `typecheck`/`test`/`test:integration`/`generate`/`migrate`); `drizzle.config.ts`; `src/schema/{tenants,taiKhoanThue,hoaDon,dongHangHoa,lanDongBo,nguoiDung,auditLog,index}.ts`; `src/naturalKey.ts`; `src/tenantContext.ts` (`withTenant`); `src/index.ts`; `migrations/0000_*.sql` (+ `meta/*`, sinh bởi drizzle-kit, gồm RLS); `test/unit/schema.test.ts`; `test/integration/constraints.test.ts`; `tsconfig.json` (extends `../../tsconfig.base.json`); `vitest.config.ts` (mẫu như `gdt-client`, thresholds 80%, exclude `src/index.ts`); `.dev.vars.example` (mẫu `DATABASE_URL`).

**Sửa:** root `package.json`/`package-lock.json` — thêm `drizzle-orm`, `drizzle-kit` (dev), `pg` + `@types/pg`, `@electric-sql/pglite` (dev). `docs/CHECKLIST-NGHIEM-THU.md` — đánh dấu U4 sau khi xanh (tick 4 mục + cập nhật dòng trạng thái tiến độ). *(Makefile KHÔNG cần sửa — `migrate` đã delegate `npm run migrate --workspaces`.)*

**Ghi chú drift (KHÔNG tự sửa trong U4):** `TRIEN_KHAI_BANG_CLAUDE_CODE.md` mục 3 còn ghi `make migrate = alembic` (ngăn xếp Python cũ) — ADR-0001 thắng, U4 dùng Drizzle. Chỉ ghi nhận, đính chính tài liệu là việc riêng.

---

## CỔNG REVIEW CHÉO (sau khi lint+test xanh, trước khi coi là xong)

- **`security-reviewer`** (BẮT BUỘC — U4 đụng `tenant_id`/RLS/token/`secret_ref`): xác nhận `tenant_id` NOT NULL mọi bảng, RLS bật đúng, không cột mật khẩu thô, không rò rỉ chéo tenant trong policy.
- **`dod-auditor`** (LUÔN): DoD tổng quát — test/coverage/tài liệu/code chết/commit/không lệch Hiến pháp.
- *KHÔNG cần `contract-guardian`* — U4 không đụng adapter GDT.
- Hoặc gọi gọn: `/qa-unit U4`.

---

## DEFINITION OF DONE (đóng đơn vị khi ĐỦ)

- [ ] 13 test (unit + integration PGlite) **đỏ → xanh**; `make test` toàn xanh.
- [ ] 4 tiêu chí CHECKLIST U4 đạt: `make migrate` tạo schema; khóa tự nhiên UNIQUE thực thi; `tenant_id` NOT NULL + `raw_json` JSONB mọi bảng nghiệp vụ; RLS bật theo `tenant_id`.
- [ ] `make lint` sạch; coverage `packages/db` ≥ 80% (không tụt ngưỡng).
- [ ] Migration SQL sinh ra **được commit** (versioned), gồm RLS.
- [ ] Không cột mật khẩu thô; không log/secret lộ trong code.
- [ ] `security-reviewer` + `dod-auditor` **PASS**.
- [ ] `docs/CHECKLIST-NGHIEM-THU.md` cập nhật (tick U4 + dòng trạng thái). Commit nhỏ, rõ.

---

## KHI GẶP MƠ HỒ — DỪNG VÀ HỎI (không đoán thầm)

U4 không có điểm đoán cấu trúc API thuế. Nhưng nếu phát sinh: (a) một trường mục 7.1 chưa rõ kiểu/ràng buộc và ảnh hưởng khóa/không-null; (b) drizzle-kit bản ghim **không** sinh được DDL RLS từ schema (cân nhắc nối policy bằng SQL vào migration đã sinh — vẫn versioned — và **hỏi xác nhận** trước khi làm); (c) mâu thuẫn giữa tài liệu nguồn và ADR ngoài drift `alembic` đã ghi — thì **DỪNG, nêu rõ thiếu/xung đột gì + phương án đề xuất + cách kiểm chứng**, hỏi trước khi code tiếp (Hiến pháp mục "Khi gặp mơ hồ").

# ADR-0004 — Kiểm chứng role Neon + hiệu lực RLS thật + PITR (H-A.1 SPIKE)

- **Trạng thái:** ⬜ CHỜ BẰNG CHỨNG (chờ chủ dự án cấp Neon staging) — CHƯA duyệt.
- **Ngày mở:** 2026-07-15 · **Đơn vị:** FORDEX H-A.1 (SPIKE, Gate A).
- **Gating:** mở khoá H-A.2 (health-check role lúc khởi động); chốt DR (Cụm 2).

## Bối cảnh — vì sao SPIKE này tồn tại

Cách ly tenant lớp 2 (RLS `ENABLE`+`FORCE`, policy fail-closed) **thiết kế đúng** và có test cách ly dưới PGlite. NHƯNG hiệu lực **production** phụ thuộc **role kết nối** không mang `SUPERUSER`/`BYPASSRLS` và không sở hữu bảng — điều kiện này nằm **ngoài mã** (`packages/db/provisioning/app-role.sql`), là bước thủ công, **chưa** được máy ép và **chưa** có bằng chứng tái lập ghi lại trên Neon thật.

`app-role.sql` có **chú thích** "KIỂM CHỨNG 2026-07-14: vat_app rolsuper=f, rolbypassrls=f…" và "neondb_owner CÓ BYPASSRLS!". Theo **nguyên tắc bằng chứng** của Hiến pháp — *"'đã có trong tài liệu/mã cũ' KHÔNG phải bằng chứng"* (bài học `:30000`) — chú thích này **chưa đủ**: phải tự kiểm lại từ nguồn sơ cấp và **ghi lại lệnh + kết quả + ngày**. ADR này làm việc đó, cộng phép **khôi phục PITR thật** (hiện thiếu hoàn toàn).

## Câu hỏi cần chốt (tiền đề CHƯA KIỂM CHỨNG)

1. Role app production (`vat_app`) có thật sự `rolsuper=false`, `rolbypassrls=false`, **không sở hữu bảng**?
2. `neondb_owner` (role owner/migrate) có `BYPASSRLS` không? (nếu có ⇒ tuyệt đối không dùng cho Hyperdrive).
3. Dưới role app, RLS có **fail-closed** thật (chưa set tenant ⇒ 0 hàng) và **không rò xuyên tenant** (truy vấn tường minh tenant khác ⇒ 0 hàng)?
4. Neon **PITR/backup** đã bật và **khôi phục được** (một phép restore thật)?

## Phương pháp kiểm chứng (tái lập)

- **Probe role + RLS:** `packages/db/provisioning/spike-role-rls-probe.sql` (psql) hoặc `spike-role-rls-probe.mjs` (node `pg`, đọc `DATABASE_URL_APP` từ env — KHÔNG paste chuỗi kết nối vào chat/commit).
  - Chạy bằng **chuỗi kết nối role app `vat_app`** (endpoint DIRECT, không `-pooler`).
  - Tuỳ chọn `TENANT_REAL=<uuid tenant có data>` để kiểm POSITIVE + cross-leak.
- **PITR:** trên Neon console/API — tạo branch tại timestamp quá khứ (hoặc restore), xác nhận đọc lại được dữ liệu; ghi lại thao tác + kết quả.

## BẰNG CHỨNG (điền khi chạy trên staging — RAW, không tóm tắt)

> Dán nguyên văn output (kèm ngày + region Neon). Che giá trị nhạy cảm nếu có.

### E1 — Thuộc tính role app (`vat_app`)
```
(chưa chạy — chờ Neon staging)
```

### E2 — Thuộc tính mọi role (chốt câu hỏi neondb_owner BYPASSRLS)
```
(chưa chạy)
```

### E3 — Sở hữu bảng + RLS enabled/forced
```
(chưa chạy)
```

### E4 — Cách ly: fail-closed (0 hàng chưa set) + cross-leak (0 hàng tenant khác)
```
(chưa chạy)
```

### E5 — PITR restore thật
```
(chưa chạy — thao tác Neon console/API + kết quả xác nhận khôi phục)
```

## QUYẾT ĐỊNH (điền sau khi có E1–E5, chủ dự án duyệt)

- [ ] `vat_app` xác nhận NOSUPERUSER/NOBYPASSRLS/không-own-bảng → **an toàn cho Hyperdrive**.
- [ ] `neondb_owner` BYPASSRLS = (điền) → **tuyệt đối không dùng** cho Hyperdrive (chỉ migrate/admin).
- [ ] RLS fail-closed + không rò xuyên tenant trên Neon thật → cách ly lớp 2 **đã kiểm chứng**.
- [ ] PITR khôi phục được → DR **đã kiểm chứng**; ghi runbook rollback.
- [ ] Cập nhật `docs/audit/FORDEX-PROGRESS.md`: 3 tiền đề CHƯA KIỂM CHỨNG (role Neon, DR/PITR) → "đã kiểm chứng, kèm ngày".
- [ ] Mở khoá **H-A.2** (health-check role lúc khởi động dùng đúng truy vấn đã kiểm chứng ở E1–E3).

## Ràng buộc an toàn khi chạy SPIKE

- **KHÔNG** paste chuỗi kết nối/mật khẩu Neon vào chat hay commit — đặt trong `.dev.vars` (gitignore), script đọc từ env.
- Mật khẩu `neondb_owner` đã lộ trong chat trước đây (production-deploy.md §1) → **phải xoay** trước/khi làm staging.
- Probe chỉ ĐỌC (SELECT/count) + set GUC `is_local` trong phiên; KHÔNG ghi/xoá dữ liệu nghiệp vụ.

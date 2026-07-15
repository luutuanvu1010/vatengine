# HANDOFF — Deploy production (nhánh fordex-hardening)

> Viết 2026-07-15. Bàn giao riêng phần **deploy**. Phần tiếp tục vòng lặp FORDEX (đơn vị còn lại, cách chạy loop) nằm ở `HANDOFF-FORDEX.md` — **KHÔNG lặp ở đây**. File này chỉ nói: deploy đã sẵn sàng tới đâu, chặn ở đâu, phải kiểm gì trước, ai làm.

## Trạng thái: CHƯA deploy. Deploy là việc CHỦ DỰ ÁN (Claude không tự deploy production — ranh giới cứng `production-deploy.md` §7 + prompt FORDEX §4).

## ⚠️ 2 KIỂM TRA BẮT BUỘC TRƯỚC KHI DEPLOY nhánh này (có thể làm SẬP dịch vụ nếu bỏ qua)

1. **Hyperdrive PHẢI kết nối bằng role `vat_app`, KHÔNG phải `neondb_owner`.**
   - H-A.2 (`roleGuard.ts`) kiểm role lúc bootstrap và **TỪ CHỐI khởi động** nếu role có `rolsuper`/`rolbypassrls`/sở-hữu-bảng. Đã kiểm chứng (ADR-0004 E1–E2): `vat_app` an toàn, `neondb_owner` **CÓ BYPASSRLS**.
   - Nếu binding Hyperdrive (`id 1011ff82e7154531883f0f2e62d344f0`, cả `apps/api` và `apps/sync-worker`) đang dùng chuỗi `neondb_owner` → deploy xong Worker sẽ fail-fast **mọi request** (đúng về an ninh nhưng sập dịch vụ).
   - **Cách kiểm:** trong Cloudflare dashboard xem connection string của Hyperdrive config, hoặc `wrangler hyperdrive get <id>`. Phải là `postgresql://vat_app:...`. Nếu là owner → tạo lại Hyperdrive config trỏ `vat_app` (xem `packages/db/provisioning/app-role.sql`) trước khi deploy.

2. **H-A.5b thêm Durable Object `LOGIN_LIMITER` + migration `v1` (`apps/api/wrangler.jsonc`).** `wrangler deploy` `apps/api` sẽ áp migration DO — bình thường tự động, nhưng xác nhận không lỗi migration.

## Gate A CHƯA đóng hết → chưa nên phục vụ khách thật

- **H-A.1 E5 (PITR/DR):** chưa làm — chưa chứng minh khôi phục được (tạo Neon past-data-branch, Free history 6h). Xem `HANDOFF-FORDEX.md` §4.
- **H-A.3 (Paid):** app đang Free (CPU 10ms), `limits.cpu_ms` còn comment. Nâng Paid → bỏ comment + flip `PBKDF2_ITERATIONS=600000`.
- **Nhánh chưa hợp nhất** vào nhánh chính (deploy nên từ nhánh chính sạch, không phải feature branch).

## Checklist deploy đầy đủ

Nguồn: `docs/plans/production-deploy.md` (Phase 1 backend + Phase 2 front-door same-origin). Các bước CHỈ chủ dự án làm: dọn DB test (`delete from tenants where mst='9999999999'`), xoay mật khẩu owner, `wrangler secret put JWT_SECRET/TOKEN_KEK`, custom domain + DNS, ẩn API (`workers_dev:false`), **HSTS + Always-HTTPS zone** (H-A.6), **WAF rate-limit rule `/api/auth/login`** (H-A.5b). Đã bổ sung 2 mục H-A.5b/H-A.6 vào DoD Phase 2 của `production-deploy.md`.

## Việc Claude CÓ THỂ chuẩn bị (không chạm production) — chưa làm, để phiên sau nếu cần

- Dry-run build 2 Worker (`wrangler deploy --dry-run`) + SPA (`vite build`) để chắc build sạch.
- Rà + cập nhật `production-deploy.md`: thêm bước "xác nhận Hyperdrive=vat_app" + "áp DO migration" vào Phase 1, đúng thứ tự an toàn.
- Soạn chuỗi lệnh `wrangler` copy-paste kèm kiểm chứng từng bước.

## Thứ tự đề xuất (chủ dự án)

1. Kiểm Hyperdrive = `vat_app` (mục ⚠️1). → 2. Hợp nhất `fordex-hardening` → nhánh chính. → 3. Làm E5 PITR (khép DR). → 4. Quyết H-A.3 (Paid). → 5. Theo `production-deploy.md` Phase 1 → Phase 2. → 6. Sau deploy: bật HSTS zone + WAF rule + `curl -I` xác minh header.

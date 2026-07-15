# HANDOFF — Tiếp tục FORDEX hardening ở phiên mới

> Viết 2026-07-15 để bàn giao cho phiên Claude Code kế tiếp. Đọc file này TRƯỚC, rồi đọc `FORDEX-PROGRESS.md` + `FORDEX-BACKLOG-hardening.md` (cùng thư mục).

## 1. Việc đã làm nằm ở đâu

- **Nhánh:** `fordex-hardening` — **đã push lên `origin`** (https://github.com/luutuanvu1010/vatengine, link PR: `.../pull/new/fordex-hardening`). Nền = `08288d8` (tách từ `feat/cloudflare-stack-u0`).
- **Vì sao nhánh riêng:** hai session Claude từng dùng chung một working tree → va chạm git (rebase đổi nhánh dưới chân + `git clean` xóa docs untracked). FORDEX được **cô lập trong git worktree** `.claude/worktrees/fordex` để an toàn. Chủ dự án đã đồng ý dừng/cách ly session kia.
- **Cần chủ dự án:** hợp nhất `fordex-hardening` → nhánh chính theo chiến lược git (rebase/merge/PR). 14 commit, phân kỳ từ `de3b849`.

## 2. Đã XONG (đều có commit + QA 2 reviewer PASS)

**Gate 0 (ĐÓNG):** H-0.1 coverage gate (`c855432`) · H-0.2 gitleaks CI (`47d57f6`) · H-0.3 dọn packages/core.

**Gate A (phần code):**
- H-A.1 SPIKE (`eb47d0c`, `3befa1f`, `b649deb`, `599f121`): probe role Neon THẬT (`packages/db/provisioning/spike-role-rls-probe.mjs`) → ADR-0004 E1–E4. **Chốt:** vat_app NOBYPASSRLS/không-own-bảng an toàn; **neondb_owner CÓ BYPASSRLS**; RLS FORCE 7/7; fail-closed. *(E5 PITR còn chờ chủ dự án — xem §4.)*
- H-A.2 (`a1c03c4`): `packages/db/roleGuard.ts` + wiring 2 app `db.ts` — kiểm role lúc bootstrap, từ chối khởi động nếu super/bypassrls/owner.
- H-A.5a (`f1e6b71`): login timing anti-enum + audit + PBKDF2 env-config.
- H-A.5b (`a836df3`): DO lockout per-account + WAF checklist (2 lớp).
- H-A.6 (`08288d8`): security header + onError mask + tắt sourcemap.

**Hạ tầng:** hook fix 2-session (`51ae6a8`); FORDEX-PROGRESS + BACKLOG commit vào nhánh (`b6d3b82`, `d7c223b`).

## 3. CÒN LẠI — làm ở phiên mới

**🟢 Thuần code, làm ngay được (khuyến nghị thứ tự):**
1. **H-B.3** — dọn phiên client (P1: rò dữ liệu tenant máy dùng chung). `apps/web`.
2. **H-B.2** — upsert `ON CONFLICT` chống đua 2-sync. `packages/sync/src/sync.ts`.
3. **H-B.4** — fan-out batch/backoff/jitter (mở khóa H-B.5/B.6/C.2). `apps/sync-worker/*`.
4. **H-C.3** — Analytics billing + KV. **H-C.7** — envelope AAD+key-id.

**Chờ tiền đề/tài nguyên:** H-B.5/B.6 (chờ H-B.4) · H-B.1 (cần staging bảng lớn đo EXPLAIN) · H-C.1 (chờ H-B.1 + duyệt ADR) · H-C.2 (chờ H-B.4).

**Chặn-người:** H-A.3 (Paid $) · H-A.4 (staging load test) · H-C.4 (luật sư NĐ13) · H-C.6 (quyết định sản phẩm) · H-C.5 (chạm GDT thật, lịch thưa).

## 4. Việc CHỦ DỰ ÁN cần làm (không phải code)

- **H-A.1 E5 (PITR):** tạo Neon branch "Past data" tại timestamp ≤6h (Free history window = 6 giờ, tài liệu Neon) → xác nhận đọc lại state quá khứ → dán vào ADR-0004 E5. Khép DR.
- **Deploy checklist (production-deploy.md Phase 2):** bật HSTS + Always-HTTPS ở zone Cloudflare (H-A.6); WAF Rate-limit rule cho `/api/auth/login` per-IP (H-A.5b).
- **H-A.3:** duyệt nâng Workers Paid ($5) → bỏ comment `cpu_ms`; đồng thời flip `PBKDF2_ITERATIONS=600000` trong `apps/api/wrangler.jsonc` (đo: 600k~42ms vượt trần Free 10ms).
- **Hợp nhất nhánh** `fordex-hardening` → nhánh chính.

## 5. Cách chạy vòng lặp (cho phiên mới)

Theo `PROMPT-thuc-thi-FORDEX-loop.md` (nếu chủ dự án còn bản; nếu mất, tóm tắt): mỗi đơn vị = một vòng — (1) đọc backlog + context, (2) TDD viết test đỏ trước, (3) hiện thực tối thiểu, (4) `make lint && make test` (trong worktree), (5) `/qa-unit` spawn `dod-auditor` (+ `security-reviewer` nếu auth/token/tenant, + `contract-guardian` nếu GDT), (6) commit nhỏ một đơn vị, (7) DỪNG báo cáo. Một đơn vị mỗi lượt. Không đoán tiền đề hệ thống ngoài — DỪNG hỏi.

**Lưu ý môi trường:**
- Làm trong worktree `.claude/worktrees/fordex` (node_modules đã cài riêng).
- `make test` có thể flake do PGlite `beforeEach` >10s khi máy tải nặng — chạy lại/chạy workspace riêng (`npx vitest run --root apps/api`) để phân biệt flake vs lỗi thật.
- gitleaks binary (nếu cần kiểm bí mật cục bộ) tải bản 8.28.0; CI đã có job `secret-scan`.

# SỔ TIẾN ĐỘ — Thực thi FORDEX (Loop Engineering)

> **Tái dựng 2026-07-15** sau khi bản untracked ở thư mục chính bị session khác xóa (git clean khi rebase). Nay **commit vào nhánh `fordex-hardening`** để bền vững. Code deliverables (commit) chưa bao giờ mất.

- **Nhánh:** `fordex-hardening` (worktree `.claude/worktrees/fordex`, nền `08288d8` từ `feat/cloudflare-stack-u0`). Cần hợp nhất về nhánh chính khi rảnh.
- Trạng thái: `Chưa bắt đầu` · `Đủ điều kiện` · `Xong` · `Chặn-người` · `Chờ tiền đề`.

## Tiền đề CHƯA KIỂM CHỨNG
| Tiền đề | SPIKE | Gating | Trạng thái |
|---|---|---|---|
| Thuộc tính role Neon + hiệu lực RLS thật | H-A.1 | H-A.2 | ✅ **ĐÃ KIỂM CHỨNG 2026-07-15** (ADR-0004 E1–E4, `eb47d0c`): vat_app NOBYPASSRLS, neondb_owner CÓ BYPASSRLS, RLS FORCE 7/7, fail-closed |
| Neon backup/PITR/DR khôi phục được | H-A.1 | (DR Cụm 2) | CHỜ E5 (chủ dự án tạo past-data-branch Neon Console; Free history=6h) |
| Định dạng `tdlap` từ GDT (4 họ endpoint) | H-C.5 | khóa tự nhiên | Chưa bắt đầu |

## Tiến độ theo cổng
| Đơn vị | Loại | Trạng thái | Commit |
|---|---|---|---|
| **GATE 0 — ĐÓNG** | | | |
| H-0.1 | CODE | Xong — ép coverage ≥80% packages qua make test + apps nightly | `c855432` |
| H-0.2 | OPS | Xong — gitleaks quét bí mật toàn lịch sử CI (sha256-verify, allowlist scope AND) | `47d57f6` |
| H-0.3 | CODE | Xong — xóa `packages/core` ma (untracked, không diff) | (—) |
| **GATE A — chặn deploy production** | | | |
| H-A.1 | SPIKE | E1–E4 Xong, E5 chờ-người — probe Neon thật; vat_app an toàn, neondb_owner BYPASSRLS | `eb47d0c` |
| H-A.2 | CODE | Xong — health-check role bootstrap (roleGuard.ts + wiring 2 app db.ts, fail-fast) | `a1c03c4` |
| H-A.3 | OPS | Chặn-người (nâng Workers Paid $ — cũng flip PBKDF2 600k) | — |
| H-A.4 | OPS | Chưa bắt đầu (tách 2 Hyperdrive config + load test staging) | — |
| H-A.5a | CODE | Xong — login: verify-giả chống timing enum + audit + PBKDF2 env-config | `f1e6b71` |
| H-A.5b | CODE | Xong — DO lockout per-account (429) + WAF per-IP checklist (2 lớp) | `a836df3` |
| H-A.6 | CODE | Xong — security header + onError mask + tắt sourcemap production | `08288d8` |
| **GATE B — chặn quy mô** | | | |
| H-B.1 | CODE | Chưa bắt đầu — composite index CONCURRENTLY (cần staging bảng lớn đo EXPLAIN) | — |
| H-B.2 | CODE | Xong — INSERT thuần → `ON CONFLICT DO UPDATE` (suy ra khóa tự nhiên 6 trường) khử đua 2-sync; test race tất định (proxy che SELECT) + test nhánh ON CONFLICT dưới RLS FORCE/non-superuser; QA2 PASS (dod+security). | (commit đơn vị) |
| H-B.3 | CODE | Xong (phần P1) — `queryClient.clear()` + `clearInvoiceFilter()` ở 3 ranh giới phiên (logout/401/login); QA2 PASS (dod+security). **Hoãn có chủ đích:** tenantId-in-queryKey (thừa vì clear() bao trùm mọi cache ở mọi ranh giới; client cố ý không có tenant_id — apiClient) và `--text-disabled` (đã định nghĩa sẵn tokens.css:33). Ràng buộc tương lai: mọi luồng đổi phiên/tenant MỚI phải gọi cleanup này (xem `.claude/rules/multi-tenant.md`). | (commit đơn vị) |
| H-B.4 | CODE | Xong — fan-out: `chunkForQueue` ≤100/≤256KB + `jitterDelaySeconds` (hash-tenant) + `consumerAction` tách backpressure (rate_limited/breaker_open → reenqueue msg mới có delay, KHÔNG tính max_retries) khỏi lỗi thật; **trần `bpAttempt` (mặc định 10) → rơi dead-letter** chặn vòng lặp vô hạn (fix Major security-review); `max_concurrency:3`. QA2 PASS (dod+security). | (commit đơn vị) |
| H-B.5 | CODE | Chờ H-B.4 — sharding set-based | — |
| H-B.6 | CODE | Xong (a)+(b) — DLQ consumer (dong_bo_that_bai + audit CRITICAL + replay thủ công) + EgressHealth-gate GEO_BLOCKED (scheduled + consumer). Hoãn (c) quota toàn cục → H-B.6c. | (commit đơn vị) |
| H-B.6c | CODE | Chưa bắt đầu — DO global-egress quota tổng; HỢP NHẤT BACKLOG #1 (rate-limit toàn cục GDT). | — |
| **GATE C — chặn thương mại hóa** | | | |
| H-C.1 | DECISION+CODE | Chờ H-B.1 — partition/retention/R2 cold-tier (cần duyệt ADR) | — |
| H-C.2 | CODE | Chờ H-B.4 — XLSX job nền + stream R2 | — |
| H-C.3 | CODE | HOÃN (2026-07-16, chủ dự án quyết) — phần A (Analytics billing per-tenant) rõ ràng làm được; phần B "KV session/cấu hình" **DRIFT**: ADR-0003 chốt JWT giữ TRONG BỘ NHỚ → không còn session server để đưa vào KV, và chưa có cấu hình cụ thể nào cần KV. Cần yêu cầu cụ thể cho KV trước khi làm (không tự bịa nguồn sự thật thứ 2). | — |
| H-C.4 | CODE+DECISION | Chặn-người (pháp lý NĐ13 — luật sư) | — |
| H-C.5 | CODE | Chưa bắt đầu — contract test `tdlap` (chạm GDT, lịch thưa) | — |
| H-C.6 | DECISION | Chặn-người (sản phẩm — vòng đời token/captcha) | — |
| H-C.7 | CODE | Chưa bắt đầu — envelope AAD + key-id (🟢) | — |

Ghi chú: 🟢 = thuần code, làm ngay được không cần tài nguyên chủ dự án.

## Hạ tầng / quản trị
- **Hook fix** (`51ae6a8`): `gate-dod.sh` gate worktree của phiên (đọc `.cwd` từ payload) thay vì luôn CLAUDE_PROJECT_DIR — gỡ kẹt 2-session. (Bản main-tree đang uncommitted.)
- **⚠️ VA CHẠM 2-SESSION (tái diễn):** session `feat/ho-so-tenant-sua-duoc` rebase + git clean trong THƯ MỤC CHÍNH chung → (1) đổi nhánh dưới chân, (2) xóa untracked docs/audit. FORDEX cô lập trong worktree nên code an toàn, nhưng untracked docs ở main tree bị mất. **Cần chủ dự án:** dừng thao tác phá hủy của session kia trong repo chung, HOẶC cho mỗi session một worktree riêng.
- **Cần hợp nhất:** `fordex-hardening` (11 commit FORDEX) → nhánh chính theo chiến lược git của chủ dự án.

## Điểm cần chủ dự án (tổng hợp)
- H-A.1 E5 (PITR): tạo past-data-branch trên Neon Console.
- Deploy: bật HSTS+Always-HTTPS zone (H-A.6) + WAF rate-limit login (H-A.5b) khi go-live.
- H-A.3: duyệt nâng Workers Paid (flip PBKDF2 600k). H-A.4: 2 Hyperdrive config + staging.
- Hợp nhất nhánh + giải quyết va chạm 2-session.

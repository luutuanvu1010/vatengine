# BACKLOG GIA CỐ (H-series) — thực thi kế hoạch FORDEX theo Loop Engineering

> **Tái dựng 2026-07-15** (bản untracked ở thư mục chính bị session khác `git clean`). Nay commit vào nhánh `fordex-hardening`. Nội dung khôi phục từ bản đọc đầu phiên; nếu chủ dự án có bản gốc khác, ưu tiên bản gốc.

- **Nguồn:** `FORDEX-khac-phuc-tan-goc-2026-07-15.md` (7 cụm) → tách thành **đơn vị vòng lặp nhỏ** (một đơn vị = một vòng `/start-unit`).
- **Quy ước:** mỗi đơn vị mã **H-<cổng>.<số>**. **Loại:** `CODE` (TDD đầy đủ) · `SPIKE` (kiểm chứng tiền đề, sinh bằng chứng + ADR, KHÔNG đoán) · `OPS` (cấu hình deploy + smoke test bằng chứng thật) · `DECISION` (ADR/đề xuất + người ký duyệt). Đơn vị SPIKE/OPS/DECISION **không đóng bằng test thuần** — đóng bằng **bằng chứng tái lập + duyệt của người**.
- **Review chéo (`/qa-unit`):** `dod-auditor` luôn; `security-reviewer` nếu đụng xác thực/token/tenant; `contract-guardian` nếu đụng `packages/gdt-client`/endpoint thuế.
- **Cột "Chặn":** đơn vị phải xong trước thì đơn vị này mới đủ điều kiện.

---

## GATE 0 — Bảo vệ vòng lặp (làm NGAY) — ✅ ĐÓNG

**H-0.1 · CODE · Ép ngưỡng coverage vào CI + Stop gate** *(Cụm 7)* — ✅ `c855432`
- `make test` đo coverage `packages/**`, fail nếu < 80%; apps coverage nightly (không chặn PR).

**H-0.2 · OPS · Quét bí mật gitleaks trong CI** *(Cụm 7)* — ✅ `47d57f6`
- gitleaks chuẩn quét toàn lịch sử; commit secret giả → CI fail.

**H-0.3 · CODE · Dọn `packages/core` rỗng** *(Cụm 7)* — ✅ (xóa dir ma untracked)

---

## GATE A — Chặn deploy production

**H-A.1 · SPIKE · Kiểm chứng role Neon + RLS thật + PITR** *(Cụm 3 + Cụm 2-DR)* — 🟡 E1–E4 `eb47d0c`, E5 chờ-người
- Trên Neon bằng đúng role app: xác nhận `rolsuper=false, rolbypassrls=false`, không sở hữu bảng; kịch bản cách ly xuyên-tenant trả 0 hàng; **một phép PITR thật**. Giải quyết "neondb_owner có BYPASSRLS?". → GATES **H-A.2**.

**H-A.2 · CODE · Health-check khởi động role DB (fail-fast)** *(Cụm 3)* — ✅ `a1c03c4`
- Worker kiểm role lúc bootstrap (`pg_roles`/`pg_class`), từ chối khởi động nếu superuser/bypassrls/owner; cache. Chặn: **H-A.1**.

**H-A.3 · OPS · Nâng Workers Paid + bật `limits.cpu_ms`** *(Cụm 5)* — Chặn-người (chi phí)
- Nâng Paid; bỏ comment `cpu_ms` (api 30s, sync 300s); smoke đo CPU job tenant lớn < trần.

**H-A.4 · OPS · Tách 2 Hyperdrive config (api/sync) + giới hạn concurrency** *(Cụm 5)*
- Mỗi Worker một Hyperdrive config; `max_concurrency` consumer chừa rổ ~100 cho API. Load test burst staging.

**H-A.5 · CODE · Gia cố `/auth/login`** *(Cụm 6)* — ✅ H-A.5a `f1e6b71` + H-A.5b `a836df3`
- Rate-limit/lockout (DO per-email/IP) + audit login SaaS + verify giả cân bằng timing + nâng PBKDF2 (đo CPU; tương thích ngược). *(2 lớp: WAF per-IP edge + DO per-account app — quyết định chủ dự án.)*

**H-A.6 · CODE · Security header + `onError` + tắt sourcemap production** *(Cụm 6)* — ✅ `08288d8`
- `worker.ts` CSP/XFO/nosniff/Referrer (+ HSTS tầng zone); `app.onError` `{error:'internal'}` + log mask; `sourcemap:false` production.

---

## GATE B — Chặn quy mô (trước khi nhận khách đông)

**H-B.1 · CODE · Composite index qua migration CONCURRENTLY** *(Cụm 2)*
- `hoa_don (tenant_id, tdlap DESC, id DESC)` (+ `(tenant_id, chieu, tdlap)`); index `lan_dong_bo (tenant_id, bat_dau)` + FK `taikhoan_id`; `audit_log (tenant_id, tao_luc)`; `dong_hang_hoa (tenant_id)`. Chạy `CONCURRENTLY` ngoài transaction (runner phi-giao-dịch riêng).
- Nghiệm thu: `EXPLAIN ANALYZE` hot path → index scan; migration không khóa lâu (bảng lớn giả lập staging).

**H-B.2 · CODE · Upsert `ON CONFLICT` + test đồng thời** *(Cụm 1/2)*
- SELECT-rồi-INSERT → `INSERT … ON CONFLICT ON CONSTRAINT hoa_don_natural_key DO UPDATE`.
- Nghiệm thu: 2-sync-song-song cùng (tenant,kỳ,chiều) → không vỡ transaction, không ghi `failed` oan, không nhân đôi. File: `packages/sync/src/sync.ts`.

**H-B.3 · CODE · Dọn trạng thái phiên client** *(Cụm 4)*
- `queryClient.clear()` khi logout/onUnauthorized/sau login; `removeItem` filter; `tenantId` vào queryKey; sửa `--text-disabled`.
- Nghiệm thu: logout → login người khác → không thấy dữ liệu tenant cũ; localStorage xóa; test front-door `worker.ts`. File: `apps/web/src/features/auth/*`, `lib/filterStore.ts`, hook query, `styles/tokens.css`.

**H-B.4 · CODE · Fan-out (1): batch + backoff + jitter** *(Cụm 1)*
- Chia `sendBatch` ≤100/≤256KB; jitter `delaySeconds` theo hash-tenant; `max_concurrency` consumer; `rate_limited` → `retry({delaySeconds})` TÁCH khỏi lỗi thật, không tính vào `max_retries`; `breaker_open` → retry có delay. File: `apps/sync-worker/*`, `wrangler.jsonc`.

**H-B.5 · CODE · Fan-out (2): sharding set-based** *(Cụm 1)* — Chặn: **H-B.4**
- Cron enqueue "shard[i]" (dải tenant); consumer shard truy vấn set-based liệt kê tài khoản đến hạn → enqueue job con. Staging 100k giả lập đo < 15' wall, < 10.000 subrequest/lần.

**H-B.6 · CODE · Vòng khép kín DLQ + EgressHealth + quota tổng** *(Cụm 1)* — Chặn: **H-B.4**
- Consumer `vat-sync-dlq` (audit CRITICAL + cảnh báo + phát lại); đọc `EgressHealth` trước enqueue (GEO_BLOCKED → skip nhanh); DO `global-egress` quota tổng.

---

## GATE C — Chặn thương mại hóa

**H-C.1 · DECISION+CODE · Partition + retention + cold-tier `raw_json` sang R2** *(Cụm 2)* — Chặn: **H-B.1**, cần duyệt ADR
- Partition `hoa_don` theo tháng `tdlap`; retention (drop partition cũ); đẩy `raw_json` lịch sử sang R2 (con trỏ DB); bỏ lưu trùng dòng hàng.

**H-C.2 · CODE · XLSX kết xuất qua job nền + tải stream R2** *(Cụm 5)* — Chặn: **H-B.4**
- Đẩy dựng XLSX sang job nền; tải về stream từ R2 thay vì buffer. Đo không chạm 128MB/CPU tenant lớn.

**H-C.3 · CODE · Wire Analytics Engine (billing) + KV (session/config)** *(Cụm 5)*
- Data-point per-tenant sự kiện tính phí (đồng bộ, HĐ mới, kết xuất); KV session/cấu hình (eventual consistency + 1 write/s/key).

**H-C.4 · CODE+DECISION · NĐ13: thu hồi ủy quyền + xóa/xuất dữ liệu** *(Cụm 6)* — cần luật sư
- Luồng thu hồi ủy quyền (dừng đồng bộ + vô hiệu token); xóa/xuất dữ liệu chủ thể; rà soát pháp lý nơi đặt dữ liệu (Neon Singapore).

**H-C.5 · CODE · Contract test định kỳ `tdlap` + `date_trunc('second')`** *(Cụm 7, U13)*
- Contract test 4 họ endpoint (query/sco × purchase/sold) kiểm định dạng `tdlap`; `date_trunc('second', tdlap)` trước khóa tự nhiên. Chạm GDT thật → lịch thưa.

**H-C.6 · DECISION · Ràng buộc token/captcha (§6.8)** *(Cụm 7)* — cần người quyết
- Quyết định sản phẩm: nhắc đăng nhập lại đúng lúc, truyền đạt rõ giới hạn "đồng bộ tự động".

**H-C.7 · CODE · Envelope AAD + key-id** *(Cụm 6)*
- `additionalData = tenantId|taikhoanId` cho wrap + data; thêm key-id vào định dạng. Test: tráo ciphertext giữa hai bản ghi → giải mã thất bại.

---

### Sơ đồ phụ thuộc chính
`H-A.1 → H-A.2` · `H-B.4 → {H-B.5, H-B.6, H-C.2}` · `H-B.1 → H-C.1`. Thứ tự cổng: **0 → A → B → C**.

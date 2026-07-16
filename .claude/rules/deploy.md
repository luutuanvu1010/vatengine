---
paths:
  - "packages/db/migrations/**"
  - "apps/*/wrangler.jsonc"
  - "docs/plans/production-deploy.md"
  - "docs/audit/HANDOFF-DEPLOY.md"
---

# Luật: Trình tự deploy (code Worker vs. migration DB)

Cụ thể hoá nguyên tắc "mọi thay đổi phải truy được về artifact hoặc quyết định đã có" và "không tối ưu tốc độ bằng cách bỏ cổng, bỏ bước" trong Hiến pháp (CLAUDE.md). Runtime: Cloudflare Workers + Postgres qua Hyperdrive (ADR-0001).

## Sự cố nền (bằng chứng, 2026-07-16)

`wrangler deploy` chỉ đẩy code Worker — **không** tự chạy Drizzle migration (đó là bước riêng, `make migrate` / `drizzle-kit migrate`, cần `DATABASE_URL` trực tiếp, không qua Hyperdrive). Migration `0005_real_wendell_vaughn.sql` (thêm cột `ban_quyen`/`ghi_chu` vào `tenants`, PR#3) được merge nhưng chưa áp lên Postgres production. Một phiên sau đó deploy lại `apps/api` (mang code route `/me` đã SELECT 2 cột này) mà **không kiểm tra migration đang chờ trước** → mọi lần đăng nhập gọi `GET /me` ngay sau `POST /auth/login` đều vỡ 500 (`Failed query: select ... "ban_quyen", "ghi_chu" from "tenants"`), dù xác thực (`/auth/login`) vẫn đúng. Root cause: **thứ tự đảo ngược** — deploy code trước, migrate DB sau (hoặc quên hẳn).

## Bắt buộc

- **Trình tự KHÔNG được đảo ngược: migrate DB TRƯỚC, deploy Worker phụ thuộc schema đó SAU.** Không bao giờ deploy code đọc/ghi cột hoặc bảng mới trước khi migration tương ứng đã chạy thành công trên production.
- Trước khi `wrangler deploy` (hoặc `npm run deploy`) cho `apps/api` / `apps/sync-worker`, kiểm `packages/db/migrations/meta/_journal.json`: nếu có migration mới hơn lần `make migrate` gần nhất đã chạy trên production, **chạy `make migrate` trước** — kể cả khi deploy chỉ nhằm mục đích khác (vd. một nhánh hardening không tự thêm migration) — vì code merge vào nhánh deploy có thể đã mang theo migration của người khác.
- Mọi migration trong repo này viết dạng cộng dồn, an toàn chạy lại (`ADD COLUMN IF NOT EXISTS`, …) — `make migrate` **luôn an toàn để chạy trước mỗi lần deploy**, kể cả khi không chắc đã áp hay chưa. Không suy đoán "chắc áp rồi" — chạy lại để biết chắc (nguyên tắc bằng chứng, CLAUDE.md).
- Sau khi deploy, xác minh bằng smoke test đụng đúng cột/bảng mới (không chỉ `/health`) — ví dụ ở sự cố này, `/health` vẫn 200 trong khi `/me` đã 500; `/health` không đủ để kết luận deploy an toàn.

## Khi gặp mơ hồ

Nếu không chắc production đã có migration mới nhất hay chưa và không truy cập được `DATABASE_URL` production để tự kiểm/chạy, dừng và hỏi chủ dự án — không tự suy đoán rồi deploy code phụ thuộc schema chưa xác nhận.

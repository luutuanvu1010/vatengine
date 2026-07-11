# PR: Chuyển ngăn xếp sang Cloudflare + dựng khung U0

Nhánh đề xuất: `feat/cloudflare-stack-u0`

## Tóm tắt

Theo **ADR-0001** (đã Accepted), chuyển toàn bộ nền tảng sang hệ sinh thái **Cloudflare**, ngôn ngữ **TypeScript**, và dựng khung dự án **U0** (monorepo Wrangler + CI + lint/test). PR gồm hai phần: (A) **sửa Hiến pháp + luật + hook** cho nhất quán với quyết định, (B) **khung U0** chạy được.

Quyết định đã chốt: **4A = A2** (PostgreSQL ngoài + Hyperdrive) · **4B = B1** (TypeScript) · Egress **T0 thuần Cloudflare** (đã kiểm chứng gọi được GDT, HTTP 200 từ colo SG), giữ **T1 relay VN** làm fallback.

## A. Quản trị (sửa Hiến pháp — có chủ đích, theo khung dự án)

- `CLAUDE.md`: thay mục **Ngăn xếp công nghệ** (Python/FastAPI/Postgres/Celery → Workers/TS/Hono/Postgres+Hyperdrive/Queues+Workflows+Durable Objects), **Lệnh chuẩn** (pytest/ruff/uvicorn → Vitest/Biome/Wrangler), cập nhật **Kiến trúc — quy tắc cứng** (adapter `packages/gdt-client` + `GdtTransport`, nền qua Queues→Workflows, trạng thái ở Durable Objects). **Giữ nguyên** ranh giới pháp lý/đạo đức, khóa tự nhiên, idempotent, `tenant_id`, cô lập adapter.
- `.claude/rules/{gdt-adapter,multi-tenant,security,testing}.md`: đổi `paths` + chi tiết vận hành sang TS/Cloudflare; giữ nguyên tinh thần từng luật.
- `.claude/hooks/{auto-lint,gate-dod}.sh`: auto-lint chạy Biome cho `.ts`; gate DoD theo dõi `apps/`+`packages/`. `make lint`/`make test` vẫn là interface ổn định.
- `docs/adr/0001-nen-tang-cloudflare.md`: ADR đầy đủ (bối cảnh, phân tích A1/A2/A3 & B1/B2, chiến lược egress 5B, kết quả spike, hệ quả, rủi ro). Trạng thái **Accepted**.

## B. Khung U0 (chạy được)

Monorepo npm workspaces:

```
package.json (workspaces)  tsconfig.base.json  biome.json  Makefile  .github/workflows/ci.yml
apps/api/            # Worker API (Hono) — /health, stateless; wrangler.jsonc; vitest-pool-workers
packages/gdt-client/ # Adapter cô lập: GdtTransport (nguồn chân lý), endpoints, GdtError
spikes/gdt-egress-probe/  # Spike probe egress (đã có)
backend/  frontend/  # Di sản MVP Python/HTML — GIỮ để port ở U1–U3, không phát triển tiếp
```

- `make lint` → Biome + `tsc --noEmit`; `make test` → Vitest (Miniflare); `make test-contract` → nhóm contract; `make run` → `wrangler dev`.
- CI: lint + typecheck + test cho mỗi PR; contract test chạy theo lịch (không chặn PR).

## Cách kiểm chứng (reviewer)

```bash
npm install
make lint        # Biome + tsc
make test        # health-check qua runtime Workers
```

## Chưa làm trong PR này (đúng phạm vi U0)

- Chưa port logic đăng nhập/truy vấn từ `backend/gdt_client.py` sang TS (để U1–U3).
- Chưa tạo Hyperdrive/D1/KV/R2/Queues/Durable Objects thật (binding để comment trong `wrangler.jsonc`, bật dần theo lộ trình).
- Chưa dựng frontend SPA (mới placeholder).

## Rủi ro còn theo dõi

- Egress: T0 đạt **sơ bộ** (1 lần, colo SG, endpoint công khai). Contract test định kỳ sẽ theo dõi nhiều colo/tải cao/endpoint có token; nếu bị chặn, kích hoạt T1 (relay VN).
- `backend/` Python còn tồn tại như tài liệu tham chiếu; sẽ gỡ sau khi port xong (tránh code chết kéo dài).

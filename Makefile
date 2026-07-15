.PHONY: test test-contract test-coverage-apps lint typecheck run migrate up install

# Interface ổn định cho các hook DoD; bên dưới bọc npm/Wrangler (ADR-0001).

install:
	npm install

up: install
	@echo "Môi trường dev: npm workspaces đã cài. Postgres/Hyperdrive cấu hình qua apps/api/.dev.vars (xem .dev.vars.example)."

lint:
	npx biome check .
	npm run typecheck --workspaces --if-present

typecheck:
	npm run typecheck --workspaces --if-present

# H-0.1: mỗi package chạy `vitest run --coverage` → ép ngưỡng coverage ≥80%
# (khai báo trong từng packages/*/vitest.config.ts). Coverage < 80% ở BẤT KỲ
# package nào → lệnh này thoát khác 0 → chặn PR (CI job `quality`) và Stop hook
# (gate-dod.sh gọi `make test`). Apps KHÔNG ép coverage ở đây để giữ PR nhanh
# (test api ~150s) — apps đo coverage nightly qua `test-coverage-apps`.
test:
	npm run test --workspaces --if-present

test-contract:
	npm run test:contract --workspaces --if-present

# H-0.1: coverage cho apps — chạy NIGHTLY (CI job `coverage-apps`), KHÔNG chặn PR.
# Apps giữ `test` = `vitest run` (nhanh) cho PR; ngưỡng ≥80% khai báo sẵn trong
# từng apps/*/vitest.config.ts và được đo ở đây.
test-coverage-apps:
	npm run test -w apps/api -- --coverage
	npm run test -w apps/web -- --coverage
	npm run test -w apps/sync-worker -- --coverage

run:
	npm run dev -w apps/api

migrate:
	@echo "Áp migration Drizzle (@vat/db) lên DATABASE_URL — đặt trong packages/db/.dev.vars (xem .dev.vars.example). Test tự động dùng PGlite offline, không cần DB thật."
	npm run migrate -w packages/db

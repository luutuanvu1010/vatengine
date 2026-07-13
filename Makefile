.PHONY: test test-contract lint typecheck run migrate up install

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

test:
	npm run test --workspaces --if-present

test-contract:
	npm run test:contract --workspaces --if-present

run:
	npm run dev -w apps/api

migrate:
	@echo "Áp migration Drizzle (@vat/db) lên DATABASE_URL — đặt trong packages/db/.dev.vars (xem .dev.vars.example). Test tự động dùng PGlite offline, không cần DB thật."
	npm run migrate -w packages/db

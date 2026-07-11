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
	@if npm run --workspaces --if-present migrate 2>/dev/null; then \
		echo "Đã chạy migrate."; \
	else \
		echo "Chưa có package DB/migrations (thêm ở U4 — mô hình dữ liệu, xem KIEN_TRUC_VA_KE_HOACH.md mục 7)."; \
	fi

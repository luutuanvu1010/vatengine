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

# VÌ SAO phải tự nạp: `packages/db/drizzle.config.ts` chỉ đọc `process.env.DATABASE_URL`, mà
# `.dev.vars` KHÔNG phải `.env` nên không công cụ nào nạp nó ⇒ url rỗng và drizzle-kit báo
# "Please provide required params for Postgres driver: [x] url: ''". Cái bẫy này đã ăn thời
# gian hai lần (gotcha U17b — docs/plans/deploy-u18-u19.md; và 2026-07-28), nên nạp Ở ĐÂY,
# một chỗ duy nhất, thay vì bắt người deploy nhớ một lệnh dài.
#
# KHÔNG dùng `source .dev.vars`: connection string chứa `&`, shell hiểu thành "chạy nền" và
# vỡ (đã ghi trong deploy-u18-u19.md). Dùng grep+cut lấy NGUYÊN VĂN phần sau dấu `=` ĐẦU
# TIÊN — `cut -f2-` giữ nguyên mọi `=` phía sau (mật khẩu có thể chứa `=`).
#
# Biến môi trường có sẵn THẮNG file: CI dùng secret, và người deploy vẫn `export` được để
# trỏ tạm sang DB khác. Cả recipe đi sau `@` nên lệnh không bị in ra — connection string
# KHÔNG rơi vào terminal/log (.claude/rules/security.md).
migrate:
	@echo "Áp migration Drizzle (@vat/db) lên Postgres. Nguồn DATABASE_URL: biến môi trường nếu có, không thì packages/db/.dev.vars. Test tự động dùng PGlite offline, không cần DB thật."
	@set -eu; \
	url="$${DATABASE_URL:-}"; \
	if [ -z "$$url" ] && [ -f packages/db/.dev.vars ]; then \
	  url="$$(grep -m1 '^[[:space:]]*DATABASE_URL=' packages/db/.dev.vars \
	    | cut -d= -f2- \
	    | tr -d '\r' \
	    | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$$//' \
	          -e 's/^"\(.*\)"$$/\1/' -e "s/^'\(.*\)'\$$/\1/")"; \
	fi; \
	if [ -z "$$url" ]; then \
	  echo "" >&2; \
	  echo "LỖI: không tìm thấy DATABASE_URL — không có gì để kết nối, dừng trước khi gọi drizzle." >&2; \
	  echo "  Cách 1 (thường dùng): thêm dòng DATABASE_URL=postgresql://... vào packages/db/.dev.vars" >&2; \
	  echo "                        (mẫu: packages/db/.dev.vars.example)." >&2; \
	  echo "  Cách 2 (tạm thời):    export DATABASE_URL='postgresql://...' — nháy ĐƠN, vì chuỗi chứa &." >&2; \
	  echo "" >&2; \
	  exit 1; \
	fi; \
	DATABASE_URL="$$url" npm run migrate -w packages/db

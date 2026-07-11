#!/bin/bash
# PostToolUse hook — cổng kiểm soát "kết quả trung gian".
# Tự động format/lint file Python ngay sau khi Claude sửa, để lỗi style/type
# lộ ra sớm thay vì dồn tới cuối phiên.
set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')

case "$FILE_PATH" in
  *.ts|*.tsx|*.jsonc|*.json)
    # Ngăn xếp TypeScript/Cloudflare: dùng Biome (nếu đã cài qua npm workspace).
    if [ -f "$PROJECT_DIR/node_modules/.bin/biome" ]; then
      "$PROJECT_DIR/node_modules/.bin/biome" check --write --no-errors-on-unmatched "$FILE_PATH" || true
      REMAINING=$("$PROJECT_DIR/node_modules/.bin/biome" check --no-errors-on-unmatched "$FILE_PATH" 2>&1 || true)
      if [ -n "$REMAINING" ]; then
        echo "Biome còn cảnh báo chưa tự sửa được trong $FILE_PATH:"
        echo "$REMAINING"
      fi
    fi
    ;;
  *.py)
    # Di sản backend/ Python (chỉ giữ tham chiếu — xem ADR-0001).
    if command -v ruff >/dev/null 2>&1; then
      ruff check --fix --quiet "$FILE_PATH" || true
      ruff format --quiet "$FILE_PATH" || true
    fi
    ;;
esac

exit 0

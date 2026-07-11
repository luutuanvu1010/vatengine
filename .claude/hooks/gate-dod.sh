#!/bin/bash
# Stop hook — cổng kiểm soát "kết quả đầu ra" (Definition of Done).
# Nếu lượt làm việc này đã sửa code backend, ép chạy `make lint && make test`
# xanh trước khi cho phép kết thúc lượt. Đây là cổng kỹ thuật, không phụ
# thuộc việc Claude có tự giác chạy lint/test hay không.
set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_DIR" || exit 0

# Chỉ gate khi có thay đổi chưa commit trong mã nguồn (apps/ packages/, hoặc backend/ di sản).
if ! command -v git >/dev/null 2>&1 || [ ! -d .git ]; then
  exit 0
fi

CHANGED=$(git status --porcelain -- apps packages backend 2>/dev/null || true)
if [ -z "$CHANGED" ]; then
  exit 0
fi

if [ ! -f Makefile ]; then
  # U0 (bootstrap Makefile) chưa chạy — không có gì để gate.
  exit 0
fi

LINT_OUT=$(make lint 2>&1)
LINT_STATUS=$?

if [ $LINT_STATUS -ne 0 ]; then
  jq -n --arg reason "make lint thất bại, chưa đạt Definition of Done:

$(echo "$LINT_OUT" | tail -60)" '{decision: "block", reason: $reason}'
  exit 0
fi

TEST_OUT=$(make test 2>&1)
TEST_STATUS=$?

if [ $TEST_STATUS -ne 0 ]; then
  jq -n --arg reason "make test thất bại, chưa đạt Definition of Done:

$(echo "$TEST_OUT" | tail -60)" '{decision: "block", reason: $reason}'
  exit 0
fi

exit 0

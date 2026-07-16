#!/bin/bash
# Stop hook — cổng kiểm soát "kết quả đầu ra" (Definition of Done).
# Nếu lượt làm việc này đã sửa code backend, ép chạy `make lint && make test`
# xanh trước khi cho phép kết thúc lượt. Đây là cổng kỹ thuật, không phụ
# thuộc việc Claude có tự giác chạy lint/test hay không.
set -uo pipefail

# Gate ĐÚNG worktree mà PHIÊN đang làm việc, KHÔNG luôn CLAUDE_PROJECT_DIR. Khi nhiều
# phiên chia sẻ một .git (mỗi phiên một git worktree), gate CLAUDE_PROJECT_DIR (thư mục
# chính) sẽ để công việc dở của phiên A chặn phiên B. Payload Stop hook (JSON trên stdin)
# có `.cwd` = thư mục làm việc của phiên → dùng nó. Fallback: CLAUDE_PROJECT_DIR → pwd.
INPUT=$(cat 2>/dev/null || true)
SESSION_CWD=""
if command -v jq >/dev/null 2>&1 && [ -n "$INPUT" ]; then
  SESSION_CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // empty' 2>/dev/null || true)
fi
PROJECT_DIR="${SESSION_CWD:-${CLAUDE_PROJECT_DIR:-$(pwd)}}"
cd "$PROJECT_DIR" || exit 0

# Chỉ gate khi có thay đổi chưa commit trong mã nguồn (apps/ packages/, hoặc backend/ di sản).
# Dùng `git rev-parse --is-inside-work-tree` (KHÔNG `[ -d .git ]`): trong git worktree,
# `.git` là FILE trỏ về repo chính, nên check thư mục cũ sẽ bỏ sót worktree.
if ! command -v git >/dev/null 2>&1 || ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
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

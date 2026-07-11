#!/bin/bash
# UserPromptSubmit hook — cổng kiểm soát "prompt đầu vào".
# Ghi audit log mọi prompt gửi tới Claude trong dự án (ai/khi nào/nội dung),
# phục vụ yêu cầu Hiến pháp: "Ghi audit log cho hành động nhạy cảm" và
# giám sát thực thi Prompt cho toàn bộ dự án.
set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
LOG_DIR="$PROJECT_DIR/.claude/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/prompt-audit.log"

INPUT=$(cat)
PROMPT=$(echo "$INPUT" | jq -r '.prompt // ""' 2>/dev/null || echo "")
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"' 2>/dev/null || echo "unknown")
TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Escape newlines để mỗi bản ghi audit nằm trên 1 dòng (JSON Lines).
jq -nc --arg ts "$TS" --arg session "$SESSION_ID" --arg prompt "$PROMPT" \
  '{ts: $ts, session_id: $session, prompt: $prompt}' >> "$LOG_FILE" 2>/dev/null || \
  echo "$TS | $SESSION_ID | $PROMPT" >> "$LOG_FILE"

exit 0

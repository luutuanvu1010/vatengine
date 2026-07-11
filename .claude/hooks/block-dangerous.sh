#!/bin/bash
# PreToolUse hook — cổng kiểm soát "hành động nguy hiểm".
# Chặn cứng (deny) các hành vi vi phạm Hiến pháp/Luật trước khi chúng chạy,
# bất kể Claude có "quyết định" tuân theo hay không.
set -euo pipefail

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""')

deny() {
  jq -n --arg reason "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
  exit 0
}

if [ "$TOOL_NAME" = "Bash" ]; then
  CMD=$(echo "$INPUT" | jq -r '.tool_input.command // ""')

  # Heuristic best-effort: bắt cờ đệ quy ở BẤT KỲ thứ tự nào (-rf, -fr, -Rf,
  # --recursive...) nhắm vào migrations/ hoặc .git. Không phải trình phân
  # tích cú pháp shell đầy đủ — đây là lớp phòng thủ bổ sung, không thay
  # thế việc review con người.
  if echo "$CMD" | grep -Eq '\brm\b' \
     && echo "$CMD" | grep -Eq -- '(-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)' \
     && echo "$CMD" | grep -Eq '(migrations|\.git)\b'; then
    deny "Lệnh xoá đệ quy nhắm vào migrations/ hoặc .git bị chặn theo Hiến pháp (không phá vỡ lịch sử di trú dữ liệu)."
  fi

  # Chặn force-push (--force hoặc -f) vào main/master; --force-with-lease
  # vẫn được phép (an toàn hơn, đúng khuyến nghị trong thông điệp chặn).
  if echo "$CMD" | grep -Eq '\bgit\b.*\bpush\b' \
     && ! echo "$CMD" | grep -Eq -- '--force-with-lease' \
     && echo "$CMD" | grep -Eq -- '(--force\b|[[:space:]]-f([[:space:]]|$))' \
     && echo "$CMD" | grep -Eq '\b(main|master)\b'; then
    deny "Force-push vào nhánh main/master bị chặn. Dùng --force-with-lease trên nhánh khác hoặc xin xác nhận thủ công."
  fi

  if echo "$CMD" | grep -Eiq '(mật khẩu|password|secret|api[_-]?key)[[:space:]]*=[[:space:]]*["'"'"'][^"'"'"']{4,}'; then
    deny "Phát hiện có vẻ như bí mật (password/secret/api_key) bị gõ trực tiếp vào lệnh shell. Dùng biến môi trường / kho bí mật thay vì hard-code."
  fi
fi

if [ "$TOOL_NAME" = "Edit" ] || [ "$TOOL_NAME" = "Write" ]; then
  FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')
  CONTENT=$(echo "$INPUT" | jq -r '(.tool_input.content // .tool_input.new_string // "")')

  # Chặn ghi thẳng file .env / secrets đã track git (không phải .env.example).
  case "$FILE_PATH" in
    */.env|*/.env.local|*/.env.production)
      deny "Không được ghi trực tiếp vào file .env qua Claude. Nếu cần cấu hình bí mật, cập nhật .env.example (không chứa giá trị thật) và yêu cầu người dùng tự điền."
      ;;
  esac

  if echo "$CONTENT" | grep -Eq -- '-----BEGIN (RSA|EC|OPENSSH|PRIVATE) KEY-----'; then
    deny "Nội dung chứa khối private key. Không được commit private key vào code."
  fi

  if echo "$CONTENT" | grep -Eiq '(password|mat_khau|matkhau)[[:space:]]*=[[:space:]]*["'"'"'][^"'"'"']{4,}["'"'"']'; then
    deny "Phát hiện mật khẩu hard-code trong nội dung file. Vi phạm Luật security.md — dùng biến môi trường / kho bí mật."
  fi

  if echo "$CONTENT" | grep -Eq 'AKIA[0-9A-Z]{16}|sk-[a-zA-Z0-9]{20,}'; then
    deny "Phát hiện chuỗi giống API key/AWS access key hard-code trong nội dung file."
  fi
fi

exit 0

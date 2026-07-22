# Audit: Cổng kiểm soát (Hooks) — đối chiếu tài liệu chính thức Anthropic

**Ngày:** 2026-07-22 · **Phạm vi:** 4 hook trong `.claude/settings.json` + `.claude/hooks/*.sh`
**Căn cứ:** [Claude Code — Hooks reference](https://docs.claude.com/en/docs/claude-code/hooks) và [Hooks guide](https://docs.claude.com/en/docs/claude-code/hooks-guide) (đọc 2026-07-22).
**Bối cảnh:** khung quản trị chia hai cấp — **mềm** = Luật `.claude/rules/*.md` (cố vấn), **cứng** = Hooks + CI + hệ kiểu (bắt buộc kỹ thuật). Audit này soi tầng cứng.

## Kết luận nhanh

Cả 4 hook **đạt chuẩn**, dùng đúng schema hiện hành, và được tinh chỉnh hợp hệ thống ở mức trưởng thành cao. Ba khoảng hở cần bổ sung để (1) phủ kín và (2) làm Luật giao diện `ui.md` có hiệu lực *cứng*.

## Đối chiếu từng hook

| Hook | Sự kiện | Cơ chế quyết định | Đúng chuẩn |
|---|---|---|---|
| `audit-prompt.sh` | UserPromptSubmit | Ghi JSON Lines audit, `exit 0` | ✅ Sự kiện hợp lệ; đọc `.prompt`/`.session_id` từ stdin đúng "Common input fields" |
| `block-dangerous.sh` | PreToolUse (`Bash\|Edit\|Write`) | `hookSpecificOutput.permissionDecision:"deny"` + `permissionDecisionReason` | ✅ Đúng schema **mới nhất** (allow/deny/ask), không phải kiểu `decision:"approve"` cũ |
| `auto-lint.sh` | PostToolUse (`Edit\|Write`) | Chạy Biome, in cảnh báo, `exit 0` (phản hồi mềm) | ✅ Đọc `tool_input.file_path` chuẩn; PostToolUse không bắt buộc chặn |
| `gate-dod.sh` | Stop | `{decision:"block", reason}`, `exit 0`; ép `make lint && make test` | ✅ Stop dùng top-level `decision:"block"`; nhận biết git worktree qua `.cwd` trên stdin |

## Ba điểm làm đúng theo tài liệu (đáng ghi nhận)

1. **Quyết định bằng JSON trên `exit 0`**, không lẫn với `exit 2`. Tài liệu: *"phải chọn một; nếu `exit 2` thì mọi JSON bị bỏ qua."*
2. **Không dựa `exit 1` để chặn.** Tài liệu: *"exit 1 là lỗi KHÔNG chặn; muốn ép chính sách phải `exit 2` hoặc JSON."* Các hook tránh đúng bẫy này.
3. **Cổng DoD gate đúng worktree của phiên** (qua `.cwd`) và chỉ chạy khi có thay đổi ở `apps/`·`packages/` — tránh phiên này chặn nhầm phiên khác.

Ngoài ra, tra tài liệu xác nhận: **Stop hook tự chuyển thành `SubagentStop` cho subagent** → cổng DoD *đã* tự áp cho cả subagent review chéo, không cần thêm cấu hình.

## Ba khoảng hở

1. **Matcher chưa phủ hết công cụ sửa file.** Hiện `Edit|Write`. Nếu `MultiEdit`/`NotebookEdit` đang bật, `auto-lint` và `block-dangerous` sẽ **không bắn** → đường vòng. *Việc cần:* xác nhận danh sách tool sửa file đang bật, bổ sung vào matcher (`Edit|Write|MultiEdit|NotebookEdit`).
2. **Chưa hook nào ép Luật giao diện `ui.md`.** Các cổng ép bảo mật + lint + test + coverage, nhưng không kiểm hardcode màu/px, tô kiểu nội tuyến, hay nhãn lệch, hay dẫn xuất từ Registry. Nên `ui.md` hiện chỉ *cố vấn*. *Việc cần:* đặt 3 phép kiểm (grep hardcode/inline-style trong `make lint`; test đối chiếu nhãn + dẫn xuất trong `make test`; Registry có kiểu để `tsc` ép) — khi đó `gate-dod.sh` (Stop) và CI **tự ép, không cần sửa hook**.
3. **Ranh giới người-sửa-tay.** Hooks chỉ chạy trong phiên Claude Code/Cowork (theo tài liệu). Sửa bằng IDE ngoài phiên → chỉ **CI** (và tùy chọn git pre-commit) mới bắt. Lớp mạnh nhất cho mọi tác giả là **hệ kiểu**: Registry là nguồn kiểu ⇒ "thêm cột lệch = lỗi biên dịch".

## Khuyến nghị (đưa vào U-K1)

- Vá matcher (bản giao để chép vào `.claude/settings.json` — thư mục `.claude` khoá ghi trong phiên Cowork).
- Thêm 3 phép kiểm ép `ui.md` vào `make lint`/`make test` + Registry có kiểu.
- Cân nhắc git pre-commit mirror `make lint` để bắt sớm cả khi sửa tay (CI vẫn là chốt chặn cuối).

## Nguồn

- https://docs.claude.com/en/docs/claude-code/hooks
- https://docs.claude.com/en/docs/claude-code/hooks-guide

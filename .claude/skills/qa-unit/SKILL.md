---
name: qa-unit
description: QA đầu ra cho một đơn vị — điều phối review chéo độc lập bằng các subagent (contract-guardian, security-reviewer, dod-auditor), tổng hợp báo cáo QA và chặn merge nếu có lỗi Critical. Dùng SAU KHI lint/test đã xanh.
disable-model-invocation: true
---

QA đầu ra cho đơn vị: **$ARGUMENTS** (mặc định: thay đổi chưa commit).

Chỉ chạy khi `/verify` (hoặc `make lint && make test`) đã xanh — review chéo là để bắt lỗi logic/bảo mật/hợp đồng, không phải để bắt lỗi build.

1. **Xác định phạm vi:** `git diff --name-only`. Phân loại đụng tới: (a) adapter GDT `packages/gdt-client`; (b) xác thực/token/dữ liệu tenant; (c) mọi đơn vị đều cần kiểm Definition of Done.
2. **Spawn subagent review độc lập — song song** (một message, nhiều Task):
   - `dod-auditor` — **luôn luôn**.
   - `contract-guardian` — nếu (a).
   - `security-reviewer` — nếu (b).
   - Yêu cầu mỗi agent chỉ báo lỗ hổng/vi phạm thực sự kèm dòng/file + mức độ; không bắt bẻ văn phong; nếu sạch thì nói rõ "không phát hiện vi phạm".
3. **Tổng hợp báo cáo QA:** gộp phát hiện theo mức độ. Quy ước chặn:
   - **Critical** (rò rỉ dữ liệu chéo tenant, lộ bí mật, gọi GDT ngoài adapter, phá captcha, lệch hợp đồng bị nuốt) → **CHẶN merge**, phải sửa rồi chạy lại.
   - **Major/Minor** → ghi nhận, đề xuất sửa; người dùng quyết định.
4. **Kết luận:** ĐẠT / CHẶN, kèm danh sách việc phải sửa (nếu có). Không tự sửa code trong skill này — bàn giao cho phiên thực thi.

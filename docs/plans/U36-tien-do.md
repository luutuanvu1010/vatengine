# U36 — Nhật ký tiến độ

Kế hoạch chốt: `docs/plans/U36-plan.md`. Prompt điều phối: `docs/plans/U36-prompt-dieu-phoi.md`.
Nguồn bằng chứng: `docs/BANG-CHUNG-ma-trang-thai-hoa-don-2026-07-28.md`.

| Đơn vị | Trạng thái | Commit | Ghi chú |
|---|---|---|---|
| Tài liệu nền | DONE | `1e6c33a` | Biên bản bằng chứng + kế hoạch + prompt điều phối lên trục trước khi mã dẫn chiếu |
| U36.1 (Gói 1+0+0b) | DONE | `773bffe` | `@vat/domain/trangThaiHoaDon.ts` (nhãn 1–5, `TTHAI_LOAI_KHOI_TONG=[4]`); `labelTthai` thành wrapper; chip mã 2–5 neutral (QĐ-11); `STATUS_CODE_MAP.thayThe.tthai=[4]` — `huy`/`ttxly` VẪN RỖNG. `GET /reconcile` đổi hành vi, đã có test phủ (seed `tthai:4` → `thayThe=1`). Golden đỏ khớp đúng §6. lint+test xanh toàn repo; `dod-auditor`: không vi phạm. Hồi quy sau commit: 194 test file xanh, exit 0 |

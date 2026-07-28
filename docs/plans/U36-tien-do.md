# U36 — Nhật ký tiến độ

Kế hoạch chốt: `docs/plans/U36-plan.md`. Prompt điều phối: `docs/plans/U36-prompt-dieu-phoi.md`.
Nguồn bằng chứng: `docs/BANG-CHUNG-ma-trang-thai-hoa-don-2026-07-28.md`.

| Đơn vị | Trạng thái | Commit | Ghi chú |
|---|---|---|---|
| Tài liệu nền | DONE | `1e6c33a` | Biên bản bằng chứng + kế hoạch + prompt điều phối lên trục trước khi mã dẫn chiếu |
| U36.1 (Gói 1+0+0b) | DONE | `773bffe` | `@vat/domain/trangThaiHoaDon.ts` (nhãn 1–5, `TTHAI_LOAI_KHOI_TONG=[4]`); `labelTthai` thành wrapper; chip mã 2–5 neutral (QĐ-11); `STATUS_CODE_MAP.thayThe.tthai=[4]` — `huy`/`ttxly` VẪN RỖNG. `GET /reconcile` đổi hành vi, đã có test phủ (seed `tthai:4` → `thayThe=1`). Golden đỏ khớp đúng §6. lint+test xanh toàn repo; `dod-auditor`: không vi phạm. Hồi quy sau commit: 194 test file xanh, exit 0 |
| U36.2 (Gói 2) | DONE | `379f936` | Catalog 29→31, mặc định 16→19; 3 cột trạng thái ngay sau `Tổng tiền (sau thuế)`; ô sinh từ `nhanTthai()`/`tinhVaoTong()` (một nguồn); khóa localStorage bump v1→v2 + xuất `EXPORT_COLS_KEY`. `xlsxMapping.test.ts` XANH (tiêu chí #10). lint+test xanh (194 test file); `dod-auditor`: không vi phạm. **Hai lệch spec cần U36.3 lưu ý:** (a) §6 liệt kê THIẾU `exportCols.test.tsx:25` — nó ghi chuỗi cứng `vat.exportCols.v1` nên bump khóa làm nó đỏ; đã sửa sang hằng `EXPORT_COLS_KEY`; (b) Gói 5 chỉ SAI dòng: `06-BINDING_MAP.md:104` là dòng `huy`/`thay_the` của `/reconcile`, KHÔNG phải catalog cột phẳng — số cột catalog phẳng **không được ghi ở đâu** trong `06-BINDING_MAP.md`; chỗ lệch thật là `:34` và `:48` |

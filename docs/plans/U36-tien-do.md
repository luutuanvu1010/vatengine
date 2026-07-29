# U36 — Nhật ký tiến độ

Kế hoạch chốt: `docs/plans/U36-plan.md`. Prompt điều phối: `docs/plans/U36-prompt-dieu-phoi.md`.
Nguồn bằng chứng: `docs/BANG-CHUNG-ma-trang-thai-hoa-don-2026-07-28.md`.

| Đơn vị | Trạng thái | Commit | Ghi chú |
|---|---|---|---|
| Tài liệu nền | DONE | `1e6c33a` | Biên bản bằng chứng + kế hoạch + prompt điều phối lên trục trước khi mã dẫn chiếu |
| U36.1 (Gói 1+0+0b) | DONE | `773bffe` | `@vat/domain/trangThaiHoaDon.ts` (nhãn 1–5, `TTHAI_LOAI_KHOI_TONG=[4]`); `labelTthai` thành wrapper; chip mã 2–5 neutral (QĐ-11); `STATUS_CODE_MAP.thayThe.tthai=[4]` — `huy`/`ttxly` VẪN RỖNG. `GET /reconcile` đổi hành vi, đã có test phủ (seed `tthai:4` → `thayThe=1`). Golden đỏ khớp đúng §6. lint+test xanh toàn repo; `dod-auditor`: không vi phạm. Hồi quy sau commit: 194 test file xanh, exit 0 |
| U36.2 (Gói 2) | DONE | `379f936` | Catalog 29→31, mặc định 16→19; 3 cột trạng thái ngay sau `Tổng tiền (sau thuế)`; ô sinh từ `nhanTthai()`/`tinhVaoTong()` (một nguồn); khóa localStorage bump v1→v2 + xuất `EXPORT_COLS_KEY`. `xlsxMapping.test.ts` XANH (tiêu chí #10). lint+test xanh (194 test file); `dod-auditor`: không vi phạm. **Hai lệch spec cần U36.3 lưu ý:** (a) §6 liệt kê THIẾU `exportCols.test.tsx:25` — nó ghi chuỗi cứng `vat.exportCols.v1` nên bump khóa làm nó đỏ; đã sửa sang hằng `EXPORT_COLS_KEY`; (b) Gói 5 chỉ SAI dòng: `06-BINDING_MAP.md:104` là dòng `huy`/`thay_the` của `/reconcile`, KHÔNG phải catalog cột phẳng — số cột catalog phẳng **không được ghi ở đâu** trong `06-BINDING_MAP.md`; chỗ lệch thật là `:34` và `:48` |
| U36.3 (Gói 3+4+5) | DONE (mã) — **còn nghiệm thu thủ công** | `7a763af` | `summarize.ts` loại mã 4 khỏi TIỀN bằng `filter` trong aggregate; `count` giữ nguyên nghĩa (QĐ-7); `ChieuSummary` +8 trường; `ThongBaoTrangThai.tsx` mới (thông báo theo chiều + thuế phải nộp một lần + cảnh báo `soMaLa`); `Stat` thêm `ghiChu`; changelog v2.0; 8 tài liệu + `06-BINDING_MAP` §4.6 mới (ghi TỪ MÃ). lint+test xanh (197 test file); `dod-auditor` + `security-reviewer` đều sạch. **Lệch kế hoạch có chủ đích:** (1) helper trừ tiền đặt ở `@vat/domain/tienChuoi.ts` chứ không sửa `format.ts` → drift số học thập phân hai nơi, đã ghi BACKLOG; (2) dòng thuế ghi "giảm 1.711.111 ₫" không phải "giảm -1.711.111 ₫" (mockup §4b tự mâu thuẫn với §2.3); (3) thêm `TTHAI` + `TTHAI_DA_KIEM_CHUNG` vào domain để không rải số 2/3/5 trần ở tầng truy vấn |

## Đã deploy + nghiệm thu (2026-07-28)

**Production:** `vat-api` version `53dd450f`, `vat-web` version `999992ee`. Migration 0018
(của trục) đã áp + hậu kiểm bằng truy vấn thật. `vat-sync-worker` KHÔNG deploy — không phụ
thuộc `@vat/query`/`@vat/domain`.

**Nghiệm thu thủ công — ĐẠT.** Chủ dự án kiểm trên production 2026-07-28: kỳ 07/2026, chiều
Bán ra, tổng thuế giảm **đúng 1.711.111 ₫**; thông báo hiển thị khớp nguyên văn mẫu §4b của
kế hoạch (đã đối chiếu từng dòng). Con số 1.711.111 ₫ từ đây là **bằng chứng trên dữ liệu
thật**, không còn là số đo lúc lập kế hoạch.

**Còn một ô chưa kiểm:** tải file Excel xác nhận 3 cột trạng thái + hóa đơn mã 4 có
"Tính vào tổng" = Không (`docs/CHECKLIST-NGHIEM-THU.md` mục U36).

## Ghi chú deploy (đã thực hiện — giữ lại làm hồ sơ)

**Nghiệm thu thủ công §5.1** trên dữ liệu production, 4 ô còn trống trong
`docs/CHECKLIST-NGHIEM-THU.md` mục "U36". Cần deploy hoặc chạy local trỏ Neon —
kế hoạch U36 KHÔNG bao gồm bước deploy, nên đây là quyết định của chủ dự án.

Cho tới khi làm bước này, con số **1.711.111 ₫** (kỳ 07/2026, chiều Bán ra, tenant
MST 4201969169) mới chỉ là **số đo lúc lập kế hoạch** — chưa phải bằng chứng rằng
mã mới cho ra đúng con số đó trên production (Nguyên tắc bằng chứng, `CLAUDE.md`).

Thứ tự deploy theo `.claude/rules/deploy.md`: DB → worker → api → web.
Lưu ý: U36.3 đổi hợp đồng `GET /invoices/summary`; `vat-api` phải lên TRƯỚC `vat-web`.

## Sửa đổi sau nghiệm thu (2026-07-29)

- **U39** — bổ sung đủ BỘ BA số tiền (mã 4 trước đây thiếu tiền trước thuế; mã 5 không có số
  tiền nào), cờ lọc `biSua`, và nút bung danh sách hóa đơn bị sửa ngay tại thông báo.
- **U40** — đổi ruột nút "Hóa đơn vừa thay đổi" thành "Hóa đơn bị sửa ở kỳ khác": bỏ hẳn
  trạng thái "đã đọc", con số dẫn xuất từ dữ liệu × bộ lọc.
- ⚠️ **Đảo một quyết định của kế hoạch:** §7.2 và §4b ghi dòng *"Từ 28/07/2026, hóa đơn bị
  thay thế không còn được cộng vào tổng"* là **bắt buộc**. Chủ dự án chốt **GỠ** ngày
  2026-07-29 — nó là thông báo DI TRÚ (chỉ có nghĩa với người đã từng thấy số cũ) nhưng lại
  ghim vĩnh viễn, và thừa vì khối phía trên đã nêu cụ thể hơn. Nội dung chuyển sang
  `apps/web/src/lib/changelog.ts` v2.0 → trang "Lịch sử cập nhật". **Đừng thêm lại** khi đọc
  §7.2 của kế hoạch.


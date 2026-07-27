# U35 / U35b — Nhật ký tiến độ

> Ghi một dòng sau mỗi đơn vị đóng, theo `docs/plans/U35-prompt-dieu-phoi.md`.

- **U35b** — DONE — commit `593c0b9` (+ docs spec `4c8eeea`) — Thuế suất hiện % (numFmt custom
  165="0%", giữ giá trị gốc 0.08); Tiền thuế tự tính khi GDT thiếu (BigInt, chuẩn hóa một nơi
  `tsuatTienChuan`, dùng chung cho cột Tiền thuế lẫn Tổng tiền sau thuế); KCT/KKKNT phân biệt
  qua `ltsuat` → trống thay vì "0%" giả. `make lint` + `make test` (toàn repo, 12 workspace)
  xanh. `dod-auditor` PASS (tự chạy lại test độc lập, không chỉ tin lời khai). Không đổi
  `packages/domain` (giữ ràng buộc `tsuat.kieu==="num"` đã khóa bằng test có sẵn), không đổi
  `apps/web`. Backlog: `invoiceDoc.ts` (renderer XML/HTML riêng, U22) chưa hưởng sửa này — ghi
  ở `docs/BACKLOG-y-tuong-va-de-xuat.md`.
- **U35** — chưa bắt đầu — chờ duyệt "tiếp" ở cổng dừng.

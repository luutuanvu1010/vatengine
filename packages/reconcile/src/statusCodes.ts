import type { StatusCodeMap } from "./types";

// Bảng mã trạng thái hóa đơn (`tthai`) / xử lý (`ttxly`) → phân loại hủy / thay thế.
//
// ĐÃ KIỂM CHỨNG 2026-07-28 — nguồn: docs/BANG-CHUNG-ma-trang-thai-hoa-don-2026-07-28.md
// (33.929 hóa đơn thật của 3 tenant; ghép cặp gốc↔mới qua `shdgoc` trong `raw_json`:
// 2↔4 17 cặp, 3↔5 3 cặp, đối xứng kín cả hai chiều, 0 ngoại lệ — §3, §3.1, §8.1 mục 1).
//   `tthai=4` = hóa đơn BỊ THAY THẾ.
//
// VẪN RỖNG có chủ đích (không suy đoán từ việc đã biết 1–5):
//   - `huy`: trong 33.929 hóa đơn KHÔNG có ca hủy pháp lý nào (kèm thông báo 04/SS). Mã của
//     hủy thật chưa biết — §5.1.
//   - mọi `ttxly`: `ttxly` KHÔNG đổi khi hóa đơn bị thay thế (12250 và 12368 cùng `ttxly=8`);
//     nó bám theo họ hóa đơn + tiến trình xử lý của cơ quan thuế — §4.
//
// Cổng bằng chứng `test/contract/statusCodes.contract.test.ts` khóa cả ba điều trên: điền
// thêm mã nào cũng làm test đỏ, buộc kèm bằng chứng tái lập được.
//
// Lưu ý: `tthai=5` (bị điều chỉnh) CỐ Ý không nằm trong `thayThe` — bản gốc vẫn còn hiệu
// lực, hóa đơn điều chỉnh chỉ ghi phần tăng/giảm (§7).
export const STATUS_CODE_MAP: StatusCodeMap = {
  huy: {},
  thayThe: { tthai: [4] },
};

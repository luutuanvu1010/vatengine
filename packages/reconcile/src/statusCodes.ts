import type { StatusCodeMap } from "./types";

// Bảng mã trạng thái hóa đơn (`tthai`) / xử lý (`ttxly`) → phân loại hủy / thay thế.
//
// ⚠️ CHƯA KIỂM CHỨNG (2026-07-14). ADR-0001 (dòng 45) ghi rõ: tới nay CHỈ quan sát được
// `tthai=1` (trạng thái gốc) từ dữ liệu GDT thật. Ý nghĩa các mã cho hóa đơn ĐÃ HỦY /
// BỊ THAY THẾ / ĐIỀU CHỈNH **chưa có bằng chứng tái lập được** (probe/tài liệu chính thức).
// Theo Nguyên tắc bằng chứng của Hiến pháp, KHÔNG được "chốt" mã ở đây.
//
// Vì vậy map production để RỖNG: cơ chế phân loại (statusAnomaly.ts) tồn tại và có test
// (bằng map GIẢ ĐỊNH tiêm ở unit test), nhưng production KHÔNG gán mã nào là hủy/thay thế
// cho tới khi có probe thật điền vào (xem test/contract/statusCodes.contract.test.ts — cổng
// bằng chứng sẽ đỏ nếu map bị điền mã chưa kiểm chứng).
export const STATUS_CODE_MAP: StatusCodeMap = {
  huy: {},
  thayThe: {},
};

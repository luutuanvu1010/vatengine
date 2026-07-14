// U10 contract (MỀM, OFFLINE — KHÔNG gọi mạng). Đây là cổng BẰNG CHỨNG cho mã trạng
// thái hủy/thay thế, không phải contract test gọi GDT thật.
//
// Bối cảnh: ADR-0001 (dòng 45) ghi tới 2026-07-14 CHỈ quan sát được `tthai=1` (trạng thái
// gốc) từ dữ liệu GDT thật. Ý nghĩa mã cho hóa đơn ĐÃ HỦY / BỊ THAY THẾ / ĐIỀU CHỈNH
// CHƯA có bằng chứng tái lập được. Theo Nguyên tắc bằng chứng của Hiến pháp, KHÔNG được
// "chốt" mã vào code production khi chưa kiểm chứng.
//
// Test này KHÓA điều đó lại: nếu ai đó điền STATUS_CODE_MAP production bằng mã CHƯA KIỂM
// CHỨNG, test đỏ → buộc kèm bằng chứng (probe) và cập nhật test cùng lúc.
//
// PROBE CẦN LÀM để gỡ khóa (mô tả, chưa tự động hoá — cần người trực đăng nhập + nhập
// captcha, KHÔNG bypass — security.md):
//   1. Trên portal hoadondientu.gdt.gov.vn đã đăng nhập thật, mở một HĐ ĐÃ HỦY và một HĐ
//      BỊ THAY THẾ; quan sát tầng network `/api/query/invoices/*` (chỉ đọc TÊN KHÓA + mã,
//      KHÔNG lưu token/giá trị nhạy cảm).
//   2. Ghi lại `tthai`/`ttxly` của từng ca + trường liên kết HĐ thay thế trong raw_json.
//   3. Điền STATUS_CODE_MAP (statusCodes.ts), cập nhật assertion dưới sang giá trị ĐÃ KIỂM
//      CHỨNG kèm ngày + nguồn, và gỡ khối "chưa kiểm chứng".
import { describe, expect, it } from "vitest";
import { STATUS_CODE_MAP } from "../../src/statusCodes";

describe("statusCodes contract (guard bằng chứng, offline)", () => {
  it("map production CHƯA chốt mã nào khi chưa có probe (giữ RỖNG)", () => {
    const codes = [
      ...(STATUS_CODE_MAP.huy.tthai ?? []),
      ...(STATUS_CODE_MAP.huy.ttxly ?? []),
      ...(STATUS_CODE_MAP.thayThe.tthai ?? []),
      ...(STATUS_CODE_MAP.thayThe.ttxly ?? []),
    ];
    // Khi có probe: thay assertion này bằng tập mã ĐÃ KIỂM CHỨNG (kèm ngày/nguồn).
    expect(codes).toEqual([]);
  });
});

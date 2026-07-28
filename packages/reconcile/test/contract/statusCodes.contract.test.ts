// U10 contract (MỀM, OFFLINE — KHÔNG gọi mạng). Đây là cổng BẰNG CHỨNG cho mã trạng thái
// hủy/thay thế, không phải contract test gọi GDT thật.
//
// GỠ KHÓA 2026-07-28 (U36.1). Nguồn: docs/BANG-CHUNG-ma-trang-thai-hoa-don-2026-07-28.md
// — 33.929 hóa đơn thật của 3 tenant, ghép cặp gốc↔mới qua `shdgoc` trong `raw_json`:
// `tthai=2` (thay thế) ↔ `tthai=4` (bị thay thế), 17 cặp; `tthai=3` (điều chỉnh) ↔
// `tthai=5` (bị điều chỉnh), 3 cặp. Đối xứng kín cả hai chiều, 0 ngoại lệ (§3.1).
//
// Cổng này VẪN chặn phần chưa có bằng chứng:
//   - `huy` giữ RỖNG — trong 33.929 hóa đơn KHÔNG có ca hủy pháp lý nào (§5.1). Mã của hủy
//     thật có thể là 6 hoặc giá trị khác; KHÔNG suy đoán từ việc đã biết 1–5.
//   - mọi `ttxly` giữ RỖNG — `ttxly` KHÔNG đổi khi hóa đơn bị thay thế (12250 và 12368 cùng
//     `ttxly=8`); nó bám theo họ hóa đơn/tiến trình xử lý, không phản ánh hủy/thay thế (§4).
// Điền thêm mã nào ⇒ test đỏ ⇒ buộc kèm bằng chứng tái lập được và sửa test cùng lúc.
import { describe, expect, it } from "vitest";
import { STATUS_CODE_MAP } from "../../src/statusCodes";

describe("statusCodes contract (guard bằng chứng, offline)", () => {
  it("map production chỉ chốt ĐÚNG tập mã đã kiểm chứng 2026-07-28", () => {
    const codes = [
      ...(STATUS_CODE_MAP.huy.tthai ?? []),
      ...(STATUS_CODE_MAP.huy.ttxly ?? []),
      ...(STATUS_CODE_MAP.thayThe.tthai ?? []),
      ...(STATUS_CODE_MAP.thayThe.ttxly ?? []),
    ];
    // Chỉ `thayThe.tthai = [4]` — biên bản §3 và §8.1 mục 1.
    expect(codes).toEqual([4]);
  });

  it("mã HỦY thật CHƯA có bằng chứng → `huy` phải giữ RỖNG (biên bản §5.1)", () => {
    expect(STATUS_CODE_MAP.huy.tthai ?? []).toEqual([]);
    expect(STATUS_CODE_MAP.huy.ttxly ?? []).toEqual([]);
  });

  it("ý nghĩa `ttxly` CHƯA kiểm chứng → mọi `ttxly` phải giữ RỖNG (biên bản §4)", () => {
    expect(STATUS_CODE_MAP.huy.ttxly ?? []).toEqual([]);
    expect(STATUS_CODE_MAP.thayThe.ttxly ?? []).toEqual([]);
  });
});

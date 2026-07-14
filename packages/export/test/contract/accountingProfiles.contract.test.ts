// U11 contract (MỀM, OFFLINE — KHÔNG gọi mạng). Cổng BẰNG CHỨNG cho ĐỊNH DẠNG import của
// phần mềm kế toán mục tiêu (MISA/FAST/SmartKTSC), KHÔNG phải contract test gọi GDT.
//
// Bối cảnh: tới 2026-07-14 dự án CHƯA có template import chính thức / file mẫu thật của
// các phần mềm này. Theo Nguyên tắc bằng chứng (Hiến pháp), KHÔNG được bịa layout cột rồi
// trình bày như đã chốt (bài học `:30000`). Vì vậy các profile mục tiêu được giữ ở
// PENDING_PROFILES (CHƯA KIỂM CHỨNG) và KHÔNG khả dụng qua registry/route.
//
// Test này KHÓA điều đó lại: (1) mọi profile KHẢ DỤNG phải verified=true (không phục vụ
// layout chưa kiểm chứng); (2) mục tiêu thật vẫn nằm ở PENDING và bị chặn.
//
// PROBE CẦN LÀM để gỡ khóa một profile mục tiêu (mô tả, chưa tự động hoá):
//   1. Lấy TEMPLATE IMPORT CHÍNH THỨC (hoặc file Excel/CSV mẫu thật) của phần mềm đích từ
//      chủ dự án / tài liệu nhà cung cấp.
//   2. Ghi lại chính xác: danh sách cột + thứ tự + tên header + định dạng ngày/số + tên
//      sheet + encoding.
//   3. Tạo `profiles/<id>.ts` với `verified: true`, chuyển id từ PENDING_PROFILES sang
//      AVAILABLE trong registry, và cập nhật assertion dưới kèm ngày + nguồn bằng chứng.
import { describe, expect, it } from "vitest";
import { REFERENCE_PROFILE } from "../../src/profiles/reference";
import {
  AVAILABLE_PROFILE_IDS,
  PENDING_PROFILES,
  getProfile,
  isProfileId,
} from "../../src/profiles/registry";

describe("accounting profiles contract (guard bằng chứng, offline)", () => {
  it("mọi profile KHẢ DỤNG đều verified=true (không phục vụ layout CHƯA KIỂM CHỨNG)", () => {
    for (const id of AVAILABLE_PROFILE_IDS) {
      expect(getProfile(id).verified).toBe(true);
    }
  });

  it("profile khả dụng hiện chỉ là fixture tham chiếu (chưa có phần mềm thật)", () => {
    // Khi có template thật: thêm id phần mềm vào đây kèm ngày + nguồn bằng chứng.
    expect([...AVAILABLE_PROFILE_IDS].sort()).toEqual([REFERENCE_PROFILE.id]);
  });

  it("MISA/FAST/SmartKTSC vẫn ở PENDING và bị chặn (chờ template chính thức)", () => {
    const pending = PENDING_PROFILES.map((p) => p.id);
    for (const id of ["misa", "fast", "smartktsc"]) {
      expect(pending).toContain(id);
      expect(isProfileId(id)).toBe(false); // không khả dụng qua registry/route
    }
  });
});

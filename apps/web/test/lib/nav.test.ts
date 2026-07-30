// U41 — NGUỒN ĐIỀU HƯỚNG DÙNG CHUNG.
//
// VÌ SAO TỒN TẠI: trước U41 danh sách mục điều hướng là hằng RIÊNG TƯ trong `Sidebar.tsx`.
// Footer bốn cột và khối "Lối tắt" ở Tổng quan cần đúng danh sách đó ⇒ nếu không tách ra,
// mỗi lần thêm/ẩn một trang phải sửa BA nơi và chắc chắn có ngày lệch. Đây là câu hỏi vàng
// của `ui.md`: "sửa mấy nơi — màn khác có tự hưởng, hay phải chép lại?".
//
// HAI THỨ KHÁC BẢN CHẤT, CỐ Ý TÁCH RỜI (giữ nguyên kỷ luật của `Sidebar.tsx` cũ):
//   • `visible` = RBAC theo VAI. Ai được xem.
//   • Cờ tính năng = trang có được PHÁT HÀNH chưa. Không ai xem được, kể cả quản trị.
// Trộn hai thứ vào một trường sẽ làm mờ nghĩa của cả hai: một trang bị ẩn vì chưa phát hành
// trông sẽ giống hệt một trang bị chặn vì thiếu quyền.
import { describe, expect, it } from "vitest";
import { SHOW_EXPORTS, SHOW_RECONCILE } from "../../src/lib/featureFlags";
import { vi as viStrings } from "../../src/lib/i18n/vi";
import { NAV_CHINH, NAV_HE_THONG, navHienThi } from "../../src/lib/nav";

const duong = (items: readonly { to: string }[]) => items.map((i) => i.to);

describe("nav — nguồn điều hướng dùng chung", () => {
  it("nhóm Chính có Tổng quan, Danh sách hóa đơn, Liên kết chia sẻ (mọi vai, mọi cờ)", () => {
    expect(duong(NAV_CHINH)).toEqual(expect.arrayContaining(["/", "/invoices", "/lien-ket"]));
  });

  it("nhóm Hệ thống có Cài đặt chung và Giới thiệu & Hỗ trợ", () => {
    expect(duong(NAV_HE_THONG)).toEqual(["/settings", "/gioi-thieu"]);
  });

  // Nhãn KHÔNG được gõ rời trong nav — phải là chính chuỗi trong từ điển. Gõ lại là tạo
  // nguồn sự thật thứ hai, đúng thứ đã sinh ra lệch "Tổng TT" vs "Tổng thanh toán".
  it("nhãn lấy từ từ điển i18n, không gõ chuỗi rời", () => {
    const nhan = Object.fromEntries([...NAV_CHINH, ...NAV_HE_THONG].map((i) => [i.to, i.label]));
    expect(nhan["/"]).toBe(viStrings.navDashboard);
    expect(nhan["/invoices"]).toBe(viStrings.navInvoices);
    expect(nhan["/lien-ket"]).toBe(viStrings.navLienKet);
    expect(nhan["/settings"]).toBe(viStrings.navSettings);
    expect(nhan["/gioi-thieu"]).toBe(viStrings.navAbout);
  });

  // ---- Cờ tính năng: ẩn với MỌI vai, kể cả quản trị ----------------------------------
  // Đây là điểm U41 suýt làm hỏng: bản thiết kế vẽ "Kết xuất & Convert" ở cả thanh trái,
  // Lối tắt lẫn Footer, trong khi cờ đã tắt sáng 30/07. `exportsHidden.test.tsx` khoá ba
  // điểm nối dây đó; ca dưới khoá ngay tại NGUỒN để cả ba tự hưởng.
  it("SHOW_EXPORTS tắt ⇒ không có /exports trong nguồn, kể cả vai quản trị", () => {
    expect(SHOW_EXPORTS).toBe(false); // chốt tiền đề của ca này
    expect(duong(NAV_CHINH)).not.toContain("/exports");
    expect(duong(navHienThi(NAV_CHINH, "quan_tri"))).not.toContain("/exports");
  });

  it("SHOW_RECONCILE tắt ⇒ không có /reconcile trong nguồn, kể cả vai quản trị", () => {
    expect(SHOW_RECONCILE).toBe(false);
    expect(duong(NAV_CHINH)).not.toContain("/reconcile");
    expect(duong(navHienThi(NAV_CHINH, "quan_tri"))).not.toContain("/reconcile");
  });

  // ---- RBAC: ẩn theo VAI, khác hẳn cờ ------------------------------------------------
  it("vai ke_toan không thấy Kết nối tài khoản thuế; ke_toan_truong và quan_tri thì thấy", () => {
    expect(duong(navHienThi(NAV_CHINH, "ke_toan"))).not.toContain("/tax-accounts");
    expect(duong(navHienThi(NAV_CHINH, "ke_toan_truong"))).toContain("/tax-accounts");
    expect(duong(navHienThi(NAV_CHINH, "quan_tri"))).toContain("/tax-accounts");
  });

  it("mục không khai `visible` hiện với mọi vai", () => {
    for (const vaiTro of ["ke_toan", "ke_toan_truong", "quan_tri"] as const) {
      expect(duong(navHienThi(NAV_CHINH, vaiTro))).toEqual(
        expect.arrayContaining(["/", "/invoices", "/lien-ket"]),
      );
    }
  });

  it("navHienThi không làm biến đổi mảng gốc", () => {
    const truoc = duong(NAV_CHINH);
    navHienThi(NAV_CHINH, "ke_toan");
    expect(duong(NAV_CHINH)).toEqual(truoc);
  });
});

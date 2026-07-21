// U32 — DANH TÍNH PHÁP NHÂN đứng sau VATEngine. NGUỒN SỰ THẬT DUY NHẤT: mọi màn hình cần
// thông tin này phải đọc từ đây, KHÔNG chép chuỗi vào JSX của từng trang (chép là tạo
// nguồn sự thật thứ hai — hai nơi sẽ lệch khi công ty đổi địa chỉ).
//
// Phân vai với trang "Giới thiệu & Ủng hộ" (U16, `features/about/AboutPage.tsx`): trang đó
// nói VÌ SAO có phần mềm (mục đích, lợi ích) — file này nói AI đứng sau và chạy TRÊN GÌ.
// Hai thứ khác nhau, không trùng lặp.
//
// ⚠️ Chỉ khai những gì chủ dự án CUNG CẤP (2026-07-20). Không suy đoán, không bổ sung mã
// số thuế / điện thoại / email / năm thành lập — chưa có thì để trống, không bịa. Thông
// tin pháp nhân hiển thị cho người dùng doanh nghiệp: sai một chữ là sai pháp lý.
export const ORG = {
  sanPham: "VATEngine",
  congTy: "Công ty TNHH Tour Đảo",
  /** MST pháp nhân. NGUỒN (không suy đoán): chủ dự án viết trong `docs/plans/U20-plan.md`
   * §5 Card 3, và khớp bản ghi tenant `Công ty TNHH Tour Đảo` trên production. Bổ sung
   * 2026-07-21 khi U20 cần hiện thông tin tác giả phần mềm. */
  mst: "4201969169",
  diaChi: "19 Đường B2, khu đô thị Vĩnh Điềm Trung, Phường Tây Nha Trang, Tỉnh Khánh Hoà",
  /** Ghi chú hạ tầng — khớp ADR-0001 (toàn bộ chạy trên hệ sinh thái Cloudflare). */
  haTang: "Hạ tầng được bảo mật và phục vụ trên nền tảng Cloudflare",
} as const;

# U15 Bước 1 — Kết quả nghiên cứu Claude Design (đã kiểm chứng)

> **Loại tài liệu:** ghi chú bằng chứng (đầu vào cho Bước 2). Không phải quyết định kiến trúc.
> **Ngày truy cập nguồn:** 2026-07-14. **Vai:** Design/nghiên cứu — không code, không vẽ UI.
> **Nguồn sơ cấp đã tự fetch:** https://claude.com/product/design (không tin theo dây chuyền — xác minh trực tiếp, theo Nguyên tắc bằng chứng).

## 1. Câu hỏi đã đặt (theo handoff Bước 1)

1. "Claude Design" có thật là sản phẩm/tính năng chính thức không? Nó là gì?
2. Nó nhận đầu vào dạng gì để thiết kế UI?
3. Có định dạng bàn giao khuyến nghị chính thức không?

## 2. Bảng bằng chứng

| Khẳng định | Nguồn chính thức | Đã kiểm chứng |
|---|---|---|
| **Claude Design là sản phẩm chính thức của Anthropic** (không phải chỉ là Artifacts) | https://claude.com/product/design | ✅ Có (fetch trực tiếp 2026-07-14) |
| Đang ở **beta**, trên gói **Pro, Max, Team, Enterprise** | https://claude.com/product/design | ✅ Có |
| Nhận **prompt văn bản** mô tả nhu cầu thiết kế | https://claude.com/product/design | ✅ Có |
| Nhận **file**: DOCX, PPTX, XLSX | https://claude.com/product/design | ✅ Có |
| Nhận **codebase / web capture** (ảnh chụp web) | https://claude.com/product/design | ✅ Có |
| Nhận **design system**: "từ GitHub repo, design files, hoặc raw uploads" | https://claude.com/product/design | ✅ Có |
| Kiểm output ngược lại design system đã nạp ("builds with your components, checks its output against your design system") | https://claude.com/product/design | ✅ Có |
| **Export**: PPTX, PDF, HTML (hoặc gửi sang app: Adobe, Canva, Gamma, Lovable, Miro, Replit, Vercel, Wix…) | https://claude.com/product/design | ✅ Có |
| Nhận **design token** dạng chuẩn hoá (JSON/YAML) như một loại đầu vào có tài liệu | https://claude.com/product/design | ❌ Không (không nêu trên trang chính thức) |
| Nhận **data/API contract** dạng cấu trúc như một loại đầu vào có tài liệu | https://claude.com/product/design | ❌ Không (không nêu) |

## 3. Kết luận (khuôn cho Bước 2)

**Claude Design nhận đầu vào = (a) prompt văn bản mô tả + (b) tài liệu tham chiếu tải lên** (DOCX/PPTX/XLSX, codebase, web capture) **+ (c) design system** (GitHub repo / design files / raw uploads). **Định dạng = hội thoại + tải file, con người đọc được** — trang chính thức **không** tài liệu hoá việc nạp design token JSON/YAML hay data/API contract dưới dạng cấu trúc máy.

**Hệ quả cho Bước 2 (đóng gói nguyên liệu):**
- Nên đóng gói `U15-DESIGN-BRIEF.md` + phần đọc-được của `06-BINDING_MAP.md` thành **brief markdown human-readable** (Claude Design đọc được), **không** kỳ vọng nạp binding map như một schema máy.
- Ràng buộc dữ liệu/RBAC/bảo mật từ `06-BINDING_MAP` nên diễn giải thành **văn bản mô tả trong brief**, không phải file token/contract.
- Chưa có "design system" sẵn của dự án → Claude Design sẽ tự dựng draft; ta cấp tông điệu/ràng buộc qua brief thay vì import một design system có sẵn.

## 4. Ranh giới đã giữ (không vượt trong Bước 1)

- ❌ Chưa vẽ mockup, chưa tạo token, chưa dựng `apps/web`.
- ❌ Chưa đóng gói `06-BINDING_MAP` (đó là Bước 2).
- Mọi khẳng định đều có URL nguồn + ngày; phần chưa xác minh gắn nhãn ❌ rõ ràng.

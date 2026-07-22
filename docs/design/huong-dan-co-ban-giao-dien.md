# Hướng dẫn cơ bản — Giao diện & ánh xạ dữ liệu

Bản rút gọn để dùng nhanh. Đầy đủ: `CHUAN-giao-dien-va-anh-xa-du-lieu.md`. Luật có hiệu lực: `.claude/rules/ui.md`.

## Kim chỉ nam

**Khai báo một lần — chiếu ra nhiều bề mặt.** Bảng, thanh lọc, allowlist sắp/lọc và file xuất đều là *hình chiếu* của một mô hình miền duy nhất (Registry). Không chép tay giữ khớp.

## Sáu tầng (mỗi tầng chỉ dựa tầng dưới)

1. **Tokens** — màu/khoảng cách/chữ là biến `--…` (`tokens.css`).
2. **Hợp đồng dữ liệu** — `types/api.ts` + format tiền/ngày VN.
3. **Primitive** — `Button`, `Input`, `Select`, `Field`, `Table`, `Chip`, `Alert`.
4. **★ Registry miền hoá đơn** — nguồn sự thật duy nhất: mỗi trường khai một lần (mã ↔ nhãn VN ↔ kiểu ↔ lọc/sắp/hiển thị/xuất).
5. **Pattern** — `FilterBar`, `DataTable`, `Toolbar`, `ChonKy` — đọc Registry.
6. **Trang** — ghép pattern, giữ trạng thái.

## Bảy nguyên tắc nền (vì sao làm vậy)

Single Source of Truth/DRY · Ubiquitous Language + Anti-Corruption Layer (DDD) · Atomic Design · Design Tokens · Ports & Adapters · Consistency + Accessibility (WCAG AA). Đây cũng chính là các nguyên tắc tầng sau của dự án đã dùng — bộ gốc chỉ mở sang tầng giao diện.

## Cổng kiểm trước khi làm bất kỳ thay đổi giao diện nào

Trả lời "Đạt" cho tất cả:

1. Đúng tầng chưa? (token/primitive/Registry/pattern/trang)
2. Đụng trường dữ liệu → sửa ở Registry, không sửa tay trong bảng?
3. Nhãn lấy từ một nguồn (Registry/`statusLabels`)?
4. Dùng primitive + token có sẵn (hoặc thêm primitive mới), không tự tô?
5. Ý nghĩa hành động đúng (đọc nhẹ vs kéo nặng), tên/vị trí đúng, theo hợp đồng tương tác?
6. Đủ 4 trạng thái + an toàn đa tenant + không bịa giá trị chưa kiểm chứng?
7. Không phá tiêu chí máy-kiểm (một-nơi, không-lệch-nhãn, không-hardcode)?

**Câu hỏi vàng:** *"Sửa mấy nơi — và màn khác có tự hưởng, hay phải chép lại?"*
Một nơi + tự hưởng → thuận thiết kế. Nhiều nơi / phải chép → vá ở ngọn, quay về đúng tầng.

## Làm sao biết đạt chuẩn (đo được)

Thêm một trường chỉ sửa **một tệp** · không nhãn nào lệch giữa bảng và file xuất · không hardcode màu ngoài tokens · mọi ô nhập là primitive · đủ 4 trạng thái · a11y AA · phủ test ≥ 80%. Ba tiêu chí đầu gắn được vào `Stop` hook để ép tự động.

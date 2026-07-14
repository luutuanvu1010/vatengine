# Nguyên liệu thiết kế từ Claude Design (U15 Bước 3)

> **Đây là NGUYÊN LIỆU THAM CHIẾU, KHÔNG phải mã sản phẩm.** Không import trực tiếp vào `apps/web`. Mã sản phẩm được **viết lại** (Bước 4) theo pattern repo, không dán nguyên bản xuất.

## Thư mục này chứa gì

Bản xuất từ **Claude Design** (`claude.com/product/design`) sau khi thiết kế 7 màn VATEngine:

| File | Vai trò |
|---|---|
| `*.html` (+ CSS/asset kèm) | **Bản chuẩn cấu trúc** — nguồn để chắt design tokens + tham chiếu bố cục/thành phần khi dịch sang React. |
| `*.pdf` / `*.png` (ảnh từng màn) | **Ảnh chuẩn thị giác** — dùng QA khớp giao diện ở Bước 4. |

## Nguồn brief đầu vào

`docs/plans/U15-buoc2-brief-claude-design.md` — brief đã dán vào Claude Design.

## Quy trình dùng (Bước 4 — Claude Code)

1. **Soát khớp hợp đồng:** đối chiếu mọi màn/trường với `docs/06-BINDING_MAP.md`. Gỡ cột thừa, dữ liệu giả, bí mật cứng, nhãn trạng thái tự bịa (chỉ mã đã kiểm chứng mới có nhãn).
2. **Chắt tokens:** rút màu (đỏ thương hiệu vs đỏ cảnh báo tách bạch), font, thang cách, bo góc → `docs/07-DESIGN_TOKENS` (nguồn token **duy nhất**).
3. **Viết lại React+Vite:** dựng component theo pattern `apps/web`, nối API thật, qua 6 lát cắt U15.0–U15.5 (`docs/plans/U15-plan.md`).
4. **QA thị giác:** so với ảnh/PDF chuẩn trong thư mục này.

## Ranh giới

- ❌ Không ship HTML xuất ra làm production.
- ❌ Không để markup sinh tự động quyết định kiến trúc — dịch, không dán.
- ✅ Token, cấu trúc, cảm giác thị giác: bám bản xuất này làm chuẩn.

# Handoff (Cowork) — Gỡ nút chặn U5: probe định dạng `tdlap` trong `datas[]`

> Vai: **Cowork** (điều phối/đặc tả/kiểm chứng — **KHÔNG viết code sản phẩm**). Chế độ: **gỡ lỗi/điều tra** để mở khóa U5. Ngày mở: 2026-07-13.

## Trạng thái 1 dòng

U5 (Dịch vụ đồng bộ idempotent, `packages/sync`) **đang CHẶN**: kế hoạch + prompt đã sẵn, nhưng chưa viết code vì thiếu **một** bằng chứng — *định dạng giá trị* `tdlap` GDT **trả về** trong dòng `datas[]`.

## Vì sao chặn (không được bỏ qua)

- `tdlap` nằm trong **khóa tự nhiên** hóa đơn (`hoa_don.tdlap` = `timestamptz`, một phần UNIQUE 6 trường). Map sai định dạng → **hỏng idempotent** (đúng thứ U5 phải bảo đảm).
- U2 (Amendment #5) mới xác nhận `tdlap` **có mặt** + cú pháp filter **gửi đi** (`tdlap=ge=DD/MM/YYYYT00:00:00`). **Chưa** ai ghi lại *giá trị GDT trả về*.
- Giả thuyết (CHƯA KIỂM CHỨNG, **không phải bằng chứng**): `backend/gdt_client.py:417-421` parse bằng `datetime.fromisoformat` khi chuỗi chứa `"T"` ⇒ *gợi ý* ISO-8601. Chủ dự án đã chọn **probe thật trước**, không code theo giả thuyết (bài học `:30000`, Hiến pháp "Nguyên tắc bằng chứng").

## Nhiệm vụ gỡ lỗi của Cowork

1. Hướng dẫn chủ dự án chụp **một** mẫu thật (đăng nhập là thao tác người thật — Cowork điều phối, không tự đăng nhập/không phá captcha).
2. Nhận mẫu → **xác nhận định dạng** → ghi **Amendment #7** vào `docs/adr/0001-nen-tang-cloudflare.md` + tick bằng chứng ở `docs/CHECKLIST-NGHIEM-THU.md` (mục U2/U5), gỡ nhãn CHƯA KIỂM CHỨNG cho `tdlap`.
3. Nếu cần, cập nhật `packages/gdt-client/gdt-contract-schema.json` (`invoice_envelope`) một cách **tường minh** — không tự nới assertion.
4. Bàn giao lại vai **Code** chạy `/start-unit U5` (mapper `tdlap` theo định dạng đã chốt).

## Cần chụp gì (từ Response `datas[0]` của `GET /api/query/invoices/{purchase|sold}`)

| Trường | Cần biết | Ghi chú |
|---|---|---|
| **`tdlap`** ⭐ | string hay number? nếu string: có `"T"`/`"Z"`/mili-giây? `yyyy-mm-dd` hay `dd/mm/yyyy`? | quyết định khóa tự nhiên + idempotent |
| `ncnhat` | cùng dạng `tdlap`? | cột `timestamptz` |
| `tgtcthue` **hoặc** `tgtttbso` | number hay chuỗi số? dấu thập phân? | xác nhận cột `numeric` |
| `ttxly`, `tthai` | có phải JSON number? | schema đang để `integer` |

**Cách nhanh:** DevTools → Network → request `invoices/purchase|sold` → Response → mở `datas[0]`. Dán nguyên object đã **che MST/tên/số tiền thật**, chỉ giữ **hình dạng** các trường trên.

## Ràng buộc (bắt buộc)

- **Không đoán** định dạng rồi code tiếp; **không** coi mã/tài liệu di sản là bằng chứng.
- **Bảo mật** (`.claude/rules/security.md`): **không** dán/ghi token; che dữ liệu nhạy cảm; đây là dữ liệu tenant của chính chủ dự án.
- Cowork **không** viết code trong `packages/**`; chỉ đặc tả + ghi bằng chứng + điều phối.

## Tham chiếu

- Kế hoạch: `docs/plans/U5-plan.md` · Prompt thực thi: `docs/prompts/U5-prompt.md` (đã chốt **#A hoãn thông báo (e)**, **#B chỉ cấp hóa đơn**).
- Bằng chứng nền: `docs/adr/0001-nen-tang-cloudflare.md` (Amendment #5/#6) · `docs/CHECKLIST-NGHIEM-THU.md` (U2/U3).
- Luật: `.claude/rules/{gdt-adapter,security,testing,multi-tenant}.md` · Hiến pháp: `CLAUDE.md` ("Nguyên tắc bằng chứng", "Khi gặp mơ hồ").

## Định nghĩa hoàn thành (của bước gỡ lỗi này)

Có **một mẫu `tdlap` thật** đã ghi thành Amendment #7 (kèm ngày, nguồn probe), nhãn CHƯA KIỂM CHỨNG cho `tdlap` được gỡ, và U5 sẵn sàng cho `/start-unit U5`.

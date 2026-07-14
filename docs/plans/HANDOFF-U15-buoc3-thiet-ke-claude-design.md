# Bàn giao phiên — U15 Bước 3: Thiết kế UI qua Claude Design → chuẩn bị Bước 4

> **Trạng thái nền (2026-07-14):** nhánh `feat/cloudflare-stack-u0`. U0–U14 backend xong. Frontend đi theo **quy trình 4 bước** của chủ dự án. **Bước 1 + Bước 2 + Bước 3 đã XONG** — 7 màn đã thiết kế trong Claude Design và **export (HTML + PNG) đã có trong `docs/design/claude-design/`**. **Phiên sau vào thẳng Bước 4 (viết React).**

---

## 1. Quy trình 4 bước frontend & ta đang ở đâu

| Bước | Nội dung | Trạng thái |
|---|---|---|
| 1 | Nghiên cứu Claude Design (định dạng đầu vào/ra) | ✅ Xong — `docs/plans/U15-buoc1-ket-qua-nghien-cuu-claude-design.md` |
| 2 | Đóng gói brief cho Claude Design | ✅ Xong — `docs/plans/U15-buoc2-brief-claude-design.md` |
| **3** | **Thiết kế UI trong Claude Design (thiết kế trước, chưa code)** | ✅ Xong — 7 màn export HTML+PNG đã ở `docs/design/claude-design/` |
| 4 | Dịch thiết kế đã duyệt → `apps/web` (React+Vite), nối API thật, qua 6 lát cắt U15.0–U15.5 | ⏳ **Bắt đầu phiên sau** |

## 2. Nguyên liệu Bước 3 đã có trong repo

`docs/design/claude-design/` chứa export cho 7 màn: **S0 Đăng nhập · Dashboard · S1 Danh sách · S2 Chi tiết · S3 Kết xuất/Convert · S4 Đối chiếu · S5 Kết nối thuế** — dạng `*.html` (bản chuẩn cấu trúc) + `*.png` (ảnh chuẩn thị giác) + `VATEngine-mockup.html` (bản gộp). Đây là **nguyên liệu tham chiếu**, không phải mã sản phẩm (xem README trong thư mục).

## 3. Nhiệm vụ phiên sau = KHỞI ĐỘNG BƯỚC 4 (vai Code)

Sau khi có export trong `docs/design/claude-design/`, làm **theo thứ tự**, mỗi bước có bằng chứng:

1. **Soát khớp hợp đồng** (cổng đầu tiên — không bỏ qua): đối chiếu từng màn/trường của bản export với `docs/06-BINDING_MAP.md`.
   - Gỡ: cột thừa ngoài `EXPORT_COLUMNS`, **dữ liệu giả**, **bí mật cứng**, **nhãn trạng thái tự bịa** (chỉ mã `ttxly`/`tthai` đã kiểm chứng mới có nhãn; còn lại "số + (chưa rõ)").
   - Kiểm quy tắc tiền (chuỗi, không float, căn phải, rút gọn nhưng không sai số), ngày UTC→VN, enum chiều/nguồn.
   - Kiểm RBAC: `ke_toan` không thấy nút kết xuất/convert/kết-nối-thuế.
2. **Chắt `docs/07-DESIGN_TOKENS`** từ HTML/CSS: màu (**tách đỏ-thương-hiệu vs đỏ-cảnh-báo**), font (nét đậm, hỗ trợ dấu Việt, số tabular), thang cách, bo góc. **Nguồn token DUY NHẤT** (Hiến pháp — không tạo nguồn thứ hai).
3. **Dịch sang React+Vite** trong `apps/web` theo pattern repo — **viết lại, không dán HTML**. Nối API thật. Chạy qua **6 lát cắt U15.0–U15.5** (`docs/plans/U15-plan.md`).
4. **QA:** khớp thị giác với ảnh/PDF chuẩn; `make lint && make test` xanh; DoD; review chéo subagent.

## 4. Ranh giới (giữ nguyên)

- ❌ Không ship HTML export làm production. Dịch, không dán.
- ❌ Không để markup sinh tự động quyết định kiến trúc.
- ❌ Không dựng màn/trường ngoài `06-BINDING_MAP` (xem §8 "ngoài phạm vi": Admin, "Đồng bộ ngay", lịch sử đồng bộ, dòng hàng chi tiết, webhook kế toán).
- ✅ `tenant_id` luôn từ token; không bí mật ở client; captcha người tự nhập.

## 5. Đầu vào phiên sau cần đọc (đúng thứ tự vai Design/Code)

1. `CLAUDE.md` (Hiến pháp) + `.claude/rules/` liên quan.
2. `docs/06-BINDING_MAP.md` — **nguồn chân lý dữ liệu/RBAC/bảo mật cho UI**.
3. `docs/plans/U15-buoc2-brief-claude-design.md` — brief đã dùng.
4. `docs/plans/U15-plan.md` — UX chi tiết + 6 lát cắt U15.0–U15.5.
5. `docs/design/claude-design/` — bản export (nguyên liệu).
6. `docs/adr/0003-frontend-react-vite.md` — ngăn xếp chốt.

## 6. Workstream song song còn treo (không quên)

- **Deploy:** chờ quyết định Postgres (Neon/Supabase) + Workers plan — `docs/plans/HANDOFF-chon-postgres-va-workers-paid.md`. Bộ nhớ: Postgres=Neon, Workers Free trước (`memory/vat-quyet-dinh-ha-tang-2026-07-14.md`).
- **Smoke test đầu-cuối thật** (login thật → token sealed → sync → kéo hóa đơn): sau khi deploy.

## 7. Ghi chú

- Chuỗi phiên này **không đụng mã sản phẩm** — chỉ 3 tài liệu (Bước 1 note, Bước 2 brief, README nguyên liệu) + handoff này.
- Chưa cần `make test` lại (không đổi code); lần chạy gần nhất xanh (376 test) ở chuỗi U14.

# Bàn giao phiên — U15 Bước 1: Nghiên cứu Claude Design (đầu vào thiết kế)

> **Mục đích phiên sau:** thực hiện **Bước 1** trong quy trình 4 bước frontend của chủ dự án. **KHÔNG vẽ UI, KHÔNG code, KHÔNG đóng gói gì vội** — chỉ **nghiên cứu tài liệu CHÍNH THỨC của Anthropic** để xác định cách chuẩn đưa đầu vào cho **Claude Design**, ghi lại nguồn + ngày.
>
> **Trạng thái nền (2026-07-14):** nhánh `feat/cloudflare-stack-u0` @ `7d02624` (đã push `origin`). U0–U14 backend xong. Đặc tả frontend đã Accepted.

---

## 1. Đã có gì (điều kiện tiên quyết đã đủ)

| Artifact | Trạng thái | Vai trò với Bước 1 |
|---|---|---|
| `docs/adr/0003-frontend-react-vite.md` | 🟢 Accepted (2026-07-14) | Ngăn xếp đã chốt: React+Vite SPA · gồm màn kết nối thuế · JWT in-memory |
| `docs/06-BINDING_MAP.md` | 🟢 Chính thức | **Đây là "nguyên liệu" sẽ đóng gói ở Bước 2** — ánh xạ 12 endpoint (gồm U14) → bề mặt, ràng buộc dữ liệu/RBAC/bảo mật |
| `docs/plans/U15-plan.md` | Kế hoạch | Nội dung màn hình/UX chi tiết + 6 lát cắt U15.0–U15.5 |

Hard-stop Hiến pháp §3 (Design cần `06-BINDING_MAP` trước) **đã gỡ** — vai Design được phép chạy. Nhưng quy trình đòi **nghiên cứu trước, thiết kế sau**.

## 2. Nhiệm vụ Bước 1 (làm chính xác việc này)

1. **Tra tài liệu CHÍNH THỨC Anthropic** (`docs.anthropic.com`, `claude.ai`, trang sản phẩm chính thức) để trả lời:
   - **"Claude Design" thực chất là gì?** ⚠️ **CHƯA KIỂM CHỨNG** trong dự án này — chưa xác nhận đây là một tính năng/sản phẩm cụ thể hay là năng lực thiết kế/Artifacts của Claude. **Bước đầu tiên là xác minh khái niệm**, không mặc định nó tồn tại đúng như tên gọi.
   - **Nhận đầu vào dạng gì?** design brief? component inventory? data/API contract? design tokens? ảnh tham chiếu? prompt văn bản?
   - **Định dạng bàn giao khuyến nghị** (markdown? JSON? cấu trúc cụ thể?).
2. **Ghi lại bằng chứng:** mỗi khẳng định về Claude Design phải kèm **URL nguồn chính thức + ngày truy cập** (Nguyên tắc bằng chứng — Hiến pháp). KHÔNG suy đoán quy trình rồi trình bày như thật.
3. **Kết luận:** một ghi chú ngắn "Claude Design nhận đầu vào X, định dạng Y" (đã kiểm chứng) → làm khuôn cho Bước 2.

**Công cụ gợi ý:** WebFetch/WebSearch tới `docs.anthropic.com`; hoặc `claude-code-guide` subagent (chuyên hỏi–đáp về Claude/Anthropic) nếu phù hợp. Nếu tài liệu không xác nhận "Claude Design" là gì → **DỪNG và báo chủ dự án** (đừng tự chọn một quy trình).

## 3. Ranh giới (không vượt trong phiên Bước 1)

- ❌ Không vẽ mockup / không tạo design token / không dựng `apps/web`.
- ❌ Không đóng gói `06-BINDING_MAP` khi chưa biết định dạng Claude Design đòi (đó là Bước 2).
- ❌ Không suy đoán đặc điểm Claude Design — phải có nguồn chính thức.

## 4. Sau Bước 1 (bối cảnh, không làm ở phiên đó)

- **Bước 2:** đóng gói `06-BINDING_MAP` (+ ràng buộc từ U15-plan) theo đúng định dạng Claude Design đòi.
- **Bước 3:** thiết kế UI qua Claude Design (thiết kế trước, chưa code).
- **Bước 4:** dịch thiết kế đã duyệt → `apps/web` (React/Vite trên Workers Static Assets), nối API thật; chạy qua 6 lát cắt U15.0–U15.5 (`U15-plan.md`).

## 5. Các workstream song song còn treo (không quên)

- **Workstream 2 — Deploy:** chờ 2 quyết định của chủ dự án (Postgres Neon/Supabase + Workers Paid). Handoff riêng: `docs/plans/HANDOFF-chon-postgres-va-workers-paid.md`.
- **Workstream 1 — smoke test đầu-cuối thật** (login thật → token sealed → sync → kéo hóa đơn): gộp vào sau khi deploy lên.

## 6. Ghi chú kỹ thuật

- Bộ nhớ dự án đã cập nhật: `memory/vat-huong-di-sau-u12.md` (U15 đặc tả xong + bước kế = nghiên cứu Claude Design).
- Không có thay đổi mã sản phẩm trong chuỗi phiên này — chỉ probe token (U14 Task 1), 3 file handoff/ADR/binding-map. `make test` xanh (376), `make lint` sạch.

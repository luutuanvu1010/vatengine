# Bắt đầu tại đây — Điểm vào dự án VATCrawlbot

Tài liệu này là **cửa vào duy nhất** cho mỗi phiên làm việc mới. Đọc file này trước, nó chỉ tới mọi thứ còn lại.

Cập nhật lần chốt: **2026-07-12** · Vị trí lộ trình: **U0 ✅ ĐẠT (`make lint && make test` xanh trên máy — commit `757ec3a`, `fa0988b`) → mốc kế tiếp = U1a (dựng relay VN + kiểm chứng egress `:30000`); U1 BỊ CHẶN bởi U1a**.

> ⚠️ **U1a chặn U1** (Amendment ADR-0001, 2026-07-12): biên Cloudflare không tới được API GDT `:30000` → mọi gọi API phải qua relay đặt tại VN. **U1a cần một VPS tại VN**; chưa có VPS ⇒ chưa dựng relay, chưa vào U1a/U1.

---

## 1. Dự án một câu

SaaS multi-tenant truy xuất hóa đơn điện tử đầu vào/đầu ra trực tiếp từ Tổng cục Thuế (`hoadondientu.gdt.gov.vn`) bằng tài khoản MST hợp pháp của chính doanh nghiệp; chuẩn Enterprise, hướng tới 100.000 khách hàng. Ngăn xếp: **Cloudflare Workers + TypeScript** (chốt theo ADR-0001).

## 2. Bản đồ tài liệu (theo thứ tự thẩm quyền)

| Tài liệu | Vai trò | Tầng quản trị | Trạng thái |
|---|---|---|---|
| `CLAUDE.md` | **Hiến pháp** — nguyên tắc tối cao, ranh giới pháp lý, quy tắc cứng, Definition of Done | Hiến pháp | ✅ đã cập nhật sang Cloudflare |
| `docs/adr/0001-nen-tang-cloudflare.md` | **Quyết định kiến trúc** chọn Cloudflare (Workers/TS, Postgres+Hyperdrive, Queues/Workflows/DO, egress T0/T1) | ADR | ✅ Accepted |
| `.claude/rules/*.md` | **Luật** vận hành theo chủ đề (gdt-adapter, multi-tenant, security, testing) | Luật | ✅ đã cập nhật |
| `.claude/settings.json` + `.claude/hooks/*` | **Cổng kiểm soát** ép lint/test + chặn hành động nguy hiểm | Bắt buộc kỹ thuật | ✅ đã cập nhật |
| `.claude/skills/*` + `.claude/agents/*` | **Quy trình đóng gói** — vòng lặp + review chéo | Quy trình | ✅ đủ bộ |
| `docs/CHECKLIST-NGHIEM-THU.md` | **Bảng điểm** — tiêu chí thông qua từng mốc U0–U12 | Theo dõi | ✅ đang dùng |
| `KIEN_TRUC_VA_KE_HOACH.md` | Nguồn chân lý **"làm gì"** — mô hình dữ liệu (mục 7), lộ trình (mục 12) | Tài liệu nguồn | có banner ADR |
| `TRIEN_KHAI_BANG_CLAUDE_CODE.md` | Nguồn chân lý **"làm thế nào"** — phương pháp, đơn vị U0–U12 (mục 3) | Tài liệu nguồn | có banner ADR |
| `KHAO_SAT_TINH_NANG_NIBOT.md` | Mốc tính năng đối thủ (feature parity) | Tham chiếu | — |
| `backend/` (Python) | **Di sản MVP** — giữ để port sang TS ở U1–U3, **không phát triển tiếp** | Tham chiếu | đóng băng |

Khi một tầng dưới mâu thuẫn tầng trên: **tầng trên thắng** — sửa tầng dưới, không né. Đổi kiến trúc ⇒ viết/sửa ADR + sửa Hiến pháp tường minh.

## 3. Mô hình làm việc: mỗi đầu việc một vòng lặp, có sub-agent kiểm đầu ra

Mỗi mốc (U#) đi trọn một vòng lặp, gọi bằng lệnh `/slash`:

```
/plan-unit U#   → lập kế hoạch (file/test/tiêu chí/rủi ro/điểm mơ hồ)
/write-prompt U# → sinh prompt thực thi chuẩn (tùy chọn)
/start-unit U#   → thực thi TDD một đơn vị
/verify          → make lint + test, đối chiếu Definition of Done
/qa-unit         → SUB-AGENT kiểm đầu ra (chặn nếu Critical)
   └─ đạt → thông qua + commit → mốc kế tiếp
   └─ chưa → tự vòng lại /start-unit
```

**Mỗi đầu việc có sub-agent kiểm đầu ra** (do `/qa-unit` điều phối, chạy song song):

| Sub-agent | Kiểm gì | Dùng cho mốc |
|---|---|---|
| `dod-auditor` | Definition of Done tổng quát (test/coverage/tài liệu/code chết/không lệch Hiến pháp) | **mọi mốc** |
| `contract-guardian` | Cô lập adapter GDT, 401, cổng hợp đồng, không phá captcha, egress | U1, U2, U3 (và khi đụng `packages/gdt-client`) |
| `security-reviewer` | Bí mật, không lưu mật khẩu thô, cách ly tenant/RLS | U4, U6, U8, U12 (và khi đụng auth/token/tenant) |

## 3b. Vận hành trong MỘT cửa sổ Claude Code (best practice Anthropic)

Toàn bộ vòng lặp chạy **trong một phiên Claude Code duy nhất** — không cần công cụ thứ hai chép prompt qua lại. Sub-agent review trả kết quả **thẳng vào cùng phiên** để tự sửa ("without you copying findings between windows"). Nguồn: `code.claude.com/docs/en/best-practices`.

Con người giữ vai trò quyết định ở **cổng quản trị**, không cần đọc code:

- **Plan Mode (Shift+Tab → chế độ chỉ đọc):** Claude chỉ đọc + trình **kế hoạch bằng lời**; bạn duyệt/sửa (Ctrl+G mở trong editor) rồi mới cho chạy. Đây là cổng "kiến trúc sư". (`/plan-unit` đóng đúng vai này.)
- **Duyệt hành động có hệ quả:** Claude hỏi trước khi ghi file/commit; `/permissions` cho phép sẵn các lệnh an toàn (`make lint`, `make test`) để đỡ bị hỏi vặt.
- **Soát BẰNG CHỨNG, không soát code:** đọc kết quả test pass/fail, báo cáo `/qa-unit`, và các ô đã tick trong checklist — nhanh hơn và không cần biết lập trình.
- **Cổng DoD tự động:** Stop hook `gate-dod.sh` chặn kết thúc lượt tới khi `make lint && make test` xanh (khách quan, không phụ thuộc thiện chí).
- **Đi lùi an toàn:** `Esc` dừng giữa chừng; `/rewind` quay lại điểm trước; `/clear` xoá ngữ cảnh giữa hai việc rời rạc.

Mẹo cho người không lập trình: có thể mô tả ý muốn bằng lời rồi bảo *"phỏng vấn tôi bằng AskUserQuestion rồi viết spec"* — Claude tự hỏi phần kỹ thuật. Claude Code cũng có **ứng dụng Desktop** (giao diện, không cần dùng terminal thô).

**Cowork (chỗ này) là tùy chọn, KHÔNG nằm trong vòng lặp:** chỉ dùng khi cần việc tách biệt bất đồng bộ — nghiên cứu (ví dụ GDT đổi API), soạn tài liệu/báo cáo. Không dùng để "điều phối" từng mốc, vì điều đó tạo ra chính việc chép qua chép lại cần tránh.

## 4. Trạng thái chốt phiên này

- ✅ Chọn nền tảng Cloudflare + ghi ADR-0001 (Accepted); chốt Postgres+Hyperdrive (A2) + TypeScript (B1).
- ✅ Gỡ rủi ro egress: cơ chế `GdtTransport` T0/T1 + probe; spike chạy thật → GDT trả 200 từ colo SG (đạt sơ bộ).
- ✅ Sửa Hiến pháp + 4 Luật + 2 hook sang stack mới.
- ✅ Dựng khung U0: monorepo `apps/api` (Hono) + `packages/gdt-client` + CI + Makefile.
- ✅ Đủ bộ skill/agent vòng đời + checklist nghiệm thu U0–U12.

## 5. Việc còn treo (làm đầu phiên sau)

- ✅ **Đã xong (2026-07-12):** commit đợt cuối; `make lint && make test` xanh trên máy; U0 tick đủ và đổi trạng thái `✅ ĐẠT` trong checklist (commit `757ec3a`, `fa0988b`).
- ✅ **Đã kết luận egress `:30000` (2026-07-12):** probe edge thật cho thấy biên Cloudflare **KHÔNG** tới được API `:30000` (`fetch` → 521; TCP `connect()` → không nối được); thử direct-origin (`resolveOverride` + TCP) **inconclusive**, giữ làm bằng chứng (commit `fb54fea`). → Amendment ADR-0001 **bác bỏ T0 cho API**; **T1 relay VN là đường chính**.
- ⬜ **U1a — Dựng relay VN + kiểm chứng egress `:30000` (chặn U1):** cần **VPS tại VN** trước; từ VN `curl :30000/captcha` trả `{key, content}`; relay stateless mTLS+secret; Worker gọi GDT qua relay. **Chưa có VPS ⇒ chưa vào U1a/U1.**
- 🔄 **Egress (xuyên suốt):** tiếp tục theo dõi ở U1–U3 (nhiều colo, tải cao, endpoint có token).
- ℹ️ **Nạp lại skill:** khởi động lại phiên Claude Code khi thêm skill mới trong `.claude/skills/`.

## 6. Khởi động phiên mới — làm gì trước

1. Đọc file này + `docs/CHECKLIST-NGHIEM-THU.md` để biết mốc kế tiếp (**U1a**).
2. **Điều kiện tiên quyết U1a: có một VPS tại VN.** Chưa có ⇒ **DỪNG**, không dựng relay, không code U1a/U1. Khi có VPS: chạy `/plan-unit U1a` (dựng relay VN stateless mTLS+secret + kiểm chứng `curl :30000/captcha` từ VN trả `{key, content}` + Worker gọi GDT qua relay).
3. Sau khi U1a ĐẠT (relay chạy, egress `:30000` kiểm chứng xong): `/plan-unit U1` (GDT Adapter: captcha + authenticate) — port từ `backend/gdt_client.py` sang `packages/gdt-client` bằng TypeScript.
4. Theo vòng lặp mục 3 cho tới khi `/qa-unit` báo ĐẠT, rồi tick mốc trong checklist và commit.

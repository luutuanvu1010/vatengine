# Bắt đầu tại đây — Điểm vào dự án VATCrawlbot

Tài liệu này là **cửa vào duy nhất** cho mỗi phiên làm việc mới. Đọc file này trước, nó chỉ tới mọi thứ còn lại.

Cập nhật lần chốt: **2026-07-13** · Vị trí lộ trình: **U0 ✅ ĐẠT → egress T0 ✅ ĐÃ KIỂM CHỨNG → mốc kế tiếp = sửa `BASE` + contract test rồi vào U1** (U1a relay **BỎ**, không cần).

> ✅ **Phép thử quyết định ĐÃ CHẠY 2026-07-13 (ADR-0001 Amendment #3):** gọi **đúng** `https://hoadondientu.gdt.gov.vn/api/captcha` từ biên Cloudflare thật (`wrangler dev --remote`, spike `spikes/gdt-egress-probe` route `/decision`) → **200 + JSON `{key,content}` hợp lệ**, 3 lần liên tiếp, egress từ colo nước ngoài (`HK`, xác nhận qua `cdn-cgi/trace` — không phải egress cục bộ VN). ⇒ **T0 thuần Cloudflare CHẠY được tới API GDT thật.** Nhánh **relay/VPS/Tunnel/U1a BỎ** (giữ tài liệu làm bằng chứng lịch sử, không xoá, không cần dựng). **Bước kế tiếp:** sửa `BASE` (`packages/gdt-client/src/endpoints.ts`, `backend/gdt_client.py`) sang `https://hoadondientu.gdt.gov.vn` (`:443`) path `/api/...`, kèm contract test khoá `{key, content}`; rồi vào U1.

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

## 4. Trạng thái chốt phiên này (cập nhật 2026-07-13)

**Nền (giữ nguyên):** Cloudflare + TypeScript + Postgres/Hyperdrive (ADR-0001, Accepted); khung **U0 ✅ ĐẠT**; đủ bộ skill/agent + checklist U0–U12.

**Phiên 2026-07-13 (sáng) — ĐÍNH CHÍNH LỚN + quản trị:**

- 🔴 **Tiền đề `:30000` SAI (kiểm chứng từ vantage VN).** `curl :30000/captcha` → *connection refused* (cổng chết); `dig` → `103.9.200.142` (GDT **không** sau Cloudflare); **API thật = `https://hoadondientu.gdt.gov.vn/api/captcha`** (`:443`, tiền tố `/api`, đọc từ lưu lượng sống trang login). "521 → cần relay" hôm 2026-07-12 chỉ là **artifact gọi cổng chết**. → ADR-0001 **Amendment #2** (commit `de80e84`).
- ⏸️ **TREO toàn bộ nhánh relay/VPS/Tunnel/U1a** (giữ làm bằng chứng, **chưa xoá**): `ADR-0002`, kế hoạch U1a (`docs/plans/`), mục "Relay VN" trong `security.md`, domain `vatengine.khanhhoatravel.com.vn`.
- ✅ **Hiến pháp:** thêm mục **"Nguyên tắc bằng chứng"** — không giả định vô căn cứ; giả định phải gắn nhãn CHƯA KIỂM CHỨNG (commit `b088cb5`).
- ✅ Dọn commit treo + tài liệu egress-identity (`ADR-0002` + mục 3b: cần cả đồng bộ nền lẫn on-demand) + prompt nghiên cứu daemon (bổ trợ, phiên riêng).

**Phiên 2026-07-13 (tiếp) — PHÉP THỬ QUYẾT ĐỊNH đã chạy:**

- ✅ **Mục 5.1 (cũ) ĐÃ CHẠY.** `wrangler dev --remote` (edge Cloudflare thật) gọi đúng `https://hoadondientu.gdt.gov.vn/api/captcha` qua route `/decision` mới thêm vào `spikes/gdt-egress-probe/src/index.ts` → **200 + JSON `{key,content}` hợp lệ**, 3/3 lần, egress từ colo nước ngoài (`HK`, xác nhận qua `cdn-cgi/trace`). Chi tiết + giới hạn bằng chứng: ADR-0001 **Amendment #3**.
- ✅ **Kết luận:** T0 thuần Cloudflare CHẠY cho API GDT thật. Nhánh relay/VPS/Tunnel/U1a **BỎ** (không xoá tài liệu — giữ làm bằng chứng lịch sử). Đã cập nhật `docs/CHECKLIST-NGHIEM-THU.md` (mục U1a) phản ánh việc này.
- ✅ Đã sửa `GDT_PROBE_URL` trong `spikes/gdt-egress-probe/wrangler.jsonc` từ root `/` sang `/api/captcha` đúng endpoint thật.
- ⚪ **Chưa làm trong phiên này:** sửa `BASE` trong `packages/gdt-client/src/endpoints.ts` + `backend/gdt_client.py` (vẫn còn trỏ `:30000` cũ) và contract test khoá `{key, content}` — đây là **việc code kế tiếp**, nên qua `/plan-unit` trước khi sửa (đúng vòng lặp TDD của dự án), không làm tắt trong phiên đọc/kiểm chứng này.

## 5. Việc còn lại (theo thứ tự)

1. ✅ ~~PHÉP THỬ QUYẾT ĐỊNH~~ — xong, xem trên. Kết quả: **T0 chạy, bỏ relay**.
2. 🔵 **Sửa `BASE`** (việc code — TDD, nên qua `/plan-unit` trước): `packages/gdt-client/src/endpoints.ts` + `backend/gdt_client.py` → `https://hoadondientu.gdt.gov.vn` (`:443`), path `/api/...`; kèm **contract test** dựng từ 3 bản ghi thật ở Amendment #3 (`{key, content}`, `content` là chuỗi SVG).
3. 🔵 **Khoá contract captcha vào `packages/gdt-client/gdt-contract-schema.json`** (file này hiện **chưa tồn tại**) — dùng đúng 3 mẫu response thật đã lấy ở Amendment #3 làm căn cứ, không suy đoán thêm trường.
4. ⚪ **Nghiên cứu daemon egress client** — phiên riêng, prompt sẵn ở `docs/prompts/nghien-cuu-daemon-egress-client.md` (nhánh bổ trợ, chỉ khi cần).
5. ℹ️ Sau mục 2–3 mới vào **U1** (GDT Adapter: captcha + authenticate), port từ `backend/gdt_client.py`, qua `/plan-unit → /start-unit → /verify → /qa-unit`.

## 6. Khởi động phiên mới — làm gì trước

1. Đọc file này + `docs/adr/0001-nen-tang-cloudflare.md` **Amendment #3** + `docs/CHECKLIST-NGHIEM-THU.md`.
2. Egress đã chốt (mục 4–5 trên) — **không cần chạy lại phép thử quyết định** trừ khi có nghi ngờ cụ thể (đổi hạ tầng GDT, đổi endpoint...).
3. Bắt đầu từ mục 5.2 (sửa `BASE` + contract test) qua `/plan-unit`, rồi vào **U1**. Giữ vòng lặp `/plan-unit → /start-unit → /verify → /qa-unit`.
4. Tôn trọng **"Nguyên tắc bằng chứng"** (Hiến pháp): không chốt bất cứ điều gì về API thuế nếu chưa có phép kiểm chứng tái lập được.

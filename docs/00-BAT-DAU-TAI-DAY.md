# Bắt đầu tại đây — Điểm vào dự án VATCrawlbot

Tài liệu này là **cửa vào duy nhất** cho mỗi phiên làm việc mới. Đọc file này trước, nó chỉ tới mọi thứ còn lại.

Cập nhật lần chốt: **2026-07-13** · Vị trí lộ trình: **U0 ✅ ĐẠT → mốc kế tiếp = SỬA TIỀN ĐỀ EGRESS rồi mới quyết U1** (U1a relay **TREO**).

> ⛔ **Đính chính lớn 2026-07-13 (ADR-0001 Amendment #2):** cổng `:30000` là **cổng chết** (curl từ VN → *connection refused*); **API thật ở `https://hoadondientu.gdt.gov.vn/api/captcha`** (`:443`, tiền tố `/api`). Cái "521 → cần relay" hôm 2026-07-12 là **artifact do gọi nhầm cổng chết**. ⇒ Nhánh **relay/VPS/Tunnel/U1a TREO**. **Bước kế tiếp:** chạy egress probe nhắm **đúng `/api/captcha` từ biên Cloudflare**; nếu Workers tới được ⇒ **gỡ relay, trở lại T0 thuần Cloudflare**, và sửa `BASE` (`packages/gdt-client`, `backend/gdt_client.py`) sang `:443` `/api`.

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

**Phiên 2026-07-13 — ĐÍNH CHÍNH LỚN + quản trị:**

- 🔴 **Tiền đề `:30000` SAI (kiểm chứng từ vantage VN).** `curl :30000/captcha` → *connection refused* (cổng chết); `dig` → `103.9.200.142` (GDT **không** sau Cloudflare); **API thật = `https://hoadondientu.gdt.gov.vn/api/captcha`** (`:443`, tiền tố `/api`, đọc từ lưu lượng sống trang login). "521 → cần relay" hôm 2026-07-12 chỉ là **artifact gọi cổng chết**. → ADR-0001 **Amendment #2** (commit `de80e84`).
- ⏸️ **TREO toàn bộ nhánh relay/VPS/Tunnel/U1a** (giữ làm bằng chứng, **chưa xoá**): `ADR-0002`, kế hoạch U1a (`docs/plans/`), mục "Relay VN" trong `security.md`, domain `vatengine.khanhhoatravel.com.vn`.
- ✅ **Hiến pháp:** thêm mục **"Nguyên tắc bằng chứng"** — không giả định vô căn cứ; giả định phải gắn nhãn CHƯA KIỂM CHỨNG (commit `b088cb5`).
- ✅ Dọn commit treo + tài liệu egress-identity (`ADR-0002` + mục 3b: cần cả đồng bộ nền lẫn on-demand) + prompt nghiên cứu daemon (bổ trợ, phiên riêng).

## 5. Việc còn treo — LÀM ĐẦU PHIÊN SAU (theo thứ tự)

1. 🔵 **PHÉP THỬ QUYẾT ĐỊNH — chạy trước hết:** gọi `https://hoadondientu.gdt.gov.vn/api/captcha` **từ biên Cloudflare** (`wrangler dev --remote`, **KHÔNG** local — local egress = IP VN → "đạt" giả). Đọc `status` / `bodyPreview` / `egressCountry`.
   - `200` + JSON `{key,content}` từ colo nước ngoài → **T0 thuần Cloudflare CHẠY → GỠ BỎ relay/VPS/Tunnel/U1a**, gỡ TREO.
   - `403/451` → chặn địa lý → **tái lập relay VN nhưng nhắm ĐÚNG `:443 /api`** (kế hoạch U1a sửa endpoint, không phải `:30000`).
2. 🔵 **Sửa `BASE`** (hệ quả trực tiếp, việc code — TDD): `packages/gdt-client/src/endpoints.ts` + `backend/gdt_client.py` → `https://hoadondientu.gdt.gov.vn` (`:443`), path `/api/...`; kèm **contract test**. Cả spike `spikes/gdt-egress-probe` (`GDT_PROBE_URL`) đang trỏ URL cũ.
3. 🔵 **Khoá contract captcha:** `curl .../api/captcha` lấy **body thật**, xác nhận `{key, content}` (chưa dán ở phiên này).
4. ⚪ **Nghiên cứu daemon egress client** — phiên riêng, prompt sẵn ở `docs/prompts/nghien-cuu-daemon-egress-client.md` (nhánh bổ trợ, chỉ khi cần).
5. ℹ️ Sau khi egress chốt xong mới quay lại **U1** (GDT Adapter: captcha + authenticate), port từ `backend/gdt_client.py`.

Mẫu Worker cho bước 1 (spike passthrough, chạy `wrangler dev --remote`):

```js
export default { async fetch() {
  const r = await fetch("https://hoadondientu.gdt.gov.vn/api/captcha",
    { headers: { "accept": "application/json, text/plain, */*", "end-point": "/" } });
  const body = await r.text();
  const trace = await (await fetch("https://www.cloudflare.com/cdn-cgi/trace")).text();
  return Response.json({ status: r.status, egressCountry: (trace.match(/loc=(\w+)/)||[])[1], bodyPreview: body.slice(0,300) });
}};
```

## 6. Khởi động phiên mới — làm gì trước

1. Đọc file này + `docs/adr/0001-nen-tang-cloudflare.md` **Amendment #2** + `docs/CHECKLIST-NGHIEM-THU.md` (mốc U1a đang **⏸️ TREO**).
2. Chạy **phép thử quyết định** (mục 5.1) — kết quả quyết định toàn bộ hướng đi (bỏ relay hay không). **Chưa có kết quả ⇒ chưa chốt gì về egress.**
3. Theo kết quả: sửa `BASE` + contract test (mục 5.2–5.3), rồi vào **U1**. Giữ vòng lặp `/plan-unit → /start-unit → /verify → /qa-unit`.
4. Tôn trọng **"Nguyên tắc bằng chứng"** (Hiến pháp): không chốt bất cứ điều gì về API thuế nếu chưa có phép kiểm chứng tái lập được.

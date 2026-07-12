# ADR-0001 — Nền tảng triển khai Backend & Frontend trên hệ sinh thái Cloudflare

- **Trạng thái:** ✅ Đã chấp thuận (Accepted) — 2026-07-11 · **sửa đổi 2026-07-12** (xem "Amendment" bên dưới)
- **Quyết định đã chốt:** **4A = A2** (PostgreSQL ngoài + Hyperdrive) · **4B = B1** (TypeScript trên Workers) · Egress: **~~T0 (thuần Cloudflare) làm chính~~ → BỊ BÁC BỎ cho API (Amendment 2026-07-12)**; **T1 relay VN là ĐƯỜNG CHÍNH cho API `:30000`**, T0 chỉ cho tài nguyên công khai `:443`/probe.
- **Ngày:** 2026-07-11 (bản gốc) · 2026-07-12 (amendment egress)
- **Changelog:** `2026-07-12` — Egress T0 bị bác bỏ cho API sau probe edge thật; T1 relay VN thành đường chính + thành phần trọng yếu bảo mật. Nền tảng còn lại (Workers/TS, Postgres/Hyperdrive) giữ nguyên.
- **Người quyết định:** Chủ dự án (luutuanvu.gl@gmail.com)
- **Phạm vi ảnh hưởng:** Hiến pháp `CLAUDE.md` (mục "Ngăn xếp công nghệ", "Kiến trúc — quy tắc cứng"), các luật `.claude/rules/*.md`, khung `backend/` + `frontend/` hiện có.
- **Nguồn tra cứu:** Tài liệu chính thức Cloudflare (developers.cloudflare.com), truy cập 2026-07-11. Các mốc giới hạn dẫn trong tài liệu này lấy từ trang docs cập nhật tháng 4–6/2026.

> ⚠️ **Cảnh báo quản trị.** Quyết định này **mâu thuẫn trực diện** với Hiến pháp hiện hành (Python/FastAPI/PostgreSQL/Celery/Redis). Theo chính khung quản trị của dự án ("khi một luật mâu thuẫn với Hiến pháp, Hiến pháp thắng — sửa luật, không sửa hiến pháp để né"), việc chuyển sang Cloudflare **bắt buộc phải sửa Hiến pháp một cách tường minh**, không được lặng lẽ đi chệch. Mục "Hệ quả" liệt kê các thay đổi Hiến pháp cần thông qua.

---

## Amendment (2026-07-12) — Egress T0 (thuần Cloudflare) BỊ BÁC BỎ cho API; T1 relay VN là ĐƯỜNG CHÍNH

> Bổ sung sau khi **kiểm chứng lại egress bằng probe trên edge thật** (`wrangler dev --remote`, colo SG). ADR **giữ trạng thái Accepted**; đây là changelog sửa **một giả định sai của bản gốc** (mục 5B, 8, 9), **không** đảo quyết định nền tảng — Workers/TS + Postgres/Hyperdrive giữ nguyên.

### Bằng chứng probe (edge thật Cloudflare, colo SG — 2026-07-12)

| Phép thử (từ Cloudflare Worker) | Kết quả | Diễn giải |
|---|---|---|
| `fetch https://hoadondientu.gdt.gov.vn:30000/captcha` | **HTTP 521** · `server: cloudflare` · body `error code: 521` | Biên Cloudflare **KHÔNG tới được** origin API trên `:30000` |
| `connect(TLS) :30000` (Workers TCP Sockets) | **không nối được** — `cannot connect to the specified address` | Sockets cũng không tới `:30000` |
| `fetch :443/captcha` | **404** · `server: cloudflare` · HTML SPA | `:443` chỉ là tầng web; `/captcha` **không phải** API ở đây |
| `fetch :443/` (root) | **200** · HTML SPA | Đúng thứ spike gốc đo — **chỉ web SPA**, không phải API |
| direct-origin (resolveOverride / TCP tới origin IP) | **inconclusive** — 521 từ Cloudflare / bị `wrangler dev --remote` chặn | Không né được lớp CF từ biên; không có bằng chứng đi vòng được |

DNS công khai: `hoadondientu.gdt.gov.vn` → **`103.9.200.142`** (netname **GDT-VN**, origin Việt Nam — **không** phải IP Cloudflare).

### Kết luận (thay cho "Kết quả spike (2026-07-11)" ở mục 5B)

- Spike gốc kết luận **sai**: chỉ đo `:443` **root** (cổng web SPA CF-fronted, trả 200), **không phải API `:30000`**. Đính chính tại mục 5B.
- **Từ biên Cloudflare KHÔNG tới được API `:30000`** — bằng cả `fetch()` lẫn TCP `connect()`. Tên miền GDT là zone Cloudflare (proxied); edge phục vụ `:443` nhưng trả 521 cho `:30000`.
- Không có đường "thuần Cloudflare" nào tới API → **nhánh (b)** trong cây quyết định đã chốt.

### Quyết định sửa đổi

1. **T1 relay VN = ĐƯỜNG CHÍNH cho mọi gọi API GDT** (`:30000`). T0 (Workers `fetch()` trực tiếp) **chỉ** còn dùng cho tài nguyên công khai `:443` + probe egress — **KHÔNG** cho API.
2. **`GdtTransport` mặc định = `vn-relay`.** `direct-cf` không còn là mặc định; chỉ dùng cho probe/tài nguyên `:443`.
3. **Relay VN được nâng thành THÀNH PHẦN TRỌNG YẾU VỀ BẢO MẬT** (không còn là "fallback tiện lợi"):
   - **mTLS + shared-secret**; **chỉ** Worker của dự án gọi được relay.
   - **Stateless**: chỉ *forward* request tới GDT rồi trả nguyên response; **không lưu**, **không log** body / credential / token / `raw_json`.
   - Đặt tại **điểm hiện diện Việt Nam** (VPS Viettel/VNPT/FPT…), gọi thẳng origin `103.9.200.142:30000`.
   - Ràng buộc chi tiết: `.claude/rules/security.md` mục "Relay VN (egress GDT)".
4. **Dependency bắt buộc mới:** production **phụ thuộc một egress host đặt tại VN** — thành phần ngoài Cloudflare (mất tính "thuần Cloudflare" cho đường API, đã chấp nhận). **Không có relay VN ⇒ không đồng bộ được hóa đơn.**
5. **Lộ trình:** chèn mốc **U1a — Dựng relay VN + kiểm chứng egress `:30000`** TRƯỚC U1 (xem `docs/CHECKLIST-NGHIEM-THU.md`). U1 (captcha + authenticate) **BỊ CHẶN bởi U1a**.

### Còn phải kiểm chứng (điều kiện tiên quyết của U1a)

Từ **vantage VN thật**: `curl https://103.9.200.142:30000/captcha` (Host: `hoadondientu.gdt.gov.vn`) trả JSON `{key, content}` hợp lệ. **Chưa có VPS VN ⇒ chưa dựng relay, chưa vào U1a/U1.**

---

## 1. Bối cảnh

VATCrawlbot là SaaS multi-tenant truy xuất hóa đơn đầu vào/đầu ra trực tiếp từ Hệ thống Hóa đơn điện tử của Tổng cục Thuế (`hoadondientu.gdt.gov.vn`), phục vụ tới 100.000 doanh nghiệp. Đặc trưng tải:

- **I/O-bound, không CPU-bound:** công việc chính là gọi HTTP tới GDT, phân trang, parse JSON, khử trùng lặp và upsert. Rất ít tính toán nặng.
- **Việc nặng nằm ở nền:** đồng bộ định kỳ hàng chục nghìn tenant, phải idempotent, có retry/backoff/circuit breaker, tôn trọng rate limit phía GDT.
- **Multi-tenant nghiêm ngặt:** mọi truy vấn gắn `tenant_id`; cách ly dữ liệu; tuân thủ NĐ 13/2023, NĐ 123/2020, TT 78/2021.
- **Dữ liệu tài chính cần truy vấn quan hệ + lưu bản thô:** khóa tự nhiên `(tenant_id, nbmst, khmshdon, khhdon, shdon, tdlap)`; luôn lưu `raw_json`; phục vụ đối chiếu – kê khai – kết xuất kế toán.

Chủ dự án yêu cầu tận dụng **toàn bộ hệ sinh thái Cloudflare** cho cả backend và frontend.

---

## 2. Động lực quyết định (Decision Drivers)

1. Phù hợp workload I/O-bound + job nền bền (durable), có retry/backoff/circuit breaker sẵn.
2. Cô lập được adapter GDT, dễ mock + viết contract test.
3. Cách ly multi-tenant + bảo mật ở tầng dữ liệu; lưu `raw_json`; hỗ trợ khóa tự nhiên & upsert idempotent.
4. Vận hành ở quy mô 100k tenant với chi phí và độ phức tạp hạ tầng thấp (serverless, không quản máy chủ).
5. Tôn trọng máy chủ thuế (rate limit phía client) và ranh giới pháp lý/đạo đức trong Hiến pháp.
6. Giảm thiểu rủi ro cho một sản phẩm **Enterprise production** (tránh phụ thuộc thành phần còn beta ở đường đi chính).

---

## 3. Bản đồ năng lực Cloudflare → yêu cầu dự án

| Nhu cầu dự án | Dịch vụ Cloudflare | Ghi chú năng lực (theo docs 2026) |
|---|---|---|
| API stateless, biên toàn cầu | **Workers** | CPU tới 5 phút/req (mặc định 30s); wall-time HTTP không giới hạn khi client còn kết nối; 128 MB RAM/isolate; 10.000 subrequest/req (paid). |
| Frontend SPA | **Workers Static Assets / Pages** | Tối đa 100.000 file/phiên bản, 25 MiB/file (paid). Host React/Next/SvelteKit. |
| Điều phối đồng bộ nhiều bước, bền | **Workflows** | Durable multi-step, tự retry, `step.sleep`, `waitForEvent`; wall-time mỗi step không giới hạn. Lý tưởng cho đồng bộ idempotent. |
| Hàng đợi job nền | **Queues** | 10.000 queue/account; 128 KB/message; 100 lần retry; 250 consumer đồng thời; 5.000 msg/s/queue; backlog 25 GB/queue; consumer 15 phút. |
| Chạy định kỳ | **Cron Triggers** | 250 cron/account; wall 15 phút; CPU 15 phút nếu chu kỳ ≥ 1 giờ. |
| Rate limit + circuit breaker theo tenant/MST | **Durable Objects** | Đối tượng đơn nhất toàn cầu, đơn luồng, lưu trạng thái nhất quán mạnh, có Alarms. Chuẩn để giữ token-bucket + trạng thái ngắt mạch từng tenant. |
| Lưu file thô lớn (XML/PDF/kết xuất) | **R2** | Object storage tương thích S3, **không phí egress**. |
| Session/cấu hình đọc nhiều | **Workers KV** | Key-value, đọc độ trễ thấp; Cloudflare Access cũng dùng KV cho credential. |
| Giữ Postgres hiện có (JSONB, RLS) | **Hyperdrive** | Pool kết nối + cache truy vấn tới Postgres/MySQL ngoài (Neon, Supabase, PlanetScale, RDS…) từ Workers, dùng driver `pg` sẵn có. |
| DB serverless gốc Cloudflare | **D1** | SQLite. Tối đa 10 GB/DB (cứng); 50.000 DB/account (có thể xin lên hàng triệu); thiết kế cho **database-per-tenant**. Có JSON functions, read-replication (beta). |
| Đo lường/định lượng theo tenant (billing) | **Analytics Engine** | Time-series high-cardinality, truy vấn SQL — hợp cho usage-based billing. |
| Xác thực & bảo vệ | **Cloudflare Access (Zero Trust), WAF, Secrets** | SSO/chính sách cho khu vực quản trị; bí mật qua Workers Secrets/Secrets Store. |

**Lưu ý captcha:** Hiến pháp cấm phá captcha bằng máy — captcha GDT do người dùng nhập. Turnstile của Cloudflare (nếu dùng) chỉ để **bảo vệ chính app VATCrawlbot** khỏi bot, **không** dùng để vượt captcha của GDT.

---

## 4. Hai quyết định mở (cần chủ dự án chọn)

### 4A. Tầng dữ liệu

| Phương án | Ưu | Nhược | Hợp khi |
|---|---|---|---|
| **A1. D1 (SQLite) thuần, database-per-tenant** | Native Cloudflare nhất; cách ly tenant ở mức **DB riêng** (mạnh hơn RLS logic); mô hình 50k→hàng triệu DB khớp 100k tenant; chi phí chỉ theo query+storage; đồng bộ theo tenant chạy đơn luồng gọn. | **Là SQLite, không phải Postgres** → mất JSONB thật (chỉ có JSON functions), mất RLS, SQL kém phong phú; **10 GB/DB là trần cứng**; truy vấn xuyên tenant (báo cáo tổng) phải fan-out; query tối đa 30s. **Vi phạm Hiến pháp** → phải sửa. | Muốn thuần Cloudflare, chấp nhận đổi Hiến pháp, dữ liệu mỗi tenant < 10 GB, ít báo cáo xuyên tenant. |
| **A2. Postgres ngoài + Hyperdrive** (khuyến nghị) | **Giữ nguyên Hiến pháp** (JSONB `raw_json`, RLS theo `tenant_id`, SQL trưởng thành, đối chiếu bằng JOIN mạnh); Hyperdrive lo pool + cache, giảm độ trễ từ Workers; Neon/Supabase scale, đặt region gần VN (SG). | Không "thuần Cloudflare" 100% — thêm một nhà cung cấp Postgres ngoài (chi phí + phụ thuộc); một DB lớn cần chiến lược partition khi rất lớn; cân nhắc phí egress/độ trễ tới origin. | Ưu tiên tôn trọng Hiến pháp, cần truy vấn/đối chiếu tài chính mạnh, muốn rủi ro kỹ thuật thấp nhất. |
| **A3. Lai D1 + Postgres** | D1-per-tenant cho dữ liệu hóa đơn "nóng"; Postgres qua Hyperdrive cho phân tích/đối chiếu xuyên tenant + billing. Linh hoạt nhất. | Hai mô hình dữ liệu song song → phức tạp đồng bộ, tăng chi phí bảo trì & lỗi. | Có đội mạnh, chấp nhận phức tạp để tối ưu cả chi phí lẫn khả năng phân tích. |

**Khuyến nghị:** **A2 (Postgres + Hyperdrive)** cho giai đoạn production đầu tiên. Dữ liệu hóa đơn thuế là dữ liệu tài chính cần JSONB `raw_json`, RLS, và đối chiếu quan hệ — đây đúng sở trường Postgres và **tôn trọng Hiến pháp**. Hyperdrive vẫn là dịch vụ Cloudflare nên vẫn "trong hệ sinh thái". Giữ **A1 (D1-per-tenant)** như con đường tối ưu chi phí/native để đánh giá lại ở giai đoạn scale, nếu chấp nhận sửa Hiến pháp.

### 4B. Ngôn ngữ chạy trên Workers

| Phương án | Ưu | Nhược |
|---|---|---|
| **B1. TypeScript** (khuyến nghị) | Đường chính, trưởng thành nhất trên Workers; toàn bộ binding (Queues, Workflows, D1, R2, DO, Hyperdrive) + tài liệu/ví dụ đầy đủ; hệ sinh thái Hono/Zod/Drizzle mạnh; rủi ro production thấp. | Khác Hiến pháp (Python); đội phải thạo TS; mất thư viện Python cho parse/kế toán. |
| **B2. Python trên Workers** | Giữ Python theo Hiến pháp; hỗ trợ FastAPI, httpx, Pydantic; bind được D1/R2/Queues/Workflows. | **Còn beta** (cần cờ `python_workers`); gói phụ thuộc giới hạn theo Pyodide; một số tính năng/binding đi sau; **rủi ro cho SaaS Enterprise 100k khách ở đường đi chính**. |

**Khuyến nghị:** **B1 (TypeScript)** cho runtime Workers vì đây là sản phẩm production Enterprise — không nên đặt beta (Python Workers) trên đường đi chính. Kỷ luật "cô lập adapter + contract test" là **độc lập ngôn ngữ**, nên vẫn giữ nguyên tinh thần Hiến pháp về kiến trúc. Nếu có thư viện parse **chỉ có ở Python** là bắt buộc, tách riêng một dịch vụ Python nhỏ (Cloudflare Containers — *cần spike kiểm chứng*) thay vì đưa Python vào toàn bộ backend.

---

## 5. Quyết định (kiến trúc đề xuất)

Áp dụng **kiến trúc serverless thuần Cloudflare**, backend TypeScript trên Workers, tầng dữ liệu theo lựa chọn 4A (mặc định A2). Sơ đồ luồng:

```
Người dùng ─▶ Cloudflare (WAF, Access/Zero Trust)
                 │
      ┌──────────┴───────────┐
      ▼                      ▼
Frontend SPA           API Worker (TS, stateless)
(Workers Static           │  ├─ Auth: JWT session ↔ KV; Access cho admin
 Assets / Pages)          │  ├─ Truy vấn dữ liệu (RLS theo tenant_id)
                          │  └─ Ghi bí mật/credential → Secrets Store (mã hoá)
                          │
   Cron Trigger (định kỳ) ┼─▶ Queues (job "đồng bộ tenant X kỳ Y")
                          │        │
                          │        ▼
                          │   Consumer Worker ─▶ Workflow (durable, idempotent)
                          │        │   step: đăng nhập/kiểm token ─▶ 401? dừng+báo
                          │        │   step: phân trang /query/... & /sco-query/...
                          │        │   step: parse + khử trùng lặp (khóa tự nhiên)
                          │        │   step: upsert + lưu raw_json
                          │        ▼
                          │   Durable Object (per tenant/MST):
                          │        token-bucket rate limit + circuit breaker
                          │
   ┌──────────────────────┴───────────────────────────────┐
   ▼                 ▼                 ▼                    ▼
gdt_client        Postgres          R2 (XML/PDF,        Analytics Engine
(adapter cô lập)  (Hyperdrive)      kết xuất lớn)       (usage/billing)
fetch()+timeout   JSONB raw_json
+retry/backoff    RLS tenant_id
```

### Ánh xạ thành phần

- **`gdt_client` (adapter cô lập):** một module Worker duy nhất, mọi gọi ra GDT đi qua một interface **`GdtTransport` hoán đổi được** (không gọi `fetch()` trực tiếp trong logic nghiệp vụ) — nhờ vậy có thể đổi đường ra (Cloudflare trực tiếp ↔ egress IP Việt Nam) mà không đụng phần còn lại. Mọi transport đều có timeout + retry backoff; 401 → dừng, báo hết hạn token. Giữ đúng quy tắc cứng Hiến pháp; contract test bằng Vitest + Miniflare, nhóm `contract` gọi endpoint công khai GDT. Chi tiết chuỗi đường ra: mục **5B**.
- **Đồng bộ nền:** Cron Trigger phát tán job → **Queues** (một message/tenant/kỳ) → consumer khởi tạo **Workflow** cho từng tenant. Workflow đảm bảo bền vững, tự retry từng bước, không nhân đôi khi chạy lại (idempotent qua khóa tự nhiên + upsert). Việc phân trang hai họ endpoint (`/query/invoices/{purchase,sold}` và `/sco-query/invoices/{purchase,sold}`) chia thành các step, chunk nhỏ để không chạm trần CPU/wall.
- **Rate limit & ngắt mạch:** một **Durable Object** cho mỗi tenant (hoặc mỗi MST) giữ token-bucket + trạng thái circuit breaker, đảm bảo "không gọi dồn dập" máy chủ thuế.
- **Dữ liệu:** Postgres (Neon/Supabase, region gần VN) qua **Hyperdrive**, JSONB cho `raw_json`, RLS theo `tenant_id`. **R2** cho XML/PDF gốc và file kết xuất lớn. **KV** cho session/cấu hình. **Analytics Engine** cho định lượng theo tenant phục vụ billing.
- **Frontend:** React/Next.js (hoặc SvelteKit) trên **Workers Static Assets/Pages**; gọi API Worker cùng account qua Service Binding khi cần.
- **Bảo mật:** **Cloudflare Access/Zero Trust** cho khu vực quản trị nội bộ; **không lưu mật khẩu thuế thô** — ưu tiên chỉ lưu token phiên, hoặc mã hoá envelope; bí mật qua **Workers Secrets/Secrets Store**; audit log hành động nhạy cảm (giữ nguyên `security.md`).

---

## 5B. Chiến lược đường ra GDT (Egress) — Probe + Fallback

`hoadondientu.gdt.gov.vn` là cổng của cơ quan thuế Việt Nam. Workers gọi ra từ IP biên Cloudflare toàn cầu (thường **không phải IP Việt Nam**), nên GDT có thể chặn/giới hạn theo địa lý. Vì **không thể giả định trước**, ta thiết kế hệ thống để **tự dò và tự chuyển đường ra**, thay vì chọn cứng một phương án.

### Nguyên tắc: trừu tượng hóa đường ra sau một interface

Mọi lời gọi GDT đi qua `GdtTransport` (đổi được lúc chạy, không đụng logic):

```ts
export type ProbeVerdict = "OK" | "GEO_BLOCKED" | "RATE_LIMITED" | "TIMEOUT" | "ERROR";

export interface GdtTransport {
  readonly name: string;                 // "direct-cf" | "vn-relay"
  fetch(url: string, init?: RequestInit): Promise<Response>;
  probe(): Promise<{ verdict: ProbeVerdict; egressIp?: string; egressCountry?: string; latencyMs: number }>;
}
```

### Chuỗi fallback (thứ tự ưu tiên)

| Tầng | Đường ra | Thuần Cloudflare? | Khi dùng |
|---|---|---|---|
| **T0** | **Workers `fetch()` trực tiếp** từ biên Cloudflare | ✅ Có | ~~Mặc định cho API~~ → **BÁC BỎ cho API (521 trên `:30000`)**. Chỉ còn dùng cho tài nguyên công khai `:443` + probe egress. |
| **T1** | **Relay đặt tại Việt Nam** (VPS VN: Viettel/VNPT/FPT…), Worker gọi qua relay bằng mTLS + shared-secret; relay chỉ *chuyển tiếp* request tới GDT rồi trả nguyên response. | ❌ Không (một thành phần ngoài Cloudflare, đặt tại VN) | **ĐƯỜNG CHÍNH cho API `:30000`** (Amendment 2026-07-12). `GdtTransport` mặc định = `vn-relay`. |

> Ghi chú kỹ thuật: Workers `fetch()` **không hỗ trợ HTTP proxy**, nên T1 dùng **mẫu relay** (Worker POST gói `{method,url,headers,body}` tới relay VN; relay gọi GDT và trả về) thay vì proxy CONNECT. Relay phải **stateless, không lưu dữ liệu hóa đơn**, chỉ forward — để giảm bề mặt tuân thủ/bảo mật. Các lựa chọn thay thế cần đánh giá thêm: **Cloudflare Tunnel/WARP Connector** đặt tại VN, hoặc **Magic WAN** — nhưng phức tạp hơn và vẫn cần điểm hiện diện VN.

### Cơ chế gọi thử (probe) + quyết định chuyển đường

1. **Probe định kỳ (Cron, ví dụ mỗi 5–15 phút):** với mỗi transport, gọi thử một endpoint công khai nhẹ của GDT **và** một dịch vụ echo (`.../cdn-cgi/trace`) để ghi lại **IP + quốc gia egress**. Phân loại kết quả thành `ProbeVerdict`.
2. **Lưu trạng thái sức khỏe từng transport** trong Durable Object (per-transport circuit breaker) + KV để đọc nhanh; đẩy metric sang Analytics Engine.
3. **Runtime routing:** mỗi request GDT thử theo thứ tự T0 → T1; nếu T0 trả verdict `GEO_BLOCKED` (hoặc breaker T0 đang mở) → dùng ngay T1 và đánh dấu breaker. Định kỳ probe lại T0 để **tự phục hồi** khi GDT nới chặn.
4. **Cảnh báo:** khi phải chuyển sang T1 (nghĩa là T0 bị chặn), phát cảnh báo cho vận hành — vì đây là tín hiệu "không còn thuần Cloudflare".
5. **Contract test (nhóm `contract`):** chạy probe trong CI để phát hiện sớm khi GDT đổi hành vi chặn hoặc đổi API.

Một **spike gọi thử chạy được** đã được tạo tại `spikes/gdt-egress-probe/` để xác minh thực tế T0 (và T1 nếu đã dựng relay) trước khi chốt ADR.

### Kết quả spike (2026-07-11) — ⚠️ ĐÃ ĐÍNH CHÍNH (xem Amendment 2026-07-12)

> **Đính chính (2026-07-12):** Kết quả dưới đây **đo sai đối tượng** — chỉ gọi `:443` **root** (cổng web SPA CF-fronted), **không phải API `:30000`**. Kết luận "T0 thuần Cloudflare khả thi" là **SAI với API**. Probe edge thật ngày 2026-07-12 cho thấy biên Cloudflare **không** tới được API `:30000` (521 / không nối được). Giữ lại đoạn gốc dưới đây làm bằng chứng lịch sử; quyết định hiện hành nằm ở **Amendment** đầu tài liệu.

Deploy thật lên biên Cloudflare và gọi thử:

```json
{"decidedTransport":"direct-cf","results":[{"transport":"direct-cf","verdict":"OK",
 "httpStatus":200,"egressIp":"2a06:98c0:3600::103","egressCountry":"SG","latencyMs":543}]}
```

→ **T0 (thuần Cloudflare) gọi được GDT** (HTTP 200) từ colo **Singapore** (egress country `SG`, **không phải VN nhưng không bị chặn**), độ trễ ~543 ms. **Kết luận sơ bộ: kiến trúc thuần Cloudflare khả thi; chưa cần dựng relay VN (T1) ngay.**

**Vẫn phải lưu ý (chưa xác minh):** đây là **một** lần gọi, từ **một** colo, tới endpoint gốc `/` (chưa đăng nhập). Chưa chứng minh: (a) mọi colo khác của Cloudflare đều không bị chặn; (b) GDT không chặn/giới hạn khi **tải cao/nhiều request liên tục**; (c) hành vi trên **endpoint truy vấn hóa đơn thật** (cần token). Vì vậy **giữ nguyên** abstraction `GdtTransport` + probe định kỳ (Cron) để tự phát hiện nếu GDT siết chặn về sau, và **giữ T1 như fallback đã thiết kế** (chỉ dựng khi probe báo `GEO_BLOCKED`/`RATE_LIMITED` ổn định).

---

## 6. Cách triển khai (deployment)

1. **Monorepo + Wrangler:** mỗi service (api, sync-consumer, workflows, frontend) có `wrangler.jsonc` riêng; đặt `compatibility_date` cố định và cờ `nodejs_compat`; binding khai báo tường minh (D1/R2/KV/Queues/Hyperdrive/DO).
2. **Môi trường:** `dev` → `staging` → `production` bằng Wrangler environments; preview deployment cho mỗi PR.
3. **CI/CD:** GitHub Actions chạy `lint` (ESLint/Biome + `tsc`) → test (Vitest + `@cloudflare/vitest-pool-workers`, Miniflare) → `wrangler deploy`. Giữ các mục tiêu `make` tương đương: `make test`, `make test-contract`, `make lint`, `make deploy`.
4. **Migrations:** Postgres bằng Drizzle/Prisma migrate (nếu A2) hoặc D1 migrations (nếu A1).
5. **Bí mật:** không hard-code; nạp qua `wrangler secret` / Secrets Store; credential GDT của tenant mã hoá trước khi lưu.
6. **Observability:** Workers Logs + Logpush; Workflows visualizer; Analytics Engine cho metric nghiệp vụ; cảnh báo khi circuit breaker mở hoặc 401 hàng loạt.
7. **TDD giữ nguyên:** viết test trước; coverage ≥ 80% tầng nghiệp vụ; contract test bắt đổi API GDT.

---

## 7. Hệ quả

### Tích cực
- Hạ tầng serverless, không quản máy chủ; scale ngang tự nhiên tới 100k tenant; chi phí theo dùng.
- Workflows + Queues + Durable Objects thay trọn vai trò Celery/Redis với độ bền cao hơn và ít vận hành hơn.
- R2 không phí egress → rẻ khi lưu/kết xuất khối lượng lớn hóa đơn.
- Biên toàn cầu + WAF/Access sẵn có cho bảo mật và độ trễ.

### Bắt buộc sửa Hiến pháp (phải thông qua tường minh)
- **Ngăn xếp:** Python/FastAPI → **TypeScript/Workers (Hono)**; Celery+Redis → **Queues + Workflows + Durable Objects + Cron**; (A1) PostgreSQL → **D1**, hoặc (A2) giữ **PostgreSQL qua Hyperdrive**.
- **Lệnh chuẩn:** `make run/migrate/up` (uvicorn/alembic/docker-compose) → tương đương Wrangler (`wrangler dev/deploy`, migrations, Miniflare).
- **Quy tắc cứng "tầng ứng dụng stateless"** vẫn giữ; "cô lập adapter GDT" và "khóa tự nhiên + upsert idempotent" **giữ nguyên**, chỉ đổi ngôn ngữ/hạ tầng hiện thực.
- Cập nhật `.claude/rules/gdt-adapter.md`, `multi-tenant.md`, `security.md`, `testing.md` theo runtime mới.

### Tiêu cực / đánh đổi
- Khoá nhà cung cấp (vendor lock-in) vào Cloudflare.
- Nếu A1: mất Postgres/JSONB/RLS, trần 10 GB/DB, báo cáo xuyên tenant khó hơn.
- Nếu A2: vẫn phụ thuộc một Postgres ngoài (không thuần Cloudflare).
- Trần CPU 5 phút/req và wall 15 phút cho cron/queue/DO-alarm → tác vụ batch dài phải chia nhỏ theo step Workflow.

---

## 8. Rủi ro cần kiểm chứng trước khi chốt (spikes)

1. **❌ Egress IP tới API GDT — BÁC BỎ (Amendment 2026-07-12):** probe edge thật cho thấy biên Cloudflare **không** tới được API `:30000` (521 / không nối được); kết quả "ĐẠT" ngày 2026-07-11 chỉ đo `:443` root, không phải API. → **T1 relay VN là đường chính**; điều kiện tiên quyết mới là **dựng + kiểm chứng relay VN (U1a)**. Xem Amendment đầu tài liệu.
2. **Python-only libs:** nếu bắt buộc thư viện parse chỉ có ở Python → đánh giá Cloudflare Containers (cần kiểm chứng khả dụng/giá) hoặc một microservice ngoài.
3. **Dung lượng/tenant:** xác minh dữ liệu hóa đơn/tenant có vượt 10 GB không (quyết định A1 vs A2).
4. **Tuân thủ dữ liệu (NĐ 13/2023):** xác nhận nơi lưu trữ (region) và ràng buộc dữ liệu cá nhân với D1/R2/Postgres đã chọn.

---

## 9. Bước tiếp theo

1. ❌ **Spike egress-GDT (rủi ro #1) — ĐÃ CHẠY LẠI, BÁC BỎ T0 cho API** (Amendment 2026-07-12): biên Cloudflare không tới được API `:30000`. Điều kiện tiên quyết chuyển thành **U1a — dựng + kiểm chứng relay VN**.
2. Chủ dự án chọn **4A** (mặc định A2 — Postgres + Hyperdrive) và **4B** (mặc định B1 — TypeScript). Đây là 2 mục còn mở duy nhất trước khi chuyển trạng thái ADR sang *Accepted*.
3. Sau khi chốt: soạn PR sửa Hiến pháp + luật theo mục 7, dựng khung Wrangler U0, rồi tiếp tục U1–U3 (GDT Adapter) — trong đó tích hợp `GdtTransport` + probe và **contract test** xác minh thêm egress trên endpoint có token và dưới tải.

---

## 10. Nguồn tham chiếu

- Workers limits — https://developers.cloudflare.com/workers/platform/limits/
- D1 limits — https://developers.cloudflare.com/d1/platform/limits/
- Queues limits — https://developers.cloudflare.com/queues/platform/limits/
- Workflows — https://developers.cloudflare.com/workflows/
- Hyperdrive — https://developers.cloudflare.com/hyperdrive/
- Durable Objects — https://developers.cloudflare.com/durable-objects/
- R2 — https://developers.cloudflare.com/r2/
- Chọn sản phẩm lưu trữ — https://developers.cloudflare.com/workers/platform/storage-options/
- Python Workers (beta) — https://developers.cloudflare.com/workers/languages/python/

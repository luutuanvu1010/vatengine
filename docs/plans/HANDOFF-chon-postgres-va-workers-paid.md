# Bàn giao phiên — Quyết định hạ tầng: chọn Postgres + gói Cloudflare Workers

> **Mục đích:** phiên mới này KHÔNG viết code. Nhiệm vụ duy nhất: giúp chủ dự án **ra 2 quyết định** làm điều kiện tiên quyết cho Workstream 2 (deploy):
> 1. Chọn **nhà cung cấp PostgreSQL** ngoài (→ có `DATABASE_URL`).
> 2. Xác nhận nâng **gói Cloudflare Workers lên Paid** (bắt buộc cho Queues).
>
> **Trạng thái nền (2026-07-14):** U0–U14 backend XONG, `feat/cloudflare-stack-u0` @ `865c349`, `make test` xanh (376), `make lint` sạch. Cổng kiểm chứng token (Workstream 1) đã đóng. **Chưa có gì trên cloud** (đã kiểm `wrangler ... list`: Hyperdrive trống, R2 `vat-raw` chưa có, Queue chưa có). Nền tảng chốt theo **ADR-0001**: `4A = A2` (Postgres ngoài + Hyperdrive), `4B = B1` (TypeScript/Workers).

---

## 1. Tại sao PHẢI cần những thứ này? (câu hỏi gốc)

Ba sự thật kỹ thuật ép ra 2 quyết định trên:

1. **Cloudflare Worker KHÔNG tự lưu được dữ liệu bền.** Worker là hàm *phi trạng thái* (stateless): nó bật lên xử lý 1 request rồi biến mất, không có ổ đĩa riêng giữ dữ liệu giữa các lần gọi. Hóa đơn thuế phải nằm ở một **cơ sở dữ liệu bền vững bên ngoài**. Hiến pháp + ADR-0001 chọn **PostgreSQL** (không phải SQLite/D1) vì cần: JSONB cho `raw_json`, Row-Level Security theo `tenant_id`, và SQL mạnh để đối chiếu tài chính bằng JOIN. → **cần một nhà cung cấp Postgres.**

2. **Worker gọi thẳng Postgres thì chậm và dễ cạn kết nối.** Mỗi lần Worker (chạy rải rác khắp thế giới) mở kết nối mới tới Postgres là tốn thời gian bắt tay + Postgres có trần số kết nối. **Hyperdrive** (dịch vụ Cloudflare) đứng giữa: gộp/tái dùng kết nối (pool) + cache truy vấn. → cần tạo Hyperdrive **trỏ vào `DATABASE_URL`** ở bước deploy.

3. **Đồng bộ hóa đơn là việc nặng, chạy nền, phải giãn tải.** Không thể kéo hàng nghìn hóa đơn ngay trong 1 request HTTP (timeout + đập máy chủ thuế). Kiến trúc đẩy việc sang **Cloudflare Queues → Workflows**. Nhưng **Queues chỉ có trên gói Workers Paid**. → cần **nâng gói Paid**.

Không có (1) → không có nơi lưu hóa đơn. Không có (3) → không đồng bộ nền được. Đó là lý do 2 quyết định này chặn toàn bộ deploy.

---

## 2. Mô phỏng dễ hiểu

Hình dung VATCrawlbot như một **chuỗi ki-ốt khai thuế lưu động** phủ toàn quốc:

| Thành phần thật | Ví như | Vai trò |
|---|---|---|
| **Cloudflare Worker** | Hàng nghìn **ki-ốt lưu động**, dựng lên phục vụ 1 khách rồi dẹp ngay | Xử lý nhanh, ở khắp nơi, **nhưng không giữ giấy tờ** của riêng nó |
| **PostgreSQL (Neon/Supabase)** | **Kho lưu trữ trung tâm** — sổ cái gốc chứa mọi hóa đơn, vĩnh viễn | Nơi dữ liệu thật sự "sống" và bền |
| **Hyperdrive** | **Tổng đài + đường dây nóng nối sẵn** giữa ki-ốt và kho | Ki-ốt không phải quay số lại từ đầu mỗi lần → nhanh, không nghẽn |
| **Queues** | **Băng chuyền phiếu việc** — bỏ phiếu "đồng bộ MST X" lên băng, nhân viên nền bốc từng phiếu làm từ tốn | Việc nặng chạy nền, **giãn nhịp** để không đập máy chủ thuế |
| **Gói Workers Paid** | **Thuê mặt bằng nhà xưởng** có băng chuyền + máy chạy lâu hơn | Bản Free chỉ là "gian trưng bày demo", không có băng chuyền |

Quyết định của phiên này = **chọn nhà thầu xây kho** (Neon hay Supabase) và **ký thuê mặt bằng nhà xưởng** (Workers Paid).

---

## 3. Vai trò từng thành phần (bảng tra nhanh)

| Thành phần | Bắt buộc? | Phụ thuộc quyết định nào | Ghi chú dự án |
|---|---|---|---|
| PostgreSQL ngoài | ✅ | **QĐ 1** | Cho ra `DATABASE_URL`. ADR-0001 §4A đã chốt A2. |
| Hyperdrive | ✅ | (hệ quả QĐ 1) | `wrangler hyperdrive create` → thay `REPLACE_WITH_HYPERDRIVE_ID` ở **cả 2** `wrangler.jsonc`. |
| R2 `vat-raw` | ✅ | (không) | `wrangler r2 bucket create vat-raw`. R2 **không tính phí egress**. |
| Queues `vat-sync` + `vat-sync-dlq` | ✅ | **QĐ 2** | `wrangler queues create …`. **Chỉ có trên Workers Paid.** |
| Durable Objects (rate limit/circuit breaker) | ✅ | **QĐ 2** | Cũng cần Paid (theo dõi tại thời điểm deploy). |
| Secrets `JWT_SECRET` + `TOKEN_KEK` | ✅ | (không) | `TOKEN_KEK` cho **cả** `apps/api` lẫn `apps/sync-worker` (mới ở U14). |

---

## 4. QUYẾT ĐỊNH 1 — Chọn nhà cung cấp Postgres

ADR-0001 §4A đã chốt **A2 = Postgres ngoài + Hyperdrive**, và liệt kê ứng viên tương thích Hyperdrive: **Neon, Supabase, PlanetScale, RDS…**. Hai ứng viên thực tế cho dự án (serverless, có region gần VN, hợp túi tiền giai đoạn đầu): **Neon** và **Supabase**.

### 4.1. So sánh Neon vs Supabase

> ⚠️ **CHƯA KIỂM CHỨNG (giá + chi tiết gói):** số liệu dưới đây theo hiểu biết tới 01/2026, **giá và hạn mức có thể đã đổi**. Phiên quyết định **phải mở trang giá chính thức** (`neon.tech/pricing`, `supabase.com/pricing`) và ghi lại ngày + số thật trước khi chốt.

| Tiêu chí | **Neon** | **Supabase** |
|---|---|---|
| Bản chất | Serverless Postgres thuần | Postgres + "backend platform" (kèm Auth/Storage/Realtime — ta **không cần** phần thêm) |
| Region gần VN | Singapore (`ap-southeast-1`) — *cần xác minh còn mở* | Singapore (`ap-southeast-1`) — *cần xác minh* |
| Scale-to-zero | Có (ngủ khi rảnh → rẻ, nhưng **cold start** vài trăm ms lần gọi đầu) | Gói Free có tạm dừng khi không dùng; Pro chạy liên tục |
| Điểm mạnh riêng | **Branching** (nhánh DB như git — tiện tạo DB test/preview); tách compute/storage | Hệ sinh thái sẵn (dashboard, SQL editor, log) trực quan |
| Giá (CHƯA KIỂM CHỨNG) | Free tier + Pro ~ vài chục USD/tháng theo mức dùng | Free (2 project, tạm dừng khi rảnh) + Pro ~ **$25/tháng/project** |
| Rủi ro dự án | Cold start có thể làm request đầu chậm | Phần "platform" thừa so với nhu cầu (ta chỉ dùng Postgres qua Hyperdrive) |

### 4.2. Tiêu chí RIÊNG của dự án (quan trọng hơn giá)

Đây là ràng buộc từ chính codebase, **phải kiểm khi chọn** (không chỉ nhìn giá):

- **RLS `FORCE` + role không-superuser (`.claude/rules/multi-tenant.md`).** Cách ly tenant là rủi ro pháp lý số 1 của SaaS này. Rule bắt: bật `ENABLE` **và** `FORCE ROW LEVEL SECURITY`, và **role app kết nối Hyperdrive KHÔNG được là superuser** (superuser bỏ qua RLS kể cả FORCE). → Khi chọn nhà cung cấp, **phải tạo được một role riêng, không-superuser, không-sở-hữu-bảng** để app dùng. Cả Neon lẫn Supabase đều làm được, nhưng role **mặc định** của cả hai thường là owner/quyền cao → **bắt buộc tạo role phụ**. Đây là việc test cách ly (owner + non-owner) ở U4 đã chuẩn bị.
- **`DATABASE_URL` phải là connection string Postgres chuẩn** (Hyperdrive nuốt được). Cả hai đều cấp; lưu ý dùng đúng chuỗi *direct/session* (không phải pooler riêng của họ nếu xung đột Hyperdrive) — kiểm tài liệu tại thời điểm nối.
- **Region gần VN** để giảm độ trễ Worker(SG/HK) ↔ Postgres. Ưu tiên Singapore.

### 4.3. Đề xuất (có lý do, không áp đặt)

**Khuyến nghị sơ bộ: Neon** cho giai đoạn đầu — vì ta **chỉ cần Postgres thuần** (Hyperdrive lo kết nối; Auth/Storage của Supabase là thừa), và **branching** tiện cho môi trường test/preview. **Supabase** hợp hơn nếu chủ dự án muốn một **dashboard trực quan** để tự xem dữ liệu/log mà không cần công cụ ngoài. **Cả hai đều thỏa ADR + rule** — đây là quyết định một chiều nhẹ, đổi sau được (dữ liệu Postgres port qua lại được), nên **không nên kẹt lâu ở đây**.

---

## 5. QUYẾT ĐỊNH 2 — Gói Cloudflare Workers (Free vs Paid)

| | **Workers Free** | **Workers Paid** |
|---|---|---|
| Giá (CHƯA KIỂM CHỨNG) | 0đ | **~$5/tháng** khởi điểm (kiểm `workers.cloudflare.com/plans`) |
| **Queues** | ❌ **Không có** | ✅ Có — **đây là lý do bắt buộc nâng** |
| Durable Objects | Giới hạn/khác nhau theo thời điểm | ✅ Đầy đủ |
| Thời lượng chạy / request | Thấp hơn | Cao hơn (hợp job nền) |

**Kết luận:** Kiến trúc đồng bộ nền của dự án (`apps/sync-worker`: producer + consumer Queue `vat-sync`, DLQ `vat-sync-dlq`, `max_batch_size: 10`, Durable Object rate-limit) **không chạy được trên Free**. → **bắt buộc Paid** nếu muốn deploy thật. Không có lựa chọn thay thế trong kiến trúc hiện tại.

> Tài khoản Wrangler đang đăng nhập: `luutuanvu.gl@gmail.com` (account `Lưu Tuấn Vũ`). Việc nâng Paid + thanh toán **chủ dự án tự làm trên dashboard Cloudflare** (ranh giới: Claude không nhập thông tin thanh toán).

---

## 6. Sau khi có 2 quyết định — bàn giao sang Workstream 2 (deploy)

Đây chỉ để phiên quyết định biết "chốt xong thì đi đâu"; **không thực thi trong phiên này**. Thứ tự deploy (theo `HANDOFF-sau-U14-2026-07-14.md` §Workstream 2):

1. Tạo Postgres (QĐ 1) + **role app không-superuser** → `DATABASE_URL`.
2. `make migrate` — áp **4 migration** (`0000`–`0003_uy_quyen_luc`).
3. `wrangler hyperdrive create …` → thay `REPLACE_WITH_HYPERDRIVE_ID` ở cả 2 `wrangler.jsonc`.
4. `wrangler r2 bucket create vat-raw`.
5. `wrangler queues create vat-sync && wrangler queues create vat-sync-dlq` (cần Paid — QĐ 2).
6. `wrangler secret put JWT_SECRET` + `wrangler secret put TOKEN_KEK` (**cả 2 app**; sinh `openssl rand -base64 32`).
7. `wrangler deploy` cả 2 app.
8. **Giữ login sau feature-flag** tới khi smoke test đầu-cuối thật xong (bước cuối Workstream 1).

---

## 7. Việc cần chủ dự án làm trong/sau phiên quyết định

- [ ] **QĐ 1:** mở `neon.tech/pricing` + `supabase.com/pricing`, xác minh giá + region SG (ghi ngày). Chọn 1. Tạo project + **role app không-superuser**. Lấy `DATABASE_URL`.
- [ ] **QĐ 2:** vào dashboard Cloudflare, nâng Workers lên **Paid** (chủ dự án tự thanh toán).
- [ ] Ước tính chi phí tháng (CHƯA KIỂM CHỨNG, cần xác minh): Postgres Pro **~$0–25** + Workers Paid **~$5** + R2 (theo dung lượng, egress miễn phí). Tổng khởi điểm giai đoạn đầu: **khoảng vài chục USD/tháng** — con số thật phải lấy từ trang giá.

## 8. Nguồn phải tra khi quyết (Nguyên tắc bằng chứng — không tin số trong file này)

- `neon.tech/pricing`, `supabase.com/pricing` — giá + region + gói.
- `developers.cloudflare.com` — Workers plans, Queues (xác nhận Paid-only), Hyperdrive (danh sách Postgres tương thích + cách nối).
- `.claude/rules/multi-tenant.md` — ràng buộc RLS FORCE + role không-superuser (đọc trước khi tạo role DB).
- `docs/adr/0001-nen-tang-cloudflare.md` §4A, §5B — vì sao A2, bảng dịch vụ Cloudflare.

> Mọi số giá/region trong tài liệu này gắn nhãn **CHƯA KIỂM CHỨNG** cho tới khi phiên quyết định mở nguồn chính thức và ghi lại ngày + số thật. Đừng để số phỏng đoán ở đây hoá thành "chốt".

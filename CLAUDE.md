# VATCrawlbot — Hiến pháp dự án

Nền tảng **SaaS** truy xuất hóa đơn **đầu vào (mua vào)** và **đầu ra (bán ra)** trực tiếp từ Hệ thống Hóa đơn điện tử của Tổng cục Thuế (`hoadondientu.gdt.gov.vn`) bằng tài khoản MST hợp pháp của chính doanh nghiệp.

**Mục tiêu cao nhất:** phần mềm **chạy được, chuẩn SaaS** — đăng nhập tài khoản thuế, đồng bộ đầy đủ hóa đơn hai chiều với toàn bộ trường dữ liệu, lưu trữ bền vững, phục vụ đối chiếu – kê khai – tích hợp kế toán, đa khách hàng (multi-tenant), phục vụ tới 100.000 khách hàng doanh nghiệp.

## Khung quản trị của dự án

Tài liệu này là **Hiến pháp** — nguyên tắc tối cao, ít thay đổi. Nó không tự đủ để vận hành; ba tầng dưới đây cụ thể hoá và ép thi hành nó:

| Tầng | Vị trí | Vai trò | Tính chất |
|---|---|---|---|
| **Hiến pháp** | `CLAUDE.md` (file này) | Nguyên tắc tối cao: pháp lý, kiến trúc cứng, Definition of Done | Nạp toàn bộ mỗi phiên, cố vấn (advisory) |
| **Luật** | `.claude/rules/*.md` | Quy tắc vận hành cụ thể theo chủ đề, chỉ nạp khi đụng đúng file liên quan (`paths` frontmatter) | Cố vấn, chi tiết hoá Hiến pháp |
| **Cổng kiểm soát** | `.claude/settings.json` → `hooks` | Chặn/ép hành vi cụ thể: prompt vào, hành động nguy hiểm, kết quả ra | **Bắt buộc kỹ thuật**, không phụ thuộc Claude có tuân theo hay không |
| **Quy trình đóng gói** | `.claude/skills/`, `.claude/agents/` | Vòng lặp U0–U12 hoá thành skill gọi lại được; review chéo bằng subagent độc lập | Thực thi lặp lại, kiểm chứng độc lập |

Luật hiện có: `gdt-adapter.md` (cô lập API thuế + hợp đồng), `multi-tenant.md` (cách ly tenant), `security.md` (bí mật, audit log), `testing.md` (TDD, coverage). Khi một luật mâu thuẫn với Hiến pháp, Hiến pháp thắng — sửa luật, không sửa hiến pháp để né.

## Tài liệu nguồn (đọc khi cần, KHÔNG tự import)

- `KIEN_TRUC_VA_KE_HOACH.md` — kiến trúc, mô hình dữ liệu (mục 7), lộ trình (mục 12) và checklist parity (mục 12b). **Nguồn chân lý về "làm gì".**
- `TRIEN_KHAI_BANG_CLAUDE_CODE.md` — phương pháp Prompt + Loop Engineering, 13 đơn vị vòng lặp (U0–U12), mẫu prompt, Definition of Done. **Nguồn chân lý về "làm thế nào".**
- `KHAO_SAT_TINH_NANG_NIBOT.md` — mốc tính năng đối thủ (feature parity).
- `docs/adr/` — **Nhật ký quyết định kiến trúc (ADR)**. `0001-nen-tang-cloudflare.md` chốt ngăn xếp Cloudflare (nguồn của các thay đổi ở mục "Ngăn xếp công nghệ" bên dưới).
- `README.md` — cài đặt & chạy. `backend/` (Python) là **khung tham chiếu MVP cũ**, được **thay bằng ngăn xếp Cloudflare/TypeScript** theo ADR-0001; giữ lại làm tài liệu nghiệp vụ (đặc biệt `gdt_client.py`, `gdt_contract_schema.json`) để port sang TS ở U1–U3, không phát triển tiếp trên đó. Mã production mới nằm ở `apps/` + `packages/`.

Trước khi bắt đầu một đơn vị công việc, đọc mục liên quan trong hai tài liệu đầu, hoặc gọi skill `/start-unit`.

## Ranh giới đạo đức & pháp lý (BẮT BUỘC, không vi phạm)

- Chỉ truy xuất dữ liệu **thuộc thẩm quyền của tài khoản đăng nhập** (hóa đơn của chính doanh nghiệp/tenant). Không thu thập dữ liệu bên thứ ba.
- **Không** phá vỡ captcha bằng máy — captcha do người dùng nhập.
- Với SaaS: mỗi tenant phải **ủy quyền rõ ràng**; tuân thủ Nghị định 13/2023/NĐ-CP và quy định hóa đơn điện tử (NĐ 123/2020, TT 78/2021).
- Tôn trọng máy chủ thuế: rate limit phía client, backoff, circuit breaker. Không gọi dồn dập.

Chi tiết vận hành các ranh giới này: xem `.claude/rules/security.md` và `.claude/rules/gdt-adapter.md`.

## Ngăn xếp công nghệ

> Chốt theo **ADR-0001** (`docs/adr/0001-nen-tang-cloudflare.md`). Toàn bộ chạy trên hệ sinh thái **Cloudflare**, ngôn ngữ **TypeScript**.

- Backend: **TypeScript trên Cloudflare Workers** (framework **Hono**), validation **Zod**, ORM **Drizzle**.
- Dữ liệu: **PostgreSQL ngoài** (Neon/Supabase, region gần VN) truy cập từ Workers qua **Hyperdrive** — JSONB cho `raw_json`, **Row-Level Security** theo `tenant_id`. **R2** (S3-compatible) cho file lớn (XML/PDF, kết xuất). **Workers KV** cho session/cấu hình. **Analytics Engine** cho định lượng theo tenant.
- Đồng bộ nền: **Cloudflare Queues + Workflows + Durable Objects + Cron Triggers** (thay vai trò Celery + Redis). Durable Object giữ token-bucket rate limit + circuit breaker theo tenant/MST.
- Đường ra GDT (egress): mọi gọi qua interface **`GdtTransport`** hoán đổi được; **T0** = Workers `fetch()` trực tiếp (mặc định, đã kiểm chứng gọi được GDT), **T1** = relay đặt tại VN làm fallback khi bị chặn địa lý. Có **probe định kỳ** tự phát hiện chặn. Chi tiết: ADR-0001 mục 5B.
- Kiểm thử/chất lượng: **Vitest + `@cloudflare/vitest-pool-workers`** (Miniflare), lint/format **Biome**, kiểu **`tsc --noEmit`**. Hạ tầng-as-code: **Wrangler** (monorepo npm workspaces).
- Frontend: **React/Next.js (hoặc SvelteKit)** trên **Cloudflare Pages / Workers Static Assets**. `frontend/index.html` cũ chỉ là proof-of-concept.

## Kiến trúc — quy tắc cứng

- **Cô lập mọi phụ thuộc API thuế trong một package adapter duy nhất** (`packages/gdt-client`). Mọi gọi ra GDT đi qua interface `GdtTransport` (không gọi `fetch()` trực tiếp trong logic nghiệp vụ). Khi cơ quan thuế đổi endpoint, chỉ sửa ở đây. Chi tiết: `.claude/rules/gdt-adapter.md`.
- Truy vấn hai họ endpoint và gộp: `/query/invoices/{purchase,sold}` (HĐ thường) và `/sco-query/invoices/{purchase,sold}` (HĐ máy tính tiền).
- **Khóa tự nhiên hóa đơn** để khử trùng lặp và upsert: `(tenant_id, nbmst, khmshdon, khhdon, shdon, tdlap)`.
- Đồng bộ phải **idempotent**: chạy lại cùng kỳ không nhân đôi bản ghi; cập nhật `ttxly`/`tthai` khi hóa đơn đổi trạng thái; luôn lưu `raw_json`.
- Tầng ứng dụng (Worker API) **phi trạng thái** (stateless). Việc nặng đẩy sang nền qua **Queues → Workflows**; trạng thái phối hợp (rate limit, circuit breaker) đặt trong **Durable Objects**.
- Mọi truy vấn dữ liệu phải gắn `tenant_id` (RLS Postgres là lớp phòng thủ thứ hai). Chi tiết: `.claude/rules/multi-tenant.md`.

## Quy ước bắt buộc (tóm tắt — chi tiết trong `.claude/rules/`)

- TDD, coverage ≥ 80% tầng nghiệp vụ (`testing.md`).
- Không hard-code bí mật, không lưu mật khẩu thuế thô, audit log hành động nhạy cảm (`security.md`).
- Mọi hàm gọi mạng ra ngoài: timeout + retry có backoff; lỗi 401 → dừng và báo hết hạn token (`gdt-adapter.md`).
- Commit nhỏ, thông điệp rõ. Không trộn nhiều đơn vị công việc trong một commit.
- Tên hàm/biến rõ nghĩa; không để lại code chết.

## Lệnh chuẩn (dùng để tự kiểm chứng trong vòng lặp)

`make` là interface ổn định (các hook DoD gọi nó); bên dưới bọc npm/Wrangler:

- `make test` — Vitest nhóm `unit` + `integration` qua `vitest-pool-workers` (Miniflare), không gọi mạng thật tới GDT.
- `make test-contract` — Vitest nhóm `contract`, gọi thật endpoint công khai của GDT để phát hiện đổi API + kiểm chứng egress.
- `make lint` — Biome (lint + format check) và `tsc --noEmit` (kiểu).
- `make run` — chạy API dev (`wrangler dev`).
- `make migrate` — chạy migrations Drizzle lên Postgres.
- `make up` — cài phụ thuộc + chuẩn bị môi trường dev (npm workspaces; Postgres/Hyperdrive cấu hình qua `.dev.vars`).

## Định nghĩa hoàn thành (Definition of Done)

Một đơn vị chỉ "xong" khi: có test tự động phủ đúng tiêu chí nghiệm thu và **toàn bộ xanh**; `make lint` sạch; không giảm độ phủ dưới ngưỡng; không lộ bí mật trong code/log; cập nhật tài liệu liên quan; commit nhỏ, rõ. Cổng `Stop` hook ép kiểm tra lint + test trước khi coi một lượt là xong — xem `.claude/settings.json`.

## Quy trình làm việc (vòng lặp)

Theo `TRIEN_KHAI_BANG_CLAUDE_CODE.md`, đóng gói trong skill `/start-unit`: (1) đọc spec + bối cảnh → (2) kế hoạch ngắn → (3) **viết test trước** → (4) hiện thực tối thiểu → (5) `make lint && make test` → (6) đỏ thì tự sửa và lặp; xanh thì (7) review chéo bằng subagent + commit. **Mỗi lần chỉ một đơn vị.**

Thứ tự triển khai: U0 (khung dự án + Makefile + CI) → U1–U3 (GDT Adapter) → U4–U5 (mô hình dữ liệu + đồng bộ idempotent) → U6–U7 (API tra cứu + kết xuất) → U8–U12 (đa tenant, đồng bộ nền, đối chiếu, kế toán, bảo mật) → **U13 (Giám sát rủi ro: contract định kỳ + probe egress; `docs/plans/EXP-giam-sat-rui-ro.md`)** → **U14 (Backend login/token GDT — API-only; `docs/plans/U14-design.md`)** → **U15 (Frontend — Tầng trình bày: SPA tra cứu/kết xuất/đối chiếu + màn Login, trên API nội bộ; `docs/plans/U15-plan.md`)**.

## Nguyên tắc bằng chứng (không giả định vô căn cứ)

Mọi nhận định làm cơ sở cho quyết định, tài liệu hoặc mã nguồn phải **truy được về bằng chứng cụ thể, tái lập được** — tuyệt đối không suy đoán rồi trình bày như sự thật. Đây là nguyên tắc tối cao, ngang các quy tắc cứng.

- **Phân biệt rạch ròi "đã kiểm chứng" với "giả định".** *Đã kiểm chứng* = có bằng chứng tái lập được, kèm ngày: lệnh + kết quả thật, tài liệu chính thức, hoặc lưu lượng/quan sát trực tiếp. *Giả định* = chưa có bằng chứng → **phải gắn nhãn "CHƯA KIỂM CHỨNG" ở mọi nơi nó xuất hiện.**
- **Không để giả định hoá thành "chốt".** Trước khi một giả định về hệ thống bên ngoài (đặc biệt API thuế) trở thành tiền đề của ADR/kiến trúc/mã, phải có **một phép kiểm chứng tái lập được** (curl/probe/contract test) và **ghi lại kết quả**. Không kiểm chứng ⇒ không được "chốt".
- **"Đã có trong tài liệu/mã cũ" KHÔNG phải bằng chứng.** Một khẳng định nằm sẵn trong chú thích/tài liệu/mã kế thừa không chứng minh nó đúng; tiền đề nền phải **tự kiểm lại từ nguồn sơ cấp**, không tin theo dây chuyền. *(Bài học `:30000`: một chú thích "Portal dùng cổng 30000" chưa ai chạy thử đã lan vào ADR + mã và suýt dựng cả hạ tầng relay/VPS vô ích — xem ADR-0001 Amendment #2.)*
- **Khi chưa chắc, nói thẳng "chưa kiểm chứng".** Thà thừa nhận chưa biết còn hơn phát biểu tự tin sai. **Độ tự tin không thay thế bằng chứng.**
- **Trích nguồn khi khẳng định** về hành vi hệ thống bên ngoài: dẫn lệnh/kết quả/tài liệu cụ thể, tái lập được.

Nguyên tắc này củng cố mục "Khi gặp mơ hồ" bên dưới và được ép thi hành qua contract test + probe định kỳ trong Definition of Done.

## Khi gặp mơ hồ

Nếu cần **đoán cấu trúc phản hồi API thuế** hoặc gặp yêu cầu chưa rõ: **DỪNG và hỏi**, kèm phương án đề xuất và một contract test để kiểm chứng. Không tự giả định thầm rồi code tiếp.

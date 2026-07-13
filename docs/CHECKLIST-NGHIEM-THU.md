# Checklist nghiệm thu theo mốc (U0–U12)

Tài liệu **sống** để theo dõi tiến độ và làm **bộ tiêu chuẩn thông qua** cho từng bước lớn. Nguồn: `TRIEN_KHAI_BANG_CLAUDE_CODE.md` (mục 3 — đơn vị vòng lặp) và `CLAUDE.md` (Definition of Done). Tiêu chí đã điều chỉnh theo ngăn xếp Cloudflare/TypeScript (ADR-0001).

> Quy tắc thông qua: một mốc chỉ được đánh `✅ ĐẠT` khi **toàn bộ** tiêu chí riêng của nó **và** Definition of Done chung (mục A) đều xanh. Nếu thiếu bất kỳ mục nào → **chưa đạt, tự vòng lại** bước thực thi cho tới khi đủ.

## Vòng lặp mỗi mốc

```
   ĐỌC nhiệm vụ + mục tiêu        →  /plan-unit U#     (đọc spec, ra kế hoạch)
        │
        ▼
   RA KẾ HOẠCH + (viết prompt)    →  /write-prompt U#  (tùy chọn)
        │
        ▼
   THỰC THI (TDD)                 →  /start-unit U#
        │
        ▼
   ĐỐI CHIẾU TIÊU CHUẨN           →  /verify  +  /qa-unit
        │
   ┌────┴─────┐
   │  ĐẠT?    │── chưa ──▶ vòng lại THỰC THI (sửa tới khi đủ tiêu chí)
   └────┬─────┘
     đạt │
        ▼
   THÔNG QUA + commit → sang mốc kế tiếp
```

Cổng kỹ thuật `.claude/hooks/gate-dod.sh` ép `make lint && make test` phải xanh mới cho đóng lượt — đây là chốt chặn khách quan, không phụ thuộc thiện chí.

---

## A. Definition of Done chung (áp dụng cho MỌI mốc)

- [ ] Có test tự động phủ đúng tiêu chí nghiệm thu và **toàn bộ xanh** (`make test`).
- [ ] `make lint` sạch (Biome + `tsc --noEmit`).
- [ ] Không giảm coverage tầng nghiệp vụ dưới **80%**.
- [ ] Không lộ bí mật trong code/log (không mật khẩu thô, token, key).
- [ ] Mọi truy vấn dữ liệu gắn `tenant_id` (khi đã có tầng dữ liệu); khóa tự nhiên đủ trường.
- [ ] Mọi gọi mạng ra ngoài: timeout + retry backoff; **401 → dừng + báo hết phiên**.
- [ ] Tài liệu liên quan đã cập nhật nếu hành vi/kiến trúc đổi.
- [ ] Commit nhỏ, rõ, **chỉ một đơn vị**.
- [ ] `/qa-unit` không còn phát hiện lỗi **Critical** (`dod-auditor` luôn chạy; `contract-guardian`/`security-reviewer` khi liên quan).

---

## B. Mốc theo lộ trình

### ✅ U0 — Khung dự án + CI + skeleton test  ·  *ĐẠT (`make lint && make test` xanh trên máy — commit `757ec3a`)*

- [x] Monorepo npm workspaces (`apps/*`, `packages/*`) dựng xong.
- [x] `apps/api` (Worker Hono) có `/health`; test health-check.
- [x] `packages/gdt-client` giữ interface `GdtTransport` + endpoint (nguồn chân lý).
- [x] `Makefile` (bọc npm/Wrangler) + CI GitHub Actions.
- [x] `make lint` và `make test` xanh trên máy (xác nhận cuối cùng).

### 🗄️ U1a — Dựng relay VN + kiểm chứng egress `:30000`  ·  *BỎ — không cần, T0 thuần Cloudflare đã CHẠY (ADR-0001 Amendment #3, 2026-07-13)* · review: `security-reviewer` + `contract-guardian`

> ✅ **Đã kiểm chứng 2026-07-13 (Amendment #3):** phép thử quyết định gọi **đúng** `https://hoadondientu.gdt.gov.vn/api/captcha` từ biên Cloudflare thật (`wrangler dev --remote`) → **200 + JSON `{key,content}` hợp lệ**, 3 lần liên tiếp, từ colo nước ngoài (`HK`). ⇒ **T0 (thuần Cloudflare) CHẠY** cho API GDT thật. Mốc này **không cần thực hiện** — giữ lại checklist bên dưới làm bằng chứng lịch sử (nhánh đã cân nhắc, không phải việc còn phải làm), không xoá.
>
> *(Tiền đề cũ — giữ làm bằng chứng:) Amendment 2026-07-12 cho rằng biên Cloudflare không tới được API `:30000` nên cần relay VN + VPS. Tiền đề `:30000` đã bị chứng minh sai ở Amendment #2 (cổng chết); Amendment #3 xác nhận endpoint đúng `/api/captcha` không hề bị chặn.*

- [ ] ~~Relay **stateless** đặt tại VN (VPS Viettel/VNPT/FPT…); xác thực **mTLS + shared-secret**; chỉ Worker của dự án gọi được; không lưu/không log body (token, credential, `raw_json`) — theo `.claude/rules/security.md` mục "Relay VN (egress GDT)".~~
- [ ] ~~Từ **vantage VN thật**: `curl https://103.9.200.142:30000/captcha` (Host: `hoadondientu.gdt.gov.vn`) trả JSON hợp lệ `{key, content}`.~~
- [ ] ~~Worker gọi GDT **thành công qua relay** (`GdtTransport = vn-relay`): probe/`getCaptcha` qua relay trả về đúng payload.~~
- [ ] ~~Bí mật relay (khóa mTLS, shared-secret) nạp qua Workers Secrets/Secrets Store, không commit, xoay vòng được.~~
- [ ] ~~**Đo ngưỡng danh tính egress (ADR-0002):** xác định **đơn vị + con số thật** GDT siết một IP...~~ — chỉ cần lại nếu probe định kỳ trong tương lai phát hiện `GEO_BLOCKED` thật sự.

### ✅ U1 — GDT Adapter: captcha + authenticate  ·  review: `contract-guardian` + `security-reviewer` + `dod-auditor` — cả ba **PASS** (2026-07-13)

- [x] Mọi gọi GDT đi qua `GdtTransport` trong `packages/gdt-client` (không `fetch` trực tiếp nơi khác). Khẳng định bằng test chặn `globalThis.fetch` (`test/unit/auth.test.ts`).
- [x] `getCaptcha()` chỉ trả ảnh cho người dùng nhập — **không** tự giải/bypass (`src/captcha.ts`).
- [x] Đăng nhập thành công nghiệp vụ khi có `token`; xử lý sai captcha/mật khẩu (GDT có thể trả 200 kèm `message` lỗi, không có `token`) như lỗi nghiệp vụ, không phải lệch hợp đồng (`src/auth.ts`).
- [x] 401 → dừng, báo hết phiên (`GdtError` code `SESSION_EXPIRED`); không tự retry bằng credential cũ (`src/http.ts` không retry cho 401; khẳng định `callCount()===1`).
- [x] Contract test với phản hồi thật (endpoint công khai `/api/captcha`, `test/contract/captcha.contract.test.ts`, chạy mạng thật, khớp `gdt-contract-schema.json`).
- [x] `BASE` sửa từ `:30000` (sai) sang `https://hoadondientu.gdt.gov.vn` (`:443`), `CAPTCHA_PATH = /api/captcha` — ĐÃ KIỂM CHỨNG (ADR-0001 Amendment #3).
- [x] `make lint` sạch, `make test` xanh (25/25 unit + 2/2 apps/api), `make test-contract` xanh (1/1, gọi mạng thật).
- [x] Coverage `packages/gdt-client/src/*.ts` (trừ `index.ts` — wiring thuần): **99.29%** stmts/lines, 96.29% branch, 100% funcs — vượt ngưỡng 80% (`.claude/rules/testing.md`).
- [x] ✅ **AUTH_PATH ĐÃ KIỂM CHỨNG (2026-07-13):** probe đăng nhập thật (QĐ-2, runbook `docs/prompts/U1-probe-authenticate.md`) với tài khoản MST hợp pháp → **`httpStatus=200` + `{token}` (JWT), `hasToken=true`**, egress **`SG`** từ biên Cloudflare (T0, `wrangler dev --remote`). Người trực đọc/nhập captcha (**không** bypass); credential nạp ephemeral qua `.dev.vars`, **đã xoá ngay sau probe**; token **không** ghi lại (chỉ log bản che). Đã gỡ nhãn `CHƯA KIỂM CHỨNG` khỏi `endpoints.ts` (`AUTH_PATH`) + cập nhật `gdt-contract-schema.json` (`authenticate`); ghi vào ADR-0001 **Amendment #4**. Mã probe **tạm đã revert** (`git status` sạch).
- [ ] ⚠️ **Nợ kiểm chứng còn lại (chuyển sang U2):** `INVOICE_ENDPOINTS` (`/api/query/invoices/*` + `/api/sco-query/invoices/*`) **CHƯA KIỂM CHỨNG** — chỉ có unit test mock, chưa gọi thật. Giữ nhãn `CHƯA KIỂM CHỨNG` trong `endpoints.ts` cho tới khi kiểm chứng bằng gọi thật ở **U2** (query purchase/sold).

### ✅ U2 — Query purchase/sold + phân trang + gộp sco + khử trùng · review: `contract-guardian`

- [x] Truy vấn và **gộp hai họ endpoint**: `/query/invoices/{purchase,sold}` và `/sco-query/invoices/{purchase,sold}`. (`queryInvoices()` trong `packages/gdt-client/src/query.ts`; test `query.test.ts` "gộp normal + sco".)
- [x] Test phân trang nhiều trang (đủ, không sót/lặp trang). (Test: dừng khi trang ngắn hơn size, dừng khi thiếu `state`, chặn vòng lặp vô hạn + cảnh báo cắt cụt.)
- [x] Khử trùng lặp theo khóa tự nhiên. Ở **tầng adapter (U2)** dùng **5 trường** `(nbmst, khmshdon, khhdon, shdon, tdlap)` — `tenant_id` (khóa 6 trường cho upsert DB) bổ sung ở tầng đồng bộ **U4/U5**, không thuộc adapter. (Test: "khử trùng theo khóa tự nhiên khi trùng giữa normal và sco".)
- [x] Luôn giữ nguyên bản thô của hóa đơn (nền tảng cho cột `raw_json` khi lưu DB ở U4): adapter trả nguyên toàn bộ trường, chỉ gắn thêm `_source`/`_direction`. (Test: "bảo toàn TOÀN BỘ trường thô của hóa đơn".)
- [x] ✅ **ĐÃ KIỂM CHỨNG (2026-07-13, probe query thật từ Chrome đăng nhập thật của người dùng — chỉ đọc network, không ghi token/giá trị hóa đơn):**
  - `GET /api/query/invoices/purchase` → `200`, phong bì `{datas, total, state, time}`; `datas` mảng (15), `state` chuỗi con trỏ; **16 kết quả / 2 trang** ⇒ phân trang `state` hoạt động thật.
  - `GET /api/query/invoices/sold` → `200` (network capture).
  - `GET /api/sco-query/invoices/purchase` → `200`, `datas: []` **RỖNG vẫn hiện diện**, `state: null` khi rỗng ⇒ giải toả điểm mơ hồ "GDT có luôn trả `datas` khi rỗng không".
  - Bare fetch không kèm `Authorization` → `401` ⇒ xác nhận cần header `Bearer`.
  - Cú pháp RSQL thật `tdlap=ge=…T00:00:00;tdlap=le=…T23:59:59` khớp `buildSearch()`; row đủ 5 trường khóa tự nhiên.
  - Đã gỡ nhãn `CHƯA KIỂM CHỨNG` trong `endpoints.ts` + `gdt-contract-schema.json`. Chi tiết: ADR-0001 **Amendment #5**.
  - Còn lại (nhẹ): `/api/sco-query/invoices/sold` suy từ đối xứng, chưa gọi trực tiếp; probe qua egress máy người dùng (không kiểm lại egress T0 — đã có ở Amendment #3/#4).

### ✅ U3 — GDT Adapter: detail dòng hàng · review: `contract-guardian` **PASS** + `security-reviewer` **PASS** (2026-07-13)

> `dod-auditor` bị gián đoạn bởi giới hạn phiên (không phải do phát hiện lỗi); các gate DoD (lint/test/coverage/scope/nhất quán tài liệu) đã được `contract-guardian` tự chạy và xác minh độc lập. Đã áp các phát hiện review: (a) thay MST thật trong fixture test bằng MST giả (`security-reviewer`, Low); (b) khai báo `invoice_detail` là ngoại lệ hợp đồng mềm thứ hai trong `.claude/rules/gdt-adapter.md` (`contract-guardian`); (c) thêm ghi chú CHƯA KIỂM CHỨNG tại test KCT/KKKNT + cảnh báo bảo mật tại field `raw`.

- [x] Test ánh xạ dòng hàng, thuế suất từ endpoint detail. (`mapDetailLines()` trong `packages/gdt-client/src/detail.ts`; `test/unit/detail.test.ts` — 18 test: ánh xạ `ten/dvtinh/sluong/dgia/thtien` + thuế suất hai trường `ltsuat`/`tsuat`, giữ `raw`, ca mã chữ KCT/KKKNT giữ nguyên, biên rỗng/null.)
- [x] Contract test cho cấu trúc detail; lệch → dừng + cập nhật schema tường minh (không nới assertion). (`test/contract/detail.contract.test.ts`, `it.skipIf(!TOKEN)`, khớp `gdt-contract-schema.json` → `invoice_detail`.)
- [x] `getInvoiceDetail()` cô lập qua `GdtTransport`; 401 → `SESSION_EXPIRED`; kiểm hợp đồng mềm `invoice_detail`. `make lint` sạch; `make test` xanh (**59 unit** gdt-client + 2 apps/api); coverage `detail.ts` **100%** (stmts/lines/branch/funcs; ngưỡng 80%).
- [x] ✅ **ĐÃ KIỂM CHỨNG (2026-07-13, probe detail thật từ Chrome đăng nhập thật của người dùng — HĐ mua vào thường, dòng thuế suất 8%; chỉ đọc network, không ghi token/giá trị hóa đơn):**
  - `GET /api/query/invoices/detail?nbmst&khhdon&shdon&khmshdon` → `200`. **CHỈ 4 tham số, KHÔNG có `tdlap`** (lệch giả thuyết cũ 5 tham số).
  - Mảng dòng hàng ở khóa **`hdhhdvu`** (khớp giả thuyết). Mỗi dòng: `stt, ten, dvtinh, sluong, dgia, thtien, tchat`…
  - **Thuế suất = HAI trường:** `ltsuat` (chuỗi `"8%"`) + `tsuat` (số `0.08`); tiền thuế dòng `tthue` (null ở dòng này). `mapDetailLines` giữ NGUYÊN cả hai + `raw`, không ép kiểu.
  - Đã gỡ nhãn CHƯA KIỂM CHỨNG cho `DETAIL_ENDPOINTS.normal` + `gdt-contract-schema.json` (`invoice_detail`). Chi tiết: ADR-0001 **Amendment #6**.
  - Còn lại (giữ nhãn CHƯA KIỂM CHỨNG): `DETAIL_ENDPOINTS.sco` (`/api/sco-query/invoices/detail`) suy từ đối xứng, chưa gọi trực tiếp (tài khoản không có HĐ máy tính tiền); mã thuế đặc biệt KCT/KKKNT chưa quan sát (mới thấy 8%).

### ⬜ U4 — Mô hình dữ liệu + migration (PostgreSQL/Drizzle qua Hyperdrive) · review: `security-reviewer`

- [ ] `make migrate` tạo schema (Drizzle) trên Postgres.
- [ ] Test ràng buộc **khóa tự nhiên** (unique) trên bảng hóa đơn.
- [ ] Mọi bảng nghiệp vụ có `tenant_id` NOT NULL; `raw_json` kiểu JSONB.
- [ ] Bật **Row-Level Security** theo `tenant_id`.

### ⬜ U5 — Dịch vụ đồng bộ idempotent (upsert)

- [ ] (a) Chạy đồng bộ 2 lần cùng kỳ → **không nhân đôi** bản ghi.
- [ ] (b) `ttxly`/`tthai` đổi giữa 2 lần → **cập nhật**, không tạo mới.
- [ ] (c) Bản ghi lần đồng bộ ghi đúng số HĐ mới / số HĐ cập nhật.
- [ ] (d) Lỗi mạng tạm → retry; 401 → dừng + báo. *(Mỗi ý (a)–(d) có ≥ 1 test.)*
- [ ] (e) **Thông báo thay đổi hóa đơn**: khi `ttxly/tthai` đổi giữa 2 lần đồng bộ → sinh sự kiện thông báo cho tenant (VD: "HĐ Mới → HĐ Đã bị điều chỉnh"). *(Đối sánh NIBOT — khảo sát mục 8a; test: đổi trạng thái → có đúng 1 thông báo, không trùng.)*
- [ ] (f) **Lịch sử đồng bộ có phiên bản**: mỗi phiên đồng bộ ghi mốc thời gian + số HĐ mới/cập nhật, truy vấn lại được theo tenant. *(NIBOT hiển thị "V:554"; test: 2 phiên tạo 2 bản ghi lịch sử phân biệt.)*

### ⬜ U6 — REST API tra cứu + lọc + tổng hợp · review: `security-reviewer`

- [ ] Test API (Hono `app.request`, mock adapter): lọc, phân trang, tổng hợp.
- [ ] Mọi endpoint dữ liệu gắn `tenant_id`; xác thực JWT nội bộ (trừ health-check).

### ⬜ U7 — Xuất Excel/CSV theo mẫu

- [ ] Test đọc lại file kết xuất: đúng cột và **định dạng tiền**.
- [ ] File lớn lưu **R2** (không giữ trong bộ nhớ Worker).
- [ ] **Kết xuất đa định dạng** (đối sánh NIBOT — khảo sát mục 8a): tối thiểu `xlsx` + `csv`; lộ trình đủ parity gồm `xml.zip`, `pdf.zip`, và gộp `AIO.pdf`. *(Test: mỗi định dạng mở lại được, đúng số bản ghi.)*

### ⬜ U8 — Auth người dùng nội bộ + RBAC + đa tenant · review: `security-reviewer` (rò rỉ chéo = Critical)

- [ ] Test **cách ly dữ liệu**: tạo 2 tenant, xác nhận A không đọc/ghi được dữ liệu B.
- [ ] RBAC theo vai trò; RLS là lớp phòng thủ thứ hai.

### ⬜ U9 — Đồng bộ nền theo lịch (Cloudflare Queues + Workflows + Cron)

- [ ] Test job **idempotent**; retry khi lỗi tạm.
- [ ] `tenant_id` nằm tường minh trong payload message/Workflow event.
- [ ] Rate limit + circuit breaker theo tenant/MST (Durable Object); không gọi dồn dập máy chủ thuế.

### ⬜ U10 — Module đối chiếu (thiếu HĐ, lệch thuế, HĐ hủy/thay thế)

- [ ] Test theo bộ dữ liệu tình huống (thiếu, lệch thuế, hủy/thay thế).
- [ ] Dùng `raw_json` để đối chiếu; xử lý đúng hóa đơn hủy/thay thế.

### ⬜ U11 — Tích hợp/xuất sang phần mềm kế toán

- [ ] Test ánh xạ đúng định dạng mục tiêu của phần mềm kế toán.

### ⬜ U12 — Bảo mật: mã hóa bí mật, audit log, rate limit client · review: `security-reviewer`

- [ ] Test mã hóa/giải mã bí mật (envelope); bí mật qua Workers Secrets/Secrets Store.
- [ ] **Không** lưu mật khẩu thuế thô; chỉ token ngắn hạn đã mã hóa.
- [ ] Audit log append-only cho hành động nhạy cảm.
- [ ] Chặn vượt ngưỡng rate limit phía client.

---

## C. Vòng lặp giám sát rủi ro (xuyên suốt, không phải một mốc)

- [ ] **Contract test định kỳ** (CI theo lịch) gọi endpoint công khai GDT — phát hiện khi cơ quan thuế đổi API → tạo nhiệm vụ cập nhật adapter.
- [ ] **Probe egress định kỳ** — theo dõi T0 (thuần Cloudflare) còn gọi được GDT không; nếu `GEO_BLOCKED`/`RATE_LIMITED` ổn định → kích hoạt T1 (relay VN) và cảnh báo. (ADR-0001 mục 5B.)

---

## D. Điều kiện hoàn thành toàn dự án

Tất cả U0–U12 đạt Definition of Done, test hồi quy toàn bộ xanh, và hai vòng giám sát rủi ro (mục C) đang chạy ổn định.

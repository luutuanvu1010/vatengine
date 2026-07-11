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

### ✅ U0 — Khung dự án + CI + skeleton test  ·  *ĐÃ LÀM (chờ xác nhận `make lint && make test` xanh trên máy + commit skill)*

- [x] Monorepo npm workspaces (`apps/*`, `packages/*`) dựng xong.
- [x] `apps/api` (Worker Hono) có `/health`; test health-check.
- [x] `packages/gdt-client` giữ interface `GdtTransport` + endpoint (nguồn chân lý).
- [x] `Makefile` (bọc npm/Wrangler) + CI GitHub Actions.
- [ ] `make lint` và `make test` xanh trên máy (xác nhận cuối cùng).

### ⬜ U1 — GDT Adapter: captcha + authenticate  ·  *TIẾP THEO* · review: `contract-guardian`

- [ ] Mọi gọi GDT đi qua `GdtTransport` trong `packages/gdt-client` (không `fetch` trực tiếp nơi khác).
- [ ] `getCaptcha()` chỉ trả ảnh cho người dùng nhập — **không** tự giải/bypass.
- [ ] Đăng nhập thành công nghiệp vụ khi có `token`; xử lý sai captcha/mật khẩu (GDT có thể trả 200 kèm `message` lỗi, không có `token`).
- [ ] 401 → dừng, báo hết phiên; không tự retry bằng credential cũ.
- [ ] Contract test với phản hồi mẫu (endpoint công khai `/captcha`).

### ⬜ U2 — Query purchase/sold + phân trang + gộp sco + khử trùng · review: `contract-guardian`

- [ ] Truy vấn và **gộp hai họ endpoint**: `/query/invoices/{purchase,sold}` và `/sco-query/invoices/{purchase,sold}`.
- [ ] Test phân trang nhiều trang (đủ, không sót/lặp trang).
- [ ] Khử trùng lặp theo khóa tự nhiên `(tenant_id, nbmst, khmshdon, khhdon, shdon, tdlap)`.
- [ ] Luôn giữ `raw_json` cho mỗi hóa đơn.

### ⬜ U3 — GDT Adapter: detail dòng hàng · review: `contract-guardian`

- [ ] Test ánh xạ dòng hàng, thuế suất từ endpoint detail.
- [ ] Contract test cho cấu trúc detail; lệch → dừng + cập nhật schema tường minh (không nới assertion).

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

### ⬜ U6 — REST API tra cứu + lọc + tổng hợp · review: `security-reviewer`

- [ ] Test API (Hono `app.request`, mock adapter): lọc, phân trang, tổng hợp.
- [ ] Mọi endpoint dữ liệu gắn `tenant_id`; xác thực JWT nội bộ (trừ health-check).

### ⬜ U7 — Xuất Excel/CSV theo mẫu

- [ ] Test đọc lại file kết xuất: đúng cột và **định dạng tiền**.
- [ ] File lớn lưu **R2** (không giữ trong bộ nhớ Worker).

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

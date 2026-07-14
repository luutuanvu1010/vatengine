# VATCrawlbot — Tra cứu hóa đơn điện tử (Tổng cục Thuế)

Ứng dụng web nội bộ giúp doanh nghiệp tra cứu **hóa đơn đầu vào (mua vào)** và
**hóa đơn đầu ra (bán ra)** trực tiếp từ Hệ thống Hóa đơn điện tử của Tổng cục Thuế
(`hoadondientu.gdt.gov.vn`), lấy về **đầy đủ trường dữ liệu**, cho xem – lọc – tra cứu
và **xuất Excel** để đối chiếu, kê khai và nhập vào phần mềm kế toán.

> Ứng dụng chỉ truy xuất dữ liệu **thuộc thẩm quyền của chính doanh nghiệp**, bằng
> tài khoản Mã số thuế do cơ quan thuế cấp. Không thu thập dữ liệu của bên thứ ba.

> 📌 **Cập nhật ngăn xếp (2026-07-11):** Ngăn xếp thực thi đã chuyển sang **Cloudflare Workers + TypeScript** theo `docs/adr/0001-nen-tang-cloudflare.md` (Accepted). Phần mô tả Python/FastAPI + cách cài/chạy bên dưới là **bối cảnh MVP cũ**, giữ để tham chiếu nghiệp vụ. Cách chạy mới: `make up && make run`. **Điểm vào phiên làm việc: `docs/00-BAT-DAU-TAI-DAY.md`.**

### API Worker hiện có (`apps/api`, Hono) — đọc dữ liệu ĐÃ đồng bộ, sau JWT nội bộ

Mọi endpoint (trừ `/health`) cần JWT nội bộ HS256 (`Authorization: Bearer …`, claim `tenant_id`).

| Method & path | Mốc | Vai trò |
|---|---|---|
| `GET /health` | U6 | Health-check (miễn xác thực) |
| `GET /invoices` · `?chieu&tuNgay&denNgay&ttxly&tthai&nbmst&nmmst&nguon&limit&offset` | U6 | Danh sách + lọc + phân trang |
| `GET /invoices/summary` | U6 | Tổng hợp (count + sum tiền) trên cùng bộ lọc |
| `GET /invoices/:id` | U6 | Một hóa đơn (header) trong phạm vi tenant |
| `POST /exports?format=xlsx\|csv&<bộ lọc như /invoices>` | **U7** | Kết xuất → ghi **R2** → trả `{ id, key, url }` |
| `GET /exports/:id` | **U7** | Tải file kết xuất/convert (stream từ R2, giới hạn tenant) |
| `GET /reconcile?<bộ lọc như /invoices>` | **U10** | Đối chiếu: lệch thuế, thiếu số HĐ đầu ra, hủy/thay thế |
| `POST /exports/convert?profile=<id>&format=xlsx\|csv&<bộ lọc như /invoices>` | **U11** | Ánh xạ sang định dạng phần mềm kế toán theo profile → ghi **R2** → `{ id, key, url, profile }`; tải qua `GET /exports/:id` |

Kết xuất bám mẫu cột chuẩn (`@vat/export`): tiền giữ chuỗi numeric chính xác, ô tiền `xlsx` định dạng `#,##0`; file lớn không giữ nguyên khối trong bộ nhớ Worker (CSV stream thẳng vào R2).

Đối chiếu (`@vat/reconcile`, U10) đọc-only trên hóa đơn đã đồng bộ, tính on-read: **lệch thuế** (số học nội tại header `tgtcthue − ttcktmai + tgtthue = tgtttbso`, tính trong SQL `numeric`), **thiếu số HĐ đầu ra** (khoảng trống dãy `shdon` theo `(nbmst, khhdon)`), **hủy/thay thế** (theo bảng mã trạng thái — hiện **RỖNG** vì mã `tthai`/`ttxly` chưa kiểm chứng, chờ probe; xem `docs/plans/U10-plan.md`).

Convert kế toán (`@vat/export`, U11) tổng quát hóa encoder xuất U7 qua **profile ánh xạ** (`MappingProfile`): mỗi profile định nghĩa cột đích + định dạng của một phần mềm kế toán. Convert đọc-only, keyset streaming, ghi **R2** + trả link (như U7). Định dạng import thật của MISA/FAST/SmartKTSC **CHƯA KIỂM CHỨNG** (chưa có template) → nằm ở `PENDING_PROFILES`, chưa khả dụng (`profile=misa` → 400); hiện chỉ có **profile tham chiếu** chứng minh cơ chế. Điền profile thật chỉ khi có template chính thức (Nguyên tắc bằng chứng); xem `docs/plans/U11-plan.md`.

### Worker đồng bộ nền (`apps/sync-worker`, U9) — Cron + Queues + Durable Object

Worker tách bạch, không phục vụ HTTP người dùng. **Cron** liệt kê tài khoản thuế có token **còn hạn** → **Queue** một message/(tài khoản × chiều) mang `tenant_id` tường minh → consumer gọi `sync()` (U5, idempotent). **Durable Object `TenantLimiter`** giữ token-bucket + circuit breaker theo tenant/MST ("không gọi dồn dập" máy chủ thuế). Token hết hạn → ghi nhật ký `can_dang_nhap_lai` + audit, **KHÔNG tự đăng nhập, KHÔNG giải captcha** (người dùng đăng nhập lại — U1). Lỗi tạm → queue thử lại (trần `max_retries` → dead-letter); 401 → dừng, không thử lại token chết. Xem `docs/plans/U9-plan.md`.

### Bảo mật (`@vat/crypto`, U12) — mã hóa bí mật, audit bất biến, rate limit làm cứng

- **Envelope encryption** (`@vat/crypto`): `sealSecret`/`openSecret` (AES-256-GCM, KEK bọc DEK ngẫu nhiên mỗi bản ghi, chuỗi tự mô tả `v1$aesgcm$…` để mở đường rotation). Seam `@vat/db` `storeToken`/`readToken` mã hóa token GDT **tại nghỉ** trong `tai_khoan_thue.token_hien_tai` — **không** lưu mật khẩu/token thô (`security.md`).
  - **Provision KEK khi bật lưu token runtime:** `wrangler secret put SECRET_KEK` (32 byte base64). U12 giao **seam + test fixture**; đường GHI token (login→lưu mã hóa) là đơn vị sau — khi đó điểm đọc `loadAccountToken` chuyển sang `readToken`.
- **Audit bất biến (append-only):** migration `0002` cài trigger chặn UPDATE/DELETE trên `audit_log` (kể cả owner/superuser). `chi_tiet` đi qua `maskSensitive` trước khi ghi (che token/connection-string).
- **Rate limit làm cứng:** ngưỡng `TenantLimiter` tinh chỉnh qua `vars` (`LIMITER_CAPACITY`/`LIMITER_REFILL_PER_SEC`/`LIMITER_FAILURE_THRESHOLD`/`LIMITER_COOLDOWN_MS`); log quan sát có cấu trúc khi chặn. Xem `docs/plans/U12-plan.md`.

## Kiến trúc nhanh

```
Trình duyệt (frontend/index.html)
        │  gọi REST
        ▼
Backend FastAPI (backend/main.py)  ──►  gdt_client.py  ──►  hoadondientu.gdt.gov.vn:30000
        │                                   (đăng nhập captcha, tra cứu, chi tiết)
        └──► Xuất Excel (openpyxl)
```

## Tài liệu (sản phẩm chính của dự án)

- **KIEN_TRUC_VA_KE_HOACH.md** — Kiến trúc & kế hoạch chuẩn Enterprise: sơ đồ kiến trúc,
  nguyên tắc vận hành, mô hình/logic dữ liệu, bảo mật – tuân thủ, lưu trữ, bảo trì,
  khả năng mở rộng, lộ trình, và hướng thương mại hóa.
- **TRIEN_KHAI_BANG_CLAUDE_CODE.md** — Sổ tay để **Claude Code** hiện thực phần mềm theo
  phương pháp **Prompt + Loop Engineering** (đặc tả → test trước → sinh code → kiểm chứng
  → tinh chỉnh), kèm bộ prompt và chia nhỏ công việc.

> Thư mục `backend/` và `frontend/` là **khung tham chiếu MVP** (proof-of-concept) để
> Claude Code khởi động vòng lặp, không phải bản production. Việc nâng lên phần mềm hoàn
> chỉnh do Claude Code thực hiện theo sổ tay ở trên.

## Cài đặt

Yêu cầu: Python 3.9+

```bash
cd VATCrawlbot
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt
```

## Chạy

```bash
uvicorn backend.main:app --port 8000
```

Mở trình duyệt: <http://localhost:8000>

## Cách dùng

1. **Đăng nhập**: nhập MST (hoặc tài khoản người dùng con), mật khẩu, và mã captcha
   hiển thị trong ảnh. Nếu mạng công ty báo lỗi chứng chỉ SSL, bỏ chọn "Xác thực SSL".
2. **Tra cứu**: chọn loại hóa đơn (đầu vào/đầu ra), khoảng thời gian, bấm *Tra cứu*.
3. **Xem & lọc**: bảng kết quả hỗ trợ sắp xếp theo cột và lọc nhanh theo tên/MST/số HĐ.
4. **Xuất Excel**: bấm *Xuất Excel* để tải file `.xlsx` đầy đủ trường.

## Ghi chú kỹ thuật

- Mật khẩu **không** được lưu ở server; chỉ dùng một lần để đăng nhập tại máy chủ thuế.
  Sau đăng nhập, chỉ JWT token (do Tổng cục Thuế cấp) được giữ trong bộ nhớ phiên.
- Hai họ endpoint được truy vấn: hóa đơn điện tử thường (`/query/...`) và hóa đơn
  máy tính tiền (`/sco-query/...`), tự động gộp và khử trùng lặp.
- Token của Tổng cục Thuế có thời hạn ngắn; khi hết hạn ứng dụng yêu cầu đăng nhập lại.

## Cấu trúc thư mục

```
VATCrawlbot/
├── backend/
│   ├── gdt_client.py     # Client kết nối API Tổng cục Thuế
│   ├── main.py           # REST API + phục vụ frontend (FastAPI)
│   └── requirements.txt
├── frontend/
│   └── index.html        # Giao diện 1 trang (đăng nhập, tra cứu, bảng, xuất Excel)
├── KIEN_TRUC_VA_KE_HOACH.md   # Tài liệu kiến trúc & kế hoạch Enterprise
└── README.md
```

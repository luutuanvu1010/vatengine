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
| `GET /exports/:id` | **U7** | Tải file kết xuất (stream từ R2, giới hạn tenant) |

Kết xuất bám mẫu cột chuẩn (`@vat/export`): tiền giữ chuỗi numeric chính xác, ô tiền `xlsx` định dạng `#,##0`; file lớn không giữ nguyên khối trong bộ nhớ Worker (CSV stream thẳng vào R2).

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

# Sổ tay triển khai bằng Claude Code — Prompt + Loop Engineering

*Cách biến bản kiến trúc (KIEN_TRUC_VA_KE_HOACH.md) thành phần mềm hoàn chỉnh bằng Claude Code, theo phương pháp đặc tả → sinh code → kiểm thử → xác minh → tinh chỉnh trong vòng lặp có tiêu chí dừng rõ ràng.*

Phiên bản: 1.0 · Ngày: 11/07/2026

---

> 📌 **Cập nhật (2026-07-11):** Phương pháp Prompt + Loop Engineering và cách chia đơn vị U0–U12 (mục 3) **vẫn nguyên giá trị**. Riêng "Ngăn xếp" và "Lệnh chuẩn" trích ở mục 2 đã đổi sang Cloudflare/TypeScript theo `docs/adr/0001-nen-tang-cloudflare.md` (pytest→Vitest, ruff→Biome, uvicorn→wrangler, Alembic→Drizzle, Celery→Queues/Workflows). Tiêu chí nghiệm thu từng mốc: `docs/CHECKLIST-NGHIEM-THU.md`.

## 0. Nguyên tắc nền

Con người (bạn) và tài liệu này giữ vai trò **kiến trúc sư và người ra đề**; Claude Code giữ vai trò **kỹ sư hiện thực**. Chúng ta không viết code thủ công — chúng ta viết **đặc tả tốt** và **vòng lặp kiểm chứng tốt**, để Claude Code tự sinh, tự chạy, tự sửa cho tới khi đạt tiêu chí nghiệm thu.

Ba trụ cột:

1. **Spec-driven**: mỗi hạng mục có đặc tả rõ đầu vào/đầu ra, ràng buộc, và "định nghĩa hoàn thành" (Definition of Done) đo được.
2. **Test là điều kiện dừng của vòng lặp**: vòng lặp chỉ kết thúc khi bộ kiểm thử tự động xanh, không phải khi "trông có vẻ xong".
3. **Bước nhỏ, kiểm chứng liên tục**: chia thành các lát cắt dọc nhỏ, mỗi lát chạy được và kiểm thử được, tránh sinh khối lượng lớn code không thể xác minh.

---

## 1. Phương pháp "Prompt + Loop Engineering"

### 1.1. Vòng lặp lõi

Mỗi hạng mục công việc được Claude Code thực thi theo vòng lặp:

```
        ┌──────────────────────────────────────────────────────┐
        │  (1) ĐỌC SPEC + BỐI CẢNH   (CLAUDE.md, tài liệu, code)│
        └───────────────┬──────────────────────────────────────┘
                        ▼
        ┌──────────────────────────┐
        │  (2) LẬP KẾ HOẠCH NGẮN    │  ← liệt kê file sẽ đụng, test sẽ viết
        └───────────────┬──────────┘
                        ▼
        ┌──────────────────────────┐
        │  (3) VIẾT TEST TRƯỚC      │  ← test thể hiện tiêu chí nghiệm thu
        └───────────────┬──────────┘
                        ▼
        ┌──────────────────────────┐
        │  (4) SINH / SỬA CODE      │
        └───────────────┬──────────┘
                        ▼
        ┌──────────────────────────┐
        │  (5) CHẠY: lint+test+build│
        └───────────────┬──────────┘
                        ▼
                  ┌─────────────┐   thất bại
                  │ (6) ĐÁNH GIÁ├───────────────┐
                  └──────┬──────┘                │
                    đạt  │                        ▼
                         ▼                 (đọc log lỗi → quay lại (4))
        ┌──────────────────────────┐
        │  (7) TỰ RÀ SOÁT + COMMIT  │  ← self-review theo checklist, commit nhỏ
        └──────────────────────────┘
```

Điểm mấu chốt: bước (5) và (6) được **tự động hóa** — Claude Code chạy lệnh test, đọc output, và tự quyết định lặp lại hay dừng. Đây chính là "loop engineering": ta thiết kế sao cho máy có tín hiệu khách quan (test pass/fail, coverage, lint) để tự hiệu chỉnh mà không cần người can thiệp từng bước.

### 1.2. Định nghĩa hoàn thành (Definition of Done) — áp dụng cho mọi hạng mục

Một hạng mục chỉ được coi là xong khi: có kiểm thử tự động phủ đúng tiêu chí nghiệm thu và toàn bộ xanh; linter/formatter không còn cảnh báo; không giảm độ phủ kiểm thử dưới ngưỡng (đề xuất ≥ 80% cho tầng nghiệp vụ); không lộ bí mật trong code/log; cập nhật tài liệu liên quan; và commit nhỏ, thông điệp rõ ràng.

### 1.3. Chống trôi phạm vi và "ảo giác"

Ràng buộc để giữ Claude Code đi đúng: mỗi vòng lặp chỉ giải quyết một hạng mục; không tạo phụ thuộc mới ngoài danh sách cho phép nếu chưa được duyệt; mọi giả định về API cơ quan thuế phải kiểm chứng bằng contract test (không "đoán" cấu trúc phản hồi); khi gặp mơ hồ, dừng và hỏi thay vì tự quyết định thầm.

---

## 2. Bối cảnh dự án cho Claude Code (đề xuất đưa vào `CLAUDE.md`)

Đặt file `CLAUDE.md` ở gốc repo để Claude Code luôn nạp bối cảnh. Nội dung đề xuất:

> **Dự án**: VATCrawlbot — nền tảng tra cứu/đồng bộ hóa đơn điện tử kết nối trực tiếp API Tổng cục Thuế bằng tài khoản MST hợp pháp của chính doanh nghiệp.
>
> **Phạm vi đạo đức & pháp lý (bắt buộc)**: chỉ truy xuất dữ liệu thuộc thẩm quyền của tài khoản đăng nhập; không lưu mật khẩu thuế dạng thô; không phá vỡ captcha (người dùng nhập); tôn trọng rate limit của máy chủ thuế.
>
> **Ngăn xếp**: Python 3.11, FastAPI, PostgreSQL, SQLAlchemy, Alembic, Celery+Redis (đồng bộ nền), pytest, ruff, mypy. Frontend: SPA (khởi đầu bằng HTML/JS thuần đã có, nâng dần).
>
> **Kiến trúc**: theo KIEN_TRUC_VA_KE_HOACH.md. Cô lập mọi phụ thuộc API thuế trong `gdt_client` (adapter). Khóa tự nhiên hóa đơn: `(tenant_id, nbmst, khmshdon, khhdon, shdon, tdlap)`. Đồng bộ phải idempotent (upsert).
>
> **Quy ước**: TDD — viết test trước; commit nhỏ; không hard-code bí mật; mọi truy vấn dữ liệu gắn `tenant_id`; hàm ra ngoài mạng phải có timeout + retry + backoff.
>
> **Lệnh chuẩn**: `make test` (pytest), `make lint` (ruff+mypy), `make run` (uvicorn), `make migrate` (alembic). Vòng lặp phải chạy các lệnh này để tự kiểm chứng.
>
> **Định nghĩa hoàn thành**: xem mục 1.2 của TRIEN_KHAI_BANG_CLAUDE_CODE.md.

---

## 3. Chia nhỏ công việc thành các "đơn vị vòng lặp"

Mỗi đơn vị đủ nhỏ để chạy trọn một vòng lặp và kiểm thử độc lập. Thứ tự bám theo lộ trình trong bản kiến trúc.

| # | Đơn vị vòng lặp | Kết quả kiểm chứng được |
|---|-----------------|--------------------------|
| U0 | Khung dự án + `make` + CI + skeleton test | `make test` chạy, CI xanh trên repo rỗng |
| U1 | GDT Adapter: captcha + authenticate | Contract test với phản hồi mẫu; xử lý lỗi đăng nhập |
| U2 | GDT Adapter: query purchase/sold + phân trang + gộp sco + khử trùng | Test phân trang nhiều trang, khử trùng theo khóa tự nhiên |
| U3 | GDT Adapter: detail dòng hàng | Test ánh xạ dòng hàng, thuế suất |
| U4 | Mô hình dữ liệu + migration (PostgreSQL) | `make migrate` tạo schema; test ràng buộc khóa tự nhiên |
| U5 | Dịch vụ đồng bộ idempotent (upsert) | Test: đồng bộ 2 lần cùng kỳ không nhân đôi; cập nhật `ttxly` |
| U6 | REST API tra cứu + lọc + tổng hợp | Test API bằng TestClient, mock adapter |
| U7 | Xuất Excel/CSV theo mẫu | Test đọc lại file, đúng cột và định dạng tiền |
| U8 | Auth người dùng nội bộ + RBAC + đa tenant | Test cách ly dữ liệu giữa 2 tenant |
| U9 | Đồng bộ nền theo lịch (Celery) | Test job idempotent, retry khi lỗi tạm |
| U10 | Module đối chiếu (thiếu HĐ, lệch thuế, HĐ hủy/thay thế) | Test theo bộ dữ liệu tình huống |
| U11 | Tích hợp/xuất sang phần mềm kế toán | Test ánh xạ định dạng mục tiêu |
| U12 | Bảo mật: mã hóa bí mật, audit log, rate limit client | Test mã hóa/giải mã, ghi audit, chặn vượt ngưỡng |

Khung tham chiếu đã có (`backend/gdt_client.py`, `backend/main.py`, `frontend/index.html`) tương ứng phần đầu U1–U2–U6–U7 ở mức MVP; Claude Code dùng làm điểm khởi động rồi nâng lên chuẩn có test + lưu trữ bền vững.

---

## 4. Mẫu prompt cho một đơn vị vòng lặp

Dùng chung một khuôn cho mọi đơn vị, thay phần đặc tả. Khuôn này ép Claude Code chạy đúng vòng lặp và tự kiểm chứng.

> **Nhiệm vụ (U_x):** [tên đơn vị].
>
> **Bối cảnh:** đọc `CLAUDE.md`, `KIEN_TRUC_VA_KE_HOACH.md` (mục liên quan), và code hiện có trong [đường dẫn]. Không lặp lại logic đã có; tái sử dụng adapter/model sẵn có.
>
> **Đặc tả:**
> - Đầu vào: […]
> - Đầu ra/hành vi: […]
> - Ràng buộc: […] (ví dụ: idempotent, gắn `tenant_id`, timeout+retry, không lưu mật khẩu thô).
>
> **Tiêu chí nghiệm thu (Definition of Done):**
> - [danh sách hành vi cụ thể, đo được] và có test tương ứng.
>
> **Quy trình bắt buộc:**
> 1. Trình bày kế hoạch ngắn (file sẽ sửa, test sẽ viết) rồi mới code.
> 2. Viết test trước (pytest) thể hiện các tiêu chí trên — kể cả ca lỗi và biên.
> 3. Hiện thực tối thiểu để test xanh.
> 4. Chạy `make lint && make test`. Dán kết quả. Nếu đỏ, tự sửa và lặp lại tối đa N vòng.
> 5. Tự rà soát theo checklist bảo mật (mục 6) và báo cáo thay đổi.
> 6. Commit nhỏ với thông điệp rõ. **Không** chuyển sang nhiệm vụ khác.
>
> **Nếu gặp mơ hồ hoặc cần đoán cấu trúc phản hồi API thuế:** DỪNG và hỏi, kèm phương án đề xuất. Không tự giả định thầm.

### Ví dụ điền cho U5 (Dịch vụ đồng bộ idempotent)

> **Đặc tả:** hàm `sync(tenant_id, direction, date_from, date_to)` gọi adapter lấy hóa đơn, upsert vào bảng `hoa_don` theo khóa tự nhiên, ghi một bản ghi `lan_dong_bo`.
> **Tiêu chí nghiệm thu:** (a) chạy `sync` hai lần cùng tham số → số bản ghi hóa đơn không tăng lần hai; (b) nếu `ttxly` của một hóa đơn đổi giữa hai lần → bản ghi được cập nhật, không tạo mới; (c) `lan_dong_bo` ghi đúng `so_hd_moi`/`so_hd_cap_nhat`; (d) lỗi mạng tạm thời được retry, lỗi 401 dừng và báo hết hạn token. Mỗi ý (a)–(d) có ít nhất một test.

---

## 5. Vòng lặp cấp cao (điều phối nhiều đơn vị)

Ngoài vòng lặp trong từng đơn vị, có một vòng lặp điều phối:

Bắt đầu mỗi phiên, Claude Code đọc trạng thái (đơn vị nào đã xong, test tổng thể có xanh không) → chọn đơn vị tiếp theo theo phụ thuộc → chạy vòng lặp đơn vị → khi xong, chạy **toàn bộ** bộ test hồi quy để đảm bảo không phá vỡ phần cũ → cập nhật nhật ký tiến độ → sang đơn vị kế tiếp. Điều kiện dừng của vòng điều phối: tất cả đơn vị U0–U12 đạt Definition of Done và test hồi quy xanh.

Cơ chế "tín hiệu khách quan" cho vòng điều phối gồm: kết quả CI, độ phủ kiểm thử, số cảnh báo lint/mypy, và (quan trọng nhất với dự án này) **contract test định kỳ với API thuế** để phát hiện khi phía cơ quan thuế thay đổi.

---

## 6. Checklist tự rà soát (Claude Code chạy cuối mỗi đơn vị)

Về bảo mật: không có bí mật/mật khẩu/token trong code hay log; dữ liệu nhạy cảm được mã hóa khi lưu; mọi truy vấn gắn `tenant_id`; lệnh gọi mạng có timeout, retry, backoff và tôn trọng rate limit. Về chất lượng: test phủ ca thường, ca lỗi và ca biên; không giảm độ phủ; lint/mypy sạch; không trùng lặp logic; tên hàm/biến rõ nghĩa. Về nghiệp vụ: idempotent nếu là thao tác đồng bộ; xử lý đúng hóa đơn hủy/thay thế; giữ `raw_json` để đối chiếu. Về tài liệu: cập nhật README/tài liệu khi hành vi thay đổi.

---

## 7. Xử lý điểm rủi ro nhất bằng vòng lặp riêng

Vì hệ thống phụ thuộc API không chính thức của cơ quan thuế, cần một vòng lặp giám sát tách biệt: một bộ **contract test** chạy theo lịch (ví dụ hằng ngày) gọi thử luồng captcha–authenticate–query trên tài khoản kiểm thử, so sánh cấu trúc phản hồi với lược đồ kỳ vọng. Khi phát hiện sai khác, hệ thống cảnh báo và tạo một nhiệm vụ vòng lặp mới cho Claude Code để cập nhật adapter. Đây là cách biến rủi ro bảo trì thành một quy trình tự phát hiện – tự sửa có kiểm soát của con người.

---

## 8. Tổng kết cách phối hợp

Bạn giữ quyền quyết định kiến trúc và nghiệm thu; tài liệu kiến trúc là nguồn chân lý về "làm gì"; sổ tay này là nguồn chân lý về "làm thế nào cho Claude Code". Mỗi hạng mục đi qua vòng lặp đặc tả → test trước → sinh code → chạy kiểm chứng → tinh chỉnh → rà soát → commit, với test tự động làm điều kiện dừng khách quan. Nhờ đó phần mềm được xây dựng tăng dần, luôn ở trạng thái chạy được và kiểm thử được, đúng chuẩn để lưu trữ, bảo trì, mở rộng và thương mại hóa về sau.

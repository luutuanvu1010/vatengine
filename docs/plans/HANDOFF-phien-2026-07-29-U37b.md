# Bàn giao phiên 2026-07-29 → phiên sau — U37b làm tới Gói 4a, tiếp theo là 4b

> **Câu lệnh gọi ở phiên sau:** *"làm tiếp U37b Gói 4b"* → đọc file này, rồi
> `docs/plans/U37b-plan.md` §4 (Gói 4) và `docs/plans/U37b-prompt-dieu-phoi.md`.
> **KHÔNG cần đọc lại** hồ sơ U37 hay bàn giao U37a — thứ cần biết đã gom ở đây.

| | |
|---|---|
| **Đơn vị** | U37b — phát hành gói hóa đơn gốc cho MỘT khách hàng, chia sẻ qua link công khai |
| **Trạng thái** | Gói 0, 1, 2, 3, 4a **XONG và đã push**. Hạ tầng đã dựng và kiểm chứng. Tiếp theo: **Gói 4b** |
| **Spec chốt** | `docs/plans/U37b-plan.md` (QA1 duyệt 2026-07-29, 11 quyết định QĐ-B1…QĐ-B11) |
| **Điều phối** | `docs/plans/U37b-prompt-dieu-phoi.md` — vòng lặp từng gói + 2 cổng dừng (cả hai ĐÃ QUA) |

---

## 1. Nhắc lại phạm vi — hẹp hơn nhiều so với bản nháp đầu

Nhu cầu thật: **"khách tải hóa đơn đã xuất cho MỘT khách hàng cụ thể trong tháng"**.

- **Chỉ chiều BÁN RA.** Mua vào ngoài phạm vi.
- **Bắt buộc chọn một khách hàng doanh nghiệp**; MST hoặc tên trống ⇒ chặn nút.
- Nút mở khi đã **CHỌN** từ danh sách, **không** phải khi ô tìm có chữ.
- Kỳ + khách hàng **dùng chung bộ lọc** trang Danh sách hóa đơn.

**Quy mô thật (đo production):** một lần xuất lớn nhất **56 hóa đơn**, trung bình **6,6**
⇒ 28 giây / ~3 giây ở nhịp 2 req/s. Ngân sách hàng đợi là 30 phút ⇒ **không có vấn đề quy
mô nào**. Mọi ý tưởng tối ưu hàng đợi / cron tải sẵn ban đêm / chặn trần đều **KHÔNG cần**,
miễn giữ ràng buộc "bắt buộc chọn khách hàng".

Phục vụ 167 khách hàng doanh nghiệp / 1.957 hóa đơn (17% hóa đơn bán ra có MST người mua;
83% còn lại là khách lẻ dùng CCCD — ngoài phạm vi theo đúng thiết kế).

## 2. Đã làm xong những gì

| Gói | Commit | Nội dung |
|---|---|---|
| 0 | `b5f8e35` | `GET /invoices/khach-hang` — danh sách khách hàng gộp theo MST |
| 1 | `9cfa5cf`, `0a3df43` | Primitive `ComboBox` + `boDau`/`khopTim` + `ChonKhachHang` + đấu vào `FilterBar` |
| 2 | `3bd87f4` | Bảng `goi_chia_se` + migration `0020` — **đã áp production**, hậu kiểm 8/8 |
| 3 | `20cee3f`, `707a1c2` | Bucket `vat-chia-se` + `docs.tourdao.vn` + lifecycle 30 ngày + `r2.dev` disabled |
| 4a | `d82802e` | `listHoaDonChoGoi` + `demTienDoGoi` |

**Hạ tầng đã dựng và KIỂM CHỨNG THẬT (2026-07-29):**
- Bucket `vat-chia-se`, tên miền `docs.tourdao.vn` (`ssl_status: active`, min-TLS 1.2).
- `r2.dev` **disabled** — đã kiểm, không chỉ đọc tài liệu.
- Lifecycle `het-han-30-ngay`, prefix `goi-hoa-don/`, 30 ngày.
- **Gốc bucket và khóa không tồn tại đều trả HTTP 404** ⇒ không liệt kê được nội dung.
  Đây là bằng chứng cho giả định an toàn cốt lõi: *khóa ngẫu nhiên là thứ DUY NHẤT bảo vệ file*.
- Binding `CHIA_SE` đã khai trong `apps/api/wrangler.jsonc` + `Env`. **`vat-api` CHƯA deploy**
  — binding chỉ có hiệu lực sau deploy, để Gói 4 xong rồi deploy một lượt.

## 3. Gói 4b — việc tiếp theo

Spec: `U37b-plan.md` §4 Gói 4. Tóm tắt phần còn lại của Gói 4:

**4b — endpoint tạo gói:**
- Nhận `nmmst` + `tuNgay` + `denNgay`. **QĐ-B9: thiếu ngày ⇒ CHẶN**, không mặc định "tất cả".
- Gọi `listHoaDonChoGoi` (Gói 4a) để lấy danh sách + dựng `ref`. 🔴 **TUYỆT ĐỐI không nhận
  `ref` từ client** — xem §4 dưới.
- Enqueue `kind:"hoso"` bằng `buildHoSoGocMessages` (`@vat/sync`). Hóa đơn đã có trong kho
  thì `daCo` ở worker tự chặn, không tốn request GDT.
- Tạo hàng `goi_chia_se` trạng thái `dang_tao`.
- Kiểm quyền tenant **tại thời điểm tạo** — file công khai nằm ngoài RLS/JWT, sau đó không
  còn cửa nào chặn.

**4c — đóng gói + phát link:**
- QĐ-B7: **`vat-api` đóng gói** (không phải sync-worker). Client hỏi lại, thấy đủ thì dựng.
- QĐ-B8: tiến độ đếm bằng `demTienDoGoi` (Gói 4a).
- ZIP **PHẲNG**, tài nguyên tĩnh dùng chung MỘT bộ (đọc từ `hoadon-goc/_chung/`):
  ```
  details.js  viewinvoice-bg.jpg  sign-check.jpg
  <khhdon>-<shdon>.html   <khhdon>-<shdon>.xml
  bao-cao.txt
  ```
  `invoice.html` tham chiếu 3 tài nguyên bằng **tên phẳng không tiền tố** ⇒ đặt phẳng là chạy
  đúng **mà không phải sửa một ký tự nào** trong HTML.
- ⚠️ Hai hóa đơn khác `nbmst` vẫn có thể trùng `<khhdon>-<shdon>` — `zipStream.ts` có
  `uniqueName` thêm hậu tố, **phải kiểm lại tên sinh ra vẫn ghép đúng cặp `.xml`/`.html`**.
- **Không** đi qua `apps/api/src/storage.ts` (helper đó đọc trọn file vào RAM).
- Khóa R2: `goi-hoa-don/<YYYY-MM>/<token ngẫu nhiên ≥128-bit base32url>.zip`. **Tuyệt đối
  không** nhúng MST/tên doanh nghiệp/khoảng ngày. Tên file thân thiện đặt qua
  `contentDisposition` (QĐ-B10) — tên khách vào TÊN FILE thì được, vào KHÓA thì không.
- Cổng kiểm: đối chiếu **số lượng**; hóa đơn GDT từ chối → `bao-cao.txt`; **0 hóa đơn thành
  công ⇒ KHÔNG phát hành link**.

## 4. 🔴 Ràng buộc bảo mật quan trọng nhất — đọc trước khi viết Gói 4b

`runHoSoGocJob` (U37a) **tin thẳng `msg.ref`**, không tra lại `hoa_don` theo `tenantId`
(phát hiện ở review bảo mật U37a). Vì vậy:

> `ref` **CHỈ** được dựng từ `listHoaDonChoGoi` — hàm đã lọc `tenant_id` của phiên.
> **KHÔNG BAO GIỜ** nhận `ref`, `hoaDonId` hay `nbmst/khhdon/khmshdon/shdon` từ body request.

Lưới an toàn cuối: FK ghép `(tenant_id, hoa_don_id)` trên `tep_hoa_don_goc` làm vỡ insert nếu
sai tenant — nhưng đó là lưới, không thay cho việc dựng đúng.

## 5. Cạm bẫy đã đụng trong phiên này — sẽ đụng lại

### 5.1 🔴 `_journal.json` mốc `when` ở TƯƠNG LAI — đã nổ một lần, còn nguyên

`idx 15..20` mang mốc **02/08/2026**. Migration sinh mới trước mốc đó có `when` **nhỏ hơn**
⇒ `drizzle-kit migrate` in `[✓] migrations applied successfully!` mà **KHÔNG áp gì**.

Đã cắn thật ở Gói 2 (`0020` sinh ra với mốc 29/07). Cách né: đặt
`when = <mục trước>.when + 60000`, rồi **luôn** hậu kiểm bằng
`node scripts/hau-kiem-bang.mjs <tên bảng>`. Còn hiệu lực tới khi thời gian thật vượt 02/08.

### 5.2 `drizzle-kit` KHÔNG sinh `FORCE RLS` lẫn `GRANT`

Cả hai viết tay trong migration. Khuôn: `0020_u37b_goi_chia_se.sql`. Dự án đã quên `GRANT`
**hai lần**, cả hai chỉ lộ ở production.

### 5.3 `curl` báo không tra được tên miền dù `dig` ra IP

Bộ đệm **ÂM** của `mDNSResponder` trên macOS, `dig` không đi qua. Mất vài lần thử mới ra —
đừng nghi hạ tầng hỏng. Cách vượt:
```
IP=$(dig @1.1.1.1 +short docs.tourdao.vn | head -1)
curl --resolve "docs.tourdao.vn:443:$IP" https://docs.tourdao.vn/
```

### 5.4 Đừng khẳng định "thứ này CHƯA CÓ" khi mới đọc một nguồn

Phiên này sai **hai lần** cùng một kiểu:
- "trang chưa lọc được theo MST" — suy từ Registry (`nmmst` không khai `locDuoc`) mà **không
  mở `FilterBar`**; thực tế ô lọc đã có sẵn và có test canh.
- "hóa đơn thiếu tên" — đọc `count(DISTINCT nmten) = 0` mà quên hàm đó **bỏ qua NULL**.

Trước khi khẳng định một thứ chưa tồn tại, **grep/đọc chính file hiện thực**.

### 5.5 Đừng chạy `make test` nhiều lần trong một dòng lệnh

Mỗi lần vài phút. Chạy **một lần**, ghi ra file, rồi `grep` file đó.

## 6. Nợ đã ghi, chưa làm

- **`deps.ts` của sync-worker chưa từng có test** — `makeHoSoGocJobDeps` là hàm `deps` đầu
  tiên mang logic có thể sai thật. Gợi ý: R2 giả sẵn có ở `apps/api/test/helpers.ts`.
  *(backlog `[2026-07-28]`)*
- **`_journal.json` lệch `idx 5`** — chưa rõ CLI có bỏ qua `0005` trên DB dựng mới/DR không.
  ORM migrator thì KHÔNG bỏ qua (đã kiểm). *(backlog)*
- **Drift Registry↔FilterBar**: `nbmst`/`nmmst` render tay, không dẫn xuất Registry (lệch
  `ui.md:18`). Có lý do chính đáng (hiện/ẩn phụ thuộc `chieu`) — sửa cho hết lệch thì phải
  mở rộng Registry, lạc phạm vi U37b. *(ghi ở `U37b-plan.md` §4 Gói 1 mục 8)*
- **`FilterBar` từ nay CẦN `QueryClientProvider`** — mọi nơi dùng về sau phải nằm trong
  provider. Hiện chỉ `InvoicesPage` dùng, đã có provider ở gốc.
- **ARIA của `ComboBox`**: dùng `<ul>/<li>` + `<button>` thay `role="listbox"/"option"`, vì
  mẫu ARIA xung đột với 5 quy tắc a11y của Biome (chúng giả định `<select>`). Đã chọn KHÔNG
  tắt quy tắc trong primitive dùng chung. *(ghi ở `U37b-plan.md` §4 Gói 1)*
- **`fetchWithRetry` nhánh lỗi MẠNG dùng `sleep` thật**, bỏ qua `opts.sleepFn` tiêm được.
  Lỗi có sẵn, cố ý không sửa vì lạc phạm vi. Chưa ghi backlog.
- **Hạn mức 10 lượt tải/tháng** — link công khai là một dạng "lượt tải" cần đếm.
  *(backlog `[2026-07-16]`)*

## 7. Nghiệm thu U37b khi xong (từ `U37b-plan.md` §5)

1. `make lint && make test` xanh; coverage không tụt dưới 80%.
2. Test cách ly tenant cho `goi_chia_se`. ✅ đã có ở Gói 2.
3. `node scripts/hau-kiem-bang.mjs goi_chia_se` đạt. ✅ đã chạy, 8/8.
4. Test: chưa chọn khách hàng ⇒ nút không bấm được; ô tìm có chữ nhưng chưa chọn ⇒ vẫn không
   bấm được. *(phần ô tìm đã có ở Gói 1; phần nút thuộc Gói 6)*
5. Test: gói ZIP có đúng `2×N + 3 + 1` mục và **một** bộ tài nguyên tĩnh.
6. Test: 0 hóa đơn thành công ⇒ không phát hành link.
7. **Nghiệm thu thật:** chọn khách hàng có hóa đơn → bấm xuất → mở link ở cửa sổ ẩn danh
   (không đăng nhập) tải được → giải nén, **mở `invoice.html` bằng trình duyệt thấy đúng tờ
   hóa đơn** → đối chiếu số hóa đơn/MST/tổng tiền → thu hồi → link trả 404.
8. Lifecycle đúng một rule 30 ngày theo prefix; `r2.dev` tắt. ✅ đã kiểm ở Gói 3.
9. Review chéo: `dod-auditor` **+ `security-reviewer`**.

## 8. Trạng thái triển khai

- Nhánh `feat/cloudflare-stack-u0`, tất cả đã push (`cca7da7`).
- Migration `0020` **đã ở production**.
- `vat-api` **CHƯA deploy** — binding `CHIA_SE` chưa có hiệu lực. Deploy sau khi Gói 4 xong,
  đúng thứ tự `deploy.md` (DB → worker → api → web).
- `vat-sync-worker` đã deploy từ phiên trước (`e7a641fc`), có binding `RAW`.

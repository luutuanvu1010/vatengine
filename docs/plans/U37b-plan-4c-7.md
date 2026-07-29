# U37b — Kế hoạch chi tiết phần còn lại: Gói 4c → 7

> **Trạng thái:** 🟡 **CHỜ DUYỆT (QA1).** Có **4 điểm cần chốt ở §6** trước khi code.
>
> Bổ sung cho `docs/plans/U37b-plan.md` (§2 — 11 quyết định QĐ-B1…QĐ-B11 vẫn nguyên hiệu lực).
> Gói 0, 1, 2, 3, 4a, 4b đã xong và đã push. Tài liệu này gộp **toàn bộ phần còn lại** thành
> một kế hoạch liền mạch thay vì bốn vòng lặp rời — vì 4c/5/6 khớp nối chặt với nhau
> (đóng gói ⇄ phát link ⇄ thu hồi ⇄ giao diện) và tách ra sẽ phải sửa lại nhau.

---

## 1. Đang có gì trong tay

| | |
|---|---|
| `POST /goi-chia-se` | Tạo hàng `goi_chia_se` trạng thái `dang_tao`, enqueue một message `hoso`/hóa đơn |
| `listHoaDonChoGoi` | Nguồn DUY NHẤT sinh `ref`, đã lọc `tenant_id` |
| `demTienDoGoi` | Đếm xong / không-có-hồ-sơ-gốc / lỗi / còn chờ từ `tep_hoa_don_goc` |
| Kho hồ sơ gốc | `vat-raw`: `hoadon-goc/<tenant>/<hoaDonId>.{xml,html}` + `hoadon-goc/_chung/` (3 tệp tĩnh) |
| Bucket công khai | `vat-chia-se` + `docs.tourdao.vn`, lifecycle 30 ngày prefix `goi-hoa-don/`, `r2.dev` tắt |
| Binding | `CHIA_SE` đã khai trong `apps/api` — **`vat-api` CHƯA deploy** |

## 2. Hai phát hiện làm đổi thiết kế (đo 2026-07-29)

**(a) `fflate` chỉ là devDependency của `apps/api`.** Mã sản phẩm chưa dùng được ⇒ Gói 4c
phải nâng nó thành `dependencies` (đã là phụ thuộc được duyệt của dự án, dùng ở
`packages/export` và `packages/sync`).

**(b) KHÔNG tái dùng được `zipStream.ts` cho cặp tệp.** `uniqueName(stem, ext, used)` khóa
theo **`stem`**, nên gọi hai lần cho cùng `<khhdon>-<shdon>`:

```
uniqueName("C26TQO-13580", "xml",  used) → "C26TQO-13580.xml"
uniqueName("C26TQO-13580", "html", used) → "C26TQO-13580-1.html"   ← VỠ CẶP
```

Người nhận mở `C26TQO-13580-1.html` sẽ không hiểu nó thuộc hóa đơn nào. ⇒ Gói 4c **tự dựng
bản đồ entry** với chiến lược chống trùng giữ nguyên cặp (xem §3.2).

---

## 3. Gói 4c — Đóng gói và phát hành link

### 3.1 Ai kích hoạt, và chống đóng gói hai lần

- `GET /goi-chia-se/:id` **THUẦN ĐỌC**: trả trạng thái + tiến độ (`demTienDoGoi` trên danh
  sách dựng lại từ `nmmst`/`tuNgay`/`denNgay` đã lưu — tất định, không cần lưu danh sách id).
- `POST /goi-chia-se/:id/dong-goi` **mới thực sự đóng gói**. Tách ra thay vì để GET tự làm:
  một `GET` gây tác dụng phụ là bẫy kinh điển (trình duyệt/proxy prefetch có thể kích hoạt).
- **Bầu người đóng gói bằng UPDATE có điều kiện** — hai lần bấm/hai tab cùng lúc sẽ cùng
  thấy "đã đủ" và cùng đóng gói:

  ```sql
  UPDATE goi_chia_se SET trang_thai = 'dang_dong_goi'
   WHERE id = ? AND tenant_id = ? AND trang_thai = 'dang_tao'
  RETURNING id
  ```

  0 hàng trả về ⇒ người khác đang đóng hoặc đã xong ⇒ trả trạng thái hiện tại, **không** đóng
  lần hai. Thêm `dang_dong_goi` vào `TRANG_THAI_GOI_CHIA_SE` (mảng hằng trong schema —
  **không cần migration**, cột là `text`).
- Còn `conCho > 0` ⇒ 409 `chua_du`, kèm tiến độ.
- `xong === 0` (không hóa đơn nào tải được) ⇒ `trang_thai='loi'`, `ma_loi='khong_tai_duoc_hoa_don_nao'`,
  **KHÔNG phát hành link** (yêu cầu gốc số 3).

### 3.2 Cấu trúc gói và chống trùng tên

```
details.js  viewinvoice-bg.jpg  sign-check.jpg     ← MỘT bộ, đọc từ hoadon-goc/_chung/
C26TQO-13580.xml   C26TQO-13580.html
C26TQO-13581.xml   C26TQO-13581.html
bao-cao.txt
```

`invoice.html` tham chiếu 3 tệp tĩnh bằng **tên phẳng không tiền tố** ⇒ đặt phẳng là chạy
đúng, **không sửa một ký tự nào** trong HTML.

**Chống trùng giữ nguyên cặp:** khóa gốc `<khhdon>-<shdon>`. Nếu đã dùng, đổi **cả cặp**
sang `<nbmst>-<khhdon>-<shdon>` (tất định, không phải `-1`, `-2`). Vẫn trùng nữa thì thêm
`-<6 ký tự đầu của hoaDonId>`. Test phải dựng đúng ca hai hóa đơn khác `nbmst` cùng
`khhdon`+`shdon`.

**`bao-cao.txt`** — liệt kê hóa đơn KHÔNG có trong gói và lý do:
```
Gói hóa đơn — CÔNG TY TNHH ABC (MST 0312000001)
Kỳ: 01/07/2026 – 31/07/2026
Tổng hóa đơn trong kỳ: 12 | Có trong gói: 10

KHÔNG có trong gói (2):
  C26TQO-13590 — Cơ quan thuế không có hồ sơ gốc của hóa đơn này
  C26TQO-13591 — Tải thất bại (HTTP_ERROR)
```

### 3.3 Ghi bucket công khai

- Đọc từng object từ `env.RAW` (`.arrayBuffer()`), gom bằng `fflate.zipSync`, ghi
  `env.CHIA_SE.put(khoaR2, bytes, { httpMetadata: { contentDisposition } })`.
- **Không** đi qua `apps/api/src/storage.ts` (helper đó bọc riêng binding `RAW`).
- **Trần bộ nhớ:** quy mô đo thật lớn nhất 56 hóa đơn × ~42 KB + 275 KB tệp tĩnh ≈ **2,6 MB**
  — gom trong RAM là an toàn. Ghi rõ con số này trong mã: nếu phạm vi mở rộng (bỏ ràng buộc
  "một khách hàng"), phải xem lại chỗ này trước tiên.
- `contentDisposition`: `attachment; filename="hoa-don-<khách>-<tuNgay>-<denNgay>.zip"`
  (QĐ-B10). **Tên khách lấy từ `hoa_don.nmten`** của chính các hóa đơn trong gói — `goi_chia_se`
  không lưu tên, và derive thì khỏi phải thêm cột/migration. Rút gọn + bỏ dấu + chỉ giữ
  `[a-z0-9-]` để tên tệp an toàn trên mọi hệ điều hành.
  ⚠️ Tên khách vào **tên tệp tải về** thì được; vào **khóa R2** thì TUYỆT ĐỐI KHÔNG.
- Xong: `trang_thai='san_sang'`, `kich_thuoc`, và **đặt lại `het_han_luc = now + 30 ngày`**
  (xem §6 điểm 2).

## 4. Gói 5 — Thu hồi + audit + danh sách

- `POST /goi-chia-se/:id/thu-hoi` → `env.CHIA_SE.delete(khoaR2)` rồi `trang_thai='da_thu_hoi'`.
  Xóa R2 **trước**, đổi trạng thái **sau**: ngược lại thì sổ nói đã thu hồi trong khi file
  vẫn tải được — sai theo hướng nguy hiểm.
  Thu hồi lại lần hai ⇒ 200 (idempotent), không lỗi.
- `GET /goi-chia-se` → danh sách gói của tenant (mới nhất trước) để giao diện hiện + thu hồi.
- **`audit_log`** cho **cả hai** hành động, `chiTiet` qua `maskSensitive()`, ghi trong
  `withTenant` như mọi call-site hiện có:
  - `phat_hanh_goi_chia_se` — ghi ở 4c lúc chuyển `san_sang`;
  - `thu_hoi_goi_chia_se`.
  `chiTiet` chứa `{ goiId, nmmst, tuNgay, denNgay, soHoaDon }` — **không** chứa `khoa_r2`:
  audit log đọc được bởi nhiều người trong tenant, mà khóa là mật khẩu của file.

## 5. Gói 6 — Giao diện · Gói 7 — Tài liệu & nghiệm thu

**Gói 6** — nút trong `hanhDongPhu` của `FilterBar` (`InvoicesPage.tsx:130-150`):

- **Ba vế mở nút** (QĐ-B4 + B1 + B9), thiếu vế nào báo **đúng lý do vế đó**:
  | Thiếu | Thông báo |
  |---|---|
  | Chưa chọn khách hàng | "Chọn một khách hàng để tải hóa đơn đã xuất cho họ" |
  | Chiều đang là Mua vào | "Chỉ tải được hóa đơn bán ra" |
  | Thiếu khoảng ngày | "Chọn khoảng thời gian" |
- Khối cảnh báo **inline** + checkbox xác nhận (QĐ-B11 + QĐ-7) trước khi phát link.
- Sau khi tạo: poll `GET /goi-chia-se/:id` (React Query `refetchInterval` khi `dang_tao`),
  đủ thì gọi `POST …/dong-goi`, hiện link + nút sao chép + nút **thu hồi**.
- Bốn trạng thái; nhãn khai trong Registry, không gõ chuỗi rời.

**Gói 7:**
- `docs/06-BINDING_MAP.md` — cập nhật **TỪ MÃ** (đọc mã rồi ghi, không chép từ kế hoạch).
- Cập nhật hồ sơ U37 + `U37b-tien-do.md`.
- **Deploy `vat-api`** (binding `CHIA_SE` mới có hiệu lực) — DB đã migrate từ Gói 2, đúng
  thứ tự `deploy.md`.
- **Nghiệm thu thật** (§5 tiêu chí 7 của kế hoạch chính): chọn khách hàng có hóa đơn → xuất →
  mở link ở cửa sổ ẩn danh tải được → giải nén, **mở `invoice.html` bằng trình duyệt thấy
  đúng tờ hóa đơn** → đối chiếu số hóa đơn/MST/tổng tiền → thu hồi → link trả 404.

---

## 6. BỐN ĐIỂM CẦN CHỐT trước khi code

1. **`POST /:id/dong-goi` riêng, hay để `GET /:id` tự đóng gói?**
   QĐ-B7 nói *"client hỏi lại và thấy đã đủ"* — đọc theo nghĩa GET tự làm. Nhưng GET gây tác
   dụng phụ là bẫy: prefetch của trình duyệt/proxy có thể kích hoạt đóng gói ngoài ý muốn.
   **Đề xuất: tách POST**, GET giữ thuần đọc.

2. **`het_han_luc` tính từ lúc TẠO hay lúc PHÁT HÀNH?**
   Hiện đặt ở `POST /goi-chia-se` (lúc tạo), nhưng lifecycle của R2 đếm từ lúc **ghi object**
   (lúc 4c). Nếu tải hồ sơ mất một giờ thì sổ nói hết hạn sớm hơn thực tế một giờ.
   **Đề xuất: đặt lại `het_han_luc` ở bước phát hành**, để sổ khớp vòng đời thật của file.

3. **Bấm "Xuất" lần nữa cho cùng khách hàng + cùng kỳ thì sao?**
   Hiện tạo gói MỚI với khóa mới; gói cũ vẫn sống tới 30 ngày. Ba lựa chọn:
   (a) cứ tạo mới, chấp nhận nhiều link song song *(đơn giản nhất)*;
   (b) tái dùng gói `san_sang` còn hạn cùng phạm vi;
   (c) tự thu hồi gói cũ khi phát gói mới.
   **Đề xuất (a)**, và giao diện hiện danh sách gói đã phát để người dùng tự thu hồi — vì
   người dùng có thể CỐ Ý phát hai link cho hai người nhận khác nhau.

4. **Ai được thu hồi?** Hiện `POST` giới hạn `ke_toan_truong`+`quan_tri`.
   **Đề xuất: thu hồi cũng cùng mức** — nhưng cân nhắc cho phép **mọi vai** thu hồi, vì thu
   hồi là hành động **giảm** rủi ro; chặn người phát hiện lộ dữ liệu lại là hại.

---

## 7. Thứ tự thực thi + test viết trước

| Bước | Nội dung | Test trước (nhóm) |
|---|---|---|
| 4c-1 | Nâng `fflate` lên `dependencies` của `apps/api`; hàm thuần `dungGoiZip(...)` | unit: cấu trúc phẳng, MỘT bộ tệp tĩnh, chống trùng giữ NGUYÊN CẶP, `bao-cao.txt` |
| 4c-2 | `GET /goi-chia-se/:id` (thuần đọc, tiến độ) | integration: `dang_tao`+tiến độ, cách ly tenant, 404 |
| 4c-3 | `POST /goi-chia-se/:id/dong-goi` | integration: chưa đủ ⇒ 409; đóng hai lần ⇒ chỉ một; `xong=0` ⇒ `loi`, KHÔNG phát link; ghi đúng bucket `CHIA_SE` |
| 5 | thu hồi + `GET /goi-chia-se` + audit | integration: thu hồi xóa R2 rồi mới đổi trạng thái; idempotent; audit ghi đủ 2 hành động; `chiTiet` KHÔNG chứa `khoa_r2`; cách ly tenant |
| 6 | Giao diện | unit/RTL: ba vế mở nút báo đúng lý do từng vế; checkbox xác nhận; 4 trạng thái |
| 7 | Tài liệu + deploy + nghiệm thu thật | — |

**Cổng chung mỗi bước:** `make lint && make test` xanh, không tụt coverage.
**Review cuối:** `dod-auditor` **+ `security-reviewer`** (bắt buộc — phát hành link công khai,
NĐ 13/2023).

## 8. Rủi ro còn lại

| Rủi ro | Xử lý |
|---|---|
| Đóng gói hai lần đồng thời | UPDATE có điều kiện bầu người đóng (§3.1) |
| Trùng tên trong ZIP làm vỡ cặp `.xml`/`.html` | Tự dựng bản đồ entry, đổi cả cặp (§3.2) — KHÔNG dùng `uniqueName` của `zipStream.ts` |
| Gom cả gói trong RAM | Đo thật: ~2,6 MB ở quy mô lớn nhất. Ghi trần vào mã, xem lại nếu bỏ ràng buộc "một khách hàng" |
| Khóa R2 rò qua audit log | `chiTiet` không chứa `khoa_r2` |
| Sổ nói đã thu hồi mà file vẫn tải được | Xóa R2 TRƯỚC, đổi trạng thái SAU |

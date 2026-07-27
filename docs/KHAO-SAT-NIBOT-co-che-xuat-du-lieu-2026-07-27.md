# Khảo sát NIBOT — cơ chế "xuất dữ liệu tức thì & chính xác" (quan sát debug)

> Ngày: 2026-07-27 · Phương pháp: quan sát **lưu lượng mạng** phiên đăng nhập hợp lệ của
> chính doanh nghiệp (TOUR ĐẢO, MST 4201969169) tại `nibot6.com:3939` bằng Chrome extension.
> Mục đích: học **cơ chế** (kiến trúc, thời gian phản hồi), KHÔNG dịch ngược mã, KHÔNG sao chép.
>
> **Lưu ý ranh giới:** đây là bước đi sâu hơn bản `KHAO_SAT_TINH_NANG_NIBOT.md` (vốn chủ ý
> *không* mổ lưu lượng mạng). Ở đây chỉ đọc request trong trình duyệt của chính chủ tài khoản,
> trên dữ liệu của chính doanh nghiệp — hợp lệ theo Hiến pháp (dữ liệu thuộc thẩm quyền).

## 1. Câu hỏi cần trả lời

Vì sao NIBOT **xuất dữ liệu gần như tức thì và chính xác** ngay sau khi đăng nhập, và ta đã
làm được tới đâu?

## 2. Bằng chứng thu được (đã kiểm chứng)

**2.1 Danh sách hóa đơn nạp từ KHO RIÊNG của NIBOT, không gọi thẳng thuế.**
Khi mở màn Quản lý hóa đơn, dữ liệu về qua **một endpoint nội bộ**: `POST /QLHD/TraCuu`
(HTTP 200) trên `nibot6.com:3939`. Không có request nào tới `hoadondientu.gdt.gov.vn` trong
lúc mở danh sách. ⇒ Hóa đơn đã được **đồng bộ sẵn vào cơ sở dữ liệu riêng** của NIBOT; màn
tra cứu chỉ đọc từ kho đó nên hiện tức thì.

**2.2 Bộ công cụ xuất file nạp sẵn ở phía trình duyệt.**
Trang tải sẵn: `exceljs.min.js` (dựng Excel), `jszip.js` (nén ZIP), `FileSaver.min.js`
(kích hoạt tải về), `pako.min.js` (nén), và lưới dữ liệu thương mại **DevExtreme**
(`dx.all.js`). ⇒ NIBOT có khả năng dựng file xlsx/zip **ngay trong trình duyệt** từ dữ liệu
đã nạp lên lưới, không nhất thiết chờ máy chủ dựng file.

**2.3 Xuất Excel = TẢI DỮ LIỆU TỪ KHO RIÊNG + DỰNG FILE Ở TRÌNH DUYỆT (đã kiểm chứng).**
Khi bấm *Kết xuất → EXCEL.XLSX*, NIBOT hiện spinner
**"Nibot đang kiểm tra tính hợp lệ của hóa đơn để kết xuất dữ liệu."** Đo bằng Performance API
theo mốc thời gian thực (27/07/2026): sau lần bấm chỉ phát sinh **đúng 2 request, cả hai đều là
`/QLHD/TraCuu`** (816ms và 1.811ms). Cụ thể:
- **KHÔNG** có endpoint "xuất file" riêng; **KHÔNG** có request "kiểm tra hợp lệ" riêng;
  **KHÔNG** chạm `hoadondientu.gdt.gov.vn`; **KHÔNG** có request tải file về.
- ⇒ Cơ chế: bấm xuất → **gọi lại chính endpoint tra cứu của kho riêng** để lấy đủ dữ liệu
  (~1–2 giây), rồi **dựng file xlsx ngay trong trình duyệt** (ExcelJS/JSZip) và lưu bằng
  FileSaver (blob nội bộ, không có request mạng). Bước "kiểm tra hợp lệ" là **logic
  JavaScript phía client** trên dữ liệu vừa lấy, không phải một lượt gọi máy chủ riêng.

> **Đã kiểm chứng, tái lập được:** đặt `window.__base = performance.now()` → người dùng bấm
> xuất → đọc `performance.getEntriesByType('resource')` lọc `startTime >= __base`. Kết quả:
> 2×`/QLHD/TraCuu`, không endpoint nào khác. (Công cụ đọc-network của extension bị reset liên
> tục trên trang nặng ~21k dòng; Performance API là đường đo ổn định thay thế.)

## 3. Đối chiếu với VATCrawlbot (có bằng chứng từ mã của ta)

| Khía cạnh | NIBOT (quan sát) | VATCrawlbot (mã hiện tại) | Khoảng cách |
|---|---|---|---|
| Đọc danh sách | Từ kho riêng (`/QLHD/TraCuu`), không gọi thuế | `listInvoices` — *"Chỉ ĐỌC — không gọi GDT"*, đọc từ Postgres | **Ngang nhau** |
| Độ đầy đủ kho | Kho đầy đủ + đánh phiên bản (V:554) + cảnh báo HĐ đổi | Từng **thiếu ~4%** (T6: 6.802 vs ~7.076) do thuế chặn tốc độ; đang vá delta-sync | **Ta yếu hơn — đang vá** |
| Dựng file xuất | **Client-side** (đã đo: xuất chỉ gọi lại `/QLHD/TraCuu` lấy dữ liệu, dựng xlsx bằng ExcelJS/JSZip trong trình duyệt, không endpoint xuất riêng) | Dựng ở **máy chủ** (`POST /exports`, streaming) | **Khác cách làm** |
| Kiểm hợp lệ khi xuất | Có (rà soát bằng JS client trên dữ liệu vừa lấy) | Chưa có bước rà soát riêng khi xuất | **Ta thiếu** |
| Đa định dạng | xlsx, xml.zip, html.zip, pdf.zip, aio.pdf | Mới xlsx/csv (đa định dạng đã ghi vào U7) | **Ta mỏng — đã lên kế hoạch** |

**Kết luận cốt lõi:** nguyên lý "chuẩn bị sẵn kho → đọc tức thì", **ta đã làm** và không thua.
Lợi thế thật của NIBOT nằm ở **độ tin cậy/đầy đủ của kho** và **bước rà soát tính chính xác**,
không phải ở mẹo xuất file.

## 4. Bài học rút ra

1. **"Tức thì" đến từ kho đồng bộ trước, không từ tốc độ gọi thuế.** Ta đi đúng hướng; việc
   cần làm là bảo đảm kho **đầy đủ và cập nhật**, không phải tối ưu đường gọi GDT lúc người
   dùng bấm.
2. **"Chính xác" là một tính năng có chủ đích, không miễn phí.** NIBOT chèn bước kiểm hợp lệ
   + đánh phiên bản + cảnh báo khi hóa đơn đổi trạng thái. Người dùng kế toán tin phần mềm vì
   con số "đối chiếu được", không chỉ vì nhanh.
3. **Dựng file phía client là đòn tối ưu tốc độ + giảm tải máy chủ** — đáng cân nhắc ở quy mô
   100k khách, nhưng là thứ yếu so với (1) và (2).

## 5. Đề xuất nâng cấp (xếp theo ưu tiên)

**Ưu tiên 1 — Siết độ đầy đủ & tin cậy của kho (đang làm, đẩy tới đích).**
Hoàn tất delta-sync (`docs/superpowers/specs/2026-07-26-delta-sync-va-ux-tra-cuu-design.md`):
kéo lô nhỏ + checkpoint + hội tụ tới khi hết thiếu. Đây là điều kiện cần để "xuất chính xác".

**Ưu tiên 2 — Tầng tin cậy dữ liệu: versioning phiên đồng bộ + cảnh báo hóa đơn đổi.**
Ta đã phát hiện `ttxly/tthai` đổi (U5) nhưng chưa có tầng **thông báo + đánh phiên bản** như
NIBOT (V:554). Bổ sung: mỗi lần đồng bộ ghi một "phiên bản"; khi một hóa đơn đổi trạng thái
(mới → điều chỉnh/thay thế/hủy) thì ghi sự kiện + hiện cảnh báo. Đã nằm trong hướng U5/U9.

**Ưu tiên 3 — Bước "rà soát khi xuất" (tùy chọn, bật được).**
Học spinner "kiểm tra tính hợp lệ": trước khi xuất, đối chiếu nhanh trạng thái hóa đơn trong
kho (không nhất thiết gọi thuế trực tiếp mỗi lần — dùng dữ liệu đồng bộ gần nhất) và cảnh báo
nếu có hóa đơn đã bị điều chỉnh/hủy nằm trong tập xuất. Giữ tùy chọn tắt để không làm chậm khi
người dùng chỉ cần xuất thô.

**Ưu tiên 4 — Kết xuất phía client cho tập nhỏ (hybrid), giữ server cho tập lớn.**
Với trang/tập đã nạp lên lưới, cân nhắc dựng xlsx ngay trong trình duyệt để "bấm là có",
giảm tải máy chủ ở quy mô lớn. Ràng buộc: **một nguồn sự thật cột** (catalog `@vat/domain`)
phải chia sẻ được cho cả client lẫn server để không lệch định dạng; đường server (streaming)
**giữ nguyên** cho "xuất toàn bộ" nhiều chục nghìn dòng. Cần cân nhắc kỹ trước khi làm — có
thể xếp sau (chi phí phức tạp so với lợi ích, khi đường server đã chạy).

**Ưu tiên 5 — Đa định dạng xuất** (xml.zip, html.zip, pdf.zip, aio.pdf): đã ghi vào U7, bổ
sung dần.

## 6. Trạng thái bằng chứng

Điểm còn treo trước đây (endpoint bước "kiểm tra hợp lệ" khi xuất) **đã chốt** ở §2.3 bằng
Performance API: xuất chỉ gọi lại `/QLHD/TraCuu` (kho riêng, ~1–2s), không endpoint xuất riêng,
không chạm GDT, file dựng client-side. Không còn giả định treo trong khảo sát này.

# RÀ SOÁT — Thông báo & thống kê "lệch hóa đơn" đã chuẩn chưa? (2026-07-28)

> Chủ dự án yêu cầu sau khi U36 lên production. Mọi con số dưới đây **đo trực tiếp trên
> Postgres production** ngày 2026-07-28 bằng truy vấn CHỈ ĐỌC, tái lập được (SQL ghi trong
> từng mục). Không con số nào là ước lượng.

## 0. Tóm tắt cho người bận

| Điều | Kết luận |
|---|---|
| Ba cơ chế có nhất quán không | **Có** — chúng trả lời BA câu hỏi khác nhau, không mâu thuẫn. Nhưng **không liên thông** |
| Lỗ hổng lớn nhất | **Lệch thuế: 15 hóa đơn đang lệch, 11 ca > 100.000 đ — nhưng màn hình ĐANG TẮT nên không ai thấy** |
| Điểm mù chưa ai ghi nhận | **2.138 hóa đơn (6,3%) KHÔNG hề được kiểm lệch thuế** vì thiếu cột tiền — toàn bộ là họ `sco` |
| `soMaLa` và `huy` có che nhau không | **Không** — chúng bổ sung cho nhau; `soMaLa` hiện là tấm lưới DUY NHẤT cho mã hủy chưa biết |
| Quyết định "không loại mã 4 khỏi reconcile" (U36 Gói 3d) | **Đúng, nay có số chứng minh** — loại đi sẽ đẩy nhiễu "thiếu số đầu ra" từ 9 lên 26 |

---

## 1. Ba cơ chế trả lời ba câu hỏi khác nhau

| | Cơ chế | Câu hỏi nó trả lời | Phạm vi | Người dùng thấy? |
|---|---|---|---|---|
| **(a)** | `ThongBaoTrangThai.tsx` (U36) | *"Tổng tiền kỳ này có bị ảnh hưởng bởi hóa đơn bị thay thế không?"* | Kỳ đang lọc | ✅ |
| **(b)** | `InvoiceChangesBadge.tsx` (U35) | *"Có hóa đơn nào vừa ĐỔI trạng thái so với lần đồng bộ trước không?"* | Toàn tenant, không theo kỳ | ✅ |
| **(c)** | `packages/reconcile` (U10) | *"Số liệu trên hóa đơn có tự mâu thuẫn không? Có thiếu số hóa đơn không?"* | Theo bộ lọc | ❌ **TẮT** |

Ba định nghĩa "lệch" khác nhau là **hợp lý** — không phải drift cần gộp. (a) nói về *tổng tiền*,
(b) nói về *sự kiện theo thời gian*, (c) nói về *tính toàn vẹn số học*. Vấn đề không nằm ở
chỗ chúng khác nhau, mà ở chỗ **(c) bị tắt nên cả một loại lệch không ai nhìn thấy**.

---

## 2. Lệch thuế — cơ chế có, test có, KHÔNG AI THẤY

`apps/web/src/lib/featureFlags.ts:10` — `SHOW_RECONCILE = false`, tắt từ 2026-07-22 với lý do
ghi trong chú thích: *"chức năng Lệch thuế chưa cần thiết"*.

Đo lại hôm nay, định nghĩa `tgtcthue − ttcktmai + tgtthue = tgtttbso`, dung sai 0:

```sql
select count(*)::int tong_hd,
       count(*) filter (where abs((tgtcthue - coalesce(ttcktmai,0) + tgtthue) - tgtttbso) > 0)::int lech
from hoa_don
where tgtcthue is not null and tgtthue is not null and tgtttbso is not null;
```

| Điều | Số |
|---|---|
| Hóa đơn được kiểm | 31.807 |
| **Đang lệch** | **15** (0,047%) |
| — chiều bán ra | 10 (đều họ `sco`) |
| — chiều mua vào | 5 (4 `normal` + 1 `sco`) |

Độ lớn khoản lệch — **không phải nhiễu làm tròn**:

| Mức lệch | Số hóa đơn |
|---|---|
| ≤ 1 đ (làm tròn) | 1 |
| ≤ 100.000 đ | 3 |
| **> 100.000 đ** | **11** |

⇒ 15 phát hiện trên 31.807 hóa đơn là **tỷ lệ rất thấp, hoàn toàn dùng được** — không có
chuyện "bật lên là ngập cảnh báo". Và 11/15 ca lệch trên 100.000 đ là **đáng xem thật**.

**Đề xuất: bật `SHOW_RECONCILE = true`.** Nhưng đây là quyết định của chủ dự án — chính chủ
dự án đã tắt nó ngày 22/07. Điều thay đổi so với lúc đó: nay đã có số đo cho thấy nó không
nhiễu. Không tự bật.

---

## 3. ĐIỂM MÙ chưa ai ghi nhận — 2.138 hóa đơn không hề được kiểm

```sql
select count(*)::int tong,
       count(*) filter (where tgtcthue is null or tgtthue is null or tgtttbso is null)::int thieu_cot_tien,
       count(*) filter (where (tgtcthue is null or tgtthue is null or tgtttbso is null) and nguon='sco')::int thieu_va_sco
from hoa_don;
```

| Điều | Số |
|---|---|
| Tổng hóa đơn | 33.945 |
| **Thiếu ít nhất một cột tiền** | **2.138 (6,3%)** |
| Trong đó thuộc họ `sco` | **2.138 — TOÀN BỘ** |

`taxIntegrity.ts:45-47` yêu cầu cả ba cột `tgtcthue`/`tgtthue`/`tgtttbso` khác NULL mới kiểm
(đúng — để tránh false-positive). Hệ quả **chưa ai nói ra**: 2.138 hóa đơn máy tính tiền
**nằm ngoài mọi phép kiểm toàn vẹn**. Chúng không lệch, cũng không "không lệch" — chúng
**không được hỏi tới**.

### 3.1 ĐÃ PROBE — nguyên nhân (2026-07-29)

Probe đọc-only trên `raw_json` (dữ liệu GDT trả về, đã lưu — **không gọi GDT**). Kết quả dứt khoát:

**(a) KHÔNG phải lỗi mapper.** So từng hóa đơn giữa cột DB và `raw_json`:

| Cột | Số hóa đơn DB khớp raw_json |
|---|---|
| `tgtcthue` | **33.945 / 33.945** |
| `tgtthue` | **33.945 / 33.945** |
| `tgtttbso` | **33.945 / 33.945** |

`mapInvoice.ts:26-28` là pass-through thuần (`numStr` chỉ trả null khi raw null). Khớp 100% ⇒
**mapper không bỏ sót một trường nào.**

**(b) GDT thật sự không trả — và có lý do chính đáng.** Trong nhóm 2.138: `tgtttbso` **CÓ ĐỦ**
(2.138/2.138), chỉ thiếu `tgtcthue` và `tgtthue`. Tức GDT trả tổng thanh toán nhưng không tách
phần trước thuế / phần thuế.

**(c) Nguyên nhân: đây là HÓA ĐƠN BÁN HÀNG, không phải hóa đơn GTGT.** Tách bạch hoàn hảo
theo `khmshdon` (ký hiệu mẫu số):

| `khmshdon` | Loại | Thiếu cột tiền | Đủ cột tiền |
|---|---|---|---|
| `1` | Hóa đơn GTGT | **0** | **31.807** |
| `2` | Hóa đơn bán hàng | **2.138** | **0** |

Không một ngoại lệ nào. Hóa đơn bán hàng (mẫu số 2) theo quy định **không tách thuế GTGT**,
nên không có gì để GDT trả. Bằng chứng phụ nhất quán: 2.138/2.138 hóa đơn này **không có bảng
`thttltsuat`**, và toàn bộ 2.209 dòng hàng của chúng có `ltsuat = null`. Đối chứng: hóa đơn
sco mẫu số 1 thì 31.484 dòng mang `8%`, 2 dòng mang `10%`.

⇒ **Không có lỗi dữ liệu. Không cần sửa mapper.** `taxIntegrity` bỏ qua nhóm này là ĐÚNG —
định danh `tgtcthue − ttcktmai + tgtthue = tgtttbso` vô nghĩa với hóa đơn không có thuế.

### 3.2 Nhưng điểm mù VẪN CÒN — và có đường bịt

2.138 hóa đơn này vẫn **không được kiểm gì cả**. Chúng có đường kiểm khác: **2.126/2.138 đã
đồng bộ dòng hàng**, nên so được `Σ thtien(dòng)` với `tgtttbso`.

Thử ngay (dung sai 1 đ): **25/2.126 hóa đơn lệch.**

⚠️ **Chưa kết luận 25 ca này là sai.** Phép so trên chưa trừ chiết khấu (`ttcktmai`) và chưa
xét làm tròn nhiều dòng. Phải loại trừ hai yếu tố đó trước khi gọi là "lệch". Con số 25 ở đây
chỉ chứng minh **đường kiểm này khả thi và có tín hiệu**, không phải kết luận về số hóa đơn sai.

---

## 4. Thiếu số đầu ra — dùng được, và xác nhận một quyết định của U36

```sql
select count(*)::int so_nhom, sum(max_n - min_n + 1 - co)::int tong_so_thieu
from (select tenant_id, nbmst, khhdon, min(shdon::int) min_n, max(shdon::int) max_n,
             count(distinct shdon::int) co
      from hoa_don where chieu='sold' and shdon ~ '^[0-9]+$' group by 1,2,3) g
where max_n > min_n;
```

→ **3 nhóm, 9 số hóa đơn nghi thiếu.** Nhỏ, đọc hết được bằng mắt.

**Xác nhận Gói 3d của U36 (không áp loại trừ mã 4 vào reconcile) là đúng — nay có số:**
17 hóa đơn `tthai=4` **vẫn còn trong kho** và vẫn nằm trong dãy số. Nếu khi đó ta loại chúng
khỏi truy vấn reconcile như phản xạ ban đầu, 17 số này sẽ hiện thành **"thiếu số đầu ra" GIẢ**
— nhiễu tăng từ 9 lên 26, tức **gần gấp ba**, và toàn bộ phần tăng thêm là báo động sai.

---

## 5. `soMaLa` (U36) và finding `huy` (U10) — bổ sung, không che nhau

| | Nguồn | Hiện trạng |
|---|---|---|
| `soMaLa` | `summarize.ts` đếm `tthai` ngoài tập 1–5 | **0** hóa đơn hiện nay |
| finding `huy` | `STATUS_CODE_MAP.huy` — **RỖNG có chủ đích** | **luôn 0**, vĩnh viễn tới khi có bằng chứng |

Phân bố `tthai` hôm nay: `1`=33.903 · `2`=19 · `3`=3 · `4`=17 · `5`=3. Không mã nào ngoài 1–5.

Điểm quan trọng: vì `huy` rỗng vĩnh viễn, **`soMaLa` là tấm lưới DUY NHẤT** nếu Tổng cục Thuế
bắt đầu phát ra mã hủy thật (giả thiết `6`). Nó sẽ bắt được ngay dưới dạng "mã chưa xác định".
Hai cơ chế **không che nhau** — bỏ `soMaLa` đi thì rủi ro 7.1 của U36 thành im lặng hoàn toàn.

---

## 6. Việc cần làm — theo thứ tự đề xuất

| # | Việc | Cỡ | Ai quyết |
|---|---|---|---|
| 1 | **Hiện `soDuocDieuChinh`** trong `ThongBaoTrangThai.tsx` — API tính sẵn, giao diện quên hiện (lỗi bỏ sót U36.3) | ~1 giờ | tự làm được |
| 2 | **Bật `SHOW_RECONCILE`** — 15 phát hiện, 11 ca > 100.000 đ, tỷ lệ 0,047% không nhiễu | ~30 phút | **chủ dự án** (chính họ đã tắt 22/07) |
| 3 | ~~Probe: vì sao 2.138 hóa đơn sco thiếu cột tiền~~ **ĐÃ XONG 29/07** — không phải lỗi, là hóa đơn bán hàng (mẫu số 2) vốn không có thuế GTGT. Việc còn lại: **thêm phép kiểm `Σ dòng hàng = tgtttbso`** cho nhóm này (§3.2) | vừa | chủ dự án |
| 4 | **Cảnh báo vắt kỳ** (hóa đơn kỳ này bị sửa bởi hóa đơn kỳ sau) — cần ghép cặp qua `shdgoc` | lớn | **U37** |

Bằng chứng cho #4 đã có thật, không còn là giả thuyết: HĐ `C26MYY-9842` lập 09/07/2026
(mã 3, −3.599.999 đ) điều chỉnh cho HĐ `7914` lập 23/06/2026 (mã 5). Tổng tháng 6 vẫn cộng đủ
7914; phần giảm rơi vào tháng 7. Tờ khai tháng 6 nếu đã nộp thì phải cân nhắc khai bổ sung —
hệ thống hiện **không cảnh báo gì**. Xem `docs/BANG-CHUNG-ma-trang-thai-hoa-don-2026-07-28.md` §6.4.

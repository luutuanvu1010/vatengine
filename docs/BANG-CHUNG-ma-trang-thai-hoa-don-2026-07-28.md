# BẰNG CHỨNG — Giải mã mã trạng thái hóa đơn `tthai` (2026-07-28)

> **Trạng thái: ĐÃ KIỂM CHỨNG** trên dữ liệu GDT thật, tái lập được bằng SQL dưới đây.
> Biên bản này gỡ khóa cổng bằng chứng tại `packages/reconcile/test/contract/statusCodes.contract.test.ts`
> và mở đường điền `STATUS_CODE_MAP` (`packages/reconcile/src/statusCodes.ts`) + `TTHAI_VERIFIED`
> (`apps/web/src/lib/statusLabels.ts`), vốn bị để RỖNG có chủ đích từ 2026-07-14.

---

## 1. Tóm tắt điều hành

| Điều | Kết luận |
|---|---|
| Mã `tthai` | Giải mã được 5 giá trị (1–5), bằng chứng 20 cặp hóa đơn gốc↔mới, **0 ngoại lệ** |
| Mã `ttxly` | **KHÔNG liên quan tới hủy/thay thế** — giữ RỖNG |
| Mã "hủy" thật | **CHƯA CÓ BẰNG CHỨNG** — chưa từng xảy ra trong 33.929 hóa đơn |
| Trường liên kết HĐ gốc | **ĐÃ NẰM SẴN trong `raw_json`** (`shdgoc`, `khhdgoc`, `khmshdgoc`, `tdlhdgoc`…) — chưa map ra cột |
| `ncnhat` làm tín hiệu phát hiện thay đổi | **KHÔNG DÙNG ĐƯỢC** — 10/10 ca, `ncnhat` bản gốc không đổi khi bị thay thế |
| Tác động đang diễn ra | Doanh thu bán ra bị **thổi lên 274.535.000đ**, thuế đầu ra **20.335.925đ** do đếm trùng |
| Rủi ro vắt qua kỳ kê khai | **ĐÃ XẢY RA 1 ca** — HĐ tháng 6 bị điều chỉnh bằng HĐ tháng 7 (mục 6.4) |

---

## 2. Phương pháp (tái lập được)

- **Nguồn:** bảng `hoa_don` trên Postgres production (Neon `ap-southeast-1`), đọc qua `DATABASE_URL` trong `packages/db/.dev.vars`.
- **Ngày đo:** 2026-07-28.
- **Cỡ mẫu:** 33.929 hóa đơn thuộc **3 tenant** — MST 4201969169 (31.662 HĐ), 4200730402 (2.177 HĐ), 019197004411 (90 HĐ) — gồm cả `normal` và `sco`, cả `purchase` và `sold`.
- **Không gọi GDT.** Toàn bộ bằng chứng lấy từ `raw_json` đã lưu — tức là dữ liệu gốc do GDT trả về, không qua diễn giải.

Truy vấn nền:

```sql
-- Phân bố mã trạng thái
select nguon, chieu, tthai, ttxly, count(*)::int so_hd
from hoa_don group by 1,2,3,4 order by so_hd desc;

-- Ghép cặp hóa đơn mới ↔ hóa đơn gốc qua con trỏ shdgoc trong raw_json
select (r.tdlap::date - g.tdlap::date) so_ngay_cach, r.tthai tthai_moi, g.tthai tthai_goc,
       count(*)::int so_ca, string_agg(r.shdon||'<-'||g.shdon, ', ') vi_du
from hoa_don r
join hoa_don g
  on g.shdon = r.raw_json->>'shdgoc'
 and g.khhdon = r.raw_json->>'khhdgoc'
 and g.tenant_id = r.tenant_id
where r.tthai in (2,3)
group by 1,2,3 order by 1;
```

---

## 3. Bảng mã `tthai` — ĐÃ KIỂM CHỨNG

| `tthai` | Nghĩa | Số HĐ | Mang `shdgoc`? | `tthdclquan` |
|---|---|---|---|---|
| **1** | Hóa đơn gốc | 33.887 | Không (0/33.887) | `false` |
| **2** | Hóa đơn **thay thế** | 19 | ✅ Có (19/19) | `true` |
| **3** | Hóa đơn **điều chỉnh** | 3 | ✅ Có (3/3) | `true` |
| **4** | Hóa đơn **bị thay thế** | 17 | Không (0/17) | `false` |
| **5** | Hóa đơn **bị điều chỉnh** | 3 | Không (0/3) | `false` |

Tổng: 33.929 ✓ (khớp tổng số bản ghi).

### 3.1 Ba lớp bằng chứng độc lập

**(a) Đối xứng ghép cặp hoàn hảo.** Mọi cặp đều đúng một trong hai dạng, không một ca lẫn:

```
tthai_moi=2  →  tthai_goc=4     (17 cặp)
tthai_moi=3  →  tthai_goc=5     ( 3 cặp)
```

Chiều ngược lại cũng kín: **17/17** hóa đơn `tthai=4` có đúng một hóa đơn trỏ về; **3/3** hóa đơn `tthai=5` có đúng một hóa đơn trỏ về. Không có hóa đơn `tthai=4/5` nào "mồ côi".

**(b) Sự hiện diện của `shdgoc`.** `shdgoc` (số hóa đơn gốc) chỉ xuất hiện ở `tthai` 2 và 3 — tức nhóm "hóa đơn mới sinh ra để sửa hóa đơn cũ". Không một hóa đơn `tthai` 1/4/5 nào có trường này.

**(c) Dấu hiệu số tiền phân biệt 2 với 3.** Đây là bằng chứng độc lập cho việc gán nhãn "thay thế" vs "điều chỉnh":

| `tthai` | Chiều | Số HĐ | Tổng tiền |
|---|---|---|---|
| 2 (thay thế) | sold | 18 | **+262.781.000đ** |
| 3 (điều chỉnh) | sold | 1 | **−3.600.000đ** |
| 3 (điều chỉnh) | purchase | 2 | **−600.000đ** |

Hóa đơn `tthai=3` mang **số tiền âm** — đặc trưng riêng của hóa đơn điều chỉnh giảm. Hóa đơn `tthai=2` mang số tiền dương đầy đủ — đặc trưng của hóa đơn thay thế (lập lại toàn bộ). Không thể nhầm hai nhóm này.

### 3.2 Ca chuẩn (do chủ doanh nghiệp xác nhận thực tế)

Chủ doanh nghiệp xác nhận độc lập: hóa đơn `00012250` đã bị bỏ và thay bằng `00012368`, trên hóa đơn mới có dòng ghi thay thế. Dữ liệu khớp chính xác:

| | HĐ 12250 | HĐ 12368 |
|---|---|---|
| Ký hiệu | C26MYY (mẫu 1) | C26MYY (mẫu 1) |
| Ngày lập (giờ VN) | 26/07/2026 00:00 | 27/07/2026 00:00 |
| `tthai` | **4** (bị thay thế) | **2** (thay thế) |
| `ttxly` | 8 | 8 |
| `shdgoc` | — | **12250** |
| `tdlhdgoc` | — | 2026-07-25T17:00:00Z (= 26/07 giờ VN) |
| `tthdclquan` | false | **true** |
| Tổng thanh toán | 1.950.000đ | 1.300.000đ |

---

## 4. Kết luận về `ttxly` — KHÔNG dùng để phân loại

`ttxly` **không đổi** khi hóa đơn bị thay thế: cả 12250 (`tthai=4`) và 12368 (`tthai=2`) đều có `ttxly=8`.

Phân bố quan sát được: `ttxly=8` cho toàn bộ họ `sco`; `ttxly=5` và `6` cho họ `normal`. Giá trị này bám theo **họ hóa đơn và tiến trình xử lý của cơ quan thuế**, không phản ánh việc bị thay thế/điều chỉnh.

⇒ **`STATUS_CODE_MAP.*.ttxly` phải để RỖNG.** Chỉ điền `tthai`.

⇒ Ý nghĩa cụ thể của `ttxly` 5/6/8 vẫn **CHƯA KIỂM CHỨNG** — không được đoán.

---

## 5. Giới hạn của bằng chứng (đọc kỹ trước khi mở rộng)

1. **Chưa có mã cho "hủy" thật.** Trong 33.929 hóa đơn không có ca hủy nào (hủy theo nghĩa pháp lý — kèm thông báo sai sót mẫu 04/SS). Điều người dùng quen gọi là "hủy" trong ca 12250 thực chất là **bị thay thế**. Mã của hủy thật có thể là `tthai=6` hoặc giá trị khác — **KHÔNG được suy đoán**. `STATUS_CODE_MAP.huy` phải tiếp tục để RỖNG.
2. **Ba tenant, nhưng tập trung ở một.** 93% mẫu thuộc MST 4201969169. Mã trạng thái là của hệ thống GDT nên nhiều khả năng chung cho mọi tenant, nhưng điều đó **chưa được kiểm chứng trên diện rộng**.
3. **Cỡ mẫu nhỏ ở nhánh điều chỉnh.** Chỉ 3 cặp `3→5`. Kết luận về nhánh này yếu hơn nhánh `2→4` (17 cặp).
4. **Nhãn tiếng Việt chính xác chưa đối chiếu văn bản pháp quy.** Cách gọi "thay thế / bị thay thế / điều chỉnh / bị điều chỉnh" suy ra từ cấu trúc dữ liệu và dấu hiệu số tiền, chưa đối chiếu với tài liệu chính thức của Tổng cục Thuế.
5. **Cỡ mẫu mua vào rất nhỏ.** Chỉ 1 ca thay thế và 2 ca điều chỉnh ở chiều mua vào. Kết luận ở mục 6.5 dựa trên mẫu này cần thêm dữ liệu để chắc chắn.

---

## 6. Phát hiện phụ (quan trọng cho thiết kế)

### 6.1 `ncnhat` KHÔNG phải tín hiệu phát hiện thay đổi

Kiểm 10/10 cặp: `ncnhat` của hóa đơn gốc **luôn sớm hơn** thời điểm hóa đơn thay thế ra đời. Nghĩa là GDT **không cập nhật `ncnhat`** khi một hóa đơn bị thay thế.

| HĐ gốc | `ncnhat` gốc | HĐ mới | `ncnhat` mới | Kết luận |
|---|---|---|---|---|
| 12250 | 26/07 18:17 | 12368 | 27/07 17:37 | Không cập nhật |
| 9742 | 08/07 11:32 | 9754 | 08/07 19:35 | Không cập nhật |
| 8305 | 27/06 20:23 | 8401 | 28/06 10:14 | Không cập nhật |
| 8309 | 27/06 20:17 | 8400 | 28/06 10:14 | Không cập nhật |
| 7039 | 15/06 19:51 | 7577 | 20/06 19:27 | Không cập nhật |

`ncnhat` biểu thị **thời điểm hóa đơn được truyền/xử lý lần đầu**, không phải thời điểm đổi trạng thái.

⇒ **Hệ quả:** kể cả nếu GDT có hỗ trợ lọc theo `ncnhat` (chưa kiểm chứng), nó cũng **không giúp** phát hiện hóa đơn cũ bị thay thế. Không cần probe câu hỏi đó nữa.

### 6.2 Trường liên kết đã có sẵn, chưa dùng

`raw_json` chứa sẵn (chưa map ra cột nào):

`shdgoc` · `khhdgoc` · `khmshdgoc` · `tdlhdgoc` · `lhdgoc` · `gchdgoc` · `tthdclquan` · `hdonLquans` · `tttbao` · `idtbao` · `mtdiep` · `thlap` · `thttltsuat` · `tgtttbchu`

⇒ Dựng liên kết gốc ↔ thay thế **không tốn một request nào** tới GDT.

### 6.3 Khoảng cách thời gian gốc → hóa đơn thay thế

| Cách nhau | Số ca |
|---|---|
| 0 ngày | 7 |
| 1 ngày | 8 |
| 4 ngày | 1 |
| 5 ngày | 1 |
| 10 ngày | 1 |
| 16 ngày | 1 |
| **26 ngày** | 1 |

15/20 ca (75%) trong vòng 1 ngày, nhưng **đuôi dài tới 26 ngày**. Cửa sổ quét lại 7 ngày sẽ bỏ sót **3/20 ca (15%)**.

### 6.4 ⚠️ Ca vắt qua kỳ kê khai — ĐÃ XẢY RA

Có **1 cặp rơi khác tháng**, tức đã chạm đúng tình huống nguy hiểm nhất về mặt kế toán:

| | Hóa đơn gốc | Hóa đơn điều chỉnh |
|---|---|---|
| Số | 7914 (C26MYY, bán ra) | 9842 (C26MYY, bán ra) |
| Ngày lập | **23/06/2026** | **09/07/2026** |
| `tthai` | 5 (bị điều chỉnh) | 3 (điều chỉnh) |
| Tổng thanh toán | +3.600.000đ | **−3.600.000đ** |
| Thuế | +266.667đ | **−266.667đ** |
| Cách nhau | | 16 ngày |

Hóa đơn bán ra của **kỳ tháng 6** bị điều chỉnh giảm toàn bộ bằng một hóa đơn lập trong **kỳ tháng 7**. Nếu tờ khai tháng 6 đã nộp, đây chính là trường hợp phải cân nhắc **khai bổ sung** — hệ thống hiện không phát hiện, không cảnh báo, không ghi vết.

⇒ Kết luận: rủi ro "thay đổi vắt qua kỳ đã kê khai" **không còn là giả thuyết**. Nó đã xảy ra ít nhất một lần trong 3 tháng dữ liệu.

---

### 6.5 Vì sao 19 hóa đơn thay thế nhưng chỉ 17 hóa đơn bị thay thế

Chênh lệch 2 ca, **hai nguyên nhân hoàn toàn khác nhau**:

**Ca A — chiều MUA VÀO: CHƯA XÁC ĐỊNH NGUYÊN NHÂN** ⚠️

HĐ 1553 (ký hiệu C26TTH, lập 16/06, nhà cung cấp MST 4201559010) thay cho HĐ 1508 lập 12/06. Bản gốc 1508 **không có trong kho**, dù tháng 6 chiều mua vào đã đồng bộ.

> **Đính chính 2026-07-28 (do chủ dự án chất vấn).** Bản đầu của biên bản này kết luận *"GDT ngừng trả bản gốc bị thay thế cho bên mua"*. **Kết luận đó KHÔNG ĐỦ BẰNG CHỨNG và đã bị rút.**

**Vì sao rút:**

1. **Cỡ mẫu = 1.** Toàn bộ dữ liệu chỉ có **đúng một** ca thay thế ở chiều mua vào. Khẳng định "không hóa đơn mua vào nào mang `tthai=4`" nghe như một quy luật, nhưng thực chất là "0 trên tối đa 1 ca" — không mang thông tin.
2. **Có bằng chứng NGƯỢC LẠI.** Ở chiều mua vào, bản gốc **bị điều chỉnh** thì **VẪN CÓ trong kho và VẪN được GDT đánh dấu** `tthai=5` — **2/2 ca** (HĐ 133717 và 380548). Tức GDT **có** cấp trạng thái cho bản gốc phía bên mua. Nếu nó giấu bản gốc bị *thay thế* mà không giấu bản gốc bị *điều chỉnh*, đó là hành vi bất đối xứng và **cần bằng chứng riêng để khẳng định**.
3. **Có lời giải thích cạnh tranh.** Hệ thống mới đồng bộ từ 15/07; các hóa đơn của nhà cung cấp này được tải về 18–24/07 — **hơn một tháng sau khi 1508 bị thay thế**. Ta chưa bao giờ có cơ hội nhìn thấy nó ở trạng thái còn hiệu lực. Không phân biệt được "GDT không trả" với "ta đến muộn".
4. **Chiều bán ra cũng có 1 ca thiếu bản gốc** (3179 ← 2159), và ca đó đã xác định là **lỗ hổng đồng bộ tháng 3**, không phải GDT giấu. Hiện tượng "thiếu bản gốc" vì vậy không đặc thù cho chiều mua vào.

**Trạng thái: CHƯA KIỂM CHỨNG.** Cần probe khi có ca mới ở chiều mua vào — theo dõi một hóa đơn mua vào từ lúc còn hiệu lực đến sau khi bị thay thế, xem GDT còn trả nó không và mang mã gì.

**Điều KHÔNG bị ảnh hưởng bởi đính chính này:** hướng thiết kế "lần ngược từ `shdgoc`" (mục 8) vẫn đúng, nhưng vì **những lý do khác** — `ncnhat` không đổi khi bị thay thế (mục 6.1), không tốn request tới GDT, và không phụ thuộc việc quét lại kỳ quá khứ. Nó **không còn** được biện minh bằng lập luận "duy nhất khả thi ở chiều mua vào".

**Ca B — chiều BÁN RA: lỗ hổng đồng bộ, không liên quan trạng thái.**
HĐ 3179 (lập 11/04) thay cho HĐ 2159 lập **09/03/2026**. Bản gốc thiếu vì dữ liệu bán ra của MST 4201969169 **chỉ có từ 01/04/2026 trở đi** — tháng 3 chưa bao giờ được tải về. Đây chính là lỗ hổng A1 trong `docs/CHAN-DOAN-thieu-hoa-don-thang.md`, cần backfill.

⇒ Đây cũng là **ca vắt qua kỳ thứ hai** (tháng 3 → tháng 4), ngoài ca ở mục 6.4. Không đếm được trong thống kê cặp vì thiếu bản gốc.

### 6.6 Cảnh báo khi hiện thực ghép cặp

Ký hiệu `C26MYY` **được dùng bởi hai người bán khác nhau** trong hệ thống, và số hóa đơn trùng nhau:

| MST người bán | Mẫu số | Ký hiệu | Số HĐ | Thuộc tenant |
|---|---|---|---|---|
| 4201969169 | 1 | C26MYY | 9.476 | 4201969169 |
| 056172008191 | 2 | C26MYY | 2.070 | 4200730402 |

Ví dụ: số `3179` và số `2159` đều tồn tại ở cả hai bên, với ngày lập và số tiền khác nhau.

⇒ Khi ghép cặp gốc ↔ thay thế, **bắt buộc ghép đủ `tenant_id` + `nbmst` + `khmshdgoc` + `khhdgoc` + `shdgoc`**. Ghép thiếu (ví dụ chỉ theo số + ký hiệu) sẽ nối nhầm hóa đơn của hai doanh nghiệp khác nhau.

---

## 7. Tác động đang diễn ra trên số liệu

Hệ thống hiện cộng mọi hóa đơn bất kể `tthai`, nên **đếm trùng** cặp gốc + thay thế:

| Nhóm | Số HĐ | Tiền | Thuế |
|---|---|---|---|
| `tthai=4` bị thay thế (bán ra) — **phải LOẠI** | 17 | 274.535.000đ | 20.335.925đ |
| `tthai=2` thay thế (bán ra) — giữ | 18 | 262.781.000đ | 19.465.261đ |

**Doanh thu bán ra đang bị thổi lên ~274,5 triệu đồng; thuế đầu ra thổi lên ~20,3 triệu đồng.**

### ⚠️ Bất đối xứng bắt buộc phải đúng

| Nhóm | Xử lý | Vì sao |
|---|---|---|
| `tthai=4` bị thay thế | **LOẠI khỏi tổng hợp** | Hóa đơn gốc đã mất hiệu lực, bản thay thế gánh toàn bộ giá trị |
| `tthai=5` bị điều chỉnh | **GIỮ trong tổng hợp** | Hóa đơn gốc **vẫn còn hiệu lực**; hóa đơn điều chỉnh chỉ ghi phần tăng/giảm |

Kiểm chứng: `tthai=5` (sold) = +3.600.000đ và `tthai=3` (sold) = −3.600.000đ. Cộng cả hai = 0 — đúng nghiệp vụ điều chỉnh giảm toàn bộ. **Loại nhầm `tthai=5` sẽ làm sai sổ theo chiều ngược lại.**

---

## 8. Khuyến nghị triển khai — hướng "lần ngược từ `shdgoc`"

**Nguyên tắc:** đừng đi tìm *"hóa đơn cũ nào đã đổi trạng thái"*. Hãy bắt *"hóa đơn MỚI nào mang `shdgoc`"* rồi lần ngược về bản gốc.

Lý do phương án này thắng:

- Hóa đơn thay thế/điều chỉnh **luôn là hóa đơn mới lập** ⇒ luôn rơi vào cửa sổ đồng bộ hằng ngày ⇒ **đã có trong kho rồi**.
- Nó tự mang con trỏ `shdgoc` chỉ về bản gốc ⇒ suy ra bản gốc bị thay thế **mà không cần hỏi lại GDT**.
- **Không tốn request nào** ⇒ không rủi ro bị GDT phạt 429 (đã xảy ra 2026-07-27).
- Không phụ thuộc vào việc GDT có cập nhật `ncnhat` hay không (mục 6.1 cho thấy là không).

Vòng quét lại theo kỳ **không bị loại bỏ**, nhưng hạ xuống vai trò **tuyến phòng thủ phụ** — dùng để đồng bộ đúng `tthai` của bản gốc trên GDT, chạy thưa và nhỏ giọt.

### 8.1 Việc cần làm để gỡ khóa

| # | Việc | File |
|---|---|---|
| 1 | Điền `STATUS_CODE_MAP.thayThe.tthai = [4]`; giữ `huy` RỖNG; giữ mọi `ttxly` RỖNG | `packages/reconcile/src/statusCodes.ts` |
| 2 | Cập nhật assertion cổng bằng chứng sang tập mã đã kiểm chứng, dẫn biên bản này | `packages/reconcile/test/contract/statusCodes.contract.test.ts` |
| 3 | Điền `TTHAI_VERIFIED = {1:"Gốc", 2:"Thay thế", 3:"Điều chỉnh", 4:"Bị thay thế", 5:"Bị điều chỉnh"}`; `TTXLY_VERIFIED` giữ RỖNG | `apps/web/src/lib/statusLabels.ts` |
| 4 | Bổ sung `FindingKind` nhánh `dieu_chinh` / `bi_dieu_chinh` (hiện chỉ có `huy`, `thay_the`) | `packages/reconcile/src/types.ts` |
| 5 | Map `shdgoc`/`khhdgoc`/`khmshdgoc`/`tdlhdgoc` ra cột để liên kết cặp hóa đơn — ghép đủ khóa theo cảnh báo mục 6.6 | `packages/db/src/schema/hoaDon.ts`, `packages/sync/src/mapInvoice.ts` |
| 6 | Loại `tthai=4` khỏi mọi con số tổng hợp; **giữ** `tthai=5` | tầng truy vấn/kết xuất |
| 7 | Cập nhật ADR-0001 (dòng 45 ghi "chỉ quan sát được `tthai=1`" — nay đã lỗi thời) | `docs/adr/0001-nen-tang-cloudflare.md` |
| 8 | Gỡ nhãn "CHƯA KIỂM CHỨNG" ở các nơi liên quan | `README.md`, `docs/CHECKLIST-NGHIEM-THU.md`, `docs/07-DESIGN_TOKENS.md` |

### 8.2 Vẫn phải giữ nguyên kỷ luật

- Mã **"hủy"** tiếp tục để RỖNG cho tới khi có ca thật. Không suy đoán từ việc đã biết 1–5.
- Ý nghĩa **`ttxly`** tiếp tục để RỖNG.
- Khi gặp `tthai` ngoài tập 1–5, giao diện phải hiện `"<mã> (chưa rõ)"` với màu trung tính, đúng cơ chế hiện có.

---

## 9. Liên quan

- `docs/plans/U35-plan.md` — kế hoạch lịch sử thay đổi hóa đơn (đã chốt thiết kế, chưa thực thi). Biên bản này cung cấp bằng chứng còn thiếu cho U35.
- `docs/plans/U10-plan.md` — module đối chiếu, nơi `huy`/`thay_the` bị khóa vì thiếu bằng chứng.
- `docs/adr/0001-nen-tang-cloudflare.md` — dòng 45, khẳng định "chỉ quan sát được `tthai=1`", nay cần sửa.
- `docs/CHAN-DOAN-thieu-hoa-don-thang.md` — lỗ hổng A1 (không quét lại kỳ quá khứ), liên quan trực tiếp tới mục 8.

---

*Biên bản lập 2026-07-28. Mọi con số trong tài liệu này tái lập được bằng SQL ở mục 2 trên dữ liệu production tại thời điểm đo.*

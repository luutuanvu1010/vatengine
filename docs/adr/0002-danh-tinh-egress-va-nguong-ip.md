# ADR-0002 — Danh tính egress GDT: ràng buộc IP Việt Nam + ngưỡng fan-out mỗi IP

- **Trạng thái:** 🟡 Đề xuất (Proposed) — 2026-07-13. Ghi lại **bài toán cuối** của chuỗi phân tích egress; **cách giải cụ thể (cỡ pool, chiến lược ghim) hoãn sang U1a** để đo bằng số thật.
- **Liên quan:** tiếp nối **ADR-0001** (Amendment 2026-07-12 — biên Cloudflare không tới được API GDT `:30000`, relay VN là đường chính) và `.claude/rules/security.md` mục "Relay VN (egress GDT)". Điều kiện tiên quyết thực thi: mốc **U1a**.
- **Người quyết định:** Chủ dự án.

---

## 1. Bối cảnh (vì sao bài toán quy về đúng hai ràng buộc)

Chuỗi phân tích dẫn tới ADR này:

1. **GDT phân biệt "dữ liệu của ai" bằng token đăng nhập, KHÔNG bằng IP.** IP chỉ quyết định *có vào được không* (chặn địa lý) và *có bị coi là lạm dụng không* (rate/abuse trên một IP). Dù đi bằng IP nào cũng chỉ lấy được hóa đơn của MST mà token đại diện.
2. **Mọi SaaS phía server đều là "một người đưa thư, nhiều lá thư".** Một (hoặc vài) IP mang token của nhiều tenant. Đây là đặc tính cố hữu của SaaS tập trung — NIBOT (server đặt tại VN) cũng vậy — không phải cái giá riêng của phương án Cloudflare+relay. Việc NIBOT phục vụ nhiều DN qua một server là bằng chứng GDT **dung nạp** mô hình "một IP mang nhiều token hợp lệ", với cơ sở pháp lý là **ủy quyền rõ ràng của từng tenant** (Hiến pháp bắt buộc).
3. **"Server tự mang IP của khách" là bất khả thi về nguyên lý.** HTTPS cần bắt tay TCP hai chiều; gói trả về định tuyến theo IP nguồn. Giả mạo IP nguồn = IP khách thì phản hồi chạy về máy khách, server không nhận được → không lập được kết nối. Header kiểu `X-Forwarded-For` chỉ là "khai báo", không đổi IP mạng thật và GDT gần như chắc chắn không tin.
4. **Cách DUY NHẤT để đi bằng IP của khách là đặt điểm thoát ở phía khách** (agent/reverse-tunnel trên máy/mạng khách — "residential proxy có đồng thuận"). Làm được thật, nhưng kéo theo ràng buộc của bot client-side: phải cài phần mềm phía khách và thiết bị phải online khi đồng bộ nền.
5. Do đó, với mô hình SaaS đồng bộ nền (đồng bộ cả khi khách offline), **mục tiêu "mang đúng IP khách" là giải sai bài toán.** Cái GDT thật sự soi chỉ còn lại hai thứ — và đó là bài toán cuối.

## 2. Bài toán cuối (problem statement)

Đường ra GDT phải đồng thời thỏa:

- **(1) IP phải là Việt Nam.** Ràng buộc **cứng** — biên Cloudflare (IP nước ngoài) bị chặn ở `:30000`; egress bắt buộc qua điểm hiện diện VN.
- **(2) Không để một IP gánh quá nhiều đến mức bị siết.** Diễn giải theo đơn vị **fan-out**: **một IP chỉ nên "đưa thư" cho tối đa ~10 doanh nghiệp (MST) mỗi ngày.**

> ⚠️ **Con số 10 DN/IP/ngày là GIẢ ĐỊNH BẢO THỦ, CHƯA KIỂM CHỨNG.** Theo Hiến pháp ("gặp mơ hồ về API thuế: dừng và hỏi; không tự giả định thầm"), đây **không** phải hằng số đã đo từ GDT, mà là mốc tạm để thiết kế. **U1a phải đo ngưỡng thật** (đơn vị + con số) từ vantage VN trước khi coi là ràng buộc chốt.

## 3. Hệ quả năng lực (vì sao tần suất đồng bộ là đòn bẩy chính)

Số IP VN cần ≈ **(số DN cần đồng bộ mỗi ngày) ÷ 10**. Với 100.000 DN:

| Tần suất đồng bộ mỗi DN | DN cần đồng bộ/ngày (rải đều) | Số IP VN cần (@10 DN/IP/ngày) |
|---|---|---|
| Hằng ngày | 100.000 | **~10.000** |
| Hằng tuần (~5 ngày làm việc) | ~20.000 | **~2.000** |
| Hằng tháng (~22 ngày làm việc) | ~4.545 | **~455** |
| Hằng quý (~65 ngày làm việc) | ~1.540 | **~154** |

Kết luận: **con số 10 không phải là thứ quyết định quy mô — tần suất đồng bộ mới là.** Thiết kế phải cho phép **cấu hình tần suất theo nhu cầu tenant** (đa số nghiệp vụ thuế theo tháng/quý), tránh mặc định "đồng bộ hằng ngày cho tất cả" vốn đẩy nhu cầu IP lên bậc chục nghìn. Chi phí/vận hành một pool cỡ chục nghìn IP VN là rào cản thực tế cần cân nhắc ở tầng mô hình kinh doanh, không chỉ kỹ thuật.

## 3b. Quyết định phạm vi đồng bộ (2026-07-13)

Chủ dự án chốt: hỗ trợ **cả đồng bộ nền tự động lẫn on-demand**, vì nhu cầu doanh nghiệp khác nhau (hạch toán theo ngày / tuần / tháng) → **tần suất cấu hình theo tenant**. Hệ quả cứng:

- **Pool relay VN là baseline BẮT BUỘC.** Vì đồng bộ nền phải chạy cả khi máy khách tắt, phải có egress VN 24/7 độc lập máy khách. Daemon client-side (nếu làm, xem ADR-0003) **chỉ bổ trợ, KHÔNG thay thế** relay: khi daemon online → ưu tiên (đi IP khách, gánh bớt pool); khi offline lúc tới lịch → **rơi về relay**. Bài toán pool IP mục 3 vẫn còn nguyên, chỉ nhẹ theo tỉ lệ khách cài daemon.
- **Giới hạn thật của "tự động" là token + captcha, sâu hơn uptime.** Đồng bộ nền chỉ chạy khi **token thuế còn hợp lệ** (cloud/relay giữ token mã hoá, vòng đời ngắn — không giữ mật khẩu thô). Token hết hạn ⇒ đăng nhập lại cần **captcha do người dùng nhập** (Hiến pháp cấm bypass). Không mô hình nào "tự động vĩnh viễn"; thiết kế: chạy nền tối đa khi token còn sống + **nhắc khách xác thực lại** khi token chết. Ràng buộc do GDT áp, không phải do kiến trúc.

## 4. Hướng giải (nguyên tắc — chi tiết hoãn sang U1a)

- **Pool nhiều IP VN + ghim tenant↔IP:** mỗi IP phục vụ một nhóm ≤ ngưỡng DN/ngày; phân bổ ổn định để không tạo dấu vết "đổi IP loạn xạ".
- **Điều tiết theo tenant/MST** bằng token-bucket + circuit breaker trong Durable Object (đã có trong kiến trúc ADR-0001) — chặn vượt ngưỡng ở tầng ứng dụng trước khi chạm relay.
- **Tùy chọn lai (khớp trực giác "đi bằng IP khách"):** khách nào cài agent → transport = agent của họ (đi bằng chính IP khách, offload egress); khách không cài → rơi về pool relay VN mặc định. `GdtTransport` hoán đổi được theo tenant nên hỗ trợ mô hình này mà không đụng logic nghiệp vụ.

## 5. Câu hỏi mở — giao U1a đo bằng số thật

1. **Đơn vị + ngưỡng thật của (2):** GDT siết theo số DN/IP/ngày, số request/IP, số login/IP, hay kết hợp? Con số thật là bao nhiêu? (Giả định hiện tại: 10 DN/IP/ngày.)
2. **GDT có "ghét" một token xuất hiện từ nhiều IP khác nhau giữa các ngày không?** (Ảnh hưởng chiến lược ghim: một DN có buộc phải luôn đi cùng một IP không.)
3. **Một IP đổi phục vụ nhiều token khác nhau** có bị coi là bất thường không, và ở nhịp nào?
4. **Yêu cầu địa lý:** IP VN nói chung là đủ, hay GDT còn nhạy theo nhà mạng/vùng?

Mỗi câu trên là **giả định về hành vi API thuế** — không tự chốt thầm; U1a kiểm chứng từ vantage VN thật (kèm contract test) rồi mới nâng ADR này lên *Accepted* và cập nhật `.claude/rules/gdt-adapter.md` + `security.md` nếu cần.

## 6. Trạng thái & bước kế tiếp

- ADR ở trạng thái **Đề xuất**; **không code U1a/U1 tới khi có VPS VN** (theo ADR-0001 Amendment + `docs/00-BAT-DAU-TAI-DAY.md`).
- Khi có VPS VN: U1a đo các câu hỏi mục 5, chốt đơn vị/ngưỡng, tính cỡ pool, rồi cập nhật ADR này sang *Accepted*.

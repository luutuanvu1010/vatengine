# PROMPT — Phiên nghiên cứu: daemon egress phía khách ("client-agent")

> Dán nguyên khối dưới đây vào một **phiên Claude Code riêng** của dự án VATCrawlbot. Đây là phiên **NGHIÊN CỨU + THIẾT KẾ (+ POC tùy chọn)** — không phải phiên thực thi U1/U1a.

---

Bạn đang tiếp nối dự án **VATCrawlbot**. Đây là một **phiên nghiên cứu tách biệt, bất đồng bộ** — KHÔNG code U1/U1a, KHÔNG build sản phẩm thật. Nhiệm vụ: nghiên cứu, so sánh công nghệ, và thiết kế một **daemon nhỏ cài trên máy khách** làm đường ra GDT bằng chính IP của khách.

## 0. Đọc trước (đọc theo nhu cầu, KHÔNG tự import vào ngữ cảnh)

- `CLAUDE.md` (Hiến pháp: lằn ranh pháp lý, quy tắc cứng, Definition of Done).
- `docs/adr/0001-nen-tang-cloudflare.md` (+ Amendment 2026-07-12: biên Cloudflare không tới được API GDT `:30000`; relay VN là đường chính).
- `docs/adr/0002-danh-tinh-egress-va-nguong-ip.md` (bài toán cuối: (1) IP phải VN; (2) ≤~10 DN/IP/ngày — chưa kiểm chứng; và **mục 4 "hướng giải" đã nêu tùy chọn lai agent client-side** — đây chính là thứ phiên này nghiên cứu sâu).
- `.claude/rules/security.md` (mục "Relay VN" — nguyên tắc stateless/không-log áp dụng tương tự cho daemon), `.claude/rules/gdt-adapter.md`, `.claude/rules/multi-tenant.md`, `.claude/rules/testing.md`.
- `KIEN_TRUC_VA_KE_HOACH.md` (mô hình dữ liệu, `GdtTransport`), `KHAO_SAT_TINH_NANG_NIBOT.md` (mốc đối thủ).

## 1. Mục tiêu

> **Phạm vi đã chốt (2026-07-13, xem ADR-0002 mục 3b):** dự án hỗ trợ **cả đồng bộ nền tự động lẫn on-demand**. Do đó **pool relay VN là baseline bắt buộc** (egress 24/7 khi máy khách tắt); daemon client-side **chỉ BỔ TRỢ, KHÔNG thay thế** relay — khi daemon online thì ưu tiên (đi IP khách, gánh bớt pool), khi offline lúc tới lịch thì **rơi về relay**. Nghiên cứu này thiết kế nhánh bổ trợ đó, không phải nhánh duy nhất.

Thiết kế một **daemon phía khách** đóng vai một transport mới `GdtTransport = "client-agent"` (hoán đổi được, không đụng logic nghiệp vụ), giảm tải cho pool relay bằng cách **khách nào có daemon online thì đi bằng chính IP của mình** (phân tán IP, gánh bớt pool). Daemon phải làm ba việc:

1. **Egress bằng IP của khách:** mọi lời gọi GDT (`hoadondientu.gdt.gov.vn:30000`) phát đi từ máy/mạng của khách, dùng IP VN của chính khách.
2. **Xác thực người dùng:** ghép cặp (pairing/enroll) daemon với đúng tenant; và luồng đăng nhập thuế của khách (captcha do **người dùng nhập**, lấy token) — không tự giải captcha.
3. **Xử lý nghiệp vụ theo mô hình "tunnel giữ IP":** giống cách Cloudflare bắt cài **WARP** — một kênh an toàn về hạ tầng của ta để điều phối/nhận job, nhưng lưu lượng tới GDT vẫn **egress cục bộ** từ IP khách (split-tunnel), không đi vòng qua cloud của ta.

## 2. Câu hỏi nghiên cứu (trả lời có dẫn chứng, không phỏng đoán)

**A. Kiến trúc tunnel & egress**
- Cơ chế nào cho phép "kênh quản trị về cloud của ta" nhưng "egress tới GDT đi thẳng từ IP khách" (split-tunnel + reverse tunnel để không mở cổng vào máy khách)?
- WARP thật sự hoạt động thế nào (làm rõ hiểu lầm "VPN nhưng giữ IP"): so sánh **Cloudflare WARP / WARP Connector**, **Cloudflare Tunnel (`cloudflared`)**, **WireGuard split-tunnel thuần**, **Tailscale/headscale**, **frp/rathole (reverse proxy)**, và **kênh tự viết (WebSocket/gRPC/QUIC)**. Với mỗi phương án chấm theo: giữ được IP khách khi gọi GDT? reverse (không cần inbound)? đa nền tảng desktop? mTLS/xác thực mạnh? mã nguồn/giấy phép? độ phức tạp vận hành ở quy mô 100k.

**B. Thin vs thick daemon**
- Daemon **mỏng** (chỉ forward request GDT như relay, cloud lo phân trang/parse/khử trùng lặp/lưu) so với **dày** (daemon tự phân trang + parse + chuẩn hoá rồi đẩy dữ liệu gọn lên). Đánh đổi về: dữ liệu nhạy cảm truyền qua kênh, độ tin cậy, đặt logic nghiệp vụ trên máy **không tin cậy** (client), khả năng cập nhật. Khuyến nghị mặc định + lý do.

**C. Xác thực & quản lý bí mật/token**
- Enroll/pairing daemon ↔ tenant (device identity, thu hồi được).
- Token thuế lưu ở đâu (daemon local mã hoá vs cloud), vòng đời, xoay vòng; **tuyệt đối không lưu mật khẩu thuế thô** (Hiến pháp). Captcha hiển thị cho người dùng nhập ở đâu (UI local của daemon hay web UI của SaaS).
- **Giới hạn "tự động" theo token + captcha:** đồng bộ nền chỉ chạy khi token GDT còn hợp lệ; token hết hạn ⇒ đăng nhập lại cần captcha do người dùng nhập (không bypass). Nghiên cứu: token GDT sống bao lâu; chiến lược chạy nền tối đa khi token còn sống; cơ chế **nhắc khách xác thực lại** khi token chết; token dùng chung hay tách giữa nhánh daemon và nhánh relay của cùng một tenant.

**D. Độ tin cậy & vận hành**
- Máy khách offline ⇒ đồng bộ nền không chạy: cơ chế hàng đợi/lên lịch khi online; tùy chọn "thiết bị luôn bật" (mini-PC/router). Đóng gói đa nền tảng (Win/macOS/Linux), tự cập nhật, ký số, gỡ cài, dấu chân tài nguyên.

**E. Bảo mật (threat model)**
- Daemon nằm trên máy khách và chạm token thuế + `raw_json`: mô hình đe doạ, sandbox, chống giả mạo, **không log dữ liệu nhạy cảm** (theo `security.md`), mTLS + secret + pin chứng chỉ cho kênh về cloud, tối thiểu bề mặt.

**F. Khớp kiến trúc & pháp lý**
- Cách hiện thực `client-agent` sau interface `GdtTransport` và **mô hình lai** (khách có agent → đi IP khách; khách không có → rơi về pool relay VN của ADR-0002).
- Tuân thủ: chỉ truy xuất **MST của chính khách**; ủy quyền tenant rõ ràng (NĐ 13/2023, NĐ 123/2020, TT 78/2021); tôn trọng rate-limit; không bypass captcha.

## 3. Lằn ranh & ràng buộc (BẮT BUỘC)

- Tuân thủ Hiến pháp + toàn bộ `.claude/rules/*`. Khi một quy tắc mâu thuẫn, Hiến pháp thắng.
- **Chỉ nghiên cứu + thiết kế (+ POC tùy chọn).** KHÔNG build daemon production, KHÔNG code U1/U1a. Mọi mã POC cô lập trong `spikes/client-agent-egress/`; tài liệu trong `docs/`.
- **Gặp mơ hồ về hành vi API thuế → DỪNG và HỎI** (kèm phương án + một contract test để kiểm chứng). Không tự giả định cấu trúc/hành vi GDT.
- Bí mật: không hard-code, không commit; token mã hoá, vòng đời ngắn; không log token/mật khẩu/`raw_json`.
- Nếu có viết mã POC: TDD, `make lint` sạch; commit **nhỏ, riêng từng đơn vị**.

## 4. Đầu ra mong muốn

1. **ADR-0003 (Đề xuất)** `docs/adr/0003-*.md`: so sánh các phương án mục 2A theo bảng tiêu chí, **khuyến nghị** một kiến trúc, sơ đồ luồng (kênh quản trị vs egress cục bộ), và mô hình lai với ADR-0002.
2. **Threat model + thiết kế bảo mật** daemon (mục 2E) — có thể là mục trong ADR-0003 hoặc file riêng.
3. **(Tùy chọn) POC** `spikes/client-agent-egress/` chứng minh tối thiểu: từ một máy tại VN, daemon gọi `:30000/captcha` bằng IP cục bộ trả JSON `{key, content}`; kênh reverse tunnel về một Worker hoạt động; nếu được, e2e một truy vấn công khai. Kèm README ghi bằng chứng (giống spike egress hiện có).
4. **Ước lượng độ phức tạp/chi phí vận hành ở 100k** so với phương án pool relay của ADR-0002 (khi nào agent đáng dùng, khi nào relay đáng dùng).
5. **Danh sách câu hỏi mở** mang về phiên chính (đặc biệt các giả định về GDT cần đo).

## 5. Cách làm việc

Bắt đầu bằng **đọc tài liệu mục 0**, rồi vào **Plan Mode** trình một **kế hoạch nghiên cứu ngắn** (phạm vi, phương án sẽ so, có làm POC không, rủi ro, điểm mơ hồ) để duyệt **trước khi** làm. Nếu viết mã: theo vòng lặp `/plan-unit → /start-unit → /verify → /qa-unit`, review chéo bằng `security-reviewer` + `contract-guardian`. Viết tài liệu bằng tiếng Việt, giọng khớp các ADR hiện có.

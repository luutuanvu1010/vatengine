# Kế hoạch U1a — Dựng relay VN (ẩn qua Cloudflare Tunnel) + kiểm chứng egress `:30000`

> Sản phẩm của `/plan-unit U1a`. **Chưa thực thi** — U1a bị chặn tới khi có **VPS VN sẵn sàng**. Đây là bản để duyệt và chạy ngay khi VPS về.
> Nguồn: ADR-0001 (Amendment 2026-07-12), ADR-0002 (+3b), `.claude/rules/security.md` mục "Relay VN", `docs/CHECKLIST-NGHIEM-THU.md` mốc U1a.

## 1. Mục tiêu & phạm vi

Dựng đường egress GDT **đặt tại VN, ẩn hoàn toàn khỏi Internet công cộng**, và hiện thực transport `GdtTransport = "vn-relay"` để Worker gọi GDT qua nó. Kết thúc U1a khi: từ VN chạm được API `:30000` và trả `{key, content}`; Worker gọi GDT thành công qua relay; chỉ Worker của dự án gọi được relay.

**KHÔNG làm trong U1a:** logic đăng nhập/captcha nghiệp vụ (U1), truy vấn hóa đơn (U2+). U1a chỉ lo *đường ra* + transport + kiểm chứng.

## 2. Kiến trúc chốt — Tunnel ẩn VPS (giữ IP VN)

```
Worker (Cloudflare)
   │  HTTPS tới vatengine.khanhhoatravel.com.vn  + header Access service token (CF-Access-Client-Id/Secret)
   ▼
Cloudflare Access (chặn ở biên: chỉ token của Worker mới qua)
   ▼
Cloudflare edge ──(tunnel đã thiết lập sẵn, chiều RA từ VPS)──► cloudflared trên VPS VN
   ▼
[relay: cloudflared ingress trực tiếp  HOẶC  app forward mỏng ở localhost]
   ▼
GET https://hoadondientu.gdt.gov.vn:30000/...   ◄── cuộc gọi RA CỤC BỘ từ IP VN của VPS
```

**Vì sao hợp lệ & không dính lỗi 521:** 521 trước đây là "biên Cloudflare → GDT". Ở đây Cloudflare **chỉ** gánh chặng Worker → VPS; chặng VPS → GDT là cuộc gọi ra cục bộ từ IP VN của chính VPS (cloudflared/app chạy *trên* VPS mới là bên gọi GDT). IP VN được giữ; edge CF không cần chạm GDT.

**Đánh đổi (ghi rõ):** Tunnel đưa **một phụ thuộc Cloudflare trở lại điểm VN** (cloudflared). Chấp nhận được vì đổi lấy: **không mở cổng vào** trên VPS (giảm mạnh bề mặt tấn công), auth ở biên bằng Access, và vẫn giữ IP VN cho egress.

## 3. Quyết định con cần chốt trong U1a

1. **Relay = cloudflared ingress thẳng tới GDT, hay + app forward mỏng?**
   - *Ingress thẳng* (khuyến nghị thử trước): cloudflared route `vatengine.khanhhoatravel.com.vn` → `https://hoadondientu.gdt.gov.vn:30000` (đặt `originRequest.httpHostHeader`). **Không cần viết app**, ít bề mặt nhất, cloudflared vốn stateless. Rủi ro: kiểm soát "che metadata/không log" và rewrite Host/SNI phụ thuộc cấu hình cloudflared.
   - *App forward mỏng* (dự phòng): cloudflared → `localhost:PORT` (app Go single-binary) → GDT. Kiểm soát tường minh kỷ luật `security.md` (stateless, không log body, che metadata). Dùng khi ingress thẳng không đủ điều khiển.
2. **Xác thực Worker ↔ relay:** **Cloudflare Access service token** (khuyến nghị — hợp mô hình Tunnel; chặn ở biên trước khi vào tunnel) và/hoặc **mTLS** qua Access mTLS. → **Cần cập nhật `security.md`**: mục "Relay VN" hiện ghi "mTLS + shared-secret" cho mô hình cổng-mở; với Tunnel, cơ chế tương đương-hoặc-mạnh-hơn là "Access service token (+ tùy chọn mTLS) + tunnel ẩn, không cổng vào". Ghi là **đề xuất sửa luật**, chờ chốt (Hiến pháp cho phép sửa luật khi có lý do; giữ nguyên *ý định*: chỉ Worker của dự án gọi được).
3. **Ngôn ngữ app forward** (nếu chọn nhánh app): **Go single-binary** (khuyến nghị) — nhỏ, tĩnh, dễ hardening.

## 4. Việc cụ thể (theo TDD ở phần có code)

**a. Chuẩn bị & hardening VPS VN**
- Xác nhận VPS có **IP tĩnh VN**; cập nhật OS; tường lửa **chặn toàn bộ inbound** (chỉ SSH qua key, tốt nhất giới hạn IP quản trị); không dịch vụ nào lắng nghe ra Internet.
- Cài `cloudflared` chạy quyền tối thiểu (non-root, systemd), bật auto-update; tắt/che log nhạy cảm.

**b. Thiết lập Tunnel + Access**
- Tạo tunnel, gắn hostname `vatengine.khanhhoatravel.com.vn`, viết ingress rule (nhánh 3.1 đã chọn).
- Bật **Cloudflare Access** cho hostname; tạo **service token** cho Worker; policy chỉ chấp nhận token đó.
- Nạp token id/secret vào Worker qua **Workers Secrets** (không commit).

**c. Transport `vn-relay` trong `packages/gdt-client`**
- Hiện thực `GdtTransport` name = `"vn-relay"`: đổi base URL GDT → `vatengine.khanhhoatravel.com.vn`, đính header Access service token; **timeout + retry backoff**; **401 → dừng + báo hết phiên** (theo `gdt-adapter.md`). Với Tunnel HTTP, gọi thẳng như HTTP thường — **không cần envelope** `{method,url,headers,body}` như ghi chú cũ ở ADR-0001 (ghi chú đó cho hạn chế `fetch()` không proxy; Tunnel là reverse-tunnel HTTP nên không cần).
- Unit test (mock transport): base-swap đúng, gắn header đúng, timeout/retry, 401 dừng.

**d. Cập nhật luật**
- Sửa `.claude/rules/security.md` mục "Relay VN" theo quyết định 3.2 (Tunnel + Access, không cổng vào), giữ nguyên các ràng buộc stateless/không-log/không-lưu.

**e. Kiểm chứng egress (thủ công + contract)**
- Từ **VPS VN**: `curl https://hoadondientu.gdt.gov.vn:30000/captcha` → JSON `{key, content}` hợp lệ (đối chiếu cấu trúc với `backend/gdt_client.py` di sản).
- Từ **Worker** (wrangler dev --remote/deploy) → qua relay → GDT `/captcha` trả đúng payload.
- (Tùy) `cdn-cgi/trace` từ VPS để xác nhận **egress country = VN**.

## 5. Test & tiêu chí nghiệm thu (map checklist U1a)

- [ ] Relay **stateless tại VN**, **ẩn** (không cổng inbound công cộng); **chỉ Worker của dự án** (service token) gọi được; không lưu/không log body (token, `raw_json`).
- [ ] Từ VN: `curl :30000/captcha` (Host `hoadondientu.gdt.gov.vn`) trả `{key, content}`.
- [ ] Worker gọi GDT **thành công qua relay** (`vn-relay`): `/captcha` trả đúng payload.
- [ ] Bí mật (service token, tunnel credential) qua Workers Secrets, **không commit**, xoay vòng được.
- [ ] Transport có timeout+retry; **401 → dừng + báo**; unit test xanh; `make lint` sạch.
- [ ] (ADR-0002) Ghi lại **quan sát ngưỡng/độ trễ** để phục vụ tính cỡ pool IP về sau (chưa cần chốt số).

## 6. Rủi ro & điểm MƠ HỒ (DỪNG-và-HỎI trước khi giả định)

- **Cấu trúc `/captcha` của GDT** đúng `{key, content}`? → đối chiếu `backend/gdt_client.py`; nếu lệch → **dừng + contract test**, không nới assertion. *(Giả định về API thuế — không tự chốt thầm.)*
- **cloudflared fronting có được GDT chấp nhận không** (Host/SNI/TLS tới origin `103.9.200.142:30000`; có cần `httpHostHeader`/`noTLSVerify`)? → kiểm chứng thực tế; nếu ingress thẳng trục trặc → chuyển nhánh app forward (3.1 dự phòng).
- **Egress thật sự đi bằng IP VN của VPS** (không bị cloudflared định tuyến vòng)? → xác nhận bằng trace.
- **Access service token chặn được caller ngoài Worker**? → test gọi không token phải bị 403.
- **Độ trễ** Worker→CF→tunnel→VPS→GDT có chấp nhận được ở tải cao không? → đo, ghi nhận.

## 7. Bí mật cần thiết

Access service token (client id/secret), tunnel credentials, cấu hình origin — tất cả qua **Workers Secrets / Secrets Store**, không hard-code, không commit, xoay vòng được (theo `security.md`).

## 8. Điều kiện tiên quyết

- **VPS VN sẵn sàng** (IP tĩnh VN, Linux). *(Đang thuê — chưa xong thì chưa chạy U1a.)*
- ✅ **Zero Trust (Access) + hostname đã chốt:** `vatengine.khanhhoatravel.com.vn`. Yêu cầu kèm: zone `khanhhoatravel.com.vn` (hoặc bản ghi tương ứng) nằm trên Cloudflare để gắn Tunnel + Access; kiểm tra khả dụng/chi phí gói Access + Tunnel.

## 9. Vòng lặp & Definition of Done

`/plan-unit` (bản này) → `/start-unit U1a` (khi có VPS) → `/verify` (`make lint && make test`) → `/qa-unit` (review **`security-reviewer`** bắt buộc + **`contract-guardian`**). Xong khi mọi tiêu chí mục 5 xanh, không lộ bí mật, tài liệu (ADR/luật/checklist) cập nhật, commit nhỏ riêng. Sau U1a mới mở khóa **U1**.

# Spike — Gọi thử Egress GDT (T0 trực tiếp) + Fallback (T1 relay VN)

Mục tiêu: xác minh **thực tế** liệu Cloudflare Workers (gọi ra từ IP biên toàn cầu)
có tới được `hoadondientu.gdt.gov.vn` hay bị chặn theo địa lý — **trước khi chốt ADR-0001**.
Xem ADR-0001 mục **5B** để hiểu chiến lược probe + fallback.

> Ranh giới: spike chỉ gọi endpoint **công khai** để đo khả năng tới máy chủ. **Không** đăng nhập,
> **không** phá captcha, **không** thu thập dữ liệu — đúng ranh giới đạo đức/pháp lý trong Hiến pháp.

## Thành phần

- `src/transport.ts` — interface `GdtTransport` (hoán đổi đường ra) + hai hiện thực:
  - `DirectTransport` (**T0**): `fetch()` trực tiếp từ biên Cloudflare — thuần Cloudflare.
  - `VnRelayTransport` (**T1**): POST gói request tới relay đặt tại VN (mTLS + secret); relay chỉ *forward*.
- `src/index.ts` — Worker: `fetch` (gọi thử theo yêu cầu) + `scheduled` (Cron mỗi 15 phút).
- `wrangler.jsonc` — cấu hình + biến môi trường.

## Chạy

```bash
cd spikes/gdt-egress-probe
npm install
npm run dev          # mở http://localhost:8787/  (egress = IP máy bạn, KHÔNG đại diện biên CF)
# hoặc:
npm run deploy       # deploy để test IP egress THẬT của biên Cloudflare
```

Sau khi deploy, gọi URL Worker sẽ trả JSON dạng:

```jsonc
{
  "advice": "…",
  "decidedTransport": "direct-cf" | "vn-relay" | null,
  "results": [
    { "transport": "direct-cf", "verdict": "OK|GEO_BLOCKED|RATE_LIMITED|TIMEOUT|ERROR",
      "httpStatus": 200, "egressIp": "…", "egressCountry": "US", "latencyMs": 123 }
  ]
}
```

## Đọc kết quả

| `decidedTransport` | Ý nghĩa | Hành động |
|---|---|---|
| `direct-cf` (verdict OK) | Biên Cloudflare gọi được GDT | ✅ Giữ kiến trúc **thuần Cloudflare**. Chú ý `egressCountry` (thường không phải `VN`). |
| `vn-relay` | T0 bị chặn, chỉ T1 gọi được | ⚠️ Bắt buộc relay VN → **không còn thuần Cloudflare** (đã được chủ dự án chấp nhận). |
| `null` | Cả hai đều fail | ❌ Kiểm tra lại `GDT_PROBE_URL`, relay, `PROBE_TIMEOUT_MS`, hoặc GDT đang đổi hành vi. |

> Lưu ý: `verdict=OK` bao gồm cả 4xx nghiệp vụ (ví dụ 401/404) vì chúng vẫn chứng minh **tới được máy chủ**.
> Chỉ `403/451` mới coi là `GEO_BLOCKED`, `429` là `RATE_LIMITED`.

## Thử nghiệm phụ — "direct-origin" (gọi thẳng origin IP, bỏ qua fronting)

`GET /origin` (thêm `?force=tcp` để bỏ qua bước (a), chỉ test (b)) thử kết nối thẳng tới
origin IP đã biết của GDT (`GDT_ORIGIN_IP:GDT_ORIGIN_PORT`, mặc định `103.9.200.142:30000`),
giữ nguyên `Host` + SNI TLS = `hoadondientu.gdt.gov.vn`, path `GDT_ORIGIN_PATH` (mặc định
`/captcha`, endpoint công khai). Mục tiêu: kiểm tra xem việc phân giải tên miền (hiện route
vào lớp fronting/CDN đứng trước GDT) có phải là nguyên nhân khiến `direct-cf` (T0) không tới
được máy chủ thật hay không.

Hai cơ chế thử lần lượt (`DirectOriginTransport` trong `src/transport.ts`):

- (a) `fetch(url, { cf: { resolveOverride: originIp } })` — ghi đè phân giải DNS ở tầng Workers.
- (b) Nếu (a) ném lỗi runtime (không phải lỗi HTTP): TCP `connect()` thô (Workers TCP Sockets
  API) tới `originIp:originPort`, TLS bật, tự viết `GET /captcha HTTP/1.1` với `Host` = SNI.

**Kết quả đo được (qua `wrangler dev --remote`, tức chạy trên edge Cloudflare thật, 2026-07-12):**

| Cơ chế | Kết quả | Diễn giải |
|---|---|---|
| (a) `fetch` + `resolveOverride` | HTTP **521** từ chính Cloudflare (`error code: 521`), lặp lại ổn định qua nhiều lần gọi | `resolveOverride` được biên CF chấp nhận (không ném lỗi), nghĩa là request có tới được một lớp Cloudflare — nhưng CF trả 521 ("Web server is down") nên **không** chứng minh được kết nối trực tiếp tới origin thật; nhiều khả năng IP này bản thân cũng nằm sau (hoặc được CF coi là) một origin proxy mà CF không dựng được kết nối lúc probe. |
| (b) TCP `connect()` thô | Runtime từ chối ngay (~20–56ms): `"proxy request failed, cannot connect to the specified address"`, lặp lại ổn định qua nhiều lần gọi | Đây là lỗi ở **tầng runtime của Workers TCP Sockets** (qua proxy của `wrangler dev --remote`), không phải phân loại mạng (không phải GEO_BLOCKED/TIMEOUT/REFUSED ở tầng TCP thật) — tức là cơ chế (b) **bất khả thi để kết luận** trong điều kiện thử nghiệm này (giới hạn của công cụ, không phải bằng chứng về khả năng egress). |

**Kết luận cho spike này:** không có cơ chế nào trong hai cơ chế trên tạo ra bằng chứng
"tới được origin thật, nhận JSON captcha" (`{key, content}`). (a) bị chặn ở tầng CF (521),
(b) bị runtime tự chặn trước khi có thể đo mạng. Do đó phép thử "direct-origin" **không** đủ để
đảo ngược kết luận đã có về T0 (`direct-cf`) — cần thử trên môi trường đã `wrangler deploy` thật
(không qua proxy của `dev --remote`) nếu muốn loại trừ khả năng (b) chỉ là giới hạn của remote dev,
và cần xác nhận IP `103.9.200.142:30000` còn đúng/còn mở trước khi thử lại.

## Dựng T1 (relay VN) — khi cần

Relay là một dịch vụ **stateless** đặt trên VPS tại Việt Nam (Viettel/VNPT/FPT Cloud…),
nhận `POST {method,url,headers,body}` (kèm `x-relay-secret` / mTLS), gọi GDT và trả nguyên response,
kèm header `x-relay-egress-ip` / `x-relay-egress-country`. Nạp bí mật:

```bash
wrangler secret put VN_RELAY_URL
wrangler secret put VN_RELAY_SECRET
```

Các lựa chọn thay thế cần đánh giá thêm: **Cloudflare Tunnel / WARP Connector** hoặc **Magic WAN**
đặt điểm hiện diện tại VN (phức tạp hơn relay HTTP).

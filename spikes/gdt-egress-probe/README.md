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

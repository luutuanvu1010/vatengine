# RUNBOOK — Probe kiểm chứng `AUTH_PATH` (QĐ-2)

> Chạy trong **Claude Code**, tại thư mục dự án, **có bạn ngồi cùng** (nhập secret + đọc captcha).
> Mục tiêu: xác minh **thật** rằng `/api/security-taxpayer/authenticate` từ biên Cloudflare trả `200 + {token}`, để gỡ nhãn `CHƯA KIỂM CHỨNG`. **Không** phá captcha, **không** lưu mật khẩu thuế.
> Đây là **probe kiểm chứng dùng một lần** (như phép thử 5.1), KHÔNG phải một đơn vị U — mã probe là tạm, revert sau khi lấy bằng chứng.

---

Dán khối dưới đây vào phiên Claude Code:

Bạn tiếp nối dự án **VATCrawlbot**. Nhiệm vụ: chạy **probe kiểm chứng `AUTH_PATH`** theo QĐ-2 (`docs/plans/U1-plan.md`) và ranh giới bảo mật của Hiến pháp + `.claude/rules/security.md`. Tuân thủ tuyệt đối:

- **KHÔNG** yêu cầu người dùng dán mật khẩu thuế vào chat. Credential chỉ vào `.dev.vars` (đã gitignore) do **chính người dùng** gõ.
- **KHÔNG** in/log/trả về `password`, `cvalue`, hay `token` thô ở bất kỳ đâu — chỉ trả trạng thái + `hasToken: boolean` + tiền tố token đã **che** (vd 6 ký tự đầu + `...`).
- **KHÔNG** tự giải/bypass captcha — người dùng đọc ảnh và gõ.
- Mã probe là **tạm**: sau khi có bằng chứng, **revert** (không giữ route probe trong repo).

## Bước 1 — Người dùng nạp credential ephemeral

Hướng dẫn người dùng tạo/sửa `packages/gdt-client/.dev.vars` (hoặc trong thư mục spike sẽ chạy), thêm 2 dòng — **người dùng tự gõ, bạn không đọc giá trị**:

```
GDT_TEST_USERNAME=<MST/username tài khoản thuế hợp pháp của DN>
GDT_TEST_PASSWORD=<mật khẩu>
```

Xác nhận `.dev.vars` nằm trong `.gitignore` (đã có, dòng 19). Tuyệt đối không `git add` file này.

## Bước 2 — Dựng probe tạm (chạy trên biên Cloudflare)

Thêm một Worker probe **tạm** (ưu tiên đặt trong `spikes/gdt-egress-probe/` để không đụng mã production `packages/gdt-client`), import `getCaptcha` + `authenticate` từ `@vatcrawlbot/gdt-client`, dùng một `GdtTransport` `direct-cf` tối thiểu (bọc `fetch` toàn cục của Worker). Phục vụ 2 route:

- `GET /probe` → gọi `getCaptcha(transport)`; trả về **một trang HTML** nhúng thẳng `content` (SVG captcha) để người dùng xem trong trình duyệt, kèm `key` (ẩn trong form) và ô nhập `cvalue` + nút gửi tới `/probe/login`. Cũng đọc `cdn-cgi/trace` để ghi `egressCountry`.
- `POST /probe/login` → lấy `key` + `cvalue` từ form; đọc `GDT_TEST_USERNAME`/`GDT_TEST_PASSWORD` từ `env`; gọi:
  ```ts
  authenticate(transport, { username, password, ckey: key, cvalue })
  ```
  Trả trang kết quả: `httpStatus`, `egressCountry`, `hasToken` (boolean), và **tối đa 6 ký tự đầu token + "..."** (che). Nếu `GdtError SESSION_EXPIRED` (401) hoặc 200-không-token → hiển thị đúng nhánh đó. **Không in token đầy đủ / password.**

Chạy: `wrangler dev --remote` (biên thật — để khớp T0, giống phép thử 5.1). Mở URL `http://localhost:8787/probe` trên trình duyệt.

## Bước 3 — Người dùng thực hiện đăng nhập thật

Người dùng nhìn ảnh captcha trên trang `/probe`, gõ `cvalue`, bấm gửi. Đọc kết quả:

- **`200` + `hasToken: true`** → `AUTH_PATH` **ĐÚNG, đã kiểm chứng**. Ghi lại: ngày, `httpStatus=200`, `egressCountry`, `hasToken=true` (KHÔNG ghi token). Nếu sai captcha (200 không token) → lấy captcha mới (`/probe`) và thử lại vài lần.
- **`403`/`451`** → biên bị chặn địa lý cho login (khác với captcha!) → **DỪNG**, ghi lại verdict `GEO_BLOCKED`, báo người dùng: đây là bằng chứng mới cho thấy login có thể cần relay VN — mở lại thảo luận, **không** tự chốt.
- **Lỗi khác** → ghi nguyên trạng, DỪNG và hỏi.

## Bước 4 — Dọn dẹp bắt buộc (ngay sau khi có kết quả)

1. Người dùng **xoá 2 dòng credential** trong `.dev.vars` (hoặc xoá file). Xác nhận không còn.
2. **Revert mã probe tạm**: `git checkout -- spikes/gdt-egress-probe/` (hoặc xoá file probe mới thêm). Chạy `git status` → xác nhận không còn dấu vết probe/secret.
3. Kiểm tra không có secret nào lọt vào log phiên.

## Bước 5 — Nếu probe XANH: chốt bằng chứng + gỡ nhãn

1. `packages/gdt-client/src/endpoints.ts` — **xoá** chú thích `CHƯA KIỂM CHỨNG` trên `AUTH_PATH`, thay bằng: `// ĐÃ KIỂM CHỨNG (<ngày>): probe đăng nhập thật trả 200 + token, egress <country>. (Không ghi token.)`
2. `packages/gdt-client/gdt-contract-schema.json` — cập nhật phần `authenticate` sang trạng thái đã xác nhận (khớp cấu trúc `{token}` quan sát thật).
3. `docs/CHECKLIST-NGHIEM-THU.md` — ghi dòng bằng chứng probe (ngày, status, egress, hasToken) dưới U1; gỡ mục "nợ kiểm chứng AUTH_PATH".
4. Cân nhắc thêm Amendment vào `docs/adr/0001-nen-tang-cloudflare.md` xác nhận login T0 chạy (song song captcha ở Amendment #3).
5. `make lint && make test` xanh → commit nhỏ: `docs+chore(u1): kiểm chứng AUTH_PATH bằng probe đăng nhập thật — gỡ nhãn CHƯA KIỂM CHỨNG`.

## Definition of Done (probe)

Có kết quả tái lập được (status + egress + hasToken, đã che nhạy cảm) ghi vào checklist/ADR; `.dev.vars` credential đã xoá; mã probe tạm đã revert (`git status` sạch); nếu xanh thì nhãn `AUTH_PATH` đã gỡ + schema cập nhật; không lộ mật khẩu/token ở bất kỳ đâu. Nếu `GEO_BLOCKED`/lỗi: DỪNG và báo, không tự chốt.

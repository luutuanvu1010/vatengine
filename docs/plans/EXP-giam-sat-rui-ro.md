# Kế hoạch đơn vị — GIÁM SÁT rủi ro (mục C: contract định kỳ + probe egress)

> Bước "kế hoạch ngắn" (skill `/plan-unit`). **KHÔNG viết code hiện thực trong lần chạy này.** Ngày: 2026-07-14.
>
> Nguồn "làm gì": [CHECKLIST mục C](../CHECKLIST-NGHIEM-THU.md) (2 gạch đầu dòng) + [ADR-0001 §5B](../adr/0001-nen-tang-cloudflare.md) + [.claude/rules/gdt-adapter.md](../../.claude/rules/gdt-adapter.md) mục "Đường ra (egress) & fallback". Đây là **mục C của lộ trình đã có** (không phải đơn vị mới bịa) — điều kiện "toàn bộ xong" yêu cầu 2 vòng này chạy ổn định. Chủ dự án chốt (2026-07-14): làm **TRƯỚC deploy**.

## Tiền đề đã có — TÁI DÙNG, KHÔNG dựng lại (bằng chứng)

- **`GdtTransport.probe(): Promise<ProbeResult>`** đã là interface chuẩn — [transport.ts:20](../../packages/gdt-client/src/transport.ts). `createDirectCfTransport` (T0) đã hiện thực — [directTransport.ts:14](../../packages/gdt-client/src/directTransport.ts).
- **`classify(status, timedOut, errored) → ProbeVerdict`** đã có: `OK | GEO_BLOCKED | RATE_LIMITED | TIMEOUT | ERROR` (403/451→GEO_BLOCKED, 429→RATE_LIMITED) — [transport.ts:24](../../packages/gdt-client/src/transport.ts). **KHÔNG viết lại phân loại.**
- **Contract test đã tồn tại**, chạy qua `make test-contract` (nhóm `contract`, gọi GDT thật): `captcha`, `invoices`, `detail` `.contract.test.ts` khớp `gdt-contract-schema.json` — [captcha.contract.test.ts](../../packages/gdt-client/test/contract/captcha.contract.test.ts). **Đơn vị này chỉ LÊN LỊCH + CẢNH BÁO chúng, không viết lại.**
- **Cron + Durable Object đã có mẫu** ở [apps/sync-worker/wrangler.jsonc](../../apps/sync-worker/wrangler.jsonc) (cron `0 3 * * *`, DO `TENANT_LIMITER`). Probe egress đi theo cùng khuôn.
- **CI đã có** `.github/workflows/ci.yml`.

## Phạm vi

Dựng **hai chuông báo động tự chạy theo lịch**: (1) **Contract định kỳ** — CI theo lịch chạy `make test-contract`, lệch schema/egress → báo để cập nhật adapter; (2) **Probe egress định kỳ** — Worker Cron gọi `transport.probe()`, phân loại verdict, lưu trạng thái sức khỏe, khi `GEO_BLOCKED`/`RATE_LIMITED` ổn định → cảnh báo.

**NGOÀI phạm vi (không làm):**
- **KHÔNG kích hoạt T1/relay VN.** T1 đang TREO, chưa dựng (ADR-0001, `security.md`). Vòng probe chỉ **phát hiện + cảnh báo**; việc bật T1 là đơn vị khác nếu tương lai cần.
- KHÔNG viết lại contract test hay `classify`/`probe`.
- KHÔNG đụng vòng đời token (đó là [EXP-vong-doi-token-gdt.md](EXP-vong-doi-token-gdt.md)).

## File sẽ tạo/sửa

**Vòng 1 — Contract định kỳ (CI):**
- `.github/workflows/contract-schedule.yml` *(tạo)* — workflow `schedule:` (cron) chạy `make test-contract`; thất bại → mở issue/cảnh báo (kênh: **Điểm mơ hồ #1**).

**Vòng 2 — Probe egress (gộp vào `apps/sync-worker` — quyết định #2):**
- `apps/sync-worker/src/egressProbe.ts` *(tạo)* — hàm probe: gọi `createDirectCfTransport().probe()` → `classify` → cập nhật health-state → phát cảnh báo khi verdict xấu **ổn định (3 tick liên tiếp — #3)**.
- `apps/sync-worker/src/health.ts` *(tạo)* — logic "ổn định" (đếm chuỗi verdict xấu, ngưỡng 3) thuần, test offline.
- `apps/sync-worker/src/index.ts` *(sửa)* — `scheduled()` phân nhánh theo `cron` expression: cron sync hiện có `0 3 * * *` giữ nguyên; **thêm cron probe `*/15 * * * *`** → gọi egressProbe. Health-state lưu qua DO `TENANT_LIMITER` sẵn có hoặc thêm một DO health nhỏ (chốt lúc hiện thực, ưu tiên tái dùng cơ chế DO).
- `apps/sync-worker/wrangler.jsonc` *(sửa)* — thêm cron `*/15 * * * *` vào `triggers.crons`.

## Test viết trước (TDD)

- **`unit`** `health.test.ts`: (a) 1 verdict OK → trạng thái khỏe; (b) N verdict `GEO_BLOCKED` liên tiếp (N=ngưỡng) → "cần cảnh báo"; (c) xen kẽ OK reset chuỗi; (d) `RATE_LIMITED` phân biệt `GEO_BLOCKED`; (e) `TIMEOUT`/`ERROR` không lập tức báo động (chờ ổn định).
- **`unit`** `scheduled.test.ts` (Miniflare): `scheduled()` gọi `transport.probe()` (mock transport trả verdict) → ghi health-state đúng + phát cảnh báo đúng nhánh; probe KHÔNG ném lỗi làm chết cron.
- **`integration`** (tùy #2): nếu dùng DO health-state → test lưu/đọc trạng thái qua nhiều tick.
- **KHÔNG** thêm test gọi GDT thật vào `make test` — probe thật chỉ chạy runtime/`test-contract` (`.claude/rules/testing.md`). Contract test thật đã có sẵn, workflow chỉ gọi lại.

## Tiêu chí nghiệm thu

- `make lint` sạch; `make test` xanh (không giảm coverage; `health.ts` ≥ 80%).
- Workflow `contract-schedule.yml` cấu hình đúng cron + gọi `make test-contract`; mô phỏng thất bại → sinh cảnh báo (chứng minh bằng cấu hình + 1 lần chạy thủ công `workflow_dispatch`).
- Worker probe: test chứng minh chuỗi `GEO_BLOCKED` ổn định → đúng một cảnh báo; OK → im lặng. Cron trigger khai báo trong wrangler.
- Không có lời gọi GDT thật trong `make test`; probe cô lập qua `GdtTransport` (không `fetch()` trực tiếp — `gdt-adapter.md`).

## Ràng buộc bắt buộc chạm tới

- **Cô lập adapter:** probe **chỉ** qua `GdtTransport`/`createDirectCfTransport`; tuyệt đối không `fetch()` GDT trực tiếp trong worker (`gdt-adapter.md`).
- **Bảo mật:** probe gọi endpoint **công khai** (`PUBLIC_PROBE_PATH`/`/captcha`), **không** token, **không** dữ liệu tenant → không đụng KEK/mật khẩu. Cảnh báo chỉ log metadata không nhạy cảm (verdict, status, latency, egressCountry) — không log body (`security.md`).
- **Đa tenant:** probe egress là **toàn hệ thống**, không theo tenant → không cần `tenant_id`. (Khác vòng sync.) Nêu rõ để không nhầm.
- **401/captcha:** không liên quan (endpoint công khai, không đăng nhập, không giải captcha).

## Rủi ro & phụ thuộc

- **Egress trong CI:** `make test-contract` từ GitHub Actions runner (egress GitHub, KHÁC egress Cloudflare T0). Nó phát hiện **GDT đổi API** tốt, nhưng **không** thay được probe egress T0 (phải chạy từ Worker để phản ánh đúng đường ra thật). Hai vòng bổ sung nhau, không trùng.
- **Giới hạn Worker Cron:** probe nhẹ, không lo CPU/wall.
- **Kênh cảnh báo chưa có hạ tầng** → Điểm mơ hồ #1.

## Quyết định đã chốt (chủ dự án, 2026-07-14)

1. **Kênh cảnh báo = audit log + Workers observability.** Ghi audit CRITICAL + Workers Logs (đã bật `observability`); đánh dấu `GdtContractDriftError` CRITICAL. Không hạ tầng ngoài, hợp `security.md`. Email/webhook để tách đơn vị sau nếu cần. *Kiểm chứng:* test khẳng định nhánh verdict xấu ghi đúng bản ghi audit cảnh báo.
2. **Probe egress = cron thứ hai trong `apps/sync-worker`** (không tạo worker mới) — tái dùng gdt-client + DO + cron sẵn có, giảm bề mặt deploy.
3. **Ngưỡng "ổn định" = 3 tick xấu liên tiếp; chu kỳ cron probe = mỗi 15'** (`*/15 * * * *`). OK ở giữa reset chuỗi. Cảnh báo phát đúng một lần khi vượt ngưỡng.

Kết thúc: kế hoạch đã đủ chặt để hiện thực. Bước kế tiếp — `/write-prompt` (sinh prompt thực thi) hoặc hiện thực trực tiếp theo vòng lặp (test-trước → tối thiểu → lint/test → review chéo).

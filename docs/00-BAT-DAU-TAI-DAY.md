# Bắt đầu tại đây — Điểm vào dự án VATCrawlbot

Tài liệu này là **cửa vào duy nhất** cho mỗi phiên làm việc mới. Đọc file này trước, nó chỉ tới mọi thứ còn lại.

Cập nhật lần chốt: **2026-07-11** · Vị trí lộ trình: **hết U0 → sẵn sàng U1**.

---

## 1. Dự án một câu

SaaS multi-tenant truy xuất hóa đơn điện tử đầu vào/đầu ra trực tiếp từ Tổng cục Thuế (`hoadondientu.gdt.gov.vn`) bằng tài khoản MST hợp pháp của chính doanh nghiệp; chuẩn Enterprise, hướng tới 100.000 khách hàng. Ngăn xếp: **Cloudflare Workers + TypeScript** (chốt theo ADR-0001).

## 2. Bản đồ tài liệu (theo thứ tự thẩm quyền)

| Tài liệu | Vai trò | Tầng quản trị | Trạng thái |
|---|---|---|---|
| `CLAUDE.md` | **Hiến pháp** — nguyên tắc tối cao, ranh giới pháp lý, quy tắc cứng, Definition of Done | Hiến pháp | ✅ đã cập nhật sang Cloudflare |
| `docs/adr/0001-nen-tang-cloudflare.md` | **Quyết định kiến trúc** chọn Cloudflare (Workers/TS, Postgres+Hyperdrive, Queues/Workflows/DO, egress T0/T1) | ADR | ✅ Accepted |
| `.claude/rules/*.md` | **Luật** vận hành theo chủ đề (gdt-adapter, multi-tenant, security, testing) | Luật | ✅ đã cập nhật |
| `.claude/settings.json` + `.claude/hooks/*` | **Cổng kiểm soát** ép lint/test + chặn hành động nguy hiểm | Bắt buộc kỹ thuật | ✅ đã cập nhật |
| `.claude/skills/*` + `.claude/agents/*` | **Quy trình đóng gói** — vòng lặp + review chéo | Quy trình | ✅ đủ bộ |
| `docs/CHECKLIST-NGHIEM-THU.md` | **Bảng điểm** — tiêu chí thông qua từng mốc U0–U12 | Theo dõi | ✅ đang dùng |
| `KIEN_TRUC_VA_KE_HOACH.md` | Nguồn chân lý **"làm gì"** — mô hình dữ liệu (mục 7), lộ trình (mục 12) | Tài liệu nguồn | có banner ADR |
| `TRIEN_KHAI_BANG_CLAUDE_CODE.md` | Nguồn chân lý **"làm thế nào"** — phương pháp, đơn vị U0–U12 (mục 3) | Tài liệu nguồn | có banner ADR |
| `KHAO_SAT_TINH_NANG_NIBOT.md` | Mốc tính năng đối thủ (feature parity) | Tham chiếu | — |
| `backend/` (Python) | **Di sản MVP** — giữ để port sang TS ở U1–U3, **không phát triển tiếp** | Tham chiếu | đóng băng |

Khi một tầng dưới mâu thuẫn tầng trên: **tầng trên thắng** — sửa tầng dưới, không né. Đổi kiến trúc ⇒ viết/sửa ADR + sửa Hiến pháp tường minh.

## 3. Mô hình làm việc: mỗi đầu việc một vòng lặp, có sub-agent kiểm đầu ra

Mỗi mốc (U#) đi trọn một vòng lặp, gọi bằng lệnh `/slash`:

```
/plan-unit U#   → lập kế hoạch (file/test/tiêu chí/rủi ro/điểm mơ hồ)
/write-prompt U# → sinh prompt thực thi chuẩn (tùy chọn)
/start-unit U#   → thực thi TDD một đơn vị
/verify          → make lint + test, đối chiếu Definition of Done
/qa-unit         → SUB-AGENT kiểm đầu ra (chặn nếu Critical)
   └─ đạt → thông qua + commit → mốc kế tiếp
   └─ chưa → tự vòng lại /start-unit
```

**Mỗi đầu việc có sub-agent kiểm đầu ra** (do `/qa-unit` điều phối, chạy song song):

| Sub-agent | Kiểm gì | Dùng cho mốc |
|---|---|---|
| `dod-auditor` | Definition of Done tổng quát (test/coverage/tài liệu/code chết/không lệch Hiến pháp) | **mọi mốc** |
| `contract-guardian` | Cô lập adapter GDT, 401, cổng hợp đồng, không phá captcha, egress | U1, U2, U3 (và khi đụng `packages/gdt-client`) |
| `security-reviewer` | Bí mật, không lưu mật khẩu thô, cách ly tenant/RLS | U4, U6, U8, U12 (và khi đụng auth/token/tenant) |

## 4. Trạng thái chốt phiên này

- ✅ Chọn nền tảng Cloudflare + ghi ADR-0001 (Accepted); chốt Postgres+Hyperdrive (A2) + TypeScript (B1).
- ✅ Gỡ rủi ro egress: cơ chế `GdtTransport` T0/T1 + probe; spike chạy thật → GDT trả 200 từ colo SG (đạt sơ bộ).
- ✅ Sửa Hiến pháp + 4 Luật + 2 hook sang stack mới.
- ✅ Dựng khung U0: monorepo `apps/api` (Hono) + `packages/gdt-client` + CI + Makefile.
- ✅ Đủ bộ skill/agent vòng đời + checklist nghiệm thu U0–U12.

## 5. Việc còn treo (làm đầu phiên sau)

1. **Commit** đợt cuối (checklist + skill/agent + banner):
   ```bash
   cd "/Users/tuanbao/Documents/Projects/VATCrawlbot"
   git add -A && git commit -m "docs: chốt tài liệu + checklist + bộ skill/agent vòng đời"
   ```
2. **Xác nhận U0 xanh**: `make up && make lint && make test` (đánh nốt ô cuối U0 trong checklist).
3. **Nạp lại skill**: khởi động lại phiên Claude Code để nhận skill mới trong `.claude/skills/`.
4. **Egress**: theo dõi thêm ở U1–U3 (nhiều colo, tải cao, endpoint có token).

## 6. Khởi động phiên mới — làm gì trước

1. Đọc file này + `docs/CHECKLIST-NGHIEM-THU.md` để biết mốc kế tiếp.
2. Chạy `/plan-unit U1` (GDT Adapter: captcha + authenticate) — port từ `backend/gdt_client.py` sang `packages/gdt-client` bằng TypeScript.
3. Theo vòng lặp mục 3 cho tới khi `/qa-unit` báo ĐẠT, rồi tick U1 trong checklist và commit.

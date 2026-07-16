# U23 — Nhật ký tiến độ điều phối (A → E)

> "Tín hiệu khách quan" của vòng điều phối (`TRIEN_KHAI_BANG_CLAUDE_CODE.md` mục 5).
> Một dòng mỗi đơn vị sau khi đóng: `[đơn vị] — DONE/BLOCKED — commit — ghi chú`.
> Nguồn spec: `docs/plans/U23-plan-4-tinh-chinh.md` + `docs/plans/U23-prompts.md`
> (**hiện nằm ở MAIN worktree `/Users/tuanbao/Documents/Projects/VATCrawlbot/docs/plans/`, CHƯA track git** — xem "Điều kiện môi trường" bên dưới).

## Thứ tự & trạng thái

| Đơn vị | Mô tả | Trạng thái |
|---|---|---|
| **A** | Dòng hàng ở màn Chi tiết (apps/web) | ✅ DONE — `53036e8` |
| B | Dòng hàng vào xlsx/csv (packages/export) | ⬜ chưa |
| C | Tổng quan tối giản (apps/web) | ⬜ chưa |
| D1 | Migration UNIQUE(mst) + UNIQUE(tenant_id,username) | ⬜ chưa |
| D2 | POST /tax-accounts auto mst + hạn mức | ⬜ chưa |
| D3 | POST /tax-accounts/:id/disconnect | ⬜ chưa |
| D4 | Rút gọn màn kết nối (apps/web) | ⬜ chưa |
| E1 | U17 — đăng ký + gói dịch vụ (BE) | ⬜ chưa |
| E2 | U18 — Admin API super-admin (BE) | ⬜ chưa |
| E3 | U19 — Cổng Admin `/admin` (FE) | ⬜ chưa |
| E4 | U21 — Dashboard giám sát Admin (FE) | ⬜ chưa |

## Điều kiện môi trường (bắt buộc để cổng DoD chạy đúng)

- **Worktree này CẦN `node_modules` RIÊNG.** Khi bắt đầu, worktree KHÔNG có `node_modules`;
  vì nằm lồng trong repo chính (`.claude/worktrees/…`), Node resolve `@vat/*` NGƯỢC LÊN
  `node_modules` của repo chính → trỏ về `packages/*` của MAIN worktree (bản `1da6ffe`,
  THIẾU `roleGuard.ts`/`bpAttempt` — chỉ có trong nhánh này). Hệ quả: `tsc` báo lỗi GIẢ
  (`RoleGuardVerdict`/`assertConnectionRoleSafe`/`checkConnectionRole` không tồn tại;
  `bpAttempt` không thuộc `SyncJobMessage`). **Đã chạy `npm ci`** → worktree có node_modules
  riêng, `@vat/*` link về packages của chính nhánh này → `make lint`/`make test` xanh.
  Lỗi này KHÔNG phải drift mã nguồn; nhánh nhất quán. Phiên sau nếu thấy lỗi tương tự: chạy `npm ci`.

## Nhật ký chi tiết

### A — Dòng hàng ở màn Chi tiết — DONE (`53036e8`) — 2026-07-16
- **Drift phát hiện & đã chốt với chủ dự án:** bảng dòng hàng ĐÃ được hiện thực sẵn bởi
  commit `2674378` ("ĐV4 — trả & hiện dòng hàng"), nằm trong `feat/cloudflare-stack-u0`
  (đúng nhánh spec đối chiếu), đã có test. Spec §4.2 (FE-4) liệt nó là "việc cần làm" là
  SÓT — mâu thuẫn với §4.1 vốn ghi backend đã trả `dongHangHoa` (cùng commit `2674378`).
- **Quyết định chủ dự án:** tinh chỉnh + siết test (KHÔNG dựng lại — tránh nguồn sự thật thứ hai).
- **Đã làm:** đồng bộ chữ thông báo rỗng đúng spec (RED→GREEN); thêm test (a) số dòng +
  thứ tự stt + đủ 7 cột; (b)+(d) giá trị >2^53 giữ chuỗi/không ép float. `sluong` giữ THÔ.
- **Verify:** `make lint` EXIT=0; `make test` EXIT=0 (toàn bộ workspace). invoiceDetail 5/5.
- **QA:** dod-auditor → **ĐẠT**, không Critical/Major (2 Minor đã xử lý: assert đủ 7 cột;
  bỏ dấu chấm cuối cho khớp spec verbatim). Không cần security-reviewer/contract-guardian
  (chỉ chạm apps/web, không token/đa tenant/gdt-client).
- **Ghi chú vận hành:** luồng sync production có bật `fetchDetail` (`apps/sync-worker/src/deps.ts:71`)
  → dữ liệu dòng hàng thực sự được điền.

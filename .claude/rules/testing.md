---
paths:
  - "apps/**/*.ts"
  - "packages/**/*.ts"
---

# Luật: TDD & chất lượng

Cụ thể hoá nguyên tắc TDD và Definition of Done trong Hiến pháp. Runtime: Vitest + `@cloudflare/vitest-pool-workers` (Miniflare), Biome, `tsc` (xem ADR-0001).

## Bắt buộc

- Viết test trước khi viết code hiện thực (TDD). Một đơn vị công việc chỉ "xong" khi test tương ứng đỏ → xanh, không phải viết test sau để khớp code đã có.
- Độ phủ tầng nghiệp vụ (`packages/**` và logic trong `apps/**`, trừ wiring thuần) ≥ 80%. Nếu PR làm giảm độ phủ, phải giải thích rõ hoặc bổ sung test trước khi merge.
- Test phân nhóm theo thư mục/tag: `unit` (mặc định, chạy offline, có mock), `contract` (gọi mạng thật tới GDT, chỉ chạy khi có cờ hoặc trong job định kỳ), `integration` (cần Postgres thật / binding thật).
- `make test` mặc định chỉ chạy `unit` + `integration` (không gọi mạng ra ngoài GDT thật). `make test-contract` chạy riêng nhóm `contract`.
- Mock mọi lời gọi `fetch` tới `hoadondientu.gdt.gov.vn` trong test `unit` (mock `GdtTransport`). Không để test unit phụ thuộc mạng thật — không ổn định, vi phạm "tôn trọng máy chủ thuế".
- `make lint` (Biome + `tsc --noEmit`) phải sạch trước khi coi một đơn vị là xong.

## Khi gặp mơ hồ

Nếu không chắc một hành vi của API GDT (ví dụ giá trị `ttxly` mới chưa gặp), viết test mô tả kỳ vọng dựa trên tài liệu/log thực tế đã quan sát, đánh dấu rõ giả định trong mô tả test, và hỏi người dùng xác nhận trước khi coi là hoàn thành.

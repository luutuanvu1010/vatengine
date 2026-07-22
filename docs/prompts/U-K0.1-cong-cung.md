# U-K0.1 — Cổng cứng (làm nền enforcement bắt buộc, không thể bỏ qua)

**Loại:** đơn vị nền, làm **trước U-K1**. **Nguyên tắc:** dựng cổng cứng trước, rồi mới đổ code vào.

## Đính chính quan trọng về "cứng, không thể bỏ qua"

Không thể "dựng TẤT CẢ phép kiểm trước rồi mới đổ code" — vì phép kiểm mà **đối tượng chưa tồn tại** (Registry) hoặc **chưa được sửa** (tô kiểu nội tuyến trong `FilterBar`) thì bật lên là CI đỏ ngay. Cách đúng:

> Dựng **NỀN bắt buộc** trước (thứ khiến mọi cổng trở nên *không thể bỏ qua*). Sau đó **mỗi đơn vị U cắm phép kiểm riêng của nó vào đường ống đã-bắt-buộc-sẵn**, và phép kiểm đi kèm chính code làm nó xanh.

Nền bắt buộc = **branch protection + required status check + require PR + CODEOWNERS review** trên trunk. Đây là mắt xích quyết định; thiếu nó thì lint/test/hook đều chỉ là *cố vấn*.

## Vì sao các lớp khác KHÔNG đủ "cứng" (đã kiểm chứng phiên 2026-07-22)

- **Test trong `make test`**: bỏ qua được (`test.skip`, xoá test).
- **Hook `.claude/`**: chỉ chạy trong phiên Claude; file hook sửa được → không phải bảo đảm.
- **CI hiện tại**: chạy `make test` nhưng **chưa xác nhận có branch protection** — nếu chưa bật, đỏ vẫn merge được và push thẳng trunk được (chính `ci.yml` ghi chú từng có lỗ hổng này).
- **Hệ kiểu (`tsc`)**: cứng theo cấu trúc (không biên dịch = không chạy) — mạnh nhất, nhưng lách được bằng `any`/`@ts-ignore` nếu không cấm.

## Xếp hạng lớp cứng (đích đến)

1. **Hệ kiểu** — Registry có kiểu; cấm `any`/`@ts-ignore` ở paths Registry/UI. (Nền ở U-K1.)
2. **Branch protection + required check** — phía GitHub, chỉ admin đổi, đổi thì audit được. (U-K0.1 — đây.)
3. **Chống tự vô hiệu hoá** — CODEOWNERS khoá file cổng; Biome cấm `test.skip/.only`. (U-K0.1.)

> Nói thẳng: "không thể bỏ qua **tuyệt đối**" không tồn tại — admin luôn đổi được. Chuẩn cứng thực tế: *không contributor nào bỏ qua được trong luồng thường; chỉ một hành động admin tường minh, audit được, mới đổi.*

## Deliverables U-K0.1

### 1. CODEOWNERS — ĐÃ TẠO
`/CODEOWNERS` (repo root). **Việc cần:** thay `@CHU-DU-AN` bằng tài khoản/nhóm GitHub thật. Chỉ có hiệu lực khi bật "Require review from Code Owners" (bước 3).

### 2. Biome cấm test bị vô hiệu hoá — verify-then-apply
Đã kiểm 2026-07-22: **không có** `test.skip/.only` trong repo → bật an toàn, không đỏ. Trong `biome.json`, thêm (sau khi xác nhận tên rule đúng với Biome 1.9.4):
```jsonc
"linter": { "rules": {
  "recommended": true,
  "suspicious": {
    "noConsoleLog": "off",
    "noFocusedTests": "error",   // đã thuộc recommended — khai tường minh cho rõ
    "noSkippedTests": "error"    // XÁC NHẬN có trong 1.9.4 (nursery?) trước khi bật; rule lạ sẽ làm `biome check` đỏ
  }
}}
```
> Không bật mù: nếu `noSkippedTests` thuộc nursery/chưa có ở 1.9.4, để `nursery` hoặc nâng Biome — kiểm bằng `npx biome check .` cục bộ trước.

### 3. Branch protection trên GitHub — CHECKLIST cho admin (mắt xích quyết định)
Trunk hiện là `feat/cloudflare-stack-u0` (KHÔNG phải `main`). Trên GitHub → **Settings → Branches → Add branch ruleset/protection rule** cho trunk:

- [ ] **Require a pull request before merging** (cấm push thẳng trunk).
- [ ] **Require status checks to pass** → chọn job **`quality`** (và **`secret-scan`**) làm *required*.
- [ ] **Require branches to be up to date before merging**.
- [ ] **Require review from Code Owners** (kích hoạt CODEOWNERS).
- [ ] **Do not allow bypassing the above settings** (áp cả admin — hoặc chấp nhận admin bypass có audit).
- [ ] (Khuyến nghị) **Require linear history** + **Require conversation resolution**.

Không có bước này → mọi cổng khác vẫn chỉ là cố vấn.

### 4. Vá matcher hook (từ audit) — snippet giao (vùng `.claude` khoá ghi)
Trong `.claude/settings.json`, đổi matcher `"Edit|Write"` → `"Edit|Write|MultiEdit|NotebookEdit"` ở **PreToolUse** và **PostToolUse** — chỉ khi xác nhận các tool đó đang bật.

### 5. Bước CI convention-check — HOÃN sang U-K3 (ghi trước để nhất quán)
`.github/ci.yml` là vùng khoá ghi trong phiên Cowork → giao snippet. Thêm vào job `quality` (khi U-K3 đã dọn tô-kiểu-nội-tuyến, để không đỏ oan):
```yaml
      - name: Kiểm quy ước giao diện (Luật ui.md)
        run: bash scripts/check-ui-conventions.sh
```
Vì `quality` là *required check*, bước này tự thành bắt buộc.

## Hợp đồng cổng (gate contract) — cho mọi đơn vị U sau

Mỗi phép kiểm mới **phải** rơi vào một trong ba đường ống mà job `quality` (đã required) chạy: `biome check` · `typecheck` (`tsc`) · `make test`. Không đặt phép kiểm ở nơi required-check không chạm tới. Nhờ vậy: cắm phép kiểm = tự bắt buộc, không cần đụng lại branch protection.

## Nghiệm thu U-K0.1 (làm sao biết cổng đã cứng)

- Mở **một PR thử cố ý sai** (vd thêm `test.skip` hoặc lỗi lint) → GitHub phải **chặn nút merge** (không chỉ hiện dấu đỏ). Đây là bằng chứng required-check + branch protection hoạt động.
- Thử **push thẳng vào trunk** → bị từ chối (require PR).
- Sửa `biome.json` trong một PR → PR yêu cầu **review của Code Owner**.

Chỉ khi ba phép thử trên đúng như kỳ vọng thì U-K0.1 mới "xong".

## Chủ dự án review gì — cổng nào
- **Xem:** CODEOWNERS đã thay handle thật chưa; ruleset trunk đã bật đủ mục checklist chưa.
- **Tiêu chí:** PR sai bị chặn merge; push thẳng bị chặn; sửa file cổng cần review.
- **Cổng:** GitHub branch protection (server-side) + job `quality`/`secret-scan` (required) + CODEOWNERS.

# Prompt điều phối — tự chạy U-K2 → U-K4 (Loop Engineering, bản CỨNG HOÁ)

Dán nguyên khối dưới đây vào Claude Code (mở tại repo). Bám `TRIEN_KHAI_BANG_CLAUDE_CODE.md` mục 1 (vòng lặp lõi), mục 5 (điều phối), DoD 1.2, checklist 6 — bổ sung chốt an toàn để chạy tự động mà không đi sai / không mất tính năng / không commit hỏng.

**Triết lý:** tự chạy hết K2→K4 **không cần can thiệp CHỪNG NÀO tín hiệu còn xanh và không mất tính năng**; chỉ **DỪNG cứng** khi chạm dấu hiệu nguy hiểm khách quan (dưới). Tín hiệu khách quan (test/lint/tsc/parity) là điều kiện dừng, không phải "trông có vẻ xong".

---

Chạy cụm **U-K2 → U-K3 → U-K4** theo Loop Engineering của dự án. Báo cáo tiếng Việt. Tự chạy tuần tự đến hết, nhưng tuân thủ nghiêm các mục PRE-FLIGHT, CẤM, DỪNG CỨNG, PARITY dưới đây.

## PRE-FLIGHT (chạy trước; sai bất kỳ ý nào → DỪNG, báo, không bắt đầu)
- Cây làm việc **sạch** (`git status` trống). Nếu còn thay đổi tài liệu/governance đang chờ (vd `.claude/rules/ui.md`, `CODEOWNERS`, `CLAUDE.md`, `docs/prompts/*`) → commit chúng thành MỘT commit "governance" trước, để commit từng đơn vị không lẫn tài liệu.
- `packages/domain` tồn tại (U-K1 đã commit) và **baseline `make lint && make test` XANH**. Nếu đỏ ngay từ đầu → DỪNG (không xây trên nền hỏng).
- Ghi lại SHA gốc: `git rev-parse HEAD` làm mốc. Mỗi đơn vị sẽ là **đúng một commit** để có thể revert độc lập.

## ĐIỀU PHỐI (mục 5) — LẦN LƯỢT, MỖI LẦN MỘT ĐƠN VỊ, thứ tự U-K2 → U-K3 → U-K4
Với mỗi đơn vị `n`:
1. **Đọc spec + bối cảnh:** `docs/prompts/U-K{n}-prompt.md` + `CLAUDE.md` + `.claude/rules/ui.md` + `docs/design/CHUAN-giao-dien-va-anh-xa-du-lieu.md`. Tái dùng Registry/primitive/`period.ts`; không lặp logic.
2. **CHỤP MỐC PARITY (trước khi sửa):** liệt kê (hoặc viết characterization test cho) tập hiện có: cột bảng (nhãn + thứ tự), trường LỌC được, trường SẮP được, cột FILE XUẤT, và các route/nút. Đây là mốc để chứng minh KHÔNG mất tính năng.
3. **Vòng lặp lõi (1.1):** kế hoạch ngắn (file sẽ đụng — chỉ trong "Phạm vi TRONG" của spec; test sẽ viết) → **VIẾT TEST TRƯỚC** theo Tiêu chí nghiệm thu → hiện thực tối thiểu → `make lint && make test`, dán kết quả → đỏ thì đọc log tự sửa, lặp **tối đa 6 vòng**.
4. **KIỂM PARITY (sau khi sửa):** tập ở bước 2 SAU phải **bằng** tập TRƯỚC, chỉ khác đúng thay đổi spec nêu (K2: hợp nhất nhãn; K3: thêm `ChonKy` + primitive; K4: đổi tên nút + mặc định kỳ + tự tải). Mất/đổi bất kỳ cột/lọc/sắp/route nào ngoài spec → **DỪNG**.
5. **DoD (1.2) + hồi quy:** test xanh; `make lint` sạch (gồm `tsc` — bảo đảm biên dịch được, chống crash); coverage **không giảm**; không lộ bí mật; cập nhật tài liệu. Rồi chạy lại **toàn bộ** `make lint && make test` (hồi quy) — không phá phần cũ.
6. **Review chéo bằng subagent ĐỘC LẬP** — subagent phải xác nhận đủ 4 ý, nghi ngờ = coi như CHƯA xong:
   (a) không test nào bị xoá/`skip`/`only`/nới lỏng; (b) PARITY giữ (không mất tính năng); (c) không `as any`/`@ts-ignore`/không sửa file cổng để né; (d) đạt tiêu chí nghiệm thu đơn vị.
7. **Commit NHỎ** (chỉ khi TẤT CẢ xanh + parity giữ), thông điệp rõ, đúng phạm vi đơn vị. Ghi một dòng tiến độ. Chỉ khi xong mới sang đơn vị kế.

## CẤM TUYỆT ĐỐI (chống xanh-giả, chống crash, chống trôi)
- **KHÔNG** xoá/bỏ qua/nới lỏng test đang có; **KHÔNG** `test.skip`/`.only`; **KHÔNG** hạ ngưỡng coverage.
- **KHÔNG** dùng `as any` / `@ts-ignore` / `@ts-expect-error` để dập lỗi kiểu — lỗi kiểu là tín hiệu thật, phải sửa đúng.
- **KHÔNG** sửa file cổng/cấu hình để né cổng: `biome.json`, `tsconfig*`, `vitest.config*`, `Makefile`, `.github/`, `.claude/`, `package.json` (workspaces) — trừ khi spec đơn vị yêu cầu tường minh.
- **KHÔNG** đổi schema/migration; **KHÔNG** lệnh phá huỷ (`rm -rf`, `git reset --hard`, `git push --force`); **KHÔNG** thêm phụ thuộc mới; **KHÔNG** đụng file ngoài "Phạm vi TRONG" của đơn vị.
- **KHÔNG** nới allowlist `ORDER BY`, **KHÔNG** sửa Zod `invoiceFilterSchema` để né; **KHÔNG** bịa nhãn mã trạng thái (theo `statusLabels.ts`).
- **KHÔNG** commit khi đỏ/đang hỏng. Chỉ commit ở trạng thái xanh trọn vẹn.

## DỪNG CỨNG (dừng & báo trạng thái + đề xuất; KHÔNG đi tiếp) khi:
- Pre-flight sai; hoặc gặp mơ hồ / phải đoán cấu trúc phản hồi API thuế; hoặc chạm quyết định vượt spec.
- Một đơn vị vẫn đỏ sau 6 vòng; hoặc **cùng một test đỏ lặp ≥3 lần** (thrashing).
- PARITY vỡ (mất/đổi tính năng ngoài spec); hoặc coverage sẽ giảm; hoặc buộc phải làm một điều trong mục CẤM.

## KHI KẸT (an toàn)
Nếu một đơn vị không hoàn tất: **để nguyên cây làm việc** (không commit hỏng), DỪNG, báo (đơn vị nào, đỏ/parity vỡ ở đâu, đề xuất). **KHÔNG tự revert** các đơn vị đã commit xanh trước đó; mốc rollback là SHA gốc đã ghi (chỉ người quyết định revert). Mỗi đơn vị một commit → lỗi về sau revert đúng commit đó.

## KẾT THÚC CỤM
Sau U-K4: chạy lại toàn bộ `make lint && make test`; tóm tắt 3 commit; đối chiếu 3 yêu cầu gốc — K3 giao (1) chọn kỳ dropdown; K4 giao (2) mặc định tháng hiện tại và (3) đổi tên nút "Lọc dữ liệu"/"Đồng bộ và tải xuống" + tự tải. **KHÔNG tự merge** — để tôi review.

---
**Cổng hỗ trợ:** `gate-dod.sh` (Stop hook) tự ép `make lint && make test` cuối mỗi lượt; nếu đã bật branch protection (U-K0.1) thì CI `quality` còn chặn commit/PR khi đỏ.

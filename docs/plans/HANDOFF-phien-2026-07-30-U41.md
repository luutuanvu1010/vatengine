# HANDOFF U41 — Tổng quan & Footer

## Kết phiên 2026-07-31 — ĐÃ LÊN PRODUCTION

1. **Trạng thái:** 11 commit (`eeb5ee0`→`945148c`) đã đẩy, **CI xanh**; **`vat-web` đã deploy hai lượt** — `f54c0e42` (mã U41, bundle `index-D69GxB-7.js`) rồi `22fe994a` (**bản đang chạy**, thêm changelog v2.4, bundle `index-CgTVusCH.js`) trên `vatengine.tourdao.vn`. Không đụng DB / sync-worker / api (thuần frontend, **không migration** ⇒ quay lui = deploy lại bản `vat-web` trước đó).
2. **Đã xác minh trên bản ĐANG CHẠY** (tải bundle công khai về grep, không tin lệnh deploy báo): có `Cần xử lý` · `Chỉ số đã đo được` · `Pháp nhân` · `liên hệ kế toán trưởng` · địa chỉ thật `Vĩnh Điềm Trung`; **0** chuỗi `XEM THỬ`/`DỮ LIỆU BỊA`/mã số thuế bịa; **0** địa chỉ bịa `Trần Phú`. *(Chuỗi `Kết xuất & Convert` CÓ trong bundle là bình thường — nó nằm ở từ điển `i18n/vi.ts` + `changelog.ts`, cờ `SHOW_EXPORTS` chặn việc TẠO MỤC chứ không xoá chuỗi; `exportsHidden.test.tsx` khoá cả ba điểm nối dây.)*
3. **Việc còn nợ:** *(changelog v2.4 ĐÃ viết và ĐÃ deploy — xác minh có trong bundle đang chạy.)* Chưa ai soi Tổng quan trên **production với số liệu thật** — đo truy vấn nặng nhất (`/invoices/summary` không lọc ngày, tenant 32.603 hóa đơn) là 19 ms nóng / 392 ms nguội **thẳng vào Postgres**, chưa tính đường qua Worker; nếu chậm, gỡ khối "Chỉ số đã đo được" là đủ, không ảnh hưởng phần khác. Chưa chạy review chéo `dod-auditor`. `?xem-thu=1` **chưa chặn `/goi-chia-se`** (lọt ra API thật).

## Ba bài học của phiên — đọc trước khi làm việc tương tự

- **Đọc MÃ THOÁT, không đọc dòng đếm test.** `npx vitest run` báo `528 passed` trong khi vẫn có `Errors 2 errors` và exit ≠ 0. Ba lượt CI đỏ liên tiếp, trong đó có **lỗi màn trắng thật** (`moiKy.data ?` kiểm truthy rồi truy cập sâu `.total.count` ⇒ ném lúc render ⇒ React tháo cả cây). Luôn chạy `make test` (đúng lệnh CI, phủ mọi workspace) và đọc exit code.
- **KHÔNG `git add -A` khi repo có nhiều phiên cùng ghi.** Một tệp nháp `zz-dbg.test.tsx` của phiên khác lọt vào commit `cb14290` ⇒ CI đỏ ở Biome. Luôn `git add <đường-dẫn-cụ-thể>`.
- **Test phải chờ ĐÚNG thứ nó kiểm.** Ca `(c)` chờ chữ "Lối tắt" (hiện ngay, không phụ thuộc dữ liệu) rồi khẳng định về khối còn đang tải — máy dev nhanh nên xanh, runner CI chậm nên đỏ. Nguy hơn cả việc đỏ: mọi `queryBy…toBeNull()` trong ca đó **xanh giả** khi chưa render.

## Nguồn thiết kế

`docs/design/claude-design/dac-ta-tong-quan-va-footer.md` + 8 ảnh mockup (đã vào git, commit `f4c5991`). ⚠️ Mockup có **địa chỉ pháp nhân BỊA** ("Trần Phú/Vĩnh Nguyên") và vẽ "Kết xuất & Convert" dù cờ đã tắt — đừng chép mù, đọc phần đính chính trong `.md`.

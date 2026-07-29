# U37b — Nhật ký tiến độ

Một dòng mỗi gói: `[gói] — DONE/BLOCKED — commit — ghi chú`.
Đặc tả: `docs/plans/U37b-plan.md`.

| Gói | Trạng thái | Commit | Ghi chú |
|---|---|---|---|
| Gói 0 — endpoint danh sách khách hàng | ✅ DONE | `b5f8e35` | ⚠️ Làm TRƯỚC khi có `U37b-plan.md` — bỏ qua cổng QA1, sai quy trình `/plan-unit → /write-prompt → /start-unit`. Không cuộn lại vì nằm đúng phạm vi §8 đã duyệt và có 12 test canh. Kèm đính chính: bộ lọc `nmmst` vốn ĐÃ có sẵn trên FilterBar |
| Gói 1 — ô tìm live chọn khách hàng | ✅ DONE | `9cfa5cf` | Primitive `ComboBox` + `boDau/khopTim` + `ChonKhachHang` + đấu vào FilterBar. 24 test mới. GOLDEN ĐỔI CÓ CHỦ ĐÍCH: `filterBarDirection.test.tsx` — nhãn ô bên mua đổi "MST người mua" → "Khách hàng", và FilterBar từ nay CẦN QueryClientProvider |
| Gói 2 — bảng `goi_chia_se` + migration | ✅ DONE | `3bd87f4` | 8 test xanh. Bẫy `_journal.json` NỔ đúng dự đoán: 0020.when sinh ra là 29/07 < 0019 (02/08) ⇒ đã đặt lại `0019.when + 60000`. **Cổng dừng 1 ĐÃ QUA**: migration áp production 2026-07-29, hậu kiểm `hau-kiem-bang.mjs goi_chia_se` → **8/8 ĐẠT** (bảng, RLS ENABLE+FORCE, policy, vat_app S/I/U và KHÔNG DELETE; UNIQUE khoa_r2 + 2 FK + 3 index đều có thật) |
| Gói 3 — hạ tầng bucket công khai | ✅ DONE (hạ tầng đã dựng) | `20cee3f` | Bucket `vat-chia-se` + `docs.tourdao.vn` (min-TLS 1.2) + lifecycle 30 ngày prefix `goi-hoa-don/` + `r2.dev` **disabled** — hậu kiểm 4/4 đạt. ✅ Phần treo đã kiểm chứng: `ssl_status` active; gốc bucket và khóa không tồn tại đều trả **404** ⇒ không liệt kê được nội dung, giả định "khóa là thứ duy nhất bảo vệ file" đứng vững |
| Gói 4a — tầng truy vấn phát hành gói | ✅ DONE | `d82802e` | `listHoaDonChoGoi` (NGUỒN DUY NHẤT sinh `ref` — ràng buộc bảo mật) + `demTienDoGoi` (đếm từ `tep_hoa_don_goc`, QĐ-B8). 11 test xanh |
| Gói 4b — endpoint tạo gói | ✅ DONE | `af4a181` | `POST /goi-chia-se`. 14 test xanh. Test bắt 2 lỗi THẬT: token chỉ có 100 bit (không phải 128 — ánh xạ 1 byte→1 ký tự vứt 3 bit), và `nguoi_tao` vỡ FK khi token còn hạn mà người dùng đã bị xóa |
| Gói 4c-1 — hàm thuần `dungGoiZip` | ✅ DONE | `5c98f1d` | Đặt ở `packages/export` (đã có fflate + @vat/domain) chứ không phải apps/api. `boDau` chuyển sang @vat/domain dùng chung. 14 test |
| Gói 4c-2/4c-3 — GET tiến độ + POST đóng gói | ✅ DONE | `ed7ee67` | GET thuần đọc; POST bầu người đóng bằng UPDATE có điều kiện; hết hạn 7 ngày đặt lúc PHÁT HÀNH |
| Gói 5 — thu hồi + danh sách + audit | ✅ DONE | `ed7ee67` | Thu hồi mở MỌI VAI, xóa R2 trước đổi trạng thái sau, idempotent; audit cả phát hành lẫn thu hồi, chiTiet không chứa khóa |
| Gói 6 — giao diện | ✅ DONE | `93f5d4b` | `TaiHoaDonGoc`: ba vế mở nút mỗi vế một lý do riêng, cảnh báo inline + checkbox (QĐ-B11), poll tiến độ, link + thu hồi. 13 test |
| Gói 7 — tài liệu + deploy | ✅ DONE (mã + deploy) | `1208bbe` | `06-BINDING_MAP.md` §3d đọc TỪ MÃ; var `URL_CHIA_SE`. **Deploy 2026-07-29**: `vat-api` `a7f71a3c` (binding `CHIA_SE` + `URL_CHIA_SE` xác nhận trong output), `vat-web` `0a271b75`. Smoke: hai endpoint mới trả 401 khi chưa đăng nhập (tức đã sống); bundle công khai `index-BczMOr_P.js` có đủ `goi-chia-se` / `Tải hóa đơn gốc` / `khach-hang` / `khoảng 1 tuần` |
| **Nghiệm thu THẬT bằng tay** | 🔶 CHƯA LÀM | — | Cần chủ dự án: chọn khách hàng → xuất → mở link ở cửa sổ ẩn danh → giải nén, **mở `invoice.html` bằng trình duyệt thấy đúng tờ hóa đơn** → đối chiếu số hóa đơn/MST/tổng tiền → thu hồi → link trả 404 |
| Thiết kế lại bố cục nút tải | ✅ DONE | `22bccff` | Chủ dự án: nút "chen chúc, chật hẹp". Nguyên nhân là SAI TẦNG chứ không phải px: `hanhDongPhu` đã chứa 5 nhóm trên một hàng ngang, mà đây là quy trình nhiều bước có trạng thái sống. Tách thành Card riêng xếp dọc, đặt giữa thẻ Tra cứu và thẻ Kết quả. Thêm 3 primitive bố cục `Hang`/`Cot`/`ChuPhu` (chỉ nhận khoảng cách theo thang token) vì thư viện chưa hề có — trước đó mọi màn phải tự tô `display:flex` trong `features/`, đúng thứ ui.md mục 2 cấm. **13 test của TaiHoaDonGoc không phải sửa một dòng** — bố cục đổi mà hợp đồng hành vi không đổi |
| **Tiêu chí 9 — review chéo** | ✅ ĐẠT | `22bccff` | Chạy `dod-auditor` + `security-reviewer` độc lập trên `af4a181..22bccff` (Gói 4b→7 + refactor UI). Kết quả tóm tắt ở mục "Kết quả review chéo" bên dưới |
| Vá theo review | ✅ DONE | `2b1ec6d` | 2 phát hiện đã đóng: (a) `POST /goi-chia-se` thiếu audit_log; (b) comment schema còn nói "30 ngày" sau khi QĐ-6 đổi sang 1 tuần |

## Kết quả review chéo (2026-07-29, phạm vi `af4a181..22bccff`)

### `security-reviewer` — KHÔNG có phát hiện Critical/High

Không tìm được đường rò dữ liệu chéo tenant. Những điểm được xác nhận bằng kiểm chứng chứ không phải đọc lướt:

- **Chuỗi tin cậy của `ref`** — mối lo lớn nhất, vì `runHoSoGocJob` (U37a) tin thẳng `msg.ref` không tra lại quyền sở hữu. Đã `grep` toàn repo xác nhận route tạo gói là **producer duy nhất** của loại message này; `ref` chỉ dựng từ `listHoaDonChoGoi` (lọc `tenantId` từ JWT đã verify); `taoGoiSchema.strict()` từ chối mọi trường lạ. Client không có cửa nào tự đặt `ref`.
- **Entropy khóa R2** — kiểm bằng `node`: bảng chữ đúng 32 ký tự không trùng, `256 % 32 == 0` nên không lệch phân bố; `26 × 5 = 130 bit`. Đếm THEO KÝ TỰ, đúng cách.
- **Thứ tự thu hồi** — xóa R2 trước, đổi trạng thái sau ⇒ cửa sổ hỏng duy nhất là "UI còn hiện link nhưng bấm vào 404", KHÔNG phải "DB nói đã thu hồi mà file vẫn tải được". Hỏng về phía an toàn.
- **Migration 0020** — đủ `ENABLE` + `FORCE`, policy cách ly, `GRANT` chỉ S/I/U không DELETE.

**Phát hiện (reviewer xếp Thấp, đã sửa vì đối chiếu luật thì cao hơn thế):** `POST /goi-chia-se` không ghi `audit_log`. Reviewer lập luận bước tạo chưa công khai gì. Nhưng `.claude/rules/security.md` bắt buộc audit cho "đồng bộ hóa đơn" **và** "xuất dữ liệu", mà bước này kích hoạt kéo hồ sơ gốc từ GDT cho một khách hàng/kỳ cụ thể — chính là chỗ người dùng CHỌN kéo dữ liệu của ai. Hệ quả thật: gói được tạo rồi bỏ đó (không phát hành) là không tra được qua `audit_log`, đúng kịch bản cần điều tra nhất khi nghi lạm dụng. Đã vá: ghi `tao_goi_chia_se` **trong cùng giao dịch** với việc chèn gói (tách ra thì có cảnh gói tạo xong mà vết thì mất).

### `dod-auditor` — KHÔNG có vi phạm Critical

- **Coverage đo thật**: `goiChiaSe.ts` 97,63% câu lệnh / 100% hàm; `TaiHoaDonGoc.tsx` 96,03%; `goiHoaDonZip.ts` 100%; `goiHoaDon.ts` 100/100. Các file 0% khác (`Pagination`, `ColumnMenu`, `DonationQr`) **không nằm trong diff U37b** — nợ cũ, không phải do đơn vị này gây ra.
- Tiêu chí §5: 1,2,4,5,6 ĐẠT có dẫn chứng file:dòng. Tiêu chí 3 và 8 nằm ở Gói 2/3 (trước phạm vi review) — auditor **không tự tái lập được** vì không có `DATABASE_URL`/credentials Cloudflare, ghi rõ là dựa vào nhật ký cũ chứ không tự khẳng định.
- Xác nhận tiêu chí 7 được đánh dấu CHƯA LÀM **trung thực**, không đánh dấu xong khống.
- **Minor đã vá**: `packages/db/src/schema/goiChiaSe.ts` còn ghi "giao diện phải nói khoảng 30 ngày" trong khi QĐ-6 đã đổi sang 1 tuần và mọi nơi khác đã đúng.

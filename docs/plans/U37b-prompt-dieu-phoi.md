# U37b — Prompt điều phối tuần tự (6 gói) theo Loop Engineering

> **Một prompt duy nhất** vận hành vòng lặp điều phối (`TRIEN_KHAI_BANG_CLAUDE_CODE.md` mục 5):
> chạy lần lượt sáu gói còn lại, mỗi gói đi trọn vòng lặp con (spec → test trước → hiện thực →
> tự kiểm chứng → review chéo → commit), giữa các gói chạy **hồi quy toàn bộ** + ghi nhật ký.
> Đặc tả chốt ở `docs/plans/U37b-plan.md` (QA1 duyệt 2026-07-29, 11 quyết định QĐ-B1…QĐ-B11).
>
> **Cách dùng:** dán toàn bộ khối mã dưới vào một phiên Claude Code. Có **2 cổng dừng bắt buộc**
> — sau Gói 2 (chờ áp migration production) và sau Gói 3 (chờ chủ dự án dựng bucket).
> Viết theo skill `write-prompt` của dự án.

---

```
NHIỆM VỤ ĐIỀU PHỐI: Thực thi tuần tự 6 gói còn lại của U37b — phát hành gói hóa đơn gốc cho MỘT
khách hàng, chia sẻ qua link công khai. Thứ tự CỐ ĐỊNH: Gói 1 → 2 → 3 → 4 → 5 → 6 → 7.
MỖI GÓI MỘT COMMIT — không trộn gói. (Gói 0 đã xong ở commit b5f8e35.)

ĐỌC TRƯỚC KHI BẮT ĐẦU:
- `CLAUDE.md` (Hiến pháp — đặc biệt §Nguyên tắc bằng chứng, §Kiến trúc quy tắc cứng, §Định nghĩa
  hoàn thành, §Khi gặp mơ hồ).
- `docs/plans/U37b-plan.md` — TOÀN BỘ. Đây là spec chốt. Đặc biệt §2 (11 quyết định
  QĐ-B1..QĐ-B11 — KHÔNG mở lại), §4 (thiết kế theo gói), §5 (9 tiêu chí nghiệm thu), §6 (rủi ro).
- `docs/plans/U37-HO-SO-KHOI-DONG-xuat-hoa-don-theo-mau.md` §4.5/§4.7 (bằng chứng endpoint +
  nội dung gói ZIP của GDT), §4.6/§4.8 (số đo production). ĐỪNG đo lại — đã có.
- `docs/plans/HANDOFF-phien-2026-07-28-U37a.md` §5 (cạm bẫy hạ tầng đã đụng phải).
- `.claude/rules/*.md` áp cho file mỗi gói chạm (nêu ở từng gói).

QUY TẮC ĐIỀU PHỐI (bắt buộc, áp cho MỌI gói):
1. Làm ĐÚNG MỘT gói mỗi lần, thứ tự cố định. KHÔNG gộp, KHÔNG nhảy, KHÔNG làm trước phần gói sau.
2. Với mỗi gói chạy trọn vòng lặp con theo `.claude/skills/start-unit/SKILL.md`:
   (a) đọc spec gói trong `U37b-plan.md` + rules áp dụng;
   (b) trình bày kế hoạch ngắn (file sẽ sửa, test sẽ viết, tiêu chí nghiệm thu);
   (c) VIẾT TEST TRƯỚC (đỏ) theo nhóm đúng của `testing.md` — CHẠY và DÁN kết quả đỏ, không chỉ nói;
   (d) hiện thực tối thiểu để test xanh — không dư phạm vi;
   (e) tự kiểm chứng `make lint && make test`. Đỏ → tự sửa và lặp (d)-(e).
3. Cổng review chéo khi lint/test đã xanh: `dod-auditor` LUÔN LUÔN; `security-reviewer` bắt buộc ở
   Gói 2, 4, 5 (bảng mới, phát hành công khai, thu hồi). QA trả Critical → CHẶN, sửa rồi chạy lại.
4. Đóng gói: commit nhỏ, thông điệp rõ. Đổi hợp đồng API → cập nhật `docs/06-BINDING_MAP.md`
   TỪ MÃ (đọc mã rồi ghi, KHÔNG chép từ kế hoạch).
5. HỒI QUY giữa các gói: sau khi đóng mỗi gói chạy TOÀN BỘ `make test`. Đỏ hồi quy → dừng, sửa
   trước khi đi tiếp.
6. NHẬT KÝ: sau mỗi gói cập nhật một dòng ở `docs/plans/U37b-tien-do.md`.
7. CỔNG DỪNG sau Gói 2 và sau Gói 3 — xem mô tả từng gói. Không chạy một mạch qua hai cổng này.

RÀNG BUỘC BẰNG CHỨNG (Hiến pháp):
- Mọi khẳng định về mã/hệ thống phải truy được về file:line hoặc lệnh+kết quả tái lập.
- BÀI HỌC PHIÊN 29/07: đã hai lần khẳng định sai vì SUY TỪ MỘT NGUỒN mà không đọc nguồn còn lại
  ("trang chưa lọc được theo MST" — suy từ Registry, không mở FilterBar; "hóa đơn thiếu tên" —
  đọc count(DISTINCT) mà quên hàm đó bỏ qua NULL). TRƯỚC KHI khẳng định một thứ CHƯA CÓ, phải
  grep/đọc chính file hiện thực, không suy từ khai báo.

──────────────────────────────────────────────────────────────────────────────
GÓI 1 — Ô tìm live chọn khách hàng (apps/web)
Spec: U37b-plan.md §4 Gói 1. Rules: `.claude/rules/ui.md`.
Làm: primitive MỚI `ComboBox` trong `components/ui/primitives.tsx`; thay ô `Field` nhập MST thô ở
`FilterBar.tsx:137-146`; khớp cả tên lẫn MST, bỏ dấu, không phân biệt hoa/thường; chọn xong ràng
`nmmst` CHÍNH XÁC; nút xóa lựa chọn; bàn phím ↑/↓/Enter/Esc; 4 trạng thái; `biCatBot` → hiện dòng
"còn nữa, gõ thêm để thu hẹp".
Nguồn dữ liệu: `GET /invoices/khach-hang` (Gói 0, đã có).
CẨN TRỌNG: `apps/web/test/conventions/ui-luat.test.ts` cấm hex màu và `style=` trên input/select
trong `features/` — kiểu phải nằm trong primitive.
Test trước: primitive (khớp bỏ dấu, bàn phím, chọn/xóa) + FilterBar (chọn khách → `nmmst` vào
bộ lọc; đổi sang Mua vào → `nmmst` bị xóa như hành vi hiện có).

──────────────────────────────────────────────────────────────────────────────
GÓI 2 — Bảng `goi_chia_se` + migration
Spec: §4 Gói 2. Rules: `multi-tenant.md`, `security.md`, `deploy.md`.
BA CẠM BẪY BẮT BUỘC — đọc §4 Gói 2, đừng bỏ sót cái nào:
  (a) `FORCE ROW LEVEL SECURITY` viết tay (drizzle-kit chỉ sinh ENABLE);
  (b) khối `DO $$ … GRANT SELECT,INSERT,UPDATE … TO vat_app … RAISE WARNING … END $$` TRONG
      migration — dự án đã quên 2 lần, cả 2 chỉ lộ ở production;
  (c) mốc `when` trong `_journal.json` của idx 15..19 đang ở TƯƠNG LAI (02/08/2026) ⇒ migration
      sinh mới sẽ bị `drizzle-kit migrate` ÂM THẦM BỎ QUA dù in "applied successfully". Đặt
      `when = <mục trước>.when + 60000`.
Khuôn có sẵn: `packages/db/migrations/0019_u37a_tep_hoa_don_goc.sql`.
Test trước: khuôn `packages/db/test/integration/tepHoaDonGoc.test.ts` (ràng buộc + RLS cho CẢ role
owner lẫn non-owner + GRANT dựng role `vat_app` thật).
★ CỔNG DỪNG 1: đóng gói xong → BÁO CÁO và DỪNG. Chủ dự án chạy `make migrate` (Claude bị cổng an
toàn chặn ghi production). Sau đó chạy `node scripts/hau-kiem-bang.mjs goi_chia_se` và dán kết quả.
KHÔNG đi tiếp khi chưa hậu kiểm đạt.

──────────────────────────────────────────────────────────────────────────────
GÓI 3 — Hạ tầng bucket công khai (CHỦ DỰ ÁN THAO TÁC)
Spec: §4 Gói 3. Claude KHÔNG tự tạo bucket/tên miền — chuẩn bị lệnh + kiểm chứng.
Claude làm: soạn đúng lệnh `wrangler` cần chạy; thêm binding R2 thứ hai vào wrangler.jsonc của
worker phát hành; viết checklist hậu kiểm.
★ CỔNG DỪNG 2: DỪNG chờ chủ dự án tạo `vat-chia-se` + gắn `docs.tourdao.vn` + lifecycle 30 ngày
theo prefix `goi-hoa-don/` + XÁC NHẬN `r2.dev` ĐÃ TẮT. Rồi mới sang Gói 4.

──────────────────────────────────────────────────────────────────────────────
GÓI 4 — Phát hành gói
Spec: §4 Gói 4 (đọc kỹ, gói này nhiều ràng buộc nhất). Rules: `multi-tenant.md`, `security.md`.
QĐ áp dụng: B7 (vat-api đóng gói), B8 (đếm từ `tep_hoa_don_goc`), B9 (khoảng ngày trống ⇒ CHẶN),
B10 (tên file tải về; tên khách KHÔNG vào khóa R2).
🔴 `ref` PHẢI dựng từ hàng `hoa_don` đã lọc `tenant_id` của phiên — `runHoSoGocJob` tin thẳng
`msg.ref` (review bảo mật U37a). KHÔNG nhận `ref` từ client.
Tái dùng: `packages/export/src/zipStream.ts`; `packages/sync` (`KHOA_TAI_NGUYEN_CHUNG`,
`khoaHoSoGoc`, `buildHoSoGocMessages`). KHÔNG đi qua `apps/api/src/storage.ts` (đọc trọn vào RAM).
Test trước: gói có đúng `2×N + 3 + 1` mục và MỘT bộ tài nguyên tĩnh; trùng `<khhdon>-<shdon>` vẫn
ghép đúng cặp `.xml`/`.html`; 0 hóa đơn thành công ⇒ KHÔNG phát link; cách ly tenant.

──────────────────────────────────────────────────────────────────────────────
GÓI 5 — Thu hồi + audit
Spec: §4 Gói 5. Thu hồi = xóa object R2 + `trang_thai='da_thu_hoi'`. `audit_log` cho phát hành và
thu hồi, `chiTiet` qua `maskSensitive()`, ghi trong `withTenant`.
Test trước: thu hồi rồi thì link không tải được nữa; audit ghi đủ hai hành động; tenant A không
thu hồi được gói của tenant B.

──────────────────────────────────────────────────────────────────────────────
GÓI 6 — Giao diện
Spec: §4 Gói 6. QĐ-B11: cảnh báo là KHỐI INLINE cạnh nút, KHÔNG dựng `Modal`.
Điều kiện mở nút có BA vế (QĐ-B4 + B1 + B9): đã CHỌN khách hàng ∧ `chieu === "sold"` ∧ có đủ
`tuNgay`+`denNgay`. Thiếu vế nào → nút mờ kèm ĐÚNG lý do của vế đó, không gộp thông báo chung.
Test trước: ô tìm có chữ nhưng CHƯA chọn ⇒ nút vẫn không bấm được (đây là ca dễ lọt nhất).

──────────────────────────────────────────────────────────────────────────────
GÓI 7 — Tài liệu + nghiệm thu thật
Cập nhật `docs/06-BINDING_MAP.md` TỪ MÃ; hồ sơ U37; `U37b-tien-do.md`.
Chạy nghiệm thu §5 tiêu chí 7 và 8 — DÁN kết quả thật, không tự khai "đã kiểm".
```

## Ghi chú vận hành

- **Gói 0 đã xong trước khi có kế hoạch** (`b5f8e35`) — sai quy trình, đã ghi trung thực ở
  `U37b-plan.md` §4 và `U37b-tien-do.md`. Đừng lặp lại: từ Gói 1 trở đi phải qua vòng lặp con đầy đủ.
- **Hai cổng dừng** đều vì lý do kỹ thuật thật, không phải thủ tục: Claude bị cổng an toàn chặn ghi
  production DB, và không nên tự tạo hạ tầng công khai.
- **Quy mô nhỏ** (lớn nhất 56 hóa đơn ≈ 28 giây, §4.8) ⇒ đừng dựng thanh tiến trình cầu kỳ hay
  tối ưu hàng đợi. Mọi lo ngại quy mô ghi ở các bản nháp cũ đều KHÔNG còn áp dụng.

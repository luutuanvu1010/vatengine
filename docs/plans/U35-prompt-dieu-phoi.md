# U35 — Prompt điều phối tuần tự (U35b → U35) theo Loop Engineering

> **Một prompt duy nhất** vận hành vòng lặp điều phối (`TRIEN_KHAI_BANG_CLAUDE_CODE.md` mục 5):
> chạy lần lượt hai đơn vị, mỗi đơn vị đi trọn vòng lặp con (spec → test trước → hiện thực → tự
> kiểm chứng → review chéo → commit), giữa hai đơn vị chạy **test hồi quy toàn bộ** + ghi nhật
> ký tiến độ, rồi mới sang đơn vị kế. Đặc tả chi tiết ở `docs/plans/U35-plan.md` (Phần A = U35,
> Phần B = U35b, Phụ lục Z = nhật ký review đã vá 3 blocker).
>
> **Cách dùng:** dán toàn bộ khối mã dưới vào một phiên Claude Code. Có **cổng dừng bắt buộc**
> giữa U35b và U35 — phiên dừng chờ bạn duyệt trước khi sang U35 (không chạy hết một mạch).
> Viết theo skill `write-prompt` của dự án.

---

```
NHIỆM VỤ ĐIỀU PHỐI: Thực thi tuần tự U35b (sửa 3 trường thuế export) → U35 (lưu vết + cảnh báo
thay đổi hóa đơn), theo đúng Prompt + Loop Engineering của dự án. Làm U35b TRƯỚC (nhỏ, độc lập,
rủi ro thấp), rồi U35. HAI COMMIT TÁCH BẠCH — không trộn đơn vị.

ĐỌC TRƯỚC KHI BẮT ĐẦU:
- `CLAUDE.md` (Hiến pháp — đặc biệt §Nguyên tắc bằng chứng, §Kiến trúc quy tắc cứng, §Định nghĩa
  hoàn thành, §Khi gặp mơ hồ).
- `TRIEN_KHAI_BANG_CLAUDE_CODE.md` mục 1/4/5/6 (vòng lặp, mẫu prompt, DoD).
- `docs/plans/U35-plan.md` — TOÀN BỘ, gồm Phụ lục Z (vì sao đã vá 3 blocker). Đây là spec chốt.
- `.claude/rules/*.md` áp cho file mỗi đơn vị chạm (xem từng đơn vị dưới).

QUY TẮC ĐIỀU PHỐI (bắt buộc, áp cho CẢ HAI đơn vị):
1. Làm ĐÚNG MỘT đơn vị mỗi lần, thứ tự cố định: U35b → (cổng dừng) → U35. KHÔNG gộp, KHÔNG nhảy
   thứ tự, KHÔNG làm trước phần đơn vị sau.
2. Với mỗi đơn vị chạy trọn vòng lặp con qua `/start-unit`:
   (a) đọc spec đơn vị trong `docs/plans/U35-plan.md` (Phần B cho U35b, Phần A cho U35) + rules;
   (b) trình bày kế hoạch ngắn (file sẽ sửa, test sẽ viết, tiêu chí nghiệm thu);
   (c) VIẾT TEST TRƯỚC (đỏ) theo nhóm đúng của `testing.md`;
   (d) hiện thực tối thiểu để test xanh — không dư phạm vi;
   (e) tự kiểm chứng bằng `/verify` (make lint && make test). Đỏ → tự sửa và lặp (d)-(e).
3. Cổng review chéo bằng `/qa-unit` khi lint/test đã xanh (xem agent bắt buộc ở mỗi đơn vị).
   QA trả về Critical → CHẶN, sửa rồi chạy lại /verify + /qa-unit. Không đóng đơn vị khi còn Critical.
4. Đóng đơn vị: commit nhỏ, thông điệp rõ (không trộn đơn vị). Nếu đổi hợp đồng API → cập nhật
   `docs/06-BINDING_MAP.md` TỪ MÃ. Cập nhật tài liệu liên quan nếu hành vi đổi.
5. HỒI QUY giữa hai đơn vị: sau khi đóng U35b, chạy TOÀN BỘ `make test` (không chỉ test U35b).
   Đỏ hồi quy → dừng, sửa trước khi đi tiếp.
6. NHẬT KÝ TIẾN ĐỘ: sau mỗi đơn vị ghi một dòng vào `docs/plans/U35-tien-do.md` (tạo nếu chưa
   có): [đơn vị] — DONE/BLOCKED — commit hash — ghi chú.
7. CỔNG DỪNG GIỮA U35b VÀ U35: sau khi đóng U35b + hồi quy xanh + ghi nhật ký, DỪNG và báo cáo
   gọn (đơn vị vừa xong, kết quả verify/QA, commit, đơn vị kế). CHỜ tôi duyệt "tiếp" rồi mới sang
   U35. Không tự chạy hết một mạch.

RÀNG BUỘC BẰNG CHỨNG (Hiến pháp): mọi khẳng định về mã/hệ thống phải truy được về file:line hoặc
lệnh+kết quả tái lập. Với U35, các điểm sau PHẢI kiểm chứng bằng test tích hợp thật, KHÔNG chốt mù:
- chữ ký thực tế của `withTenant` (`packages/db/src/tenantContext.ts`) trước khi mở rộng nhận
  `lanDongBoId`;
- `sync()` cũ (`packages/sync/src/sync.ts`) CÒN được gọi ở đâu không (quyết định #5 = vá cả hai
  đường; nếu phát hiện không còn call-site nào thì DỪNG và HỎI trước khi bỏ);
- trigger đọc `nullif(current_setting('app.lan_dong_bo_id', true), '')::uuid` hoạt động qua
  Hyperdrive trong cùng transaction (dựa mẫu RLS `packages/db/src/schema/_rls.ts:6-16`).
Nếu gặp yêu cầu chưa rõ → DỪNG và HỎI kèm phương án + một test để kiểm chứng.

═══════════════════════════════════════════════════════════════════════════════
ĐƠN VỊ 1 — U35b: Sửa 3 trường thuế trong file kết xuất
═══════════════════════════════════════════════════════════════════════════════
BỐI CẢNH & MỤC TIÊU (tiêu chí nghiệm thu — U35-plan.md Phần B):
- "Thuế suất" (`tsuat`) đang xuất số thô 0.08 → hiện dạng phần trăm "8%".
- "Tiền thuế" (`tsuatTien`) lấy thẳng từ GDT (`tthue`), null → trống → TỰ TÍNH khi thiếu
  (ưu tiên số GDT khi có).
- "Tổng tiền sau thuế" (`tongSauThue`) tự đủ SAU khi chuẩn hóa Tiền thuế MỘT NƠI.

TÀI LIỆU ĐỌC TRƯỚC: `docs/plans/U35-plan.md` Phần B (B1–B4) + `docs/plans/EXPORT-cot-tuy-chon-
2026-07-23.md` (nền catalog); `.claude/rules/testing.md`, `.claude/rules/ui.md` (một nguồn sự
thật cột).

FILE CHẠM (đã soi 27/07): `packages/export/src/columns.ts` (dòng ~241-246 tongSauThue, ~278-280
tsuat/tsuatTien), `packages/export/src/xlsx.ts` (dòng ~22-27, ~136 style/numFmt), có thể
`packages/domain/src/flatExport.ts:51` (metadata cột tsuat). Nguồn dữ liệu: `tsuat` = phân số
0.08, `tsuatTien` = `tthue` GDT (có thể null), `ltsuat` = mã chữ ("8%"/"KCT"/"KKKNT").

RÀNG BUỘC BẮT BUỘC (áp cho U35b):
- Một nguồn sự thật cột (ui.md): thay đổi metadata/định dạng khai ở catalog, KHÔNG rải chuỗi rời.
- `tsuat` → numFmt phần trăm CUSTOM `165 = "0%"` (KHÔNG dùng built-in 10 = "0.00%"); bump
  `numFmts count` + `cellXfs count`; thêm style index song song `STYLE_MONEY`. Giá trị ô GIỮ 0.08.
  CSV render chuỗi "8%". KCT/KKKNT (tsuat=0, ltsuat mã chữ) hoặc tsuat null → TRỐNG, không "0%".
- `tsuatTien` tự tính: chuẩn hóa lên `r` MỘT NƠI (trước render) để cả tsuatTien lẫn tongSauThue
  cùng đọc. Công thức khi GDT thiếu: `round(thtien × tsuat)` về đồng nguyên (không parseFloat —
  dùng BigInt; kiểm `packages/**` có helper nhân chưa trước khi tự viết). Dòng không chịu thuế →
  trống. Đây là DẪN XUẤT hợp lệ (không bịa số), ưu tiên số GDT khi có.
- KHÔNG đổi phạm vi dữ liệu tenant, KHÔNG đổi cột khác.

TDD: viết test trước (`@vat/export`, `@vat/domain`) — xlsx có numFmt 0% đúng cột + count bump,
giá trị ô vẫn 0.08; csv "8%"; KCT/KKKNT → trống; tsuatTien tự tính đúng (ca số > 2^53 bằng
BigInt); tongSauThue đúng sau chuẩn hóa. **Golden test đổi có chủ đích — ghi rõ, không âm thầm sửa.**

LỆNH TỰ KIỂM CHỨNG: `make lint && make test` (không đụng gdt-client → không cần test-contract).

CỔNG REVIEW CHÉO (`/qa-unit`): `dod-auditor` (LUÔN). security-reviewer KHÔNG bắt buộc (không đổi
phạm vi tenant, chỉ trình bày dữ liệu đã lọc). contract-guardian KHÔNG (không đụng adapter GDT).

DEFINITION OF DONE (U35b): make lint + make test XANH; golden cập nhật có chủ đích; xlsx hiện "8%"
(và TRỐNG cho KCT/KKKNT), Tiền thuế + Tổng sau thuế có số kể cả khi GDT thiếu tthue; CSV "8%";
không giảm phủ; commit riêng. → Ghi nhật ký, chạy hồi quy toàn bộ, DỪNG ở cổng dừng chờ duyệt.

═══════════════════════════════════════════════════════════════════════════════
ĐƠN VỊ 2 — U35: Lưu vết + cảnh báo thay đổi hóa đơn (sau khi được duyệt "tiếp")
═══════════════════════════════════════════════════════════════════════════════
BỐI CẢNH & MỤC TIÊU (tiêu chí nghiệm thu — U35-plan.md Phần A):
Ghi vết mọi lần hóa đơn ĐỔI TRẠNG THÁI (ttxly/tthai) + đánh số phiên bản đồng bộ, và cảnh báo
TRONG ỨNG DỤNG (badge + danh sách "Hóa đơn vừa thay đổi" trên màn Tra cứu). CHỈ trạng thái (không
số tiền — v2). Nền tảng đã có: sync phát hiện được thay đổi nhưng chưa lưu/không báo.

TÀI LIỆU ĐỌC TRƯỚC: `docs/plans/U35-plan.md` Phần A (A1–A9) + Phụ lục Z (3 blocker đã vá);
`.claude/rules/multi-tenant.md`, `security.md`, `testing.md`, `ui.md`.

FILE CHẠM CHÍNH (đã soi 27/07): migration Drizzle mới (bảng `lich_su_thay_doi_hoa_don`,
`bo_dem_phien_ban`, cột `lan_dong_bo.so_phien_ban`, trigger `AFTER UPDATE ON hoa_don`);
`packages/db/src/tenantContext.ts` (mở rộng `withTenant` nhận lanDongBoId), `schema/_rls.ts`
(mẫu guard), `schema/auditLog.ts` (mẫu trigger 0002); `packages/sync/src/chunkSync.ts` (đường
delta production — đấu biến phiên) và `packages/sync/src/sync.ts` (đường cũ — ĐẢO THỨ TỰ mở phiên
running trước upsert); `apps/api` (endpoint /invoices/changes + mark-read); `apps/web` (badge + panel).

RÀNG BUỘC BẮT BUỘC (áp cho U35 — trích Hiến pháp/Luật):
- **Idempotent + không sót:** trigger `INSERT … ON CONFLICT DO NOTHING`; unique
  `(hoa_don_id, truong, gia_tri_moi, lan_dong_bo_id)`; guard `nullif(current_setting(
  'app.lan_dong_bo_id', true), '')::uuid`. Đấu biến phiên vào CẢ delta-sync LẪN sync() cũ.
- **Đa tenant (multi-tenant.md):** bảng mới bật RLS + FORCE; composite FK same-tenant
  `(tenant_id, hoa_don_id)`; mọi truy vấn gắn tenant_id tường minh. Test RLS CẢ owner LẪN non-owner.
- **Bảo mật (security.md):** không lộ bí mật; cân nhắc audit log cho mark-read; không lưu dữ liệu
  ngoài trạng thái + định danh HĐ.
- **UI (ui.md):** nhãn trạng thái từ Registry một-nguồn-sự-thật (bổ sung map ttxly/tthai nếu
  thiếu); chỉ token + primitive, không tô inline.
- KHÔNG chạm `packages/gdt-client` (không gọi GDT); do đó KHÔNG cần GdtTransport/xử lý 401 ở đơn vị này.
- Bộ đếm `so_phien_ban` cấp số NGUYÊN TỬ qua `bo_dem_phien_ban` (ON CONFLICT DO UPDATE RETURNING),
  không `MAX()+1`.

TDD: test trước theo `testing.md` — DB/migration (RLS owner+non-owner, unique chống redelivery,
composite FK), trigger (đổi → INSERT; không đổi → không; INSERT mới → không; **biến phiên chưa set
→ không ném lỗi, lan_dong_bo_id=NULL**), sync CẢ HAI đường + đường race onConflictDoUpdate cùng
sinh lịch sử, so_phien_ban nguyên tử; api (lọc tenant, phân trang, unread, mark-read, RBAC 403);
web (badge, panel "từ→thành" bằng nhãn Registry, mark-read → badge 0, trạng thái rỗng, ui-luat XANH).

LỆNH TỰ KIỂM CHỨNG: `make lint && make test`; `make migrate` chạy được + migration reversible.
(Không đụng gdt-client → không cần test-contract.)

CỔNG REVIEW CHÉO (`/qa-unit`): `dod-auditor` (LUÔN) + `security-reviewer` (BẮT BUỘC — bảng mới đa
tenant, RLS, trigger, biến phiên, endpoint mới). contract-guardian KHÔNG.

DEFINITION OF DONE (U35): make lint + make test XANH toàn repo; phủ không giảm; make migrate +
reversible; RLS (owner+non-owner) + RBAC nguyên vẹn; thay đổi trạng thái lưu vết đầy đủ qua CẢ hai
đường ghi + đường race (có test); cảnh báo hiện đúng trong ứng dụng; cập nhật lộ trình
`KIEN_TRUC_VA_KE_HOACH.md` mục 12; commit riêng, không trộn U35b. → Ghi nhật ký, báo cáo cuối.

BẮT ĐẦU NGAY với U35b: trình bày kế hoạch ngắn cho U35b, không cần tôi duyệt kế hoạch — chạy trọn
vòng lặp U35b tới khi đóng đơn vị, rồi DỪNG ở cổng dừng (quy tắc 7) chờ tôi duyệt "tiếp".
```

---

## Ghi chú vận hành

- **Vì sao cổng dừng giữa U35b và U35:** U35 chạm migration + trigger DB + biến phiên + endpoint
  đa tenant — bề mặt rủi ro cao hơn hẳn U35b (thuần encoder xuất). Cổng dừng cho bạn duyệt bản
  U35b gọn trước khi mở phần nặng. Muốn chạy liền một mạch: sửa quy tắc 7 thành "tự sang U35 nếu
  hồi quy xanh và QA không Critical".
- **Nếu một phiên không đủ dài:** nhật ký `docs/plans/U35-tien-do.md` cho phiên sau đọc trạng thái
  và tiếp đúng đơn vị dở (cơ chế vòng điều phối mục 5).
- **Nếu phát hiện `sync()` cũ không còn call-site nào** (khả năng có, vì production đã chuyển
  delta-sync): prompt buộc DỪNG-HỎI thay vì tự bỏ — bạn quyết "vá cả hai" (đã chốt) hay "khai tử
  sync() cũ" ngay lúc đó, tránh làm thừa.
- **Bản kế hoạch đã qua review chéo** (Phụ lục Z của U35-plan.md) — 3 blocker đã vá; prompt này
  nhắc lại các chốt then chốt để phiên thực thi không tự đi chệch.

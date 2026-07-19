# U23 — Bộ prompt thực thi (theo khuôn `TRIEN_KHAI_BANG_CLAUDE_CODE.md` mục 4)

> Nguồn "làm gì": `docs/plans/U23-plan-4-tinh-chinh.md`. Nguồn "làm thế nào": khuôn prompt mục 4 + skill `/start-unit`.
> **Cách dùng:** copy TỪNG prompt (một hạng mục), dán vào phiên làm việc. Mỗi prompt là **một đơn vị** — không gộp. Chạy theo đúng thứ tự A → B → C → D. Sau mỗi đơn vị: `make lint && make test` xanh + review chéo + commit nhỏ, rồi mới sang đơn vị kế.
> Mọi prompt đều gọi `/start-unit` để ép đúng vòng lặp (đọc spec → kế hoạch ngắn → test trước → hiện thực tối thiểu → tự kiểm chứng → review chéo → commit). Nếu gặp mơ hồ hoặc phải đoán cấu trúc phản hồi API thuế: **DỪNG và hỏi**, không giả định thầm.

---

## A — Dòng hàng ở màn Chi tiết hóa đơn (thuần Frontend, ưu tiên cao nhất)

```
/start-unit U23-A: Bảng dòng hàng ở màn Chi tiết hóa đơn (apps/web)

Bối cảnh: đọc `docs/plans/U23-plan-4-tinh-chinh.md` §4 và `CLAUDE.md`. Backend ĐÃ trả dòng hàng — KHÔNG sửa backend. `GET /invoices/:id` trả `{ ...header, dongHangHoa: DongHangHoaRow[] }` (apps/api/src/routes/invoices.ts:66-85; packages/query/src/getInvoice.ts:31-45). Màn đích: apps/web/src/features/invoices/InvoiceDetailPage.tsx (route `invoices/:id`, AppRouter.tsx:56). Tái dùng client + react-query có sẵn (apps/web/src/lib/apiClient.ts), không viết lại fetch.

Đặc tả:
- Đầu vào: response `GET /invoices/:id`, trường `dongHangHoa` (mảng, đã sort theo stt).
- Đầu ra/hành vi: render bảng dòng hàng nổi bật dưới phần header hóa đơn, cột: STT · Tên hàng hóa/dịch vụ (ten) · ĐVT (dvtinh) · Số lượng (sluong) · Đơn giá (dgia) · Thành tiền (thtien) · Thuế suất (tsuat).
- Ràng buộc: sluong/dgia/thtien/tsuat là CHUỖI numeric — TUYỆT ĐỐI không Number()/parseFloat; định dạng phân nhóm nghìn bằng thao tác chuỗi/BigInt, căn phải (giữ kỷ luật packages/export/src/columns.ts). Hóa đơn không có dòng hàng (`dongHangHoa: []`) → hiện thông báo "Chưa có dữ liệu dòng hàng (cần đồng bộ chi tiết)". Không lộ raw_json thô ra UI.

Tiêu chí nghiệm thu (mỗi ý có test — Vitest + Testing Library, jsdom):
(a) Có dòng hàng → bảng hiển thị đúng số dòng, đúng thứ tự stt, đủ 7 cột.
(b) Số/tiền hiển thị phân nhóm nghìn, KHÔNG sai số với giá trị > 2^53 (test một sluong/thtien rất lớn dạng chuỗi).
(c) `dongHangHoa: []` → hiện đúng thông báo, không vỡ layout.
(d) Không gọi Number()/parseFloat trên trường tiền/số lượng (kiểm qua giá trị biên).

Ghi chú vận hành (không phải code): kiểm luồng đồng bộ đã bật `opts.fetchDetail` (packages/sync/src/sync.ts:346-350) để dữ liệu dòng hàng thực sự được điền; nếu chưa, nêu trong báo cáo.

Quy trình bắt buộc: theo /start-unit. Review chéo: dod-auditor (bắt buộc). Không đụng gdt-client nên KHÔNG cần contract-guardian.
```

---

## B — Dòng hàng vào file kết xuất xlsx/csv (Backend export)

```
/start-unit U23-B: Thêm sheet "Chi tiết dòng hàng" vào kết xuất xlsx/csv (packages/export)

Bối cảnh: đọc `docs/plans/U23-plan-4-tinh-chinh.md` §4 và `.claude/rules/testing.md`, `.claude/rules/multi-tenant.md`. Hiện xml.zip/html.zip ĐÃ có dòng hàng (packages/export/src/invoiceDoc.ts); xlsx/csv thì CHƯA (chỉ 16 cột header EXPORT_COLUMNS — columns.ts:14-31). ĐÃ có sẵn `fetchLinesForInvoices` (packages/export/src/lineRows.ts) nạp dong_hang_hoa theo lô, lọc tenant_id tường minh — TÁI DÙNG, không viết lại truy vấn.

Đặc tả:
- Đầu ra/hành vi: xlsx có THÊM một sheet "Chi tiết dòng hàng"; csv có THÊM một khối/section "Chi tiết dòng hàng" (hoặc file thứ hai trong cùng luồng — chốt cách nhỏ nhất, sạch nhất). Mỗi dòng hàng = 1 row, cột: shdon (khóa liên kết về hóa đơn) · stt · ten · dvtinh · sluong · dgia · thtien · tsuat. Sheet header hóa đơn hiện tại GIỮ NGUYÊN.
- Ràng buộc: tiền/số lượng giữ dạng CHUỖI, không ép float (xlsx nhét thẳng <v>, csv giữ nguyên — theo kỷ luật columns.ts). Lọc tenant_id tường minh qua fetchLinesForInvoices (multi-tenant.md). Chỉ ĐỌC, không gọi GDT. Không nhân đôi danh sách cột — khai báo cột dòng hàng một nguồn duy nhất.

Tiêu chí nghiệm thu (mỗi ý có test — nhóm unit/integration, Miniflare, không gọi mạng thật):
(a) xlsx xuất N hóa đơn có dòng hàng → sheet "Chi tiết dòng hàng" có đúng tổng số dòng hàng, mỗi row gắn đúng shdon.
(b) csv tương tự có khối dòng hàng đúng.
(c) Số/tiền dòng hàng không sai với giá trị > 2^53 (chuỗi).
(d) Hóa đơn không có dòng hàng → không sinh row rác, không lỗi.
(e) Cách ly tenant: chỉ dòng hàng của tenant hiện tại xuất hiện.

Quy trình bắt buộc: theo /start-unit. Review chéo: dod-auditor (bắt buộc) + security-reviewer (vì đụng dữ liệu đa tenant trong kết xuất). Cập nhật `06-BINDING_MAP` từ mã nếu đổi hình dạng file kết xuất.
```

---

## C — Màn Tổng quan tối giản, giữ 1 dòng trạng thái kết nối (thuần Frontend)

```
/start-unit U23-C: Tổng quan tối giản — bỏ số tiền, giữ 1 dòng trạng thái kết nối (apps/web)

Bối cảnh: đọc `docs/plans/U23-plan-4-tinh-chinh.md` §3 và `apps/web/src/lib/rbac.ts`. Màn đích: apps/web/src/features/dashboard/DashboardPage.tsx (hiện gọi api.getSummary + api.getReconcile, DashboardPage.tsx:98-105, hiển thị thẻ tiền mua/bán + số đối chiếu + lối tắt). GET /tax-accounts đã có trường tokenHetHan để suy trạng thái kết nối.

Đặc tả:
- Đầu ra/hành vi: BỎ toàn bộ thẻ số tiền + số thống kê đối chiếu; BỎ gọi api.getSummary/api.getReconcile ở màn này. GIỮ đúng 1 dòng trạng thái kết nối GDT: "Đã kết nối · token còn hạn đến <ngày giờ VN>" hoặc "Chưa kết nối" (đọc từ GET /tax-accounts). GIỮ các card lối tắt theo RBAC: Kết nối GDT (ẩn với ke_toan) · Xem hóa đơn (cả 3 vai) · Kết xuất (ẩn với ke_toan).
- Ràng buộc: KHÔNG hiển thị bất kỳ con số tiền tệ nào. tokenHetHan hiển thị theo giờ VN (UTC+7), không lệch ngày. RBAC ẩn nút phía client phản chiếu rbac.ts, không dựa vào server để giấu.

Tiêu chí nghiệm thu (mỗi ý có test — Vitest + Testing Library):
(a) Không còn phần tử nào hiển thị số tiền mua/bán trên Dashboard.
(b) Dòng trạng thái: "đã kết nối" khi tokenHetHan còn hạn; "chưa kết nối" khi không có tài khoản/token; định dạng ngày giờ VN đúng.
(c) Vai ke_toan: ẩn card Kết nối GDT và Kết xuất; hiện Xem hóa đơn.
(d) Vai ke_toan_truong/quan_tri: hiện đủ 3 card.

Quy trình bắt buộc: theo /start-unit. Review chéo: dod-auditor. Không đụng gdt-client/token nên KHÔNG cần contract-guardian; security-reviewer chỉ cần nếu chạm cách hiển thị token (ở đây chỉ dùng tokenHetHan, không lộ token).
```

---

## D — MST auto + hạn mức tài khoản thuế + ngắt kết nối (Backend + Frontend)

> Hạng mục lớn nhất, chạm DB + API + UI + bảo mật. Chia **4 lát con theo thứ tự** D1→D4, mỗi lát tự test + commit. Có thể chạy cả 4 trong một phiên /start-unit U23-D, nhưng phải hoàn tất lát trước mới sang lát sau.

```
/start-unit U23-D: MST auto từ tenant + hạn mức tài khoản thuế + ngắt kết nối

Bối cảnh: đọc `docs/plans/U23-plan-4-tinh-chinh.md` §2, `.claude/rules/multi-tenant.md`, `.claude/rules/security.md`, `.claude/rules/testing.md`. Sự thật đã kiểm chứng: tenants.mst đã có (packages/db/src/schema/tenants.ts:11), chưa UNIQUE; tai_khoan_thue.username nhập tự do (apps/api/src/routes/taxAccounts.ts:21-22,55-58), cột loai ∈ {chinh,con} đã có (taiKhoanThue.ts:12-16), chưa UNIQUE, chưa ràng buộc với tenants.mst. Không có route tự đăng ký tenant trong apps/api/src.

Mô hình chốt: tenants.mst = MST gốc (vd "abcd"). Tài khoản thuế CHÍNH: username auto = tenants.mst, loai='chinh', KHÔNG cho nhập. Tài khoản CON (module để sẵn, mặc định TẮT sau cờ): username phải startsWith(tenants.mst) (vd "abcd-001"). Hạn mức = theo GÓI DỊCH VỤ (U17); vì U17 chưa làm → TẠM hardcode = 1 tại MỘT hàm getGioiHanTkThue(tenant) (TODO nối U17), không rải magic number.

Thực hiện theo 4 lát con TUẦN TỰ, mỗi lát test trước + commit riêng:

D1 (packages/db) — Migration ràng buộc:
- Thêm UNIQUE(mst) trên tenants; UNIQUE(tenant_id, username) trên tai_khoan_thue. Migration MỚI, không sửa 0000_*.
- Test: chèn trùng mst/(tenant_id,username) → vi phạm ràng buộc (mẫu: packages/db/test/integration/constraints.test.ts).

D2 (apps/api/src/routes/taxAccounts.ts) — Sửa POST /tax-accounts:
- Bỏ username khỏi body cho tài khoản chính: đọc tenants.mst (scope tenant qua withTenant/RLS), auto-gán username=mst, loai='chinh'. mst rỗng → lỗi rõ ("Doanh nghiệp chưa khai MST").
- Kiểm hạn mức qua getGioiHanTkThue(tenant) (tạm =1): đã đạt → 409 ("Đã đạt hạn mức tài khoản thuế").
- Module con (sau cờ, mặc định TẮT): nếu bật, nhận username con và validate startsWith(tenants.mst); sai → 400.
- Test: (a) auto-gán mst đúng; (b) mst rỗng → lỗi; (c) tạo tài khoản thứ 2 khi hạn mức=1 → 409; (d) username con sai tiền tố → 400 (khi cờ bật).

D3 (apps/api/src/routes/taxAccounts.ts) — Ngắt kết nối:
- TRƯỚC KHI VIẾT: đọc taxAccounts.ts đầy đủ xem đã có route disconnect chưa. Nếu chưa: thêm POST /tax-accounts/:id/disconnect — xóa token đã lưu (token vault), reset trạng thái token, audit log (mask). RBAC như route tax-account khác (ke_toan_truong+quan_tri). KHÔNG xóa bản ghi MST, chỉ ngắt token. Cách ly tenant.
- Test: (a) disconnect xóa token, giữ bản ghi tài khoản; (b) tenant khác gọi :id không thuộc mình → 404; (c) vai ke_toan → 403.

D4 (apps/web/src/features/taxAccounts/TaxAccountsPage.tsx) — Rút gọn màn kết nối:
- Bỏ ô nhập MST; hiện MST read-only từ GET /me (maskMst khi hiển thị). Stepper còn: (MST cố định) → Ủy quyền → Nhập captcha + Mật khẩu GDT → Đăng nhập. Mật khẩu KHÔNG lưu client (giữ nguyên). Thêm nút Ngắt kết nối (gọi D3, có xác nhận). Khối "Thêm tài khoản con" ẩn sau cờ (mặc định ẩn). RBAC ẩn với ke_toan.
- Test: (a) không có ô nhập MST; MST hiện read-only đã che; (b) nút Ngắt kết nối gọi đúng endpoint + xác nhận; (c) mật khẩu không rơi vào state bền/log; (d) ke_toan không thấy màn.

Ràng buộc chung: không hard-code bí mật, không lưu mật khẩu thuế thô, audit hành động nhạy cảm (security.md); mọi truy vấn gắn tenant_id (multi-tenant.md).

Quy trình bắt buộc: theo /start-unit, mỗi lát D1–D4 commit nhỏ riêng. Review chéo BẮT BUỘC: dod-auditor + security-reviewer (đụng token, xác thực, đa tenant). Cập nhật `06-BINDING_MAP` từ mã sau khi đổi hợp đồng API (đây là thay đổi so với U15-buoc4 B7).

Nếu gặp mơ hồ (vd cấu trúc token vault, cờ bật module con đặt ở đâu): DỪNG và hỏi kèm phương án đề xuất.
```

---

## E — Admin xuyên-tenant: KHÔNG viết prompt mới ở đây

Yêu cầu Admin của chủ dự án = **cổng quản trị hệ thống xuyên-tenant**, đã có plan đầy đủ, **chưa hiện thực**. Thực thi bằng các prompt riêng cho từng unit đã lên kế hoạch, chạy **sau** A–D và theo đúng thứ tự phụ thuộc:

1. `/start-unit U17` — Backend: đăng ký công khai + duyệt + gói dịch vụ (`docs/plans/U17-plan.md`). *Cũng là nơi chốt "hạn mức theo gói dịch vụ" mà U23-D tạm hardcode.*
2. `/start-unit U18` — Backend: Admin API super-admin ngoài tenant (`docs/plans/U18-plan.md`). **Đơn vị nhạy cảm bảo mật nhất** — bắt buộc security-reviewer.
3. `/start-unit U19` — Frontend: Cổng Admin tách biệt `/admin` (`docs/plans/U19-plan.md`).
4. `/start-unit U21` — Frontend: Dashboard giám sát Admin (`docs/plans/U21-plan.md`).

> Mỗi unit trên đã có kế hoạch chi tiết riêng; khi tới lượt, mở plan tương ứng và điền vào khuôn mục 4 như A–D ở trên (hoặc gọi thẳng `/start-unit U17` vì skill tự đọc spec).

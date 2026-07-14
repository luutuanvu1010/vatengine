# Kế hoạch U10 — Module đối chiếu (Reconciliation)

> Trạng thái: **ĐÃ THỰC THI ✅** (`make lint && make test` xanh; coverage `@vat/reconcile` 100% dòng / 89% nhánh, mọi trục ≥ 80%). Tóm tắt nghiệm thu: `docs/CHECKLIST-NGHIEM-THU.md` mục U10.
> Ngày: 2026-07-14.
> Nguồn "làm gì": `TRIEN_KHAI_BANG_CLAUDE_CODE.md` dòng 108 (U10); `KIEN_TRUC_VA_KE_HOACH.md` mục 6 (thành phần Đối chiếu), 7.1/7.2/7.3 (mô hình `hoa_don`, `ttxly`/`tthai`), 12 GĐ2, 12b **P8**. Giới hạn bằng chứng về `tthai`: `docs/adr/0001-nen-tang-cloudflare.md` (dòng 45). Nghiệm thu: `docs/CHECKLIST-NGHIEM-THU.md` mục U10.
> Xây trên dữ liệu đã đồng bộ (U5) — đọc `hoa_don`, **KHÔNG gọi GDT** (giống U6). Luật áp dụng: `multi-tenant.md`, `testing.md`, `security.md` (`gdt-adapter.md` chỉ chạm ở contract test #2).

## Quyết định phạm vi (chủ dự án, 2026-07-14)

- **#1 "HĐ thiếu" = gap dãy số đầu ra.** Không đối chiếu sổ kế toán ngoài (tránh dựng thực thể mới + phình U4). "Thiếu" = khoảng trống dãy `shdon` cho hóa đơn **đầu ra** (`chieu='sold'`) theo `(nbmst, khhdon, năm)` — DN tự phát số nên gap có nghĩa. Đối chiếu sổ ngoài, nếu cần, tách **U10b** sau.
- **#2 HĐ hủy/thay thế = dựng cơ chế + bảng mã CHƯA KIỂM CHỨNG.** Code *cơ chế* phân loại ngay, nhưng giá trị mã `tthai`/`ttxly` đặt ở **một điểm cấu hình duy nhất** (`statusCodes.ts`), gắn nhãn **CHƯA KIỂM CHỨNG**; kèm **contract test mềm** tài liệu-hóa kỳ vọng. **Không "chốt" mã** cho tới khi có probe thật (ADR-0001 dòng 45: chỉ mới quan sát `tthai=1`).
- **#3 "Lệch thuế" = số học nội tại header.** Kiểm `tgtcthue − ttcktmai + tgtthue = tgtttbso` với **dung sai** cấu hình; tính **trong SQL** (Postgres `numeric` — không ép float). Không đối chiếu `thttltsuat`/cấp dòng ở U10.

## Phạm vi

Tạo package nghiệp vụ mới `packages/reconcile` (`@vat/reconcile`): đọc `hoa_don` đã đồng bộ, phát hiện bất thường theo kỳ + bộ lọc, trả `Finding[]` **tính on-read**, tenant-scoped. Thêm endpoint đọc `GET /reconcile` ở `apps/api`.

**NGOÀI phạm vi (fence rõ):**
- ❌ Không gọi GDT / không đụng `GdtTransport` / 401 / captcha (chỉ đọc DB — như U6).
- ❌ Không dựng bảng mới / không persist findings (tính on-read như `summarize`) → tránh nguồn sự thật thứ hai, không lấn mô hình U4.
- ❌ Không nhập sổ kế toán ngoài (Quyết định #1).
- ❌ Không đối chiếu cấp dòng hàng (`dong_hang_hoa` chưa persist — chốt #B của U5).
- ❌ Không kiểm nhà cung cấp rủi ro real-time (**P10**, đơn vị khác).
- ❌ Không kênh cảnh báo/thông báo (HOÃN từ U5 quyết định #A) — U10 chỉ *phát hiện + trả về*.

## File sẽ tạo/sửa

| File | Vai trò |
|---|---|
| `packages/reconcile/package.json`, `tsconfig.json`, `vitest.config.ts` | Khung workspace (mẫu `@vat/query`) |
| `packages/reconcile/src/index.ts` | Barrel export |
| `packages/reconcile/src/types.ts` | `Finding`, `FindingKind` (`lech_thue` \| `thieu_so_dau_ra` \| `huy` \| `thay_the` \| `khong_ro`), `ReconcileReport`, tham số dung sai |
| `packages/reconcile/src/statusCodes.ts` | **1 điểm cấu hình** bảng mã `tthai`/`ttxly` → nhãn hủy/thay thế; **gắn nhãn `CHƯA KIỂM CHỨNG`** (Quyết định #2) |
| `packages/reconcile/src/taxIntegrity.ts` | (#3) Truy vấn cờ hóa đơn `tgtcthue − ttcktmai + tgtthue ≠ tgtttbso` quá dung sai — phép tính trong SQL `numeric` |
| `packages/reconcile/src/sequenceGaps.ts` | (#1) Phát hiện gap `shdon` cho `chieu='sold'` theo `(nbmst, khhdon, năm)` |
| `packages/reconcile/src/statusAnomaly.ts` | (#2) Phân loại `huy`/`thay_the`/`khong_ro` theo `statusCodes.ts` |
| `packages/reconcile/src/reconcile.ts` | Điều phối: chạy các kiểm tra theo bộ lọc/kỳ → gộp `Finding[]`, generic trên `PgDatabase`, tenant-scoped |
| `packages/reconcile/test/taxIntegrity.test.ts` | unit + integration (PGlite) |
| `packages/reconcile/test/sequenceGaps.test.ts` | unit + integration (PGlite) |
| `packages/reconcile/test/statusAnomaly.test.ts` | unit (mã giả định, đánh dấu CHƯA KIỂM CHỨNG) |
| `packages/reconcile/test/reconcile.integration.test.ts` | e2e trên fixtures + cách ly tenant |
| `packages/reconcile/test/statusCodes.contract.test.ts` | `contract` (mềm/skip) — tài liệu-hóa mã chờ probe |
| `apps/api/src/routes/reconcile.ts` | `GET /reconcile` (RBAC `ke_toan`+, `withTenant`, đọc-only) |
| `apps/api/src/app.ts` | Đăng ký route `/reconcile` |
| `apps/api/test/*` | Test route (Hono `app.request`, PGlite) — findings, RBAC, cách ly tenant, 400 |
| `docs/CHECKLIST-NGHIEM-THU.md` | Cập nhật mục U10 |

## Test viết trước (TDD)

**unit** (thuần, không I/O):
- `taxIntegrity`: khớp → không cờ; lệch quá dung sai → cờ; đúng biên dung sai; có `ttcktmai`; trường tiền null → an toàn (không false-positive).
- `sequenceGaps`: dãy liền → rỗng; thiếu số giữa dãy → liệt kê đúng; chỉ áp `chieu='sold'` (đầu vào bỏ qua); nhiều `(nbmst,khhdon,năm)` độc lập.
- `statusAnomaly`: theo `statusCodes` (mã giả định, CHƯA KIỂM CHỨNG) → `huy`/`thay_the`/`binh_thuong` đúng; mã lạ → `khong_ro`.

**integration** (PGlite offline, seed DB — KHÔNG mock adapter):
- `reconcile()` e2e trên bộ dữ liệu tình huống → đúng tập `Finding` (thiếu / lệch thuế / hủy-thay thế).
- **Cách ly tenant:** 2 tenant, A **không** thấy anomaly của B (RLS FORCE + role non-superuser + lọc `tenant_id` tường minh).
- Route `GET /reconcile` (`app.request`): trả findings đúng; RBAC chặn vai thiếu quyền; 400 khi tham số sai.

**contract** (`make test-contract`, ngoài `make test` mặc định):
- `statusCodes.contract.test.ts`: tài liệu-hóa kỳ vọng mã `tthai`/`ttxly` cho HĐ hủy + HĐ bị thay thế và trường liên kết HĐ thay thế trong `raw_json`; assertion **mềm/skip** tới khi probe thật (Quyết định #2). Không gọi mạng nếu chưa có bằng chứng — chỉ nêu rõ điều cần kiểm.

## Tiêu chí nghiệm thu (đo được)

1. `@vat/reconcile` tồn tại; test **đỏ→xanh**; coverage ≥ 80% mọi trục.
2. Bộ dữ liệu tình huống chứng minh: **lệch thuế** bị cờ / khớp thì không; **gap đầu ra** liệt kê đúng số thiếu; **hủy/thay thế** phân loại đúng theo bảng mã (mã còn nhãn CHƯA KIỂM CHỨNG cho tới khi probe xác nhận).
3. `GET /reconcile` tenant-scoped, RBAC, có test **cách ly 2 tenant** (A không thấy B).
4. **Read-only:** 0 bảng mới, 0 gọi GDT, không đụng adapter/401.
5. `make lint` sạch; `make test` xanh; không giảm coverage tổng.

## Ràng buộc bắt buộc chạm tới

- ✅ **`tenant_id`/RLS**: mọi truy vấn trong `withTenant` + lọc `tenant_id` tường minh (lớp 1) — mẫu `@vat/query`.
- ✅ **Tiền chính xác**: so sánh trong SQL `numeric`, **không ép float** (mục 7.1). Dung sai là tham số cấu hình.
- ✅ **Không nguồn sự thật thứ hai**: findings on-read, không persist.
- ✅ **Nguyên tắc bằng chứng**: mã `tthai`/`ttxly` hủy/thay thế **chưa kiểm chứng** → chỉ nằm ở `statusCodes.ts` gắn nhãn CHƯA KIỂM CHỨNG, không lan vào nơi khác; có contract test chờ probe.
- ⚪ **Cô lập adapter / 401 / captcha / mật khẩu thô**: KHÔNG áp dụng ở business logic (U10 không gọi GDT); chỉ contract test #2 mô tả probe.

## Rủi ro & phụ thuộc

- 🔴 **Mã `tthai`/`ttxly` hủy/thay thế CHƯA KIỂM CHỨNG** (ADR-0001 dòng 45: chỉ thấy `tthai=1`). Giảm thiểu: cơ chế tách khỏi giá trị mã; bảng mã 1 điểm + contract test; gỡ nhãn khi probe (đơn vị/bổ sung sau).
- 🟠 **Gap `shdon` giả định DN đầu ra đánh số liên tục theo `khhdon`/năm** — đúng thông lệ hóa đơn điện tử nhưng chưa probe cạnh biên (đổi ký hiệu giữa kỳ, số nhảy hợp lệ). Giảm thiểu: chỉ `chieu='sold'`, gộp theo `(nbmst,khhdon,năm)`, đánh dấu finding là "nghi ngờ" (không khẳng định chắc thiếu).
- 🟠 **Workers CPU/wall**: đối chiếu cả kỳ quét nhiều dòng → đẩy phép tính vào SQL (WHERE lọc lệch); gap tính bound theo nhóm; bám kỷ luật keyset/limit của `@vat/query`.
- ⚪ Không có line-item table → chỉ cấp hóa đơn (đã fence).

## Điểm mơ hồ còn lại (đã có phương án, không chặn thực thi)

- Ngưỡng **dung sai lệch thuế**: đề xuất mặc định 0 (khớp tuyệt đối trên `numeric`), cho phép cấu hình; xác nhận khi có dữ liệu thật nhiều thuế suất/làm tròn.
- Bảng mã `tthai`/`ttxly`: giữ CHƯA KIỂM CHỨNG tới khi probe (contract test là nơi ghi kỳ vọng).

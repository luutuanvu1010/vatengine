# Kế hoạch U11 — Tích hợp/xuất sang phần mềm kế toán (P14)

> Trạng thái: **KẾ HOẠCH — ĐÃ CHỐT 3 QUYẾT ĐỊNH CHẶN** (chủ dự án, 2026-07-14; xem cuối). Bước "kế hoạch ngắn" (skill `/plan-unit`). **Không viết code hiện thực trong lần chạy này.**
> Ngày: 2026-07-14. (U10 đang thực hiện — U11 xếp kế tiếp, dựng TRÊN U6/U7, độc lập U10.)
>
> **✅ BA QUYẾT ĐỊNH ĐÃ CHỐT (chủ dự án, 2026-07-14):**
> - **#1 — CƠ CHẾ + PROFILE THAM CHIẾU.** Chưa có template/file mẫu thật ⇒ U11 hiện thực **cơ chế profile + 1 profile tham chiếu** (test đầy đủ) + **khung profile trống** cho phần mềm mục tiêu, gắn nhãn `CHƯA KIỂM CHỨNG` + contract test mềm. Điền giá trị thật CHỈ khi có bằng chứng. (Nguyên tắc bằng chứng — bài học `:30000`.)
> - **#2 — FILE CONVERT (R2 + link, như U7).** Convert đồng bộ trong request, ghi R2, trả link. **Webhook/pull API tách đơn vị sau.**
> - **#3 — KHÔNG gán mã tài khoản kế toán.** U11 chỉ ánh xạ **trường/định dạng** sẵn có; danh mục mã TK (P12) = đơn vị riêng sau (tránh phình U4).
> Nguồn "làm gì": `TRIEN_KHAI_BANG_CLAUDE_CODE.md` dòng 109 (U11: "Tích hợp/xuất sang phần mềm kế toán — Test ánh xạ định dạng mục tiêu"); `KIEN_TRUC_VA_KE_HOACH.md` mục 6 ("Xuất & Tích hợp": *"Ánh xạ trường sang định dạng nhập liệu của từng phần mềm"*), mục 12 **GĐ3** ("bộ chuyển đổi định dạng để đẩy dữ liệu sang phần mềm kế toán phổ biến"), **12b P14** (Lõi/GĐ3/Cao — MISA, FAST, SmartKTSC qua API/webhook). Parity: `KHAO_SAT_TINH_NANG_NIBOT.md` dòng 41 (mục "Convert Nhật ký chung sang SmartKTSC"), 79, 83, 107, 110. Luật áp dụng: `multi-tenant.md`, `security.md`, `testing.md` (**KHÔNG** đụng `gdt-adapter.md` — U11 không gọi GDT).

## Tiền đề đã kiểm chứng — TÁI DÙNG, KHÔNG dựng lại

- **U6 (`6a2fed5`)**: `@vat/query` — `InvoiceFilter`/`buildWhere` (LUÔN kèm `tenant_id` tường minh), sắp `tdlap desc, id desc`. U11 xuất chính bộ dữ liệu U6 lọc → **dùng lại `buildWhere`, KHÔNG viết lại lọc**.
- **U7 (`4ce1484`)**: `@vat/export` — `iterateInvoices` (async generator keyset theo lô, không gom RAM), `toCsv`/`toXlsx`, `EXPORT_COLUMNS` (mẫu cột chuẩn), `ExportCell`/`cellFor`/`formatDate`, `isExportFormat`. `apps/api` có `storage.ts` (seam R2, put/stream), route `exports.ts` (`GET /invoices/export` → R2 + link; `GET /exports/:key` stream giới hạn tenant), audit `hanh_dong='export'`. **U11 tổng quát hóa U7**: U7 = một "profile bản địa" (cột GDT thô); U11 thêm **ánh xạ theo profile mục tiêu**.
- **U8 (`d7716fc`)**: RBAC — kết xuất `/exports*` giới hạn `ke_toan_truong`+`quan_tri` (`ke_toan`→403); `requireTenant`/`requireRole`. U11 dùng lại nguyên (convert kế toán ≥ quyền export).
- **U4**: tiền là `numeric` → node-pg/PGlite trả **chuỗi**; giữ chuỗi, KHÔNG ép float (mục 7.1). `audit_log` đã có khung.

## Phạm vi (đề xuất — chốt sau khi trả lời 3 câu mơ hồ)

Thêm khả năng **chuyển đổi bộ hóa đơn đã đồng bộ (đúng bộ lọc U6) sang định dạng nhập liệu của phần mềm kế toán mục tiêu**, qua một lớp **profile ánh xạ** cắm được, tái dùng renderer + keyset streaming + R2 + audit của U7.

Chia hai lớp rạch ròi theo **Nguyên tắc bằng chứng**:

1. **CƠ CHẾ (dựng + test được NGAY, không cần bằng chứng ngoài):** một abstraction `MappingProfile` = `{ id, label, format, columns: Array<{ header, source, transform }> }`; một hàm `toAccountingFile(rows, profile)` xây trên `toCsv`/`toXlsx` hiện có nhưng cột do profile quyết (thay `EXPORT_COLUMNS` cố định); registry profile + validate `profileId`. Test đầy đủ bằng **một profile tham chiếu (fixture)** — chứng minh cơ chế ánh xạ đúng mà không phụ thuộc spec thật.
2. **GIÁ TRỊ ĐỊNH DẠNG THẬT (CHƯA KIỂM CHỨNG — cần bằng chứng):** layout cột/header/định dạng ngày–số/encoding của **MISA/FAST/SmartKTSC** đặt ở **một điểm cấu hình duy nhất mỗi profile**, **gắn nhãn `CHƯA KIỂM CHỨNG`** cho tới khi có template import chính thức hoặc file mẫu thật từ chủ dự án; kèm **contract test mềm** tài liệu-hóa kỳ vọng (giống cơ chế `statusCodes.ts` của U10, bài học `:30000`).

**NGOÀI phạm vi (fence rõ):**
- ❌ Không gọi GDT / `GdtTransport` / captcha / 401 (chỉ đọc DB đã đồng bộ — như U6/U7).
- ❌ Không **danh mục hàng hóa + gán mã tài khoản kế toán** (P12, GĐ3, cần thực thể "danh mục" mới → phình U4) — xem **Điểm mơ hồ #3**. Đề xuất: ánh xạ **cấp trường/định dạng** thôi, KHÔNG chart-of-accounts.
- ❌ Không kết xuất **dòng hàng** (`dong_hang_hoa` chưa persist — chốt U5/U6). Convert **cấp hóa đơn (header)** như U7.
- ❌ Không đổi schema/migration U4; không sửa logic `@vat/query`/route U6; không sửa renderer U7 (chỉ **thêm** + tổng quát hóa qua profile).
- ❌ Không **nền qua Queue/Workflow/Cron** (đó là U9) — convert đồng bộ trong request như U7.
- ⏳ **Webhook/pull API** cho phần mềm kế toán tự kéo (nửa sau của P14): xem **Điểm mơ hồ #2** — đề xuất HOÃN, U11 làm **file convert** trước.

## File sẽ tạo/sửa (đề xuất — phụ thuộc câu trả lời)

**`@vat/export` (tổng quát hóa, giữ tương thích U7):**
| File | Vai trò |
|---|---|
| `packages/export/src/profiles/types.ts` *(mới)* | `MappingProfile`, `MappingColumn` (`{ header, source: keyof HoaDonRow \| fn, transform? }`), tái dùng `ExportCell`/`cellFor` |
| `packages/export/src/profiles/registry.ts` *(mới)* | Registry + `isProfileId`/`getProfile` (nguồn sự thật danh sách profile, như `formats.ts`) |
| `packages/export/src/profiles/reference.ts` *(mới)* | **Profile tham chiếu (fixture)** — chứng minh cơ chế, KHÔNG phải phần mềm thật |
| `packages/export/src/profiles/misa.ts` · `fast.ts` · `smartktsc.ts` *(mới — tùy #1)* | Giá trị định dạng thật — **mỗi file gắn nhãn `CHƯA KIỂM CHỨNG`**, 1 điểm cấu hình |
| `packages/export/src/accountingFile.ts` *(mới)* | `toAccountingFile(rows, profile)` — dựng trên `toCsv`/`toXlsx`, cột theo profile |
| `packages/export/src/index.ts` *(sửa)* | export mới |
| `packages/export/test/unit/profiles.test.ts`, `accountingFile.test.ts` *(mới)* | unit theo profile tham chiếu |
| `packages/export/test/contract/accountingProfiles.contract.test.ts` *(mới)* | contract **mềm/skip** — kỳ vọng định dạng thật, chờ bằng chứng |

**`apps/api` (wiring — trừ khỏi ngưỡng coverage):**
| File | Vai trò |
|---|---|
| `apps/api/src/routes/exports.ts` *(sửa)* | Thêm `GET /invoices/convert?profile=<id>&<bộ lọc U6>` (hoặc mở rộng `/export` nhận `profile`) → R2 + link; dùng lại `iterateInvoices`+`storage`+audit |
| `apps/api/src/app.ts` *(sửa nếu tách route)* | Mount |
| `apps/api/test/integration/convert.route.test.ts` *(mới)* | route thật (PGlite + R2 giả): convert đúng cột profile, **cách ly 2 tenant**, RBAC, 400 `profile` sai, audit `hanh_dong='convert'` (hoặc `export` + `doi_tuong=profile`) |

**Tài liệu:** `docs/CHECKLIST-NGHIEM-THU.md` (mục U11), `README.md` (endpoint convert), root `package.json`/lockfile nếu thêm dep.

## Test viết trước (TDD)

Nhóm theo `.claude/rules/testing.md`. `make test` = `unit`+`integration` (offline: PGlite + R2 giả). U11 không gọi GDT → nhóm `contract` mới chỉ là **tài liệu-hóa mềm/skip**, KHÔNG gọi mạng.

**`unit`** (offline, `@vat/export`):
1. `profiles`: registry liệt kê đúng profile; `isProfileId` chặn id lạ; mỗi profile có tập cột đúng thứ tự header kỳ vọng.
2. `accountingFile`: ánh xạ ≥ 2 hàng qua **profile tham chiếu** → parse lại → đúng header/thứ tự/định dạng của profile; tiền giữ **chuỗi numeric** (không float); null → ô trống (không giá trị giả); transform (nếu có: ví dụ chuẩn ngày `dd/MM/yyyy`) áp đúng.
3. Ca biên: tập rỗng → file hợp lệ chỉ header; profile hai định dạng (csv/xlsx) đều đọc lại được.

**`integration`** (`apps/api`; app thật + PGlite + R2 giả; seed ≥ 2 tenant):
4. `GET /invoices/convert?profile=<tham chiếu>&format=…` (JWT tenant A) → ghi R2 + `{key,url}`; mở lại → **chỉ** hàng A khớp bộ lọc, đúng cột profile.
5. **Cách ly tenant** (bắt buộc — `multi-tenant.md`): convert của A không chứa hàng B; `GET /exports/:keyCủaB` bằng JWT A → 404.
6. Route: `profile` thiếu/lạ → 400; JWT thiếu/hỏng → 401; vai `ke_toan` → 403 (kế thừa RBAC U8).
7. Audit: mỗi convert ghi **một** dòng `audit_log` (hành động + `doi_tuong` = profile+bộ lọc, `tenant_id` đúng); không log `raw_json`/token.

**`contract`** (`make test-contract`, ngoài `make test`):
8. `accountingProfiles.contract.test.ts`: tài liệu-hóa kỳ vọng layout MISA/FAST/SmartKTSC; assertion **mềm/skip** tới khi có template/file mẫu thật. Không gọi mạng.

## Tiêu chí nghiệm thu (đo được)

1. Cơ chế profile tồn tại; test **đỏ→xanh**; coverage `@vat/export` ≥ 80% (trừ `index.ts`).
2. **Ánh xạ đúng định dạng mục tiêu** (tiêu chí U11 gốc): với **≥ 1 profile**, mở lại file → header/thứ tự/định dạng khớp đặc tả profile; tiền nguyên bản; ngày đúng transform.
3. `GET /invoices/convert` tenant-scoped + RBAC + **test cách ly 2 tenant** (A không convert/tải được dữ liệu B).
4. **Read-only:** 0 bảng mới, 0 gọi GDT, không đụng adapter/401; mọi giá trị định dạng CHƯA KIỂM CHỨNG chỉ nằm ở file profile tương ứng (không lan).
5. `make lint` sạch; `make test` xanh; không giảm coverage tổng; cập nhật checklist U11.

## Ràng buộc bắt buộc chạm tới

- ✅ **`tenant_id`/RLS (`multi-tenant.md`) — trọng tâm**: dùng lại `buildWhere` (lọc tường minh, lớp 1) + `withTenant`/RLS FORCE (lớp 2); key R2 tiền tố tenant; **test cách ly tenant qua convert bắt buộc**.
- ✅ **Bảo mật (`security.md`)**: endpoint sau `requireTenant`+`requireRole`; **audit "xuất dữ liệu"** cho convert; không log nhạy cảm; bí mật/binding không commit.
- ✅ **Nguyên tắc bằng chứng**: định dạng MISA/FAST/SmartKTSC **CHƯA KIỂM CHỨNG** → 1 điểm cấu hình/profile, gắn nhãn, contract test chờ bằng chứng; cơ chế test bằng profile tham chiếu.
- ✅ **Không nguồn sự thật thứ hai**: mẫu cột bản địa vẫn là `EXPORT_COLUMNS` (U7); profile là ánh xạ TỪ đó, không nhân đôi.
- ✅ **Tiền chính xác**: giữ chuỗi numeric, không ép float.
- ⚪ **Cô lập adapter / 401 / captcha / mật khẩu thô**: KHÔNG áp dụng (U11 không gọi GDT).

## Rủi ro & phụ thuộc

- 🔴 **Định dạng import MISA/FAST/SmartKTSC CHƯA KIỂM CHỨNG** — rủi ro lớn nhất, đúng loại `:30000`. Không "chốt" profile thật cho tới khi có template chính thức/file mẫu. Giảm thiểu: tách cơ chế khỏi giá trị; profile thật gắn nhãn + contract test; ship **profile tham chiếu** làm bằng chứng cơ chế.
- 🟠 **Webhook/pull API** (nửa sau P14) kéo theo bề mặt auth máy-máy + versioning hợp đồng → đề xuất tách đơn vị sau (Điểm mơ hồ #2).
- 🟠 **Gán mã tài khoản kế toán (P12)** cần thực thể danh mục mới → phình U4 (Điểm mơ hồ #3). Đề xuất fence khỏi U11.
- 🟠 **Workers CPU 5'/wall**: convert cả kỳ → keyset theo lô + stream ra R2 (kỷ luật U7), không gom RAM.
- ⚪ Dựng trên U6+U7 (đã xong); độc lập U10 (đang làm) — không chạm reconcile.

## Điểm mơ hồ — DỪNG và hỏi (Hiến pháp §"Khi gặp mơ hồ" + Nguyên tắc bằng chứng)

> U11 **không** phải đoán cấu trúc phản hồi API thuế, nhưng phải ánh xạ sang **định dạng hệ thống bên ngoài (phần mềm kế toán)** — cùng loại rủi ro bằng chứng. Ba câu dưới **chặn việc chốt phạm vi**; mỗi câu kèm phương án đề xuất + cách kiểm chứng.

### #1 — Phần mềm mục tiêu nào & CÓ bằng chứng định dạng không?
- Không có template import chính thức / file mẫu thật ⇒ **không được** hiện thực profile MISA/FAST/SmartKTSC như "đã chốt" (bịa cột = vi phạm Nguyên tắc bằng chứng).
- **Đề xuất:** U11 hiện thực **cơ chế + 1 profile tham chiếu** (test đầy đủ) + **khung profile trống** cho (các) phần mềm ưu tiên, gắn nhãn `CHƯA KIỂM CHỨNG` + contract test mềm. Điền giá trị thật **chỉ khi** chủ dự án cung cấp template/file mẫu.
- **Kiểm chứng:** contract test đọc lại file mẫu thật (khi có) và so header/định dạng.

### #2 — Đường giao: file convert (như U7) hay webhook/pull API?
- P14 nêu cả hai ("qua API/webhook"). Nghiệm thu U11 chỉ đo "**ánh xạ định dạng mục tiêu**" → nghiêng về **file**.
- **Đề xuất:** U11 = **file convert** (R2 + link, tái dùng U7); **webhook/pull API tách đơn vị sau** (cần auth máy-máy + hợp đồng versioning).

### #3 — Có kèm "gán mã tài khoản kế toán" (P12) không?
- Nhiều phần mềm cần cột **mã tài khoản Nợ/Có / mã hàng**. Sinh giá trị này cần **danh mục ánh xạ** (thực thể mới → phình U4, GĐ3).
- **Đề xuất:** U11 chỉ **ánh xạ trường/định dạng** sẵn có; **KHÔNG** chart-of-accounts. Danh mục mã TK = **P12, đơn vị riêng** sau.

---

**Bàn giao.** Kế hoạch nêu rõ *cơ chế dựng được ngay* vs *giá trị định dạng cần bằng chứng*. **CHỜ 3 quyết định chặn** (trên) từ chủ dự án. Sau khi chốt: `/write-prompt U11` → `/start-unit U11`.
> ⚠️ Cho `/write-prompt`: nhấn mạnh cơ chế profile + profile tham chiếu làm trước (không phụ thuộc bằng chứng); profile thật chỉ điền khi có template/file mẫu, luôn kèm nhãn CHƯA KIỂM CHỨNG.

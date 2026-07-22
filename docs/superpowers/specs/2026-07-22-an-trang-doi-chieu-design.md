# Thiết kế — Ẩn trang "Đối chiếu" bằng cờ `SHOW_RECONCILE`

- **Ngày:** 2026-07-22
- **Trạng thái:** Đã duyệt thiết kế (chờ review spec)
- **Phạm vi:** Chỉ Frontend `apps/web` (1 file mới + 2 file sửa + 1 file test mới + 2 file tài liệu)
- **Quyết định chủ dự án:** chức năng "Lệch thuế" chưa cần thiết → ẩn **cả trang Đối chiếu** khỏi bảng điều khiển. **Module giữ nguyên**, không xoá.

## 1. Mục tiêu

Người dùng SaaS không còn thấy — và không còn vào được — trang "Đối chiếu" trong bảng điều khiển, trong khi **toàn bộ mã nguồn và hợp đồng API của module đối chiếu giữ nguyên**, bật lại được bằng cách đổi đúng một hằng số.

Ngoài phạm vi: mọi thay đổi ở backend, ở nội dung trang khác, ở cách tính đối chiếu.

## 2. Hiện trạng (đã khảo sát 2026-07-22)

"Lệch thuế" là một trong bốn loại phát hiện của trang Đối chiếu (`/reconcile`), hiển thị tại `apps/web/src/features/reconcile/ReconcilePage.tsx`: banner đỏ (dòng 74), thẻ tóm tắt "Lệch thuế" (dòng 89), khối "Lệch thuế (số học)" (dòng 95–137). Ba loại còn lại: Nghi thiếu đầu ra, Hóa đơn hủy, Bị thay thế.

Trang **không** xuất hiện ở màn "Tổng quan" — `DashboardPage.tsx` đã tối giản từ U23-C và không gọi `/reconcile`.

Trang được nối vào app tại **đúng hai điểm**:

| Điểm | Vị trí |
|---|---|
| Mục menu sidebar | `apps/web/src/components/layout/Sidebar.tsx:18` |
| Route SPA | `apps/web/src/routes/AppRouter.tsx:88` |

Không có link nội bộ nào khác trỏ tới `/reconcile` (đã grep toàn `apps/web/src`).

**Tiền lệ trong repo:** cờ `SHOW_DONATION = false` (`apps/web/src/lib/donation.ts:17`) ẩn khối Đóng góp ở trang Giới thiệu, giữ nguyên `DonationQr.tsx` + test. Thiết kế này lặp đúng khuôn đó.

## 3. Ràng buộc (từ Hiến pháp + luật)

- **Không để lại code chết** (Hiến pháp §"Quy ước bắt buộc"): vì vậy KHÔNG gỡ import `ReconcilePage` khỏi router rồi bỏ file mồ côi. Cờ điều kiện giữ file luôn được tham chiếu, Biome/`tsc` vẫn sạch.
- **Giữ thay đổi nhỏ, đúng phạm vi** (Hiến pháp §"Repo hygiene"): không đổi tên, không tái cấu trúc, không đụng `packages/reconcile`.
- **TDD** (`.claude/rules/testing.md`): test đỏ → xanh trước khi viết code; không giảm coverage.
- **Nguyên tắc bằng chứng**: mọi khẳng định về điểm nối dây trong spec này đến từ grep/đọc mã thật ngày 2026-07-22, không suy đoán.

## 4. Kiến trúc

Một hằng số duy nhất, hai điểm tiêu thụ, không xoá gì.

### 4.1. File mới: `apps/web/src/lib/featureFlags.ts`

```ts
export const SHOW_RECONCILE = false;
```

Kèm chú thích nêu: lý do ẩn, ngày quyết định (2026-07-22), và cách bật lại (đổi `false` → `true`, không cần sửa chỗ nào khác).

**Vì sao đặt ở `lib/` chứ không đặt trong `features/reconcile/`:** cờ chi phối hai chỗ **ngoài** feature. `Sidebar.tsx` thuộc tầng layout; bắt nó import ngược vào chính feature nó đang ẩn là lệch tầng. `lib/` là nơi trung lập cả layout lẫn router đều đã import.

**Vì sao là hằng số trong mã, không phải biến môi trường build:** đồng nhất với tiền lệ `SHOW_DONATION`; tránh dựng nguồn cấu hình thứ hai cho cùng một loại quyết định (Hiến pháp §"Hard stops" — không tạo nguồn sự thật thứ hai).

### 4.2. Sửa `apps/web/src/components/layout/Sidebar.tsx`

Mục `/reconcile` chỉ vào mảng `MAIN` khi cờ bật (spread có điều kiện). Giữ nguyên cơ chế `visible` sẵn có — cơ chế đó dành cho RBAC theo vai, khác bản chất với cờ tính năng, không trộn hai thứ vào một chỗ.

### 4.3. Sửa `apps/web/src/routes/AppRouter.tsx`

```tsx
{SHOW_RECONCILE && <Route path="reconcile" element={<ReconcilePage />} />}
```

**Đã kiểm chứng (2026-07-22)** rằng `false` là child hợp lệ của `<Routes>`: `react-router@6.30.4` (bản đang cài) — `createRoutesFromChildren` bỏ qua mọi child không phải element, kèm chú thích ngay trong mã nguồn *"Ignore non-elements. This allows people to more easily inline conditionals in their route config."* (`node_modules/react-router/dist/umd/react-router.development.js:1413-1418`). Đây là cách dùng được thư viện hỗ trợ có chủ đích, không phải mẹo.

**Không cần thêm redirect:** route tắt ⇒ `/reconcile` rơi vào catch-all đã có sẵn tại `AppRouter.tsx:108` (`<Route path="*" element={<Navigate to="/" replace />} />`) → về Tổng quan. Bookmark cũ không gãy thành trang trắng.

## 5. Luồng dữ liệu

Không đổi. `apps/api` vẫn phục vụ `GET /reconcile`; `packages/reconcile` vẫn tính đủ bốn loại phát hiện. Chỉ SPA thôi không dẫn tới. Hợp đồng API trong `docs/06-BINDING_MAP.md` giữ nguyên hiệu lực.

## 6. Không đụng tới

`ReconcilePage.tsx` · `types/api.ts` · `apiClient.getReconcile` · toàn bộ `packages/reconcile` · endpoint `GET /reconcile` (`apps/api`) · `apps/web/test/features/reconcile.test.tsx` (render component trực tiếp, không qua router ⇒ vẫn xanh, không sửa).

## 7. Test

File mới `apps/web/test/features/reconcileHidden.test.tsx`, dùng khuôn `renderWithProviders(<AppRouter />, route)` + `mockFetch({ me })` như `responsiveNav.test.tsx:22-37`. Hai ca:

1. **Menu:** khi cờ tắt, sidebar KHÔNG có link "Đối chiếu".
2. **Route:** vào thẳng `/reconcile` → tiếp đất ở "Tổng quan", không phải trang Đối chiếu.

Mẫu đối chiếu cho kiểu test "ẩn bằng cờ": `apps/web/test/features/about.test.tsx:41`.

Cách chạy đỏ→xanh: viết cả hai ca trước khi thêm cờ. Ca 1 và ca 2 đỏ (link còn đó, route còn sống) → thêm cờ + hai điểm tiêu thụ → xanh.

## 8. Xử lý lỗi

Không có nhánh lỗi mới. Bề mặt duy nhất có thể "hỏng" là điều hướng tới một route không tồn tại, và catch-all sẵn có đã xử lý (§4.3).

## 9. Tài liệu cập nhật

- `docs/06-BINDING_MAP.md:35` (màn S4) và `:124` (ma trận RBAC) — ghi rõ **màn S4 đang ẩn bằng cờ `SHOW_RECONCILE`**, hợp đồng `GET /reconcile` giữ nguyên.
- `docs/CHECKLIST-NGHIEM-THU.md:246` (mục U15.5) — ghi trạng thái ẩn.

## 10. Điểm đã nêu và đã quyết để nguyên

`apps/web/src/features/auth/LoginPage.tsx:29` vẫn quảng cáo với khách chưa đăng nhập: *"…phát hiện lệch thuế…"*. Sau khi ẩn trang, câu này là lời hứa không có chỗ thực hiện. **Quyết định 2026-07-22: để nguyên**, theo yêu cầu của chủ dự án là chỉ ẩn, không làm việc khác. Ghi lại ở đây để không bị coi là sót.

## 11. Bật lại về sau

Đổi `SHOW_RECONCILE` thành `true`. Sidebar và route trở lại đồng thời; hai ca test ở §7 sẽ đỏ và cần đảo kỳ vọng — đó là tín hiệu đúng, không phải hồi quy.

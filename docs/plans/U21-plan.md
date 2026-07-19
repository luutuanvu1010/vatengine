# Kế hoạch U21 — Dashboard giám sát toàn diện (Cổng Admin)

> Trạng thái: **⬜ KẾ HOẠCH — CHƯA HIỆN THỰC.** Đơn vị **thứ năm (cuối)** của lớp thương mại. Trang **Dashboard** trong Cổng Admin (U19) — mặt **giám sát & điều hành** cho chủ phần mềm. Tiêu thụ dữ liệu giám sát đã có (U13) + endpoint thống kê mới (rẻ). Chạy SAU U20.
>
> Luật áp dụng: `security.md` (không lộ token/bí mật, không nội dung hóa đơn), `multi-tenant.md` (số liệu xuyên-tenant chỉ qua con đường super-admin có kiểm soát của U18), `testing.md`. **KHÔNG** đụng `gdt-adapter.md`.

## 1. Vấn đề & phạm vi

U19 cho chủ **quản lý thành viên**; U21 cho chủ **nhìn toàn cảnh hệ thống** — sức khỏe, tăng trưởng, cảnh báo — để điều hành ở quy mô hướng tới 100k tenant. Chủ dự án chốt (2026-07-15): 4 nhóm giám sát, bắt đầu bằng **thống kê rẻ** (không quét nặng toàn bộ hóa đơn).

**Trong phạm vi (4 nhóm):**
1. **Sức khỏe hệ thống** — API, sync-worker, egress GDT (probe U13), circuit breaker.
2. **Thống kê tăng trưởng** — tenant theo trạng thái, đăng ký mới theo ngày/tuần, tenant hoạt động.
3. **Nhật ký hoạt động toàn hệ thống** — audit (đăng nhập, thao tác admin, login-fail, đăng ký).
4. **Cảnh báo & sức khỏe token GDT** — tenant nào token sắp/đã hết hạn, đồng bộ thất bại liên tục.

**Ngoài phạm vi:** số liệu nặng đếm/tổng hợp **toàn bộ hóa đơn mọi tenant** (hoãn tới khi có bảng tổng hợp — §5); biểu đồ thời gian thực (v1.0 refetch thủ công/định kỳ); nội dung hóa đơn khách; nút "nhắc khách kết nối lại" tự động (chốt: chỉ hiển thị trạng thái v1.0).

## 2. Tiền đề đã có — TÁI DÙNG (đọc từ mã/plan)

| Nguồn | Cung cấp | Dùng cho nhóm |
|---|---|---|
| `apps/api` `GET /health` (miễn xác thực) | trạng thái API + env | (1) Sức khỏe |
| U13 probe egress + `health.ts` (health-state qua DO, verdict `OK/GEO_BLOCKED/RATE_LIMITED/TIMEOUT/ERROR`) | sức khỏe egress GDT, chuỗi verdict xấu ổn định | (1) Sức khỏe |
| U13 Durable Object circuit breaker / rate-limit theo tenant | trạng thái breaker | (1) Sức khỏe |
| `audit_log` (append-only, U18 `GET /admin/audit`) | dòng thời gian hoạt động | (3) Nhật ký |
| `tenants.trang_thai`, `ngay_tao` | đếm theo trạng thái, đăng ký mới theo thời gian | (2) Tăng trưởng |
| `lan_dong_bo` (trang_thai, ket_thuc, thong_diep_loi) | đồng bộ lỗi/thành công gần đây | (1)(4) |
| `tai_khoan_thue.token_het_han` (U14) | token sắp/đã hết hạn | (4) Cảnh báo token |

**Nguyên tắc số liệu rẻ (chốt chủ dự án):** mọi con số v1.0 lấy bằng query **nhẹ** (COUNT theo index, đọc health-state, LIMIT audit) — KHÔNG full-scan bảng `hoa_don` (có thể hàng triệu dòng ở quy mô lớn). Số nặng (tổng hóa đơn toàn hệ) chờ **bảng tổng hợp** (§5).

## 3. Endpoint thống kê mới (bổ sung vào Admin API — thuộc U18 backend, tiêu thụ ở U21)

Tất cả sau `requireSuperAdmin`, qua con đường super-admin có kiểm soát (hàm SECURITY DEFINER bề mặt hẹp — U18 §4). **KHÔNG** trả token/mật khẩu/nội dung hóa đơn.

| Endpoint | Trả về | Chi phí |
|---|---|---|
| `GET /admin/stats/tong-quan` | `{ tenant_theo_trang_thai: {cho_duyet,active,khoa,tu_choi}, dang_ky_moi_7ngay, tenant_hoat_dong }` | rẻ (COUNT + GROUP BY trên index `trang_thai`) |
| `GET /admin/stats/suc-khoe` | `{ api:"ok", egress: <verdict U13 + thời điểm>, breaker: <mở/đóng theo tenant tóm tắt> }` | rẻ (đọc health-state DO + /health) |
| `GET /admin/stats/dong-bo` | `{ that_bai_gan_day: [{tenant, thong_diep_loi, ket_thuc}], thanh_cong_24h }` | rẻ (LIMIT trên `lan_dong_bo` index thời gian) |
| `GET /admin/stats/token` | `{ sap_het: [{tenant, token_het_han}], het_han: […] }` | rẻ (WHERE trên `token_het_han`) |

"Tenant hoạt động" = có `lan_dong_bo` thành công trong N ngày (định nghĩa chốt khi code). Mọi endpoint phân trang/giới hạn danh sách để không trả khối lớn.

## 4. Bố cục Dashboard (`apps/admin` — trang mặc định sau đăng nhập Admin)

**Hàng thẻ tổng quan (KPI cards):** Tổng tenant · Chờ duyệt (nổi bật — việc cần làm) · Đang hoạt động · Đăng ký mới 7 ngày. Bấm "Chờ duyệt" → nhảy sang danh sách lọc `cho_duyet` (U19).

**Khối Sức khỏe hệ thống:** đèn trạng thái (xanh/vàng/đỏ) cho API · Egress GDT (verdict U13 + thời điểm probe cuối) · Circuit breaker. Verdict xấu ổn định → badge đỏ + mô tả (`GEO_BLOCKED`/`RATE_LIMITED`…).

**Khối Cảnh báo (ưu tiên trên cùng nếu có):** token sắp/đã hết hạn (danh sách tenant + thời điểm) · đồng bộ thất bại liên tục. Mỗi dòng dẫn tới chi tiết tenant (U19). **KHÔNG** hiện token.

**Khối Tăng trưởng:** biểu đồ đăng ký mới theo ngày (7–30 ngày) — dùng thư viện chart nhẹ (Recharts đã có ở ADR ngăn xếp web, hoặc SVG thuần). Số liệu rẻ.

**Khối Nhật ký gần đây:** bảng audit mới nhất (thời điểm giờ VN · admin/tenant · hành động), link "Xem tất cả" → trang audit (U19). Lọc nhanh theo loại (đăng nhập/thao tác admin/login-fail).

**Trạng thái UI:** 4 trạng thái tường minh mỗi khối (loading skeleton/rỗng/lỗi+thử lại/dữ liệu). Nút refetch thủ công (không auto-poll gắt v1.0). Font 16–17px (kế thừa U20). Giờ VN (UTC+7). i18n vi.

## 5. Số liệu nặng — hoãn có chủ đích (ghi để không quên)

Đếm/tổng hợp **toàn bộ hóa đơn mọi tenant** (vd "tổng hóa đơn toàn hệ", "top tenant theo lượng hóa đơn") **KHÔNG** làm bằng full-scan `hoa_don` ở quy mô 100k tenant. Khi cần: dựng **bảng tổng hợp** (materialized/rollup cập nhật theo sync — vd `thong_ke_tenant(tenant_id, so_hoa_don, cap_nhat_luc)`) rồi Dashboard đọc bảng đó. **Đây là đơn vị riêng tương lai** (U22+ hoặc mở rộng U21), KHÔNG gộp vào v1.0. Ghi rõ để tránh cám dỗ full-scan.

## 6. Kiểm thử

**backend (thuộc U18/bổ sung — integration + unit):** mỗi endpoint stats trả đúng cấu trúc; **không rò** token/hóa đơn (assert response không chứa trường bí mật); số liệu đúng trên bộ dữ liệu mock; **bất biến cách ly:** token khách gọi `/admin/stats/*` → 403.

**frontend (component/unit Vitest+TL):** mỗi khối render 4 trạng thái; KPI card map số đúng; badge sức khỏe đổi màu theo verdict; cảnh báo token hiện danh sách + KHÔNG hiện token; biểu đồ tăng trưởng render từ mock. **E2E** (Playwright, mock): đăng nhập Admin → Dashboard load đủ khối → bấm "Chờ duyệt" → sang danh sách lọc.

Coverage ≥ 80% tầng nghiệp vụ (endpoint stats).

## 7. File tạo/sửa (dự kiến)

```
apps/api/src/routes/admin/
├── stats.ts                                        # (MỚI) 4 endpoint /admin/stats/* + hàm SECURITY DEFINER đếm rẻ
packages/db/
├── (nếu cần) hàm admin_thong_ke_*                  # (MỚI) SECURITY DEFINER bề mặt hẹp, chỉ COUNT/metadata
apps/admin/src/features/dashboard/
├── DashboardPage.tsx                               # (MỚI) trang mặc định
├── KpiCards.tsx / HealthPanel.tsx / AlertsPanel.tsx / GrowthChart.tsx / RecentAudit.tsx  # (MỚI) các khối
├── ../../lib/adminApiClient.ts                     # (SỬA) thêm gọi /admin/stats/*
apps/admin/test/…                                   # (MỚI) component + E2E
apps/api/test/integration/adminStats.route.test.ts  # (MỚI) gồm bất biến cách ly + không rò
```

## 8. Định nghĩa hoàn thành

`make lint` sạch; `make test` xanh; coverage giữ ngưỡng; **không rò token/hóa đơn có test tường minh** (điều kiện xong bắt buộc); mọi query stats là **rẻ** (không full-scan `hoa_don` — review khẳng định); bất biến cách ly khách; font/i18n/giờ VN đúng; review chéo (`security-reviewer` cho stats xuyên-tenant + UI review) trước khi coi xong; commit nhỏ. **Kết thúc lớp thương mại:** chủ có Cổng Admin hoàn chỉnh — quản lý thành viên (U19) + giám sát toàn diện (U21) — trên `adminvatengine.tourdao.vn`.

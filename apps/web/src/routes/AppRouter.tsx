import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "../components/layout/AppLayout";
import { PageHeader } from "../components/layout/PageHeader";
import { AboutPage } from "../features/about/AboutPage";
import { DangKyPage } from "../features/auth/DangKyPage";
import { DatMatKhauPage } from "../features/auth/DatMatKhauPage";
import { LoginPage } from "../features/auth/LoginPage";
import { XacThucEmailPage } from "../features/auth/XacThucEmailPage";
import { useAuth } from "../features/auth/auth-context";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { ExportsPage } from "../features/exports/ExportsPage";
import { InvoiceDetailPage } from "../features/invoices/InvoiceDetailPage";
import { InvoicesPage } from "../features/invoices/InvoicesPage";
import { LienKetPage } from "../features/lienket/LienKetPage";
import { ReconcilePage } from "../features/reconcile/ReconcilePage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { TaxAccountsPage } from "../features/taxAccounts/TaxAccountsPage";
import { SHOW_RECONCILE } from "../lib/featureFlags";
import { vi } from "../lib/i18n/vi";
import { canExport, canManageTaxAccounts } from "../lib/rbac";
import type { Role } from "../types/api";

function Forbidden() {
  return (
    <div>
      <PageHeader title="Không có quyền" />
      <p style={{ color: "var(--text-tertiary)" }}>{vi.forbidden}</p>
    </div>
  );
}

/** Màn chờ trong lúc kiểm tra cookie phiên (C8c). Cố tình tối giản: nó chỉ hiện trong
 * một nhịp mạng tới /me, nên bất kỳ thứ gì nặng hơn cũng chỉ gây nhấp nháy. */
function DangKiemTraPhien() {
  return (
    <output aria-busy="true" style={{ display: "block", padding: "2rem" }}>
      Đang kiểm tra phiên đăng nhập…
    </output>
  );
}

/** Chỉ cho vào khi đã đăng nhập; ngược lại đẩy tới /login. */
function ProtectedLayout() {
  const { status, me, logout } = useAuth();
  // ADR-0003 Amendment #1 (C8c): 'checking' KHÔNG được coi như chưa đăng nhập — nếu đẩy
  // sang /login lúc này thì mỗi lần tải trang người dùng lại thấy màn Login loé lên rồi
  // mới vào app, tệ hơn chính vấn đề đang sửa.
  if (status === "checking") return <DangKiemTraPhien />;
  if (status !== "authed" || !me) return <Navigate to="/login" replace />;
  return <AppLayout me={me} onLogout={logout} />;
}

/** Guard theo vai (client = UX; server vẫn chặn). Không đủ quyền → màn 403. */
function RoleRoute({ allow, children }: { allow: (role: Role) => boolean; children: ReactNode }) {
  const { me } = useAuth();
  if (!me) return <Navigate to="/login" replace />;
  if (!allow(me.role)) return <Forbidden />;
  return <>{children}</>;
}

function LoginRoute() {
  const { status } = useAuth();
  // Chờ kiểm tra xong rồi mới quyết: vào thẳng /login khi cookie CÒN hạn mà render ngay
  // form thì người dùng thấy form loé lên rồi bị đá về app (C8c, chiều ngược lại).
  if (status === "checking") return <DangKiemTraPhien />;
  if (status === "authed") return <Navigate to="/" replace />;
  return <LoginPage />;
}

/** U20 — Guard cho trang Đăng ký. Cùng khuôn `LoginRoute`: chờ dò phiên xong mới quyết,
 * để người đang có phiên không thấy form loé lên rồi bị đá đi (C8c). */
function DangKyRoute() {
  const { status } = useAuth();
  if (status === "checking") return <DangKiemTraPhien />;
  if (status === "authed") return <Navigate to="/" replace />;
  return <DangKyPage />;
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      {/* U20 — Đăng ký công khai. NGOÀI ProtectedLayout: khách chưa có tài khoản thì
          đương nhiên chưa có phiên. Người ĐANG đăng nhập vào đây thì đá về app — họ đã
          có tài khoản rồi, form đăng ký chỉ gây bối rối. */}
      <Route path="/dang-ky" element={<DangKyRoute />} />
      {/* Lát cắt 1 — Đích của liên kết trong thư xác thực. CÔNG KHAI và KHÔNG đá người
          đang đăng nhập đi đâu cả: rất có thể họ đăng ký ở máy này rồi mở thư ở máy khác,
          hoặc đang đăng nhập bằng một tài khoản khác. Đá đi là làm hỏng việc xác thực. */}
      <Route path="/xac-thuc-email" element={<XacThucEmailPage />} />
      {/* Lát cắt 3 — Đích của liên kết trong thư duyệt. CÔNG KHAI và KHÔNG đá người
          đang đăng nhập đi đâu cả, cùng lý do với /xac-thuc-email: rất có thể họ mở thư
          ở một máy khác, hoặc đang đăng nhập bằng một tài khoản khác. */}
      <Route path="/dat-mat-khau" element={<DatMatKhauPage />} />
      <Route element={<ProtectedLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="invoices/:id" element={<InvoiceDetailPage />} />
        {/* Đang ẩn bằng cờ SHOW_RECONCILE (tạm ẩn 2026-07-29 — xem lịch sử trong
            lib/featureFlags.ts). Giữ import ReconcilePage để không sinh file mồ côi.
            Route tắt ⇒ /reconcile rơi vào catch-all "*" cuối file → về Tổng quan. React
            Router bỏ qua child không phải element, nên `false` ở đây là hợp lệ. */}
        {SHOW_RECONCILE && <Route path="reconcile" element={<ReconcilePage />} />}
        {/* U37c — quản lý liên kết đã phát hành. Mở cho MỌI vai: xem là vô hại, còn thu
            hồi là hành động GIẢM rủi ro nên chặn người phát hiện lộ link là hại hơn lợi. */}
        <Route path="lien-ket" element={<LienKetPage />} />
        <Route
          path="exports"
          element={
            <RoleRoute allow={canExport}>
              <ExportsPage />
            </RoleRoute>
          }
        />
        <Route
          path="tax-accounts"
          element={
            <RoleRoute allow={canManageTaxAccounts}>
              <TaxAccountsPage />
            </RoleRoute>
          }
        />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="gioi-thieu" element={<AboutPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

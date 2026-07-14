import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "../components/layout/AppLayout";
import { PageHeader } from "../components/layout/PageHeader";
import { LoginPage } from "../features/auth/LoginPage";
import { useAuth } from "../features/auth/auth-context";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { ExportsPage } from "../features/exports/ExportsPage";
import { InvoiceDetailPage } from "../features/invoices/InvoiceDetailPage";
import { InvoicesPage } from "../features/invoices/InvoicesPage";
import { ReconcilePage } from "../features/reconcile/ReconcilePage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { TaxAccountsPage } from "../features/taxAccounts/TaxAccountsPage";
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

/** Chỉ cho vào khi đã đăng nhập; ngược lại đẩy tới /login. */
function ProtectedLayout() {
  const { status, me, logout } = useAuth();
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
  if (status === "authed") return <Navigate to="/" replace />;
  return <LoginPage />;
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route element={<ProtectedLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="invoices/:id" element={<InvoiceDetailPage />} />
        <Route path="reconcile" element={<ReconcilePage />} />
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
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

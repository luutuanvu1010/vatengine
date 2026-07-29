// D — Dashboard tổng quan TỐI GIẢN (U23-C): giữ đúng 1 dòng trạng thái kết nối GDT + lối
// tắt theo RBAC. KHÔNG hiển thị số tiền / số đối chiếu (bỏ /invoices/summary + /reconcile ở
// màn này). Trạng thái kết nối suy từ GET /tax-accounts (tokenHetHan). Lối tắt phản chiếu
// RBAC client (ke_toan ẩn Kết xuất + Kết nối thuế) — chỉ là UX, server vẫn là biên tin cậy.
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";
import { Card, Loading } from "../../components/ui/primitives";
import { api } from "../../lib/apiClient";
import { formatDateVN } from "../../lib/format";
import { canExport, canManageTaxAccounts } from "../../lib/rbac";
import type { Role, TaxAccountView } from "../../types/api";
import { OrgIdentity } from "../about/OrgIdentity";
import { useAuth } from "../auth/auth-context";

/** Trạng thái kết nối GDT suy từ danh sách tài khoản thuế: ĐÃ kết nối nếu có ít nhất một
 * token còn hạn (tokenHetHan trong tương lai). Trả token hết hạn muộn nhất để hiển thị. */
export function connectionStatus(
  accounts: TaxAccountView[],
  now: Date,
): { connected: boolean; expiresAt: string | null } {
  let latest: number | null = null;
  let latestIso: string | null = null;
  for (const a of accounts) {
    if (!a.tokenHetHan) continue;
    const t = new Date(a.tokenHetHan).getTime();
    if (t > now.getTime() && (latest === null || t > latest)) {
      latest = t;
      latestIso = a.tokenHetHan;
    }
  }
  return { connected: latestIso !== null, expiresAt: latestIso };
}

function Shortcut({ to, title, desc }: { to: string; title: string; desc: string }) {
  return (
    <Link to={to} style={{ textDecoration: "none", color: "inherit" }}>
      <Card>
        <div style={{ fontWeight: "var(--fw-bold)" }}>{title}</div>
        <div style={{ color: "var(--text-tertiary)", fontSize: "var(--fs-base)" }}>{desc}</div>
      </Card>
    </Link>
  );
}

export function DashboardPage() {
  const { me } = useAuth();
  const role: Role = me?.role ?? "ke_toan";

  // Chỉ đọc trạng thái kết nối — KHÔNG gọi summary/reconcile ở màn này (U23-C).
  const q = useQuery({
    queryKey: ["tax-accounts"],
    queryFn: () => api.listTaxAccounts(),
  });

  if (q.isPending) return <Loading />;

  const accounts = q.data ?? [];
  const conn = connectionStatus(accounts, new Date());

  return (
    <div style={{ display: "grid", gap: "var(--sp-5)" }}>
      <PageHeader title="Tổng quan" subtitle="Trạng thái kết nối & lối tắt" />

      {/* 1 dòng trạng thái kết nối GDT (không con số tiền). */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
          <span
            aria-hidden
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: conn.connected ? "var(--success-600)" : "var(--text-tertiary)",
            }}
          />
          <span style={{ fontWeight: "var(--fw-semibold)" }}>
            {conn.connected
              ? `Đã kết nối · token còn hạn đến ${formatDateVN(conn.expiresAt, true)}`
              : "Chưa kết nối"}
          </span>
        </div>
      </Card>

      <div>
        <h2
          style={{
            fontSize: "var(--fs-lg)",
            fontWeight: "var(--fw-bold)",
            marginBottom: "var(--sp-3)",
          }}
        >
          Lối tắt
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "var(--sp-3)",
          }}
        >
          <Shortcut to="/invoices" title="Xem hóa đơn" desc="Lọc theo kỳ, chiều, nguồn" />
          {canExport(role) ? (
            <Shortcut to="/exports" title="Kết xuất" desc="Xuất xlsx/csv theo profile" />
          ) : null}
          {canManageTaxAccounts(role) ? (
            <Shortcut
              to="/tax-accounts"
              title="Kết nối tài khoản thuế"
              desc="Đăng nhập & lưu token GDT"
            />
          ) : null}
        </div>
      </div>

      {/* U32 — danh tính pháp nhân: nội dung phụ trợ, đặt SAU phần hành động. */}
      <OrgIdentity />
    </div>
  );
}

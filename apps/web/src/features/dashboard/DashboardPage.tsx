// D — Dashboard tổng quan (màn đầu sau đăng nhập). Nguồn: /invoices/summary (đếm + tổng
// tiền theo chiều) + /reconcile (4 số). Kỳ mặc định = quý hiện tại. Lối tắt phản chiếu
// RBAC (ke_toan ẩn Kết xuất + Kết nối thuế).
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";
import { Card, ErrorState, Loading } from "../../components/ui/primitives";
import { api } from "../../lib/apiClient";
import { formatMoneyShort } from "../../lib/format";
import { quarterRange } from "../../lib/period";
import { canExport, canManageTaxAccounts } from "../../lib/rbac";
import type { ChieuSummary, Role } from "../../types/api";
import { useAuth } from "../auth/auth-context";

function StatCard({
  title,
  s,
  tone,
}: { title: string; s: ChieuSummary | undefined; tone: string }) {
  return (
    <Card>
      <div
        style={{
          color: "var(--text-tertiary)",
          fontSize: "var(--fs-sm)",
          fontWeight: "var(--fw-semibold)",
        }}
      >
        {title}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "var(--sp-3)",
          marginTop: "var(--sp-2)",
        }}
      >
        <span
          style={{ fontSize: "var(--fs-3xl)", fontWeight: "var(--fw-extrabold)" }}
          className="tabular"
        >
          {s?.count ?? 0}
        </span>
        <span
          style={{ fontSize: "var(--fs-xl)", fontWeight: "var(--fw-bold)", color: tone }}
          className="tabular"
        >
          {formatMoneyShort(s?.tongTtbso ?? null) || "0"} đ
        </span>
      </div>
      <div
        style={{
          color: "var(--text-tertiary)",
          fontSize: "var(--fs-sm)",
          marginTop: "var(--sp-1)",
        }}
      >
        Tổng thanh toán · thuế {formatMoneyShort(s?.tongTthue ?? null) || "0"} đ
      </div>
    </Card>
  );
}

function ReconcileTile({ n, label, tone }: { n: number; label: string; tone: string }) {
  return (
    <div style={{ padding: "var(--sp-3)", background: tone, borderRadius: "var(--radius-md)" }}>
      <div
        style={{ fontSize: "var(--fs-2xl)", fontWeight: "var(--fw-extrabold)" }}
        className="tabular"
      >
        {n}
      </div>
      <div style={{ fontSize: "var(--fs-sm)", color: "var(--text-secondary)" }}>{label}</div>
    </div>
  );
}

function Shortcut({ to, title, desc }: { to: string; title: string; desc: string }) {
  return (
    <Link to={to} style={{ textDecoration: "none", color: "inherit" }}>
      <Card>
        <div style={{ fontWeight: "var(--fw-bold)" }}>{title}</div>
        <div style={{ color: "var(--text-tertiary)", fontSize: "var(--fs-sm)" }}>{desc}</div>
      </Card>
    </Link>
  );
}

export function DashboardPage() {
  const { me } = useAuth();
  const role: Role = me?.role ?? "ke_toan";
  const period = quarterRange(new Date());
  const filter = { tuNgay: period.tuNgay, denNgay: period.denNgay };

  const summary = useQuery({
    queryKey: ["dashboard-summary", filter],
    queryFn: () => api.getSummary(filter),
  });
  const recon = useQuery({
    queryKey: ["dashboard-reconcile", filter],
    queryFn: () => api.getReconcile(filter),
  });

  if (summary.isPending || recon.isPending) return <Loading />;
  if (summary.isError)
    return <ErrorState message="Không tải được tổng quan." onRetry={() => summary.refetch()} />;

  const byChieu = summary.data.byChieu ?? [];
  const mua = byChieu.find((c) => c.chieu === "purchase");
  const ban = byChieu.find((c) => c.chieu === "sold");
  const rs = recon.data?.summary;

  return (
    <div style={{ display: "grid", gap: "var(--sp-5)" }}>
      <PageHeader
        title="Tổng quan"
        subtitle="Bức tranh hóa đơn mua vào & bán ra của doanh nghiệp"
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--sp-4)" }}>
        <StatCard title="Hóa đơn mua vào" s={mua} tone="var(--info-600)" />
        <StatCard title="Hóa đơn bán ra" s={ban} tone="var(--success-600)" />
      </div>

      <Card>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "var(--sp-3)",
          }}
        >
          <h2 style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-bold)" }}>
            Tình hình đối chiếu
          </h2>
          <Link to="/reconcile" style={{ fontSize: "var(--fs-sm)" }}>
            Xem chi tiết →
          </Link>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--sp-3)" }}>
          <ReconcileTile n={rs?.lechThue ?? 0} label="Lệch thuế" tone="var(--danger-50)" />
          <ReconcileTile
            n={rs?.thieuSoDauRa ?? 0}
            label="Nghi thiếu đầu ra"
            tone="var(--warning-50)"
          />
          <ReconcileTile n={rs?.huy ?? 0} label="Hóa đơn hủy" tone="var(--surface-muted)" />
          <ReconcileTile n={rs?.thayThe ?? 0} label="Bị thay thế" tone="var(--surface-muted)" />
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
          <Shortcut to="/invoices" title="Danh sách hóa đơn" desc="Lọc theo kỳ, chiều, nguồn" />
          <Shortcut to="/reconcile" title="Đối chiếu thuế" desc="Phát hiện lệch & nghi thiếu" />
          {canExport(role) ? (
            <Shortcut to="/exports" title="Kết xuất & Convert" desc="Xuất xlsx/csv theo profile" />
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
    </div>
  );
}

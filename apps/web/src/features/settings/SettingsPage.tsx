// Cài đặt chung — B6: CHỈ dữ liệu có nguồn thật (/me: ten, mst, goiDichVu, role). Địa chỉ
// ĐÃ BỎ (tenants chưa có cột dia_chi) → hiện MST thay thế. KHÔNG bịa dữ liệu doanh nghiệp.
import { PageHeader } from "../../components/layout/PageHeader";
import { Alert, Card } from "../../components/ui/primitives";
import { labelRole } from "../../lib/rbac";
import { useAuth } from "../auth/auth-context";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "180px 1fr",
        gap: "var(--sp-3)",
        padding: "var(--sp-3) 0",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <dt style={{ color: "var(--text-tertiary)", fontSize: "var(--fs-sm)" }}>{label}</dt>
      <dd style={{ margin: 0 }}>{children}</dd>
    </div>
  );
}

export function SettingsPage() {
  const { me, email } = useAuth();
  if (!me) return null;

  return (
    <div style={{ display: "grid", gap: "var(--sp-4)" }}>
      <PageHeader title="Cài đặt chung" subtitle="Thông tin doanh nghiệp & sản phẩm" />

      <Card>
        <h2 style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-bold)" }}>
          Thông tin doanh nghiệp
        </h2>
        <dl style={{ margin: "var(--sp-3) 0 0" }}>
          <Row label="Tên doanh nghiệp">
            <strong>{me.ten}</strong>
          </Row>
          <Row label="Mã số thuế">{me.mst}</Row>
          <Row label="Gói dịch vụ">
            <span style={{ color: "var(--success-700)", fontWeight: "var(--fw-semibold)" }}>
              {me.goiDichVu ?? "—"}
            </span>
          </Row>
          {email ? <Row label="Email đăng nhập">{email}</Row> : null}
          <Row label="Vai trò của bạn">{labelRole(me.role)}</Row>
          <Row label="Ngôn ngữ">
            <span style={{ color: "var(--brand-700)", fontWeight: "var(--fw-semibold)" }}>
              Tiếng Việt
            </span>{" "}
            <span style={{ color: "var(--text-disabled)", fontSize: "var(--fs-sm)" }}>
              · English (sắp có)
            </span>
          </Row>
        </dl>
      </Card>

      <Alert tone="info">
        VATEngine đang trong giai đoạn thử nghiệm — miễn phí cho doanh nghiệp nhỏ. Dữ liệu mỗi doanh
        nghiệp được cách ly hoàn toàn theo mã số thuế.
      </Alert>
    </div>
  );
}

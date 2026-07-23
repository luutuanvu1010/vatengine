// Cài đặt chung — hồ sơ tenant. quan_tri: sửa Tên + Ghi chú (PATCH /me → applyMe).
// Vai khác: chỉ đọc. Email + Bản quyền luôn chỉ đọc. KHÔNG bịa dữ liệu.
import { useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Alert, Card } from "../../components/ui/primitives";
import { api } from "../../lib/apiClient";
import { labelRole } from "../../lib/rbac";
import { useAuth } from "../auth/auth-context";
import { DoiMatKhauCard } from "./DoiMatKhauCard";
import { ThongTinSanPham } from "./ThongTinSanPham";

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
  const { me, email, applyMe } = useAuth();
  const [ten, setTen] = useState("");
  const [ghiChu, setGhiChu] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [seeded, setSeeded] = useState(false);

  if (!me) return null;
  const isAdmin = me.role === "quan_tri";

  // Khởi tạo input từ me một lần (tránh ghi đè khi người dùng đang gõ).
  if (!seeded) {
    setTen(me.ten);
    setGhiChu(me.ghiChu ?? "");
    setSeeded(true);
  }

  async function onSave() {
    setSaving(true);
    setErr(null);
    setSaved(false);
    try {
      const updated = await api.patchMe({ ten: ten.trim(), ghiChu: ghiChu.trim() ? ghiChu : null });
      applyMe(updated);
      setSaved(true);
    } catch {
      setErr("Lưu không thành công. Vui lòng thử lại.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: "var(--sp-4)" }}>
      <PageHeader title="Cài đặt chung" subtitle="Thông tin doanh nghiệp & sản phẩm" />

      <Card>
        <h2 style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-bold)" }}>
          Thông tin doanh nghiệp
        </h2>
        <dl style={{ margin: "var(--sp-3) 0 0" }}>
          <Row label="Tên cá nhân / doanh nghiệp">
            {isAdmin ? (
              <input
                aria-label="Tên cá nhân / doanh nghiệp"
                value={ten}
                onChange={(e) => setTen(e.target.value)}
                style={{
                  width: "100%",
                  padding: "var(--sp-2) var(--sp-3)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  fontSize: "var(--fs-base)",
                }}
              />
            ) : (
              <strong>{me.ten}</strong>
            )}
          </Row>
          <Row label="Mã số thuế">{me.mst}</Row>
          {email ? <Row label="Email đăng nhập">{email}</Row> : null}
          <Row label="Bản quyền">{me.banQuyen}</Row>
          <Row label="Gói dịch vụ">
            <span style={{ color: "var(--success-700)", fontWeight: "var(--fw-semibold)" }}>
              {/* U17a (QĐ-7) — hiện nhãn tiếng Việt; goiDichVu nay là MÃ, chỉ rơi về khi thiếu nhãn. */}
              {me.goiDichVuTen ?? me.goiDichVu ?? "—"}
            </span>
          </Row>
          <Row label="Ghi chú">
            {isAdmin ? (
              <textarea
                aria-label="Ghi chú"
                value={ghiChu}
                onChange={(e) => setGhiChu(e.target.value)}
                rows={3}
                style={{
                  width: "100%",
                  padding: "var(--sp-2) var(--sp-3)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  fontSize: "var(--fs-base)",
                  resize: "vertical",
                }}
              />
            ) : (
              (me.ghiChu ?? "—")
            )}
          </Row>
          <Row label="Vai trò của bạn">{labelRole(me.role)}</Row>
        </dl>

        {isAdmin ? (
          <div
            style={{
              marginTop: "var(--sp-4)",
              display: "flex",
              gap: "var(--sp-3)",
              alignItems: "center",
            }}
          >
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              style={{
                background: "var(--brand-600)",
                color: "var(--text-on-brand)",
                border: "none",
                borderRadius: "var(--radius-md)",
                padding: "var(--sp-2) var(--sp-4)",
                fontWeight: "var(--fw-semibold)",
                cursor: saving ? "default" : "pointer",
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? "Đang lưu…" : "Lưu"}
            </button>
            {saved ? (
              <span style={{ color: "var(--success-700)", fontSize: "var(--fs-sm)" }}>Đã lưu</span>
            ) : null}
          </div>
        ) : null}

        {err ? (
          <div style={{ marginTop: "var(--sp-3)" }}>
            <Alert tone="danger">{err}</Alert>
          </div>
        ) : null}
      </Card>

      {/* U20 §4 — Đổi mật khẩu. Đặt ngay sau hồ sơ doanh nghiệp: người vừa được duyệt và
          đang cầm mật khẩu tạm sẽ thấy nó mà không phải cuộn tìm. */}
      <DoiMatKhauCard />

      {/* U20 §5 — thông tin sản phẩm, pháp lý, tác giả, quyền lợi. Đặt SAU phần thao tác
          (hồ sơ + đổi mật khẩu) vì đây là nội dung để đọc, không phải để làm. */}
      <ThongTinSanPham />
    </div>
  );
}

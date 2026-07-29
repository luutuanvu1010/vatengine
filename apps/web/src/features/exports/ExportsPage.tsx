// S3 — Kết xuất & Convert. RBAC: route đã guard (canExport); ke_toan không tới được.
// Profile: CHỈ `reference` khả dụng (registry.ts). MISA/FAST/SmartKTSC = "sắp có", KHÔNG
// cho chọn (§4.5). Áp dụng bộ lọc hiện tại (đã nhớ). Tạo → tải file (GET /exports/:id).
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Alert, Button, Card } from "../../components/ui/primitives";
import { api } from "../../lib/apiClient";
import { saveBlob } from "../../lib/download";
import { loadInvoiceFilter } from "../../lib/filterStore";
import { MOBILE_QUERY, useMediaQuery } from "../../lib/useMediaQuery";
import type { ExportFormat } from "../../types/api";
import { tenFileXuat } from "../invoices/exportFilename";

// Nguồn: packages/export/src/profiles/registry.ts (PENDING_PROFILES). Mirror hiển thị.
const PENDING = [
  { id: "misa", label: "MISA", note: "Phần mềm kế toán MISA" },
  { id: "fast", label: "FAST", note: "FAST Accounting" },
  { id: "smartktsc", label: "SmartKTSC", note: "Smart KTSC" },
];

type ProfileChoice = "native" | "reference";

const optionCard = (selected: boolean): React.CSSProperties => ({
  padding: "var(--sp-4)",
  border: `1px solid ${selected ? "var(--brand-600)" : "var(--border)"}`,
  background: selected ? "var(--brand-50)" : "var(--surface-card)",
  borderRadius: "var(--radius-md)",
  cursor: "pointer",
  textAlign: "left",
  width: "100%",
});

export function ExportsPage() {
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const [profile, setProfile] = useState<ProfileChoice>("native");
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const filter = loadInvoiceFilter();

  const run = useMutation({
    mutationFn: async () => {
      const res =
        profile === "reference"
          ? await api.convertExport("reference", format, filter)
          : await api.createExport(format, filter);
      const blob = await api.downloadExport(res.id);
      saveBlob(blob, tenFileXuat(filter, format));
      return res;
    },
  });

  return (
    <div>
      <PageHeader
        title="Kết xuất & Convert"
        subtitle="Xuất dữ liệu & chuyển đổi cho phần mềm kế toán"
      />

      <div
        style={{
          display: "grid",
          // Mobile: xếp chồng (cấu hình trên, tóm tắt/tạo file dưới). Desktop: 2 cột.
          gridTemplateColumns: isMobile ? "1fr" : "minmax(0,2fr) minmax(0,1fr)",
          gap: "var(--sp-4)",
        }}
      >
        <Card>
          <h2 style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-bold)" }}>Chọn định dạng</h2>
          <p style={{ color: "var(--text-tertiary)", marginTop: "var(--sp-1)" }}>
            Áp dụng cho tập hóa đơn theo bộ lọc hiện tại.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "var(--sp-3)",
              marginTop: "var(--sp-3)",
            }}
          >
            <button
              type="button"
              style={optionCard(format === "xlsx")}
              onClick={() => setFormat("xlsx")}
            >
              <strong>Excel (.xlsx)</strong>
              <div style={{ color: "var(--text-tertiary)", fontSize: "var(--fs-base)" }}>
                Bảng tính đầy đủ cột
              </div>
            </button>
            <button
              type="button"
              style={optionCard(format === "csv")}
              onClick={() => setFormat("csv")}
            >
              <strong>CSV (.csv)</strong>
              <div style={{ color: "var(--text-tertiary)", fontSize: "var(--fs-base)" }}>
                Dữ liệu thô, nhẹ
              </div>
            </button>
          </div>

          <h2
            style={{
              fontSize: "var(--fs-lg)",
              fontWeight: "var(--fw-bold)",
              marginTop: "var(--sp-6)",
            }}
          >
            Profile phần mềm kế toán
          </h2>
          <div style={{ display: "grid", gap: "var(--sp-2)", marginTop: "var(--sp-3)" }}>
            <button
              type="button"
              style={optionCard(profile === "native")}
              onClick={() => setProfile("native")}
            >
              <strong>Mẫu chuẩn (đầy đủ cột)</strong>
              <div style={{ color: "var(--text-tertiary)", fontSize: "var(--fs-base)" }}>
                Toàn bộ cột hóa đơn.
              </div>
            </button>
            <button
              type="button"
              style={optionCard(profile === "reference")}
              onClick={() => setProfile("reference")}
            >
              <div
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                <div>
                  <strong>Định dạng tham chiếu (reference)</strong>
                  <div style={{ color: "var(--text-tertiary)", fontSize: "var(--fs-base)" }}>
                    Cấu trúc chuẩn, sẵn sàng dùng ngay.
                  </div>
                </div>
                <span
                  style={{
                    color: "var(--success-700)",
                    fontSize: "var(--fs-xs)",
                    fontWeight: "var(--fw-semibold)",
                  }}
                >
                  Khả dụng
                </span>
              </div>
            </button>
            {PENDING.map((p) => (
              <div
                key={p.id}
                style={{ ...optionCard(false), cursor: "not-allowed", opacity: 0.6 }}
                aria-disabled="true"
              >
                <div
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
                >
                  <div>
                    <strong>{p.label}</strong>
                    <div style={{ color: "var(--text-tertiary)", fontSize: "var(--fs-sm)" }}>
                      {p.note}
                    </div>
                  </div>
                  <span style={{ color: "var(--text-disabled)", fontSize: "var(--fs-xs)" }}>
                    Sắp có
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card style={{ alignSelf: "start" }}>
          <h2 style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-bold)" }}>
            Tạo file kết xuất
          </h2>
          <dl style={{ margin: "var(--sp-3) 0", display: "grid", gap: "var(--sp-2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <dt style={{ color: "var(--text-tertiary)" }}>Định dạng</dt>
              <dd style={{ margin: 0, fontWeight: "var(--fw-semibold)" }}>
                {format === "xlsx" ? "Excel (.xlsx)" : "CSV (.csv)"}
              </dd>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <dt style={{ color: "var(--text-tertiary)" }}>Profile</dt>
              <dd style={{ margin: 0, fontWeight: "var(--fw-semibold)" }}>
                {profile === "reference" ? "reference" : "mẫu chuẩn"}
              </dd>
            </div>
          </dl>
          <Button onClick={() => run.mutate()} disabled={run.isPending} style={{ width: "100%" }}>
            {run.isPending ? "Đang tạo…" : "Tạo & tải file"}
          </Button>
          {run.isSuccess ? (
            <div style={{ marginTop: "var(--sp-3)" }}>
              <Alert tone="success">Đã tạo file và bắt đầu tải xuống.</Alert>
            </div>
          ) : null}
          {run.isError ? (
            <div style={{ marginTop: "var(--sp-3)" }}>
              <Alert tone="danger">Không tạo được file kết xuất. Vui lòng thử lại.</Alert>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

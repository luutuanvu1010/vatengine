// S3 — Kết xuất & Convert. RBAC: route đã guard (canExport); ke_toan không tới được.
// Profile: CHỈ `reference` khả dụng (registry.ts). MISA/FAST/SmartKTSC = "sắp có", KHÔNG
// cho chọn (§4.5). Áp dụng bộ lọc hiện tại (đã nhớ). Tạo → tải file (GET /exports/:id).
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader";
import {
  Alert,
  Button,
  Card,
  HuongDanTrang,
  MucHuongDan,
  SectionTitle,
} from "../../components/ui/primitives";
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
  // `<button>` KHÔNG kế thừa font của trang — thiếu hai dòng này thì trình duyệt áp mặc định
  // 13.33px, khiến TIÊU ĐỀ lựa chọn nhỏ hơn chính dòng mô tả 18px bên dưới nó (đo thật
  // 2026-07-29). Đây là "hardcode do bỏ sót": không có số nào trong mã, nhưng kết quả vẫn là
  // một cỡ chữ nằm ngoài thang token.
  fontFamily: "inherit",
  fontSize: "var(--fs-base)",
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
        subtitle="Xuất dữ liệu và chuyển đổi cho phần mềm kế toán"
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
          <SectionTitle>Chọn định dạng</SectionTitle>
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
                Bảng tính đầy đủ cột.
              </div>
            </button>
            <button
              type="button"
              style={optionCard(format === "csv")}
              onClick={() => setFormat("csv")}
            >
              <strong>CSV (.csv)</strong>
              <div style={{ color: "var(--text-tertiary)", fontSize: "var(--fs-base)" }}>
                Dữ liệu dạng bảng thuần, dung lượng nhỏ.
              </div>
            </button>
          </div>

          <SectionTitle style={{ marginTop: "var(--sp-6)" }}>
            Định dạng cho phần mềm kế toán
          </SectionTitle>
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
                  <strong>Định dạng tham chiếu</strong>
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
          <SectionTitle>Tạo tệp kết xuất</SectionTitle>
          <dl style={{ margin: "var(--sp-3) 0", display: "grid", gap: "var(--sp-2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <dt style={{ color: "var(--text-tertiary)" }}>Định dạng</dt>
              <dd style={{ margin: 0, fontWeight: "var(--fw-semibold)" }}>
                {format === "xlsx" ? "Excel (.xlsx)" : "CSV (.csv)"}
              </dd>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <dt style={{ color: "var(--text-tertiary)" }}>Định dạng kế toán</dt>
              <dd style={{ margin: 0, fontWeight: "var(--fw-semibold)" }}>
                {profile === "reference" ? "Định dạng tham chiếu" : "Mẫu chuẩn"}
              </dd>
            </div>
          </dl>
          <Button onClick={() => run.mutate()} disabled={run.isPending} style={{ width: "100%" }}>
            {run.isPending ? "Đang tạo…" : "Tạo và tải tệp"}
          </Button>
          {run.isSuccess ? (
            <div style={{ marginTop: "var(--sp-3)" }}>
              <Alert tone="success">Đã tạo tệp và bắt đầu tải về.</Alert>
            </div>
          ) : null}
          {run.isError ? (
            <div style={{ marginTop: "var(--sp-3)" }}>
              <Alert tone="danger">Không tạo được tệp kết xuất. Vui lòng thử lại.</Alert>
            </div>
          ) : null}
        </Card>
      </div>

      <HuongDanTrang>
        <MucHuongDan nhan="Chọn định dạng">
          Quyết định kiểu tệp nhận được. <strong>Excel (.xlsx)</strong> là bảng tính đầy đủ cột, mở
          trực tiếp bằng Excel. <strong>CSV (.csv)</strong> là dữ liệu dạng bảng thuần, dung lượng
          nhỏ, phù hợp khi cần nạp vào phần mềm khác.
        </MucHuongDan>
        <MucHuongDan nhan="Định dạng cho phần mềm kế toán">
          <strong>Mẫu chuẩn</strong> giữ toàn bộ cột hóa đơn theo cấu trúc của VATEngine.{" "}
          <strong>Định dạng tham chiếu</strong> sắp xếp lại cột theo cấu trúc chuẩn để nạp thẳng vào
          phần mềm kế toán. Các định dạng MISA, FAST và SmartKTSC đang được xây dựng.
        </MucHuongDan>
        <MucHuongDan nhan="Tạo và tải tệp">
          Kết xuất tập hóa đơn theo bộ lọc bạn đang dùng ở trang Danh sách hóa đơn. Tệp được tạo rồi
          tải về ngay; thao tác này không truy xuất dữ liệu mới từ Tổng cục Thuế.
        </MucHuongDan>
      </HuongDanTrang>
    </div>
  );
}

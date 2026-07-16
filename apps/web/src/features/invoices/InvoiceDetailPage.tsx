import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";
import { Alert, Card, EmptyState, ErrorState, Loading } from "../../components/ui/primitives";
import { ApiError, api } from "../../lib/apiClient";
import { formatDateVN, formatMoney } from "../../lib/format";
import { labelChieu, labelNguon } from "../../lib/statusLabels";
import type { InvoiceDetailResponse, InvoiceLineRow } from "../../types/api";
import { TthaiChip, TtxlyChip } from "./chips";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "180px 1fr",
        gap: "var(--sp-3)",
        padding: "var(--sp-2) 0",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <dt style={{ color: "var(--text-tertiary)", fontSize: "var(--fs-sm)" }}>{label}</dt>
      <dd style={{ margin: 0 }}>{children}</dd>
    </div>
  );
}

function Money({ v }: { v: string | null }) {
  return <span className="tabular">{formatMoney(v) || "—"}</span>;
}

/** Bảng dòng hàng (dong_hang_hoa) — tên SP, ĐVT, SL, đơn giá, thành tiền, thuế suất. */
function LinesTable({ lines }: { lines: InvoiceLineRow[] }) {
  const th: React.CSSProperties = {
    textAlign: "left",
    padding: "var(--sp-2)",
    color: "var(--text-tertiary)",
    fontSize: "var(--fs-sm)",
    fontWeight: 600,
    borderBottom: "1px solid var(--border-subtle)",
    whiteSpace: "nowrap",
  };
  const td: React.CSSProperties = {
    padding: "var(--sp-2)",
    borderBottom: "1px solid var(--border-subtle)",
    verticalAlign: "top",
  };
  const num: React.CSSProperties = { ...td, textAlign: "right" };
  return (
    <Card>
      <div style={{ fontWeight: 600, marginBottom: "var(--sp-3)" }}>Dòng hàng</div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-sm)" }}>
          <thead>
            <tr>
              <th style={th}>STT</th>
              <th style={th}>Tên hàng hóa, dịch vụ</th>
              <th style={th}>ĐVT</th>
              <th style={{ ...th, textAlign: "right" }}>Số lượng</th>
              <th style={{ ...th, textAlign: "right" }}>Đơn giá</th>
              <th style={{ ...th, textAlign: "right" }}>Thành tiền</th>
              <th style={{ ...th, textAlign: "right" }}>Thuế suất</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.id}>
                <td style={num}>{l.stt ?? i + 1}</td>
                <td style={td}>{l.ten ?? "—"}</td>
                <td style={td}>{l.dvtinh ?? "—"}</td>
                <td style={num} className="tabular">
                  {l.sluong ?? "—"}
                </td>
                <td style={num}>
                  <Money v={l.dgia} />
                </td>
                <td style={num}>
                  <Money v={l.thtien} />
                </td>
                <td style={num}>{l.ltsuat ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Detail({ inv }: { inv: InvoiceDetailResponse }) {
  return (
    <div style={{ display: "grid", gap: "var(--sp-4)" }}>
      <Card>
        <dl style={{ margin: 0 }}>
          <Row label="Số hóa đơn">
            <strong>{inv.shdon}</strong>
          </Row>
          <Row label="Ký hiệu mẫu số · HĐ">
            {inv.khmshdon}
            {inv.khhdon}
          </Row>
          <Row label="Ngày lập">{formatDateVN(inv.tdlap, true)}</Row>
          <Row label="Người bán">
            {inv.nbten ?? "—"} · MST {inv.nbmst}
          </Row>
          <Row label="Người mua">
            {inv.nmten ?? "—"} · MST {inv.nmmst ?? "—"}
          </Row>
          <Row label="Tiền chưa thuế">
            <Money v={inv.tgtcthue} /> {inv.dvtte ?? ""}
          </Row>
          <Row label="Chiết khấu TM">
            <Money v={inv.ttcktmai} />
          </Row>
          <Row label="Tiền thuế">
            <Money v={inv.tgtthue} />
          </Row>
          <Row label="Tổng thanh toán">
            <strong>
              <Money v={inv.tgtttbso} />
            </strong>{" "}
            {inv.dvtte ?? ""}
          </Row>
          <Row label="Trạng thái xử lý">
            <TtxlyChip code={inv.ttxly} />
          </Row>
          <Row label="Trạng thái hóa đơn">
            <TthaiChip code={inv.tthai} />
          </Row>
          <Row label="Chiều · Nguồn">
            {labelChieu(inv.chieu)} · {labelNguon(inv.nguon)}
          </Row>
        </dl>
      </Card>

      {inv.dongHangHoa.length > 0 ? (
        <LinesTable lines={inv.dongHangHoa} />
      ) : (
        <Alert tone="info">
          Hóa đơn này <strong>chưa có dòng hàng</strong> chi tiết — có thể đang chờ đồng bộ chi tiết
          (chạy nền sau phần đầu hóa đơn).
        </Alert>
      )}
    </div>
  );
}

export function InvoiceDetailPage() {
  const { id = "" } = useParams();
  const q = useQuery({
    queryKey: ["invoice", id],
    queryFn: () => api.getInvoice(id),
    retry: false,
  });

  const notFound = q.error instanceof ApiError && q.error.status === 404;

  return (
    <div>
      <PageHeader
        title="Chi tiết hóa đơn"
        actions={
          <Link to="/invoices" style={{ fontSize: "var(--fs-sm)" }}>
            ← Về danh sách
          </Link>
        }
      />
      {q.isPending ? (
        <Loading />
      ) : notFound ? (
        <EmptyState message="Không tìm thấy hóa đơn (có thể đã bị xóa hoặc ngoài phạm vi doanh nghiệp)." />
      ) : q.isError ? (
        <ErrorState message="Không tải được chi tiết hóa đơn." onRetry={() => q.refetch()} />
      ) : (
        <Detail inv={q.data} />
      )}
    </div>
  );
}

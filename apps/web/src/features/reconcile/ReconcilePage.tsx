// S4 — Đối chiếu. Nguồn: GET /reconcile → ReconcileReport (packages/reconcile). SỬA theo
// soát khớp (U15-buoc4):
//  B2 thieu_so_dau_ra: hiện nbmst+khhdon+shdonThieu (khoảng trống dãy số), nhãn "nghi thiếu"
//     — KHÔNG "ít hơn kỳ trước ~%".
//  B3 huy/thay_the: chỉ shdon + nhãn mã trạng thái — KHÔNG "thay bằng HĐ X" (finding không
//     mang con trỏ tới hóa đơn thay thế; việc ghép cặp gốc↔mới thuộc U37).
//  M2 lech_thue: nêu ĐÚNG bản chất (lệch số học header) + các cấu phần + `lech`.
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";
import { Alert, Card, EmptyState, ErrorState, Loading } from "../../components/ui/primitives";
import { api } from "../../lib/apiClient";
import { loadInvoiceFilter } from "../../lib/filterStore";
import { formatMoney } from "../../lib/format";
import { labelTthai, labelTtxly } from "../../lib/statusLabels";
import { MOBILE_QUERY, useMediaQuery } from "../../lib/useMediaQuery";
import type { Finding, ReconcileReport } from "../../types/api";

function SummaryCard({
  n,
  label,
  tone,
}: { n: number; label: string; tone: "danger" | "warning" | "neutral" }) {
  const color =
    tone === "danger"
      ? "var(--danger-600)"
      : tone === "warning"
        ? "var(--warning-800)"
        : "var(--text-primary)";
  const bg =
    tone === "danger"
      ? "var(--danger-50)"
      : tone === "warning"
        ? "var(--warning-50)"
        : "var(--surface-card)";
  return (
    <Card style={{ background: bg }}>
      <div
        style={{ fontSize: "var(--fs-3xl)", fontWeight: "var(--fw-extrabold)", color }}
        className="tabular"
      >
        {n}
      </div>
      <div style={{ color: "var(--text-tertiary)", fontSize: "var(--fs-sm)" }}>{label}</div>
    </Card>
  );
}

function FindingRow({ children, to }: { children: React.ReactNode; to?: string }) {
  const inner = (
    <div style={{ padding: "var(--sp-3) 0", borderBottom: "1px solid var(--border-subtle)" }}>
      {children}
    </div>
  );
  return to ? (
    <Link to={to} style={{ color: "inherit", textDecoration: "none", display: "block" }}>
      {inner}
    </Link>
  ) : (
    inner
  );
}

function Report({ report }: { report: ReconcileReport }) {
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const { summary, findings } = report;
  const byKind = <K extends Finding["kind"]>(k: K) => findings.filter((f) => f.kind === k);
  const lech = byKind("lech_thue");
  const thieu = byKind("thieu_so_dau_ra");
  const huy = byKind("huy");
  const thay = byKind("thay_the");

  return (
    <div style={{ display: "grid", gap: "var(--sp-4)" }}>
      {summary.lechThue > 0 ? (
        <Alert tone="danger">
          <strong>Phát hiện {summary.lechThue} hóa đơn nghi lệch thuế.</strong> Chênh lệch số học
          giữa các cấu phần tiền — cần rà soát trước khi kê khai.
        </Alert>
      ) : null}

      <div
        style={{
          display: "grid",
          // Mobile: 2×2 (4 cột quá chật ở 375px). Desktop: 4 cột.
          gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)",
          gap: "var(--sp-3)",
        }}
      >
        <SummaryCard n={summary.lechThue} label="Lệch thuế" tone="danger" />
        <SummaryCard n={summary.thieuSoDauRa} label="Nghi thiếu đầu ra" tone="warning" />
        <SummaryCard n={summary.huy} label="Hóa đơn hủy" tone="neutral" />
        <SummaryCard n={summary.thayThe} label="Bị thay thế" tone="neutral" />
      </div>

      {lech.length > 0 ? (
        <Card>
          <h2
            style={{
              fontSize: "var(--fs-lg)",
              fontWeight: "var(--fw-bold)",
              color: "var(--danger-600)",
            }}
          >
            Lệch thuế (số học)
          </h2>
          <p style={{ color: "var(--text-tertiary)", fontSize: "var(--fs-sm)" }}>
            Chưa thuế − chiết khấu + thuế ≠ tổng thanh toán.
          </p>
          {lech.map((f) =>
            f.kind === "lech_thue" ? (
              <FindingRow key={f.hoaDonId} to={`/invoices/${f.hoaDonId}`}>
                <div
                  style={{ display: "flex", justifyContent: "space-between", gap: "var(--sp-3)" }}
                >
                  <div>
                    <strong>HĐ {f.shdon}</strong>
                    <div style={{ color: "var(--text-tertiary)", fontSize: "var(--fs-sm)" }}>
                      Chưa thuế {formatMoney(f.tgtcthue) || "—"} · Thuế{" "}
                      {formatMoney(f.tgtthue) || "—"} · Tổng TT {formatMoney(f.tgtttbso) || "—"}
                    </div>
                  </div>
                  <div
                    style={{
                      color: "var(--danger-600)",
                      fontWeight: "var(--fw-bold)",
                      whiteSpace: "nowrap",
                    }}
                    className="tabular"
                  >
                    Lệch {formatMoney(f.lech)} đ
                  </div>
                </div>
              </FindingRow>
            ) : null,
          )}
        </Card>
      ) : null}

      {thieu.length > 0 ? (
        <Card>
          <h2
            style={{
              fontSize: "var(--fs-lg)",
              fontWeight: "var(--fw-bold)",
              color: "var(--warning-800)",
            }}
          >
            Nghi thiếu hóa đơn đầu ra{" "}
            <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-disabled)" }}>
              chưa khẳng định
            </span>
          </h2>
          <p style={{ color: "var(--text-tertiary)", fontSize: "var(--fs-sm)" }}>
            Khoảng trống trong dãy số hóa đơn — nghi thiếu, cần rà soát (không khẳng định).
          </p>
          {thieu.map((f) =>
            f.kind === "thieu_so_dau_ra" ? (
              <FindingRow key={`${f.nbmst}-${f.khhdon}-${f.shdonThieu}`}>
                <strong>Số {f.shdonThieu}</strong> · ký hiệu {f.khhdon} · MST bán {f.nbmst}
              </FindingRow>
            ) : null,
          )}
        </Card>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: "var(--sp-4)",
        }}
      >
        <Card>
          <h2 style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-bold)" }}>Hóa đơn hủy</h2>
          {huy.length === 0 ? (
            <EmptyState message="Không có" />
          ) : (
            huy.map((f) =>
              f.kind === "huy" ? (
                <FindingRow key={f.hoaDonId} to={`/invoices/${f.hoaDonId}`}>
                  <strong>HĐ {f.shdon}</strong>{" "}
                  <span style={{ color: "var(--text-tertiary)", fontSize: "var(--fs-sm)" }}>
                    · tthai {labelTthai(f.tthai).text} · ttxly {labelTtxly(f.ttxly).text}
                  </span>
                </FindingRow>
              ) : null,
            )
          )}
        </Card>
        <Card>
          <h2 style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-bold)" }}>Bị thay thế</h2>
          {thay.length === 0 ? (
            <EmptyState message="Không có" />
          ) : (
            thay.map((f) =>
              f.kind === "thay_the" ? (
                <FindingRow key={f.hoaDonId} to={`/invoices/${f.hoaDonId}`}>
                  <strong>HĐ {f.shdon}</strong>{" "}
                  <span style={{ color: "var(--text-tertiary)", fontSize: "var(--fs-sm)" }}>
                    · tthai {labelTthai(f.tthai).text} · ttxly {labelTtxly(f.ttxly).text}
                  </span>
                </FindingRow>
              ) : null,
            )
          )}
        </Card>
      </div>
    </div>
  );
}

export function ReconcilePage() {
  const filter = loadInvoiceFilter();
  const q = useQuery({
    queryKey: ["reconcile", filter],
    queryFn: () => api.getReconcile(filter),
  });

  return (
    <div>
      <PageHeader title="Đối chiếu" subtitle="Phát hiện lệch thuế, nghi thiếu, hủy & thay thế" />
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState message="Không tải được báo cáo đối chiếu." onRetry={() => q.refetch()} />
      ) : q.data.findings.length === 0 ? (
        <EmptyState message="Không phát hiện bất thường trong kỳ đã lọc." />
      ) : (
        <Report report={q.data} />
      )}
    </div>
  );
}

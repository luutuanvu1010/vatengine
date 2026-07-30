// U41 — Trang Tổng quan.
//
// QUAN HỆ VỚI U23-C (2026-07-16), đọc kỹ trước khi sửa: quyết định cũ là "giữ 1 dòng trạng
// thái kết nối, BỎ MỌI CON SỐ TIỀN". Bối cảnh khi đó — trang đang phơi một mớ thẻ tiền và 4
// số đối chiếu RỜI RẠC, không nói lên hành động nào. Quyết định ấy đúng ở chỗ gỡ số liệu vô
// nghĩa, và U41 KHÔNG đảo nó.
//
// U41 kế thừa và đi tiếp (chủ dự án chốt 2026-07-30): dòng trạng thái kết nối GIỮ NGUYÊN vai
// trò; số liệu quay lại CHỈ KHI nó dẫn tới một việc cần làm cụ thể. Nguyên tắc mới: không con
// số nào đứng một mình mà không trả lời được câu "rồi tôi phải làm gì". Vì vậy khối "Cần xử
// lý" đứng TRƯỚC mọi khối số liệu.
//
// KHÔNG gọi `/reconcile` — trang Đối chiếu đang ẩn có chủ đích (2026-07-29). Mọi dữ liệu rủi
// ro lấy từ `/invoices/summary` và một phép đếm hóa đơn bị sửa ngoài kỳ.
//
// `OrgIdentity` đã gỡ khỏi trang này: từ U41, Footer bốn cột có mặt ở MỌI trang và đã mang
// đầy đủ thông tin pháp nhân — giữ lại đây là nói hai lần trên cùng một màn.
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";
import { Card, ErrorState, Loading, SectionTitle, Stat } from "../../components/ui/primitives";
import { api } from "../../lib/apiClient";
import { formatDateVN, formatMoney } from "../../lib/format";
import { NAV_CHINH, navHienThi } from "../../lib/nav";
import { monthRange } from "../../lib/period";
import { canManageTaxAccounts } from "../../lib/rbac";
import { type SacDo, type ViecCanXuLy, viecCanXuLy } from "../../lib/ruiRo";
import { labelChieu } from "../../lib/statusLabels";
import type { ChieuSummary, InvoiceFilter, Role, TaxAccountView } from "../../types/api";
import { useAuth } from "../auth/auth-context";

/** Trạng thái kết nối suy từ danh sách tài khoản thuế: ĐÃ kết nối nếu có ít nhất một token
 * còn hạn. Trả token hết hạn muộn nhất để hiển thị. (Giữ nguyên từ U23-C.) */
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

/** Ánh xạ sắc độ → token màu. `lib/ruiRo.ts` cố ý KHÔNG biết gì về màu: nó nói mức độ, tầng
 * này mới quyết cách thể hiện. */
const MAU: Record<SacDo, { nen: string; vien: string }> = {
  nghiem_trong: { nen: "var(--danger-50)", vien: "var(--danger-200)" },
  canh_bao: { nen: "var(--warning-50)", vien: "var(--warning-200)" },
  info: { nen: "var(--info-50)", vien: "var(--info-200)" },
  trung_tinh: { nen: "var(--neutral-chip-bg)", vien: "var(--border)" },
};

function DongViec({ viec }: { viec: ViecCanXuLy }) {
  const mau = MAU[viec.sacDo];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--sp-4)",
        padding: "var(--sp-4) 0",
        borderTop: "1px solid var(--border-subtle)",
        flexWrap: "wrap",
      }}
    >
      {/* Ô sắc độ: mang nghĩa qua MÀU, nội dung thật nằm ở câu bên cạnh ⇒ ẩn với trình đọc
          màn hình thay vì bịa một nhãn thừa. */}
      <span
        aria-hidden
        style={{
          width: 40,
          height: 40,
          flexShrink: 0,
          borderRadius: "var(--radius-md)",
          background: mau.nen,
          border: `1px solid ${mau.vien}`,
        }}
      />
      <span
        style={{
          flex: 1,
          minWidth: 220,
          fontSize: "var(--fs-base)",
          lineHeight: "var(--lh-body)",
          color: "var(--text-primary)",
        }}
      >
        {viec.cau}
      </span>
      {/* Không hành động ⇒ KHÔNG vẽ nút. Việc này nằm ngoài quyền của vai đang đăng nhập;
          câu văn đã tự nói ai làm được (xem `lib/ruiRo.ts`). */}
      {viec.den && viec.nhanHanhDong && (
        <Link
          to={viec.den}
          style={{
            flexShrink: 0,
            padding: "var(--sp-2) var(--sp-4)",
            borderRadius: "var(--radius-md)",
            fontSize: "var(--fs-base)",
            fontWeight: "var(--fw-semibold)",
            textDecoration: "none",
            border: viec.chinh ? "1px solid transparent" : "1px solid var(--border-strong)",
            background: viec.chinh ? "var(--brand-600)" : "var(--surface-card)",
            color: viec.chinh ? "var(--text-on-brand)" : "var(--text-secondary)",
          }}
        >
          {viec.nhanHanhDong}
        </Link>
      )}
    </div>
  );
}

/** Khối "Cần xử lý" — khối quan trọng nhất trang. Rỗng KHÔNG phải màn thiếu dữ liệu mà là tin
 * tốt, nên nó nói thành lời chứ không để trống. */
function CanXuLy({ ds }: { ds: ViecCanXuLy[] }) {
  return (
    <Card>
      <SectionTitle>Cần xử lý</SectionTitle>
      {ds.length === 0 ? (
        <p
          style={{
            margin: "var(--sp-3) 0 0",
            fontSize: "var(--fs-base)",
            lineHeight: "var(--lh-body)",
            color: "var(--text-secondary)",
          }}
        >
          <strong style={{ color: "var(--success-600)" }}>
            Kỳ này không có việc nào cần xử lý.
          </strong>{" "}
          Hệ thống đã đối soát hóa đơn bị thay thế, bị điều chỉnh, hóa đơn kỳ khác vừa bị sửa và mã
          trạng thái chưa xác định.
        </p>
      ) : (
        <div style={{ marginTop: "var(--sp-2)" }}>
          {ds.map((v) => (
            <DongViec key={v.ma} viec={v} />
          ))}
        </div>
      )}
    </Card>
  );
}

/** Một chiều trong khối số liệu. Thiếu dữ liệu ⇒ "—" chứ KHÔNG phải "0": chưa biết khác hẳn
 * với bằng không, và kế toán đọc "0" là một khẳng định. */
function CotChieu({ c, chieu }: { c: ChieuSummary | undefined; chieu: string }) {
  const tien = (v: string | null | undefined) => (v == null ? "—" : `${formatMoney(v)} đồng`);
  return (
    <div style={{ display: "grid", gap: "var(--sp-3)" }}>
      <SectionTitle as="h3">{labelChieu(chieu)}</SectionTitle>
      <Stat co="sm" value={c ? c.count : "—"} label="hóa đơn" />
      <Stat co="sm" value={tien(c?.tongTthue)} label="tiền thuế" />
      <Stat co="sm" value={tien(c?.tongTtbso)} label="tổng thanh toán" />
    </div>
  );
}

export function DashboardPage() {
  const { me } = useAuth();
  const role: Role = me?.role ?? "ke_toan";
  const ky = monthRange(new Date());
  const locKy: InvoiceFilter = { tuNgay: ky.tuNgay, denNgay: ky.denNgay };

  const taiKhoan = useQuery({ queryKey: ["tax-accounts"], queryFn: () => api.listTaxAccounts() });
  const tomTat = useQuery({
    queryKey: ["invoices-summary", locKy],
    queryFn: () => api.getSummary(locKy),
  });
  // KHÔNG lọc ngày ⇒ toàn bộ kho. Dùng cho "Chỉ số đã đo được".
  const moiKy = useQuery({
    queryKey: ["invoices-summary", "moi-ky"],
    queryFn: () => api.getSummary({}),
  });
  // `limit: 1` — chỉ cần `total`, không cần dữ liệu. Bỏ ngày để đếm hóa đơn bị sửa MỌI kỳ.
  const biSuaMoiKy = useQuery({
    queryKey: ["invoices-bi-sua-tong"],
    queryFn: () => api.getInvoices({ biSua: true }, { limit: 1 }),
  });

  // KHÔNG thay cả trang bằng <Loading/> khi đang tải. Làm thế thì tiêu đề trang cũng biến
  // mất và người dùng thấy một màn gần như trắng — đúng thứ luật "bốn trạng thái" cấm. Khung
  // trang luôn đứng yên; chỉ khối nào chưa có dữ liệu thì khối đó báo đang tải.
  const dangTai = taiKhoan.isPending || tomTat.isPending;

  const conn = connectionStatus(taiKhoan.data ?? [], new Date());
  const byChieu = tomTat.data?.byChieu ?? [];

  // Bị sửa NGOÀI kỳ = tổng mọi kỳ − phần trong kỳ. `Math.max(0, …)`: hai truy vấn có thể chạy
  // lệch nhau vài giây khi đồng bộ đang ghi; thà hiện 0 còn hơn hiện số âm vô nghĩa.
  const biSuaTrongKy = byChieu.reduce(
    (n, c) => n + (c.soLoaiKhoiTong ?? 0) + (c.soDuocDieuChinh ?? 0),
    0,
  );
  const soBiSuaKyKhac = Math.max(0, (biSuaMoiKy.data?.total ?? 0) - biSuaTrongKy);

  const ds = viecCanXuLy({
    byChieu,
    daKetNoi: conn.connected,
    soBiSuaKyKhac,
    coQuyenKetNoi: canManageTaxAccounts(role),
    tuNgay: ky.tuNgay,
    denNgay: ky.denNgay,
  });

  const mua = byChieu.find((c) => c.chieu === "purchase");
  const ban = byChieu.find((c) => c.chieu === "sold");
  const nhanKy = `${ky.tuNgay.slice(5, 7)}/${ky.tuNgay.slice(0, 4)}`;
  const loiTat = navHienThi(NAV_CHINH, role).filter((m) => m.to !== "/");
  const luoi = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: "var(--sp-6)",
    marginTop: "var(--sp-4)",
  } as const;

  return (
    <div style={{ display: "grid", gap: "var(--sp-5)" }}>
      <PageHeader title="Tổng quan" subtitle={`Hóa đơn và việc cần xử lý của kỳ ${nhanKy}`} />

      {/* Khối 2 — dòng trạng thái kết nối (kế thừa U23-C). CHỈ khi lành mạnh: chưa kết nối
          thì việc đó đã thành một mục trong "Cần xử lý", nói hai lần là thừa. */}
      {conn.connected && (
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
            <span
              aria-hidden
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "var(--success-600)",
              }}
            />
            <span style={{ fontSize: "var(--fs-base)" }}>
              Đã kết nối · token còn hạn đến <strong>{formatDateVN(conn.expiresAt, true)}</strong>
            </span>
          </div>
        </Card>
      )}

      {/* Khối 3 — Cần xử lý. Đứng TRƯỚC mọi số liệu: đây là thứ trả lời "tôi phải làm gì". */}
      {tomTat.isError ? (
        <Card>
          <SectionTitle>Cần xử lý</SectionTitle>
          <div style={{ marginTop: "var(--sp-3)" }}>
            <ErrorState
              message="Không truy xuất được số liệu của kỳ này. Hóa đơn đã lưu trữ vẫn còn nguyên. Vui lòng thử lại."
              onRetry={() => {
                void tomTat.refetch();
              }}
            />
          </div>
        </Card>
      ) : dangTai ? (
        <Card>
          <SectionTitle>Cần xử lý</SectionTitle>
          <Loading />
        </Card>
      ) : (
        <CanXuLy ds={ds} />
      )}

      {/* Khối 4 — số liệu kỳ. */}
      <Card>
        <SectionTitle>Số liệu kỳ {nhanKy}</SectionTitle>
        <div style={luoi}>
          <div data-testid="so-lieu-purchase">
            <CotChieu c={mua} chieu="purchase" />
          </div>
          <div data-testid="so-lieu-sold">
            <CotChieu c={ban} chieu="sold" />
          </div>
        </div>
        {/* `!dangTai &&`: lúc còn đang tải thì CHƯA BIẾT có kết nối hay không — khẳng định
            "chưa kết nối" ngay là nói một điều mình chưa kiểm được. */}
        {!dangTai && !conn.connected && (
          <p
            style={{
              margin: "var(--sp-4) 0 0",
              fontSize: "var(--fs-base)",
              color: "var(--text-tertiary)",
            }}
          >
            Số liệu kỳ hiện tại hiển thị sau khi kết nối tài khoản thuế.
          </p>
        )}
      </Card>

      {/* Khối 5 — chỉ số đã đo được. CHỈ số đếm THẬT. Không quy đổi ra giờ/tiền tiết kiệm:
          số suy đoán trình bày như sự thật là vi phạm nguyên tắc bằng chứng của Hiến pháp. */}
      <Card>
        <SectionTitle>Chỉ số đã đo được</SectionTitle>
        <div style={luoi}>
          <Stat
            value={moiKy.data ? formatMoney(String(moiKy.data.total.count)) : "—"}
            label="hóa đơn đã truy xuất và lưu trữ (mọi kỳ)"
          />
          <Stat value={dangTai ? "—" : ds.length} label="việc cần xử lý trong kỳ này" />
        </div>
      </Card>

      {/* Khối 6 — lối tắt, dẫn xuất từ nguồn điều hướng dùng chung (lọc theo vai VÀ theo cờ). */}
      <Card>
        <SectionTitle>Lối tắt</SectionTitle>
        <div style={{ ...luoi, gap: "var(--sp-3)" }}>
          {loiTat.map((m) => (
            <Link
              key={m.to}
              to={m.to}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "var(--sp-3)",
                padding: "var(--sp-4)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border)",
                textDecoration: "none",
                color: "var(--text-primary)",
                fontSize: "var(--fs-base)",
                fontWeight: "var(--fw-semibold)",
              }}
            >
              {m.label}
              <span aria-hidden style={{ color: "var(--text-tertiary)" }}>
                ›
              </span>
            </Link>
          ))}
        </div>
      </Card>

      {/* Khối 7 — mô tả chức năng đặt ở CUỐI nội dung chính (ui.md): nhãn nút giữ ngắn, câu
          giải thích dồn xuống đây, không nhét vào thẻ hành động, không giấu trong tooltip. */}
      <Card>
        <SectionTitle>Trang này dùng để làm gì</SectionTitle>
        <p
          style={{
            margin: "var(--sp-3) 0 0",
            fontSize: "var(--fs-base)",
            lineHeight: "var(--lh-body)",
            color: "var(--text-secondary)",
          }}
        >
          Tổng quan tập hợp những việc phát sinh trên hóa đơn của kỳ đang xem — hóa đơn bị thay thế,
          bị điều chỉnh, hóa đơn kỳ khác vừa bị sửa, hóa đơn mang mã trạng thái chưa xác định và
          phần chênh lệch số thuế phải nộp kèm theo. Mỗi mục dẫn tới đúng danh sách hóa đơn liên
          quan để kiểm tra trước khi kê khai.
        </p>
        <p
          style={{
            margin: "var(--sp-3) 0 0",
            fontSize: "var(--fs-base)",
            lineHeight: "var(--lh-body)",
            color: "var(--text-tertiary)",
          }}
        >
          Số liệu được truy xuất từ hệ thống Tổng cục Thuế và lưu trữ lại. Mã trạng thái chưa được
          kiểm chứng luôn hiển thị trung tính, không suy diễn ý nghĩa.
        </p>
      </Card>
    </div>
  );
}

// U19 — Bảng điều khiển doanh nghiệp. Mặt điều khiển chính của chủ dự án.
//
// Nút hiện ra bám ĐÚNG máy trạng thái U18 (`apps/api/src/admin/tenantStateMachine.ts`):
// mỗi trạng thái chỉ có những hành động hợp lệ. Đây là tiện lợi cho người dùng, KHÔNG phải
// lớp bảo vệ — backend vẫn ép bằng `WHERE trang_thai = <nguồn>` trong một câu UPDATE nguyên
// tử, nên bấm bừa cũng chỉ nhận 409 chứ không làm hỏng dữ liệu.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AdminApiError, adminApi } from "../../lib/adminApiClient";
import type { KetQuaCapMatKhau, TenantRow, TrangThaiTenant } from "../../lib/types";
import { MatKhauTamDialog } from "./MatKhauTamDialog";

const TAB: Array<{ ma: TrangThaiTenant | "tat_ca"; nhan: string }> = [
  // "Chờ duyệt" đứng đầu VÀ là mặc định: đó là việc cần làm của chủ dự án, không phải
  // danh sách để ngắm. Mở app ra là thấy ngay việc tồn đọng.
  { ma: "cho_duyet", nhan: "Chờ duyệt" },
  { ma: "active", nhan: "Đang hoạt động" },
  { ma: "khoa", nhan: "Đã khóa" },
  { ma: "tu_choi", nhan: "Đã từ chối" },
  { ma: "tat_ca", nhan: "Tất cả" },
];

const NHAN_TRANG_THAI: Record<string, { chu: string; mau: string }> = {
  cho_duyet: { chu: "Chờ duyệt", mau: "var(--cho)" },
  active: { chu: "Đang hoạt động", mau: "var(--tot)" },
  khoa: { chu: "Đã khóa", mau: "var(--nguy)" },
  tu_choi: { chu: "Đã từ chối", mau: "var(--chu-mo)" },
};

type HanhDong = "duyet" | "tu_choi" | "khoa" | "mo_khoa" | "reset";

const XAC_NHAN: Record<HanhDong, (t: TenantRow) => string> = {
  duyet: (t) => `Duyệt "${t.ten}" (MST ${t.mst})? Hệ thống sẽ cấp mật khẩu tạm cho khách.`,
  tu_choi: (t) => `Từ chối "${t.ten}"? Đây là trạng thái CUỐI — không hoàn tác được.`,
  khoa: (t) => `Khóa "${t.ten}"? Khách sẽ không đăng nhập mới được nữa.`,
  mo_khoa: (t) => `Mở khóa "${t.ten}"? Khách đăng nhập lại được ngay.`,
  reset: (t) => `Cấp lại mật khẩu tạm cho "${t.ten}"? Mật khẩu hiện tại sẽ hết hiệu lực.`,
};

/** Hai nhóm phản hồi: `duyet`/`reset` kèm mật khẩu tạm, còn lại chỉ trạng thái mới.
 * Khai tường minh để `useMutation` có MỘT kiểu dữ liệu thay vì suy ra union từ switch. */
type KetQuaThaoTac = KetQuaCapMatKhau | { ok: true; trang_thai: TrangThaiTenant };

function goiApi(hanhDong: HanhDong, id: string): Promise<KetQuaThaoTac> {
  switch (hanhDong) {
    case "duyet":
      return adminApi.duyetTenant(id);
    case "tu_choi":
      return adminApi.tuChoiTenant(id);
    case "khoa":
      return adminApi.khoaTenant(id);
    case "mo_khoa":
      return adminApi.moKhoaTenant(id);
    case "reset":
      return adminApi.resetMatKhau(id);
  }
}

/** Hành động hợp lệ theo trạng thái — bản sao ở client của máy trạng thái U18. */
export function hanhDongChoTrangThai(trangThai: string): HanhDong[] {
  switch (trangThai) {
    case "cho_duyet":
      return ["duyet", "tu_choi"];
    case "active":
      return ["khoa", "reset"];
    case "khoa":
      return ["mo_khoa"];
    default:
      return []; // tu_choi = trạng thái cuối, chỉ xem.
  }
}

const NHAN_NUT: Record<HanhDong, string> = {
  duyet: "Duyệt",
  tu_choi: "Từ chối",
  khoa: "Khóa",
  mo_khoa: "Mở khóa",
  reset: "Cấp lại mật khẩu",
};

export function TenantsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<TrangThaiTenant | "tat_ca">("cho_duyet");
  const [tim, setTim] = useState("");
  const [matKhauTam, setMatKhauTam] = useState<KetQuaCapMatKhau | null>(null);
  const [loiThaoTac, setLoiThaoTac] = useState<string | null>(null);

  const ds = useQuery({
    queryKey: ["tenants", tab, tim],
    queryFn: () =>
      adminApi.lietKeTenant({
        trangThai: tab === "tat_ca" ? undefined : tab,
        q: tim || undefined,
        limit: 100,
      }),
  });

  const thaoTac = useMutation({
    mutationFn: ({ hanhDong, id }: { hanhDong: HanhDong; id: string }) => goiApi(hanhDong, id),
    onSuccess: (kq) => {
      setLoiThaoTac(null);
      // Duyệt và Cấp-lại trả về mật khẩu tạm — hiện ngay, vì không có lần thứ hai.
      if ("mat_khau_tam" in kq) setMatKhauTam(kq as KetQuaCapMatKhau);
      void qc.invalidateQueries({ queryKey: ["tenants"] });
    },
    onError: (e) => {
      // 409 = ai đó (hoặc chính mình ở tab khác) vừa đổi trạng thái trước. Nói đúng bản
      // chất và nạp lại, thay vì báo "có lỗi" chung chung rồi để màn hình hiện dữ liệu cũ.
      if (e instanceof AdminApiError && e.status === 409) {
        setLoiThaoTac(
          "Trạng thái doanh nghiệp này vừa thay đổi (có thể bạn đã thao tác ở cửa sổ khác). Danh sách đã được nạp lại — xem lại rồi thử tiếp.",
        );
        void qc.invalidateQueries({ queryKey: ["tenants"] });
        return;
      }
      if (e instanceof AdminApiError && e.status === 404) {
        setLoiThaoTac("Không tìm thấy doanh nghiệp này.");
        void qc.invalidateQueries({ queryKey: ["tenants"] });
        return;
      }
      setLoiThaoTac("Thao tác không thành công. Vui lòng thử lại.");
    },
  });

  function bam(hanhDong: HanhDong, t: TenantRow) {
    if (!window.confirm(XAC_NHAN[hanhDong](t))) return;
    thaoTac.mutate({ hanhDong, id: t.id });
  }

  return (
    <div>
      <h1 style={{ marginTop: 0, fontSize: "1.4rem" }}>Doanh nghiệp</h1>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        {TAB.map((x) => (
          <button
            key={x.ma}
            type="button"
            onClick={() => setTab(x.ma)}
            aria-pressed={tab === x.ma}
            style={{
              padding: "0.4rem 0.85rem",
              background: tab === x.ma ? "var(--nhan)" : "var(--nen-noi)",
              color: tab === x.ma ? "#1f1300" : "var(--chu)",
              border: "1px solid var(--vien)",
              fontWeight: tab === x.ma ? 700 : 400,
            }}
          >
            {x.nhan}
          </button>
        ))}
      </div>

      <label htmlFor="tim" style={{ display: "block", marginBottom: "0.35rem" }}>
        Tìm theo MST, tên doanh nghiệp hoặc email
      </label>
      <input
        id="tim"
        value={tim}
        onChange={(e) => setTim(e.target.value)}
        placeholder="Ví dụ: 0100000001"
        style={{
          width: "min(100%, 28rem)",
          padding: "0.5rem 0.7rem",
          background: "var(--nen-noi)",
          color: "var(--chu)",
          border: "1px solid var(--vien)",
          marginBottom: "1.25rem",
        }}
      />

      {loiThaoTac && (
        <p
          role="alert"
          style={{
            background: "var(--nen-noi)",
            border: "1px solid var(--nguy)",
            borderRadius: "var(--ban-kinh)",
            padding: "0.75rem 1rem",
            color: "var(--chu)",
          }}
        >
          {loiThaoTac}
        </p>
      )}

      {ds.isPending && <output>Đang tải danh sách…</output>}

      {ds.isError && (
        <div role="alert">
          <p>Không tải được danh sách doanh nghiệp.</p>
          <button type="button" onClick={() => void ds.refetch()}>
            Thử lại
          </button>
        </div>
      )}

      {ds.data && ds.data.items.length === 0 && (
        <p style={{ color: "var(--chu-mo)" }}>
          {tab === "cho_duyet"
            ? "Không có doanh nghiệp nào đang chờ duyệt."
            : "Không có doanh nghiệp nào khớp."}
        </p>
      )}

      {ds.data && ds.data.items.length > 0 && (
        <>
          <p style={{ color: "var(--chu-mo)", fontSize: "var(--fs-sm)" }}>
            {ds.data.total} doanh nghiệp
          </p>
          <table>
            <thead>
              <tr>
                <th>Tên doanh nghiệp</th>
                <th>MST</th>
                <th>Email</th>
                <th>Trạng thái</th>
                <th>Gói</th>
                <th>Ngày tạo</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {ds.data.items.map((t) => {
                const nhan = NHAN_TRANG_THAI[t.trang_thai] ?? {
                  chu: t.trang_thai,
                  mau: "var(--chu-mo)",
                };
                return (
                  <tr key={t.id}>
                    <td>{t.ten}</td>
                    <td>{t.mst}</td>
                    <td>{t.email ?? "—"}</td>
                    <td style={{ color: nhan.mau, fontWeight: 600 }}>{nhan.chu}</td>
                    <td>{t.goi_dich_vu}</td>
                    <td>
                      {new Date(t.ngay_tao).toLocaleDateString("vi-VN", {
                        timeZone: "Asia/Ho_Chi_Minh",
                      })}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                        {hanhDongChoTrangThai(t.trang_thai).map((hd) => (
                          <button
                            key={hd}
                            type="button"
                            disabled={thaoTac.isPending}
                            onClick={() => bam(hd, t)}
                            style={{
                              padding: "0.3rem 0.7rem",
                              background: hd === "duyet" ? "var(--tot)" : "var(--nen-noi-2)",
                              color: hd === "duyet" ? "#04240f" : "var(--chu)",
                              border: "1px solid var(--vien)",
                              fontWeight: hd === "duyet" ? 700 : 400,
                              fontSize: "var(--fs-sm)",
                            }}
                          >
                            {NHAN_NUT[hd]}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {matKhauTam && <MatKhauTamDialog ketQua={matKhauTam} onDong={() => setMatKhauTam(null)} />}
    </div>
  );
}

// U19 — Bảng điều khiển doanh nghiệp. Mặt điều khiển chính của chủ dự án.
//
// Nút hiện ra bám ĐÚNG máy trạng thái U18 (`apps/api/src/admin/tenantStateMachine.ts`):
// mỗi trạng thái chỉ có những hành động hợp lệ. Đây là tiện lợi cho người dùng, KHÔNG phải
// lớp bảo vệ — backend vẫn ép bằng `WHERE trang_thai = <nguồn>` trong một câu UPDATE nguyên
// tử, nên bấm bừa cũng chỉ nhận 409 chứ không làm hỏng dữ liệu.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AdminApiError, adminApi } from "../../lib/adminApiClient";
import type { KetQuaGuiThuDatMatKhau, TenantRow, TrangThaiTenant } from "../../lib/types";
import { DaGuiThuDialog } from "./DaGuiThuDialog";
import { DoiMstDialog } from "./DoiMstDialog";

const TAB: Array<{ ma: TrangThaiTenant | "tat_ca"; nhan: string }> = [
  // "Chờ duyệt" đứng đầu VÀ là mặc định: đó là việc cần làm của chủ dự án, không phải
  // danh sách để ngắm. Mở app ra là thấy ngay việc tồn đọng.
  { ma: "cho_duyet", nhan: "Chờ duyệt" },
  // U34c: hồ sơ mới đăng ký nằm ở đây cho tới khi khách bấm link xác thực trong thư.
  // Không có tab này thì hồ sơ kẹt xác thực (thư không tới, khách quên bấm) tàng hình
  // hoàn toàn — chủ dự án thấy "Chờ duyệt" trống và tưởng không ai đăng ký.
  { ma: "cho_xac_thuc_email", nhan: "Chờ xác thực email" },
  { ma: "active", nhan: "Đang hoạt động" },
  { ma: "khoa", nhan: "Đã khóa" },
  { ma: "tu_choi", nhan: "Đã từ chối" },
  { ma: "tat_ca", nhan: "Tất cả" },
];

const NHAN_TRANG_THAI: Record<string, { chu: string; mau: string }> = {
  cho_xac_thuc_email: { chu: "Chờ xác thực email", mau: "var(--chu-mo)" },
  cho_duyet: { chu: "Chờ duyệt", mau: "var(--cho)" },
  active: { chu: "Đang hoạt động", mau: "var(--tot)" },
  khoa: { chu: "Đã khóa", mau: "var(--nguy)" },
  tu_choi: { chu: "Đã từ chối", mau: "var(--chu-mo)" },
};

type HanhDong = "duyet" | "tu_choi" | "khoa" | "mo_khoa" | "gui_lai_link";

const XAC_NHAN: Record<HanhDong, (t: TenantRow) => string> = {
  duyet: (t) =>
    `Duyệt "${t.ten}" (MST ${t.mst})? Hệ thống sẽ gửi thư kèm liên kết đặt mật khẩu cho khách.`,
  tu_choi: (t) => `Từ chối "${t.ten}"? Đây là trạng thái CUỐI — không hoàn tác được.`,
  khoa: (t) => `Khóa "${t.ten}"? Khách sẽ không đăng nhập mới được nữa.`,
  mo_khoa: (t) => `Mở khóa "${t.ten}"? Khách đăng nhập lại được ngay.`,
  gui_lai_link: (t) =>
    `Gửi lại liên kết đặt mật khẩu cho "${t.ten}"? Liên kết cũ sẽ hết hiệu lực ngay.`,
};

/** Hai nhóm phản hồi: `duyet`/`gui_lai_link` kèm kết quả gửi thư, còn lại chỉ trạng thái mới.
 * Khai tường minh để `useMutation` có MỘT kiểu dữ liệu thay vì suy ra union từ switch. */
type KetQuaThaoTac = KetQuaGuiThuDatMatKhau | { ok: true; trang_thai: TrangThaiTenant };

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
    case "gui_lai_link":
      return adminApi.guiLaiLinkDatMatKhau(id);
  }
}

/** Hành động hợp lệ theo trạng thái — bản sao ở client của máy trạng thái U18. */
export function hanhDongChoTrangThai(trangThai: string): HanhDong[] {
  switch (trangThai) {
    case "cho_duyet":
      return ["duyet", "tu_choi"];
    case "active":
      return ["khoa", "gui_lai_link"];
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
  gui_lai_link: "Gửi lại link đặt mật khẩu",
};

export function TenantsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<TrangThaiTenant | "tat_ca">("cho_duyet");
  const [tim, setTim] = useState("");
  const [ketQuaGui, setKetQuaGui] = useState<KetQuaGuiThuDatMatKhau | null>(null);
  // Nhớ tenant vừa thao tác để nút "Gửi lại thư" trong hộp thoại biết gửi cho AI. Thiếu
  // nó thì nút đó hoặc phải đóng hộp thoại đi tìm lại hàng, hoặc gửi nhầm người.
  const [tenantDangThaoTac, setTenantDangThaoTac] = useState<string | null>(null);
  const [doiMstTenant, setDoiMstTenant] = useState<TenantRow | null>(null);
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
      // Duyệt và Gửi-lại trả kết quả gửi thư — hiện ngay, vì `da_gui_thu === false` là
      // thứ chỉ con người xử lý được, và chủ dự án là người duy nhất nhìn thấy nó.
      if ("da_gui_thu" in kq) setKetQuaGui(kq as KetQuaGuiThuDatMatKhau);
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
    setTenantDangThaoTac(t.id);
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
            ? "Không có doanh nghiệp nào đang chờ duyệt. Hồ sơ mới đăng ký nằm ở tab “Chờ xác thực email” cho tới khi khách bấm liên kết xác thực trong thư."
            : tab === "cho_xac_thuc_email"
              ? "Không có hồ sơ nào đang chờ xác thực email. Hồ sơ mới đăng ký nằm ở đây khi khách chưa bấm liên kết xác thực trong thư; bấm xong sẽ chuyển sang “Chờ duyệt”."
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
                        {/* Đổi MST — nút RIÊNG, không thuộc máy trạng thái (nó không đổi
                            trạng thái). Backend là chốt thật: chặn khi tenant đã đồng bộ,
                            trả thông điệp rõ. ẨN ở `tu_choi`: đó là trạng thái CUỐI, tenant
                            đã chết — sửa MST cho nó vô nghĩa (muốn dùng thì đăng ký lại). */}
                        {t.trang_thai !== "tu_choi" && (
                          <button
                            type="button"
                            onClick={() => setDoiMstTenant(t)}
                            style={{
                              padding: "0.3rem 0.7rem",
                              background: "var(--nen-noi-2)",
                              color: "var(--chu)",
                              border: "1px solid var(--vien)",
                              fontSize: "var(--fs-sm)",
                            }}
                          >
                            Đổi MST
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {ketQuaGui && (
        <DaGuiThuDialog
          ketQua={ketQuaGui}
          onDong={() => setKetQuaGui(null)}
          onGuiLai={() => {
            if (tenantDangThaoTac) {
              thaoTac.mutate({ hanhDong: "gui_lai_link", id: tenantDangThaoTac });
            }
          }}
        />
      )}

      {doiMstTenant && (
        <DoiMstDialog
          tenant={doiMstTenant}
          onDong={() => setDoiMstTenant(null)}
          onXong={(soTkXoa) => {
            setDoiMstTenant(null);
            setLoiThaoTac(
              soTkXoa > 0
                ? `Đã đổi MST và ngắt ${soTkXoa} kết nối Tổng cục Thuế. Khách cần kết nối lại.`
                : "Đã đổi mã số thuế.",
            );
            void qc.invalidateQueries({ queryKey: ["tenants"] });
          }}
        />
      )}
    </div>
  );
}

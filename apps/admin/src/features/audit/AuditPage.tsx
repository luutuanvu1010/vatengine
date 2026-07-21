// U19 — Nhật ký quản trị. Chỉ đọc.
//
// Đọc từ `audit_log_admin` qua `GET /admin/audit` (U18). Bảng đó là APPEND-ONLY ở tầng DB
// (trigger chặn UPDATE/DELETE/TRUNCATE, kể cả với owner) — nên những gì hiện ở đây không
// ai sửa được sau lưng, kể cả chính super-admin. Đó là điểm khiến trang này có giá trị
// pháp lý chứ không chỉ để tham khảo.
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "../../lib/adminApiClient";
import type { AuditRow } from "../../lib/types";

/** Động từ audit → câu tiếng Việt. Không khớp thì hiện nguyên mã: thà thô còn hơn giấu
 * mất một hành động vừa được thêm ở backend mà quên cập nhật bảng này. */
const NHAN: Record<string, string> = {
  admin_login: "Đăng nhập quản trị",
  admin_login_fail: "Đăng nhập quản trị THẤT BẠI",
  duyet_tenant: "Duyệt doanh nghiệp",
  tu_choi_tenant: "Từ chối doanh nghiệp",
  khoa_tenant: "Khóa doanh nghiệp",
  mo_khoa_tenant: "Mở khóa doanh nghiệp",
  cap_mat_khau_tam: "Cấp mật khẩu tạm",
  reset_mat_khau_tenant: "Cấp lại mật khẩu",
  sua_metadata_tenant: "Sửa thông tin doanh nghiệp",
};

function gioVN(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}

/** Tóm tắt `chi_tiet` thành một dòng đọc được. `chi_tiet` là jsonb tự do nên không ép
 * kiểu cứng — hiện JSON gọn khi không nhận ra dạng quen thuộc. */
function tomTat(row: AuditRow): string {
  const d = row.chi_tiet;
  if (d === null || d === undefined) return "";
  if (typeof d === "object") {
    const o = d as Record<string, unknown>;
    if (typeof o.cu === "string" && typeof o.moi === "string") return `${o.cu} → ${o.moi}`;
    if (o.da_cap === true) return "đã cấp mã mới";
    if (typeof o.ket_qua === "string") return o.ket_qua;
  }
  return JSON.stringify(d);
}

export function AuditPage() {
  const q = useQuery({
    queryKey: ["audit"],
    queryFn: () => adminApi.docAudit({ limit: 100 }),
  });

  return (
    <div>
      <h1 style={{ marginTop: 0, fontSize: "1.4rem" }}>Nhật ký quản trị</h1>
      <p style={{ color: "var(--chu-mo)", fontSize: "var(--fs-sm)" }}>
        Ghi lại mọi thao tác quản trị. Nhật ký chỉ ghi thêm, không sửa hay xóa được — kể cả bởi tài
        khoản quản trị.
      </p>

      {q.isPending && <output>Đang tải nhật ký…</output>}

      {q.isError && (
        <div role="alert">
          <p>Không tải được nhật ký.</p>
          <button type="button" onClick={() => void q.refetch()}>
            Thử lại
          </button>
        </div>
      )}

      {q.data && q.data.items.length === 0 && (
        <p style={{ color: "var(--chu-mo)" }}>Chưa có thao tác nào được ghi.</p>
      )}

      {q.data && q.data.items.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Thời điểm (giờ VN)</th>
              <th>Hành động</th>
              <th>Doanh nghiệp đích</th>
              <th>Chi tiết</th>
            </tr>
          </thead>
          <tbody>
            {q.data.items.map((a) => (
              <tr key={a.id}>
                <td style={{ whiteSpace: "nowrap" }}>{gioVN(a.tao_luc)}</td>
                <td>{NHAN[a.hanh_dong] ?? a.hanh_dong}</td>
                <td style={{ fontFamily: "monospace", fontSize: "var(--fs-sm)" }}>
                  {a.doi_tuong ?? "—"}
                </td>
                <td style={{ color: "var(--chu-mo)" }}>{tomTat(a)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

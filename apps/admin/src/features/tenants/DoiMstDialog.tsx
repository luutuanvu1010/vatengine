// Sửa MST trong Cổng Admin (spec 2026-07-23).
//
// MST là danh tính pháp lý của doanh nghiệp — cửa này chỉ mở cho super-admin, để sửa lỗi
// gõ nhầm lúc đăng ký. Backend là chốt thật: chặn khi tenant đã từng đồng bộ, bắt trùng
// MST, và tự xoá kết nối thuế (username tự gán = MST cũ). Dialog chỉ nhập + dịch lỗi sang
// tiếng người. Client là UX, KHÔNG phải lớp bảo vệ.
import { useState } from "react";
import { AdminApiError, adminApi } from "../../lib/adminApiClient";
import type { TenantRow } from "../../lib/types";

// 10 = doanh nghiệp/tổ chức; 10-3 (gạch ngang, TT 105/2020) hoặc 13 số liền = đơn vị
// phụ thuộc; 12 = số định danh cá nhân (hộ kinh doanh / cá nhân, theo TT 86/2024/TT-BTC).
// Khớp `apps/api/.../admin/tenants.ts`.
const MST_RE = /^\d{10}(-\d{3})?$|^\d{12}$|^\d{13}$/;

// Thông điệp kiểm ở CLIENT (dạng MST) — tách riêng vì nó không đến từ mã lỗi server.
const MST_SAI_DANG =
  "Mã số thuế phải gồm 10, 12 hoặc 13 chữ số; đơn vị phụ thuộc dùng dạng 10 số, gạch ngang và 3 số (ví dụ 0305097236-005).";

// Ánh xạ MÃ LỖI server → tiếng người. `noUncheckedIndexedAccess` khiến truy cập trả
// `string | undefined`, nên nơi dùng luôn có nhánh mặc định.
const LOI: Record<string, string> = {
  da_co_du_lieu:
    "Không đổi được: doanh nghiệp này đã đồng bộ dữ liệu. Đổi MST sẽ bỏ rơi toàn bộ hoá đơn đã kéo về.",
  mst_da_ton_tai: "Mã số thuế này đã thuộc về doanh nghiệp khác trong hệ thống.",
  mst_khong_hop_le: MST_SAI_DANG,
  not_found: "Không tìm thấy doanh nghiệp này.",
};

interface Props {
  tenant: TenantRow;
  onDong: () => void;
  onXong: (soTkXoa: number) => void;
}

export function DoiMstDialog({ tenant, onDong, onXong }: Props) {
  const [mst, setMst] = useState("");
  const [loi, setLoi] = useState<string | null>(null);
  const [dangGui, setDangGui] = useState(false);

  async function gui() {
    const m = mst.trim();
    if (!MST_RE.test(m)) {
      setLoi(MST_SAI_DANG);
      return;
    }
    if (
      !window.confirm(
        `Đổi MST của "${tenant.ten}" từ ${tenant.mst} sang ${m}?\n\nMọi kết nối Tổng cục Thuế của doanh nghiệp này sẽ bị NGẮT. Khách phải kết nối lại bằng MST mới.`,
      )
    ) {
      return;
    }
    setLoi(null);
    setDangGui(true);
    try {
      const kq = await adminApi.doiMst(tenant.id, m);
      onXong(kq.so_tk_thue_da_xoa);
    } catch (e) {
      const code = e instanceof AdminApiError ? e.code : undefined;
      setLoi((code && LOI[code]) || "Đổi MST không thành công. Vui lòng thử lại.");
    } finally {
      setDangGui(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "grid",
        placeItems: "center",
        padding: "1.5rem",
        zIndex: 50,
      }}
    >
      <dialog
        open
        aria-modal="true"
        aria-labelledby="doi-mst-tieu-de"
        style={{
          position: "static",
          width: "min(100%, 32rem)",
          color: "var(--chu)",
          background: "var(--nen-noi)",
          border: "1px solid var(--vien)",
          borderRadius: "12px",
          padding: "1.75rem",
        }}
      >
        <h2 id="doi-mst-tieu-de" style={{ margin: "0 0 0.5rem", fontSize: "1.25rem" }}>
          Đổi mã số thuế
        </h2>
        <p style={{ margin: "0 0 1.25rem", color: "var(--chu-mo)" }}>
          {tenant.ten} — hiện tại: <strong>{tenant.mst}</strong>
        </p>

        {loi && (
          <p
            role="alert"
            style={{
              background: "var(--nen)",
              border: "1px solid var(--nguy)",
              borderRadius: "var(--ban-kinh)",
              padding: "0.75rem 1rem",
              marginBottom: "1rem",
            }}
          >
            {loi}
          </p>
        )}

        <label htmlFor="mst-moi" style={{ display: "block", marginBottom: "0.35rem" }}>
          Mã số thuế mới (10, 12, 13 chữ số hoặc dạng chi nhánh 10 số-3 số)
        </label>
        <input
          id="mst-moi"
          value={mst}
          onChange={(e) => setMst(e.target.value)}
          placeholder="Ví dụ: 0100000002"
          style={{
            width: "100%",
            padding: "0.5rem 0.7rem",
            background: "var(--nen)",
            color: "var(--chu)",
            border: "1px solid var(--vien)",
            marginBottom: "1.25rem",
          }}
        />

        <div style={{ display: "flex", gap: "0.6rem" }}>
          <button
            type="button"
            disabled={dangGui}
            onClick={() => void gui()}
            style={{
              flex: 1,
              padding: "0.7rem",
              background: "var(--nhan)",
              color: "#1f1300",
              border: "none",
              fontWeight: 700,
            }}
          >
            {dangGui ? "Đang đổi…" : "Đổi MST"}
          </button>
          <button
            type="button"
            onClick={onDong}
            style={{
              flex: 1,
              padding: "0.7rem",
              background: "var(--nen-noi-2)",
              color: "var(--chu)",
              border: "1px solid var(--vien)",
            }}
          >
            Hủy
          </button>
        </div>
      </dialog>
    </div>
  );
}

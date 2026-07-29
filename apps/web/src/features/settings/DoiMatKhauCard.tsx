// U20 §4 — Đổi mật khẩu. KHÔNG ép (chủ dự án chốt 2026-07-21) nhưng BẮT BUỘC phải tồn tại.
//
// Vì sao không phải tính năng "thêm cho đủ": U18 đặt hạn **72 giờ** cho mật khẩu tạm 6 số
// (cột `mat_khau_tam_het_han`) — đó là một trong ba điều kiện bù cho việc mật khẩu chỉ có
// 10^6 khả năng. Không có đường đổi thì mọi khách vừa được duyệt sẽ bị **khoá cứng sau 72
// giờ** và phải xin quản trị viên cấp lại, lặp vô hạn. Màn này là thứ làm cho mật khẩu tạm
// dùng được, không phải trang trí.
//
// Khác biệt với "buộc đổi": không có cổng chặn đường, không có màn hình bắt buộc. Người
// dùng tự vào Cài đặt khi muốn — như mọi phần mềm khác.
import { type FormEvent, useState } from "react";
import { Alert, Button, Card, SectionTitle, TextField } from "../../components/ui/primitives";
import { ApiError, api } from "../../lib/apiClient";
import { vi } from "../../lib/i18n/vi";
import { useAuth } from "../auth/auth-context";

/** Độ dài tối thiểu — khớp `MAT_KHAU_TOI_THIEU` ở `apps/api/src/routes/auth.ts`. Lệch số
 * này thì client chặn/cho qua khác backend, và người dùng nhận lỗi khó hiểu. */
const TOI_THIEU = 8;

function thongDiepLoi(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return "Mật khẩu hiện tại không đúng.";
    if (err.code === "mat_khau_moi_trung_hien_tai")
      return "Mật khẩu mới phải khác mật khẩu hiện tại.";
    if (err.status === 400) return `Mật khẩu mới phải từ ${TOI_THIEU} ký tự trở lên.`;
    if (err.status === 0) return vi.networkError;
  }
  return vi.errorTitle;
}

export function DoiMatKhauCard() {
  const { dangDungMatKhauTam, daDoiMatKhau } = useAuth();
  const [hienTai, setHienTai] = useState("");
  const [moi, setMoi] = useState("");
  const [nhapLai, setNhapLai] = useState("");
  const [dangGui, setDangGui] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const [xong, setXong] = useState(false);

  // Hai ô mật khẩu mới lệch nhau là lỗi của người gõ, không phải của server — chặn tại
  // chỗ, không tốn một round-trip và không để họ đổi nhầm sang thứ mình gõ sai.
  const khopNhau = moi !== "" && moi === nhapLai;
  const duDai = moi.length >= TOI_THIEU;
  const guiDuoc = hienTai !== "" && duDai && khopNhau && !dangGui;

  async function guiForm(e: FormEvent) {
    e.preventDefault();
    setLoi(null);
    setXong(false);
    setDangGui(true);
    try {
      await api.doiMatKhau(hienTai, moi);
      setXong(true);
      setHienTai("");
      setMoi("");
      setNhapLai("");
      daDoiMatKhau();
    } catch (err) {
      setLoi(thongDiepLoi(err));
    } finally {
      setDangGui(false);
    }
  }

  return (
    <Card>
      <SectionTitle style={{ marginTop: 0 }}>Đổi mật khẩu</SectionTitle>

      {dangDungMatKhauTam && (
        // NHẮC, không chặn. Người dùng vẫn dùng app bình thường; đây chỉ là chỗ duy nhất
        // họ biết rằng mật khẩu đang cầm sẽ hết hạn.
        <Alert tone="warning">
          Bạn đang dùng <strong>mật khẩu tạm</strong> do quản trị viên cấp. Mật khẩu này sẽ hết hạn
          — hãy đặt mật khẩu riêng của bạn để không bị gián đoạn.
        </Alert>
      )}

      {xong && <Alert tone="success">Đã đổi mật khẩu thành công.</Alert>}

      <form onSubmit={guiForm} style={{ display: "grid", gap: "var(--sp-4)" }}>
        <TextField
          label="Mật khẩu hiện tại"
          type="password"
          autoComplete="current-password"
          required
          value={hienTai}
          onChange={(e) => setHienTai(e.target.value)}
        />
        <TextField
          label="Mật khẩu mới"
          type="password"
          autoComplete="new-password"
          required
          value={moi}
          onChange={(e) => setMoi(e.target.value)}
          aria-describedby="mk-help"
        />
        {moi !== "" && !duDai && (
          <p
            id="mk-help"
            style={{ margin: 0, fontSize: "var(--fs-sm)", color: "var(--danger-600)" }}
          >
            Mật khẩu mới phải từ {TOI_THIEU} ký tự trở lên.
          </p>
        )}
        <TextField
          label="Nhập lại mật khẩu mới"
          type="password"
          autoComplete="new-password"
          required
          value={nhapLai}
          onChange={(e) => setNhapLai(e.target.value)}
        />
        {nhapLai !== "" && !khopNhau && (
          <p style={{ margin: 0, fontSize: "var(--fs-sm)", color: "var(--danger-600)" }}>
            Hai ô mật khẩu mới chưa khớp nhau.
          </p>
        )}

        {loi && <Alert tone="danger">{loi}</Alert>}

        <Button type="submit" disabled={!guiDuoc} style={{ justifySelf: "start" }}>
          {dangGui ? "Đang đổi…" : "Đổi mật khẩu"}
        </Button>
      </form>
    </Card>
  );
}

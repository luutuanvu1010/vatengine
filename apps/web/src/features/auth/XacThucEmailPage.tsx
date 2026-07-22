// Lát cắt 1 (U34c) — Trang xác thực địa chỉ email.
//
// ── VÌ SAO TRANG NÀY TỒN TẠI, THAY VÌ LINK TRỎ THẲNG VÀO API ─────────────────────────
// Liên kết trong thư trỏ tới ĐÂY, và chính trang này mới gửi `POST` lên API. Nếu thư trỏ
// thẳng vào `GET /api/xac-thuc-email?token=…` thì máy quét thư, phần mềm diệt virus và bộ
// lọc doanh nghiệp sẽ TỰ ĐỘNG FETCH nó — token bị tiêu trước khi khách kịp bấm, và khách
// mở thư lần đầu đã thấy "liên kết đã được dùng".
//
// Tải trước MỘT TRANG thì vô hại; máy quét không chạy JavaScript nên không gửi POST được.
// Đây là lần thứ ba cùng bài học đó trong dự án (Hyperdrive cache → QĐ-12 → chỗ này).
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Brand } from "../../components/Brand";
import { Alert, Card } from "../../components/ui/primitives";
import { ApiError, api } from "../../lib/apiClient";

type TrangThai = "dang_kiem" | "thanh_cong" | "het_han" | "da_dung" | "hong";

/** Bốn kết cục TÁCH BẠCH, vì người dùng làm việc khác nhau với chúng — gộp lại là bắt họ
 * đoán xem nên thử lại, nên đăng nhập, hay nên liên hệ hỗ trợ. */
const NOI_DUNG: Record<Exclude<TrangThai, "dang_kiem">, { tieuDe: string; than: string }> = {
  thanh_cong: {
    tieuDe: "Đã xác nhận địa chỉ email",
    than: "Cảm ơn bạn. Hồ sơ đang chờ chúng tôi xác minh thông tin doanh nghiệp. Sau khi được duyệt, bạn sẽ nhận được thư hướng dẫn đặt mật khẩu.",
  },
  het_han: {
    tieuDe: "Liên kết đã hết hạn",
    than: "Liên kết xác nhận chỉ có hiệu lực trong 24 giờ. Vui lòng đăng ký lại — chúng tôi sẽ gửi cho bạn một liên kết mới.",
  },
  da_dung: {
    // Rất hay gặp và HOÀN TOÀN vô hại: bấm hai lần, hoặc mở lại thư cũ. Không được doạ
    // người dùng bằng giọng báo lỗi cho một việc họ đã làm đúng.
    tieuDe: "Địa chỉ email này đã được xác nhận",
    than: "Bạn không cần làm gì thêm. Hồ sơ đang chờ duyệt, hoặc đã được duyệt — hãy thử đăng nhập.",
  },
  hong: {
    tieuDe: "Liên kết không hợp lệ",
    than: "Liên kết có thể bị cắt ngắn khi sao chép từ thư. Hãy thử mở lại đúng liên kết trong thư, hoặc đăng ký lại.",
  },
};

function maLoiSangTrangThai(err: unknown): TrangThai {
  if (err instanceof ApiError) {
    if (err.code === "het_han") return "het_han";
    if (err.code === "da_dung") return "da_dung";
  }
  return "hong";
}

export function XacThucEmailPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [trangThai, setTrangThai] = useState<TrangThai>("dang_kiem");
  // React 18 ở chế độ StrictMode chạy effect HAI LẦN khi dev. Token dùng MỘT LẦN, nên lần
  // thứ hai sẽ nhận `da_dung` và người dùng thấy thông báo sai. Chốt bằng ref, không bằng
  // state — state thay đổi là render lại, còn ref giữ nguyên qua cả hai lượt effect.
  const daGoi = useRef(false);

  useEffect(() => {
    if (daGoi.current) return;
    daGoi.current = true;

    if (!token) {
      setTrangThai("hong");
      return;
    }
    api
      .xacThucEmail(token)
      .then(() => setTrangThai("thanh_cong"))
      .catch((err) => setTrangThai(maLoiSangTrangThai(err)));
  }, [token]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "var(--sp-6) var(--sp-4)",
      }}
    >
      <div style={{ width: "min(100%, 34rem)", display: "grid", gap: "var(--sp-5)" }}>
        <Brand />
        <Card>
          {trangThai === "dang_kiem" ? (
            <p style={{ fontSize: "var(--fs-base)", margin: 0 }}>Đang xác nhận…</p>
          ) : (
            <>
              <h1 style={{ margin: "0 0 var(--sp-3)", fontSize: "var(--fs-2xl)" }}>
                {NOI_DUNG[trangThai].tieuDe}
              </h1>
              <Alert
                tone={trangThai === "thanh_cong" || trangThai === "da_dung" ? "success" : "danger"}
              >
                {NOI_DUNG[trangThai].than}
              </Alert>
              <p style={{ fontSize: "var(--fs-base)", marginBottom: 0 }}>
                {trangThai === "het_han" || trangThai === "hong" ? (
                  <Link to="/dang-ky">← Đăng ký lại</Link>
                ) : (
                  <Link to="/login">← Về trang đăng nhập</Link>
                )}
              </p>
            </>
          )}
        </Card>
      </div>
    </main>
  );
}

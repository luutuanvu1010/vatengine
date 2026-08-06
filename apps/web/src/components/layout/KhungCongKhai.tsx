// Khung cho trang CÔNG KHAI có nội dung dài — hiện chỉ `/gioi-thieu` khi chưa đăng nhập.
// Không sidebar, không hồ sơ người dùng: chưa có phiên thì chẳng có gì để hiện, và mọi liên
// kết trong ứng dụng đều sẽ bật về màn Đăng nhập.
//
// Bề ngang giới hạn 1200px cho khớp `Footer` — lệch số này thì nội dung và chân trang so le.
import { Link, Outlet } from "react-router-dom";
import { Brand } from "../Brand";
import { Footer } from "./Footer";

export function KhungCongKhai() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Đặt TÊN cho vùng mốc này: `PageHeader` của `AboutPage` cũng dùng thẻ <header>, nên
          không có nhãn thì trình đọc màn hình đọc ra hai vùng "banner" không phân biệt được
          — và test cũng không trỏ được vào đúng cái nào (cùng bẫy đã gặp ở `AppLayout`). */}
      <header
        aria-label="Thanh thương hiệu"
        style={{
          borderBottom: "1px solid var(--border-subtle)",
          background: "var(--surface-card)",
          padding: "var(--sp-4) var(--sp-8)",
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--sp-4)",
          }}
        >
          <Brand />
          <Link to="/login" style={{ color: "var(--info-600)", fontSize: "var(--fs-base)" }}>
            Đăng nhập
          </Link>
        </div>
      </header>

      <main
        style={{
          flex: 1,
          width: "100%",
          maxWidth: 1200,
          margin: "0 auto",
          padding: "var(--sp-8)",
        }}
      >
        <Outlet />
      </main>

      {/* KHÔNG truyền `role` — biến thể ẩn cột "Sản phẩm", vì chưa đăng nhập thì mọi liên kết
          trong ứng dụng đều là liên kết chết. `Footer` đã lo sẵn biến thể này. */}
      <Footer />
    </div>
  );
}

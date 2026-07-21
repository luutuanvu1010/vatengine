// U19 — Khung Cổng Admin: provider + guard phiên + điều hướng.
//
// GUARD Ở TẦNG KHUNG, không ở từng trang: chưa đăng nhập thì KHÔNG route nào được render.
// Gác từng trang riêng lẻ là mô hình dễ thủng — thêm một trang mới mà quên gác là xong.
// Ở đây trang mới muốn tồn tại thì buộc phải nằm trong nhánh `da_dang_nhap`.
//
// Lưu ý: guard này chỉ là trải nghiệm người dùng. Lớp chặn THẬT là `requireSuperAdmin` ở
// backend — không có nó thì việc giấu nút bấm chẳng ngăn được ai gọi thẳng API.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuditPage } from "./features/audit/AuditPage";
import { AdminLoginPage } from "./features/auth/AdminLoginPage";
import { AdminAuthProvider, useAdminAuth } from "./features/auth/admin-auth-context";
import { TenantsPage } from "./features/tenants/TenantsPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Dữ liệu quản trị phải TƯƠI: chủ dự án vừa Duyệt xong mà danh sách còn hiện trạng
      // thái cũ thì họ sẽ bấm lại — và lần hai nhận 409 khó hiểu.
      staleTime: 0,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

/** Dải nhận diện thường trực (R5). Cố ý KHÔNG ẩn đi được. */
function DaiCanhBao() {
  return (
    <div
      style={{
        background: "var(--nhan)",
        color: "#1f1300",
        padding: "0.3rem 1rem",
        fontSize: "var(--fs-sm)",
        fontWeight: 700,
        letterSpacing: "0.06em",
        textAlign: "center",
      }}
    >
      KHU VỰC QUẢN TRỊ — thao tác ở đây ảnh hưởng tới tài khoản của khách hàng thật
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { dangXuat } = useAdminAuth();
  const { pathname } = useLocation();
  const lienKet = (to: string, nhan: string) => (
    <Link
      to={to}
      style={{
        color: pathname.startsWith(to) ? "var(--nhan)" : "var(--chu-mo)",
        textDecoration: "none",
        fontWeight: pathname.startsWith(to) ? 600 : 400,
        padding: "0.35rem 0",
      }}
    >
      {nhan}
    </Link>
  );

  return (
    <>
      <DaiCanhBao />
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1.5rem",
          padding: "0.9rem 1.25rem",
          borderBottom: "1px solid var(--vien)",
          background: "var(--nen-noi)",
        }}
      >
        <strong style={{ fontSize: "1.05rem" }}>VATEngine Admin</strong>
        <nav style={{ display: "flex", gap: "1.25rem" }}>
          {lienKet("/tenants", "Doanh nghiệp")}
          {lienKet("/audit", "Nhật ký")}
        </nav>
        <button
          type="button"
          onClick={() => void dangXuat()}
          style={{
            marginLeft: "auto",
            background: "transparent",
            color: "var(--chu-mo)",
            border: "1px solid var(--vien)",
            padding: "0.4rem 0.8rem",
          }}
        >
          Đăng xuất
        </button>
      </header>
      <main style={{ padding: "1.5rem 1.25rem", maxWidth: "80rem", margin: "0 auto" }}>
        {children}
      </main>
    </>
  );
}

function DinhTuyen() {
  const { trangThai } = useAdminAuth();

  // Trạng thái "đang kiểm" phải có mặt tường minh: nếu nhảy thẳng sang màn đăng nhập trong
  // lúc chờ `GET /admin/auth/me`, người đang có phiên hợp lệ sẽ thấy form đăng nhập lóe lên
  // mỗi lần tải trang — trông như phiên bị mất.
  if (trangThai === "dang_kiem") {
    return (
      <output style={{ display: "block", padding: "2rem", color: "var(--chu-mo)" }}>
        Đang kiểm tra phiên đăng nhập…
      </output>
    );
  }

  if (trangThai === "chua_dang_nhap") return <AdminLoginPage />;

  return (
    <Shell>
      <Routes>
        <Route path="/tenants" element={<TenantsPage />} />
        <Route path="/audit" element={<AuditPage />} />
        {/* Mặc định vào danh sách doanh nghiệp — việc chính của chủ dự án. */}
        <Route path="*" element={<Navigate to="/tenants" replace />} />
      </Routes>
    </Shell>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AdminAuthProvider>
        <BrowserRouter>
          <DinhTuyen />
        </BrowserRouter>
      </AdminAuthProvider>
    </QueryClientProvider>
  );
}

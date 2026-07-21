// U19 — Phiên Cổng Admin. TÁCH HOÀN TOÀN khỏi phiên khách (`apps/web`).
//
// Tách ở đây không phải bằng "khoá lưu trữ khác tên" như U19-plan §3 mô tả, mà mạnh hơn
// nhiều: app này chạy trên ORIGIN KHÁC (`adminvatengine.tourdao.vn`), nên trình duyệt giữ
// cookie của nó trong một hũ riêng mà code của app khách không có cách nào chạm tới. Không
// có gì để "lỡ dùng nhầm".
//
// KHÔNG CÓ TOKEN Ở TẦNG NÀY. Trạng thái đăng nhập được HỎI SERVER (`GET /admin/auth/me`),
// không suy từ một cờ client. Một cờ `localStorage.daDangNhap` sẽ lệch với cookie ngay lần
// đầu cookie hết hạn (2h): UI tưởng còn phiên, mọi request trả 401, người dùng thấy app
// hỏng chứ không thấy màn đăng nhập.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { adminApi, configureAdminApi } from "../../lib/adminApiClient";

export type TrangThaiPhien = "dang_kiem" | "da_dang_nhap" | "chua_dang_nhap";

interface AdminAuthValue {
  trangThai: TrangThaiPhien;
  adminId: string | null;
  dangNhap: (email: string, matKhau: string) => Promise<void>;
  dangXuat: () => Promise<void>;
}

const Ctx = createContext<AdminAuthValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [trangThai, setTrangThai] = useState<TrangThaiPhien>("dang_kiem");
  const [adminId, setAdminId] = useState<string | null>(null);

  // 401 từ BẤT KỲ lời gọi nào (không chỉ lúc dò phiên) → rơi về màn đăng nhập ADMIN.
  // Quan trọng: KHÔNG chuyển hướng sang login của khách — hai miền tách biệt, và đẩy chủ
  // dự án sang màn đăng nhập khách là mời họ gõ nhầm mật khẩu quản trị vào ô của khách.
  useEffect(() => {
    configureAdminApi({
      onUnauthorized: () => {
        setAdminId(null);
        setTrangThai("chua_dang_nhap");
      },
    });
    return () => configureAdminApi({});
  }, []);

  // Dò phiên MỘT LẦN lúc nạp app. Bắt lỗi tại chỗ thay vì ỷ vào `onUnauthorized`, để nhánh
  // lỗi KHÁC 401 (mất mạng, 500, 503 do secret cấu hình sai) cũng ra `chua_dang_nhap` chứ
  // không kẹt vĩnh viễn ở màn "đang kiểm".
  useEffect(() => {
    let huy = false;
    (async () => {
      try {
        const { id } = await adminApi.docPhien();
        if (!huy) {
          setAdminId(id);
          setTrangThai("da_dang_nhap");
        }
      } catch {
        if (!huy) {
          setAdminId(null);
          setTrangThai("chua_dang_nhap");
        }
      }
    })();
    return () => {
      huy = true;
    };
  }, []);

  const dangNhap = useCallback(async (email: string, matKhau: string) => {
    // Ném lỗi lên cho màn đăng nhập hiển thị — KHÔNG nuốt: người dùng phải biết vì sao
    // không vào được (sai mật khẩu vs 503 do secret chưa cấu hình là hai việc khác hẳn).
    await adminApi.dangNhap(email, matKhau);
    const { id } = await adminApi.docPhien();
    setAdminId(id);
    setTrangThai("da_dang_nhap");
  }, []);

  const dangXuat = useCallback(async () => {
    try {
      // Gọi server để cookie thực sự bị xoá. Nếu bỏ, phiên vẫn sống tới 2h.
      await adminApi.dangXuat();
    } finally {
      // Dọn state phía client DÙ lời gọi hỏng (mất mạng): người bấm "Đăng xuất" phải thấy
      // mình đã ra khỏi giao diện. Cookie có thể còn, nhưng đó là điều kiện mạng chứ không
      // phải lựa chọn thiết kế — và lần gọi kế tiếp sẽ 401 rồi rơi về đây.
      setAdminId(null);
      setTrangThai("chua_dang_nhap");
    }
  }, []);

  const value = useMemo<AdminAuthValue>(
    () => ({ trangThai, adminId, dangNhap, dangXuat }),
    [trangThai, adminId, dangNhap, dangXuat],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdminAuth(): AdminAuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAdminAuth phải nằm trong <AdminAuthProvider>");
  return v;
}

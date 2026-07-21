// Phiên đăng nhập nội bộ — token nằm trong COOKIE HttpOnly do apps/api phát (ADR-0003
// Amendment #1). Client KHÔNG cầm token và KHÔNG biết cookie còn hạn hay không (HttpOnly
// ⇒ JS không đọc được), nên cách duy nhất để biết là HỎI SERVER: khởi động ở trạng thái
// 'checking' rồi gọi /me — 200 ⇒ 'authed', 401 ⇒ 'anon'.
// (Trước Amendment #1: token in-memory ⇒ khởi động luôn 'anon' ⇒ reload là mất phiên.)
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, configureApi } from "../../lib/apiClient";
import { clearInvoiceFilter } from "../../lib/filterStore";
import type { MeResponse } from "../../types/api";

// 'checking' = đang hỏi server xem cookie có còn hiệu lực. Bắt buộc phải là trạng thái
// RIÊNG, không gộp vào 'anon': nếu gộp, router sẽ đẩy sang /login trong lúc chờ và người
// dùng thấy màn Login loé lên mỗi lần tải trang (C8c).
type AuthStatus = "checking" | "anon" | "authed";

interface AuthValue {
  status: AuthStatus;
  me: MeResponse | null;
  email: string | null;
  login: (email: string, password: string, captcha: string) => Promise<void>;
  logout: () => void;
  applyMe: (me: MeResponse) => void;
  /** U20 — true khi đang dùng mật khẩu TẠM do quản trị viên cấp (U18 cấp khi duyệt
   * hoặc reset). Chỉ để NHẮC ở trang Cài đặt — chủ dự án chốt KHÔNG chặn đường
   * (2026-07-21). Đặt lại false sau khi đổi mật khẩu thành công. */
  dangDungMatKhauTam: boolean;
  daDoiMatKhau: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("checking");
  const [dangDungMatKhauTam, setDangDungMatKhauTam] = useState(false);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // H-B.3 — dọn sạch dữ liệu tenant còn sót ở client khi ranh giới phiên thay đổi:
  // cache React Query (singleton toàn app) + bộ lọc localStorage. Chống rò dữ liệu
  // tenant trước cho người dùng kế tiếp trên máy dùng chung. (queryClient ổn định qua
  // các lần render nên nằm trong deps không gây chạy lại effect.)
  useEffect(() => {
    configureApi({
      onUnauthorized: () => {
        queryClient.clear();
        clearInvoiceFilter();
        setStatus("anon");
        setMe(null);
        setEmail(null);
      },
    });
  }, [queryClient]);

  // C8 — khôi phục phiên khi tải trang: cookie (nếu còn) được trình duyệt tự đính vào
  // /me. Chạy ĐÚNG MỘT LẦN lúc mount.
  //
  // C9 — nhánh hỏng ở đây là một ranh giới phiên MỚI (khởi động với cookie cũ/hết hạn).
  // `.claude/rules/multi-tenant.md` buộc mọi ranh giới như vậy phải dọn đủ H-B.3, nếu
  // không dữ liệu tenant trước còn sót lại cho người dùng kế tiếp. Dọn ngay tại đây
  // (không ỷ vào onUnauthorized) để nhánh lỗi KHÁC 401 — mất mạng, 500 — cũng được dọn
  // và cũng thoát khỏi 'checking', không kẹt vĩnh viễn ở màn chờ.
  useEffect(() => {
    let huy = false;
    (async () => {
      try {
        const profile = await api.getMe();
        if (huy) return;
        setMe(profile);
        setStatus("authed");
      } catch {
        if (huy) return;
        // C9 — dọn bộ lọc localStorage: nó SỐNG SÓT qua reload nên có thể còn MST của
        // tenant phiên trước.
        //
        // Cố ý KHÔNG gọi queryClient.clear() ở đây (khác với logout/onUnauthorized):
        // cache React Query nằm trong bộ nhớ nên tải lại trang là đã rỗng — không có gì
        // của tenant cũ để dọn. Gọi clear() lúc này chỉ huỷ oan các query mà trang hiện
        // tại vừa khởi động song song, làm chúng kẹt vĩnh viễn ở trạng thái "đang tải".
        clearInvoiceFilter();
        setMe(null);
        setStatus("anon");
      }
    })();
    return () => {
      huy = true;
    };
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      me,
      email,
      async login(inputEmail, password, captcha) {
        // Xóa mọi tàn dư phiên trước TRƯỚC khi nạp dữ liệu tenant mới.
        queryClient.clear();
        clearInvoiceFilter();
        // Không nhận token ở đây — server đặt cookie (C2). Phiên coi như thiết lập được
        // khi /me ngay sau đó gọi thành công.
        const kq = await api.login(inputEmail, password, captcha);
        // Cờ chỉ đến từ PHẢN HỒI ĐĂNG NHẬP — `/me` không mang nó. Vì vậy nếu người dùng
        // tải lại trang, cờ mất và lời nhắc biến mất; chấp nhận được vì đây là nhắc nhở,
        // không phải cổng chặn. Muốn bền qua reload thì phải thêm trường vào `/me`.
        setDangDungMatKhauTam(kq.phai_doi_mat_khau === true);
        try {
          const profile = await api.getMe();
          setMe(profile);
          setEmail(inputEmail);
          setStatus("authed");
        } catch (err) {
          setStatus("anon");
          throw err;
        }
      },
      logout() {
        // C4 — phải gọi server: chỉ server xoá được cookie HttpOnly. Dọn state client
        // ngay (không chờ mạng) để UI phản hồi tức thì; lỗi mạng khi gọi logout không
        // được giữ người dùng lại trong app.
        void api.logout().catch(() => undefined);
        queryClient.clear();
        clearInvoiceFilter();
        setStatus("anon");
        setMe(null);
        setEmail(null);
      },
      applyMe(next: MeResponse) {
        setMe(next);
      },
      dangDungMatKhauTam,
      daDoiMatKhau() {
        setDangDungMatKhauTam(false);
      },
    }),
    [status, me, email, queryClient, dangDungMatKhauTam],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth phải nằm trong <AuthProvider>");
  return ctx;
}

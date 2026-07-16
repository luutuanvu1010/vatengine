// Phiên đăng nhập nội bộ — JWT giữ TRONG BỘ NHỚ (apiClient; ADR-0003 #3). Không bền qua
// reload → khởi động luôn 'anon', đăng nhập lại (đúng chủ ý). Sau login: nạp /me (A1) lấy
// hồ sơ tenant + vai. 401 bất kỳ (onUnauthorized) → về 'anon' (router đẩy tới /login).
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, clearToken, configureApi, setToken } from "../../lib/apiClient";
import { clearInvoiceFilter } from "../../lib/filterStore";
import type { MeResponse } from "../../types/api";

type AuthStatus = "anon" | "authed";

interface AuthValue {
  status: AuthStatus;
  me: MeResponse | null;
  email: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  applyMe: (me: MeResponse) => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("anon");
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
        clearToken();
        queryClient.clear();
        clearInvoiceFilter();
        setStatus("anon");
        setMe(null);
        setEmail(null);
      },
    });
  }, [queryClient]);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      me,
      email,
      async login(inputEmail, password) {
        // Xóa mọi tàn dư phiên trước TRƯỚC khi nạp dữ liệu tenant mới.
        queryClient.clear();
        clearInvoiceFilter();
        const { token } = await api.login(inputEmail, password);
        setToken(token);
        try {
          const profile = await api.getMe();
          setMe(profile);
          setEmail(inputEmail);
          setStatus("authed");
        } catch (err) {
          clearToken();
          setStatus("anon");
          throw err;
        }
      },
      logout() {
        clearToken();
        queryClient.clear();
        clearInvoiceFilter();
        setStatus("anon");
        setMe(null);
        setEmail(null);
      },
      applyMe(next: MeResponse) {
        setMe(next);
      },
    }),
    [status, me, email, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth phải nằm trong <AuthProvider>");
  return ctx;
}

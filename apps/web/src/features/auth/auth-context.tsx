// Phiên đăng nhập nội bộ — JWT giữ TRONG BỘ NHỚ (apiClient; ADR-0003 #3). Không bền qua
// reload → khởi động luôn 'anon', đăng nhập lại (đúng chủ ý). Sau login: nạp /me (A1) lấy
// hồ sơ tenant + vai. 401 bất kỳ (onUnauthorized) → về 'anon' (router đẩy tới /login).
import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, clearToken, configureApi, setToken } from "../../lib/apiClient";
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

  useEffect(() => {
    configureApi({
      onUnauthorized: () => {
        clearToken();
        setStatus("anon");
        setMe(null);
        setEmail(null);
      },
    });
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      me,
      email,
      async login(inputEmail, password) {
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
        setStatus("anon");
        setMe(null);
        setEmail(null);
      },
      applyMe(next: MeResponse) {
        setMe(next);
      },
    }),
    [status, me, email],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth phải nằm trong <AuthProvider>");
  return ctx;
}

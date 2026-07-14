import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./features/auth/auth-context";
import { makeQueryClient } from "./lib/queryClient";
import { AppRouter } from "./routes/AppRouter";

const queryClient = makeQueryClient();

/** Gốc ứng dụng: cache dữ liệu (TanStack) → điều hướng → phiên đăng nhập → router+guard. */
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppRouter />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./apiClient";

// QueryClient dùng chung. KHÔNG retry lỗi hợp đồng (4xx) — chỉ retry lỗi mạng/5xx một
// lần. 401 do apiClient tự đẩy về đăng nhập (onUnauthorized), không cần retry.
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => {
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
          return failureCount < 1;
        },
      },
      mutations: { retry: false },
    },
  });
}

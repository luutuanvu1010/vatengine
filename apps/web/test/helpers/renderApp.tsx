import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { AuthProvider } from "../../src/features/auth/auth-context";
import { makeQueryClient } from "../../src/lib/queryClient";

/** Bọc UI với đủ provider + MemoryRouter (điều khiển route ban đầu trong test). */
export function renderWithProviders(ui: ReactElement, route = "/") {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider>{ui}</AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

interface MockRoutes {
  login?: (body: unknown) => Response;
  me?: () => Response;
  patchMe?: (body: unknown) => Response;
}

/** Mock fetch định tuyến theo path — cho test luồng đăng nhập/phiên không cần mạng.
 *
 * ADR-0003 Amendment #1: phiên nằm trong cookie HttpOnly, và app khởi động bằng cách gọi
 * `/me` để hỏi xem cookie còn hiệu lực không (C8). Vì vậy mock phải phân biệt hai kịch bản:
 *
 * - Test CÓ khai `login` ⇒ kịch bản "mở app khi chưa đăng nhập": `/me` trả **401** cho tới
 *   khi `POST /auth/login` được gọi (mô phỏng chưa có cookie). Nếu cho `/me` trả 200 ngay,
 *   app sẽ vào thẳng và màn Đăng nhập KHÔNG bao giờ hiện — test tưởng hỏng mà thực ra là
 *   mock sai đời.
 * - Test KHÔNG khai `login` ⇒ kịch bản "đã có cookie hợp lệ": `/me` trả hồ sơ ngay (thay
 *   cho `setToken()` trước đây).
 */
export function mockFetch(routes: MockRoutes): void {
  const batDauChuaDangNhap = routes.login !== undefined;
  let coCookie = !batDauChuaDangNhap;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/auth/logout")) {
      coCookie = false;
      return json(200, { ok: true });
    }
    if (url.endsWith("/auth/login")) {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const res = routes.login?.(body) ?? new Response("{}", { status: 500 });
      if (res.status === 200) coCookie = true; // Đăng nhập thành công = server đặt cookie.
      return res;
    }
    if (url.endsWith("/me")) {
      if ((init?.method ?? "GET").toUpperCase() === "PATCH") {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        return routes.patchMe?.(body) ?? new Response("{}", { status: 500 });
      }
      if (!coCookie) return json(401, { error: "unauthorized" });
      return routes.me?.() ?? new Response("{}", { status: 500 });
    }
    // Shape hợp lệ mặc định để màn tiếp đất (vd Dashboard) không vỡ.
    if (url.includes("/invoices/summary")) {
      return json(200, {
        byChieu: [],
        total: { count: 0, tongTcthue: null, tongTthue: null, tongTtbso: null },
      });
    }
    if (url.includes("/reconcile")) {
      return json(200, {
        findings: [],
        summary: { lechThue: 0, thieuSoDauRa: 0, huy: 0, thayThe: 0 },
      });
    }
    if (url.includes("/tax-accounts")) {
      return json(200, []);
    }
    return json(200, { rows: [], total: 0, limit: 50, offset: 0 });
  });
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

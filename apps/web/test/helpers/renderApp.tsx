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
}

/** Mock fetch định tuyến theo path — cho test luồng đăng nhập/phiên không cần mạng. */
export function mockFetch(routes: MockRoutes): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/auth/login")) {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      return routes.login?.(body) ?? new Response("{}", { status: 500 });
    }
    if (url.endsWith("/me")) {
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

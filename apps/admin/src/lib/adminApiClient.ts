// U19 — NƠI DUY NHẤT gọi Admin API (U18). Gõ kiểu theo đúng hợp đồng route `/admin/*`.
//
// KHÔNG CÓ BIẾN TOKEN Ở ĐÂY — và đó là điểm quan trọng nhất của file này.
// U18 phát phiên bằng cookie HttpOnly `vat_admin_session`; thân phản hồi `/admin/auth/login`
// KHÔNG chứa token. JS không đọc được nó, nên XSS ở Cổng Admin cũng không lấy đi được.
// Trình duyệt tự đính cookie nhờ `credentials: "same-origin"` — hoạt động được vì front-door
// `worker.ts` khiến SPA và API cùng origin.
//
// U19-plan §3 (viết trước khi U18 code) mô tả `Authorization: Bearer <admin token>` và lưu
// token ở "kênh riêng". Bản đó đã lỗi thời: không có token nào để cầm. Xem D1 trong
// docs/plans/U19-plan-thuc-thi.md.
import type {
  AuditPage,
  ChiTietTenant,
  DanhSachTenant,
  KetQuaCapMatKhau,
  TrangThaiTenant,
} from "./types";

// Mặc định `/api` chứ KHÔNG phải chuỗi rỗng như apps/web — có chủ ý.
// Front-door chỉ proxy các đường bắt đầu bằng `/api/`; đường khác rơi vào SPA fallback.
// Với mặc định "", một lần build quên `VITE_API_BASE=/api` sẽ cho ra client gọi
// `/admin/tenants` → nhận về chính `index.html` → lỗi parse JSON khó hiểu, trong khi mọi
// thứ trông như đang chạy. Mặc định `/api` khớp cả production lẫn dev (vite proxy).
const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

export class AdminApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(status: number, code?: string) {
    super(`Admin API ${status}${code ? ` (${code})` : ""}`);
    this.name = "AdminApiError";
    this.status = status;
    this.code = code;
  }
}

interface AdminApiConfig {
  onUnauthorized?: (() => void) | undefined;
}
let config: AdminApiConfig = {};
export function configureAdminApi(next: AdminApiConfig): void {
  config = next;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

async function request<T>(
  method: string,
  path: string,
  opts: { query?: Record<string, string | number | undefined>; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}${buildQuery(opts.query ?? {})}`, {
      method,
      headers,
      // Cookie phiên đi kèm tự động. KHÔNG "include": same-origin là đủ và hẹp hơn.
      credentials: "same-origin",
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new AdminApiError(0, "network_error");
  }

  if (!res.ok) {
    let code: string | undefined;
    try {
      code = ((await res.json()) as { error?: string }).error;
    } catch {
      /* body không phải JSON */
    }
    // 401 = phiên hết hạn/không có → về màn đăng nhập ADMIN (không phải login khách).
    if (res.status === 401) config.onUnauthorized?.();
    throw new AdminApiError(res.status, code);
  }
  return (await res.json()) as T;
}

export const adminApi = {
  /** Thành công → server đặt cookie phiên admin. Body KHÔNG mang token. */
  dangNhap(email: string, password: string): Promise<{ ok: true }> {
    return request("POST", "/admin/auth/login", { body: { email, password } });
  },

  lietKeTenant(params: {
    trangThai?: TrangThaiTenant | undefined;
    q?: string | undefined;
    limit?: number;
    offset?: number;
  }): Promise<DanhSachTenant> {
    return request("GET", "/admin/tenants", {
      query: {
        trang_thai: params.trangThai,
        q: params.q,
        limit: params.limit,
        offset: params.offset,
      },
    });
  },

  chiTietTenant(id: string): Promise<ChiTietTenant> {
    return request("GET", `/admin/tenants/${id}`);
  },

  /**
   * Duyệt tenant. Phản hồi mang `mat_khau_tam` — CHỈ LẦN NÀY.
   * Nơi gọi có trách nhiệm hiện nó cho người dùng ngay và KHÔNG lưu lại ở đâu (R4):
   * không localStorage, không URL, không log. DB chỉ giữ bản băm nên không có đường đọc lại.
   */
  duyetTenant(id: string): Promise<KetQuaCapMatKhau> {
    return request("POST", `/admin/tenants/${id}/duyet`);
  },
  tuChoiTenant(id: string): Promise<{ ok: true; trang_thai: TrangThaiTenant }> {
    return request("POST", `/admin/tenants/${id}/tu-choi`);
  },
  khoaTenant(id: string): Promise<{ ok: true; trang_thai: TrangThaiTenant }> {
    return request("POST", `/admin/tenants/${id}/khoa`);
  },
  moKhoaTenant(id: string): Promise<{ ok: true; trang_thai: TrangThaiTenant }> {
    return request("POST", `/admin/tenants/${id}/mo-khoa`);
  },
  /** Cấp lại mật khẩu tạm. Cùng hợp đồng "một lần" như duyetTenant. */
  resetMatKhau(id: string): Promise<KetQuaCapMatKhau> {
    return request("POST", `/admin/tenants/${id}/reset-mat-khau`);
  },

  /**
   * Sửa metadata. CHỈ `ten` / `goi_dich_vu` / `ghi_chu`.
   * KHÔNG có `email` (D4) và KHÔNG có `mst`: MST là khoá tự nhiên (1 MST ↔ 1 tenant), và
   * email là danh tính đăng nhập — cả hai đáng là thao tác riêng có audit riêng, không lẫn
   * vào một PATCH metadata. Backend cũng từ chối bằng 400 nếu gửi lên.
   */
  suaMetadata(
    id: string,
    body: { ten?: string; goi_dich_vu?: string; ghi_chu?: string },
  ): Promise<{ ok: true; tenant: Record<string, unknown> }> {
    return request("PATCH", `/admin/tenants/${id}`, { body });
  },

  docAudit(params: { limit?: number; offset?: number }): Promise<AuditPage> {
    return request("GET", "/admin/audit", {
      query: { limit: params.limit, offset: params.offset },
    });
  },
};

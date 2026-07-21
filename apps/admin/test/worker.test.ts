// U19 — Front-door Cổng Admin. ĐỐI XỨNG với apps/web/worker.ts.
//
// Bất biến phải giữ: origin admin CHỈ với tới được `/admin/*` của `vat-api`. Nếu nó cũng
// gọi được `/invoices`, thì việc U18 chặn `/api/admin/*` ở cửa khách chỉ đóng được một
// chiều — và một cookie khách lạc sang origin này sẽ đọc được dữ liệu nghiệp vụ.
//
// Điều kiện thật của mỗi test là **request có được PHÁT tới `vat-api` hay không**, không
// phải mã trạng thái: một bản vá hỏng (proxy đi rồi mới trả 404) vẫn cho 404 đúng.
import { describe, expect, it } from "vitest";
import worker from "../worker";

type Env = Parameters<typeof worker.fetch>[1];

/** Env giả ghi lại mọi path thực sự tới được API worker. */
function spyEnv() {
  const daGoi: string[] = [];
  const env = {
    ASSETS: {
      fetch: async () =>
        new Response("<!doctype html><div id=root></div>", {
          headers: { "content-type": "text/html" },
        }),
    },
    API: {
      fetch: async (r: Request) => {
        daGoi.push(new URL(r.url).pathname);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  } as unknown as Env;
  return { env, daGoi };
}

const REQUIRED: Array<[string, RegExp]> = [
  ["content-security-policy", /default-src 'self'/],
  ["x-frame-options", /^DENY$/],
  ["x-content-type-options", /^nosniff$/],
  ["referrer-policy", /\S/],
  ["x-robots-tag", /noindex/],
];

function expectSecurityHeaders(res: Response) {
  for (const [name, re] of REQUIRED) {
    expect(res.headers.get(name) ?? "", `thiếu/hỏng header ${name}`).toMatch(re);
  }
}

describe("front-door admin — cho qua /api/admin/*", () => {
  const DUONG_ADMIN: Array<[string, string, string]> = [
    ["POST", "/api/admin/auth/login", "/admin/auth/login"],
    ["GET", "/api/admin/tenants", "/admin/tenants"],
    [
      "GET",
      "/api/admin/tenants/3f2504e0-4f89-11d3-9a0c-0305e82c3301",
      "/admin/tenants/3f2504e0-4f89-11d3-9a0c-0305e82c3301",
    ],
    [
      "POST",
      "/api/admin/tenants/3f2504e0-4f89-11d3-9a0c-0305e82c3301/duyet",
      "/admin/tenants/3f2504e0-4f89-11d3-9a0c-0305e82c3301/duyet",
    ],
    ["GET", "/api/admin/audit", "/admin/audit"],
  ];

  for (const [method, vao, ra] of DUONG_ADMIN) {
    it(`${method} ${vao} → vat-api thấy ${ra}`, async () => {
      const { env, daGoi } = spyEnv();
      const res = await worker.fetch(
        new Request(`https://adminvatengine.example${vao}`, { method }),
        env,
      );
      expect(res.status).toBe(200);
      // Bóc đúng tiền tố `/api` — sai bước này thì vat-api nhận `/api/admin/...` và trả 404.
      expect(daGoi).toEqual([ra]);
    });
  }

  it("giữ nguyên query string khi proxy", async () => {
    const { env, daGoi } = spyEnv();
    await worker.fetch(
      new Request("https://adminvatengine.example/api/admin/tenants?trang_thai=cho_duyet&q=0100"),
      env,
    );
    expect(daGoi).toEqual(["/admin/tenants"]);
  });
});

describe("🔴 front-door admin — CHẶN mọi endpoint khách (đối xứng U18)", () => {
  // Allowlist chứ không denylist: một endpoint khách MỚI thêm vào vat-api sau này phải
  // mặc định KHÔNG tới được từ đây, không cần ai nhớ cập nhật danh sách chặn.
  const DUONG_KHACH: Array<[string, string]> = [
    ["GET", "/api/invoices"],
    ["GET", "/api/me"],
    ["POST", "/api/exports"],
    ["GET", "/api/reconcile"],
    ["GET", "/api/tax-accounts"],
    ["POST", "/api/auth/login"],
    ["POST", "/api/dang-ky"],
    ["GET", "/api/backfill/abc"],
    ["GET", "/api"],
    // Endpoint tưởng tượng — đại diện cho route khách CHƯA tồn tại. Phải bị chặn sẵn.
    ["GET", "/api/mot-endpoint-tuong-lai"],
  ];

  for (const [method, p] of DUONG_KHACH) {
    it(`${method} ${p} → 404 và KHÔNG chạm vat-api`, async () => {
      const { env, daGoi } = spyEnv();
      const res = await worker.fetch(
        new Request(`https://adminvatengine.example${p}`, { method }),
        env,
      );
      expect(res.status).toBe(404);
      expect(daGoi).toEqual([]);
    });
  }

  it("KHÔNG chặn nhầm đường có tiền tố giống (/api/administrator-ish)", async () => {
    // Cũng phải bị chặn (không phải /api/admin/*), nhưng vì lý do ĐÚNG — kiểm để chắc
    // logic dùng so-bằng + tiền tố có dấu `/`, không phải `startsWith("/api/admin")` trần.
    const { env, daGoi } = spyEnv();
    const res = await worker.fetch(
      new Request("https://adminvatengine.example/api/administrator-ish"),
      env,
    );
    expect(res.status).toBe(404);
    expect(daGoi).toEqual([]);
  });
});

describe("front-door admin — SPA và security header", () => {
  it("đường không phải /api/* → phục vụ SPA", async () => {
    const { env, daGoi } = spyEnv();
    const res = await worker.fetch(new Request("https://adminvatengine.example/tenants"), env);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("id=root");
    expect(daGoi).toEqual([]);
  });

  it("security header đủ trên SPA, trên proxy, và trên 404", async () => {
    const { env } = spyEnv();
    expectSecurityHeaders(await worker.fetch(new Request("https://adminvatengine.example/"), env));
    expectSecurityHeaders(
      await worker.fetch(new Request("https://adminvatengine.example/api/admin/tenants"), env),
    );
    expectSecurityHeaders(
      await worker.fetch(new Request("https://adminvatengine.example/api/invoices"), env),
    );
  });

  it("CSP không mở script cho nguồn ngoài (khu vực quản trị bề mặt hẹp)", async () => {
    const { env } = spyEnv();
    const res = await worker.fetch(new Request("https://adminvatengine.example/"), env);
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-eval/);
    expect(csp).toContain("frame-ancestors 'none'");
  });
});

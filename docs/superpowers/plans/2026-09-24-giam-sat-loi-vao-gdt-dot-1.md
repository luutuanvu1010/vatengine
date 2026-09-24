# U43 — Giám sát lối vào GDT, đợt 1 — Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Biết trong vòng một giờ khi GDT chặn hoặc đổi dạng lối vào đăng nhập, báo tới chủ dự án qua Telegram, và nói đúng với người dùng ở màn Kết nối tài khoản thuế.

**Architecture:** Adapter `@vat/gdt-client` học phân biệt `WAF_BLOCKED` (403 + chữ ký) với `GEO_BLOCKED` và có `canaryAuthenticate()` (captcha thật + đăng nhập MST giả, không retry). `apps/sync-worker` thêm cron mỗi giờ chạy canary, giữ trạng thái trong Durable Object `EgressHealth` sẵn có, phát cảnh báo qua package mới `@vat/thong-bao` (Telegram chuyển từ `apps/api`). `apps/api` trả `503 gdt_chan` khi WAF chặn; `apps/web` ánh xạ đủ bốn nhánh lỗi.

**Tech Stack:** TypeScript trên Cloudflare Workers (Hono, Durable Objects, Cron Triggers), Vitest (Node, PGlite cho api), Biome, npm workspaces, Telegram Bot API (HTML parse mode).

**Spec:** `docs/superpowers/specs/2026-09-24-giam-sat-loi-vao-gdt-dot-1-design.md`

## Global Constraints

- Mọi lời gọi HTTP tới `hoadondientu.gdt.gov.vn` chỉ nằm trong `packages/gdt-client` và đi qua `GdtTransport` (`.claude/rules/gdt-adapter.md`). Canary KHÔNG được gọi `fetch()` ở sync-worker.
- Canary: MST `0000000000`, mật khẩu vô nghĩa cố ý sai, captcha `0000`; **không retry** (`maxAttempts: 1`); **không** giải captcha; cron `0 * * * *` (24 lượt/ngày).
- Không bí mật trong mã/log/test; bot token Telegram không bao giờ xuất hiện trong nội dung tin hay log (`.claude/rules/security.md`). Secret của `vat-sync-worker` do chủ dự án tự đặt. Hook `block-dangerous.sh` chặn mẫu `password = "…"` trong file — đặt tên hằng tránh mẫu này.
- Thông điệp Telegram: chế độ HTML, mọi chuỗi động qua `thoatHtml`. Tiếng Việt đủ dấu.
- Coverage ≥ 80% (lines/statements/branches/functions) ở `packages/gdt-client`, `packages/thong-bao`; sync-worker giữ loại trừ wiring (`index.ts`, `deps.ts`, `egressHealth.ts`).
- `make lint` (Biome + `tsc --noEmit`) sạch. Không `git add -A`; stage theo đường dẫn.
- Mọi khẳng định về hành vi GDT trong chú thích phải kèm ngày kiểm chứng hoặc nhãn "CHƯA KIỂM CHỨNG" (CLAUDE.md, nguyên tắc bằng chứng).

## Review Focus

1. **GDT trả 403 với thân HTML dài hoặc không phải JSON** → `probe()` chỉ đọc 1 KB, không ném, vẫn phân loại được (test ở Task 1).
2. **Captcha đổi schema (thiếu `key`)** trong lúc canary → verdict `DRIFT`, không phải `ERROR` (test ở Task 2).
3. **Lần chạy đầu tiên mà GDT đang chặn** (DO chưa có trạng thái) → cảnh báo `chan`, KHÔNG phải tin "đã bật" vô nghĩa (test ở Task 4).
4. **Telegram sập/từ chối/timeout** khi đang cảnh báo → cron không chết, trạng thái vẫn được lưu (test ở Task 5).
5. **Thông điệp GDT chứa `<`, `&`** → tin Telegram vẫn gửi được (escape), không thành 400 câm (test ở Task 3).

---

### Task 1: `@vat/gdt-client` — chữ ký WAF, `isWafBlocked`, `classify` đọc thân, `probe()` đọc thân 403

**Files:**
- Modify: `packages/gdt-client/src/errors.ts`
- Modify: `packages/gdt-client/src/transport.ts`
- Modify: `packages/gdt-client/src/directTransport.ts`
- Modify: `packages/gdt-client/src/index.ts`
- Test: `packages/gdt-client/test/unit/errors.test.ts` (tạo mới)
- Test: `packages/gdt-client/test/unit/transport.test.ts`
- Test: `packages/gdt-client/test/unit/directTransport.test.ts`

**Interfaces:**
- Consumes: `GdtError(message, code, httpStatus?)` hiện có; `classify(status, timedOut, errored)`; `withRequestId()` từ `http.ts`.
- Produces: `WAF_BLOCK_SIGNATURE: string`; `coChuKyWaf(text?: string): boolean`; `isWafBlocked(err: unknown): boolean`; `ProbeVerdict` có thêm `"WAF_BLOCKED"`; `classify(status, timedOut, errored, body?: string)`.

- [ ] **Step 1: Viết test đỏ cho chữ ký WAF và `isWafBlocked`**

Tạo `packages/gdt-client/test/unit/errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { GdtContractDriftError, GdtError, coChuKyWaf, isWafBlocked } from "../../src/errors";

// KIỂM CHỨNG 2026-09-24 (curl thật): WAF GDT trả 403 kèm đúng câu này khi thiếu header request-id.
const THONG_DIEP_WAF = "Hệ thống phát hiện hành vi không hợp lệ. Yêu cầu đã bị chặn.";

describe("coChuKyWaf", () => {
  it("nhận đúng thông điệp WAF đã quan sát", () => {
    expect(coChuKyWaf(THONG_DIEP_WAF)).toBe(true);
  });
  it("không phân biệt hoa thường và dạng Unicode (NFD)", () => {
    expect(coChuKyWaf("HỆ THỐNG PHÁT HIỆN HÀNH VI KHÔNG HỢP LỆ")).toBe(true);
    expect(coChuKyWaf(THONG_DIEP_WAF.normalize("NFD"))).toBe(true);
  });
  it("undefined/rỗng/thông điệp khác → false", () => {
    expect(coChuKyWaf(undefined)).toBe(false);
    expect(coChuKyWaf("")).toBe(false);
    expect(coChuKyWaf("Mã captcha không đúng.")).toBe(false);
  });
});

describe("isWafBlocked", () => {
  it("GdtError 403 + chữ ký → true", () => {
    expect(isWafBlocked(new GdtError(THONG_DIEP_WAF, "HTTP_ERROR", 403))).toBe(true);
  });
  it("GdtError 403 KHÔNG chữ ký → false (chặn địa lý/khác)", () => {
    expect(isWafBlocked(new GdtError("Forbidden", "HTTP_ERROR", 403))).toBe(false);
  });
  it("GdtError 401 dù có chữ ký → false (không phải WAF)", () => {
    expect(isWafBlocked(new GdtError(THONG_DIEP_WAF, "HTTP_ERROR", 401))).toBe(false);
  });
  it("lỗi không phải GdtError → false", () => {
    expect(isWafBlocked(new GdtContractDriftError(THONG_DIEP_WAF))).toBe(false);
    expect(isWafBlocked(new Error(THONG_DIEP_WAF))).toBe(false);
    expect(isWafBlocked(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd packages/gdt-client && npx vitest run test/unit/errors.test.ts`
Expected: FAIL — `coChuKyWaf`/`isWafBlocked` chưa export.

- [ ] **Step 3: Hiện thực trong `errors.ts`**

Thêm vào cuối `packages/gdt-client/src/errors.ts`:

```ts
/**
 * Chữ ký WAF của GDT — KIỂM CHỨNG 2026-09-24 (curl thật, sự cố 10/09→24/09/2026):
 * WAF (cookie TS*, F5 BIG-IP) trả HTTP 403 kèm
 * {"status":403,"message":"Hệ thống phát hiện hành vi không hợp lệ. Yêu cầu đã bị chặn."}
 * cho POST /api/security-taxpayer/authenticate thiếu header `request-id`. Đây là chuỗi
 * do GDT kiểm soát; nếu họ đổi chữ ngữ, 403 rơi về GEO_BLOCKED (vẫn báo, chỉ sai nhãn —
 * xem docs/runbooks/gdt-doi-phuong-thuc.md). Nguồn chân lý DUY NHẤT — không so chuỗi ở
 * nơi khác.
 */
export const WAF_BLOCK_SIGNATURE = "hành vi không hợp lệ";

/** Thân phản hồi/thông điệp có mang chữ ký WAF không. So sau chuẩn hoá NFC + chữ thường. */
export function coChuKyWaf(text: string | undefined): boolean {
  if (!text) return false;
  return text.normalize("NFC").toLowerCase().includes(WAF_BLOCK_SIGNATURE.normalize("NFC"));
}

/** Lỗi adapter có phải "WAF GDT chặn" không: GdtError, HTTP 403, thông điệp mang chữ ký. */
export function isWafBlocked(err: unknown): boolean {
  return err instanceof GdtError && err.httpStatus === 403 && coChuKyWaf(err.message);
}
```

- [ ] **Step 4: Chạy để thấy xanh**

Run: `cd packages/gdt-client && npx vitest run test/unit/errors.test.ts`
Expected: PASS (8 test).

- [ ] **Step 5: Viết test đỏ cho `classify` với thân phản hồi**

Thêm vào `packages/gdt-client/test/unit/transport.test.ts`, trong `describe("classify")`:

```ts
  // KIỂM CHỨNG 2026-09-24: 403 + thân mang chữ ký WAF = chặn theo HEADER (không theo IP).
  // Xếp nhầm vào GEO_BLOCKED thì hệ thống tính chuyển relay VN — nơi cũng bị chặn y hệt.
  it("WAF_BLOCKED cho 403 + thân mang chữ ký WAF", () => {
    const than = '{"status":403,"message":"Hệ thống phát hiện hành vi không hợp lệ. Yêu cầu đã bị chặn."}';
    expect(classify(403, false, false, than)).toBe("WAF_BLOCKED");
  });

  it("GEO_BLOCKED cho 403 có thân nhưng KHÔNG chữ ký, và 403 không thân", () => {
    expect(classify(403, false, false, "<html>Forbidden</html>")).toBe("GEO_BLOCKED");
    expect(classify(403, false, false, undefined)).toBe("GEO_BLOCKED");
  });

  it("chữ ký WAF ở status khác 403 KHÔNG đổi verdict", () => {
    expect(classify(200, false, false, "hành vi không hợp lệ")).toBe("OK");
    expect(classify(500, false, false, "hành vi không hợp lệ")).toBe("ERROR");
  });
```

- [ ] **Step 6: Chạy để thấy đỏ**

Run: `cd packages/gdt-client && npx vitest run test/unit/transport.test.ts`
Expected: FAIL — `classify(403, …, than)` trả `"GEO_BLOCKED"` (tham số thứ tư bị bỏ qua).

- [ ] **Step 7: Hiện thực trong `transport.ts`**

Thay khai báo `ProbeVerdict` và hàm `classify` trong `packages/gdt-client/src/transport.ts`:

```ts
import { coChuKyWaf } from "./errors";

// WAF_BLOCKED (2026-09-24): 403 + thân mang chữ ký WAF — chặn theo header, KHÔNG phải địa lý.
export type ProbeVerdict =
  | "OK"
  | "GEO_BLOCKED"
  | "WAF_BLOCKED"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "ERROR";
```

```ts
// Phân loại một lần gọi thành ProbeVerdict (dùng chung cho probe & runtime routing).
// `body` (tuỳ chọn): thân phản hồi đã đọc, CHỈ dùng để tách WAF_BLOCKED khỏi GEO_BLOCKED
// khi status 403 — caller không cần đọc thân cho các status khác.
export function classify(
  status: number | undefined,
  timedOut: boolean,
  errored: boolean,
  body?: string,
): ProbeVerdict {
  if (timedOut) return "TIMEOUT";
  if (errored || status === undefined) return "ERROR";
  if (status === 403 && coChuKyWaf(body)) return "WAF_BLOCKED";
  if (status === 403 || status === 451) return "GEO_BLOCKED";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 200 && status < 500) return "OK"; // 4xx nghiệp vụ = vẫn tới được máy chủ
  return "ERROR";
}
```

- [ ] **Step 8: Chạy để thấy xanh**

Run: `cd packages/gdt-client && npx vitest run test/unit/transport.test.ts`
Expected: PASS.

- [ ] **Step 9: Viết test đỏ cho `probe()` đọc thân 403**

Thêm vào `packages/gdt-client/test/unit/directTransport.test.ts`, trong `describe("createDirectCfTransport …")`:

```ts
  it("probe() 403 + thân mang chữ ký WAF → verdict WAF_BLOCKED (đọc thân để phân loại)", async () => {
    const fake = vi.fn(
      async () =>
        new Response(
          '{"status":403,"message":"Hệ thống phát hiện hành vi không hợp lệ. Yêu cầu đã bị chặn."}',
          { status: 403 },
        ),
    );
    const t = createDirectCfTransport(fake as unknown as typeof fetch);
    const p = await t.probe();
    expect(p.verdict).toBe("WAF_BLOCKED");
    expect(p.httpStatus).toBe(403);
  });

  it("probe() 403 thân HTML dài (không chữ ký) → GEO_BLOCKED, chỉ đọc 1 KB, không ném", async () => {
    const than = `<html>${"x".repeat(50_000)}</html>`;
    const fake = vi.fn(async () => new Response(than, { status: 403 }));
    const t = createDirectCfTransport(fake as unknown as typeof fetch);
    const p = await t.probe();
    expect(p.verdict).toBe("GEO_BLOCKED");
  });

  it("probe() 403 mà đọc thân ném lỗi → vẫn GEO_BLOCKED, không ném ra ngoài", async () => {
    const res = new Response("x", { status: 403 });
    Object.defineProperty(res, "text", {
      value: async () => {
        throw new Error("stream hỏng");
      },
    });
    const fake = vi.fn(async () => res);
    const t = createDirectCfTransport(fake as unknown as typeof fetch);
    const p = await t.probe();
    expect(p.verdict).toBe("GEO_BLOCKED");
  });
```

- [ ] **Step 10: Chạy để thấy đỏ**

Run: `cd packages/gdt-client && npx vitest run test/unit/directTransport.test.ts`
Expected: FAIL — ca đầu trả `"GEO_BLOCKED"`.

- [ ] **Step 11: Hiện thực trong `directTransport.ts`**

Thay phần thân `probe()` trong `packages/gdt-client/src/directTransport.ts`:

```ts
    async probe(): Promise<ProbeResult> {
      const start = Date.now();
      try {
        // Cùng header request-id như mọi request nghiệp vụ (gdt-adapter.md, 2026-09-24):
        // probe không đi qua fetchWithRetry (cố ý: không retry/backoff khi đo sức khỏe).
        const res = await fetchImpl(`${BASE}${PUBLIC_PROBE_PATH}`, {
          method: "GET",
          headers: withRequestId(undefined),
        });
        // CHỈ đọc thân khi 403 — để tách WAF_BLOCKED khỏi GEO_BLOCKED (2026-09-24). Cắt 1 KB
        // (trang chặn có thể là HTML dài); đọc hỏng thì coi như không có thân → GEO_BLOCKED.
        const body = res.status === 403 ? await docThanAnToan(res) : undefined;
        return {
          transport: "direct-cf",
          verdict: classify(res.status, false, false, body),
          httpStatus: res.status,
          latencyMs: Date.now() - start,
        };
      } catch {
        return { transport: "direct-cf", verdict: "ERROR", latencyMs: Date.now() - start };
      }
    },
```

Thêm hàm ở cấp module (trên `createDirectCfTransport`):

```ts
const PROBE_BODY_MAX_CHARS = 1024;

/** Đọc thân phản hồi để phân loại, tối đa 1 KB; hỏng thì trả undefined (không ném). */
async function docThanAnToan(res: Response): Promise<string | undefined> {
  try {
    return (await res.text()).slice(0, PROBE_BODY_MAX_CHARS);
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 12: Export từ `index.ts`**

Sửa dòng export errors trong `packages/gdt-client/src/index.ts`:

```ts
export {
  GdtContractDriftError,
  GdtError,
  WAF_BLOCK_SIGNATURE,
  coChuKyWaf,
  isWafBlocked,
} from "./errors";
```

- [ ] **Step 13: Chạy toàn bộ unit gdt-client + lint**

Run: `cd packages/gdt-client && npx vitest run --dir test/unit && npx tsc --noEmit && cd ../.. && npx biome check packages/gdt-client`
Expected: PASS toàn bộ (≥ 110 test), tsc sạch, Biome sạch.

- [ ] **Step 14: Commit**

```bash
git add packages/gdt-client/src/errors.ts packages/gdt-client/src/transport.ts packages/gdt-client/src/directTransport.ts packages/gdt-client/src/index.ts packages/gdt-client/test/unit/errors.test.ts packages/gdt-client/test/unit/transport.test.ts packages/gdt-client/test/unit/directTransport.test.ts
git commit -m "feat(gdt-client): tách WAF_BLOCKED khỏi GEO_BLOCKED — chữ ký WAF, isWafBlocked, probe đọc thân 403"
```

---

### Task 2: `@vat/gdt-client` — `canaryAuthenticate()` + contract test

**Files:**
- Create: `packages/gdt-client/src/canary.ts`
- Modify: `packages/gdt-client/src/index.ts`
- Modify: `packages/gdt-client/test/contract/authenticate.contract.test.ts`
- Test: `packages/gdt-client/test/unit/canary.test.ts` (tạo mới)

**Interfaces:**
- Consumes: `getCaptcha(transport, opts)`, `authenticate(transport, creds, opts)`, `GdtError`, `GdtContractDriftError`, `isWafBlocked`, `RetryOptions`, `GdtTransport`.
- Produces: `type CanaryVerdict = "OK" | "WAF_BLOCKED" | "DRIFT" | "TIMEOUT" | "ERROR"`; `interface CanaryResult { verdict: CanaryVerdict; httpStatus?: number; message?: string; latencyMs: number }`; `canaryAuthenticate(transport: GdtTransport, opts?: RetryOptions): Promise<CanaryResult>`; hằng `CANARY_USERNAME = "0000000000"`.

- [ ] **Step 1: Viết test đỏ**

Tạo `packages/gdt-client/test/unit/canary.test.ts`:

```ts
// Canary lối vào GDT (U43): captcha thật + authenticate MST GIẢ + captcha SAI, KHÔNG retry.
// KIỂM CHỨNG 2026-09-24: GDT kiểm captcha TRƯỚC nên MST giả không đụng tài khoản nào;
// mong đợi 401 "Mã captcha không đúng." Mọi dạng khác 401 là tín hiệu WAF/đổi hợp đồng.
import { describe, expect, it } from "vitest";
import { CANARY_USERNAME, canaryAuthenticate } from "../../src/canary";
import type { GdtTransport } from "../../src/transport";

const CAPTCHA_OK = { key: "ck-123", content: "<svg xmlns='http://www.w3.org/2000/svg'></svg>" };
const THONG_DIEP_WAF = "Hệ thống phát hiện hành vi không hợp lệ. Yêu cầu đã bị chặn.";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Transport giả: bước 1 (captcha) và bước 2 (authenticate) trả theo kịch bản; đếm lượt gọi. */
function makeTransport(
  captcha: () => Response | Promise<Response>,
  auth: () => Response | Promise<Response>,
) {
  const calls: { url: string; body?: string }[] = [];
  const transport: GdtTransport = {
    name: "mock",
    async fetch(url, init) {
      calls.push({ url, body: typeof init?.body === "string" ? init.body : undefined });
      return url.endsWith("/api/captcha") ? captcha() : auth();
    },
    async probe() {
      throw new Error("không dùng trong test này");
    },
  };
  return { transport, calls };
}

describe("canaryAuthenticate", () => {
  it("401 'Mã captcha không đúng.' → OK, giữ httpStatus + message, đúng 2 request", async () => {
    const { transport, calls } = makeTransport(
      () => json(200, CAPTCHA_OK),
      () => json(401, { message: "Mã captcha không đúng." }),
    );
    const r = await canaryAuthenticate(transport);
    expect(r.verdict).toBe("OK");
    expect(r.httpStatus).toBe(401);
    expect(r.message).toBe("Mã captcha không đúng.");
    expect(calls).toHaveLength(2);
    // Gửi đúng MST giả + ckey thật vừa lấy; KHÔNG bao giờ gửi MST thật.
    expect(calls[1]?.body).toContain(`"username":"${CANARY_USERNAME}"`);
    expect(calls[1]?.body).toContain('"ckey":"ck-123"');
  });

  it("403 + chữ ký WAF → WAF_BLOCKED", async () => {
    const { transport } = makeTransport(
      () => json(200, CAPTCHA_OK),
      () => json(403, { status: 403, message: THONG_DIEP_WAF }),
    );
    const r = await canaryAuthenticate(transport);
    expect(r.verdict).toBe("WAF_BLOCKED");
    expect(r.httpStatus).toBe(403);
    expect(r.message).toBe(THONG_DIEP_WAF);
  });

  it("200 có token cho MST giả → DRIFT (không thể đúng)", async () => {
    const { transport } = makeTransport(
      () => json(200, CAPTCHA_OK),
      () => json(200, { token: "a.b.c" }),
    );
    const r = await canaryAuthenticate(transport);
    expect(r.verdict).toBe("DRIFT");
    expect(r.httpStatus).toBe(200);
  });

  it("403 KHÔNG chữ ký / 400 / 500 → DRIFT kèm httpStatus", async () => {
    for (const status of [403, 400, 500]) {
      const { transport } = makeTransport(
        () => json(200, CAPTCHA_OK),
        () => json(status, { message: "khác" }),
      );
      const r = await canaryAuthenticate(transport, { backoffMs: 1 });
      expect(r.verdict).toBe("DRIFT");
      expect(r.httpStatus).toBe(status);
    }
  });

  it("KHÔNG retry: 500 ở authenticate chỉ gọi đúng 1 lần (tổng 2 request)", async () => {
    const { transport, calls } = makeTransport(
      () => json(200, CAPTCHA_OK),
      () => json(500, {}),
    );
    await canaryAuthenticate(transport, { maxAttempts: 3, backoffMs: 1 });
    expect(calls).toHaveLength(2);
  });

  it("captcha đổi schema (thiếu key) → DRIFT", async () => {
    const { transport } = makeTransport(
      () => json(200, { content: "<svg/>" }),
      () => json(401, {}),
    );
    const r = await canaryAuthenticate(transport);
    expect(r.verdict).toBe("DRIFT");
  });

  it("captcha HTTP 500 → ERROR (không tới bước authenticate)", async () => {
    const { transport, calls } = makeTransport(
      () => json(500, {}),
      () => json(401, {}),
    );
    const r = await canaryAuthenticate(transport, { backoffMs: 1 });
    expect(r.verdict).toBe("ERROR");
    expect(calls).toHaveLength(1);
  });

  it("timeout ở authenticate → TIMEOUT", async () => {
    const { transport } = makeTransport(
      () => json(200, CAPTCHA_OK),
      () =>
        new Promise<Response>((_resolve, reject) => {
          const e = new Error("aborted");
          e.name = "AbortError";
          setTimeout(() => reject(e), 5);
        }),
    );
    const r = await canaryAuthenticate(transport, { timeoutMs: 1 });
    expect(r.verdict).toBe("TIMEOUT");
  });

  it("lỗi mạng ở authenticate → ERROR, latencyMs là số", async () => {
    const { transport } = makeTransport(
      () => json(200, CAPTCHA_OK),
      () => {
        throw new Error("ECONNRESET");
      },
    );
    const r = await canaryAuthenticate(transport);
    expect(r.verdict).toBe("ERROR");
    expect(typeof r.latencyMs).toBe("number");
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd packages/gdt-client && npx vitest run test/unit/canary.test.ts`
Expected: FAIL — không tìm thấy module `../../src/canary`.

- [ ] **Step 3: Hiện thực `canary.ts`**

Tạo `packages/gdt-client/src/canary.ts`:

```ts
// U43 — Canary lối vào GDT: "GDT còn xử lý đăng nhập như mọi khi không?"
//
// Cách đo: lấy captcha THẬT rồi gọi authenticate với MST KHÔNG TỒN TẠI + captcha cố ý SAI.
// KIỂM CHỨNG 2026-09-24 (curl thật): GDT kiểm captcha TRƯỚC → 401 {"message":"Mã captcha
// không đúng."} — không đụng tài khoản của ai, không có lượt "sai mật khẩu" nào bị đếm.
// Đó chính là phép thử đã tái lập sự cố 10/09→24/09 (thiếu request-id → 403 WAF).
//
// Ranh giới (CLAUDE.md): KHÔNG giải captcha (gửi giá trị sai có chủ ý), KHÔNG né chặn,
// KHÔNG retry (một lượt cron = một lời gọi captcha + một lời gọi authenticate). Bị chặn
// thì BÁO, không thử dồn — thử dồn là cách nhanh nhất để leo thang thành chặn IP.
import { authenticate } from "./auth";
import { getCaptcha } from "./captcha";
import { GdtContractDriftError, GdtError, isWafBlocked } from "./errors";
import type { RetryOptions } from "./http";
import type { GdtTransport } from "./transport";

export const CANARY_USERNAME = "0000000000" as const;
// Mật khẩu VÔ NGHĨA, cố ý sai — không phải bí mật (tên hằng tránh mẫu quét của hook security).
const CANARY_PW_GIA = "canary-khong-dung";
const CANARY_CVALUE = "0000";

export type CanaryVerdict = "OK" | "WAF_BLOCKED" | "DRIFT" | "TIMEOUT" | "ERROR";

export interface CanaryResult {
  verdict: CanaryVerdict;
  httpStatus?: number;
  /** Thông điệp GDT/lỗi — chỉ để người đọc cảnh báo; không chứa secret hay dữ liệu tenant. */
  message?: string;
  latencyMs: number;
}

type KetQuaKhongCoThoiGian = Omit<CanaryResult, "latencyMs">;

/** Lỗi ném từ transport (không phải GdtError): AbortError = timeout, còn lại = mạng. */
function phanLoaiLoiTransport(err: unknown, buoc: "captcha" | "authenticate"): KetQuaKhongCoThoiGian {
  const timedOut = err instanceof Error && err.name === "AbortError";
  const chiTiet = err instanceof Error ? err.message : String(err);
  return { verdict: timedOut ? "TIMEOUT" : "ERROR", message: `${buoc}: ${chiTiet}` };
}

export async function canaryAuthenticate(
  transport: GdtTransport,
  opts: RetryOptions = {},
): Promise<CanaryResult> {
  const start = Date.now();
  const khongRetry: RetryOptions = { ...opts, maxAttempts: 1 };
  const xong = (r: KetQuaKhongCoThoiGian): CanaryResult => ({
    ...r,
    latencyMs: Date.now() - start,
  });

  let ckey: string;
  try {
    ckey = (await getCaptcha(transport, khongRetry)).key;
  } catch (err) {
    // Captcha đổi dạng = đổi hợp đồng (DRIFT). Captcha HTTP lỗi/mạng = ERROR/TIMEOUT —
    // probe egress 15' (đọc thân 403) là nơi phân biệt WAF trên /captcha.
    if (err instanceof GdtContractDriftError) return xong({ verdict: "DRIFT", message: err.message });
    if (err instanceof GdtError) {
      return xong({ verdict: "ERROR", httpStatus: err.httpStatus, message: err.message });
    }
    return xong(phanLoaiLoiTransport(err, "captcha"));
  }

  try {
    await authenticate(
      transport,
      { username: CANARY_USERNAME, password: CANARY_PW_GIA, ckey, cvalue: CANARY_CVALUE },
      khongRetry,
    );
  } catch (err) {
    if (err instanceof GdtError && err.httpStatus === 401) {
      return xong({ verdict: "OK", httpStatus: 401, message: err.message });
    }
    if (isWafBlocked(err)) {
      return xong({ verdict: "WAF_BLOCKED", httpStatus: 403, message: (err as GdtError).message });
    }
    if (err instanceof GdtContractDriftError) return xong({ verdict: "DRIFT", message: err.message });
    if (err instanceof GdtError) {
      return xong({ verdict: "DRIFT", httpStatus: err.httpStatus, message: err.message });
    }
    return xong(phanLoaiLoiTransport(err, "authenticate"));
  }

  // Thành công với MST giả là KHÔNG THỂ đúng — GDT đã đổi cách xử lý đăng nhập.
  return xong({ verdict: "DRIFT", httpStatus: 200, message: "authenticate trả token cho MST giả" });
}
```

Lưu ý: `authenticate()` (đã sửa 24/09) ném `GdtError(message, "HTTP_ERROR", res.status)` cho mọi status ≠ 200 và cho 200-không-token (khi đó `httpStatus` = 200 nhưng không có token → nhánh `GdtError` → `DRIFT` với httpStatus 200 — chấp nhận, vì "200 kèm message lỗi" cũng là dạng chưa từng quan sát cho MST giả).

- [ ] **Step 4: Chạy để thấy xanh**

Run: `cd packages/gdt-client && npx vitest run test/unit/canary.test.ts`
Expected: PASS (9 test).

- [ ] **Step 5: Export và thay ca contract test**

Thêm vào `packages/gdt-client/src/index.ts`:

```ts
export { CANARY_USERNAME, canaryAuthenticate, type CanaryResult, type CanaryVerdict } from "./canary";
```

Trong `packages/gdt-client/test/contract/authenticate.contract.test.ts`, thay toàn bộ khối `describe("contract: WAF GDT trên /authenticate (không cần credential)", …)` (viết 24/09) bằng:

```ts
// KHÔNG cần credential — chạy trong mọi lượt `make test-contract`. Sự cố 10/09→24/09/2026:
// GDT (WAF F5) chặn POST /authenticate thiếu header `request-id` bằng HTTP 403 → 0 tenant
// đăng nhập được hai tuần mà contract test cũ (chỉ /captcha) không thấy. Từ U43, cùng một
// hàm `canaryAuthenticate` chạy ở đây (CI) lẫn cron mỗi giờ ở sync-worker — một nguồn chân lý.
describe("contract: canary lối vào GDT (không cần credential)", () => {
  it("captcha sai + MST giả → verdict OK (401 nghiệp vụ), KHÔNG WAF_BLOCKED/DRIFT", async () => {
    const r = await canaryAuthenticate(createDirectCfTransport());
    console.log("CANARY_VERDICT=", r.verdict, "STATUS=", r.httpStatus, "MESSAGE=", r.message);
    expect(r.verdict).toBe("OK");
    expect(r.httpStatus).toBe(401);
  });
});
```

và sửa dòng import đầu file thành:

```ts
import { authenticate, canaryAuthenticate, createDirectCfTransport, getCaptcha } from "../../src";
```

(bỏ `GdtError` nếu không còn dùng trong file).

- [ ] **Step 6: Chạy contract thật + toàn bộ unit**

Run: `cd packages/gdt-client && npx vitest run test/contract/authenticate.contract.test.ts && npx vitest run --dir test/unit && npx tsc --noEmit`
Expected: contract in `CANARY_VERDICT= OK STATUS= 401`; unit PASS; tsc sạch.

- [ ] **Step 7: Commit**

```bash
git add packages/gdt-client/src/canary.ts packages/gdt-client/src/index.ts packages/gdt-client/test/unit/canary.test.ts packages/gdt-client/test/contract/authenticate.contract.test.ts
git commit -m "feat(gdt-client): canaryAuthenticate — đo lối vào đăng nhập GDT bằng MST giả, không retry"
```

---

### Task 3: Package `@vat/thong-bao` — chuyển Telegram từ `apps/api`, tách cấu hình, thêm tin giám sát GDT

**Files:**
- Create: `packages/thong-bao/package.json`, `packages/thong-bao/tsconfig.json`, `packages/thong-bao/vitest.config.ts`, `packages/thong-bao/src/index.ts`, `packages/thong-bao/src/giamSatGdt.ts`
- Move: `apps/api/src/thongBao/telegram.ts` → `packages/thong-bao/src/telegram.ts`
- Move: `apps/api/test/unit/telegram.test.ts` → `packages/thong-bao/test/telegram.test.ts`
- Modify: `apps/api/src/types.ts:9`, `apps/api/src/index.ts:15`, `apps/api/package.json`, `apps/sync-worker/package.json`
- Test: `packages/thong-bao/test/giamSatGdt.test.ts` (tạo mới)

**Interfaces:**
- Produces (từ `@vat/thong-bao`): `kiemTraCauHinhTelegram(env: { TELEGRAM_BOT_TOKEN?: string; TELEGRAM_CHAT_ID?: string }): { ok: true; cauHinh: CauHinhTelegram } | { ok: false; thieu: string[] }` với `CauHinhTelegram = { botToken: string; chatId: string }`; `guiTinTelegram(cauHinh, noiDung): Promise<KetQuaThongBao>`; `thoatHtml`, `cheEmail`, `soanTinDangKyMoi`, `baoDangKyMoi(env, tt)` (chữ ký giữ nguyên); `type KetQuaThongBao`; `type ThongTinDangKyMoi`; **mới:** `type LoaiSuKienGiamSat = "bat_giam_sat" | "chan" | "drift" | "loi_lien_tiep" | "hoi_phuc" | "egress"`; `interface SuKienGiamSatGdt { loai: LoaiSuKienGiamSat; verdict: string; httpStatus?: number; message?: string; consecutiveBad?: number; egressCountry?: string; thoiDiem: Date }`; `soanTinGiamSatGdt(sk: SuKienGiamSatGdt): string`; `RUNBOOK_GDT = "docs/runbooks/gdt-doi-phuong-thuc.md"`.

- [ ] **Step 1: Dựng khung package**

`packages/thong-bao/package.json`:

```json
{
  "name": "@vat/thong-bao",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run --coverage"
  }
}
```

`packages/thong-bao/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

`packages/thong-bao/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

// U43: package thông báo cho NGƯỜI THẬT (Telegram). Chỉ fetch() chuẩn — chạy Node lẫn
// workerd, không cần mạng thật trong test (mock fetch) → toàn bộ `unit`, vào `make test`.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts"],
      thresholds: { lines: 80, statements: 80, branches: 80, functions: 80 },
    },
  },
});
```

- [ ] **Step 2: Di dời file bằng git (giữ lịch sử)**

```bash
mkdir -p packages/thong-bao/src packages/thong-bao/test
git mv apps/api/src/thongBao/telegram.ts packages/thong-bao/src/telegram.ts
git mv apps/api/test/unit/telegram.test.ts packages/thong-bao/test/telegram.test.ts
```

Sửa dòng import trong `packages/thong-bao/test/telegram.test.ts`: `from "../../src/thongBao/telegram"` → `from "../src/telegram"`.

- [ ] **Step 3: Viết test đỏ cho việc tách cấu hình (sửa test đã chuyển)**

Trong `packages/thong-bao/test/telegram.test.ts`, tìm ca test đang khẳng định `kiemTraCauHinhTelegram` báo thiếu `URL_CONG_ADMIN` (grep `URL_CONG_ADMIN` trong file). Thay/thêm hai ca:

```ts
  it("kiemTraCauHinhTelegram chỉ đòi bot token + chat id (URL_CONG_ADMIN là việc của tin đăng ký)", () => {
    const kq = kiemTraCauHinhTelegram({
      TELEGRAM_BOT_TOKEN: " 123:abc ",
      TELEGRAM_CHAT_ID: " -100 ",
    });
    expect(kq).toEqual({ ok: true, cauHinh: { botToken: "123:abc", chatId: "-100" } });
  });

  it("baoDangKyMoi thiếu URL_CONG_ADMIN → chua_cau_hinh, không gọi mạng", async () => {
    const kq = await baoDangKyMoi(
      { TELEGRAM_BOT_TOKEN: "123:abc", TELEGRAM_CHAT_ID: "-100" },
      TT,
    );
    expect(kq).toEqual({ daGui: false, lyDo: "chua_cau_hinh" });
    expect(fetchGia).not.toHaveBeenCalled();
  });
```

(Giữ nguyên mọi ca khác: fail-silent, che email, không có URL duyệt.)

- [ ] **Step 4: Chạy để thấy đỏ**

Run: `cd packages/thong-bao && npx vitest run test/telegram.test.ts`
Expected: FAIL — `kiemTraCauHinhTelegram` vẫn trả `thieu: ["URL_CONG_ADMIN"]` / `cauHinh` có `urlCongAdmin`.

- [ ] **Step 5: Tách cấu hình trong `telegram.ts`**

Trong `packages/thong-bao/src/telegram.ts`:

Thay `CauHinhTelegram` và `kiemTraCauHinhTelegram`:

```ts
export interface CauHinhTelegram {
  botToken: string;
  chatId: string;
}

/**
 * Đọc cấu hình kênh. Thiếu bất kỳ mảnh nào ⇒ coi như TẮT thông báo (không phải lỗi).
 * Trả về `thieu` để chỗ gọi log ĐÚNG mảnh nào vắng — "thông báo không chạy" mà không biết
 * vì sao là kiểu hỏng tốn nhiều giờ nhất để tìm ra.
 * U43: KHÔNG còn đòi URL_CONG_ADMIN — đó là nhu cầu riêng của tin "đăng ký mới"
 * (`baoDangKyMoi` tự kiểm); sync-worker gửi tin giám sát không cần URL nào.
 */
export function kiemTraCauHinhTelegram(env: {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
}): { ok: true; cauHinh: CauHinhTelegram } | { ok: false; thieu: string[] } {
  // TRIM mọi giá trị — chốt chặn lỗi ĐÃ XẢY RA (2026-07-22): TELEGRAM_CHAT_ID dán dư một
  // khoảng trắng đầu chuỗi ⇒ Telegram "chat not found" ⇒ kênh báo chết CÂM.
  const botToken = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.TELEGRAM_CHAT_ID?.trim();
  const thieu: string[] = [];
  if (!botToken) thieu.push("TELEGRAM_BOT_TOKEN");
  if (!chatId) thieu.push("TELEGRAM_CHAT_ID");
  if (thieu.length > 0) return { ok: false, thieu };
  return { ok: true, cauHinh: { botToken: botToken as string, chatId: chatId as string } };
}
```

Thay `baoDangKyMoi`:

```ts
export async function baoDangKyMoi(
  env: { TELEGRAM_BOT_TOKEN?: string; TELEGRAM_CHAT_ID?: string; URL_CONG_ADMIN?: string },
  tt: ThongTinDangKyMoi,
): Promise<KetQuaThongBao> {
  const ch = kiemTraCauHinhTelegram(env);
  const urlCongAdmin = env.URL_CONG_ADMIN?.trim();
  const thieu = [...(ch.ok ? [] : ch.thieu), ...(urlCongAdmin ? [] : ["URL_CONG_ADMIN"])];
  if (!ch.ok || !urlCongAdmin) {
    console.warn(`[thongBao] Telegram TẮT — thiếu: ${thieu.join(", ")}`);
    return { daGui: false, lyDo: "chua_cau_hinh" };
  }
  const kq = await guiTinTelegram(ch.cauHinh, soanTinDangKyMoi(tt, urlCongAdmin));
  if (!kq.daGui) console.warn(`[thongBao] không gửi được Telegram: ${kq.lyDo}`);
  return kq;
}
```

(Giữ nguyên phần chú thích đầu file, `TIMEOUT_MS`, `cheEmail`, `thoatHtml`, `soanTinDangKyMoi`, `guiTinTelegram`.)

- [ ] **Step 6: Chạy để thấy xanh**

Run: `cd packages/thong-bao && npx vitest run test/telegram.test.ts`
Expected: PASS toàn bộ.

- [ ] **Step 7: Viết test đỏ cho tin giám sát GDT**

Tạo `packages/thong-bao/test/giamSatGdt.test.ts`:

```ts
// U43 — Tin Telegram cho sự kiện giám sát lối vào GDT. Ba tính chất: đúng tiêu đề theo loại,
// không rò secret, escape HTML (thông điệp GDT là chuỗi do BÊN NGOÀI kiểm soát).
import { describe, expect, it } from "vitest";
import { RUNBOOK_GDT, type SuKienGiamSatGdt, soanTinGiamSatGdt } from "../src/giamSatGdt";

const THOI_DIEM = new Date("2026-09-24T05:00:00.000Z"); // 12:00 giờ Việt Nam

function suKien(phan: Partial<SuKienGiamSatGdt>): SuKienGiamSatGdt {
  return { loai: "chan", verdict: "WAF_BLOCKED", thoiDiem: THOI_DIEM, ...phan };
}

describe("soanTinGiamSatGdt", () => {
  it("chan: tiêu đề CHẶN, có mã HTTP, thông điệp GDT, giờ Việt Nam, đường runbook", () => {
    const tin = soanTinGiamSatGdt(
      suKien({ httpStatus: 403, message: "Hệ thống phát hiện hành vi không hợp lệ." }),
    );
    expect(tin).toContain("GDT đang CHẶN");
    expect(tin).toContain("403");
    expect(tin).toContain("Hệ thống phát hiện hành vi không hợp lệ.");
    expect(tin).toContain("12:00");
    expect(tin).toContain("24/9/2026");
    expect(tin).toContain(RUNBOOK_GDT);
  });

  it("mỗi loại có tiêu đề riêng", () => {
    expect(soanTinGiamSatGdt(suKien({ loai: "bat_giam_sat", verdict: "OK" }))).toContain("đã bật");
    expect(soanTinGiamSatGdt(suKien({ loai: "drift", verdict: "DRIFT" }))).toContain("đổi cách");
    expect(
      soanTinGiamSatGdt(suKien({ loai: "loi_lien_tiep", verdict: "TIMEOUT", consecutiveBad: 3 })),
    ).toContain("3 lần liên tiếp");
    expect(soanTinGiamSatGdt(suKien({ loai: "hoi_phuc", verdict: "OK" }))).toContain("thông lại");
    expect(
      soanTinGiamSatGdt(suKien({ loai: "egress", verdict: "GEO_BLOCKED", consecutiveBad: 3 })),
    ).toContain("Probe egress");
  });

  it("escape HTML trong thông điệp GDT (chuỗi bên ngoài kiểm soát)", () => {
    const tin = soanTinGiamSatGdt(suKien({ message: "<b>x</b> & y" }));
    expect(tin).toContain("&lt;b&gt;x&lt;/b&gt; &amp; y");
    expect(tin).not.toContain("<b>x</b>");
  });

  it("không có message/httpStatus/egressCountry → vẫn soạn được, không in 'undefined'", () => {
    const tin = soanTinGiamSatGdt(suKien({ loai: "hoi_phuc", verdict: "OK" }));
    expect(tin).not.toContain("undefined");
  });

  it("có egressCountry → hiện nước egress", () => {
    expect(soanTinGiamSatGdt(suKien({ egressCountry: "SG" }))).toContain("SG");
  });
});
```

Ghi chú: `toLocaleString("vi-VN")` trên Node in ngày dạng `24/9/2026` (không đệm số 0) — kỳ vọng ở test viết theo đúng dạng đó; nếu môi trường in `24/09/2026`, nới kỳ vọng thành `/24\/0?9\/2026/`.

- [ ] **Step 8: Chạy để thấy đỏ**

Run: `cd packages/thong-bao && npx vitest run test/giamSatGdt.test.ts`
Expected: FAIL — không tìm thấy `../src/giamSatGdt`.

- [ ] **Step 9: Hiện thực `giamSatGdt.ts` và `index.ts`**

`packages/thong-bao/src/giamSatGdt.ts`:

```ts
// U43 — Soạn tin Telegram cho sự kiện giám sát lối vào GDT (canary mỗi giờ + probe egress).
// Tin nằm trên máy chủ Telegram (ngoài tầm kiểm soát tenant — security.md): CHỈ metadata
// vận hành. Canary dùng MST giả nên không có dữ liệu tenant; KHÔNG BAO GIỜ đưa token/secret.
import { thoatHtml } from "./telegram";

export const RUNBOOK_GDT = "docs/runbooks/gdt-doi-phuong-thuc.md";

export type LoaiSuKienGiamSat =
  | "bat_giam_sat"
  | "chan"
  | "drift"
  | "loi_lien_tiep"
  | "hoi_phuc"
  | "egress";

export interface SuKienGiamSatGdt {
  loai: LoaiSuKienGiamSat;
  verdict: string;
  httpStatus?: number;
  /** Thông điệp GDT/lỗi nguyên văn — chuỗi do BÊN NGOÀI kiểm soát, phải escape. */
  message?: string;
  consecutiveBad?: number;
  egressCountry?: string;
  thoiDiem: Date;
}

function tieuDe(sk: SuKienGiamSatGdt): string {
  switch (sk.loai) {
    case "bat_giam_sat":
      return "✅ <b>Giám sát lối vào GDT đã bật</b>";
    case "chan":
      return "🚫 <b>GDT đang CHẶN đăng nhập từ hệ thống (WAF)</b>";
    case "drift":
      return "⚠️ <b>GDT đổi cách phản hồi đăng nhập</b>";
    case "loi_lien_tiep":
      return `⚠️ <b>Canary GDT lỗi ${sk.consecutiveBad ?? "?"} lần liên tiếp</b>`;
    case "hoi_phuc":
      return "✅ <b>GDT đã thông lại</b>";
    case "egress":
      return `🚫 <b>Probe egress GDT xấu ${sk.consecutiveBad ?? "?"} tick liên tiếp</b>`;
  }
}

function gioVietNam(d: Date): string {
  return d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour12: false });
}

function vietCanLam(loai: LoaiSuKienGiamSat): string {
  switch (loai) {
    case "chan":
      return `Việc cần làm: đọc ${RUNBOOK_GDT} — so header portal (request-id/Action/End-Point), curl tái lập, KHÔNG thử dồn.`;
    case "drift":
      return `Việc cần làm: xem mã + thông điệp ở trên, đối chiếu contract test; cập nhật phân loại có kiểm chứng (${RUNBOOK_GDT}).`;
    case "loi_lien_tiep":
      return "Việc cần làm: kiểm mạng biên/Cloudflare status; nếu kéo dài, chạy make test-contract từ máy dev.";
    case "egress":
      return `Việc cần làm: cron đồng bộ đang bị chặn enqueue tới khi probe OK. Xem ${RUNBOOK_GDT}.`;
    default:
      return "Không cần làm gì.";
  }
}

/** Soạn tin (HTML Telegram). Tách khỏi phần gửi để test không đụng mạng. */
export function soanTinGiamSatGdt(sk: SuKienGiamSatGdt): string {
  const dong: string[] = [tieuDe(sk), ""];
  dong.push(`Verdict: <code>${thoatHtml(sk.verdict)}</code>`);
  if (sk.httpStatus !== undefined) dong.push(`HTTP: <code>${sk.httpStatus}</code>`);
  if (sk.message) dong.push(`GDT nói: ${thoatHtml(sk.message)}`);
  if (sk.egressCountry) dong.push(`Egress: ${thoatHtml(sk.egressCountry)}`);
  dong.push(`Lúc: ${thoatHtml(gioVietNam(sk.thoiDiem))} (giờ Việt Nam)`);
  dong.push("", thoatHtml(vietCanLam(sk.loai)));
  return dong.join("\n");
}
```

`packages/thong-bao/src/index.ts`:

```ts
// @vat/thong-bao — kênh báo cho NGƯỜI THẬT (Telegram), dùng chung apps/api + apps/sync-worker.
export {
  TIMEOUT_MS,
  baoDangKyMoi,
  cheEmail,
  guiTinTelegram,
  kiemTraCauHinhTelegram,
  soanTinDangKyMoi,
  thoatHtml,
  type CauHinhTelegram,
  type KetQuaThongBao,
  type ThongTinDangKyMoi,
} from "./telegram";
export {
  RUNBOOK_GDT,
  soanTinGiamSatGdt,
  type LoaiSuKienGiamSat,
  type SuKienGiamSatGdt,
} from "./giamSatGdt";
```

- [ ] **Step 10: Chạy để thấy xanh**

Run: `cd packages/thong-bao && npx vitest run`
Expected: PASS cả hai file; coverage ≥ 80%.

- [ ] **Step 11: Nối `apps/api` và `apps/sync-worker` vào package**

`apps/api/package.json` — thêm vào `dependencies` (cạnh `@vat/sync`): `"@vat/thong-bao": "*"`.
`apps/sync-worker/package.json` — thêm vào `dependencies`: `"@vat/thong-bao": "*"`.

`apps/api/src/types.ts` dòng 9: `import type { ThongTinDangKyMoi } from "./thongBao/telegram";` → `import type { ThongTinDangKyMoi } from "@vat/thong-bao";`
`apps/api/src/index.ts` dòng 15: `import { baoDangKyMoi } from "./thongBao/telegram";` → `import { baoDangKyMoi } from "@vat/thong-bao";`

Xoá thư mục rỗng `apps/api/src/thongBao/` nếu không còn file.

Run: `npm install --no-audit --no-fund` (tại gốc worktree — tạo symlink workspace cho package mới).

- [ ] **Step 12: Kiểm toàn bộ api + lint**

Run: `cd apps/api && npx vitest run test/integration/dangKy.test.ts && npx tsc --noEmit && cd ../.. && npx biome check packages/thong-bao apps/api/src`
Expected: PASS (luồng đăng ký vẫn báo Telegram qua deps), tsc sạch, Biome sạch.

- [ ] **Step 13: Commit**

```bash
git add packages/thong-bao apps/api/src/types.ts apps/api/src/index.ts apps/api/package.json apps/sync-worker/package.json package-lock.json
git commit -m "refactor(thong-bao): chuyển Telegram thành package dùng chung, tách URL_CONG_ADMIN, thêm tin giám sát GDT"
```

(Nếu `git status` còn hiện `apps/api/src/thongBao/telegram.ts`/`apps/api/test/unit/telegram.test.ts` dưới dạng deleted chưa stage, thêm chúng vào `git add`.)

---

### Task 4: `apps/sync-worker` — máy trạng thái canary (`canaryHealth.ts`) + `isEgressBlocked` với `WAF_BLOCKED`

**Files:**
- Create: `apps/sync-worker/src/canaryHealth.ts`
- Modify: `apps/sync-worker/src/health.ts`
- Modify: `apps/sync-worker/src/index.ts` (dòng log gate)
- Test: `apps/sync-worker/test/unit/canaryHealth.test.ts` (tạo mới)
- Test: `apps/sync-worker/test/unit/health.test.ts`

**Interfaces:**
- Consumes: `CanaryResult`, `CanaryVerdict` từ `@vat/gdt-client`; `HealthState` từ `./health`.
- Produces: `CANARY_BAD_STREAK_THRESHOLD = 3`; `interface CanaryState { lastVerdict?: CanaryVerdict; consecutiveBad: number; alerted: boolean; since?: string }`; `HEALTHY_CANARY`; `type CanaryAlertKind = "bat_giam_sat" | "chan" | "drift" | "loi_lien_tiep" | "hoi_phuc"`; `interface CanaryAlert { kind: CanaryAlertKind; result: CanaryResult; consecutiveBad: number }`; `nextCanaryHealth(prev: CanaryState | undefined, result: CanaryResult, nowIso: string): { state: CanaryState; alert: CanaryAlert | null }`; `isEgressBlocked(state)` true thêm cho `WAF_BLOCKED`.

- [ ] **Step 1: Viết test đỏ cho máy trạng thái**

Tạo `apps/sync-worker/test/unit/canaryHealth.test.ts`:

```ts
// U43 — Máy trạng thái canary (thuần). QĐ-5: WAF_BLOCKED/DRIFT báo NGAY lần đầu (tín hiệu
// xác định), im tới khi hồi phục, hồi phục thì báo; TIMEOUT/ERROR cần 3 lần liên tiếp.
// Lần chạy đầu (chưa có trạng thái) và OK → tin "đã bật" đúng một lần.
import type { CanaryResult } from "@vat/gdt-client";
import { describe, expect, it } from "vitest";
import { type CanaryState, HEALTHY_CANARY, nextCanaryHealth } from "../../src/canaryHealth";

const NOW = "2026-09-24T05:00:00.000Z";
const kq = (verdict: CanaryResult["verdict"], httpStatus?: number): CanaryResult => ({
  verdict,
  httpStatus,
  latencyMs: 10,
});

describe("nextCanaryHealth", () => {
  it("chưa có trạng thái + OK → alert bat_giam_sat, state khỏe", () => {
    const s = nextCanaryHealth(undefined, kq("OK", 401), NOW);
    expect(s.alert?.kind).toBe("bat_giam_sat");
    expect(s.state).toEqual({ lastVerdict: "OK", consecutiveBad: 0, alerted: false });
  });

  it("chưa có trạng thái + WAF_BLOCKED → alert chan (KHÔNG phải 'đã bật')", () => {
    const s = nextCanaryHealth(undefined, kq("WAF_BLOCKED", 403), NOW);
    expect(s.alert?.kind).toBe("chan");
    expect(s.state.alerted).toBe(true);
    expect(s.state.since).toBe(NOW);
  });

  it("OK khi đang khỏe → không alert", () => {
    expect(nextCanaryHealth(HEALTHY_CANARY, kq("OK", 401), NOW).alert).toBeNull();
  });

  it("WAF_BLOCKED lần đầu → alert chan; lần hai → im (chống spam)", () => {
    const b1 = nextCanaryHealth(HEALTHY_CANARY, kq("WAF_BLOCKED", 403), NOW);
    expect(b1.alert?.kind).toBe("chan");
    expect(b1.alert?.result.httpStatus).toBe(403);
    const b2 = nextCanaryHealth(b1.state, kq("WAF_BLOCKED", 403), NOW);
    expect(b2.alert).toBeNull();
    expect(b2.state.consecutiveBad).toBe(2);
    expect(b2.state.since).toBe(NOW); // giữ mốc bắt đầu sự cố
  });

  it("DRIFT lần đầu → alert drift", () => {
    expect(nextCanaryHealth(HEALTHY_CANARY, kq("DRIFT", 200), NOW).alert?.kind).toBe("drift");
  });

  it("OK sau khi đã báo → alert hoi_phuc, state về khỏe", () => {
    const chan: CanaryState = { lastVerdict: "WAF_BLOCKED", consecutiveBad: 5, alerted: true, since: NOW };
    const s = nextCanaryHealth(chan, kq("OK", 401), NOW);
    expect(s.alert?.kind).toBe("hoi_phuc");
    expect(s.state).toEqual({ lastVerdict: "OK", consecutiveBad: 0, alerted: false });
  });

  it("TIMEOUT ×2 → im; ×3 → alert loi_lien_tiep; ×4 → im", () => {
    let st: CanaryState = HEALTHY_CANARY;
    let s = nextCanaryHealth(st, kq("TIMEOUT"), NOW);
    expect(s.alert).toBeNull();
    st = s.state;
    s = nextCanaryHealth(st, kq("ERROR"), NOW);
    expect(s.alert).toBeNull();
    st = s.state;
    s = nextCanaryHealth(st, kq("TIMEOUT"), NOW);
    expect(s.alert?.kind).toBe("loi_lien_tiep");
    expect(s.alert?.consecutiveBad).toBe(3);
    st = s.state;
    s = nextCanaryHealth(st, kq("TIMEOUT"), NOW);
    expect(s.alert).toBeNull();
  });

  it("đang chuỗi TIMEOUT chưa báo, gặp WAF_BLOCKED → báo chan ngay", () => {
    const st: CanaryState = { lastVerdict: "TIMEOUT", consecutiveBad: 1, alerted: false, since: NOW };
    expect(nextCanaryHealth(st, kq("WAF_BLOCKED", 403), NOW).alert?.kind).toBe("chan");
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/sync-worker && npx vitest run test/unit/canaryHealth.test.ts`
Expected: FAIL — không tìm thấy `../../src/canaryHealth`.

- [ ] **Step 3: Hiện thực `canaryHealth.ts`**

Tạo `apps/sync-worker/src/canaryHealth.ts`:

```ts
// U43 — Máy trạng thái canary lối vào GDT (THUẦN, không I/O, test offline).
// Khác probe egress (health.ts: mọi verdict xấu đều cần 3 tick): WAF_BLOCKED và DRIFT là tín
// hiệu XÁC ĐỊNH (thân phản hồi/mã HTTP nói rõ) → báo ngay lần đầu; TIMEOUT/ERROR là nhiễu
// mạng → giữ ngưỡng 3. Đã báo thì im tới khi hồi phục (một OK) → báo "đã thông lại".
// Lần chạy đầu tiên (chưa có trạng thái trong DO) + OK → tin "đã bật" một lần: kiểm CÁI
// CHUÔNG ngay khi deploy, không đợi sự cố thật để biết Telegram có nối hay không.
import type { CanaryResult, CanaryVerdict } from "@vat/gdt-client";

export const CANARY_BAD_STREAK_THRESHOLD = 3;

export interface CanaryState {
  lastVerdict?: CanaryVerdict;
  /** Số verdict ≠ OK liên tiếp. */
  consecutiveBad: number;
  /** Đã phát cảnh báo cho đợt xấu hiện tại chưa (chống spam). */
  alerted: boolean;
  /** ISO thời điểm bắt đầu đợt xấu hiện tại. */
  since?: string;
}

export const HEALTHY_CANARY: CanaryState = { consecutiveBad: 0, alerted: false };

export type CanaryAlertKind = "bat_giam_sat" | "chan" | "drift" | "loi_lien_tiep" | "hoi_phuc";

export interface CanaryAlert {
  kind: CanaryAlertKind;
  result: CanaryResult;
  consecutiveBad: number;
}

export interface CanaryStep {
  state: CanaryState;
  alert: CanaryAlert | null;
}

const XAC_DINH: ReadonlySet<CanaryVerdict> = new Set(["WAF_BLOCKED", "DRIFT"]);

export function nextCanaryHealth(
  prev: CanaryState | undefined,
  result: CanaryResult,
  nowIso: string,
): CanaryStep {
  const verdict = result.verdict;
  const khoe: CanaryState = { lastVerdict: "OK", consecutiveBad: 0, alerted: false };

  if (verdict === "OK") {
    if (prev === undefined) return { state: khoe, alert: { kind: "bat_giam_sat", result, consecutiveBad: 0 } };
    if (prev.alerted) return { state: khoe, alert: { kind: "hoi_phuc", result, consecutiveBad: 0 } };
    return { state: khoe, alert: null };
  }

  const truoc = prev ?? HEALTHY_CANARY;
  const consecutiveBad = truoc.consecutiveBad + 1;
  const since = truoc.since ?? nowIso;
  let kind: CanaryAlertKind | null = null;
  if (!truoc.alerted) {
    if (XAC_DINH.has(verdict)) kind = verdict === "WAF_BLOCKED" ? "chan" : "drift";
    else if (consecutiveBad >= CANARY_BAD_STREAK_THRESHOLD) kind = "loi_lien_tiep";
  }
  return {
    state: { lastVerdict: verdict, consecutiveBad, alerted: truoc.alerted || kind !== null, since },
    alert: kind ? { kind, result, consecutiveBad } : null,
  };
}
```

- [ ] **Step 4: Chạy để thấy xanh**

Run: `cd apps/sync-worker && npx vitest run test/unit/canaryHealth.test.ts`
Expected: PASS (8 test).

- [ ] **Step 5: Viết test đỏ cho `isEgressBlocked` với `WAF_BLOCKED`**

Thêm vào `apps/sync-worker/test/unit/health.test.ts` (trong `describe` của `isEgressBlocked`, hoặc tạo `describe("isEgressBlocked — WAF")` mới):

```ts
  // QĐ-6 (U43): WAF chặn cả endpoint công khai = mọi thứ đã bị chặn → không enqueue (không
  // thử dồn), nhưng KHÔNG chuyển relay (chặn theo header, relay cũng chết y hệt).
  it("WAF_BLOCKED cũng chặn enqueue như GEO_BLOCKED", () => {
    expect(isEgressBlocked({ consecutiveBad: 3, alerted: true, lastVerdict: "WAF_BLOCKED" })).toBe(true);
    expect(isEgressBlocked({ consecutiveBad: 3, alerted: true, lastVerdict: "GEO_BLOCKED" })).toBe(true);
    expect(isEgressBlocked({ consecutiveBad: 3, alerted: true, lastVerdict: "TIMEOUT" })).toBe(false);
  });
```

(Nếu file chưa import `isEgressBlocked`, thêm vào import từ `../../src/health`.)

- [ ] **Step 6: Chạy để thấy đỏ**

Run: `cd apps/sync-worker && npx vitest run test/unit/health.test.ts`
Expected: FAIL — `WAF_BLOCKED` trả `false`.

- [ ] **Step 7: Sửa `health.ts`**

Thay `isEgressBlocked` trong `apps/sync-worker/src/health.ts`:

```ts
/** H-B.6 — egress đang bị CHẶN theo verdict gần nhất: GEO_BLOCKED (403/451 địa lý) hoặc
 * WAF_BLOCKED (U43, 2026-09-24: 403 + chữ ký WAF — chặn theo header). Cả hai đều = "gọi
 * thêm chỉ nhồi DLQ". RATE_LIMITED do backpressure H-B.4 xử; TIMEOUT/ERROR không gate. */
export function isEgressBlocked(state: HealthState): boolean {
  return state.lastVerdict === "GEO_BLOCKED" || state.lastVerdict === "WAF_BLOCKED";
}
```

Sửa dòng log gate trong `apps/sync-worker/src/index.ts`: `console.warn("[GATE] egress GEO_BLOCKED — skip cron enqueue");` → ``console.warn(`[GATE] egress ${health.lastVerdict} — skip cron enqueue`);``

- [ ] **Step 8: Chạy để thấy xanh + tsc**

Run: `cd apps/sync-worker && npx vitest run test/unit/health.test.ts test/unit/canaryHealth.test.ts test/unit/egressProbe.test.ts && npx tsc --noEmit`
Expected: PASS; tsc sạch.

- [ ] **Step 9: Commit**

```bash
git add apps/sync-worker/src/canaryHealth.ts apps/sync-worker/src/health.ts apps/sync-worker/src/index.ts apps/sync-worker/test/unit/canaryHealth.test.ts apps/sync-worker/test/unit/health.test.ts
git commit -m "feat(sync-worker): máy trạng thái canary GDT + WAF_BLOCKED cũng chặn enqueue"
```

---

### Task 5: `apps/sync-worker` — DO lưu canary, `runCanary`, sink Telegram, cron mỗi giờ

**Files:**
- Create: `apps/sync-worker/src/canary.ts`
- Create: `apps/sync-worker/src/canhBao.ts`
- Modify: `apps/sync-worker/src/egressHealth.ts`
- Modify: `apps/sync-worker/src/deps.ts:45-75`
- Modify: `apps/sync-worker/src/index.ts` (cron + nhánh `scheduled`)
- Modify: `apps/sync-worker/src/types.ts` (Env)
- Modify: `apps/sync-worker/wrangler.jsonc` (crons)
- Test: `apps/sync-worker/test/unit/canary.test.ts`, `apps/sync-worker/test/unit/canhBao.test.ts` (tạo mới)

**Interfaces:**
- Consumes: `canaryAuthenticate`, `CanaryResult`, `GdtTransport` từ `@vat/gdt-client`; `nextCanaryHealth`, `CanaryState`, `CanaryAlert` từ `./canaryHealth`; `kiemTraCauHinhTelegram`, `guiTinTelegram`, `soanTinGiamSatGdt`, `SuKienGiamSatGdt`, `KetQuaThongBao` từ `@vat/thong-bao`; `HealthAlert`, `ProbeResult` từ probe.
- Produces: `interface CanaryDeps { transport: GdtTransport; loadCanary(): Promise<CanaryState | undefined>; saveCanary(s: CanaryState): Promise<void>; emitCanaryAlert(alert: CanaryAlert): Promise<void> | void; now?: () => Date }`; `runCanary(deps): Promise<{ verdict: CanaryVerdict; alerted: boolean }>`; `guiCanhBaoTelegram(env: EnvTelegram, sk: SuKienGiamSatGdt): Promise<KetQuaThongBao>` với `EnvTelegram = { TELEGRAM_BOT_TOKEN?: string; TELEGRAM_CHAT_ID?: string }`; `egressHealthClient(ns)` thêm `loadCanary()/saveCanary()`; `CANARY_CRON = "0 * * * *"`.

- [ ] **Step 1: Viết test đỏ cho `runCanary`**

Tạo `apps/sync-worker/test/unit/canary.test.ts`:

```ts
// U43 — Điều phối canary (unit, offline, DI): canaryAuthenticate qua transport → máy trạng
// thái → lưu DO → phát cảnh báo. Không được ném làm chết cron; lỗi bất ngờ = ERROR.
import type { GdtTransport } from "@vat/gdt-client";
import { describe, expect, it, vi } from "vitest";
import { type CanaryDeps, runCanary } from "../../src/canary";
import type { CanaryState } from "../../src/canaryHealth";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Transport giả: captcha OK, authenticate trả theo kịch bản. */
function transportGia(auth: () => Response | Promise<Response>): GdtTransport {
  return {
    name: "mock",
    async fetch(url) {
      if (url.endsWith("/api/captcha")) return json(200, { key: "ck", content: "<svg/>" });
      return auth();
    },
    async probe() {
      throw new Error("không dùng");
    },
  };
}

function makeDeps(transport: GdtTransport, prev: CanaryState | undefined) {
  let saved: CanaryState | undefined = prev;
  const emitCanaryAlert = vi.fn();
  const deps: CanaryDeps = {
    transport,
    loadCanary: async () => saved,
    saveCanary: async (s) => {
      saved = s;
    },
    emitCanaryAlert,
    now: () => new Date("2026-09-24T05:00:00.000Z"),
  };
  return { deps, emitCanaryAlert, getSaved: () => saved };
}

describe("runCanary", () => {
  it("lần đầu + 401 → verdict OK, lưu state khỏe, alert bat_giam_sat", async () => {
    const { deps, emitCanaryAlert, getSaved } = makeDeps(
      transportGia(() => json(401, { message: "Mã captcha không đúng." })),
      undefined,
    );
    const out = await runCanary(deps);
    expect(out).toEqual({ verdict: "OK", alerted: true });
    expect(emitCanaryAlert).toHaveBeenCalledWith(expect.objectContaining({ kind: "bat_giam_sat" }));
    expect(getSaved()).toEqual({ lastVerdict: "OK", consecutiveBad: 0, alerted: false });
  });

  it("403 WAF khi đang khỏe → alert chan kèm httpStatus 403 + thông điệp GDT", async () => {
    const { deps, emitCanaryAlert } = makeDeps(
      transportGia(() =>
        json(403, { message: "Hệ thống phát hiện hành vi không hợp lệ. Yêu cầu đã bị chặn." }),
      ),
      { consecutiveBad: 0, alerted: false, lastVerdict: "OK" },
    );
    await runCanary(deps);
    const alert = emitCanaryAlert.mock.calls[0]?.[0];
    expect(alert.kind).toBe("chan");
    expect(alert.result.httpStatus).toBe(403);
    expect(alert.result.message).toContain("hành vi không hợp lệ");
  });

  it("emitCanaryAlert ném lỗi (Telegram sập) → runCanary KHÔNG ném, state VẪN đã lưu", async () => {
    const { deps, getSaved } = makeDeps(
      transportGia(() => json(403, { message: "Hệ thống phát hiện hành vi không hợp lệ." })),
      { consecutiveBad: 0, alerted: false, lastVerdict: "OK" },
    );
    deps.emitCanaryAlert = () => {
      throw new Error("telegram chết");
    };
    await expect(runCanary(deps)).resolves.toEqual({ verdict: "WAF_BLOCKED", alerted: true });
    expect(getSaved()?.alerted).toBe(true);
  });

  it("transport ném lỗi lạ → verdict ERROR, không ném ra ngoài", async () => {
    const transport: GdtTransport = {
      name: "mock",
      fetch: async () => {
        throw new Error("nổ");
      },
      probe: async () => {
        throw new Error("không dùng");
      },
    };
    const { deps } = makeDeps(transport, { consecutiveBad: 0, alerted: false });
    await expect(runCanary(deps)).resolves.toEqual({ verdict: "ERROR", alerted: false });
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/sync-worker && npx vitest run test/unit/canary.test.ts`
Expected: FAIL — không tìm thấy `../../src/canary`.

- [ ] **Step 3: Hiện thực `canary.ts`**

Tạo `apps/sync-worker/src/canary.ts`:

```ts
// U43 — Điều phối canary lối vào GDT (cron mỗi giờ). Cùng khuôn egressProbe.ts: mọi I/O
// tiêm qua deps (transport, DO load/save, sink cảnh báo) để test offline; KHÔNG được ném
// làm chết cron — lỗi bất ngờ ở đâu cũng quy về verdict ERROR / log, tick sau vẫn chạy.
import { type CanaryResult, type CanaryVerdict, type GdtTransport, canaryAuthenticate } from "@vat/gdt-client";
import { type CanaryAlert, type CanaryState, nextCanaryHealth } from "./canaryHealth";

export interface CanaryDeps {
  transport: GdtTransport;
  loadCanary(): Promise<CanaryState | undefined>;
  saveCanary(state: CanaryState): Promise<void>;
  emitCanaryAlert(alert: CanaryAlert): Promise<void> | void;
  /** Tiêm đồng hồ để test xác định; mặc định Date thật. */
  now?: () => Date;
}

export interface CanaryOutcome {
  verdict: CanaryVerdict;
  alerted: boolean;
}

export async function runCanary(deps: CanaryDeps): Promise<CanaryOutcome> {
  let result: CanaryResult;
  try {
    result = await canaryAuthenticate(deps.transport);
  } catch (err) {
    // canaryAuthenticate đã tự phân loại mọi lỗi; try/catch này là phòng thủ cuối.
    result = {
      verdict: "ERROR",
      message: err instanceof Error ? err.message : String(err),
      latencyMs: 0,
    };
  }

  const prev = await deps.loadCanary();
  const step = nextCanaryHealth(prev, result, (deps.now?.() ?? new Date()).toISOString());
  // LƯU TRƯỚC, báo sau: sink cảnh báo hỏng không được làm mất trạng thái (nếu không, tick
  // sau lại tưởng "lần đầu" và báo lặp).
  await deps.saveCanary(step.state);
  if (step.alert) {
    try {
      await deps.emitCanaryAlert(step.alert);
    } catch (err) {
      console.error(
        JSON.stringify({
          level: "ERROR",
          event: "canary_alert_sink_failed",
          kind: step.alert.kind,
          reason: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }
  return { verdict: result.verdict, alerted: step.alert !== null };
}
```

- [ ] **Step 4: Chạy để thấy xanh**

Run: `cd apps/sync-worker && npx vitest run test/unit/canary.test.ts`
Expected: PASS (4 test).

- [ ] **Step 5: Viết test đỏ cho `guiCanhBaoTelegram`**

Tạo `apps/sync-worker/test/unit/canhBao.test.ts`:

```ts
// U43 — Sink Telegram cho cảnh báo giám sát: FAIL-SILENT (thiếu cấu hình/Telegram sập →
// không ném), nội dung KHÔNG chứa bot token, gọi đúng endpoint sendMessage.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guiCanhBaoTelegram } from "../../src/canhBao";

const fetchGia = vi.fn();
const ENV = { TELEGRAM_BOT_TOKEN: "123456:TOKEN_GIA", TELEGRAM_CHAT_ID: "-100123" };
const SU_KIEN = {
  loai: "chan" as const,
  verdict: "WAF_BLOCKED",
  httpStatus: 403,
  message: "Hệ thống phát hiện hành vi không hợp lệ.",
  thoiDiem: new Date("2026-09-24T05:00:00.000Z"),
};

beforeEach(() => {
  fetchGia.mockReset();
  vi.stubGlobal("fetch", fetchGia);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("guiCanhBaoTelegram", () => {
  it("đủ cấu hình → POST sendMessage với chat_id + nội dung tin; trả daGui true", async () => {
    fetchGia.mockResolvedValue(new Response("{}", { status: 200 }));
    const kq = await guiCanhBaoTelegram(ENV, SU_KIEN);
    expect(kq).toEqual({ daGui: true });
    const [url, init] = fetchGia.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/sendMessage");
    const body = JSON.parse(String(init.body));
    expect(body.chat_id).toBe("-100123");
    expect(body.text).toContain("GDT đang CHẶN");
    expect(body.text).not.toContain("TOKEN_GIA");
  });

  it("thiếu cấu hình → chua_cau_hinh, không gọi mạng, không ném", async () => {
    const kq = await guiCanhBaoTelegram({}, SU_KIEN);
    expect(kq).toEqual({ daGui: false, lyDo: "chua_cau_hinh" });
    expect(fetchGia).not.toHaveBeenCalled();
  });

  it("Telegram trả 400 → telegram_tu_choi, không ném", async () => {
    fetchGia.mockResolvedValue(new Response("{}", { status: 400 }));
    await expect(guiCanhBaoTelegram(ENV, SU_KIEN)).resolves.toEqual({
      daGui: false,
      lyDo: "telegram_tu_choi",
    });
  });

  it("mạng hỏng → khong_goi_duoc, không ném", async () => {
    fetchGia.mockRejectedValue(new Error("ECONNRESET"));
    await expect(guiCanhBaoTelegram(ENV, SU_KIEN)).resolves.toEqual({
      daGui: false,
      lyDo: "khong_goi_duoc",
    });
  });
});
```

- [ ] **Step 6: Chạy để thấy đỏ**

Run: `cd apps/sync-worker && npx vitest run test/unit/canhBao.test.ts`
Expected: FAIL — không tìm thấy `../../src/canhBao`.

- [ ] **Step 7: Hiện thực `canhBao.ts`**

Tạo `apps/sync-worker/src/canhBao.ts`:

```ts
// U43 — Đưa cảnh báo giám sát tới NGƯỜI THẬT qua Telegram (@vat/thong-bao). FAIL-SILENT có
// log: thiếu cấu hình hay Telegram sập thì cron vẫn sống, nhưng log nói RÕ vì sao không gửi.
import {
  type KetQuaThongBao,
  type SuKienGiamSatGdt,
  guiTinTelegram,
  kiemTraCauHinhTelegram,
  soanTinGiamSatGdt,
} from "@vat/thong-bao";

export interface EnvTelegram {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
}

export async function guiCanhBaoTelegram(
  env: EnvTelegram,
  sk: SuKienGiamSatGdt,
): Promise<KetQuaThongBao> {
  const ch = kiemTraCauHinhTelegram(env);
  if (!ch.ok) {
    console.warn(`[canhBao] Telegram TẮT — thiếu: ${ch.thieu.join(", ")}`);
    return { daGui: false, lyDo: "chua_cau_hinh" };
  }
  const kq = await guiTinTelegram(ch.cauHinh, soanTinGiamSatGdt(sk));
  if (!kq.daGui) console.warn(`[canhBao] không gửi được Telegram: ${kq.lyDo}`);
  return kq;
}
```

- [ ] **Step 8: Chạy để thấy xanh**

Run: `cd apps/sync-worker && npx vitest run test/unit/canhBao.test.ts`
Expected: PASS (4 test).

- [ ] **Step 9: DO lưu trạng thái canary**

Trong `apps/sync-worker/src/egressHealth.ts`:

Thêm hằng và import:

```ts
import type { CanaryState } from "./canaryHealth";

const STATE_KEY = "state";
const CANARY_KEY = "canary"; // U43 — trạng thái canary, cùng DO singleton, khoá riêng.
```

Thêm vào `fetch()` của class `EgressHealth`, trước dòng `return new Response("not found", …)`:

```ts
    if (url.pathname === "/canary/load") {
      const stored = await this.ctx.storage.get<CanaryState>(CANARY_KEY);
      // null (không phải undefined) để JSON chở được "chưa có" — client đổi lại thành undefined.
      return Response.json(stored ?? null);
    }
    if (url.pathname === "/canary/save") {
      const state = (await req.json()) as CanaryState;
      await this.ctx.storage.put(CANARY_KEY, state);
      return Response.json({ ok: true });
    }
```

Thêm vào object trả về của `egressHealthClient(ns)`:

```ts
    async loadCanary(): Promise<CanaryState | undefined> {
      const res = await stub.fetch("https://egress-health/canary/load");
      const stored = (await res.json()) as CanaryState | null;
      return stored ?? undefined;
    },
    async saveCanary(state: CanaryState): Promise<void> {
      await stub.fetch("https://egress-health/canary/save", {
        method: "POST",
        body: JSON.stringify(state),
      });
    },
```

- [ ] **Step 10: Env, deps, cron**

`apps/sync-worker/src/types.ts` — thêm vào `interface Env` (sau `TOKEN_KEK`):

```ts
  // U43 — kênh báo người thật (Telegram) cho cảnh báo giám sát GDT. Workers Secret, CÙNG
  // giá trị với vat-api; thiếu ⇒ chỉ log (fail-silent có log), không ném.
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
```

`apps/sync-worker/src/deps.ts` — thay `makeEgressProbeDeps` và thêm `makeCanaryDeps`:

```ts
import { guiCanhBaoTelegram } from "./canhBao";
import type { CanaryDeps } from "./canary";

/** GIÁM SÁT (mục C) — deps cho probe egress. Sink = log CRITICAL (Workers observability)
 * VÀ Telegram (U43, tới người thật). Sự kiện TOÀN HỆ THỐNG → KHÔNG audit_log (tenant-scoped).
 * Chỉ metadata vận hành, KHÔNG token/secret (security.md). */
export function makeEgressProbeDeps(env: Env): EgressProbeDeps {
  return {
    transport,
    ...egressHealthClient(env.EGRESS_HEALTH),
    async emitAlert(alert, result) {
      console.error(
        JSON.stringify({
          level: "CRITICAL",
          event: "egress_probe_alert",
          transport: result.transport,
          verdict: alert.verdict,
          consecutiveBad: alert.consecutiveBad,
          httpStatus: result.httpStatus,
          egressCountry: result.egressCountry,
          latencyMs: result.latencyMs,
        }),
      );
      await guiCanhBaoTelegram(env, {
        loai: "egress",
        verdict: alert.verdict,
        httpStatus: result.httpStatus,
        consecutiveBad: alert.consecutiveBad,
        egressCountry: result.egressCountry,
        thoiDiem: new Date(),
      });
    },
  };
}

/** U43 — deps cho canary lối vào GDT (cron mỗi giờ). Cùng transport T0, cùng DO EgressHealth. */
export function makeCanaryDeps(env: Env): CanaryDeps {
  const health = egressHealthClient(env.EGRESS_HEALTH);
  return {
    transport,
    loadCanary: health.loadCanary,
    saveCanary: health.saveCanary,
    async emitCanaryAlert(alert) {
      console.error(
        JSON.stringify({
          level: alert.kind === "bat_giam_sat" || alert.kind === "hoi_phuc" ? "INFO" : "CRITICAL",
          event: "gdt_canary_alert",
          kind: alert.kind,
          verdict: alert.result.verdict,
          httpStatus: alert.result.httpStatus,
          consecutiveBad: alert.consecutiveBad,
          latencyMs: alert.result.latencyMs,
        }),
      );
      await guiCanhBaoTelegram(env, {
        loai: alert.kind,
        verdict: alert.result.verdict,
        httpStatus: alert.result.httpStatus,
        message: alert.result.message,
        consecutiveBad: alert.consecutiveBad,
        thoiDiem: new Date(),
      });
    },
  };
}
```

`apps/sync-worker/src/index.ts`:

- Import: thêm `makeCanaryDeps` vào import từ `./deps`; thêm `import { runCanary } from "./canary";`.
- Sau `const EGRESS_PROBE_CRON = "*/15 * * * *";` thêm:

```ts
// U43 — canary lối vào GDT mỗi giờ (captcha thật + authenticate MST giả, không retry).
// Tách khỏi probe 15' vì đây là 2 request tới endpoint đăng nhập — giữ nhịp thấp (QĐ-4).
const CANARY_CRON = "0 * * * *";
```

- Trong `scheduled()`, ngay sau nhánh `EGRESS_PROBE_CRON`:

```ts
    if (event.cron === CANARY_CRON) {
      await runCanary(makeCanaryDeps(env));
      return;
    }
```

`apps/sync-worker/wrangler.jsonc`: `"triggers": { "crons": ["0 20 * * *", "*/15 * * * *"] }` → `"triggers": { "crons": ["0 20 * * *", "*/15 * * * *", "0 * * * *"] }` và thêm dòng chú thích ngay trên: `//  - "0 * * * *" (mỗi giờ): U43 canary lối vào GDT — 1 captcha + 1 authenticate MST giả, không retry; WAF_BLOCKED/DRIFT → Telegram ngay.` (Giới hạn 250 cron/tài khoản trên Workers Paid — tài liệu Cloudflare đọc 2026-09-24.)

`apps/sync-worker/vitest.config.ts`: không thêm gì vào `exclude` (`canary.ts`, `canhBao.ts`, `canaryHealth.ts` đều có test).

- [ ] **Step 11: Kiểm toàn bộ sync-worker unit + tsc + lint**

Run: `cd apps/sync-worker && npx vitest run --dir test/unit && npx tsc --noEmit && cd ../.. && npx biome check apps/sync-worker`
Expected: PASS; tsc sạch; Biome sạch.

- [ ] **Step 12: Commit**

```bash
git add apps/sync-worker/src/canary.ts apps/sync-worker/src/canhBao.ts apps/sync-worker/src/egressHealth.ts apps/sync-worker/src/deps.ts apps/sync-worker/src/index.ts apps/sync-worker/src/types.ts apps/sync-worker/wrangler.jsonc apps/sync-worker/test/unit/canary.test.ts apps/sync-worker/test/unit/canhBao.test.ts
git commit -m "feat(sync-worker): cron canary GDT mỗi giờ, trạng thái trong DO, cảnh báo Telegram cho canary + probe egress"
```

---

### Task 6: `apps/api` — login thuế gặp WAF → `503 gdt_chan` + audit `waf_blocked`; cập nhật BINDING_MAP

**Files:**
- Modify: `apps/api/src/routes/taxAccounts.ts:339-354`
- Modify: `docs/06-BINDING_MAP.md` (dòng route login thuế, mục 3b.4, mục ánh xạ mã lỗi)
- Test: `apps/api/test/integration/taxAccounts.login.test.ts`

**Interfaces:**
- Consumes: `isWafBlocked` từ `@vat/gdt-client` (Task 1).
- Produces: hợp đồng HTTP `503 {"error":"gdt_chan"}`; audit `dang_nhap_thue_that_bai` với `chiTiet.reason = "waf_blocked"`.

- [ ] **Step 1: Viết test đỏ**

Thêm vào `apps/api/test/integration/taxAccounts.login.test.ts` (trong `describe` chính), sau ca "GDT trả 401 …":

```ts
  // U43: WAF GDT chặn (403 + chữ ký) ≠ sai captcha. Trả mã riêng để web nói đúng và người
  // dùng KHÔNG thử đi thử lại (mỗi lượt lại đập vào WAF). Audit ghi lý do ngắn `waf_blocked`.
  it("WAF chặn (403 + chữ ký) → 503 gdt_chan, KHÔNG lưu token, audit reason waf_blocked", async () => {
    const wafTransport = makeTransport({
      fetch: async () =>
        new Response(
          JSON.stringify({
            status: 403,
            message: "Hệ thống phát hiện hành vi không hợp lệ. Yêu cầu đã bị chặn.",
          }),
          { status: 403, headers: { "content-type": "application/json" } },
        ),
    });
    const app = createApp(injectDb(db, undefined, wafTransport));
    const jwt = await tokenFor(tenantA, { role: "quan_tri" });
    const res = await app.request(`/tax-accounts/${accId}/login`, loginReq(accId, jwt), makeEnv());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "gdt_chan" });
    const [acc] = await db.select().from(taiKhoanThue).where(eq(taiKhoanThue.id, accId));
    expect(acc?.tokenHienTai).toBeNull();
    const rows = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.doiTuong, accId), eq(auditLog.hanhDong, "dang_nhap_thue_that_bai")));
    expect(rows.length).toBe(1);
    expect((rows[0]?.chiTiet as { reason?: string }).reason).toBe("waf_blocked");
  });

  it("403 KHÔNG chữ ký WAF → vẫn 422 gdt_tu_choi (không hồi quy)", async () => {
    const badTransport = makeTransport({
      fetch: async () =>
        new Response(JSON.stringify({ message: "Forbidden" }), {
          status: 403,
          headers: { "content-type": "application/json" },
        }),
    });
    const app = createApp(injectDb(db, undefined, badTransport));
    const jwt = await tokenFor(tenantA, { role: "quan_tri" });
    const res = await app.request(`/tax-accounts/${accId}/login`, loginReq(accId, jwt), makeEnv());
    expect(res.status).toBe(422);
  });
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/api && npx vitest run test/integration/taxAccounts.login.test.ts`
Expected: FAIL — ca WAF nhận 422.

- [ ] **Step 3: Hiện thực**

Trong `apps/api/src/routes/taxAccounts.ts`, thêm `isWafBlocked` vào import từ `@vat/gdt-client`:

```ts
import {
  GdtContractDriftError,
  GdtError,
  authenticate,
  deriveTokenExpiry,
  getCaptcha,
  isWafBlocked,
} from "@vat/gdt-client";
```

Thay khối `catch (err)` của lời gọi `authenticate` (từ dòng `// Lệch hợp đồng API thuế…` tới `return c.json({ error: "gdt_tu_choi" }, 422);`) bằng:

```ts
      } catch (err) {
        // Lệch hợp đồng API thuế ≠ GDT từ chối nghiệp vụ — phải lộ ra, không được nuốt thành 422.
        if (err instanceof GdtContractDriftError) throw err;
        // U43 — WAF GDT chặn (403 + chữ ký, kiểm chứng 2026-09-24) ≠ sai captcha: trả 503
        // `gdt_chan` để web nói đúng và người dùng không thử dồn. Audit lý do NGẮN
        // `waf_blocked` (không chép thông điệp dài). Không gửi Telegram từ đây — tầng API
        // stateless không chống lặp được; canary ở sync-worker là đường báo (≤ 1 giờ).
        const wafChan = isWafBlocked(err);
        // Audit thất bại (mask), rồi mã lỗi gọn. Không phân biệt sai captcha vs mật khẩu.
        // KHÔNG trả 401: apps/web coi mọi 401 là "phiên ứng dụng hết hạn" và đăng xuất
        // (apiClient.onUnauthorized); phiên ứng dụng ở đây vẫn hợp lệ — chỉ GDT từ chối.
        // Cùng lệ với 409 `token_het_han` ở /sync: lỗi phía GDT không mượn mã 401.
        await withTenant(db, tenantId, async (tx) => {
          await tx.insert(auditLog).values({
            tenantId,
            hanhDong: "dang_nhap_thue_that_bai",
            doiTuong: id,
            chiTiet: maskSensitive({
              reason: wafChan ? "waf_blocked" : err instanceof GdtError ? err.message : "loi",
            }),
          });
        });
        if (wafChan) return c.json({ error: "gdt_chan" }, 503);
        return c.json({ error: "gdt_tu_choi" }, 422);
      }
```

Sửa chú thích đầu route (dòng "// MÃ HÓA. 409 nếu chưa ủy quyền. 422 `gdt_tu_choi` …") thêm: `503 \`gdt_chan\` nếu WAF GDT chặn (U43).`

- [ ] **Step 4: Chạy để thấy xanh**

Run: `cd apps/api && npx vitest run test/integration/taxAccounts.login.test.ts && npx tsc --noEmit`
Expected: PASS (9 test); tsc sạch.

- [ ] **Step 5: Cập nhật `docs/06-BINDING_MAP.md`**

- Dòng route `POST /tax-accounts/:id/login`: sau `**\`422 gdt_tu_choi\`** GDT từ chối (…)` thêm ` · **\`503 gdt_chan\`** WAF GDT chặn (U43 — web báo "đang chặn, kỹ thuật đã được báo", KHÔNG xin captcha lại)`.
- Mục 3b.4 (đăng nhập GDT): thêm dòng `- \`503 gdt_chan\` → GDT đang chặn yêu cầu từ hệ thống (WAF) → báo đúng, giữ captcha, không thử dồn; canary ở sync-worker sẽ báo Telegram.`
- Mục "Ánh xạ mã lỗi → hành vi": thêm ` · \`503 gdt_chan\`→(login thuế) GDT chặn, báo tại chỗ, giữ captcha`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/taxAccounts.ts apps/api/test/integration/taxAccounts.login.test.ts docs/06-BINDING_MAP.md
git commit -m "feat(api): login thuế gặp WAF GDT → 503 gdt_chan + audit waf_blocked"
```

---

### Task 7: `apps/web` — bốn nhánh thông điệp ở màn Kết nối tài khoản thuế + changelog

**Files:**
- Modify: `apps/web/src/features/taxAccounts/TaxAccountsPage.tsx` (hàm `LoginStep`, phần `useMutation` + `loginError`)
- Modify: `apps/web/src/lib/changelog.ts`
- Test: `apps/web/test/features/taxAccounts.test.tsx`

**Interfaces:**
- Consumes: `ApiError { status, code }` từ `apps/web/src/lib/apiClient.ts`; hợp đồng `422 gdt_tu_choi`, `503 gdt_chan` (Task 6).
- Produces: hàm nội bộ `thongDiepLoiDangNhapThue(err: unknown): string | null`.

- [ ] **Step 1: Viết test đỏ**

Thêm vào `apps/web/test/features/taxAccounts.test.tsx`, ngay sau ca "(e) GDT từ chối (422 …)":

```ts
  // U43: WAF GDT chặn → nói đúng sự thật, KHÔNG dụ nhập lại captcha (mỗi lượt lại đập WAF).
  it("(f) GDT chặn (503 gdt_chan) → báo 'đang chặn', vẫn ở trang, KHÔNG xin captcha mới", async () => {
    calls = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/me"))
        return json(200, {
          ten: "DN",
          mst: "0311772540",
          goiDichVu: null,
          banQuyen: "Mặc định",
          ghiChu: null,
          role: "quan_tri",
        });
      calls.push({ url, method });
      if (url.includes("/captcha"))
        return json(200, { key: "ck", content: '<svg id="cap"><text>7K9P2</text></svg>' });
      if (url.includes("/login")) return json(503, { error: "gdt_chan" });
      return json(200, [expired]);
    });
    renderWithProviders(<AppRouter />, "/tax-accounts");
    await screen.findByAltText(/captcha/i);
    await userEvent.type(screen.getByLabelText("Mật khẩu thuế"), "matkhauthue");
    await userEvent.type(screen.getByLabelText("Mã captcha"), "7K9P2");
    await userEvent.click(screen.getByRole("button", { name: "Đăng nhập Tổng cục Thuế" }));
    expect(await screen.findByText(/Tổng cục Thuế đang chặn yêu cầu/)).toBeInTheDocument();
    expect(screen.queryByText(/Captcha hoặc mật khẩu không đúng/)).toBeNull();
    expect(screen.queryByLabelText("Email công việc")).toBeNull();
    // Captcha KHÔNG bị xin lại: vẫn đúng 1 lượt GET /captcha.
    expect(calls.filter((c) => c.url.includes("/captcha")).length).toBe(1);
  });

  it("(g) mất mạng khi đăng nhập GDT → 'Không kết nối được với Tổng cục Thuế'", async () => {
    calls = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/me"))
        return json(200, {
          ten: "DN",
          mst: "0311772540",
          goiDichVu: null,
          banQuyen: "Mặc định",
          ghiChu: null,
          role: "quan_tri",
        });
      calls.push({ url, method: init?.method ?? "GET" });
      if (url.includes("/captcha"))
        return json(200, { key: "ck", content: '<svg id="cap"><text>7K9P2</text></svg>' });
      if (url.includes("/login")) throw new TypeError("Failed to fetch");
      return json(200, [expired]);
    });
    renderWithProviders(<AppRouter />, "/tax-accounts");
    await screen.findByAltText(/captcha/i);
    await userEvent.type(screen.getByLabelText("Mật khẩu thuế"), "matkhauthue");
    await userEvent.type(screen.getByLabelText("Mã captcha"), "7K9P2");
    await userEvent.click(screen.getByRole("button", { name: "Đăng nhập Tổng cục Thuế" }));
    expect(await screen.findByText(/Không kết nối được với Tổng cục Thuế/)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/web && npx vitest run test/features/taxAccounts.test.tsx`
Expected: FAIL — (f) và (g) hiện "Captcha hoặc mật khẩu không đúng".

- [ ] **Step 3: Hiện thực trong `TaxAccountsPage.tsx`**

Thêm hàm ở cấp module (trên `function LoginStep`):

```ts
/**
 * Thông điệp lỗi đăng nhập GDT theo hợp đồng docs/06-BINDING_MAP.md (U43): nói đúng sự thật
 * để người dùng làm đúng việc — sai captcha thì nhập lại, GDT chặn thì ĐỪNG thử dồn.
 */
function thongDiepLoiDangNhapThue(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  if (err.status === 409) return "Chưa ủy quyền. Vui lòng thực hiện bước ủy quyền trước.";
  if (err.status === 422)
    return "Captcha hoặc mật khẩu không đúng. Vui lòng nhập lại với captcha mới.";
  if (err.status === 503 && err.code === "gdt_chan")
    return "Tổng cục Thuế đang chặn yêu cầu từ hệ thống. Kỹ thuật đã được báo, vui lòng thử lại sau.";
  return "Không kết nối được với Tổng cục Thuế. Vui lòng thử lại sau.";
}
```

Trong `LoginStep`, thay `onError` của `useMutation`:

```ts
    onError: (err) => {
      setCvalue("");
      // CHỈ xin captcha mới khi GDT đã tiêu captcha cũ (422 sai captcha/mật khẩu). Bị chặn
      // (503) hay mất mạng thì captcha còn nguyên — xin lại chỉ tạo thêm request vô ích.
      if (err instanceof ApiError && err.status === 422) captcha.refetch();
    },
```

Thay khai báo `loginError`:

```ts
  const loginError = thongDiepLoiDangNhapThue(login.error);
```

- [ ] **Step 4: Chạy để thấy xanh**

Run: `cd apps/web && npx vitest run test/features/taxAccounts.test.tsx && npx tsc --noEmit`
Expected: PASS (12 test, gồm (e) cũ vẫn refetch captcha ở 422); tsc sạch.

- [ ] **Step 5: Changelog người dùng**

Thêm mục mới ĐẦU mảng `CHANGELOG` trong `apps/web/src/lib/changelog.ts`:

```ts
  {
    version: "v2.7",
    date: "2026-09-25",
    title: "Báo đúng khi Tổng cục Thuế chặn kết nối",
    changes: [
      "Ở bước Kết nối tài khoản thuế, nếu hệ thống Tổng cục Thuế từ chối yêu cầu từ phần mềm (không phải do bạn nhập sai), phần mềm nay nói rõ điều đó và đã báo cho kỹ thuật, thay vì bảo bạn nhập lại captcha. Mất kết nối mạng cũng được báo riêng.",
      "Phần mềm tự kiểm tra lối vào hệ thống Tổng cục Thuế mỗi giờ và báo ngay cho đội kỹ thuật khi có thay đổi, để sự cố như đầu tháng 9 được phát hiện trong vòng một giờ thay vì hai tuần.",
    ],
    kind: "improvement",
  },
```

(Ngày là ngày dự kiến deploy; sửa lại lúc deploy nếu khác.)

- [ ] **Step 6: Chạy test web liên quan changelog + lint**

Run: `cd apps/web && npx vitest run test/features/about.test.tsx test/features/taxAccounts.test.tsx && cd ../.. && npx biome check apps/web/src apps/web/test/features/taxAccounts.test.tsx`
Expected: PASS; Biome sạch.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/taxAccounts/TaxAccountsPage.tsx apps/web/src/lib/changelog.ts apps/web/test/features/taxAccounts.test.tsx
git commit -m "feat(web): màn Kết nối tài khoản thuế phân biệt sai captcha / GDT chặn / mất mạng; changelog v2.7"
```

---

### Task 8: Runbook, luật adapter, backlog, kiểm toàn bộ và review chéo

**Files:**
- Create: `docs/runbooks/gdt-doi-phuong-thuc.md`
- Modify: `.claude/rules/gdt-adapter.md`
- Modify: `docs/BACKLOG-y-tuong-va-de-xuat.md` (mục [2026-09-24])
- Modify: `docs/superpowers/specs/2026-09-24-giam-sat-loi-vao-gdt-dot-1-design.md` (trạng thái)

- [ ] **Step 1: Viết runbook**

Tạo `docs/runbooks/gdt-doi-phuong-thuc.md`:

```markdown
# Runbook — GDT chặn hoặc đổi phương thức lối vào (U43)

## Dấu hiệu
- Telegram: "🚫 GDT đang CHẶN đăng nhập từ hệ thống (WAF)" (canary mỗi giờ) hoặc "⚠️ GDT đổi cách phản hồi đăng nhập" (DRIFT), hoặc "🚫 Probe egress GDT xấu N tick".
- `audit_log`: nhiều `dang_nhap_thue_that_bai` cùng lý do (`waf_blocked` hoặc thông điệp lạ), 0 `dang_nhap_thue_thanh_cong`.
- Màn Kết nối tài khoản thuế báo "Tổng cục Thuế đang chặn yêu cầu từ hệ thống".

## Nguyên tắc
Khách hàng hợp pháp, trung thành với portal: gửi đúng những gì portal gửi. KHÔNG xoay IP, KHÔNG giả lập trình duyệt, KHÔNG giải captcha, KHÔNG thử dồn (leo thang thành chặn IP).

## Các bước (≈ 30 phút, đã làm đúng thế này ngày 2026-09-24)
1. Tái lập từ máy dev: `cd packages/gdt-client && npx vitest run test/contract/authenticate.contract.test.ts` → đọc `CANARY_VERDICT`/`STATUS`/`MESSAGE`. `OK` ở máy dev nhưng chặn ở biên ⇒ WAF phân biệt theo nguồn (hiếm); khác ⇒ đi tiếp.
2. Tải portal: `curl -s https://hoadondientu.gdt.gov.vn/ | grep -o 'src="[^"]*\.js"'` → tải các chunk, tìm chunk chứa `security-taxpayer/authenticate` và interceptor axios (`interceptors.request.use`). Ngày 24/09 đó là `_app-*.js`, module 81466: gắn `request-id` (uuid), `Action`, `End-Point`.
3. So với `withRequestId()` trong `packages/gdt-client/src/http.ts`. Thiếu header nào thì curl thử với header đó (MST giả `0000000000`, captcha thật lấy từ `/api/captcha`, cvalue sai): mong 401 "Mã captcha không đúng."
4. Sửa `withRequestId()` (thêm header) + chú thích "KIỂM CHỨNG <ngày>" + cập nhật `.claude/rules/gdt-adapter.md`. Nếu là DRIFT (dạng phản hồi mới): cập nhật `canary.ts`/`auth.ts` với bằng chứng, không đoán.
5. `make lint && make test && make test-contract`.
6. Deploy `vat-sync-worker` → `vat-api` → `vat-web`. Ghi Version ID vào backlog.
7. Xác nhận: tin Telegram "✅ GDT đã thông lại" ở tick canary kế tiếp; `audit_log` có `dang_nhap_thue_thanh_cong` sau khi một người dùng đăng nhập lại.

## Nếu chữ ký WAF đổi chữ ngữ
403 sẽ rơi về `GEO_BLOCKED` (vẫn báo, chỉ sai nhãn). Cập nhật `WAF_BLOCK_SIGNATURE` trong `packages/gdt-client/src/errors.ts` kèm ngày kiểm chứng.
```

- [ ] **Step 2: Cập nhật luật `.claude/rules/gdt-adapter.md`**

Trong mục "Đường ra (egress) & fallback", thay dòng `- Probe định kỳ (Cron) phân loại từng transport: \`OK | GEO_BLOCKED | RATE_LIMITED | TIMEOUT | ERROR\`; lưu trạng thái sức khỏe trong Durable Object.` bằng:

```markdown
- Probe định kỳ (Cron) phân loại từng transport: `OK | GEO_BLOCKED | WAF_BLOCKED | RATE_LIMITED | TIMEOUT | ERROR`; lưu trạng thái sức khỏe trong Durable Object. `WAF_BLOCKED` (U43, kiểm chứng 2026-09-24) = 403 + thân mang chữ ký `WAF_BLOCK_SIGNATURE` (`errors.ts`, nguồn chân lý duy nhất): chặn theo HEADER, **không** chuyển relay; chặn enqueue đồng bộ như `GEO_BLOCKED`.
- **Canary lối vào** (U43): `canaryAuthenticate()` — captcha thật + authenticate MST không tồn tại `0000000000` + captcha sai, **không retry**, cron mỗi giờ ở sync-worker và ca contract không cần credential. Mong `OK` (401 nghiệp vụ); `WAF_BLOCKED`/`DRIFT` báo Telegram ngay. Không tăng tần suất, không thêm nguồn, không thử dồn khi bị chặn.
```

- [ ] **Step 3: Cập nhật backlog và spec**

`docs/BACKLOG-y-tuong-va-de-xuat.md`, tiểu mục "Đề xuất phát hiện tự động…": đổi tiêu đề thành `### Đề xuất phát hiện tự động … — mục 1, 2, 6 ĐÃ LÊN KẾ HOẠCH → docs/superpowers/plans/2026-09-24-giam-sat-loi-vao-gdt-dot-1.md (U43); 3–5, 7–10 chờ đợt sau` và trong danh sách 10 biện pháp, đánh dấu đầu dòng 1, 2, 6 bằng `**[U43]**`.

Spec: dòng `**Trạng thái:**` → `đã duyệt, đang thi công theo docs/superpowers/plans/2026-09-24-giam-sat-loi-vao-gdt-dot-1.md`.

- [ ] **Step 4: Kiểm toàn bộ**

Run (tại gốc worktree, KHÔNG chạy chen với lượt test khác — PGlite timeout giả khi tranh CPU):

```bash
make lint && make test && make test-contract
```

Expected: exit 0 cả ba. Nếu `make test` đỏ chỉ ở test PGlite với thời gian ≥ 30 s và có tiến trình `make test` khác đang chạy (`pgrep -f "[m]ake test"`), chạy lại riêng workspace đó khi máy rảnh.

- [ ] **Step 5: Commit tài liệu**

```bash
git add docs/runbooks/gdt-doi-phuong-thuc.md .claude/rules/gdt-adapter.md docs/BACKLOG-y-tuong-va-de-xuat.md docs/superpowers/specs/2026-09-24-giam-sat-loi-vao-gdt-dot-1-design.md
git commit -m "docs(u43): runbook GDT đổi phương thức, luật WAF_BLOCKED + canary, đánh dấu backlog"
```

- [ ] **Step 6: Review chéo và bàn giao**

- Chạy skill `qa-unit` (contract-guardian vì đụng `packages/gdt-client`; security-reviewer vì đụng token/audit/secret Telegram; dod-auditor). Sửa mọi Critical/Major, chạy lại tới ĐẠT, `verdict.json` ghi ĐẠT.
- Push nhánh `worktree-u43-giam-sat-loi-vao-gdt`. **Không** merge/deploy trong plan này — chủ dự án quyết theo mục 6 của spec (đặt 2 secret Telegram cho `vat-sync-worker` trước khi deploy worker).

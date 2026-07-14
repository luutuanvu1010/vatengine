// U9 — Test điều phối một job đồng bộ nền (nhóm unit, offline, phụ thuộc tiêm).
// Chốt các tiêu chí nghiệm thu quan trọng nhất của U9:
//  - lỗi tạm (transient) → outcome "retry" (queue thử lại);
//  - 401/hết phiên → KHÔNG retry, đánh dấu cần đăng nhập lại;
//  - token hết hạn (pre-flight) → KHÔNG gọi GDT/sync, KHÔNG captcha, ghi cần đăng nhập lại;
//  - circuit breaker mở → bỏ qua, không gọi GDT.
import type { GdtTransport } from "@vat/gdt-client";
import type { SyncResult } from "@vat/sync";
import { describe, expect, it } from "vitest";
import { runScheduledSync } from "../../src/runJob";
import type {
  AccountToken,
  JobRecorder,
  RunJobDeps,
  SyncFn,
  SyncJobMessage,
  TenantLimiterClient,
} from "../../src/types";

const MSG: SyncJobMessage = {
  tenantId: "t-A",
  taikhoanId: "acc-1",
  direction: "purchase",
  dateFrom: "01/07/2026",
  dateTo: "31/07/2026",
  period: "2026-07",
};

const NOW = Date.UTC(2026, 6, 14, 3, 0, 0);

interface Calls {
  sync: number;
  transportFetch: number;
  tryAcquire: number;
  recordResult: boolean[];
  reauthPreflight: string[];
  reauthRuntime: string[];
  breakerSkip: number;
}

function completed(): SyncResult {
  return {
    lanDongBoId: "ldb-1",
    soHdMoi: 3,
    soHdCapNhat: 1,
    trangThai: "completed",
    changes: [],
  };
}

function failed(kind: "session_expired" | "transient"): SyncResult {
  return {
    lanDongBoId: "ldb-1",
    soHdMoi: 0,
    soHdCapNhat: 0,
    trangThai: "failed",
    thongDiepLoi: "loi mo phong",
    failureKind: kind,
    changes: [],
  };
}

interface DepOverrides {
  account?: AccountToken | null;
  permit?: { allowed: boolean; reason?: "rate_limited" | "breaker_open" };
  sync?: SyncFn;
}

function makeDeps(over: DepOverrides = {}): { deps: RunJobDeps; calls: Calls } {
  const calls: Calls = {
    sync: 0,
    transportFetch: 0,
    tryAcquire: 0,
    recordResult: [],
    reauthPreflight: [],
    reauthRuntime: [],
    breakerSkip: 0,
  };

  const account =
    over.account === undefined
      ? { tokenHienTai: "jwt-con-han", tokenHetHan: new Date(NOW + 3_600_000) }
      : over.account;

  // Transport theo dõi: nếu bị gọi trong nhánh pre-flight/breaker → sai (không được
  // chạm GDT). runScheduledSync chỉ truyền transport cho sync(), không tự fetch.
  const transport: GdtTransport = {
    name: "fake",
    async fetch() {
      calls.transportFetch += 1;
      return new Response("{}", { status: 200 });
    },
    async probe() {
      throw new Error("không dùng");
    },
  };

  const limiter: TenantLimiterClient = {
    async tryAcquire() {
      calls.tryAcquire += 1;
      return over.permit ?? { allowed: true };
    },
    async recordResult(ok) {
      calls.recordResult.push(ok);
    },
  };

  const recorder: JobRecorder = {
    async reauthPreflight(_m, reason) {
      calls.reauthPreflight.push(reason);
    },
    async reauthRuntime(_m, reason) {
      calls.reauthRuntime.push(reason);
    },
    async breakerSkip() {
      calls.breakerSkip += 1;
    },
  };

  // Một wrapper duy nhất: luôn đếm 1 lần rồi ủy quyền cho sync tiêm (hoặc mặc định).
  const inner: SyncFn = over.sync ?? (async () => completed());
  const sync: SyncFn = async (o) => {
    calls.sync += 1;
    return inner(o);
  };

  const deps: RunJobDeps = {
    now: () => NOW,
    loadAccount: async () => account,
    limiter,
    sync,
    transport,
    recorder,
  };
  return { deps, calls };
}

describe("runScheduledSync — điều phối job đồng bộ nền", () => {
  it("thành công → outcome completed; ghi thành công vào limiter; không cần đăng nhập lại", async () => {
    const { deps, calls } = makeDeps();
    const out = await runScheduledSync(deps, MSG);
    expect(out.kind).toBe("completed");
    expect(calls.sync).toBe(1);
    expect(calls.recordResult).toEqual([true]);
    expect(calls.reauthPreflight).toEqual([]);
    expect(calls.reauthRuntime).toEqual([]);
  });

  it("lỗi TẠM (transient) → outcome retry (queue thử lại); ghi thất bại vào limiter", async () => {
    const { deps, calls } = makeDeps({ sync: async () => failed("transient") });
    const out = await runScheduledSync(deps, MSG);
    expect(out.kind).toBe("retry");
    expect(calls.recordResult).toEqual([false]);
    // KHÔNG đánh dấu cần đăng nhập lại cho lỗi tạm.
    expect(calls.reauthRuntime).toEqual([]);
  });

  it("401/hết phiên (session_expired) → KHÔNG retry; đánh dấu cần đăng nhập lại (runtime)", async () => {
    const { deps, calls } = makeDeps({ sync: async () => failed("session_expired") });
    const out = await runScheduledSync(deps, MSG);
    expect(out.kind).toBe("needs_reauth");
    expect(calls.sync).toBe(1); // đã thử gọi (token còn hạn theo đồng hồ) rồi mới nhận 401
    expect(calls.reauthRuntime).toHaveLength(1);
    expect(calls.reauthPreflight).toEqual([]);
    expect(calls.recordResult).toEqual([false]);
  });

  it("token HẾT HẠN (pre-flight) → KHÔNG gọi sync/GDT (không captcha), ghi cần đăng nhập lại", async () => {
    const { deps, calls } = makeDeps({
      account: { tokenHienTai: "jwt-het-han", tokenHetHan: new Date(NOW - 1000) },
    });
    const out = await runScheduledSync(deps, MSG);
    expect(out.kind).toBe("needs_reauth");
    // Ranh giới Hiến pháp: KHÔNG tự đăng nhập, KHÔNG chạm GDT.
    expect(calls.sync).toBe(0);
    expect(calls.transportFetch).toBe(0);
    expect(calls.tryAcquire).toBe(0); // bỏ qua trước cả khi xin token bucket
    expect(calls.reauthPreflight).toHaveLength(1);
  });

  it("token RỖNG (chưa từng đăng nhập) → pre-flight cần đăng nhập lại, không gọi sync", async () => {
    const { deps, calls } = makeDeps({
      account: { tokenHienTai: null, tokenHetHan: null },
    });
    const out = await runScheduledSync(deps, MSG);
    expect(out.kind).toBe("needs_reauth");
    expect(calls.sync).toBe(0);
    expect(calls.reauthPreflight).toHaveLength(1);
  });

  it("tài khoản không tồn tại → outcome retry, không ghi reauth (tránh FK mồ côi)", async () => {
    const { deps, calls } = makeDeps({ account: null });
    const out = await runScheduledSync(deps, MSG);
    expect(out.kind).toBe("retry");
    expect(calls.sync).toBe(0);
    expect(calls.reauthPreflight).toEqual([]);
  });

  it("circuit breaker MỞ → bỏ qua tick, không gọi sync/GDT, ghi breakerSkip", async () => {
    const { deps, calls } = makeDeps({ permit: { allowed: false, reason: "breaker_open" } });
    const out = await runScheduledSync(deps, MSG);
    expect(out.kind).toBe("skipped_breaker");
    expect(calls.sync).toBe(0);
    expect(calls.transportFetch).toBe(0);
    expect(calls.breakerSkip).toBe(1);
  });

  it("rate limit (giỏ rỗng) → outcome retry (hoãn), không gọi sync", async () => {
    const { deps, calls } = makeDeps({ permit: { allowed: false, reason: "rate_limited" } });
    const out = await runScheduledSync(deps, MSG);
    expect(out.kind).toBe("retry");
    expect(calls.sync).toBe(0);
  });

  it("sync ném lỗi bất ngờ → outcome retry (có trần queue làm chốt), ghi thất bại limiter", async () => {
    const { deps, calls } = makeDeps({
      sync: async () => {
        throw new Error("loi bat ngo");
      },
    });
    const out = await runScheduledSync(deps, MSG);
    expect(out.kind).toBe("retry");
    expect(calls.recordResult).toEqual([false]);
  });
});

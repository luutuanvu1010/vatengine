// U26 (pha 2) — Test điều phối MỘT message chi tiết (unit, offline, phụ thuộc tiêm).
// Chốt tiêu chí nghiệm thu U26-plan §4:
//  - 1 permit TenantLimiter / message (= / request GDT) — trả nợ permit-per-request;
//  - 429 → recordResult(false) + retry_backpressure (reenqueue delay, KHÔNG max_retries);
//  - 401 → đánh dấu token chết + needs_reauth (ack, không retry vô ích);
//  - token hết hạn pre-flight → ack_skip (KHÔNG gọi GDT, KHÔNG ghi reauth per-message);
//  - sco + 404 → ack_skip có cảnh báo (endpoint sco detail CHƯA KIỂM CHỨNG — không lặp vô hạn);
//  - 5xx/timeout/DB → retry (queue max_retries → DLQ);
//  - thành công → persistLines đúng tham số + recordResult(true).
import { GdtError } from "@vat/gdt-client";
import type { InvoiceLine } from "@vat/gdt-client";
import type { DetailSyncMessage } from "@vat/sync";
import { describe, expect, it, vi } from "vitest";
import { detailConsumerAction, runDetailJob } from "../../src/runDetailJob";
import type { RunDetailJobDeps } from "../../src/runDetailJob";
import type { AccountToken } from "../../src/types";

const MSG: DetailSyncMessage = {
  kind: "detail",
  tenantId: "t-A",
  taikhoanId: "acc-1",
  hoaDonId: "hd-1",
  ref: { nbmst: "0100000001", khhdon: "C26TAA", khmshdon: "1", shdon: "42", source: "normal" },
};

const NOW = Date.UTC(2026, 6, 17, 3, 0, 0);

const LINES: InvoiceLine[] = [
  { stt: 1, ten: "SP A", sluong: 2, ltsuat: "8%", tsuat: 0.08, tthue: null, raw: {} },
];

interface Calls {
  tryAcquire: number;
  recordResult: boolean[];
  fetchLines: Array<{ token: string; ref: DetailSyncMessage["ref"] }>;
  persistLines: Array<{ tenantId: string; hoaDonId: string; soDong: number }>;
  markTokenDead: string[];
}

interface Overrides {
  account?: AccountToken | null;
  permit?: { allowed: boolean; reason?: "rate_limited" | "breaker_open" };
  fetchLines?: (token: string, ref: DetailSyncMessage["ref"]) => Promise<InvoiceLine[]>;
  persistLines?: () => Promise<void>;
}

function makeDeps(over: Overrides = {}): { deps: RunDetailJobDeps; calls: Calls } {
  const calls: Calls = {
    tryAcquire: 0,
    recordResult: [],
    fetchLines: [],
    persistLines: [],
    markTokenDead: [],
  };
  const account =
    over.account === undefined
      ? { tokenHienTai: "jwt-con-han", tokenHetHan: new Date(NOW + 3_600_000) }
      : over.account;

  const deps: RunDetailJobDeps = {
    now: () => NOW,
    loadAccount: async () => account,
    limiter: {
      async tryAcquire() {
        calls.tryAcquire += 1;
        return over.permit ?? { allowed: true };
      },
      async recordResult(ok) {
        calls.recordResult.push(ok);
      },
    },
    fetchLines: async (token, ref) => {
      calls.fetchLines.push({ token, ref });
      return over.fetchLines ? over.fetchLines(token, ref) : LINES;
    },
    persistLines: async (tenantId, hoaDonId, lines) => {
      calls.persistLines.push({ tenantId, hoaDonId, soDong: lines.length });
      if (over.persistLines) await over.persistLines();
    },
    markTokenDead: async (_m, reason) => {
      calls.markTokenDead.push(reason);
    },
  };
  return { deps, calls };
}

describe("runDetailJob — điều phối một message chi tiết (U26 pha 2)", () => {
  it("thành công → 1 permit, fetch đúng token+ref, persist đúng (tenant, hoaDonId), recordResult(true)", async () => {
    const { deps, calls } = makeDeps();
    const out = await runDetailJob(deps, MSG);
    expect(out).toEqual({ kind: "completed", soDong: 1 });
    expect(calls.tryAcquire).toBe(1);
    expect(calls.fetchLines).toEqual([{ token: "jwt-con-han", ref: MSG.ref }]);
    expect(calls.persistLines).toEqual([{ tenantId: "t-A", hoaDonId: "hd-1", soDong: 1 }]);
    expect(calls.recordResult).toEqual([true]);
    expect(calls.markTokenDead).toEqual([]);
  });

  it("token HẾT HẠN (pre-flight) → ack_skip, KHÔNG gọi GDT, KHÔNG xin permit, KHÔNG ghi reauth", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { deps, calls } = makeDeps({
      account: { tokenHienTai: "jwt-het-han", tokenHetHan: new Date(NOW - 1000) },
    });
    const out = await runDetailJob(deps, MSG);
    expect(out).toEqual({ kind: "ack_skip", reason: "token_het_han" });
    expect(calls.tryAcquire).toBe(0);
    expect(calls.fetchLines).toEqual([]);
    expect(calls.markTokenDead).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("tài khoản không tồn tại → retry (trần queue → DLQ, người xử lý thấy)", async () => {
    const { deps } = makeDeps({ account: null });
    const out = await runDetailJob(deps, MSG);
    expect(out).toEqual({ kind: "retry", reason: "tai_khoan_khong_ton_tai" });
  });

  it("giỏ token rỗng → retry_backpressure rate_limited, KHÔNG gọi GDT", async () => {
    const { deps, calls } = makeDeps({ permit: { allowed: false, reason: "rate_limited" } });
    const out = await runDetailJob(deps, MSG);
    expect(out).toEqual({ kind: "retry_backpressure", reason: "rate_limited" });
    expect(calls.fetchLines).toEqual([]);
  });

  it("breaker MỞ → retry_backpressure breaker_open, KHÔNG gọi GDT", async () => {
    const { deps, calls } = makeDeps({ permit: { allowed: false, reason: "breaker_open" } });
    const out = await runDetailJob(deps, MSG);
    expect(out).toEqual({ kind: "retry_backpressure", reason: "breaker_open" });
    expect(calls.fetchLines).toEqual([]);
  });

  it("GDT 429 → recordResult(false) + retry_backpressure (reenqueue delay, không đập tiếp)", async () => {
    const { deps, calls } = makeDeps({
      fetchLines: async () => {
        throw new GdtError("HTTP 429", "HTTP_ERROR", 429);
      },
    });
    const out = await runDetailJob(deps, MSG);
    expect(out).toEqual({ kind: "retry_backpressure", reason: "rate_limited" });
    expect(calls.recordResult).toEqual([false]);
    expect(calls.persistLines).toEqual([]);
  });

  it("401 runtime (SESSION_EXPIRED) → đánh dấu token chết + needs_reauth, recordResult(false)", async () => {
    const { deps, calls } = makeDeps({
      fetchLines: async () => {
        throw new GdtError("het phien", "SESSION_EXPIRED");
      },
    });
    const out = await runDetailJob(deps, MSG);
    expect(out).toEqual({ kind: "needs_reauth", reason: "session_expired" });
    expect(calls.markTokenDead).toEqual(["session_expired"]);
    expect(calls.recordResult).toEqual([false]);
  });

  it("nhánh sco + 404 → ack_skip có CẢNH BÁO (endpoint sco detail CHƯA KIỂM CHỨNG), không mở breaker", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { deps, calls } = makeDeps({
      fetchLines: async () => {
        throw new GdtError("HTTP 404", "HTTP_ERROR", 404);
      },
    });
    const scoMsg: DetailSyncMessage = { ...MSG, ref: { ...MSG.ref, source: "sco" } };
    const out = await runDetailJob(deps, scoMsg);
    expect(out).toEqual({ kind: "ack_skip", reason: "sco_404" });
    expect(calls.recordResult).toEqual([true]); // 404 trả lời nhanh — không phải GDT ốm
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("404 nhánh normal (bất thường) → retry như lỗi tạm (nổi lên DLQ, không nuốt)", async () => {
    const { deps, calls } = makeDeps({
      fetchLines: async () => {
        throw new GdtError("HTTP 404", "HTTP_ERROR", 404);
      },
    });
    const out = await runDetailJob(deps, MSG);
    expect(out.kind).toBe("retry");
    expect(calls.recordResult).toEqual([false]);
  });

  it("GDT 5xx/timeout → recordResult(false) + retry (queue max_retries → DLQ)", async () => {
    const { deps, calls } = makeDeps({
      fetchLines: async () => {
        throw new GdtError("HTTP 500", "HTTP_ERROR", 500);
      },
    });
    const out = await runDetailJob(deps, MSG);
    expect(out.kind).toBe("retry");
    expect(calls.recordResult).toEqual([false]);
  });

  it("lỗi DB khi persist → retry; GDT đã trả lời OK nên recordResult(true) (breaker đo sức khỏe GDT)", async () => {
    const { deps, calls } = makeDeps({
      persistLines: async () => {
        throw new Error("db loi");
      },
    });
    const out = await runDetailJob(deps, MSG);
    expect(out.kind).toBe("retry");
    expect(calls.recordResult).toEqual([true]);
  });

  it("GDT trả 0 dòng (hdhhdvu rỗng/thiếu — kiểm hợp đồng MỀM) → completed soDong=0 + cảnh báo, vẫn persist (xóa dòng cũ)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { deps, calls } = makeDeps({ fetchLines: async () => [] });
    const out = await runDetailJob(deps, MSG);
    expect(out).toEqual({ kind: "completed", soDong: 0 });
    expect(calls.persistLines).toEqual([{ tenantId: "t-A", hoaDonId: "hd-1", soDong: 0 }]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("KHÔNG log giá trị dòng hàng/token trong mọi nhánh cảnh báo (security.md)", async () => {
    const logged: string[] = [];
    const warn = vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    });
    const { deps } = makeDeps({
      account: { tokenHienTai: "jwt-bi-mat-tuyet-doi", tokenHetHan: new Date(NOW - 1000) },
    });
    await runDetailJob(deps, MSG);
    const { deps: deps2 } = makeDeps({ fetchLines: async () => [] });
    await runDetailJob(deps2, MSG);
    for (const line of logged) {
      expect(line).not.toContain("jwt-bi-mat-tuyet-doi");
      expect(line).not.toContain("SP A");
    }
    warn.mockRestore();
  });
});

describe("detailConsumerAction — ánh xạ outcome pha 2 → hành động hàng đợi", () => {
  const OPTS = { backpressureDelaySeconds: 60, bpAttempt: 0, maxBackpressure: 10 };

  it("completed / ack_skip / needs_reauth → ack", () => {
    expect(detailConsumerAction({ kind: "completed", soDong: 1 }, OPTS)).toEqual({ type: "ack" });
    expect(detailConsumerAction({ kind: "ack_skip", reason: "token_het_han" }, OPTS)).toEqual({
      type: "ack",
    });
    expect(detailConsumerAction({ kind: "needs_reauth", reason: "session_expired" }, OPTS)).toEqual(
      { type: "ack" },
    );
  });

  it("retry_backpressure dưới trần → reenqueue delay + tăng bpAttempt; đạt trần → retry thật", () => {
    expect(
      detailConsumerAction({ kind: "retry_backpressure", reason: "rate_limited" }, OPTS),
    ).toEqual({ type: "reenqueue", delaySeconds: 60, bpAttempt: 1 });
    expect(
      detailConsumerAction(
        { kind: "retry_backpressure", reason: "rate_limited" },
        { ...OPTS, bpAttempt: 10 },
      ),
    ).toEqual({ type: "retry" });
  });

  it("retry → retry thật (max_retries → DLQ)", () => {
    expect(detailConsumerAction({ kind: "retry", reason: "loi" }, OPTS)).toEqual({ type: "retry" });
  });
});

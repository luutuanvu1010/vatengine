// Fixtures TỐI THIỂU cho runAuditJobOrder.test.ts (m2) — bản rút gọn của makeDeps/AUDIT
// trong runDeltaJob.test.ts, tách riêng vì file kia KHÔNG được `vi.mock("@vat/sync")`.
import type { AuditSyncMessage } from "@vat/sync";
import type { DeltaJobDeps } from "../../src/runDeltaJob";
import type { AccountToken, JobRecorder, TenantLimiterClient } from "../../src/types";

const NOW = Date.UTC(2026, 6, 14, 3, 0, 0);

export const AUDIT: AuditSyncMessage = {
  kind: "audit",
  tenantId: "t-A",
  taikhoanId: "acc-1",
  direction: "purchase",
  dateFrom: "01/07/2026",
  dateTo: "31/07/2026",
  period: "2026-07",
  vong: 0,
};

export function makeDeps(): { deps: DeltaJobDeps; calls: { moRun: number; enqueue: unknown[][] } } {
  const calls = { moRun: 0, enqueue: [] as unknown[][] };

  const account: AccountToken = {
    tokenHienTai: "jwt-con-han",
    tokenHetHan: new Date(NOW + 3_600_000),
  };

  const limiter: TenantLimiterClient = {
    async tryAcquire() {
      return { allowed: true };
    },
    async recordResult() {},
  };

  const recorder: JobRecorder = {
    async reauthPreflight() {},
    async reauthRuntime() {},
    async breakerSkip() {},
  };

  const deps: DeltaJobDeps = {
    now: () => NOW,
    loadAccount: async () => account,
    limiter,
    recorder,
    layTotal: async () => 0,
    demTheoNguon: async () => ({ normal: 0, sco: 0 }),
    coChuoiKeoDangChay: async () => false,
    moRun: async () => {
      calls.moRun += 1;
      return "ldb-moi";
    },
    ghiDu: async () => {},
    chotRun: async () => {},
    keoChunk: async () => ({ trangThai: "ok", done: true, detailCandidates: [] }),
    enqueue: async (msgs) => {
      calls.enqueue.push(msgs);
    },
    enqueueDetail: async () => {},
    chunkPages: 40,
  };
  return { deps, calls };
}

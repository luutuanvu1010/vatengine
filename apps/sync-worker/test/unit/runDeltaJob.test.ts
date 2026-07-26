// Task 6 (delta-sync) — Test điều phối chuỗi audit → kéo lô → kiểm lại (nhóm unit,
// OFFLINE, phụ thuộc tiêm). Chốt các tiêu chí nghiệm thu:
//  - audit vòng 0 đủ → ghi dấu "đã kiểm, đủ", KHÔNG mở run, KHÔNG kéo gì;
//  - audit thiếu → mở run + enqueue ĐÚNG MỘT message kéo họ đầu (họ sau vào conLai);
//  - audit bão hòa/chạm trần → chốt run completed kèm ghi chú số hụt (không kéo vô hạn);
//  - delta chưa hết trang → enqueue lại CHÍNH message mang `state` mới (nối đúng chỗ);
//  - delta hết trang mà còn họ → chuyển họ; hết họ → quay lại audit (kiểm lại);
//  - 401 → cần đăng nhập lại + chốt run; 429 → đẩy lùi; trần nền tảng → retry KHÔNG
//    quy kết cho GDT (bài học sự cố 2026-07-18);
//  - phân nhánh consumer: audit/delta KHÔNG được rơi vào nhánh header (runScheduledSync).
import { GdtError } from "@vat/gdt-client";
import type { InvoiceDirection } from "@vat/gdt-client";
import { TRAN_TONG_TRANG_DELTA } from "@vat/sync";
import type {
  AuditSyncMessage,
  ChunkOutcome,
  DeltaPullMessage,
  DetailSyncMessage,
  VatSyncQueueMessage,
} from "@vat/sync";
import { describe, expect, it } from "vitest";
import { phanLoaiMessage } from "../../src/fanout";
import { runAuditJob, runDeltaJob } from "../../src/runDeltaJob";
import type { DeltaJobDeps } from "../../src/runDeltaJob";
import type { AccountToken, JobRecorder, TenantLimiterClient } from "../../src/types";

const NOW = Date.UTC(2026, 6, 14, 3, 0, 0);

const AUDIT: AuditSyncMessage = {
  kind: "audit",
  tenantId: "t-A",
  taikhoanId: "acc-1",
  direction: "purchase",
  dateFrom: "01/07/2026",
  dateTo: "31/07/2026",
  period: "2026-07",
  vong: 0,
};

const DELTA: DeltaPullMessage = {
  kind: "delta",
  tenantId: "t-A",
  taikhoanId: "acc-1",
  direction: "purchase",
  dateFrom: "01/07/2026",
  dateTo: "31/07/2026",
  period: "2026-07",
  lanDongBoId: "ldb-1",
  family: "normal",
  conLai: ["sco"],
  vong: 1,
  prevCount: 12,
};

const CANDIDATES = [
  {
    hoaDonId: "hd-1",
    ref: {
      nbmst: "0100000001",
      khhdon: "C26TAA",
      khmshdon: "1",
      shdon: "42",
      source: "normal" as const,
    },
  },
];

function chunkOk(over: Partial<ChunkOutcome> = {}): ChunkOutcome {
  return { trangThai: "ok", done: true, detailCandidates: [], ...over };
}

function chunkFailed(kind: NonNullable<ChunkOutcome["failureKind"]>): ChunkOutcome {
  return {
    trangThai: "failed",
    failureKind: kind,
    thongDiepLoi: "loi mo phong",
    detailCandidates: [],
  };
}

interface Calls {
  layTotal: Array<{ family: "normal" | "sco"; direction: InvoiceDirection }>;
  demTheoNguon: number;
  moRun: number;
  ghiDu: number;
  chotRun: Array<{ lanDongBoId: string; trangThai: string; thongDiepLoi?: string }>;
  keoChunk: DeltaPullMessage[];
  enqueue: VatSyncQueueMessage[][];
  enqueueDetail: DetailSyncMessage[][];
  tryAcquire: number;
  recordResult: boolean[];
  reauthPreflight: string[];
  reauthRuntime: string[];
  breakerSkip: number;
}

interface DepOverrides {
  account?: AccountToken | null;
  permit?: { allowed: boolean; reason?: "rate_limited" | "breaker_open" };
  totals?: Partial<Record<"normal" | "sco", number | null>>;
  layTotal?: DeltaJobDeps["layTotal"];
  dem?: { normal: number; sco: number };
  keoChunk?: (msg: DeltaPullMessage) => Promise<ChunkOutcome>;
  enqueue?: (msgs: VatSyncQueueMessage[]) => Promise<void>;
  enqueueDetail?: (msgs: DetailSyncMessage[]) => Promise<void>;
}

function makeDeps(over: DepOverrides = {}): { deps: DeltaJobDeps; calls: Calls } {
  const calls: Calls = {
    layTotal: [],
    demTheoNguon: 0,
    moRun: 0,
    ghiDu: 0,
    chotRun: [],
    keoChunk: [],
    enqueue: [],
    enqueueDetail: [],
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

  const totals = over.totals ?? {};

  const deps: DeltaJobDeps = {
    now: () => NOW,
    loadAccount: async () => account,
    limiter,
    recorder,
    layTotal:
      over.layTotal ??
      (async (_token, direction, family) => {
        calls.layTotal.push({ family, direction });
        return totals[family] ?? 0;
      }),
    demTheoNguon: async () => {
      calls.demTheoNguon += 1;
      return over.dem ?? { normal: 0, sco: 0 };
    },
    moRun: async () => {
      calls.moRun += 1;
      return "ldb-moi";
    },
    ghiDu: async () => {
      calls.ghiDu += 1;
    },
    chotRun: async (_tenantId, lanDongBoId, kq) => {
      calls.chotRun.push({ lanDongBoId, ...kq });
    },
    keoChunk: async (msg) => {
      calls.keoChunk.push(msg);
      return over.keoChunk ? over.keoChunk(msg) : chunkOk();
    },
    enqueue: async (msgs) => {
      calls.enqueue.push(msgs);
      if (over.enqueue) await over.enqueue(msgs);
    },
    enqueueDetail: async (msgs) => {
      calls.enqueueDetail.push(msgs);
      if (over.enqueueDetail) await over.enqueueDetail(msgs);
    },
    chunkPages: 40,
  };
  return { deps, calls };
}

describe("runAuditJob — vòng kiểm đối chiếu total GDT ↔ count DB", () => {
  it("(1) vòng 0, ĐỦ cả hai họ → ghi dấu 'đã kiểm, đủ'; KHÔNG mở run, KHÔNG enqueue", async () => {
    const { deps, calls } = makeDeps({
      totals: { normal: 10, sco: 5 },
      dem: { normal: 10, sco: 5 },
    });
    const out = await runAuditJob(deps, AUDIT);
    expect(out.kind).toBe("completed");
    expect(calls.ghiDu).toBe(1);
    expect(calls.moRun).toBe(0);
    expect(calls.enqueue).toEqual([]);
    expect(calls.chotRun).toEqual([]);
    expect(calls.recordResult).toEqual([true]);
  });

  it("(1b) sco trả null (404 — không áp dụng) và normal đủ → vẫn coi là ĐỦ", async () => {
    const { deps, calls } = makeDeps({
      totals: { normal: 10, sco: null },
      dem: { normal: 10, sco: 0 },
    });
    const out = await runAuditJob(deps, AUDIT);
    expect(out.kind).toBe("completed");
    expect(calls.ghiDu).toBe(1);
    expect(calls.enqueue).toEqual([]);
  });

  it("(2) vòng 0, HỤT sco → mở run rồi enqueue ĐÚNG MỘT message kéo họ sco", async () => {
    const { deps, calls } = makeDeps({
      totals: { normal: 10, sco: 5 },
      dem: { normal: 10, sco: 2 },
    });
    const out = await runAuditJob(deps, AUDIT);
    expect(out.kind).toBe("completed");
    expect(calls.moRun).toBe(1);
    expect(calls.ghiDu).toBe(0);
    expect(calls.enqueue).toHaveLength(1);
    const msgs = calls.enqueue[0] ?? [];
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toEqual({
      kind: "delta",
      tenantId: AUDIT.tenantId,
      taikhoanId: AUDIT.taikhoanId,
      direction: AUDIT.direction,
      dateFrom: AUDIT.dateFrom,
      dateTo: AUDIT.dateTo,
      period: AUDIT.period,
      lanDongBoId: "ldb-moi",
      family: "sco",
      conLai: [],
      vong: 1,
      prevCount: 12,
    });
  });

  it("(2b) vòng 0, HỤT CẢ HAI họ → kéo normal trước, sco vào conLai", async () => {
    const { deps, calls } = makeDeps({
      totals: { normal: 10, sco: 5 },
      dem: { normal: 3, sco: 2 },
    });
    await runAuditJob(deps, AUDIT);
    const msg = (calls.enqueue[0] ?? [])[0] as DeltaPullMessage;
    expect(msg.family).toBe("normal");
    expect(msg.conLai).toEqual(["sco"]);
    expect(msg.prevCount).toBe(5);
    expect(msg.vong).toBe(1);
  });

  it("(2c) vòng ≥1 KHÔNG mở run mới — dùng lại lanDongBoId đang mở", async () => {
    const { deps, calls } = makeDeps({
      totals: { normal: 10, sco: 5 },
      dem: { normal: 8, sco: 5 },
    });
    await runAuditJob(deps, { ...AUDIT, vong: 1, lanDongBoId: "ldb-1", prevCount: 5 });
    expect(calls.moRun).toBe(0);
    const msg = (calls.enqueue[0] ?? [])[0] as DeltaPullMessage;
    expect(msg.lanDongBoId).toBe("ldb-1");
    expect(msg.vong).toBe(2);
  });

  it("(3) vòng 1 BÃO HÒA (count không tăng) → chốt run completed kèm ghi chú số hụt", async () => {
    const { deps, calls } = makeDeps({
      totals: { normal: 10, sco: 5 },
      dem: { normal: 10, sco: 2 },
    });
    const out = await runAuditJob(deps, {
      ...AUDIT,
      vong: 1,
      lanDongBoId: "ldb-1",
      prevCount: 12,
    });
    expect(out.kind).toBe("completed");
    expect(calls.enqueue).toEqual([]);
    expect(calls.chotRun).toHaveLength(1);
    expect(calls.chotRun[0]?.lanDongBoId).toBe("ldb-1");
    expect(calls.chotRun[0]?.trangThai).toBe("completed");
    expect(calls.chotRun[0]?.thongDiepLoi).toContain("3"); // hụt 5-2 = 3 hóa đơn
  });

  it("(3b) vòng ≥1 ĐỦ → chốt run completed (không ghi thêm bản ghi audit)", async () => {
    const { deps, calls } = makeDeps({
      totals: { normal: 10, sco: 5 },
      dem: { normal: 10, sco: 5 },
    });
    const out = await runAuditJob(deps, {
      ...AUDIT,
      vong: 1,
      lanDongBoId: "ldb-1",
      prevCount: 5,
    });
    expect(out.kind).toBe("completed");
    expect(calls.ghiDu).toBe(0);
    expect(calls.chotRun).toEqual([{ lanDongBoId: "ldb-1", trangThai: "completed" }]);
  });

  it("(2d) enqueue THẤT BẠI ngay sau khi mở run → retry VÀ chốt run vừa mở là failed (không để run mồ côi treo 'running')", async () => {
    // Nếu chỉ retry: lượt sau `msg.lanDongBoId` vẫn undefined → moRun lần nữa → run
    // trước treo `running` vĩnh viễn, làm nhiễu sổ đồng bộ. Phải tự dọn.
    const { deps, calls } = makeDeps({
      totals: { normal: 10, sco: 5 },
      dem: { normal: 3, sco: 2 },
      enqueue: async () => {
        throw new Error("queue hong");
      },
    });
    const out = await runAuditJob(deps, AUDIT);
    expect(out.kind).toBe("retry");
    expect(calls.moRun).toBe(1);
    expect(calls.chotRun).toEqual([
      { lanDongBoId: "ldb-moi", trangThai: "failed", thongDiepLoi: expect.any(String) },
    ]);
  });

  it("(2e) enqueue thất bại khi DÙNG LẠI run đang mở (vòng ≥1) → retry, KHÔNG chốt run (lượt sau nối tiếp được)", async () => {
    const { deps, calls } = makeDeps({
      totals: { normal: 10, sco: 5 },
      dem: { normal: 8, sco: 5 },
      enqueue: async () => {
        throw new Error("queue hong");
      },
    });
    const out = await runAuditJob(deps, { ...AUDIT, vong: 1, lanDongBoId: "ldb-1", prevCount: 5 });
    expect(out.kind).toBe("retry");
    expect(calls.moRun).toBe(0);
    expect(calls.chotRun).toEqual([]);
  });

  it("(4) token HẾT HẠN (pre-flight) → KHÔNG chạm GDT, ghi cần đăng nhập lại", async () => {
    const { deps, calls } = makeDeps({
      account: { tokenHienTai: "jwt-het-han", tokenHetHan: new Date(NOW - 1000) },
    });
    const out = await runAuditJob(deps, AUDIT);
    expect(out.kind).toBe("needs_reauth");
    expect(calls.layTotal).toEqual([]);
    expect(calls.tryAcquire).toBe(0);
    expect(calls.reauthPreflight).toHaveLength(1);
    // Vòng 0 KHÔNG có run mở (lanDongBoId undefined) → không có gì để chốt.
    expect(calls.chotRun).toEqual([]);
  });

  it("(4-I1) audit VÒNG ≥1 (có lanDongBoId) + token HẾT HẠN (pre-flight) → CHỐT run 'can_dang_nhap_lai' (không để run treo 'running' vĩnh viễn)", async () => {
    const { deps, calls } = makeDeps({
      account: { tokenHienTai: "jwt-het-han", tokenHetHan: new Date(NOW - 1000) },
    });
    const out = await runAuditJob(deps, { ...AUDIT, vong: 1, lanDongBoId: "ldb-1", prevCount: 5 });
    expect(out.kind).toBe("needs_reauth");
    expect(calls.reauthPreflight).toHaveLength(1);
    expect(calls.chotRun).toEqual([{ lanDongBoId: "ldb-1", trangThai: "can_dang_nhap_lai" }]);
  });

  it("(4b) tài khoản không tồn tại → retry, KHÔNG ghi reauth (tránh FK mồ côi)", async () => {
    const { deps, calls } = makeDeps({ account: null });
    const out = await runAuditJob(deps, AUDIT);
    expect(out.kind).toBe("retry");
    expect(calls.reauthPreflight).toEqual([]);
    expect(calls.layTotal).toEqual([]);
  });

  it("(4c) 401 giữa audit (layTotal ném) → cần đăng nhập lại, KHÔNG quy kết cho breaker", async () => {
    const { deps, calls } = makeDeps({
      layTotal: async () => {
        throw new GdtError("het phien", "SESSION_EXPIRED", 401);
      },
    });
    const out = await runAuditJob(deps, AUDIT);
    expect(out.kind).toBe("needs_reauth");
    expect(calls.reauthRuntime).toHaveLength(1);
    expect(calls.recordResult).toEqual([]);
    // Vòng 0 KHÔNG có run mở → không có gì để chốt.
    expect(calls.chotRun).toEqual([]);
  });

  it("(4c-I1) audit VÒNG ≥1, 401 giữa audit (layTotal ném SESSION_EXPIRED) → CHỐT run 'can_dang_nhap_lai' (run mở từ vòng trước không được treo mãi)", async () => {
    const { deps, calls } = makeDeps({
      layTotal: async () => {
        throw new GdtError("het phien", "SESSION_EXPIRED", 401);
      },
    });
    const out = await runAuditJob(deps, { ...AUDIT, vong: 1, lanDongBoId: "ldb-1", prevCount: 5 });
    expect(out.kind).toBe("needs_reauth");
    expect(calls.reauthRuntime).toHaveLength(1);
    expect(calls.chotRun).toEqual([{ lanDongBoId: "ldb-1", trangThai: "can_dang_nhap_lai" }]);
  });

  it("(4d) 429 giữa audit → đẩy lùi (retry_backpressure)", async () => {
    const { deps } = makeDeps({
      layTotal: async () => {
        throw new GdtError("qua nhieu", "HTTP_ERROR", 429);
      },
    });
    const out = await runAuditJob(deps, AUDIT);
    expect(out).toEqual({ kind: "retry_backpressure", reason: "rate_limited" });
  });

  it("(4e) lỗi TẠM giữa audit → retry + ghi thất bại vào limiter", async () => {
    const { deps, calls } = makeDeps({
      layTotal: async () => {
        throw new Error("mang chap chon");
      },
    });
    const out = await runAuditJob(deps, AUDIT);
    expect(out.kind).toBe("retry");
    expect(calls.recordResult).toEqual([false]);
  });

  it("(4f) trần nền tảng Workers giữa audit → retry nhưng KHÔNG tính vào breaker GDT", async () => {
    const { deps, calls } = makeDeps({
      layTotal: async () => {
        throw new Error("Too many subrequests by single Worker invocation");
      },
    });
    const out = await runAuditJob(deps, AUDIT);
    expect(out.kind).toBe("retry");
    expect(calls.recordResult).toEqual([]);
  });

  it("(9) circuit breaker MỞ → backpressure, KHÔNG chạm GDT, ghi breakerSkip", async () => {
    const { deps, calls } = makeDeps({ permit: { allowed: false, reason: "breaker_open" } });
    const out = await runAuditJob(deps, AUDIT);
    expect(out).toEqual({ kind: "retry_backpressure", reason: "breaker_open" });
    expect(calls.breakerSkip).toBe(1);
    expect(calls.layTotal).toEqual([]);
  });

  it("(9b) giỏ token rỗng → backpressure rate_limited, KHÔNG ghi breakerSkip", async () => {
    const { deps, calls } = makeDeps({ permit: { allowed: false, reason: "rate_limited" } });
    const out = await runAuditJob(deps, AUDIT);
    expect(out).toEqual({ kind: "retry_backpressure", reason: "rate_limited" });
    expect(calls.breakerSkip).toBe(0);
    expect(calls.layTotal).toEqual([]);
  });
});

describe("runDeltaJob — kéo MỘT lô rồi nối chuỗi", () => {
  it("(5) lô ok CHƯA hết trang → enqueue lại CHÍNH message mang `state` mới", async () => {
    const { deps, calls } = makeDeps({
      keoChunk: async () => chunkOk({ done: false, state: "trang-2" }),
    });
    const out = await runDeltaJob(deps, DELTA);
    expect(out.kind).toBe("completed");
    expect(calls.enqueue).toHaveLength(1);
    // trangDaKeo: DELTA không mang trường này (coi = 0) + kq không set `pages` → rơi về
    // deps.chunkPages (40, xem makeDeps) — trần tổng-trang cộng dồn (10a-c bên dưới).
    expect((calls.enqueue[0] ?? [])[0]).toEqual({ ...DELTA, state: "trang-2", trangDaKeo: 40 });
    expect(calls.recordResult).toEqual([true]);
  });

  it("(5b) lô ok có detailCandidates → enqueueDetail message kind:'detail'", async () => {
    const { deps, calls } = makeDeps({
      keoChunk: async () => chunkOk({ done: false, state: "s2", detailCandidates: CANDIDATES }),
    });
    await runDeltaJob(deps, DELTA);
    expect(calls.enqueueDetail).toHaveLength(1);
    const msgs = calls.enqueueDetail[0] ?? [];
    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.kind).toBe("detail");
    expect(msgs[0]?.tenantId).toBe(DELTA.tenantId);
    expect(msgs[0]?.hoaDonId).toBe("hd-1");
  });

  it("(5c) enqueueDetail ném lỗi → retry (không nuốt im lặng pha 2)", async () => {
    const { deps } = makeDeps({
      keoChunk: async () => chunkOk({ detailCandidates: CANDIDATES }),
      enqueueDetail: async () => {
        throw new Error("queue hong");
      },
    });
    const out = await runDeltaJob(deps, DELTA);
    expect(out.kind).toBe("retry");
  });

  it("(5d) enqueue message NỐI CHUỖI ném lỗi → retry (chuỗi KHÔNG được đứt im lặng)", async () => {
    // Mất message nối tiếp = run treo `running` mãi, không ai kéo tiếp, không ai chốt.
    // Lô là idempotent (upsert theo khóa tự nhiên) nên chạy lại vô hại.
    const { deps } = makeDeps({
      keoChunk: async () => chunkOk({ done: false, state: "trang-2" }),
      enqueue: async () => {
        throw new Error("queue hong");
      },
    });
    const out = await runDeltaJob(deps, DELTA);
    expect(out.kind).toBe("retry");
  });

  it("(6) lô ok HẾT trang mà còn conLai → chuyển sang họ kế, xóa `state`", async () => {
    const { deps, calls } = makeDeps({ keoChunk: async () => chunkOk({ done: true }) });
    const out = await runDeltaJob(deps, { ...DELTA, state: "trang-9" });
    expect(out.kind).toBe("completed");
    const next = (calls.enqueue[0] ?? [])[0] as DeltaPullMessage;
    expect(next.kind).toBe("delta");
    expect(next.family).toBe("sco");
    expect(next.conLai).toEqual([]);
    expect(next.state).toBeUndefined();
    expect(next.vong).toBe(DELTA.vong);
    expect(next.prevCount).toBe(DELTA.prevCount);
    expect(next.lanDongBoId).toBe(DELTA.lanDongBoId);
  });

  it("(7) lô ok HẾT trang, HẾT conLai → enqueue message audit để kiểm lại", async () => {
    const { deps, calls } = makeDeps({ keoChunk: async () => chunkOk({ done: true }) });
    const out = await runDeltaJob(deps, { ...DELTA, family: "sco", conLai: [] });
    expect(out.kind).toBe("completed");
    expect((calls.enqueue[0] ?? [])[0]).toEqual({
      kind: "audit",
      tenantId: DELTA.tenantId,
      taikhoanId: DELTA.taikhoanId,
      direction: DELTA.direction,
      dateFrom: DELTA.dateFrom,
      dateTo: DELTA.dateTo,
      period: DELTA.period,
      vong: DELTA.vong,
      lanDongBoId: DELTA.lanDongBoId,
      prevCount: DELTA.prevCount,
    });
    expect(calls.chotRun).toEqual([]); // chốt run là việc của vòng audit hội tụ
  });

  it("(8) lô 429 → backpressure, KHÔNG enqueue gì", async () => {
    const { deps, calls } = makeDeps({ keoChunk: async () => chunkFailed("rate_limited") });
    const out = await runDeltaJob(deps, DELTA);
    expect(out).toEqual({ kind: "retry_backpressure", reason: "rate_limited" });
    expect(calls.enqueue).toEqual([]);
    expect(calls.recordResult).toEqual([false]);
  });

  it("(8b) lô 401 → cần đăng nhập lại + CHỐT run can_dang_nhap_lai; KHÔNG breaker", async () => {
    const { deps, calls } = makeDeps({ keoChunk: async () => chunkFailed("session_expired") });
    const out = await runDeltaJob(deps, DELTA);
    expect(out.kind).toBe("needs_reauth");
    expect(calls.reauthRuntime).toEqual(["session_expired"]);
    expect(calls.chotRun).toEqual([{ lanDongBoId: "ldb-1", trangThai: "can_dang_nhap_lai" }]);
    expect(calls.recordResult).toEqual([]);
    expect(calls.enqueue).toEqual([]);
  });

  it("(8c) lô local_limit → retry, KHÔNG tính vào breaker GDT (sự cố 2026-07-18)", async () => {
    const { deps, calls } = makeDeps({ keoChunk: async () => chunkFailed("local_limit") });
    const out = await runDeltaJob(deps, DELTA);
    expect(out.kind).toBe("retry");
    expect(calls.recordResult).toEqual([]);
    expect(calls.enqueue).toEqual([]);
  });

  it("(8d) lô transient → retry + ghi thất bại limiter; message giữ nguyên state để nối đúng chỗ", async () => {
    const { deps, calls } = makeDeps({ keoChunk: async () => chunkFailed("transient") });
    const msgDangDo = { ...DELTA, state: "trang-5" };
    const out = await runDeltaJob(deps, msgDangDo);
    expect(out.kind).toBe("retry");
    expect(calls.recordResult).toEqual([false]);
    expect(calls.keoChunk[0]?.state).toBe("trang-5");
    expect(calls.enqueue).toEqual([]);
  });

  it("(10a) trần tổng-trang: trangDaKeo GẦN trần + chunk CHƯA done → chotRun failed, KHÔNG enqueue", async () => {
    const { deps, calls } = makeDeps({
      keoChunk: async () => chunkOk({ done: false, state: "trang-ke", pages: 40 }),
    });
    const msg: DeltaPullMessage = { ...DELTA, trangDaKeo: TRAN_TONG_TRANG_DELTA - 5 };
    const out = await runDeltaJob(deps, msg);
    expect(out.kind).toBe("completed"); // ack — KHÔNG retry (đã chốt run, dừng chuỗi có kiểm soát)
    expect(calls.enqueue).toEqual([]);
    expect(calls.chotRun).toEqual([
      { lanDongBoId: "ldb-1", trangThai: "failed", thongDiepLoi: expect.any(String) },
    ]);
  });

  it("(10b) trần tổng-trang: DƯỚI trần → enqueue message kế mang trangDaKeo cộng đúng", async () => {
    const { deps, calls } = makeDeps({
      keoChunk: async () => chunkOk({ done: false, state: "trang-ke", pages: 10 }),
    });
    const msg: DeltaPullMessage = { ...DELTA, trangDaKeo: 100 };
    const out = await runDeltaJob(deps, msg);
    expect(out.kind).toBe("completed");
    expect(calls.chotRun).toEqual([]);
    const next = (calls.enqueue[0] ?? [])[0] as DeltaPullMessage;
    expect(next.trangDaKeo).toBe(110);
    expect(next.state).toBe("trang-ke");
  });

  it("(10c) trần tổng-trang: CHUYỂN family (hết trang, còn conLai) → trangDaKeo RESET về 0 (thiếu trường = 0)", async () => {
    const { deps, calls } = makeDeps({ keoChunk: async () => chunkOk({ done: true, pages: 3 }) });
    const msg: DeltaPullMessage = { ...DELTA, trangDaKeo: 900 };
    const out = await runDeltaJob(deps, msg);
    expect(out.kind).toBe("completed");
    const next = (calls.enqueue[0] ?? [])[0] as DeltaPullMessage;
    expect(next.family).toBe("sco");
    expect(next.trangDaKeo).toBeUndefined(); // vắng mặt = 0 theo hợp đồng message
  });

  it("(4/9 mirror) token hết hạn → needs_reauth; breaker mở → backpressure + breakerSkip", async () => {
    const hetHan = makeDeps({
      account: { tokenHienTai: null, tokenHetHan: null },
    });
    expect((await runDeltaJob(hetHan.deps, DELTA)).kind).toBe("needs_reauth");
    expect(hetHan.calls.reauthPreflight).toHaveLength(1);
    expect(hetHan.calls.keoChunk).toEqual([]);
    // (I1) delta LUÔN có lanDongBoId → token chết ở pre-flight cũng phải chốt run,
    // không chỉ 401 giữa chuỗi (kq.failureKind === "session_expired").
    expect(hetHan.calls.chotRun).toEqual([
      { lanDongBoId: DELTA.lanDongBoId, trangThai: "can_dang_nhap_lai" },
    ]);

    const breaker = makeDeps({ permit: { allowed: false, reason: "breaker_open" } });
    expect(await runDeltaJob(breaker.deps, DELTA)).toEqual({
      kind: "retry_backpressure",
      reason: "breaker_open",
    });
    expect(breaker.calls.breakerSkip).toBe(1);
    expect(breaker.calls.keoChunk).toEqual([]);
  });

  it("(4b mirror) tài khoản không tồn tại → retry, không kéo lô", async () => {
    const { deps, calls } = makeDeps({ account: null });
    const out = await runDeltaJob(deps, DELTA);
    expect(out.kind).toBe("retry");
    expect(calls.keoChunk).toEqual([]);
  });
});

describe("phanLoaiMessage — THỨ TỰ nhánh consumer (chốt chặn hồi quy)", () => {
  // BẪY: AuditSyncMessage/DeltaPullMessage là SIÊU TẬP cấu trúc của SyncJobMessage
  // (đủ tenantId/taikhoanId/direction/dateFrom/dateTo/period) → nếu nhánh audit/delta
  // đứng SAU nhánh header, message audit/delta sẽ âm thầm chạy như job đồng bộ CẢ
  // THÁNG mà TypeScript KHÔNG báo lỗi nào. Test này là chốt chặn duy nhất.
  it("message audit → nhánh 'audit' (KHÔNG rơi vào 'header'/runScheduledSync)", () => {
    expect(phanLoaiMessage(AUDIT).loai).toBe("audit");
  });

  it("message delta → nhánh 'delta' (KHÔNG rơi vào 'header'/runScheduledSync)", () => {
    expect(phanLoaiMessage(DELTA).loai).toBe("delta");
  });

  it("message detail → nhánh 'detail'", () => {
    expect(
      phanLoaiMessage({
        kind: "detail",
        tenantId: "t-A",
        taikhoanId: "acc-1",
        hoaDonId: "hd-1",
        ref: {
          nbmst: "0100000001",
          khhdon: "C26TAA",
          khmshdon: "1",
          shdon: "42",
          source: "normal",
        },
      }).loai,
    ).toBe("detail");
  });

  it("message header (KHÔNG có `kind` — tương thích lùi) → nhánh 'header'", () => {
    expect(
      phanLoaiMessage({
        tenantId: "t-A",
        taikhoanId: "acc-1",
        direction: "purchase",
        dateFrom: "01/07/2026",
        dateTo: "31/07/2026",
        period: "2026-07",
      }).loai,
    ).toBe("header");
  });
});

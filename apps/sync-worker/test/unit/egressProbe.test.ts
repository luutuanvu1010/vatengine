// GIÁM SÁT (mục C) — Test điều phối probe egress (nhóm unit, offline, DI).
// runEgressProbe: probe qua GdtTransport → phân loại → cập nhật health-state → phát
// cảnh báo khi vượt ngưỡng ổn định. Mọi I/O (transport, load/save state, sink cảnh
// báo) tiêm vào để test xác định. Probe KHÔNG được ném lỗi làm chết cron.
import type { ProbeResult, ProbeVerdict } from "@vat/gdt-client";
import { describe, expect, it, vi } from "vitest";
import { type EgressProbeDeps, runEgressProbe } from "../../src/egressProbe";
import { HEALTHY, type HealthState } from "../../src/health";

function result(verdict: ProbeVerdict): ProbeResult {
  return { transport: "direct-cf", verdict, latencyMs: 12, httpStatus: 200 };
}

// Deps giả: transport trả verdict định trước, health-state trong bộ nhớ, sink đếm.
function makeDeps(
  verdict: ProbeVerdict | (() => Promise<ProbeResult>),
  prev: HealthState = HEALTHY,
) {
  let saved: HealthState = prev;
  // Sink production trả `true` = Telegram ĐÃ NHẬN (hợp đồng mới, mục A của review U43).
  const emitAlert = vi.fn(async () => true);
  const deps: EgressProbeDeps = {
    transport: {
      name: "direct-cf",
      fetch: async () => new Response(),
      probe: typeof verdict === "function" ? verdict : async () => result(verdict),
    },
    loadHealth: async () => saved,
    saveHealth: async (s) => {
      saved = s;
    },
    emitAlert,
  };
  return { deps, emitAlert, getSaved: () => saved };
}

describe("runEgressProbe", () => {
  it("verdict OK → lưu HEALTHY, KHÔNG cảnh báo", async () => {
    const { deps, emitAlert, getSaved } = makeDeps("OK");
    const out = await runEgressProbe(deps);
    expect(out).toEqual({ verdict: "OK", alerted: false });
    expect(emitAlert).not.toHaveBeenCalled();
    expect(getSaved()).toEqual(HEALTHY);
  });

  it("GEO_BLOCKED thứ 3 (state trước = 2 xấu) → phát đúng một cảnh báo kèm result", async () => {
    const { deps, emitAlert } = makeDeps("GEO_BLOCKED", { consecutiveBad: 2, alerted: false });
    const out = await runEgressProbe(deps);
    expect(out).toEqual({ verdict: "GEO_BLOCKED", alerted: true });
    expect(emitAlert).toHaveBeenCalledTimes(1);
    expect(emitAlert).toHaveBeenCalledWith(
      { verdict: "GEO_BLOCKED", consecutiveBad: 3 },
      expect.objectContaining({ verdict: "GEO_BLOCKED", transport: "direct-cf" }),
    );
  });

  it("verdict xấu dưới ngưỡng → lưu state, KHÔNG cảnh báo", async () => {
    const { deps, emitAlert, getSaved } = makeDeps("RATE_LIMITED", HEALTHY);
    const out = await runEgressProbe(deps);
    expect(out.alerted).toBe(false);
    expect(emitAlert).not.toHaveBeenCalled();
    expect(getSaved().consecutiveBad).toBe(1);
  });

  // MỤC A — cùng khuôn với canary: cảnh báo KHÔNG giao được thì KHÔNG được ghi
  // `alerted: true`, nếu không một lần POST Telegram hỏng là im tới tận khi hồi phục.
  it("sink trả false (không giao được) → lưu alerted false ⇒ tick sau báo lại", async () => {
    const { deps, emitAlert, getSaved } = makeDeps("GEO_BLOCKED", {
      consecutiveBad: 2,
      alerted: false,
    });
    emitAlert.mockResolvedValue(false);
    await runEgressProbe(deps);
    expect(getSaved().alerted).toBe(false);
    // lastVerdict PHẢI còn: gate enqueue (isEgressBlocked) đọc nó, mất là mở cổng lại.
    expect(getSaved().lastVerdict).toBe("GEO_BLOCKED");
    await runEgressProbe(deps);
    expect(emitAlert).toHaveBeenCalledTimes(2);
  });

  it("sink NÉM → cron không chết, coi như chưa giao (alerted false)", async () => {
    const { deps, getSaved } = makeDeps("WAF_BLOCKED", { consecutiveBad: 2, alerted: false });
    deps.emitAlert = () => {
      throw new Error("telegram chết");
    };
    await expect(runEgressProbe(deps)).resolves.toEqual({ verdict: "WAF_BLOCKED", alerted: true });
    expect(getSaved().alerted).toBe(false);
    expect(getSaved().lastVerdict).toBe("WAF_BLOCKED");
  });

  it("transport.probe() ném lỗi → coi như ERROR, KHÔNG ném ra ngoài (cron sống)", async () => {
    const throwing = async (): Promise<ProbeResult> => {
      throw new Error("boom");
    };
    const { deps, getSaved } = makeDeps(throwing, HEALTHY);
    const out = await runEgressProbe(deps);
    expect(out.verdict).toBe("ERROR");
    expect(getSaved().consecutiveBad).toBe(1);
  });
});

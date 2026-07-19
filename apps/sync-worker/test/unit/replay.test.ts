import { describe, expect, it } from "vitest";
import { replayDeadLetters, replayMessages } from "../../src/replay";

describe("H-B.6 — replay", () => {
  it("replayMessages reset bpAttempt về 0 (thuần)", () => {
    const out = replayMessages([
      {
        payload: {
          tenantId: "t1",
          taikhoanId: "a1",
          direction: "purchase",
          dateFrom: "01/07/2026",
          dateTo: "31/07/2026",
          period: "2026-07",
          bpAttempt: 9,
        },
      },
    ]);
    expect(out.length).toBe(1);
    expect((out[0] as { bpAttempt?: number }).bpAttempt).toBe(0);
  });

  it("replayDeadLetters gửi lại + đánh dấu da_phat_lai (mock db/queue)", async () => {
    const updates: unknown[] = [];
    const sent: unknown[] = [];
    const tx = {
      execute: async () => ({ rows: [] }), // withTenant set_config
      select: () => ({
        from: () => ({
          where: async () => [
            {
              id: "r1",
              payload: {
                tenantId: "t1",
                taikhoanId: "a1",
                direction: "sold",
                dateFrom: "01/07/2026",
                dateTo: "31/07/2026",
                period: "2026-07",
                bpAttempt: 3,
              },
            },
          ],
        }),
      }),
      update: (_t: unknown) => ({
        set: (v: unknown) => ({
          where: async () => {
            updates.push(v);
          },
        }),
      }),
    };
    const db = {
      transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    } as unknown as import("../../src/types").AnyDb;
    const queue = {
      send: async (b: unknown) => {
        sent.push(b);
      },
    } as unknown as Queue;
    const res = await replayDeadLetters(db, queue, { tenantId: "t1" });
    expect(res.daPhatLai).toBe(1);
    expect((sent[0] as { bpAttempt?: number }).bpAttempt).toBe(0);
    expect((updates[0] as { trangThai?: string }).trangThai).toBe("da_phat_lai");
  });
});

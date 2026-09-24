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

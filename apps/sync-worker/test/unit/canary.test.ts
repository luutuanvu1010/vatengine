// U43 — Điều phối canary (unit, offline, DI): canaryAuthenticate qua transport → máy trạng
// thái → lưu DO → phát cảnh báo. Không được ném làm chết cron; lỗi bất ngờ = ERROR.
import type { GdtTransport } from "@vat/gdt-client";
import { describe, expect, it, vi } from "vitest";
import { type CanaryDeps, runCanary } from "../../src/canary";
import type { CanaryAlert, CanaryState } from "../../src/canaryHealth";

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
  const vet: string[] = [];
  // Sink production trả `true` = Telegram ĐÃ NHẬN. `vi.fn()` trần trả undefined ⇒ theo hợp
  // đồng mới là "chưa giao", nên phải khai báo tường minh.
  const emitCanaryAlert = vi.fn(async (_alert: CanaryAlert) => {
    vet.push("emit");
    return true;
  });
  const deps: CanaryDeps = {
    transport,
    loadCanary: async () => {
      vet.push("load");
      return saved;
    },
    saveCanary: async (s) => {
      vet.push("save");
      saved = s;
    },
    emitCanaryAlert,
    now: () => new Date("2026-09-24T05:00:00.000Z"),
  };
  return { deps, emitCanaryAlert, getSaved: () => saved, vet };
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
    expect(getSaved()).toEqual({
      lastVerdict: "OK",
      consecutiveBad: 0,
      alerted: false,
      daChao: true,
    });
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
    if (!alert) throw new Error("không có cảnh báo nào được phát");
    expect(alert.kind).toBe("chan");
    expect(alert.result.httpStatus).toBe(403);
    expect(alert.result.message).toContain("hành vi không hợp lệ");
  });

  // MỤC A (khuyết tật CRITICAL của lượt trước): trước đây state lưu TRƯỚC khi gọi sink và
  // `guiCanhBaoTelegram` KHÔNG BAO GIỜ ném (thiếu cấu hình/Telegram 4xx/mạng đều trả giá
  // trị) ⇒ một lần POST hỏng ở tick cảnh báo ĐẦU TIÊN là máy trạng thái im tới tận khi hồi
  // phục — mất luôn tin "GDT đang CHẶN". Nay: sink trả false = chưa giao ⇒ tick sau BÁO LẠI.
  it("sink trả false (không giao được — dạng production) → tick sau BÁO LẠI", async () => {
    const { deps, emitCanaryAlert, getSaved } = makeDeps(
      transportGia(() => json(403, { message: "Hệ thống phát hiện hành vi không hợp lệ." })),
      { consecutiveBad: 0, alerted: false, lastVerdict: "OK", daChao: true },
    );
    emitCanaryAlert.mockResolvedValue(false);
    await expect(runCanary(deps)).resolves.toEqual({ verdict: "WAF_BLOCKED", alerted: true });
    // Diễn biến vẫn được ghi (gate enqueue cần lastVerdict), chỉ dấu "đã báo" là KHÔNG.
    expect(getSaved()).toEqual({
      lastVerdict: "WAF_BLOCKED",
      consecutiveBad: 1,
      alerted: false,
      since: "2026-09-24T05:00:00.000Z",
      daChao: true,
    });
    // Tick sau: vẫn bị chặn ⇒ báo lại lần nữa.
    await runCanary(deps);
    expect(emitCanaryAlert).toHaveBeenCalledTimes(2);
    expect(emitCanaryAlert.mock.calls[1]?.[0]).toMatchObject({ kind: "chan" });
  });

  it("sink NÉM (phòng thủ) → cron không chết, coi như chưa giao ⇒ tick sau báo lại", async () => {
    const { deps, getSaved } = makeDeps(
      transportGia(() => json(403, { message: "Hệ thống phát hiện hành vi không hợp lệ." })),
      { consecutiveBad: 0, alerted: false, lastVerdict: "OK", daChao: true },
    );
    deps.emitCanaryAlert = () => {
      throw new Error("telegram chết");
    };
    await expect(runCanary(deps)).resolves.toEqual({ verdict: "WAF_BLOCKED", alerted: true });
    expect(getSaved()?.alerted).toBe(false);
    expect(getSaved()?.lastVerdict).toBe("WAF_BLOCKED");
  });

  // MỤC B — tick đầu sau deploy vướng nhiễu mạng thì tin "đã bật" KHÔNG được mất vĩnh viễn.
  it("tick đầu TIMEOUT (không alert) → tick OK sau VẪN chào bat_giam_sat", async () => {
    let lanDau = true;
    const { deps, emitCanaryAlert } = makeDeps(
      transportGia(() => {
        if (lanDau) {
          lanDau = false;
          throw new Error("mạng chập");
        }
        return json(401, { message: "Mã captcha không đúng." });
      }),
      undefined,
    );
    await runCanary(deps);
    expect(emitCanaryAlert).not.toHaveBeenCalled();
    await runCanary(deps);
    expect(emitCanaryAlert).toHaveBeenCalledWith(expect.objectContaining({ kind: "bat_giam_sat" }));
  });

  // MỤC A + F.3 — hợp đồng THỨ TỰ: emit TRƯỚC, save SAU. Ngược lại là tái lập đúng khuyết
  // tật đã sửa (lưu `alerted: true` rồi mới biết tin không tới).
  it("có alert → thứ tự gọi thật là load → emit → save; không alert → load → save", async () => {
    const chan = makeDeps(
      transportGia(() => json(403, { message: "Hệ thống phát hiện hành vi không hợp lệ." })),
      { consecutiveBad: 0, alerted: false, lastVerdict: "OK", daChao: true },
    );
    await runCanary(chan.deps);
    expect(chan.vet).toEqual(["load", "emit", "save"]);

    const yen = makeDeps(
      transportGia(() => json(401, { message: "Mã captcha không đúng." })),
      {
        consecutiveBad: 0,
        alerted: false,
        lastVerdict: "OK",
        daChao: true,
      },
    );
    await runCanary(yen.deps);
    expect(yen.vet).toEqual(["load", "save"]);
  });

  // MỤC C — "Im lặng không phải thành công": mỗi tick phải để lại một dòng nhịp tim để
  // `wrangler tail` nghiệm thu được (spec §6 bước 3), kể cả khi không có cảnh báo nào.
  it("mỗi tick ghi một dòng nhịp tim gdt_canary_tick mức INFO qua console.log", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const { deps } = makeDeps(
        transportGia(() => json(401, { message: "Mã captcha không đúng." })),
        { consecutiveBad: 0, alerted: false, lastVerdict: "OK", daChao: true },
      );
      await runCanary(deps);
      const dong = log.mock.calls
        .map((c) => String(c[0]))
        .find((s) => s.includes("gdt_canary_tick"));
      expect(dong).toBeDefined();
      const obj = JSON.parse(String(dong));
      expect(obj).toMatchObject({ level: "INFO", event: "gdt_canary_tick", verdict: "OK" });
      expect(obj.httpStatus).toBe(401);
      expect(typeof obj.latencyMs).toBe("number");
    } finally {
      log.mockRestore();
    }
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

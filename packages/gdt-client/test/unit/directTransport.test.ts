// Test transport egress T0 (direct-cf) — nhóm unit, OFFLINE (mock fetch, không mạng
// thật GDT). Chỉ kiểm hành vi ủy quyền + phân loại probe; egress THẬT tới GDT đã
// kiểm chứng ở ADR-0001 Amendment #3/#4 và được canh bởi nhóm `contract`.
import { describe, expect, it, vi } from "vitest";
import { createDirectCfTransport } from "../../src/directTransport";

describe("createDirectCfTransport — egress T0 (direct-cf)", () => {
  it("name = 'direct-cf'", () => {
    const t = createDirectCfTransport(vi.fn());
    expect(t.name).toBe("direct-cf");
  });

  it("fetch() ỦY QUYỀN nguyên vẹn url+init cho fetch tiêm vào và trả lại response", async () => {
    const res = new Response("ok", { status: 200 });
    const fake = vi.fn(async () => res);
    const t = createDirectCfTransport(fake as unknown as typeof fetch);

    const init = { method: "GET", headers: { authorization: "Bearer x" } };
    const out = await t.fetch("https://hoadondientu.gdt.gov.vn/api/captcha", init);

    expect(out).toBe(res);
    expect(fake).toHaveBeenCalledWith("https://hoadondientu.gdt.gov.vn/api/captcha", init);
  });

  it("probe() 200 → verdict OK; kèm httpStatus + latencyMs", async () => {
    const fake = vi.fn(async () => new Response("{}", { status: 200 }));
    const t = createDirectCfTransport(fake as unknown as typeof fetch);
    const p = await t.probe();
    expect(p.transport).toBe("direct-cf");
    expect(p.verdict).toBe("OK");
    expect(p.httpStatus).toBe(200);
    expect(typeof p.latencyMs).toBe("number");
  });

  it("probe() lỗi mạng (fetch ném) → verdict ERROR, không ném ra ngoài", async () => {
    const fake = vi.fn(async () => {
      throw new Error("mạng hỏng");
    });
    const t = createDirectCfTransport(fake as unknown as typeof fetch);
    const p = await t.probe();
    expect(p.verdict).toBe("ERROR");
  });
});

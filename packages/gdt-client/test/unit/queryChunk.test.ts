// Task 2: gdt-client — queryInvoicesChunk (kéo theo lô, con trỏ nối tiếp) +
// queryInvoiceTotal (oracle total mềm). Xem .superpowers/sdd/task-2-brief.md.
import { describe, expect, it } from "vitest";
import { GdtError } from "../../src/errors";
import { queryInvoiceTotal, queryInvoicesChunk } from "../../src/query";
import type { GdtTransport } from "../../src/transport";

/** Transport giả trả lần lượt các "trang" theo thứ tự gọi (không phân biệt theo URL) —
 * đủ cho các kịch bản tuần tự của queryInvoicesChunk/queryInvoiceTotal. */
function fakeTransport(pages: Array<{ status?: number; body: unknown }>): GdtTransport {
  let i = 0;
  return {
    name: "fake",
    fetch: async () => {
      const p = pages[Math.min(i, pages.length - 1)];
      i += 1;
      return new Response(JSON.stringify(p?.body ?? {}), { status: p?.status ?? 200 });
    },
    probe: async () => {
      throw new Error("không dùng trong test này");
    },
  };
}

const row = (shdon: number) => ({
  nbmst: "1",
  khmshdon: "1",
  khhdon: "C26M",
  shdon,
  tdlap: "2026-06-01",
});

describe("queryInvoicesChunk", () => {
  it("dừng ở maxPages và trả state để nối tiếp", async () => {
    const t = fakeTransport([
      { body: { datas: [row(1), row(2)], total: 5, state: "s1", time: 0 } },
      { body: { datas: [row(3), row(4)], total: 5, state: "s2", time: 0 } },
    ]);
    const r = await queryInvoicesChunk(t, "tk", {
      direction: "purchase",
      family: "sco",
      dateFrom: "01/06/2026",
      dateTo: "30/06/2026",
      maxPages: 2,
      size: 2,
    });
    expect(r.pages).toBe(2);
    expect(r.state).toBe("s2");
    expect(r.total).toBe(5);
    expect(r.rows.map((x) => x._source)).toEqual(["sco", "sco", "sco", "sco"]);
  });

  it("hết trang (datas < size) → state undefined", async () => {
    const t = fakeTransport([{ body: { datas: [row(1)], total: 1, state: "s1", time: 0 } }]);
    const r = await queryInvoicesChunk(t, "tk", {
      direction: "purchase",
      family: "normal",
      dateFrom: "01/06/2026",
      dateTo: "30/06/2026",
      maxPages: 40,
      size: 2,
    });
    expect(r.state).toBeUndefined();
  });

  it("401 → GdtError SESSION_EXPIRED", async () => {
    const t = fakeTransport([{ status: 401, body: {} }]);
    await expect(
      queryInvoicesChunk(t, "tk", {
        direction: "purchase",
        family: "normal",
        dateFrom: "01/06/2026",
        dateTo: "30/06/2026",
        maxPages: 1,
      }),
    ).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
  });
});

describe("queryInvoiceTotal", () => {
  it("trả total từ trang size=1", async () => {
    const t = fakeTransport([{ body: { datas: [row(1)], total: 7023, state: "s", time: 0 } }]);
    expect(
      await queryInvoiceTotal(t, "tk", {
        direction: "purchase",
        family: "sco",
        dateFrom: "01/06/2026",
        dateTo: "30/06/2026",
      }),
    ).toBe(7023);
  });

  it("sco 404 → null (không áp dụng), normal 404 → ném", async () => {
    const t404 = () => fakeTransport([{ status: 404, body: { message: "x" } }]);
    expect(
      await queryInvoiceTotal(t404(), "tk", {
        direction: "purchase",
        family: "sco",
        dateFrom: "01/06/2026",
        dateTo: "30/06/2026",
      }),
    ).toBeNull();
    await expect(
      queryInvoiceTotal(t404(), "tk", {
        direction: "purchase",
        family: "normal",
        dateFrom: "01/06/2026",
        dateTo: "30/06/2026",
      }),
    ).rejects.toBeInstanceOf(GdtError);
  });
});

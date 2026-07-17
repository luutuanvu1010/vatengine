import { afterEach, describe, expect, it, vi } from "vitest";
import { INVOICE_ENDPOINTS } from "../../src/endpoints";
import { GdtError } from "../../src/errors";
import { buildSearch, queryInvoices } from "../../src/query";
import type { GdtTransport } from "../../src/transport";

const TOKEN = "jwt-token-xyz";

// Tạo một hóa đơn giả với khóa tự nhiên đủ 5 trường; `shdon` để phân biệt.
function inv(shdon: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    nbmst: "0100000001",
    khmshdon: "1",
    khhdon: "C26TAA",
    shdon,
    tdlap: "2026-01-05",
    ...extra,
  };
}

type Handler = (params: URLSearchParams) => Response;

function makeTransport(handlers: Record<string, Handler>): {
  transport: GdtTransport;
  calls: Array<{ url: string; init?: RequestInit }>;
} {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const transport: GdtTransport = {
    name: "mock",
    async fetch(url, init) {
      calls.push({ url, init });
      const u = new URL(url);
      const handler = handlers[u.pathname];
      if (!handler) return new Response("not found", { status: 404 });
      return handler(u.searchParams);
    },
    async probe() {
      throw new Error("không dùng trong test này");
    },
  };
  return { transport, calls };
}

function page(datas: unknown[], state?: string): Response {
  const body = state ? { datas, state } : { datas };
  return new Response(JSON.stringify(body), { status: 200 });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildSearch", () => {
  it("sinh RSQL khoảng ngày khi không lọc trạng thái", () => {
    expect(buildSearch("01/01/2026", "31/01/2026")).toBe(
      "tdlap=ge=01/01/2026T00:00:00;tdlap=le=31/01/2026T23:59:59",
    );
  });

  it("nối ttxly khi truyền trạng thái", () => {
    expect(buildSearch("01/01/2026", "31/01/2026", 5)).toBe(
      "tdlap=ge=01/01/2026T00:00:00;tdlap=le=31/01/2026T23:59:59;ttxly==5",
    );
  });
});

describe("queryInvoices — phân trang", () => {
  it("tự phân trang nhiều trang, dừng khi trang cuối ngắn hơn size", async () => {
    const { transport, calls } = makeTransport({
      [INVOICE_ENDPOINTS.purchase]: (p) => {
        const state = p.get("state");
        if (!state) return page([inv("1"), inv("2")], "s1");
        if (state === "s1") return page([inv("3"), inv("4")], "s2");
        return page([inv("5")]); // len 1 < size 2 → dừng
      },
    });

    const rows = await queryInvoices(transport, TOKEN, {
      direction: "purchase",
      dateFrom: "01/01/2026",
      dateTo: "31/01/2026",
      includeSco: false,
      size: 2,
    });

    expect(rows).toHaveLength(5);
    expect(calls).toHaveLength(3);
  });

  it("dừng khi thiếu con trỏ state dù trang đầy", async () => {
    const { transport, calls } = makeTransport({
      [INVOICE_ENDPOINTS.purchase]: () => page([inv("1"), inv("2")]), // đầy size nhưng không state
    });

    const rows = await queryInvoices(transport, TOKEN, {
      direction: "purchase",
      dateFrom: "01/01/2026",
      dateTo: "31/01/2026",
      includeSco: false,
      size: 2,
    });

    expect(rows).toHaveLength(2);
    expect(calls).toHaveLength(1);
  });

  it("giãn nhịp (minIntervalMs) giữa các trang, KHÔNG chờ trước trang đầu", async () => {
    const { transport } = makeTransport({
      [INVOICE_ENDPOINTS.purchase]: (p) => {
        const state = p.get("state");
        if (!state) return page([inv("1"), inv("2")], "s1");
        return page([inv("3")]); // len 1 < size 2 → dừng
      },
    });
    const waits: number[] = [];

    const rows = await queryInvoices(
      transport,
      TOKEN,
      {
        direction: "purchase",
        dateFrom: "01/01/2026",
        dateTo: "31/01/2026",
        includeSco: false,
        size: 2,
      },
      {
        minIntervalMs: 250,
        sleepFn: async (ms) => {
          waits.push(ms);
        },
      },
    );

    expect(rows).toHaveLength(3);
    expect(waits).toEqual([250]); // 2 trang → 1 khoảng nghỉ giữa chúng
  });

  it("minIntervalMs = 0 (mặc định) → không chờ giữa các trang", async () => {
    const { transport } = makeTransport({
      [INVOICE_ENDPOINTS.purchase]: (p) => {
        const state = p.get("state");
        if (!state) return page([inv("1"), inv("2")], "s1");
        return page([inv("3")]);
      },
    });
    const waits: number[] = [];

    await queryInvoices(
      transport,
      TOKEN,
      {
        direction: "purchase",
        dateFrom: "01/01/2026",
        dateTo: "31/01/2026",
        includeSco: false,
        size: 2,
      },
      {
        sleepFn: async (ms) => {
          waits.push(ms);
        },
      },
    );

    expect(waits).toEqual([]);
  });

  it("chặn vòng lặp vô hạn khi server trả state mãi + cảnh báo cắt cụt", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let n = 0;
    const { transport, calls } = makeTransport({
      [INVOICE_ENDPOINTS.purchase]: () => {
        n += 1;
        return page([inv(String(n))], "always"); // luôn có state, len 1 == size 1
      },
    });

    const rows = await queryInvoices(transport, TOKEN, {
      direction: "purchase",
      dateFrom: "01/01/2026",
      dateTo: "31/01/2026",
      includeSco: false,
      size: 1,
    });

    // Guard nội bộ phải cắt vòng lặp; không treo, số trang có trần.
    expect(calls.length).toBeLessThanOrEqual(2000);
    expect(rows.length).toBe(calls.length);
    // Chạm trần KHÔNG được im lặng — phải có cảnh báo cắt cụt.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("cắt cụt"));
  });
});

describe("queryInvoices — gộp normal + sco & khử trùng", () => {
  it("gộp kết quả hai họ endpoint, gắn _source/_direction", async () => {
    const { transport } = makeTransport({
      [INVOICE_ENDPOINTS.purchase]: () => page([inv("100")]),
      [INVOICE_ENDPOINTS.scoPurchase]: () => page([inv("200")]),
    });

    const rows = await queryInvoices(transport, TOKEN, {
      direction: "purchase",
      dateFrom: "01/01/2026",
      dateTo: "31/01/2026",
    });

    expect(rows).toHaveLength(2);
    const bySo = Object.fromEntries(rows.map((r) => [r.shdon, r]));
    expect(bySo["100"]._source).toBe("normal");
    expect(bySo["200"]._source).toBe("sco");
    expect(bySo["100"]._direction).toBe("purchase");
  });

  it("bảo toàn TOÀN BỘ trường thô của hóa đơn (raw_json không mất trường)", async () => {
    // Tiêu chí nghiệm thu: luôn giữ raw_json — adapter không được lược bớt trường
    // lạ ngoài khóa tự nhiên. Nếu ai đó đổi sang trích field thủ công, test này đỏ.
    const { transport } = makeTransport({
      [INVOICE_ENDPOINTS.purchase]: () =>
        page([inv("42", { tgtttbso: 1_500_000, nbten: "CÔNG TY A", ttxly: 5, truong_la: "x" })]),
    });

    const rows = await queryInvoices(transport, TOKEN, {
      direction: "purchase",
      dateFrom: "01/01/2026",
      dateTo: "31/01/2026",
      includeSco: false,
    });

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row).toMatchObject({
      nbmst: "0100000001",
      khmshdon: "1",
      khhdon: "C26TAA",
      shdon: "42",
      tdlap: "2026-01-05",
      tgtttbso: 1_500_000,
      nbten: "CÔNG TY A",
      ttxly: 5,
      truong_la: "x",
      _source: "normal",
      _direction: "purchase",
    });
  });

  it("khử trùng theo khóa tự nhiên khi trùng giữa normal và sco", async () => {
    const { transport } = makeTransport({
      [INVOICE_ENDPOINTS.purchase]: () => page([inv("777")]),
      [INVOICE_ENDPOINTS.scoPurchase]: () => page([inv("777")]), // cùng khóa tự nhiên
    });

    const rows = await queryInvoices(transport, TOKEN, {
      direction: "purchase",
      dateFrom: "01/01/2026",
      dateTo: "31/01/2026",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?._source).toBe("normal"); // normal xử lý trước, giữ bản đầu
  });
});

describe("queryInvoices — lỗi & biên", () => {
  it("401 giữa phân trang → GdtError hết phiên, không nuốt lỗi", async () => {
    const { transport } = makeTransport({
      [INVOICE_ENDPOINTS.purchase]: (p) => {
        if (!p.get("state")) return page([inv("1"), inv("2")], "s1");
        return new Response("{}", { status: 401 });
      },
    });

    await expect(
      queryInvoices(transport, TOKEN, {
        direction: "purchase",
        dateFrom: "01/01/2026",
        dateTo: "31/01/2026",
        includeSco: false,
        size: 2,
      }),
    ).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
  });

  it("sco trả 404 (endpoint không áp dụng cho tài khoản) được tha thứ có cảnh báo, vẫn trả kết quả normal", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { transport } = makeTransport({
      [INVOICE_ENDPOINTS.purchase]: () => page([inv("1")]),
      // CHỈ 404 mới được coi là "tài khoản không có máy tính tiền" và bỏ qua.
      [INVOICE_ENDPOINTS.scoPurchase]: () => new Response("not found", { status: 404 }),
    });

    const rows = await queryInvoices(
      transport,
      TOKEN,
      { direction: "purchase", dateFrom: "01/01/2026", dateTo: "31/01/2026" },
      { maxAttempts: 1 },
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?._source).toBe("normal");
    // Bỏ qua nhánh sco 404 KHÔNG được im lặng — phải ghi cảnh báo.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("sco"));
  });

  it("sco lỗi thật KHÁC 404 (5xx) → propagate, KHÔNG nuốt", async () => {
    const { transport } = makeTransport({
      [INVOICE_ENDPOINTS.purchase]: () => page([inv("1")]),
      [INVOICE_ENDPOINTS.scoPurchase]: () => new Response("boom", { status: 500 }),
    });

    await expect(
      queryInvoices(
        transport,
        TOKEN,
        { direction: "purchase", dateFrom: "01/01/2026", dateTo: "31/01/2026" },
        { maxAttempts: 1 },
      ),
    ).rejects.toBeInstanceOf(GdtError);
  });

  it("normal lỗi HTTP → propagate GdtError", async () => {
    const { transport } = makeTransport({
      [INVOICE_ENDPOINTS.purchase]: () => new Response("boom", { status: 500 }),
    });

    await expect(
      queryInvoices(
        transport,
        TOKEN,
        { direction: "purchase", dateFrom: "01/01/2026", dateTo: "31/01/2026", includeSco: false },
        { maxAttempts: 1 },
      ),
    ).rejects.toBeInstanceOf(GdtError);
  });

  it("401 ở nhánh sco vẫn propagate (không bị nuốt như lỗi thường)", async () => {
    const { transport } = makeTransport({
      [INVOICE_ENDPOINTS.purchase]: () => page([inv("1")]),
      [INVOICE_ENDPOINTS.scoPurchase]: () => new Response("{}", { status: 401 }),
    });

    await expect(
      queryInvoices(transport, TOKEN, {
        direction: "purchase",
        dateFrom: "01/01/2026",
        dateTo: "31/01/2026",
      }),
    ).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
  });

  it("envelope thiếu 'datas' → coi rỗng + cảnh báo, KHÔNG throw/không circuit breaker", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { transport } = makeTransport({
      [INVOICE_ENDPOINTS.purchase]: () => new Response(JSON.stringify({}), { status: 200 }),
    });

    const rows = await queryInvoices(transport, TOKEN, {
      direction: "purchase",
      dateFrom: "01/01/2026",
      dateTo: "31/01/2026",
      includeSco: false,
    });

    expect(rows).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
  });
});

describe("queryInvoices — token & tham số", () => {
  it("gắn Authorization: Bearer <token> trên mọi request", async () => {
    const { transport, calls } = makeTransport({
      [INVOICE_ENDPOINTS.purchase]: () => page([inv("1")]),
      [INVOICE_ENDPOINTS.scoPurchase]: () => page([inv("2")]),
    });

    await queryInvoices(transport, TOKEN, {
      direction: "purchase",
      dateFrom: "01/01/2026",
      dateTo: "31/01/2026",
    });

    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      const headers = new Headers(c.init?.headers);
      expect(headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
    }
  });

  it("statuses tùy chọn → mỗi trạng thái là một truy vấn RSQL riêng rồi gộp", async () => {
    const searches: string[] = [];
    const { transport } = makeTransport({
      [INVOICE_ENDPOINTS.sold]: (p) => {
        const search = p.get("search") ?? "";
        searches.push(search);
        // Trả row khác nhau theo trạng thái để không bị khử trùng.
        const st = search.includes("ttxly==5") ? "5" : "6";
        return page([inv(`s${st}`)]);
      },
    });

    const rows = await queryInvoices(transport, TOKEN, {
      direction: "sold",
      dateFrom: "01/01/2026",
      dateTo: "31/01/2026",
      statuses: [5, 6],
      includeSco: false,
    });

    expect(rows).toHaveLength(2);
    expect(searches.some((s) => s.includes("ttxly==5"))).toBe(true);
    expect(searches.some((s) => s.includes("ttxly==6"))).toBe(true);
  });

  it("không truyền statuses → không lọc ttxly (mặc định lấy tất cả)", async () => {
    let seenSearch = "";
    const { transport } = makeTransport({
      [INVOICE_ENDPOINTS.purchase]: (p) => {
        seenSearch = p.get("search") ?? "";
        return page([inv("1")]);
      },
    });

    await queryInvoices(transport, TOKEN, {
      direction: "purchase",
      dateFrom: "01/01/2026",
      dateTo: "31/01/2026",
      includeSco: false,
    });

    expect(seenSearch).not.toContain("ttxly");
  });
});

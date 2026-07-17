import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type InvoiceDetailRef,
  getInvoiceDetail,
  mapDetailLines,
  toDetailRef,
} from "../../src/detail";
import { DETAIL_ENDPOINTS } from "../../src/endpoints";
import { GdtError } from "../../src/errors";
import type { InvoiceRow } from "../../src/query";
import type { GdtTransport } from "../../src/transport";

const TOKEN = "jwt-token-xyz";

const REF: InvoiceDetailRef = {
  nbmst: "0100000001",
  khhdon: "C26TAA",
  khmshdon: "1",
  shdon: "42",
  source: "normal",
};

// Một dòng hàng theo HÌNH DẠNG THẬT đã kiểm chứng (2026-07-13): thuế suất ở hai
// trường ltsuat (chuỗi "8%") + tsuat (số 0.08); giá trị tiền là số giả lập.
function line(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    stt: 1,
    ten: "Dịch vụ in ấn",
    dvtinh: "Cái",
    sluong: 10,
    dgia: 100,
    thtien: 1000,
    ltsuat: "8%",
    tsuat: 0.08,
    tthue: null,
    tchat: 1,
    ...extra,
  };
}

// Body detail tối giản theo envelope thật: mảng dòng hàng ở khóa `hdhhdvu` + vài
// trường cấp-hóa-đơn để khẳng định getInvoiceDetail giữ nguyên toàn bộ.
function detailBody(lines: unknown[] = [line()]): Record<string, unknown> {
  return {
    hdhhdvu: lines,
    nbmst: "0100000001",
    nbten: "CÔNG TY A",
    nmmst: "0100000002",
    khmshdon: 1,
    khhdon: "C26TAA",
    shdon: 42,
    tdlap: "2026-05-13T00:00:00",
    ttxly: 5,
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

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getInvoiceDetail — chọn endpoint theo nguồn", () => {
  it("source 'normal' → gọi /api/query/invoices/detail", async () => {
    const { transport, calls } = makeTransport({
      [DETAIL_ENDPOINTS.normal]: () => ok(detailBody()),
    });
    await getInvoiceDetail(transport, TOKEN, { ...REF, source: "normal" });
    expect(new URL(calls[0]?.url ?? "").pathname).toBe(DETAIL_ENDPOINTS.normal);
  });

  it("source 'sco' → gọi /api/sco-query/invoices/detail", async () => {
    const { transport, calls } = makeTransport({
      [DETAIL_ENDPOINTS.sco]: () => ok(detailBody()),
    });
    await getInvoiceDetail(transport, TOKEN, { ...REF, source: "sco" });
    expect(new URL(calls[0]?.url ?? "").pathname).toBe(DETAIL_ENDPOINTS.sco);
  });

  it("không truyền source → mặc định 'normal'", async () => {
    const { transport, calls } = makeTransport({
      [DETAIL_ENDPOINTS.normal]: () => ok(detailBody()),
    });
    await getInvoiceDetail(transport, TOKEN, {
      nbmst: REF.nbmst,
      khhdon: REF.khhdon,
      khmshdon: REF.khmshdon,
      shdon: REF.shdon,
    });
    expect(new URL(calls[0]?.url ?? "").pathname).toBe(DETAIL_ENDPOINTS.normal);
  });
});

describe("getInvoiceDetail — tham số & token", () => {
  it("truyền đúng 4 tham số định danh, KHÔNG có tdlap (ĐÃ KIỂM CHỨNG)", async () => {
    const { transport, calls } = makeTransport({
      [DETAIL_ENDPOINTS.normal]: () => ok(detailBody()),
    });
    await getInvoiceDetail(transport, TOKEN, REF);
    const q = new URL(calls[0]?.url ?? "").searchParams;
    expect(q.get("nbmst")).toBe("0100000001");
    expect(q.get("khhdon")).toBe("C26TAA");
    expect(q.get("khmshdon")).toBe("1");
    expect(q.get("shdon")).toBe("42");
    expect(q.has("tdlap")).toBe(false);
  });

  it("gắn Authorization: Bearer <token>", async () => {
    const { transport, calls } = makeTransport({
      [DETAIL_ENDPOINTS.normal]: () => ok(detailBody()),
    });
    await getInvoiceDetail(transport, TOKEN, REF);
    const headers = new Headers(calls[0]?.init?.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
  });

  it("giữ NGUYÊN toàn bộ body thô (nền cho raw_json ở U4)", async () => {
    const body = detailBody();
    const { transport } = makeTransport({ [DETAIL_ENDPOINTS.normal]: () => ok(body) });
    const detail = await getInvoiceDetail(transport, TOKEN, REF);
    expect(detail).toEqual(body);
  });
});

describe("getInvoiceDetail — lỗi & biên", () => {
  it("401 → GdtError SESSION_EXPIRED, không nuốt lỗi", async () => {
    const { transport } = makeTransport({
      [DETAIL_ENDPOINTS.normal]: () => new Response("{}", { status: 401 }),
    });
    await expect(getInvoiceDetail(transport, TOKEN, REF)).rejects.toMatchObject({
      code: "SESSION_EXPIRED",
    });
  });

  it("HTTP 5xx (sau hết retry) → GdtError", async () => {
    const { transport } = makeTransport({
      [DETAIL_ENDPOINTS.normal]: () => new Response("boom", { status: 500 }),
    });
    await expect(
      getInvoiceDetail(transport, TOKEN, REF, { maxAttempts: 1 }),
    ).rejects.toBeInstanceOf(GdtError);
  });

  it("429 (sau hết retry) → GdtError mang httpStatus=429 (U25 AC4)", async () => {
    const { transport } = makeTransport({
      [DETAIL_ENDPOINTS.normal]: () => new Response("{}", { status: 429 }),
    });
    await expect(getInvoiceDetail(transport, TOKEN, REF, { maxAttempts: 1 })).rejects.toMatchObject(
      { httpStatus: 429 },
    );
  });

  it("body không phải JSON → GdtError", async () => {
    const { transport } = makeTransport({
      [DETAIL_ENDPOINTS.normal]: () => new Response("<html>", { status: 200 }),
    });
    await expect(getInvoiceDetail(transport, TOKEN, REF)).rejects.toBeInstanceOf(GdtError);
  });

  it("thiếu 'hdhhdvu' → cảnh báo mềm, KHÔNG throw/không circuit breaker", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { transport } = makeTransport({
      [DETAIL_ENDPOINTS.normal]: () => ok({ nbmst: "0100000001", ttxly: 5 }),
    });
    const detail = await getInvoiceDetail(transport, TOKEN, REF);
    expect(detail).toMatchObject({ nbmst: "0100000001" });
    expect(warn).toHaveBeenCalled();
  });
});

describe("mapDetailLines — ánh xạ dòng hàng & thuế suất", () => {
  it("ánh xạ ten/dvtinh/sluong/dgia/thtien + thuế suất, giữ raw", () => {
    const lines = mapDetailLines(detailBody([line({ truong_la: "x" })]));
    expect(lines).toHaveLength(1);
    const l = lines[0];
    expect(l).toMatchObject({
      stt: 1,
      ten: "Dịch vụ in ấn",
      dvtinh: "Cái",
      sluong: 10,
      dgia: 100,
      thtien: 1000,
      ltsuat: "8%",
      tsuat: 0.08,
      tthue: null,
    });
    // raw giữ trọn vẹn, kể cả trường lạ ngoài các khóa đã ánh xạ.
    expect(l?.raw).toMatchObject({ tchat: 1, truong_la: "x", ltsuat: "8%", tsuat: 0.08 });
  });

  it("thuế suất giữ NGUYÊN cả chuỗi hiển thị lẫn số thập phân (không ép kiểu)", () => {
    const lines = mapDetailLines(detailBody([line()]));
    expect(typeof lines[0]?.ltsuat).toBe("string"); // "8%"
    expect(typeof lines[0]?.tsuat).toBe("number"); // 0.08
  });

  // CHƯA KIỂM CHỨNG trên GDT thật: probe 2026-07-13 mới quan sát thuế suất "8%".
  // Ca KCT/KKKNT dưới đây chỉ kiểm hành vi PASSTHROUGH của mapDetailLines (giữ
  // nguyên giá trị ltsuat/tsuat, không ép kiểu) — KHÔNG khẳng định GDT trả đúng các
  // mã này. Khi probe được HĐ có mã đặc biệt, đối chiếu lại (ADR-0001 Amendment #6).
  it("thuế suất mã chữ (KCT/KKKNT) giữ nguyên, không bị coi là null/số", () => {
    const kct = mapDetailLines(detailBody([line({ ltsuat: "KCT", tsuat: null, tthue: null })]));
    expect(kct[0]?.ltsuat).toBe("KCT");
    expect(kct[0]?.tsuat).toBeNull();
    const kknt = mapDetailLines(detailBody([line({ ltsuat: "KKKNT" })]));
    expect(kknt[0]?.ltsuat).toBe("KKKNT");
  });

  it("nhiều dòng → ánh xạ đủ số dòng theo thứ tự", () => {
    const lines = mapDetailLines(
      detailBody([line({ stt: 1, ten: "A" }), line({ stt: 2, ten: "B" })]),
    );
    expect(lines.map((l) => l.ten)).toEqual(["A", "B"]);
  });

  it("thiếu 'hdhhdvu' → trả [] + cảnh báo mềm, không throw", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(mapDetailLines({ nbmst: "x" })).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it("'hdhhdvu' rỗng → trả []", () => {
    expect(mapDetailLines(detailBody([]))).toEqual([]);
  });

  it("phần tử null trong 'hdhhdvu' → dòng rỗng an toàn, không crash", () => {
    const lines = mapDetailLines(detailBody([null]));
    expect(lines).toHaveLength(1);
    expect(lines[0]?.raw).toEqual({});
    expect(lines[0]?.ten).toBeUndefined();
  });
});

describe("toDetailRef — rút ref từ InvoiceRow (U2)", () => {
  it("bỏ tdlap, mang _source sang source", () => {
    const row: InvoiceRow = {
      nbmst: "0100000001",
      khmshdon: "1",
      khhdon: "C26TAA",
      shdon: "42",
      tdlap: "2026-05-13",
      _source: "sco",
      _direction: "purchase",
    };
    expect(toDetailRef(row)).toEqual({
      nbmst: "0100000001",
      khhdon: "C26TAA",
      khmshdon: "1",
      shdon: "42",
      source: "sco",
    });
  });
});

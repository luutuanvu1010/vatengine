import { afterEach, describe, expect, it, vi } from "vitest";
import type { InvoiceDetailRef } from "../../src/detail";
import { EXPORT_XML_ENDPOINTS } from "../../src/endpoints";
import { GdtError } from "../../src/errors";
import { getInvoiceOriginalZip } from "../../src/exportXml";
import type { GdtTransport } from "../../src/transport";

const TOKEN = "jwt-token-xyz";

// Bốn tham số định danh — TRÙNG KHÍT `/invoices/detail`, đã kiểm chứng từ bundle JS
// của chính cổng GDT (U37 §4.5): handleExportXML gọi
// getValues(row, ["nbmst","khhdon","shdon","khmshdon"]).
const REF: InvoiceDetailRef = {
  nbmst: "0100000001",
  khhdon: "C26TQO",
  khmshdon: "1",
  shdon: "13580",
  source: "normal",
};

// ZIP thật bắt đầu bằng chữ ký cục bộ "PK\x03\x04" (đã đo ở U37 §4.7: phản hồi 200
// là ZIP 5 file). Đây là mẫu tối giản chỉ để khẳng định adapter trả NGUYÊN byte.
function zipBytes(payload = "noi-dung-gia-lap"): Uint8Array {
  const head = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
  const body = new TextEncoder().encode(payload);
  const out = new Uint8Array(head.length + body.length);
  out.set(head, 0);
  out.set(body, head.length);
  return out;
}

// Thân lỗi NGUYÊN VĂN GDT trả khi hóa đơn không có hồ sơ gốc (U37 §4.7, probe thật
// 2026-07-28). Lưu ý: mã trạng thái là 500 — KHÔNG phải 4xx.
const THAN_LOI_THIEU_HO_SO_GOC = {
  timestamp: "28/07/2026 19:10:32",
  message: "Không tồn tại hồ sơ gốc của hóa đơn.",
  details: "",
  path: "uri=/invoices/export-xml",
  requestId: "30f0dc15-3853-4a87-893b-09f46227d279",
};

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

function zipResponse(bytes = zipBytes()): Response {
  return new Response(bytes, {
    status: 200,
    headers: { "content-type": "application/zip" },
  });
}

// Không chờ thật trong test (fetchWithRetry nhận sleepFn tiêm được).
const KHONG_CHO = { sleepFn: async () => {} };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getInvoiceOriginalZip — chọn endpoint theo nguồn", () => {
  it("source 'normal' → gọi /api/query/invoices/export-xml", async () => {
    const { transport, calls } = makeTransport({
      [EXPORT_XML_ENDPOINTS.normal]: () => zipResponse(),
    });
    await getInvoiceOriginalZip(transport, TOKEN, { ...REF, source: "normal" }, KHONG_CHO);
    expect(new URL(calls[0]?.url ?? "").pathname).toBe(EXPORT_XML_ENDPOINTS.normal);
  });

  it("source 'sco' → gọi /api/sco-query/invoices/export-xml", async () => {
    const { transport, calls } = makeTransport({
      [EXPORT_XML_ENDPOINTS.sco]: () => zipResponse(),
    });
    await getInvoiceOriginalZip(transport, TOKEN, { ...REF, source: "sco" }, KHONG_CHO);
    expect(new URL(calls[0]?.url ?? "").pathname).toBe(EXPORT_XML_ENDPOINTS.sco);
  });

  it("không truyền source → mặc định 'normal'", async () => {
    const { transport, calls } = makeTransport({
      [EXPORT_XML_ENDPOINTS.normal]: () => zipResponse(),
    });
    await getInvoiceOriginalZip(
      transport,
      TOKEN,
      { nbmst: "1", khhdon: "A", khmshdon: "1", shdon: "2" },
      KHONG_CHO,
    );
    expect(new URL(calls[0]?.url ?? "").pathname).toBe(EXPORT_XML_ENDPOINTS.normal);
  });
});

describe("getInvoiceOriginalZip — request gửi đi", () => {
  it("gửi ĐÚNG 4 tham số định danh, KHÔNG kèm tdlap", async () => {
    const { transport, calls } = makeTransport({
      [EXPORT_XML_ENDPOINTS.normal]: () => zipResponse(),
    });
    await getInvoiceOriginalZip(transport, TOKEN, REF, KHONG_CHO);

    const params = new URL(calls[0]?.url ?? "").searchParams;
    expect(params.get("nbmst")).toBe("0100000001");
    expect(params.get("khhdon")).toBe("C26TQO");
    expect(params.get("khmshdon")).toBe("1");
    expect(params.get("shdon")).toBe("13580");
    expect(params.has("tdlap")).toBe(false);
    expect([...params.keys()].sort()).toEqual(["khhdon", "khmshdon", "nbmst", "shdon"]);
  });

  it("gửi token qua header Authorization: Bearer", async () => {
    const { transport, calls } = makeTransport({
      [EXPORT_XML_ENDPOINTS.normal]: () => zipResponse(),
    });
    await getInvoiceOriginalZip(transport, TOKEN, REF, KHONG_CHO);

    const headers = (calls[0]?.init?.headers ?? {}) as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${TOKEN}`);
  });
});

describe("getInvoiceOriginalZip — phản hồi thành công", () => {
  it("trả NGUYÊN byte của ZIP", async () => {
    const bytes = zipBytes("goi-hoa-don-goc");
    const { transport } = makeTransport({
      [EXPORT_XML_ENDPOINTS.normal]: () => zipResponse(bytes),
    });

    const ket_qua = await getInvoiceOriginalZip(transport, TOKEN, REF, KHONG_CHO);
    expect(ket_qua).toBeInstanceOf(Uint8Array);
    expect([...ket_qua]).toEqual([...bytes]);
  });

  it("200 nhưng KHÔNG phải ZIP (thiếu chữ ký PK) → ném GdtError, không trả rác", async () => {
    const { transport } = makeTransport({
      [EXPORT_XML_ENDPOINTS.normal]: () =>
        new Response(new TextEncoder().encode("<html>lỗi</html>"), { status: 200 }),
    });

    await expect(getInvoiceOriginalZip(transport, TOKEN, REF, KHONG_CHO)).rejects.toThrow(GdtError);
  });
});

describe("getInvoiceOriginalZip — phân loại lỗi", () => {
  it("401 → SESSION_EXPIRED và KHÔNG retry", async () => {
    const { transport, calls } = makeTransport({
      [EXPORT_XML_ENDPOINTS.normal]: () => new Response("", { status: 401 }),
    });

    await expect(getInvoiceOriginalZip(transport, TOKEN, REF, KHONG_CHO)).rejects.toMatchObject({
      code: "SESSION_EXPIRED",
    });
    expect(calls).toHaveLength(1);
  });

  // Đây là ràng buộc CỐT LÕI của U37a (U37 §4.7 hệ quả 3). GDT trả 500 cho hóa đơn
  // không có hồ sơ gốc; theo lệ "5xx ⇒ retry" mặc định của fetchWithRetry thì 64 hóa
  // đơn như vậy sẽ bị gọi 3 lần mỗi cái = 192 request vô ích tới máy chủ thuế, rồi
  // vẫn rơi DLQ. Phải nhận ra là lỗi VĨNH VIỄN ngay lần đầu.
  it("500 + 'Không tồn tại hồ sơ gốc' → NO_SOURCE_DOCUMENT và CHỈ gọi MỘT lần", async () => {
    const { transport, calls } = makeTransport({
      [EXPORT_XML_ENDPOINTS.normal]: () =>
        new Response(JSON.stringify(THAN_LOI_THIEU_HO_SO_GOC), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
    });

    await expect(getInvoiceOriginalZip(transport, TOKEN, REF, KHONG_CHO)).rejects.toMatchObject({
      code: "NO_SOURCE_DOCUMENT",
    });
    expect(calls).toHaveLength(1);
  });

  it("500 lỗi tạm KHÁC → vẫn retry đủ maxAttempts rồi ném HTTP_ERROR", async () => {
    const { transport, calls } = makeTransport({
      [EXPORT_XML_ENDPOINTS.normal]: () =>
        new Response(JSON.stringify({ message: "Hệ thống đang bận" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
    });

    await expect(
      getInvoiceOriginalZip(transport, TOKEN, REF, { ...KHONG_CHO, maxAttempts: 3 }),
    ).rejects.toMatchObject({ code: "HTTP_ERROR", httpStatus: 500 });
    expect(calls).toHaveLength(3);
  });

  it("500 thân KHÔNG phải JSON → coi là lỗi tạm, vẫn retry", async () => {
    const { transport, calls } = makeTransport({
      [EXPORT_XML_ENDPOINTS.normal]: () => new Response("502 Bad Gateway", { status: 500 }),
    });

    await expect(
      getInvoiceOriginalZip(transport, TOKEN, REF, { ...KHONG_CHO, maxAttempts: 2 }),
    ).rejects.toMatchObject({ code: "HTTP_ERROR" });
    expect(calls).toHaveLength(2);
  });

  it("404 → HTTP_ERROR mang httpStatus để tầng gọi phân loại", async () => {
    const { transport } = makeTransport({});
    await expect(getInvoiceOriginalZip(transport, TOKEN, REF, KHONG_CHO)).rejects.toMatchObject({
      code: "HTTP_ERROR",
      httpStatus: 404,
    });
  });
});

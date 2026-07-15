// ĐV3 — adapterFetchDetail: factory production ghép getInvoiceDetail + mapDetailLines.
// Kiểm nó gọi đúng endpoint detail, ánh xạ mảng hdhhdvu → InvoiceLine, và propagate 401.
import type { GdtTransport } from "@vat/gdt-client";
import { DETAIL_ENDPOINTS, GdtError } from "@vat/gdt-client";
import { describe, expect, it } from "vitest";
import { adapterFetchDetail } from "../../src/detailLines";

function transport(res: (url: string) => Response): GdtTransport {
  return {
    name: "mock",
    async fetch(url: string) {
      return res(url);
    },
  } as unknown as GdtTransport;
}

const REF = { nbmst: "0100000001", khhdon: "C26TAA", khmshdon: "1", shdon: "7048" };

describe("adapterFetchDetail (ĐV3)", () => {
  it("gọi endpoint detail thường + ánh xạ hdhhdvu → InvoiceLine (giữ ten/thuế suất)", async () => {
    const fetchDetail = adapterFetchDetail(
      transport((url) => {
        expect(new URL(url).pathname).toBe(DETAIL_ENDPOINTS.normal);
        return new Response(
          JSON.stringify({ hdhhdvu: [{ stt: 1, ten: "SP A", ltsuat: "8%", tsuat: 0.08 }] }),
          { status: 200 },
        );
      }),
      "tok",
    );
    const lines = await fetchDetail(REF);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.ten).toBe("SP A");
    expect(lines[0]?.ltsuat).toBe("8%");
    expect(lines[0]?.tsuat).toBe(0.08);
  });

  it("401 ở detail → ném GdtError SESSION_EXPIRED (không nuốt)", async () => {
    const fetchDetail = adapterFetchDetail(
      transport(() => new Response("{}", { status: 401 })),
      "tok",
    );
    await expect(fetchDetail(REF)).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
    // đảm bảo dùng GdtError (không phải Error thường)
    await expect(fetchDetail(REF)).rejects.toBeInstanceOf(GdtError);
  });
});

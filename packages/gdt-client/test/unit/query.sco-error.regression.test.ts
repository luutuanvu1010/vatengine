import { describe, expect, it } from "vitest";
import { INVOICE_ENDPOINTS } from "../../src/endpoints";
import { GdtError } from "../../src/errors";
import { queryInvoices } from "../../src/query";
import type { GdtTransport } from "../../src/transport";

// ─────────────────────────────────────────────────────────────────────────────
// TEST XÁC THỰC LỖI #2 — "Không tải về được hóa đơn máy tính tiền (sco)".
//
// HIỆN TRẠNG (query.ts dòng ~210): mọi lỗi HTTP của nhánh `sco` (KHÁC 401) bị NUỐT
// im lặng — chỉ console.warn rồi `continue`, dựa trên một GIẢ ĐỊNH được chính mã
// đánh dấu "CHƯA KIỂM CHỨNG": "một số tài khoản không có máy tính tiền nên sco lỗi
// là bình thường". Hệ quả: nếu sco-query trả 5xx/4xx vì lệch tham số / đổi contract
// (KHÔNG phải vì tài khoản trống), hóa đơn máy tính tiền BIẾN MẤT không dấu vết.
//
// Đây là mâu thuẫn trực tiếp với "Nguyên tắc bằng chứng" (CLAUDE.md): một giả định
// CHƯA KIỂM CHỨNG đang được dùng làm tiền đề để nuốt lỗi thật.
//
// Test này khẳng định HÀNH VI ĐÚNG mà ta muốn sau khi sửa:
//   - Lỗi sco 5xx (transient/contract-drift) KHÔNG được nuốt im lặng → phải nổi lên
//     (ném GdtError) để tầng đồng bộ biết dữ liệu máy tính tiền có thể thiếu.
//   - Chỉ 404/"không có sco" mới được coi là "tài khoản không có máy tính tiền".
//
// TRẠNG THÁI KỲ VỌNG: ĐỎ trên mã hiện tại (đang nuốt hết) → XANH sau khi sửa.
// ─────────────────────────────────────────────────────────────────────────────

interface StubResponse {
  status: number;
  body: unknown;
}

/** Transport giả: khớp theo path → trả response đã dựng sẵn. */
function makeTransport(routes: Array<{ match: string; res: StubResponse }>): GdtTransport {
  return {
    async fetch(url: string): Promise<Response> {
      const route = routes.find((r) => url.includes(r.match));
      const { status, body } = route?.res ?? { status: 200, body: { datas: [], state: null } };
      return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    },
  } as unknown as GdtTransport;
}

const PARAMS = {
  direction: "purchase" as const,
  dateFrom: "01/06/2026",
  dateTo: "30/06/2026",
};

describe("queryInvoices — lỗi nhánh sco KHÔNG được nuốt im lặng (regression lỗi #2)", () => {
  it("nhánh normal OK nhưng sco trả 500 (contract drift) → PHẢI ném, KHÔNG nuốt", async () => {
    const transport = makeTransport([
      {
        match: INVOICE_ENDPOINTS.purchase,
        res: {
          status: 200,
          body: {
            datas: [{ nbmst: "1", khmshdon: "1", khhdon: "AA", shdon: "1", tdlap: "x" }],
            state: null,
          },
        },
      },
      {
        match: INVOICE_ENDPOINTS.scoPurchase,
        // 500 = lỗi máy chủ / lệch tham số — KHÔNG phải "tài khoản không có sco".
        res: { status: 500, body: { message: "Internal Server Error" } },
      },
    ]);

    // HÀNH VI ĐÚNG: lỗi sco 5xx phải nổi lên. (Mã hiện tại nuốt → test ĐỎ.)
    await expect(queryInvoices(transport, "tok", PARAMS)).rejects.toBeInstanceOf(GdtError);
  });

  it("sco trả 400 (bad request — sai tham số) → PHẢI ném, KHÔNG nuốt", async () => {
    const transport = makeTransport([
      { match: INVOICE_ENDPOINTS.purchase, res: { status: 200, body: { datas: [], state: null } } },
      {
        match: INVOICE_ENDPOINTS.scoPurchase,
        res: { status: 400, body: { message: "Tham số không hợp lệ" } },
      },
    ]);

    await expect(queryInvoices(transport, "tok", PARAMS)).rejects.toBeInstanceOf(GdtError);
  });

  it("sco trả 200 rỗng (tài khoản thật sự không có máy tính tiền) → KHÔNG ném (đúng)", async () => {
    const transport = makeTransport([
      {
        match: INVOICE_ENDPOINTS.purchase,
        res: {
          status: 200,
          body: {
            datas: [{ nbmst: "1", khmshdon: "1", khhdon: "AA", shdon: "1", tdlap: "x" }],
            state: null,
          },
        },
      },
      // 200 + datas:[] chính là dấu hiệu ĐÚNG của "không có hóa đơn máy tính tiền".
      {
        match: INVOICE_ENDPOINTS.scoPurchase,
        res: { status: 200, body: { datas: [], state: null } },
      },
    ]);

    const rows = await queryInvoices(transport, "tok", PARAMS);
    expect(rows).toHaveLength(1); // chỉ hóa đơn thường; sco rỗng hợp lệ, không lỗi.
  });
});

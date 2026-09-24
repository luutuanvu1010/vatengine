// Transport egress T0 = "direct-cf": Workers `fetch()` gọi THẲNG GDT từ biên
// Cloudflare. Đây là ĐIỂM EGRESS DUY NHẤT cho đường T0 — mọi lời gọi HTTP tới
// hoadondientu.gdt.gov.vn tập trung trong packages/gdt-client (gdt-adapter.md),
// KHÔNG rải fetch() ở Worker/queue consumer/workflow. Đã kiểm chứng T0 tới được
// GDT /api/* (ADR-0001 Amendment #3/#4). Đường T1 (vn-relay) TREO — chỉ hồi sinh
// nếu probe phát hiện GEO_BLOCKED thật (security.md / gdt-adapter.md).
import { BASE, PUBLIC_PROBE_PATH } from "./endpoints";
import { withRequestId } from "./http";
import { type GdtTransport, type ProbeResult, classify } from "./transport";

/**
 * Dựng transport T0. `fetchImpl` tiêm vào để test offline (mock); mặc định = global
 * `fetch` của Workers runtime.
 */
export function createDirectCfTransport(fetchImpl: typeof fetch = fetch): GdtTransport {
  return {
    name: "direct-cf",
    fetch: (url, init) => fetchImpl(url, init),
    async probe(): Promise<ProbeResult> {
      const start = Date.now();
      try {
        // Cùng header request-id như mọi request nghiệp vụ (gdt-adapter.md, 2026-09-24):
        // probe không đi qua fetchWithRetry (cố ý: không retry/backoff khi đo sức khỏe).
        const res = await fetchImpl(`${BASE}${PUBLIC_PROBE_PATH}`, {
          method: "GET",
          headers: withRequestId(undefined),
        });
        // CHỈ đọc thân khi 403 — để tách WAF_BLOCKED khỏi GEO_BLOCKED (2026-09-24). Đọc
        // HẾT thân rồi mới cắt 1024 ký tự đầu để phân loại; đọc hỏng thì coi như không có
        // thân → GEO_BLOCKED.
        const body = res.status === 403 ? await docThanAnToan(res) : undefined;
        return {
          transport: "direct-cf",
          verdict: classify(res.status, false, false, body),
          httpStatus: res.status,
          latencyMs: Date.now() - start,
        };
      } catch {
        return { transport: "direct-cf", verdict: "ERROR", latencyMs: Date.now() - start };
      }
    },
  };
}

const PROBE_BODY_MAX_CHARS = 1024;

/**
 * Đọc thân phản hồi để phân loại rồi cắt 1024 ký tự đầu; hỏng thì trả undefined (không ném).
 *
 * CỐ Ý đọc hết thân rồi mới cắt (không dùng stream reader): trang chặn GDT quan sát ngày
 * 2026-09-24 là JSON nhỏ, nên một stream reader chỉ thêm phức tạp mà không đổi kết quả.
 * Đánh đổi: chữ ký WAF nằm SAU ký tự thứ 1024 sẽ bị cắt mất ⇒ rơi về GEO_BLOCKED (vẫn
 * báo, chỉ sai nhãn) — có test chốt hành vi này trong directTransport.test.ts.
 */
async function docThanAnToan(res: Response): Promise<string | undefined> {
  try {
    return (await res.text()).slice(0, PROBE_BODY_MAX_CHARS);
  } catch {
    return undefined;
  }
}

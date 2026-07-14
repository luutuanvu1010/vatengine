// Transport egress T0 = "direct-cf": Workers `fetch()` gọi THẲNG GDT từ biên
// Cloudflare. Đây là ĐIỂM EGRESS DUY NHẤT cho đường T0 — mọi lời gọi HTTP tới
// hoadondientu.gdt.gov.vn tập trung trong packages/gdt-client (gdt-adapter.md),
// KHÔNG rải fetch() ở Worker/queue consumer/workflow. Đã kiểm chứng T0 tới được
// GDT /api/* (ADR-0001 Amendment #3/#4). Đường T1 (vn-relay) TREO — chỉ hồi sinh
// nếu probe phát hiện GEO_BLOCKED thật (security.md / gdt-adapter.md).
import { BASE, PUBLIC_PROBE_PATH } from "./endpoints";
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
        const res = await fetchImpl(`${BASE}${PUBLIC_PROBE_PATH}`, { method: "GET" });
        return {
          transport: "direct-cf",
          verdict: classify(res.status, false, false),
          httpStatus: res.status,
          latencyMs: Date.now() - start,
        };
      } catch {
        return { transport: "direct-cf", verdict: "ERROR", latencyMs: Date.now() - start };
      }
    },
  };
}

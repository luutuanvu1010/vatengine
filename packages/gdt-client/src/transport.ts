// GdtTransport — trừu tượng hóa đường ra (egress) tới GDT (nguồn chân lý).
// Mọi lời gọi GDT đi qua interface này để hoán đổi đường ra
// (direct-cf ↔ vn-relay) mà không đụng logic nghiệp vụ. Xem ADR-0001 mục 5B
// và .claude/rules/gdt-adapter.md. Hiện thực tham chiếu: spikes/gdt-egress-probe.

export type ProbeVerdict = "OK" | "GEO_BLOCKED" | "RATE_LIMITED" | "TIMEOUT" | "ERROR";

export interface ProbeResult {
  transport: string;
  verdict: ProbeVerdict;
  httpStatus?: number;
  egressIp?: string;
  egressCountry?: string;
  latencyMs: number;
}

export interface GdtTransport {
  readonly name: string;
  fetch(url: string, init?: RequestInit): Promise<Response>;
  probe(): Promise<ProbeResult>;
}

// Phân loại một lần gọi thành ProbeVerdict (dùng chung cho probe & runtime routing).
export function classify(
  status: number | undefined,
  timedOut: boolean,
  errored: boolean,
): ProbeVerdict {
  if (timedOut) return "TIMEOUT";
  if (errored || status === undefined) return "ERROR";
  if (status === 403 || status === 451) return "GEO_BLOCKED";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 200 && status < 500) return "OK"; // 4xx nghiệp vụ = vẫn tới được máy chủ
  return "ERROR";
}

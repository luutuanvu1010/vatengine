// Wiring production: đường ra GDT T0 (direct-cf). KHÔNG test-cover (test tiêm transport
// giả). Cô lập mọi phụ thuộc GDT trong @vat/gdt-client (gdt-adapter.md).
import { type GdtTransport, createDirectCfTransport } from "@vat/gdt-client";
import type { Env } from "./types";

export function getTransportDirect(_env: Env): GdtTransport {
  return createDirectCfTransport();
}

// Cổng hợp đồng (contract gate) — đối chiếu response GDT với required_keys đã
// biết trong gdt-contract-schema.json. Xem .claude/rules/gdt-adapter.md.

import schemaJson from "../gdt-contract-schema.json";
import { GdtContractDriftError } from "./errors";

interface ContractSchemaEntry {
  description: string;
  required_keys: string[];
}

type ContractSchema = Record<string, ContractSchemaEntry>;

const SCHEMA = schemaJson as ContractSchema;

/**
 * Trả về danh sách trường bắt buộc còn THIẾU của `schemaKey` trong `data`.
 * Rỗng nếu đủ trường hoặc schema chưa định nghĩa (fail-open). KHÔNG ném lỗi —
 * dùng cho kiểm hợp đồng MỀM (chỉ cảnh báo, không mở circuit breaker).
 */
export function missingContractKeys(data: unknown, schemaKey: string): string[] {
  const entry = SCHEMA[schemaKey];
  if (!entry) return [];

  const isObject = typeof data === "object" && data !== null;
  const record = isObject ? (data as Record<string, unknown>) : undefined;
  return entry.required_keys.filter((key) => !record || !(key in record));
}

/**
 * Ném GdtContractDriftError nếu `data` thiếu trường bắt buộc của `schemaKey`.
 * Fail-open (không ném) nếu schemaKey chưa được định nghĩa trong schema.
 */
export function checkContract(data: unknown, schemaKey: string, context: string): void {
  const missing = missingContractKeys(data, schemaKey);
  if (missing.length > 0) {
    throw new GdtContractDriftError(
      `Phản hồi từ ${context} thiếu trường ${JSON.stringify(missing)} so với hợp đồng đã biết (schema '${schemaKey}'). Tổng cục Thuế có thể đã đổi API.`,
    );
  }
}

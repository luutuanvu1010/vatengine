// U11 — Registry profile ánh xạ. NGUỒN SỰ THẬT DUY NHẤT về profile KHẢ DỤNG. Route
// apps/api validate qua `isProfileId` (không hardcode lại danh sách).
//
// Nguyên tắc bằng chứng (Hiến pháp): phần mềm kế toán mục tiêu (MISA/FAST/SmartKTSC) CHƯA
// có template import chính thức / file mẫu thật → KHÔNG bịa layout cột. Chúng nằm ở
// PENDING_PROFILES (CHƯA KIỂM CHỨNG) và KHÔNG khả dụng. Khi có template thật: tạo
// `profiles/<id>.ts` (verified=true) và chuyển id vào AVAILABLE + cập nhật contract test.
import { REFERENCE_PROFILE } from "./reference";
import type { MappingProfile } from "./types";

const AVAILABLE: Record<string, MappingProfile> = {
  [REFERENCE_PROFILE.id]: REFERENCE_PROFILE,
};

export const AVAILABLE_PROFILE_IDS: readonly string[] = Object.keys(AVAILABLE);

export function isProfileId(v: unknown): v is string {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(AVAILABLE, v);
}

export function getProfile(id: string): MappingProfile {
  const p = AVAILABLE[id];
  if (!p) throw new Error(`Profile không khả dụng (chưa có/CHƯA KIỂM CHỨNG): ${id}`);
  return p;
}

/** Phần mềm kế toán mục tiêu ĐÃ BIẾT nhưng CHƯA có bằng chứng định dạng → không khả dụng.
 * Dùng để tầng trên (frontend/API) liệt kê "sắp có" mà KHÔNG phục vụ layout bịa. */
export interface PendingProfile {
  id: string;
  label: string;
  note: string;
}

export const PENDING_PROFILES: readonly PendingProfile[] = [
  { id: "misa", label: "MISA", note: "CHƯA KIỂM CHỨNG — chờ template import chính thức" },
  { id: "fast", label: "FAST", note: "CHƯA KIỂM CHỨNG — chờ template import chính thức" },
  {
    id: "smartktsc",
    label: "SmartKTSC",
    note: "CHƯA KIỂM CHỨNG — chờ template import chính thức",
  },
];

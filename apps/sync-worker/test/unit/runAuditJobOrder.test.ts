import type { AuditSyncMessage } from "@vat/sync";
// Task 6 review m2 — trong nhánh "keo" của runAuditJob, destructure
// `const [family, ...conLai] = quyetDinh.families` PHẢI đứng TRƯỚC `moRun`: nếu
// `decideAudit` (thuần, @vat/sync) từng trả `families: []` (hiện BẤT KHẢ ĐẠT — xem
// chú thích runAuditJob.ts), thứ tự sai sẽ mở một run ("running") rồi bỏ dở KHÔNG
// enqueue gì và KHÔNG chốt — run mồ côi treo `running` vĩnh viễn.
//
// File TÁCH RIÊNG (không chung `runDeltaJob.test.ts`) vì cần mock `decideAudit` của
// `@vat/sync` — `vi.mock` áp dụng cho CẢ file, sẽ phá các test khác dùng
// `decideAudit` thật nếu gộp chung.
import { describe, expect, it, vi } from "vitest";

vi.mock("@vat/sync", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@vat/sync")>();
  return {
    ...actual,
    // Ép nhánh "keo" nhưng KHÔNG có họ nào — mô phỏng tình huống bất khả đạt để
    // chốt chặn THỨ TỰ an toàn (families trước moRun).
    decideAudit: () => ({ kind: "keo", families: [] }),
  };
});

const { runAuditJob } = await import("../../src/runDeltaJob");
const { makeDeps, AUDIT } = await import("./runAuditJobOrderFixtures");

describe("runAuditJob — m2: thứ tự an toàn (destructure families TRƯỚC moRun)", () => {
  it("families rỗng ở nhánh 'keo' → KHÔNG mở run mồ côi (moRun không được gọi)", async () => {
    const { deps, calls } = makeDeps();
    const out = await runAuditJob(deps, AUDIT as AuditSyncMessage);
    expect(out.kind).toBe("completed");
    expect(calls.moRun).toBe(0);
    expect(calls.enqueue).toEqual([]);
  });
});

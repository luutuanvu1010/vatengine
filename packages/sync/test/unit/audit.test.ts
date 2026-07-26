// Task 4 (delta-sync) — decideAudit: quyết định vòng kiểm audit dựa trên đối chiếu
// total GDT (per-family) với count DB hiện có. Thuần, offline — không DB/mạng.
// Ca test LẤY VERBATIM từ .superpowers/sdd/task-4-brief.md.
import { describe, expect, it } from "vitest";
import { TRAN_VONG_DELTA, decideAudit } from "../../src/audit";

const obs = (n: [number | null, number], s: [number | null, number]) => [
  { family: "normal" as const, total: n[0], dbCount: n[1] },
  { family: "sco" as const, total: s[0], dbCount: s[1] },
];

describe("decideAudit", () => {
  it("DB ≥ total mọi họ → du", () => {
    expect(decideAudit(obs([53, 53], [7023, 7100]), 0)).toEqual({ kind: "du" });
  });
  it("total null (sco không áp dụng) không tính là hụt", () => {
    expect(decideAudit(obs([53, 53], [null, 0]), 0)).toEqual({ kind: "du" });
  });
  it("hụt vòng 0 → keo đúng họ hụt", () => {
    expect(decideAudit(obs([53, 53], [7023, 6802]), 0)).toEqual({ kind: "keo", families: ["sco"] });
  });
  it("hụt nhưng bão hòa (count không tăng so prevCount) → dung + hutConLai", () => {
    expect(decideAudit(obs([53, 53], [7023, 6981]), 1, 53 + 6981)).toEqual({
      kind: "dung",
      hutConLai: 42,
    });
  });
  it("hụt còn tăng → keo vòng nữa; chạm trần vòng → dung", () => {
    expect(decideAudit(obs([53, 53], [7023, 6981]), 1, 53 + 6802).kind).toBe("keo");
    expect(decideAudit(obs([53, 53], [7023, 6981]), TRAN_VONG_DELTA).kind).toBe("dung");
  });
});

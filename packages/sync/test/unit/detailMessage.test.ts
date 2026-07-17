// U26 — hợp đồng message pha 2 (dòng hàng) trên CÙNG queue vat-sync. Ràng buộc
// tương thích lùi: message header cũ (KHÔNG có `kind`) đang bay trong queue và do
// producer đã deploy phát ra → guard phải trả false cho chúng (tiếp tục đường header).
import { describe, expect, it } from "vitest";
import {
  type DetailSyncMessage,
  type SyncJobMessage,
  buildDetailMessages,
  isDetailMessage,
} from "../../src/syncJob";

const DETAIL_MSG: DetailSyncMessage = {
  kind: "detail",
  tenantId: "11111111-1111-4111-8111-111111111111",
  taikhoanId: "22222222-2222-4222-8222-222222222222",
  hoaDonId: "33333333-3333-4333-8333-333333333333",
  ref: { nbmst: "0100000001", khhdon: "C26TAA", khmshdon: "1", shdon: "42", source: "normal" },
};

const HEADER_MSG: SyncJobMessage = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  taikhoanId: "22222222-2222-4222-8222-222222222222",
  direction: "purchase",
  dateFrom: "01/07/2026",
  dateTo: "31/07/2026",
  period: "2026-07",
};

describe("isDetailMessage — phân nhánh consumer trên queue vat-sync (U26)", () => {
  it("message detail đúng hình dạng → true", () => {
    expect(isDetailMessage(DETAIL_MSG)).toBe(true);
    expect(isDetailMessage({ ...DETAIL_MSG, bpAttempt: 3 })).toBe(true);
  });

  it("message header cũ (không có kind) → false (tương thích lùi)", () => {
    expect(isDetailMessage(HEADER_MSG)).toBe(false);
    expect(isDetailMessage({ ...HEADER_MSG, bpAttempt: 2 })).toBe(false);
  });

  it("giá trị rác/không phải object → false, không ném", () => {
    expect(isDetailMessage(null)).toBe(false);
    expect(isDetailMessage(undefined)).toBe(false);
    expect(isDetailMessage("detail")).toBe(false);
    expect(isDetailMessage({ kind: "khac" })).toBe(false);
  });

  it("ref nguồn sco hợp lệ", () => {
    const sco: DetailSyncMessage = { ...DETAIL_MSG, ref: { ...DETAIL_MSG.ref, source: "sco" } };
    expect(isDetailMessage(sco)).toBe(true);
    expect(sco.ref.source).toBe("sco");
  });
});

describe("buildDetailMessages — dựng message pha 2 từ candidates (dùng chung producer)", () => {
  it("mỗi candidate → 1 message kind:'detail' mang tenantId/taikhoanId tường minh", () => {
    const msgs = buildDetailMessages(
      { tenantId: DETAIL_MSG.tenantId, taikhoanId: DETAIL_MSG.taikhoanId },
      [
        { hoaDonId: "id-1", ref: { ...DETAIL_MSG.ref } },
        { hoaDonId: "id-2", ref: { ...DETAIL_MSG.ref, shdon: "43", source: "sco" } },
      ],
    );
    expect(msgs).toHaveLength(2);
    for (const m of msgs) {
      expect(isDetailMessage(m)).toBe(true);
      expect(m.tenantId).toBe(DETAIL_MSG.tenantId);
      expect(m.taikhoanId).toBe(DETAIL_MSG.taikhoanId);
      expect(m.bpAttempt).toBeUndefined();
    }
    expect(msgs[1]).toMatchObject({ hoaDonId: "id-2", ref: { shdon: "43", source: "sco" } });
  });

  it("candidates rỗng → mảng rỗng", () => {
    expect(buildDetailMessages({ tenantId: "t", taikhoanId: "a" }, [])).toEqual([]);
  });
});

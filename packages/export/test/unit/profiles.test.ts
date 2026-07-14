// U11 unit — registry + profile tham chiếu. Kiểm CƠ CHẾ profile (không phụ thuộc bằng
// chứng định dạng thật). Profile mục tiêu thật (MISA/FAST/SmartKTSC) CHƯA có template →
// KHÔNG khả dụng (Nguyên tắc bằng chứng — xem accountingProfiles.contract.test.ts). Offline.
import { describe, expect, it } from "vitest";
import { REFERENCE_PROFILE } from "../../src/profiles/reference";
import {
  AVAILABLE_PROFILE_IDS,
  PENDING_PROFILES,
  getProfile,
  isProfileId,
} from "../../src/profiles/registry";

describe("registry profile", () => {
  it("liệt kê profile tham chiếu là khả dụng", () => {
    expect(AVAILABLE_PROFILE_IDS).toContain("reference");
  });

  it("isProfileId nhận profile khả dụng, chặn id lạ", () => {
    expect(isProfileId("reference")).toBe(true);
    expect(isProfileId("khong-co")).toBe(false);
    expect(isProfileId(123)).toBe(false);
    expect(isProfileId(undefined)).toBe(false);
  });

  it("profile mục tiêu CHƯA KIỂM CHỨNG KHÔNG khả dụng (không bịa layout)", () => {
    // misa/fast/smartktsc là mục tiêu đã biết nhưng chưa có template thật → chặn.
    for (const p of PENDING_PROFILES) {
      expect(isProfileId(p.id)).toBe(false);
      expect(AVAILABLE_PROFILE_IDS).not.toContain(p.id);
    }
  });

  it("getProfile trả profile khả dụng; id không khả dụng → ném", () => {
    expect(getProfile("reference").id).toBe("reference");
    expect(() => getProfile("misa")).toThrow();
  });

  it("PENDING_PROFILES gồm MISA/FAST/SmartKTSC, mỗi mục gắn nhãn CHƯA KIỂM CHỨNG", () => {
    const ids = PENDING_PROFILES.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(["misa", "fast", "smartktsc"]));
    for (const p of PENDING_PROFILES) {
      expect(p.note).toContain("CHƯA KIỂM CHỨNG");
    }
  });
});

describe("profile tham chiếu (fixture chứng minh cơ chế)", () => {
  it("verified=true (fixture của CHÍNH ta, đặc tả đầy đủ — khác profile mục tiêu thật)", () => {
    expect(REFERENCE_PROFILE.verified).toBe(true);
  });

  it("cột theo đúng thứ tự header kỳ vọng, KHÁC mẫu native (chứng minh ánh xạ)", () => {
    expect(REFERENCE_PROFILE.columns.map((c) => c.header)).toEqual([
      "Ngay hach toan",
      "So hoa don",
      "Ky hieu",
      "MST ben ban",
      "Ten ben ban",
      "Tien hang",
      "Tien thue GTGT",
      "Tong thanh toan",
    ]);
  });

  it("có ít nhất một cột transform (định dạng đích khác native) và cột money", () => {
    expect(REFERENCE_PROFILE.columns.some((c) => c.transform)).toBe(true);
    expect(REFERENCE_PROFILE.columns.some((c) => c.kind === "money")).toBe(true);
  });
});

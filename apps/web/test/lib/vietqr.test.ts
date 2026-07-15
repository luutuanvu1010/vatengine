import { describe, expect, it } from "vitest";
import { buildVietQrPayload, crc16, normalizeAmount } from "../../src/lib/vietqr";

// Vector đã kiểm chứng KHỚP thư viện tham chiếu `vietnam-qr-pay` (U16-plan §Kiểm chứng,
// Techcombank 970407 / TK 4796099999 / nội dung "Ung ho VATEngine").
const BANK = "970407";
const ACC = "4796099999";
const INFO = "Ung ho VATEngine";

const PAYLOAD_50K =
  "00020101021238540010A00000072701240006970407011047960999990208QRIBFTTA53037045405500005802VN62200816Ung ho VATEngine630434BA";
const PAYLOAD_STATIC =
  "00020101021138540010A00000072701240006970407011047960999990208QRIBFTTA53037045802VN62200816Ung ho VATEngine6304D85E";

describe("crc16 — CRC-16/CCITT-FALSE", () => {
  it("khớp vector mẫu (phần thân payload 50k → 34BA)", () => {
    expect(crc16(PAYLOAD_50K.slice(0, -4))).toBe("34BA");
  });
  it("thay đổi 1 ký tự → CRC đổi", () => {
    expect(crc16("00020101")).not.toBe(crc16("00020102"));
  });
});

describe("buildVietQrPayload — chuỗi VietQR động", () => {
  it("mức 50.000 → khớp đúng chuỗi tham chiếu (gồm CRC)", () => {
    expect(
      buildVietQrPayload({ bankBin: BANK, accountNumber: ACC, amount: 50000, addInfo: INFO }),
    ).toBe(PAYLOAD_50K);
  });

  it("số tiền dạng CHUỖI cho cùng kết quả với số (không ép float)", () => {
    expect(
      buildVietQrPayload({ bankBin: BANK, accountNumber: ACC, amount: "50000", addInfo: INFO }),
    ).toBe(PAYLOAD_50K);
  });

  it("không số tiền → QR tĩnh (01=11, không có trường 54)", () => {
    const p = buildVietQrPayload({
      bankBin: BANK,
      accountNumber: ACC,
      amount: null,
      addInfo: INFO,
    });
    expect(p).toBe(PAYLOAD_STATIC);
    expect(p).not.toContain("5405");
  });

  it("amount 0 hoặc âm → coi như tĩnh (01=11)", () => {
    expect(buildVietQrPayload({ bankBin: BANK, accountNumber: ACC, amount: 0 }).slice(6, 12)).toBe(
      "010211",
    );
    expect(buildVietQrPayload({ bankBin: BANK, accountNumber: ACC, amount: -5 }).slice(6, 12)).toBe(
      "010211",
    );
  });

  it("đổi số tiền chỉ đổi trường 54 (+CRC), giữ nguyên khối tài khoản", () => {
    const acctBlock = "0006970407011047960999990208QRIBFTTA";
    const a = buildVietQrPayload({
      bankBin: BANK,
      accountNumber: ACC,
      amount: 10000,
      addInfo: INFO,
    });
    const b = buildVietQrPayload({
      bankBin: BANK,
      accountNumber: ACC,
      amount: 500000,
      addInfo: INFO,
    });
    expect(a).toContain(acctBlock);
    expect(b).toContain(acctBlock);
    expect(a).toContain("540510000");
    expect(b).toContain("5406500000");
  });

  it("nội dung CK > 99 ký tự → ném lỗi (guard TLV)", () => {
    expect(() =>
      buildVietQrPayload({
        bankBin: BANK,
        accountNumber: ACC,
        amount: 10000,
        addInfo: "x".repeat(100),
      }),
    ).toThrow();
  });

  it("CRC hợp lệ: crc16(thân) == 4 ký tự cuối", () => {
    const p = buildVietQrPayload({
      bankBin: BANK,
      accountNumber: ACC,
      amount: 100000,
      addInfo: INFO,
    });
    expect(crc16(p.slice(0, -4))).toBe(p.slice(-4));
  });
});

describe("normalizeAmount — chuỗi, không ép float, chặn 13 chữ số", () => {
  it("chuỗi/số hợp lệ → chuỗi chữ số", () => {
    expect(normalizeAmount("50000")).toBe("50000");
    expect(normalizeAmount(100000)).toBe("100000");
  });
  it("bỏ số 0 đầu; rỗng/0/âm/null → ''", () => {
    expect(normalizeAmount("0050000")).toBe("50000");
    expect(normalizeAmount("")).toBe("");
    expect(normalizeAmount("0")).toBe("");
    expect(normalizeAmount(0)).toBe("");
    expect(normalizeAmount(-5)).toBe("");
    expect(normalizeAmount(null)).toBe("");
  });
  it("> 13 chữ số → '' (giới hạn trường 54 NAPAS); đúng 13 chữ số giữ nguyên", () => {
    expect(normalizeAmount("12345678901234")).toBe(""); // 14 chữ số
    expect(normalizeAmount("1234567890123")).toBe("1234567890123"); // 13 chữ số
  });
  it("chuỗi số rất lớn (≤13) KHÔNG bị làm tròn", () => {
    expect(normalizeAmount("9999999999999")).toBe("9999999999999");
  });
});

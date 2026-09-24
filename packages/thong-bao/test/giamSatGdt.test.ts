// U43 — Tin Telegram cho sự kiện giám sát lối vào GDT. Ba tính chất: đúng tiêu đề theo loại,
// không rò secret, escape HTML (thông điệp GDT là chuỗi do BÊN NGOÀI kiểm soát).
import { describe, expect, it } from "vitest";
import { RUNBOOK_GDT, type SuKienGiamSatGdt, soanTinGiamSatGdt } from "../src/giamSatGdt";

const THOI_DIEM = new Date("2026-09-24T05:00:00.000Z"); // 12:00 giờ Việt Nam

function suKien(phan: Partial<SuKienGiamSatGdt>): SuKienGiamSatGdt {
  return { loai: "chan", verdict: "WAF_BLOCKED", thoiDiem: THOI_DIEM, ...phan };
}

describe("soanTinGiamSatGdt", () => {
  it("chan: tiêu đề CHẶN, có mã HTTP, thông điệp GDT, giờ Việt Nam, đường runbook", () => {
    const tin = soanTinGiamSatGdt(
      suKien({ httpStatus: 403, message: "Hệ thống phát hiện hành vi không hợp lệ." }),
    );
    expect(tin).toContain("GDT đang CHẶN");
    expect(tin).toContain("403");
    expect(tin).toContain("Hệ thống phát hiện hành vi không hợp lệ.");
    expect(tin).toContain("12:00");
    expect(tin).toContain("24/9/2026");
    expect(tin).toContain(RUNBOOK_GDT);
  });

  it("mỗi loại có tiêu đề riêng", () => {
    expect(soanTinGiamSatGdt(suKien({ loai: "bat_giam_sat", verdict: "OK" }))).toContain("đã bật");
    expect(soanTinGiamSatGdt(suKien({ loai: "drift", verdict: "DRIFT" }))).toContain("đổi cách");
    expect(
      soanTinGiamSatGdt(suKien({ loai: "loi_lien_tiep", verdict: "TIMEOUT", consecutiveBad: 3 })),
    ).toContain("3 lần liên tiếp");
    expect(soanTinGiamSatGdt(suKien({ loai: "hoi_phuc", verdict: "OK" }))).toContain("thông lại");
    expect(
      soanTinGiamSatGdt(suKien({ loai: "egress", verdict: "GEO_BLOCKED", consecutiveBad: 3 })),
    ).toContain("Probe egress");
  });

  it("escape HTML trong thông điệp GDT (chuỗi bên ngoài kiểm soát)", () => {
    const tin = soanTinGiamSatGdt(suKien({ message: "<b>x</b> & y" }));
    expect(tin).toContain("&lt;b&gt;x&lt;/b&gt; &amp; y");
    expect(tin).not.toContain("<b>x</b>");
  });

  it("không có message/httpStatus/egressCountry → vẫn soạn được, không in 'undefined'", () => {
    const tin = soanTinGiamSatGdt(suKien({ loai: "hoi_phuc", verdict: "OK" }));
    expect(tin).not.toContain("undefined");
  });

  it("có egressCountry → hiện nước egress", () => {
    expect(soanTinGiamSatGdt(suKien({ egressCountry: "SG" }))).toContain("SG");
  });
});

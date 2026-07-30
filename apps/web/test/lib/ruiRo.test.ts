// U41 — suy ra DANH SÁCH VIỆC CẦN XỬ LÝ từ số liệu kỳ + trạng thái kết nối.
//
// Hàm thuần, không React, không mạng: mọi quyết định "hiện mục gì, câu chữ ra sao, dẫn đi
// đâu" nằm ở đây để test được từng tổ hợp mà không phải dựng cả trang.
//
// NGUYÊN TẮC XUYÊN SUỐT: không con số nào đứng một mình. Mỗi mục = sự việc + hệ quả nghiệp
// vụ + một hành động. Không có mục nào ⇒ trang chuyển sang trạng thái trấn an, KHÔNG hiện
// danh sách rỗng.
import { describe, expect, it } from "vitest";
import { deltaThuePhaiNop, viecCanXuLy } from "../../src/lib/ruiRo";
import type { ChieuSummary } from "../../src/types/api";

const chieu = (over: Partial<ChieuSummary> & { chieu: string }): ChieuSummary => ({
  count: 0,
  tongTcthue: null,
  tongTthue: null,
  tongTtbso: null,
  ...over,
});

/** Không kết nối, không số liệu — nền để từng ca thêm đúng một tín hiệu. */
const KHONG_GI = {
  byChieu: [] as ChieuSummary[],
  daKetNoi: true,
  soBiSuaKyKhac: 0,
  coQuyenKetNoi: true,
};

const ma = (ds: ReturnType<typeof viecCanXuLy>) => ds.map((v) => v.ma);

describe("viecCanXuLy — suy việc từ số liệu", () => {
  it("không tín hiệu nào ⇒ danh sách rỗng (trang tự chuyển sang trạng thái trấn an)", () => {
    expect(viecCanXuLy(KHONG_GI)).toEqual([]);
  });

  it("chưa kết nối ⇒ đúng một mục, nút chính, dẫn tới trang kết nối", () => {
    const ds = viecCanXuLy({ ...KHONG_GI, daKetNoi: false });
    expect(ma(ds)).toEqual(["chua_ket_noi"]);
    expect(ds[0]?.den).toBe("/tax-accounts");
    expect(ds[0]?.chinh).toBe(true);
  });

  // Chưa kết nối thì mọi con số đều vô nghĩa — hiện kèm cảnh báo hóa đơn chỉ gây nhiễu.
  it("chưa kết nối ⇒ nuốt hết mục khác, kể cả khi cache còn số liệu cũ", () => {
    const ds = viecCanXuLy({
      byChieu: [chieu({ chieu: "purchase", soLoaiKhoiTong: 9, soMaLa: 3 })],
      daKetNoi: false,
      soBiSuaKyKhac: 4,
      coQuyenKetNoi: true,
    });
    expect(ma(ds)).toEqual(["chua_ket_noi"]);
  });

  it("hóa đơn bị thay thế ⇒ nêu số + hệ quả kê khai, dẫn sang danh sách đã lọc", () => {
    const ds = viecCanXuLy({
      ...KHONG_GI,
      byChieu: [chieu({ chieu: "purchase", soLoaiKhoiTong: 2 })],
    });
    expect(ma(ds)).toContain("bi_thay_the");
    const v = ds.find((x) => x.ma === "bi_thay_the");
    expect(v?.cau).toMatch(/^2 hóa đơn đã bị thay thế —/);
    expect(v?.den).toContain("biSua=true");
  });

  it("cộng số bị thay thế của CẢ HAI chiều, không chỉ một", () => {
    const ds = viecCanXuLy({
      ...KHONG_GI,
      byChieu: [
        chieu({ chieu: "purchase", soLoaiKhoiTong: 2 }),
        chieu({ chieu: "sold", soLoaiKhoiTong: 5 }),
      ],
    });
    expect(ds.find((x) => x.ma === "bi_thay_the")?.cau).toMatch(/^7 hóa đơn/);
  });

  it("hóa đơn bị điều chỉnh ⇒ mục riêng, sắc độ info (giải thích số đã đổi)", () => {
    const ds = viecCanXuLy({
      ...KHONG_GI,
      byChieu: [chieu({ chieu: "sold", soDuocDieuChinh: 5 })],
    });
    const v = ds.find((x) => x.ma === "bi_dieu_chinh");
    expect(v?.cau).toMatch(/^5 hóa đơn đã bị điều chỉnh —/);
    expect(v?.sacDo).toBe("info");
  });

  it("hóa đơn kỳ khác bị sửa ⇒ nhắc khai bổ sung, liên kết BỎ khoảng ngày", () => {
    const ds = viecCanXuLy({ ...KHONG_GI, soBiSuaKyKhac: 1 });
    const v = ds.find((x) => x.ma === "ky_khac_bi_sua");
    expect(v?.cau).toMatch(/khai bổ sung/);
    expect(v?.den).not.toContain("tuNgay");
  });

  // `ttxly`/mã lạ chưa có mã nào được kiểm chứng ⇒ KHÔNG tô màu gợi nghĩa.
  it("mã trạng thái lạ ⇒ sắc độ trung tính, không đỏ không vàng", () => {
    const ds = viecCanXuLy({ ...KHONG_GI, byChieu: [chieu({ chieu: "sold", soMaLa: 3 })] });
    expect(ds.find((x) => x.ma === "ma_la")?.sacDo).toBe("trung_tinh");
  });

  it("lệch số thuế phải nộp ⇒ nêu hướng bằng chữ, không để dấu trừ đứng cạnh chữ", () => {
    const ds = viecCanXuLy({
      ...KHONG_GI,
      byChieu: [
        chieu({ chieu: "purchase", soLoaiKhoiTong: 1, thueDaLoai: "0" }),
        chieu({ chieu: "sold", soLoaiKhoiTong: 1, thueDaLoai: "4180000" }),
      ],
    });
    const v = ds.find((x) => x.ma === "lech_thue_phai_nop");
    expect(v?.cau).toMatch(/giảm/);
    expect(v?.cau).not.toMatch(/-\s*giảm|giảm\s*-/);
    expect(v?.cau).toMatch(/4\.180\.000/);
  });

  it("Δ thuế bằng 0 ⇒ KHÔNG hiện mục lệch thuế (không có việc gì để làm)", () => {
    const ds = viecCanXuLy({
      ...KHONG_GI,
      byChieu: [
        chieu({ chieu: "purchase", soLoaiKhoiTong: 1, thueDaLoai: "1000" }),
        chieu({ chieu: "sold", soLoaiKhoiTong: 1, thueDaLoai: "1000" }),
      ],
    });
    expect(ma(ds)).not.toContain("lech_thue_phai_nop");
  });

  // Tab đang mở giữ dữ liệu summary shape CŨ tới lần refetch kế (queryKey không đổi sau
  // deploy). Thiếu trường phải hiểu là CHƯA BIẾT ⇒ im lặng, không suy thành 0 rồi báo bừa.
  it("shape cũ (thiếu trường U36) ⇒ không sinh cảnh báo nào", () => {
    const ds = viecCanXuLy({
      ...KHONG_GI,
      byChieu: [chieu({ chieu: "purchase", count: 120, tongTthue: "999" })],
    });
    expect(ds).toEqual([]);
  });

  it("nhiều tín hiệu ⇒ xếp theo mức nghiêm trọng: lệch thuế trước, mã lạ sau cùng", () => {
    const ds = viecCanXuLy({
      byChieu: [
        chieu({ chieu: "purchase", soLoaiKhoiTong: 2, soMaLa: 3, thueDaLoai: "500" }),
        chieu({ chieu: "sold", soDuocDieuChinh: 5, thueDaLoai: "0" }),
      ],
      daKetNoi: true,
      soBiSuaKyKhac: 1,
      coQuyenKetNoi: true,
    });
    expect(ma(ds)[0]).toBe("lech_thue_phai_nop");
    expect(ma(ds).at(-1)).toBe("ma_la");
  });

  // Vai `ke_toan` không được vào /tax-accounts. Chìa nút dẫn tới đó là hứa suông — bấm vào
  // ăn 403. Bộ test cũ (auth + taxAccounts) đã bắt đúng lỗi này khi bản đầu bỏ sót.
  it("chưa kết nối + KHÔNG có quyền ⇒ không nút, câu tự nói phải nhờ ai", () => {
    const ds = viecCanXuLy({ ...KHONG_GI, daKetNoi: false, coQuyenKetNoi: false });
    expect(ma(ds)).toEqual(["chua_ket_noi"]);
    expect(ds[0]?.den).toBeUndefined();
    expect(ds[0]?.nhanHanhDong).toBeUndefined();
    expect(ds[0]?.cau).toMatch(/liên hệ kế toán trưởng/);
  });

  it("mỗi mục đều có đủ ba phần: câu, hành động, đích đến", () => {
    const ds = viecCanXuLy({
      byChieu: [chieu({ chieu: "purchase", soLoaiKhoiTong: 2, soMaLa: 1, soDuocDieuChinh: 1 })],
      daKetNoi: true,
      soBiSuaKyKhac: 2,
      coQuyenKetNoi: true,
    });
    expect(ds.length).toBeGreaterThan(0);
    for (const v of ds) {
      expect(v.cau.length).toBeGreaterThan(10);
      // Mục KHÔNG có hành động là hợp lệ khi việc đó ngoài quyền của vai — khi ấy câu văn
      // phải tự nói ai làm được (ca riêng bên dưới). Mục CÓ hành động thì phải đủ chuẩn.
      if (v.nhanHanhDong) {
        expect(v.nhanHanhDong.length).toBeLessThanOrEqual(40); // ui.md: nhãn nút ≤ 40 ký tự
        expect(v.nhanHanhDong).not.toMatch(/\.$/); // không dấu chấm cuối
        expect(v.den).toMatch(/^\//);
      }
    }
  });
});

// `deltaThuePhaiNop` chuyển từ `features/invoices/ThongBaoTrangThai.tsx` sang đây để Tổng quan
// và Danh sách hóa đơn dùng CHUNG một hàm. Ba ca dưới giữ nguyên hợp đồng cũ.
describe("deltaThuePhaiNop — giữ nguyên hợp đồng sau khi chuyển nhà", () => {
  it("không chiều nào có mã 4 ⇒ null", () => {
    expect(deltaThuePhaiNop([chieu({ chieu: "purchase", count: 5 })])).toBeNull();
  });

  it("hai chiều ngược dấu: mua vào − bán ra", () => {
    const d = deltaThuePhaiNop([
      chieu({ chieu: "purchase", soLoaiKhoiTong: 1, thueDaLoai: "300" }),
      chieu({ chieu: "sold", soLoaiKhoiTong: 1, thueDaLoai: "500" }),
    ]);
    expect(d).toBe("-200");
  });

  it("tiền vượt 2^53 vẫn đúng (BigInt trên chuỗi, không Number)", () => {
    const d = deltaThuePhaiNop([
      chieu({ chieu: "purchase", soLoaiKhoiTong: 1, thueDaLoai: "9007199254740993" }),
      chieu({ chieu: "sold", soLoaiKhoiTong: 1, thueDaLoai: "1" }),
    ]);
    expect(d).toBe("9007199254740992");
  });
});

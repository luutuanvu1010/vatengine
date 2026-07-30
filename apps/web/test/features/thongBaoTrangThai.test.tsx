// U36 Gói 4 — thông báo "hóa đơn bị thay thế đã bị loại khỏi tổng" trên trang Danh sách.
//
// Vì sao BẮT BUỘC có thông báo (§7.2): tổng của các kỳ ĐÃ QUA sẽ khác con số người dùng
// từng thấy và từng xuất file. Đổi số mà không giải thích thì kế toán sẽ tưởng phần mềm hỏng
// — hoặc tệ hơn, tưởng nghĩa vụ thuế của họ thay đổi.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThongBaoTrangThai } from "../../src/features/invoices/ThongBaoTrangThai";
// U41 — hàm chuyển sang nguồn dùng chung; các ca dưới GIỮ NGUYÊN vì chúng phủ những tổ hợp
// (shape cũ, tiền vượt 2^53) mà test của lib/ruiRo không lặp lại.
import { deltaThuePhaiNop } from "../../src/lib/ruiRo";
import type { ChieuSummary } from "../../src/types/api";
import { renderWithProviders } from "../helpers/renderApp";

function chieu(over: Partial<ChieuSummary> & { chieu: string }): ChieuSummary {
  return {
    count: 0,
    countTinhTong: 0,
    soLoaiKhoiTong: 0,
    tongTcthue: null,
    tongTthue: null,
    tongTtbso: null,
    soDuocDieuChinh: 0,
    soHdThayThe: 0,
    soHdDieuChinh: 0,
    soMaLa: 0,
    thueDaLoai: "0",
    ttbsoDaLoai: "0",
    thueThayTheDieuChinh: "0",
    ttbsoThayTheDieuChinh: "0",
    ...over,
  };
}

const KY = "01/07 – 31/07/2026";

describe("deltaThuePhaiNop — QĐ-12, HAI CHIỀU NGƯỢC DẤU", () => {
  it("loại mã 4 ở BÁN RA → thuế đầu ra giảm → thuế phải nộp GIẢM (âm)", () => {
    const ds = [chieu({ chieu: "sold", soLoaiKhoiTong: 3, thueDaLoai: "1711111" })];
    expect(deltaThuePhaiNop(ds)).toBe("-1711111");
  });

  it("loại mã 4 ở MUA VÀO → thuế được khấu trừ giảm → thuế phải nộp TĂNG (dương)", () => {
    // Chiều mua vào hiện chưa quan sát được mã 4, nhưng biên bản §6.5 ĐÃ RÚT kết luận
    // "GDT không trả bản gốc cho bên mua" (cỡ mẫu = 1) ⇒ phải xử lý hai chiều như nhau.
    const ds = [chieu({ chieu: "purchase", soLoaiKhoiTong: 2, thueDaLoai: "500000" })];
    expect(deltaThuePhaiNop(ds)).toBe("500000");
  });

  it("cả hai chiều → trừ nhau đúng dấu (mua vào − bán ra)", () => {
    const ds = [
      chieu({ chieu: "sold", soLoaiKhoiTong: 1, thueDaLoai: "1711111" }),
      chieu({ chieu: "purchase", soLoaiKhoiTong: 1, thueDaLoai: "711111" }),
    ];
    expect(deltaThuePhaiNop(ds)).toBe("-1000000");
  });

  it("số > 2^53 vẫn chính xác — BigInt, KHÔNG Number()/parseFloat", () => {
    const ds = [
      chieu({ chieu: "sold", soLoaiKhoiTong: 1, thueDaLoai: "9007199254740993" }),
      chieu({ chieu: "purchase", soLoaiKhoiTong: 1, thueDaLoai: "1" }),
    ];
    expect(deltaThuePhaiNop(ds)).toBe("-9007199254740992");
  });

  it("#17c cả hai chiều KHÔNG có mã 4 → null (ẩn dòng)", () => {
    expect(deltaThuePhaiNop([chieu({ chieu: "sold", soHdThayThe: 5 })])).toBeNull();
    expect(deltaThuePhaiNop([])).toBeNull();
  });

  it("#8 chịu được shape CŨ (thiếu trường) — không ném", () => {
    const cu = { chieu: "sold", count: 3, tongTcthue: null, tongTthue: null, tongTtbso: null };
    expect(() => deltaThuePhaiNop([cu as ChieuSummary])).not.toThrow();
    expect(deltaThuePhaiNop([cu as ChieuSummary])).toBeNull();
  });
});

describe("ThongBaoTrangThai — nội dung theo từng chiều", () => {
  it("#15 nêu đúng số hóa đơn + tiền đã loại, tách theo chiều", () => {
    render(
      <ThongBaoTrangThai
        badgeKy={KY}
        byChieu={[
          chieu({
            chieu: "sold",
            soLoaiKhoiTong: 3,
            thueDaLoai: "1711111",
            ttbsoDaLoai: "23100000",
            soHdThayThe: 3,
            soHdDieuChinh: 1,
            thueThayTheDieuChinh: "900000",
          }),
        ]}
      />,
    );
    const noiDung = screen.getByRole("status").textContent ?? "";
    expect(noiDung).toContain("Bán ra");
    expect(noiDung).toContain("3 hóa đơn bị thay thế");
    expect(noiDung).toContain("-1.711.111 ₫");
    expect(noiDung).toContain("-23.100.000 ₫");
    expect(noiDung).toContain("3 hóa đơn thay thế");
    expect(noiDung).toContain("1 hóa đơn điều chỉnh");
  });

  it("chiều KHÔNG có thay đổi thì KHÔNG có khối riêng cho nó", () => {
    render(
      <ThongBaoTrangThai
        badgeKy={KY}
        byChieu={[
          chieu({ chieu: "sold", soLoaiKhoiTong: 1, thueDaLoai: "100" }),
          chieu({ chieu: "purchase", count: 50 }),
        ]}
      />,
    );
    const noiDung = screen.getByRole("status").textContent ?? "";
    expect(noiDung).toContain("Bán ra");
    expect(noiDung).not.toContain("Mua vào");
  });

  // GOLDEN ĐỔI CÓ CHỦ ĐÍCH (chủ dự án chốt 2026-07-29): dòng "Từ 28/07/2026…" đã gỡ. Nó là
  // thông báo DI TRÚ, chỉ có nghĩa với người đã từng thấy số cũ, mà lại ghim vĩnh viễn — và
  // thừa, vì khối phía trên đã nêu cụ thể hơn. Nội dung chuyển sang `changelog.ts` v2.0.
  // Test nay khóa điều thay thế: thông báo phải TỰ ĐỦ NGHĨA mà không cần câu chính sách đó.
  it("#15 thông báo tự đủ nghĩa; KHÔNG ghim câu chính sách theo ngày", () => {
    render(
      <ThongBaoTrangThai
        badgeKy={KY}
        byChieu={[chieu({ chieu: "sold", soLoaiKhoiTong: 1, thueDaLoai: "100" })]}
      />,
    );
    const n = screen.getByRole("status").textContent ?? "";
    expect(n).toContain("bị thay thế");
    expect(n).toContain("đã loại khỏi tổng");
    expect(n).not.toContain("Từ 28/07/2026");
  });

  // GOLDEN ĐỔI CÓ CHỦ ĐÍCH (chủ dự án chốt 2026-07-29): chú giải "(số thuế phải nộp thật
  // không đổi - trước đây phần mềm tính dư)" ĐÃ GỠ. Nó gánh hai việc — rào chắn hiểu nhầm và
  // một câu DI TRÚ ("trước đây phần mềm tính dư") — nhưng thứ tạo ra nhu cầu rào chắn chính
  // là chữ "giảm" ở câu tiêu đề cũ, vốn không nêu giảm SO VỚI GÌ. Nay câu tự nêu mốc so sánh
  // ("Việc loại hóa đơn bị thay thế làm…") nên chú giải thành thừa thật, không phải bị cắt
  // cụt. Test khóa hai điều: mốc so sánh nằm TRONG câu, và không nhắc phiên bản phần mềm cũ.
  it("QĐ-12 — dòng thuế phải nộp xuất hiện ĐÚNG MỘT LẦN dù có hai chiều", () => {
    render(
      <ThongBaoTrangThai
        badgeKy={KY}
        byChieu={[
          chieu({ chieu: "sold", soLoaiKhoiTong: 1, thueDaLoai: "1711111" }),
          chieu({ chieu: "purchase", soLoaiKhoiTong: 1, thueDaLoai: "0" }),
        ]}
      />,
    );
    const noiDung = screen.getByRole("status").textContent ?? "";
    expect(noiDung.match(/thuế phải nộp trên báo cáo/g)).toHaveLength(1);
    expect(noiDung).toContain("giảm 1.711.111 ₫");
    // Mốc so sánh phải nằm trong chính câu đó, nếu không kế toán tưởng nghĩa vụ thuế đổi.
    expect(noiDung).toContain("Việc loại hóa đơn bị thay thế");
    // Nội dung di trú thuộc về trang "Lịch sử cập nhật", không ghim ở đây.
    expect(noiDung).not.toContain("trước đây");
  });

  it("mua vào có mã 4 → dòng thuế phải nộp nói TĂNG", () => {
    render(
      <ThongBaoTrangThai
        badgeKy={KY}
        byChieu={[chieu({ chieu: "purchase", soLoaiKhoiTong: 1, thueDaLoai: "500000" })]}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain("tăng 500.000 ₫");
  });

  it("#17c không chiều nào có mã 4 → KHÔNG có dòng thuế phải nộp", () => {
    render(
      <ThongBaoTrangThai
        badgeKy={KY}
        byChieu={[chieu({ chieu: "sold", soHdThayThe: 2, thueThayTheDieuChinh: "5000" })]}
      />,
    );
    expect(screen.getByRole("status").textContent).not.toContain("thuế phải nộp trên báo cáo");
  });

  it("#16 QĐ-6 — soMaLa > 0 → cảnh báo mã chưa xác định", () => {
    render(
      <ThongBaoTrangThai badgeKy={KY} byChieu={[chieu({ chieu: "sold", soMaLa: 2, count: 2 })]} />,
    );
    const noiDung = document.body.textContent ?? "";
    expect(noiDung).toContain("2 hóa đơn mang mã trạng thái chưa xác định");
  });

  it("#7 tenant chưa có dữ liệu (byChieu rỗng) → không hiện gì, KHÔNG crash", () => {
    const { container } = render(<ThongBaoTrangThai badgeKy={KY} byChieu={[]} />);
    expect(container.textContent).toBe("");
  });

  it("#8 shape CŨ trong cache (thiếu mọi trường mới) → không hiện gì, KHÔNG ném", () => {
    const cu = { chieu: "sold", count: 12, tongTcthue: "1", tongTthue: "1", tongTtbso: "1" };
    const { container } = render(<ThongBaoTrangThai badgeKy={KY} byChieu={[cu as ChieuSummary]} />);
    expect(container.textContent).toBe("");
  });

  it("không có kỳ (badgeKy null) → vẫn hiện thông báo, không ném", () => {
    render(
      <ThongBaoTrangThai
        badgeKy={null}
        byChieu={[chieu({ chieu: "sold", soLoaiKhoiTong: 1, thueDaLoai: "100" })]}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain("1 hóa đơn bị thay thế");
  });
});

// Lỗ hổng A (rà soát 2026-07-28): `soDuocDieuChinh` được API tính sẵn nhưng giao diện KHÔNG
// hiển thị ở đâu cả — bỏ sót của U36.3.
//
// Vì sao nó quan trọng: mã 5 nghĩa là "hóa đơn CỦA KỲ NÀY đã bị một hóa đơn khác sửa" — mà
// hóa đơn sửa nó có thể nằm ở KỲ SAU. Ca thật: HĐ 7914 lập 23/06/2026 (mã 5) bị HĐ 9842 lập
// 09/07/2026 điều chỉnh giảm 3.599.999 đ. Người mở kỳ tháng 6 hiện không thấy dấu hiệu nào,
// trong khi đó chính là tình huống phải cân nhắc khai bổ sung.
describe("soDuocDieuChinh — hóa đơn của kỳ này bị sửa bởi hóa đơn kỳ khác", () => {
  it("soDuocDieuChinh > 0 → hiện cảnh báo, kể cả khi kỳ KHÔNG có hóa đơn mã 4", () => {
    // Đúng hình dạng kỳ 06/2026: có mã 5, không có mã 4, không có mã 2/3 lập trong kỳ.
    render(
      <ThongBaoTrangThai
        badgeKy={KY}
        byChieu={[chieu({ chieu: "sold", count: 100, soDuocDieuChinh: 1 })]}
      />,
    );
    const noiDung = document.body.textContent ?? "";
    expect(noiDung).toContain("1 hóa đơn");
    expect(noiDung).toContain("kỳ khác");
  });

  it("nêu rõ phải kiểm trước khi kê khai (không để người dùng tự đoán ý nghĩa)", () => {
    render(
      <ThongBaoTrangThai badgeKy={KY} byChieu={[chieu({ chieu: "sold", soDuocDieuChinh: 2 })]} />,
    );
    expect(document.body.textContent).toContain("kê khai");
  });

  it("cộng dồn cả hai chiều — không bỏ sót chiều nào", () => {
    render(
      <ThongBaoTrangThai
        badgeKy={KY}
        byChieu={[
          chieu({ chieu: "sold", soDuocDieuChinh: 2 }),
          chieu({ chieu: "purchase", soDuocDieuChinh: 3 }),
        ]}
      />,
    );
    expect(document.body.textContent).toContain("5 hóa đơn");
  });

  it("soDuocDieuChinh = 0 → KHÔNG hiện gì (không dọa người dùng vô cớ)", () => {
    const { container } = render(
      <ThongBaoTrangThai badgeKy={KY} byChieu={[chieu({ chieu: "sold", count: 50 })]} />,
    );
    expect(container.textContent).toBe("");
  });

  it("shape CŨ thiếu trường → không ném, không hiện", () => {
    const cu = { chieu: "sold", count: 9, tongTcthue: null, tongTthue: null, tongTtbso: null };
    const { container } = render(<ThongBaoTrangThai badgeKy={KY} byChieu={[cu as ChieuSummary]} />);
    expect(container.textContent).toBe("");
  });
});

// U39 gói B — bung danh sách hóa đơn BỊ SỬA ngay tại thông báo.
//
// Vì sao cần: nút "Hóa đơn vừa thay đổi" chỉ thấy hóa đơn đổi trạng thái TRONG LÚC hệ thống
// theo dõi — 16/17 hóa đơn mã 4 đã là mã 4 từ lần đồng bộ đầu nên không xuất hiện ở đó. Người
// dùng cần xem "kỳ này đang có những hóa đơn lệch nào", là câu hỏi khác hẳn.
describe("Bung danh sách hóa đơn bị sửa (U39)", () => {
  const KY_LOC = { tuNgay: "2026-07-01", denNgay: "2026-07-31" };

  it("hiện ĐỦ BỘ BA số tiền cho hóa đơn bị thay thế (mã 4)", () => {
    render(
      <ThongBaoTrangThai
        badgeKy={KY}
        filter={KY_LOC}
        byChieu={[
          chieu({
            chieu: "sold",
            soLoaiKhoiTong: 3,
            tcthueDaLoai: "21388889",
            thueDaLoai: "1711111",
            ttbsoDaLoai: "23100000",
          }),
        ]}
      />,
    );
    const n = screen.getByRole("status").textContent ?? "";
    expect(n).toContain("21.388.889");
    expect(n).toContain("1.711.111");
    expect(n).toContain("23.100.000");
  });

  it("mã 5 hiện RIÊNG và nói rõ VẪN tính vào tổng — không để kế toán trừ nhầm", () => {
    render(
      <ThongBaoTrangThai
        badgeKy={KY}
        filter={KY_LOC}
        byChieu={[
          chieu({
            chieu: "sold",
            soDuocDieuChinh: 1,
            tcthueBiDieuChinh: "3333333",
            thueBiDieuChinh: "266667",
            ttbsoBiDieuChinh: "3600000",
          }),
        ]}
      />,
    );
    const n = document.body.textContent ?? "";
    expect(n).toContain("3.600.000");
    expect(n).toContain("vẫn tính vào tổng");
  });

  it("có nút bung danh sách khi có hóa đơn bị sửa", () => {
    render(
      <ThongBaoTrangThai
        badgeKy={KY}
        filter={KY_LOC}
        byChieu={[chieu({ chieu: "sold", soLoaiKhoiTong: 3, thueDaLoai: "1" })]}
      />,
    );
    expect(screen.getByRole("button", { name: /Xem danh sách/ })).toBeTruthy();
  });

  it("KHÔNG có nút bung khi không có hóa đơn nào bị sửa", () => {
    render(
      <ThongBaoTrangThai
        badgeKy={KY}
        filter={KY_LOC}
        byChieu={[chieu({ chieu: "sold", soHdThayThe: 2, thueThayTheDieuChinh: "5" })]}
      />,
    );
    expect(screen.queryByRole("button", { name: /Xem danh sách/ })).toBeNull();
  });

  it("shape CŨ thiếu bộ ba → không ném, không hiện số rác", () => {
    const cu = { chieu: "sold", count: 5, tongTcthue: null, tongTthue: null, tongTtbso: null };
    const { container } = render(
      <ThongBaoTrangThai badgeKy={KY} filter={KY_LOC} byChieu={[cu as ChieuSummary]} />,
    );
    expect(container.textContent).toBe("");
  });
});

// U39 gói B — DANH SÁCH bung ra. QA 2026-07-29 bắt được: phần này 0% test phủ, kéo file
// xuống dưới ngưỡng 80% và chỉ qua cổng nhờ file khác bù. Không có test nào từng bấm nút.
describe("DanhSachBiSua — nội dung danh sách bung ra (U39)", () => {
  const KY_LOC = { tuNgay: "2026-07-01", denNgay: "2026-07-31" };
  const goi: string[] = [];

  afterEach(() => {
    goi.length = 0;
    vi.restoreAllMocks();
  });

  function mockDs(rows: unknown[], total = rows.length, status = 200) {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      goi.push(url);
      if (url.includes("/invoices")) {
        return new Response(JSON.stringify({ rows, total, limit: 100, offset: 0 }), {
          status,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    });
  }

  const hd = (over: Record<string, unknown> = {}) => ({
    id: "hd-1",
    khhdon: "C26MYY",
    shdon: "12250",
    tdlap: "2026-07-25T17:00:00Z",
    tthai: 4,
    chieu: "sold",
    tgtcthue: "1805556",
    tgtthue: "144444",
    tgtttbso: "1950000",
    ...over,
  });

  const moBang = (byChieu: ChieuSummary[]) =>
    renderWithProviders(<ThongBaoTrangThai badgeKy={KY} filter={KY_LOC} byChieu={byChieu} />);

  it("CHƯA bấm → KHÔNG gọi API (không tải sẵn cho mọi lần mở trang)", () => {
    mockDs([hd()]);
    moBang([chieu({ chieu: "sold", soLoaiKhoiTong: 1, thueDaLoai: "1" })]);
    expect(goi.filter((u) => u.includes("/invoices?"))).toEqual([]);
  });

  it("bấm → gọi API KÈM biSua=true và ĐÚNG kỳ đang lọc", async () => {
    mockDs([hd()]);
    moBang([chieu({ chieu: "sold", soLoaiKhoiTong: 1, thueDaLoai: "1" })]);
    await userEvent.click(screen.getByRole("button", { name: /Xem danh sách/ }));
    await waitFor(() => expect(goi.some((u) => u.includes("biSua=true"))).toBe(true));
    const u = goi.find((x) => x.includes("biSua=true")) ?? "";
    expect(u).toContain("tuNgay=2026-07-01");
    expect(u).toContain("denNgay=2026-07-31");
  });

  it("hiện số hiệu, ngày, nhãn trạng thái và ba số tiền của TỪNG hóa đơn", async () => {
    mockDs([hd()]);
    moBang([chieu({ chieu: "sold", soLoaiKhoiTong: 1, thueDaLoai: "1" })]);
    await userEvent.click(screen.getByRole("button", { name: /Xem danh sách/ }));
    expect(await screen.findByText("C26MYY-12250")).toBeTruthy();
    const n = document.body.textContent ?? "";
    expect(n).toContain("26/07/2026"); // tdlap 17:00Z = 26/07 giờ VN, không lệch ngày
    expect(n).toContain("Bị thay thế");
    expect(n).toContain("1.805.556");
    expect(n).toContain("1.950.000");
  });

  it("danh sách RỖNG → nói rõ, không để khoảng trắng câm", async () => {
    mockDs([], 0);
    moBang([chieu({ chieu: "sold", soLoaiKhoiTong: 1, thueDaLoai: "1" })]);
    await userEvent.click(screen.getByRole("button", { name: /Xem danh sách/ }));
    expect(await screen.findByText(/Không có hóa đơn nào bị sửa/)).toBeTruthy();
  });

  // Dùng 400 chứ không 500: `makeQueryClient` retry một lần cho lỗi >= 500, nên test phải
  // đợi hết backoff — chậm và dễ chớp tắt trên CI. Nhánh hiển thị lỗi là MỘT, không đổi.
  it("API lỗi → hiện ErrorState, KHÔNG màn trắng", async () => {
    mockDs([], 0, 400);
    moBang([chieu({ chieu: "sold", soLoaiKhoiTong: 1, thueDaLoai: "1" })]);
    await userEvent.click(screen.getByRole("button", { name: /Xem danh sách/ }));
    expect(await screen.findByText(/Không tải được danh sách/)).toBeTruthy();
  });

  it("nhiều hơn trần tải → NÓI RÕ đang cắt, không im lặng", async () => {
    mockDs([hd()], 250);
    moBang([chieu({ chieu: "sold", soLoaiKhoiTong: 250, thueDaLoai: "1" })]);
    await userEvent.click(screen.getByRole("button", { name: /Xem danh sách/ }));
    expect(await screen.findByText(/Đang hiển thị 1\/250 hóa đơn/)).toBeTruthy();
  });

  it("bấm lần nữa → ẩn danh sách", async () => {
    mockDs([hd()]);
    moBang([chieu({ chieu: "sold", soLoaiKhoiTong: 1, thueDaLoai: "1" })]);
    await userEvent.click(screen.getByRole("button", { name: /Xem danh sách/ }));
    await screen.findByText("C26MYY-12250");
    await userEvent.click(screen.getByRole("button", { name: /Ẩn danh sách/ }));
    expect(screen.queryByText("C26MYY-12250")).toBeNull();
  });
});

// QA bắt: con số trên nút KHÔNG bị test khóa ⇒ ai đó quên cộng `soDuocDieuChinh` thì số lệch
// danh sách mà test vẫn xanh. Người dùng bấm vào thấy số khác là mất tin tưởng ngay.
describe("Số trên nút phải khớp tập server trả (mã 4 + mã 5, cả hai chiều)", () => {
  const KY_LOC = { tuNgay: "2026-07-01", denNgay: "2026-07-31" };

  it("cộng ĐỦ mã 4 và mã 5", () => {
    render(
      <ThongBaoTrangThai
        badgeKy={KY}
        filter={KY_LOC}
        byChieu={[chieu({ chieu: "sold", soLoaiKhoiTong: 3, soDuocDieuChinh: 1, thueDaLoai: "1" })]}
      />,
    );
    screen.getByRole("button", { name: "Xem danh sách 4 hóa đơn" });
  });

  it("cộng ĐỦ cả hai chiều", () => {
    render(
      <ThongBaoTrangThai
        badgeKy={KY}
        filter={KY_LOC}
        byChieu={[
          chieu({ chieu: "sold", soLoaiKhoiTong: 3, soDuocDieuChinh: 1, thueDaLoai: "1" }),
          chieu({ chieu: "purchase", soLoaiKhoiTong: 2, soDuocDieuChinh: 5, thueDaLoai: "1" }),
        ]}
      />,
    );
    screen.getByRole("button", { name: "Xem danh sách 11 hóa đơn" });
  });
});

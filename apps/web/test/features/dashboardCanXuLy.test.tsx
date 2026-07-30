// U41 — trang Tổng quan: khối "Cần xử lý" + bốn trạng thái.
//
// Việc suy ra DANH SÁCH việc đã có test riêng ở `test/lib/ruiRo.test.ts` (hàm thuần). Tệp này
// chỉ kiểm phần trang: gọi đúng nguồn dữ liệu, dựng đủ bốn trạng thái, và liên kết "Xem danh
// sách" mang theo bộ lọc — không dẫn tới danh sách trống rỗng.
import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "../../src/features/dashboard/DashboardPage";
import { renderWithProviders } from "../helpers/renderApp";

const HO_SO = {
  ten: "Công ty TNHH Tour Đảo",
  mst: "4201568932",
  goiDichVu: "Miễn phí",
  role: "ke_toan_truong",
};

const TOKEN_CON_HAN = [{ id: "tk1", username: "4201568932", tokenHetHan: "2999-06-15T10:30:00Z" }];

interface Kich {
  taiKhoan?: unknown;
  tomTatKy?: unknown;
  tomTatMoiKy?: unknown;
  /** `total` của GET /invoices?biSua=true (bỏ ngày) — hóa đơn bị sửa MỌI kỳ. */
  tongBiSua?: number;
  loiTomTat?: boolean;
  treo?: boolean;
}

/** Định tuyến theo path. Trả `never`-pending khi `treo` để soi trạng thái đang tải. */
function mock(k: Kich) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (k.treo) return new Promise<Response>(() => {}); // không bao giờ resolve
    if (url.includes("/me")) return json(HO_SO);
    if (url.includes("/tax-accounts")) return json(k.taiKhoan ?? TOKEN_CON_HAN);
    if (url.includes("/invoices/summary")) {
      if (k.loiTomTat) return new Response("{}", { status: 500 });
      // Lời gọi "mọi kỳ" KHÔNG mang tuNgay; lời gọi của kỳ hiện tại thì có.
      const moiKy = !url.includes("tuNgay");
      return json((moiKy ? k.tomTatMoiKy : k.tomTatKy) ?? { byChieu: [], total: { count: 0 } });
    }
    if (url.includes("/invoices")) return json({ rows: [], total: k.tongBiSua ?? 0 });
    return json({});
  });
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const ve = () => renderWithProviders(<DashboardPage />);

describe("Tổng quan — khối Cần xử lý", () => {
  afterEach(() => vi.restoreAllMocks());

  it("có việc ⇒ nêu số + hệ quả, và nút dẫn sang danh sách ĐÃ LỌC", async () => {
    mock({
      tomTatKy: {
        byChieu: [{ chieu: "purchase", count: 4, soLoaiKhoiTong: 2 }],
        total: { count: 4 },
      },
    });
    ve();
    expect(
      await screen.findByText(/2 hóa đơn đã bị thay thế — không được tính vào tổng kê khai/),
    ).toBeInTheDocument();
    // Bấm vào phải ra ĐÚNG tập hóa đơn đó. Liên kết trống là biến cảnh báo thành ngõ cụt —
    // đúng lỗi U37c từng phải đi sửa.
    const nut = screen.getAllByRole("link", { name: "Xem danh sách" })[0];
    expect(nut).toHaveAttribute("href", expect.stringContaining("biSua=true"));
  });

  // TRẠNG THÁI TRẤN AN — không phải "chưa có dữ liệu". Đây là lúc phần mềm chứng minh giá
  // trị rõ nhất, nên nó phải nói thành lời chứ không để khối trống.
  it("không có việc nào ⇒ câu trấn an, KHÔNG phải màn rỗng", async () => {
    mock({ tomTatKy: { byChieu: [{ chieu: "purchase", count: 9 }], total: { count: 9 } } });
    ve();
    expect(await screen.findByText(/không có việc nào cần xử lý/i)).toBeInTheDocument();
    expect(screen.queryByText(/Chưa có dữ liệu/)).not.toBeInTheDocument();
  });

  it("hóa đơn bị sửa ở kỳ khác ⇒ nhắc khai bổ sung (tổng mọi kỳ trừ phần trong kỳ)", async () => {
    mock({
      tomTatKy: {
        byChieu: [{ chieu: "purchase", count: 4, soLoaiKhoiTong: 1 }],
        total: { count: 4 },
      },
      tongBiSua: 3, // 3 mọi kỳ − 1 trong kỳ = 2 ở kỳ khác
    });
    ve();
    expect(
      await screen.findByText(/2 hóa đơn thuộc kỳ khác vừa bị sửa — có thể phải khai bổ sung/),
    ).toBeInTheDocument();
  });
});

describe("Tổng quan — bốn trạng thái", () => {
  afterEach(() => vi.restoreAllMocks());

  it("đang tải ⇒ không để màn trắng", async () => {
    mock({ treo: true });
    const { container } = ve();
    expect(await screen.findByRole("heading", { level: 1, name: "Tổng quan" })).toBeInTheDocument();
    expect(container.textContent).toMatch(/Đang tải/);
  });

  it("lỗi số liệu ⇒ nói việc gì hỏng + còn cách làm tiếp, không phơi mã lỗi thô", async () => {
    mock({ loiTomTat: true });
    ve();
    // Chờ lâu hơn mặc định 1s: `makeQueryClient` retry lỗi 5xx đúng một lần, có backoff.
    // Trạng thái lỗi vì vậy chỉ tới sau lượt thử thứ hai — đây là hành vi đúng của app.
    expect(
      await screen.findByText(/Không truy xuất được số liệu/, {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thử lại" })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\b500\b|Internal Server/);
  });

  // Khách MỚI: ấn tượng đầu tiên. Không được là một trang số 0 vô hồn.
  it("chưa kết nối tài khoản thuế ⇒ một việc duy nhất, nút chính dẫn đi kết nối", async () => {
    mock({ taiKhoan: [] });
    ve();
    const cau = await screen.findByText(/Chưa kết nối tới hệ thống Tổng cục Thuế/);
    // Khối "Lối tắt" cũng có liên kết cùng tên ⇒ khoanh vào ĐÚNG dòng việc. Hai liên kết
    // trùng đích trên một màn là có chủ đích: một là việc gấp, một là lối đi thường ngày.
    const dong = cau.parentElement;
    if (!dong) throw new Error("Không tìm được dòng việc chứa câu cảnh báo");
    expect(within(dong).getByRole("link", { name: "Kết nối tài khoản thuế" })).toBeInTheDocument();
    // Không trộn cảnh báo hóa đơn khi chưa có gì để nói.
    expect(screen.queryByText(/đã bị thay thế/)).not.toBeInTheDocument();
  });

  it("đã kết nối ⇒ dòng trạng thái nêu hạn token (kế thừa U23-C)", async () => {
    mock({});
    ve();
    expect(await screen.findByText(/Đã kết nối/)).toBeInTheDocument();
    expect(screen.getByText(/15\/06\/2999/)).toBeInTheDocument();
  });
});

describe("Tổng quan — số liệu và chỉ số", () => {
  afterEach(() => vi.restoreAllMocks());

  it("hai chiều mua vào / bán ra, tiền hiển thị phân nhóm nghìn", async () => {
    mock({
      tomTatKy: {
        byChieu: [
          { chieu: "purchase", count: 4, tongTthue: "204786364", tongTtbso: "2252650000" },
          { chieu: "sold", count: 2, tongTthue: "6192728", tongTtbso: "68120000" },
        ],
        total: { count: 6 },
      },
    });
    ve();
    const mua = await screen.findByTestId("so-lieu-purchase");
    expect(within(mua).getByText(/204\.786\.364/)).toBeInTheDocument();
    const ban = screen.getByTestId("so-lieu-sold");
    expect(within(ban).getByText(/6\.192\.728/)).toBeInTheDocument();
  });

  it("chỉ số đã đo được lấy từ lời gọi KHÔNG lọc ngày (mọi kỳ)", async () => {
    mock({
      tomTatKy: { byChieu: [], total: { count: 6 } },
      tomTatMoiKy: { byChieu: [], total: { count: 18462 } },
    });
    ve();
    expect(await screen.findByText("18.462")).toBeInTheDocument();
  });

  // Không quy đổi ra giờ/tiền tiết kiệm — số suy đoán trình bày như sự thật là vi phạm
  // nguyên tắc bằng chứng của Hiến pháp.
  it("KHÔNG có chỉ số quy đổi kiểu 'tiết kiệm ~N giờ'", async () => {
    mock({ tomTatMoiKy: { byChieu: [], total: { count: 18462 } } });
    const { container } = ve();
    await screen.findByText("18.462");
    expect(container.textContent).not.toMatch(/tiết kiệm/i);
    expect(container.textContent).not.toMatch(/giờ nhập liệu/i);
  });
});

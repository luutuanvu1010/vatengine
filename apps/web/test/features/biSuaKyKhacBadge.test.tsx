// U40 — nút "Hóa đơn bị sửa ở kỳ khác".
//
// ĐỔI RUỘT (chủ dự án chốt 2026-07-29). Trước đây nút này đọc bảng lịch sử thay đổi và đếm
// "chưa đọc" — hai cái sai:
//   • THIẾU: chỉ thấy hóa đơn đổi trạng thái TRONG LÚC hệ thống theo dõi. 16/17 hóa đơn mã 4
//     đã là mã 4 ngay lần đồng bộ đầu nên không bao giờ xuất hiện.
//   • DƯ: hóa đơn của kỳ đang xem đã được thẻ Kết quả liệt kê đầy đủ bên dưới.
// Và cảnh báo tắt khi người dùng BẤM XEM — tức nhìn một cái là mất cảnh báo vĩnh viễn.
//
// Ruột mới KHÔNG có trạng thái đã-đọc: con số là hàm thuần của dữ liệu × bộ lọc. Nó đếm hóa
// đơn bị sửa NẰM NGOÀI kỳ đang xem — đúng phần mà thẻ Kết quả không thể thấy, và là đường
// duy nhất báo ca vắt kỳ (HĐ tháng 6 bị HĐ tháng 7 điều chỉnh → rủi ro khai bổ sung).
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BiSuaKyKhacBadge } from "../../src/features/invoices/BiSuaKyKhacBadge";
import { renderWithProviders } from "../helpers/renderApp";

const KY = { tuNgay: "2026-07-01", denNgay: "2026-07-31" };
const goi: string[] = [];

function mockDs(rows: unknown[], total = rows.length) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    goi.push(url);
    if (url.includes("/invoices")) {
      return new Response(JSON.stringify({ rows, total, limit: 100, offset: 0 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  });
}

const hd = (shdon: string, tdlap: string, tthai = 4) => ({
  id: `hd-${shdon}`,
  khhdon: "C26MYY",
  shdon,
  tdlap,
  tthai,
  chieu: "sold",
  tgtcthue: "1000",
  tgtthue: "80",
  tgtttbso: "1080",
});

afterEach(() => {
  goi.length = 0;
  vi.restoreAllMocks();
});

describe("BiSuaKyKhacBadge — con số DẪN XUẤT, không có trạng thái đã đọc", () => {
  it("tổng 5, trong kỳ 3 → chấm hiện 2 (phần NGOÀI kỳ)", async () => {
    mockDs([], 5);
    renderWithProviders(<BiSuaKyKhacBadge filter={KY} trongKy={3} onChonKy={vi.fn()} />);
    expect(await screen.findByTestId("so-chua-doc")).toHaveTextContent("2");
  });

  it("tổng = trong kỳ → KHÔNG hiện nút (không có gì ở kỳ khác để báo)", async () => {
    mockDs([], 3);
    renderWithProviders(<BiSuaKyKhacBadge filter={KY} trongKy={3} onChonKy={vi.fn()} />);
    await waitFor(() => expect(goi.some((u) => u.includes("biSua=true"))).toBe(true));
    expect(screen.queryByRole("button", { name: /kỳ khác/ })).toBeNull();
  });

  it("không có hóa đơn bị sửa nào → KHÔNG hiện nút", async () => {
    mockDs([], 0);
    renderWithProviders(<BiSuaKyKhacBadge filter={KY} trongKy={0} onChonKy={vi.fn()} />);
    await waitFor(() => expect(goi.some((u) => u.includes("biSua=true"))).toBe(true));
    expect(screen.queryByRole("button", { name: /kỳ khác/ })).toBeNull();
  });

  it("đếm theo ĐÚNG bộ lọc hiện tại (giữ chiều, BỎ khoảng ngày)", async () => {
    mockDs([], 5);
    renderWithProviders(
      <BiSuaKyKhacBadge filter={{ ...KY, chieu: "sold" }} trongKy={1} onChonKy={vi.fn()} />,
    );
    await waitFor(() => expect(goi.some((u) => u.includes("biSua=true"))).toBe(true));
    const u = goi.find((x) => x.includes("biSua=true")) ?? "";
    expect(u).toContain("chieu=sold"); // giữ chiều, nếu không số sẽ lệch với thẻ Kết quả
    expect(u).not.toContain("tuNgay"); // bỏ ngày, nếu không sẽ đếm đúng kỳ đang xem
    expect(u).not.toContain("denNgay");
  });

  it("KHÔNG bao giờ ra số âm dù summary và danh sách lệch nhau", async () => {
    mockDs([], 2);
    renderWithProviders(<BiSuaKyKhacBadge filter={KY} trongKy={9} onChonKy={vi.fn()} />);
    await waitFor(() => expect(goi.some((u) => u.includes("biSua=true"))).toBe(true));
    expect(screen.queryByRole("button", { name: /kỳ khác/ })).toBeNull();
  });
});

describe("BiSuaKyKhacBadge — panel liệt kê theo kỳ và nhảy sang kỳ đó", () => {
  it("gom theo THÁNG và bỏ hóa đơn thuộc kỳ đang xem", async () => {
    mockDs(
      [
        hd("7914", "2026-06-22T17:00:00Z", 5), // tháng 6 (giờ VN 23/06)
        hd("9484", "2026-07-05T17:00:00Z"), // tháng 7 — ĐANG xem, phải loại
        hd("1111", "2026-05-09T17:00:00Z"), // tháng 5
      ],
      3,
    );
    renderWithProviders(<BiSuaKyKhacBadge filter={KY} trongKy={1} onChonKy={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: /kỳ khác/ }));
    // Nhắm ĐÚNG nút chọn kỳ: chuỗi "06/2026" còn xuất hiện trong ngày lập "23/06/2026",
    // dùng findByText sẽ khớp hai chỗ và hỏng vì lý do chẳng liên quan.
    expect(await screen.findByRole("button", { name: /Xem kỳ 06\/2026/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Xem kỳ 05\/2026/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Xem kỳ 07\/2026/ })).toBeNull();
  });

  it("bấm một kỳ → gọi onChonKy với ĐÚNG đầu và cuối tháng đó", async () => {
    const chon = vi.fn();
    mockDs([hd("7914", "2026-06-22T17:00:00Z", 5)], 2);
    renderWithProviders(<BiSuaKyKhacBadge filter={KY} trongKy={1} onChonKy={chon} />);
    await userEvent.click(await screen.findByRole("button", { name: /kỳ khác/ }));
    await userEvent.click(await screen.findByRole("button", { name: /06\/2026/ }));
    expect(chon).toHaveBeenCalledWith("2026-06-01", "2026-06-30");
  });

  it("ngày lập tính theo giờ VN — 17:00Z là ngày HÔM SAU, không xếp nhầm tháng", async () => {
    // 30/06 17:00Z = 01/07 giờ VN ⇒ thuộc tháng 7 (kỳ đang xem) ⇒ phải bị loại khỏi danh sách.
    mockDs([hd("9999", "2026-06-30T17:00:00Z")], 2);
    renderWithProviders(<BiSuaKyKhacBadge filter={KY} trongKy={1} onChonKy={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: /kỳ khác/ }));
    expect(await screen.findByText(/Không còn hóa đơn/)).toBeTruthy();
  });
});

describe("BiSuaKyKhacBadge — chưa biết số trong kỳ thì IM LẶNG", () => {
  it("trongKy undefined (summary shape CŨ trong cache) → KHÔNG hiện gì", async () => {
    mockDs([], 12);
    const { container } = renderWithProviders(
      <BiSuaKyKhacBadge filter={KY} trongKy={undefined} onChonKy={vi.fn()} />,
    );
    // Không trừ được phần trong kỳ ⇒ nói "12 hóa đơn ở kỳ khác" là sai to hơn thực tế.
    expect(container.textContent).toBe("");
  });
});

// QA 2026-07-29 bắt được: bản đầu so "tháng chứa hóa đơn có nằm trọn trong khoảng lọc không"
// nên hóa đơn nằm HẲN trong kỳ vẫn bị xếp sang "kỳ khác" khi kỳ không trùng biên tháng.
// FilterBar cho nhập ngày tự do nên đây là thao tác thật, không phải giả thuyết.
describe("Kỳ lọc KHÔNG trùng biên tháng", () => {
  const KY_LECH = { tuNgay: "2026-06-15", denNgay: "2026-07-15" };

  it("hóa đơn nằm TRONG kỳ lệch biên → KHÔNG bị xếp sang 'kỳ khác'", async () => {
    // 19/06 17:00Z = 20/06 giờ VN, nằm hẳn trong 15/06–15/07.
    mockDs([hd("2222", "2026-06-19T17:00:00Z", 5)], 2);
    renderWithProviders(<BiSuaKyKhacBadge filter={KY_LECH} trongKy={1} onChonKy={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: /kỳ khác/ }));
    expect(await screen.findByText(/Không còn hóa đơn/)).toBeTruthy();
  });

  it("hóa đơn NGOÀI kỳ lệch biên vẫn được liệt kê", async () => {
    // 09/05 17:00Z = 10/05 giờ VN, ngoài 15/06–15/07.
    mockDs([hd("3333", "2026-05-09T17:00:00Z")], 2);
    renderWithProviders(<BiSuaKyKhacBadge filter={KY_LECH} trongKy={1} onChonKy={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: /kỳ khác/ }));
    expect(await screen.findByRole("button", { name: /Xem kỳ 05\/2026/ })).toBeTruthy();
  });

  it("biên dưới đúng ngày đầu kỳ → thuộc TRONG kỳ", async () => {
    // 14/06 17:00Z = 15/06 giờ VN = đúng tuNgay.
    mockDs([hd("4444", "2026-06-14T17:00:00Z")], 2);
    renderWithProviders(<BiSuaKyKhacBadge filter={KY_LECH} trongKy={1} onChonKy={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: /kỳ khác/ }));
    expect(await screen.findByText(/Không còn hóa đơn/)).toBeTruthy();
  });
});

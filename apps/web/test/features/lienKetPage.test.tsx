import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LienKetPage } from "../../src/features/lienket/LienKetPage";
import { mailtoChiaSe, noiDungChiaSe, tieuDeChiaSe } from "../../src/lib/chiaSeLink";

function ve() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <LienKetPage />
    </QueryClientProvider>,
  );
}

function mockApi(bang: Record<string, () => Response>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    const duongDan = new URL(url, "http://test.local").pathname;
    const method = (init?.method ?? "GET").toUpperCase();
    for (const [khoa, fn] of Object.entries(bang)) {
      const [m, duong] = khoa.split(" ");
      if (m === method && duongDan === duong) return fn();
    }
    return new Response("{}", { status: 404 });
  });
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const GOI = {
  id: "g1",
  nmmst: "0312000001",
  nmten: "Công ty TNHH ABC",
  tuNgay: "2026-07-01",
  denNgay: "2026-07-31",
  soHoaDon: 12,
  trangThai: "san_sang" as const,
  soLuotTai: 3,
  lanTaiCuoi: "2026-07-29T00:00:00Z",
  taoLuc: "2026-07-28T00:00:00Z",
  hetHanLuc: "2026-08-05T00:00:00Z",
  url: "https://vatengine.tourdao.vn/tai/abcdefghijkmnpqrstuvwxyz23",
};

afterEach(() => vi.restoreAllMocks());

describe("Trang Liên kết chia sẻ — bốn trạng thái", () => {
  it("đang tải → hiện trạng thái chờ, không màn trắng", () => {
    mockApi({ "GET /goi-chia-se": () => json({ items: [] }) });
    ve();
    expect(screen.getByText(/đang tải/i)).toBeInTheDocument();
  });

  // Trạng thái rỗng chỉ báo "trống" thì người dùng đứng lại; phải nói việc cần làm tiếp.
  it("rỗng → CHỈ ĐƯỜNG sang chỗ tạo, không chỉ báo trống", async () => {
    mockApi({ "GET /goi-chia-se": () => json({ items: [] }) });
    ve();
    expect(await screen.findByText(/danh sách hóa đơn/i)).toBeInTheDocument();
  });

  it("lỗi → hiện lỗi kèm nút thử lại, KHÔNG nuốt im lặng", async () => {
    mockApi({ "GET /goi-chia-se": () => json({ error: "server_error" }, 500) });
    ve();
    expect(await screen.findByText(/không tải được danh sách/i)).toBeInTheDocument();
  });

  it("có dữ liệu → hiện TÊN khách (không bắt đọc MST trần), kỳ và số lượt tải", async () => {
    mockApi({ "GET /goi-chia-se": () => json({ items: [GOI] }) });
    ve();

    expect(await screen.findByText("Công ty TNHH ABC")).toBeInTheDocument();
    expect(screen.getByText(/Mã số thuế 0312000001/)).toBeInTheDocument();
    expect(screen.getByText(/Đã tải 3 lượt/)).toBeInTheDocument();
  });
});

describe("Trang Liên kết chia sẻ — hành động", () => {
  it("gói sẵn sàng → anchor có nghĩa + Sao chép + Gửi Email, KHÔNG phơi URL trần", async () => {
    mockApi({ "GET /goi-chia-se": () => json({ items: [GOI] }) });
    ve();

    const link = await screen.findByRole("link", { name: "Liên kết tải hóa đơn" });
    expect(link).toHaveAttribute("href", GOI.url);
    expect(screen.queryByText(GOI.url)).toBeNull();
    expect(screen.getByRole("button", { name: /sao chép liên kết/i })).toBeInTheDocument();
  });

  it("gói ĐÃ THU HỒI → không còn chào mời liên kết", async () => {
    mockApi({
      "GET /goi-chia-se": () => json({ items: [{ ...GOI, trangThai: "da_thu_hoi", url: null }] }),
    });
    ve();

    // Chữ "Đã thu hồi" xuất hiện ở CẢ nhãn trạng thái lẫn dòng giải thích — khẳng định
    // findByText mơ hồ sẽ đỏ vì tìm thấy hai. Nhắm đúng câu giải thích.
    expect(await screen.findByText(/liên kết không còn tải được/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Liên kết tải hóa đơn" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^thu hồi$/i })).toBeNull();
  });

  it("bấm Thu hồi → gọi API rồi nạp lại danh sách", async () => {
    const f = mockApi({
      "GET /goi-chia-se": () => json({ items: [GOI] }),
      "POST /goi-chia-se/g1/thu-hoi": () => json({ id: "g1", trangThai: "da_thu_hoi" }),
    });
    const nguoiDung = userEvent.setup();
    ve();

    await nguoiDung.click(await screen.findByRole("button", { name: /^thu hồi$/i }));

    await waitFor(() =>
      expect(
        f.mock.calls.some(
          (c) =>
            new URL(String(typeof c[0] === "string" ? c[0] : (c[0] as Request).url), "http://t")
              .pathname === "/goi-chia-se/g1/thu-hoi",
        ),
      ).toBe(true),
    );
  });
});

describe("Nội dung chia sẻ — hàm thuần", () => {
  const T = {
    url: "https://x/tai/abc",
    nmten: "Cty A & B",
    tuNgay: "01/07/2026",
    denNgay: "31/07/2026",
  };

  it("tiêu đề nêu tên khách; thiếu tên thì vẫn dùng được", () => {
    expect(tieuDeChiaSe(T)).toContain("Cty A & B");
    expect(tieuDeChiaSe({ url: T.url })).toBe("Hóa đơn điện tử");
  });

  it("thân thư có liên kết và nói rõ thời hiệu", () => {
    const than = noiDungChiaSe(T);
    expect(than).toContain(T.url);
    expect(than).toContain("khoảng 1 tuần");
  });

  // Quên mã hóa thì dấu `&` trong tên doanh nghiệp CẮT MẤT phần thân thư, và người dùng chỉ
  // phát hiện khi khách đã nhận một lá thư cụt.
  it("mã hóa `&` trong tên doanh nghiệp — không cắt cụt thân thư", () => {
    const link = mailtoChiaSe(T);
    expect(link.startsWith("mailto:?")).toBe(true);
    expect(link).toContain("%26");
    const q = new URLSearchParams(link.slice("mailto:?".length));
    expect(q.get("subject")).toContain("Cty A & B");
    expect(q.get("body")).toContain(T.url);
  });

  // `URLSearchParams` mã hóa khoảng trắng thành `+`, mà `mailto:` đọc `+` là dấu cộng thật.
  it("khoảng trắng thành %20, KHÔNG phải dấu cộng", () => {
    const link = mailtoChiaSe(T);
    expect(link).not.toContain("+");
    expect(link).toContain("%20");
  });

  it("KHÔNG điền sẵn người nhận — hóa đơn không mang email người mua", () => {
    expect(mailtoChiaSe(T).startsWith("mailto:?")).toBe(true);
  });
});

describe("Chia sẻ lại sau khi thu hồi (nghiệm thu tay 2026-07-29)", () => {
  const DA_THU_HOI = { ...GOI, trangThai: "da_thu_hoi" as const, url: null };

  it("gói đã thu hồi → CÓ nút Chia sẻ lại, không để người dùng vào ngõ cụt", async () => {
    mockApi({ "GET /goi-chia-se": () => json({ items: [DA_THU_HOI] }) });
    ve();
    expect(await screen.findByRole("button", { name: /chia sẻ lại/i })).toBeInTheDocument();
  });

  // Token cũ đã nằm trong tay người mà ta vừa thu hồi. Hồi sinh gói cũ là xóa sạch ý nghĩa
  // của việc thu hồi ⇒ phải TẠO MỚI, và phải mang đúng khách hàng + kỳ của gói cũ.
  it("bấm → TẠO GÓI MỚI theo đúng khách hàng và kỳ cũ, KHÔNG hồi sinh gói cũ", async () => {
    const f = mockApi({
      "GET /goi-chia-se": () => json({ items: [DA_THU_HOI] }),
      "POST /goi-chia-se": () => json({ id: "g2", soHoaDon: 12, trangThai: "dang_tao" }, 201),
    });
    const nguoiDung = userEvent.setup();
    ve();

    await nguoiDung.click(await screen.findByRole("button", { name: /chia sẻ lại/i }));

    await waitFor(() => {
      const post = f.mock.calls.find((c) => (c[1]?.method ?? "GET").toUpperCase() === "POST");
      expect(post).toBeTruthy();
      const than = JSON.parse(String(post?.[1]?.body ?? "{}"));
      expect(than).toEqual({ nmmst: GOI.nmmst, tuNgay: GOI.tuNgay, denNgay: GOI.denNgay });
    });
    // KHÔNG có đường "bỏ thu hồi" nào được gọi trên gói cũ.
    expect(
      f.mock.calls.some((c) => String(typeof c[0] === "string" ? c[0] : "").includes("/g1/")),
    ).toBe(false);
  });

  it("tạo lại thất bại → NÓI RA, không im lặng", async () => {
    mockApi({
      "GET /goi-chia-se": () => json({ items: [DA_THU_HOI] }),
      "POST /goi-chia-se": () => json({ error: "khong_co_hoa_don" }, 400),
    });
    const nguoiDung = userEvent.setup();
    ve();

    await nguoiDung.click(await screen.findByRole("button", { name: /chia sẻ lại/i }));
    expect(await screen.findByText(/không tạo được liên kết mới/i)).toBeInTheDocument();
  });
});

describe("Gói kẹt ở 'dang_tao' tự lành", () => {
  // Trước bản này CHỈ thẻ bên trang Danh sách hóa đơn biết gọi `dong-goi`. Gói tạo ở nơi
  // khác — hoặc gói mà người dùng đóng tab giữa chừng — nằm chết ở `dang_tao` VĨNH VIỄN.
  // Đã thấy đúng một hàng như vậy trên production.
  it("hàng dang_tao đã tải xong → trang tự gọi dong-goi, không nằm chết", async () => {
    const f = mockApi({
      "GET /goi-chia-se": () => json({ items: [{ ...GOI, trangThai: "dang_tao", url: null }] }),
      "GET /goi-chia-se/g1": () =>
        json({ id: "g1", trangThai: "dang_tao", tienDo: { tong: 12, xong: 12, conCho: 0 } }),
      "POST /goi-chia-se/g1/dong-goi": () =>
        json({ id: "g1", trangThai: "san_sang", soHoaDon: 12, url: GOI.url }),
    });
    ve();

    await waitFor(() =>
      expect(
        f.mock.calls.some(
          (c) =>
            new URL(String(typeof c[0] === "string" ? c[0] : (c[0] as Request).url), "http://t")
              .pathname === "/goi-chia-se/g1/dong-goi",
        ),
      ).toBe(true),
    );
  });

  it("hàng dang_tao còn đang tải → hiện tiến độ, CHƯA đóng gói vội", async () => {
    const f = mockApi({
      "GET /goi-chia-se": () => json({ items: [{ ...GOI, trangThai: "dang_tao", url: null }] }),
      "GET /goi-chia-se/g1": () =>
        json({ id: "g1", trangThai: "dang_tao", tienDo: { tong: 12, xong: 5, conCho: 7 } }),
    });
    ve();

    expect(await screen.findByText(/5\s*\/\s*12/)).toBeInTheDocument();
    expect(f.mock.calls.some((c) => String(c[0]).includes("dong-goi"))).toBe(false);
  });
});

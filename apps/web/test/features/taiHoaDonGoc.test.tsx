import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TaiHoaDonGoc } from "../../src/features/invoices/TaiHoaDonGoc";
import type { InvoiceFilter } from "../../src/types/api";

// Bộ lọc ĐỦ ba vế để nút mở được (QĐ-B4 + B1 + B9).
const DU: InvoiceFilter = {
  chieu: "sold",
  nmmst: "0312000001",
  tuNgay: "2026-07-01",
  denNgay: "2026-07-31",
};

function ve(filter: InvoiceFilter = DU) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <TaiHoaDonGoc filter={filter} />
    </QueryClientProvider>,
  );
}

/**
 * Mock fetch khớp ĐƯỜNG DẪN CHÍNH XÁC + method.
 *
 * Bản đầu khớp bằng `url.includes(duong)` — `"POST /goi-chia-se"` nuốt luôn
 * `POST /goi-chia-se/g1/dong-goi` và trả nhầm phản hồi tạo gói, làm link không bao giờ
 * hiện. Khớp lỏng ở mock là cách êm ái nhất để test nói dối.
 */
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TaiHoaDonGoc — ba vế mở nút, mỗi vế một lý do riêng", () => {
  const nut = () => screen.getByRole("button", { name: /tải hóa đơn gốc/i });

  it("đủ ba vế → nút bấm được", () => {
    mockApi({});
    ve();
    expect(nut()).toBeEnabled();
  });

  it("chưa chọn khách hàng → khóa nút, nói ĐÚNG lý do đó", () => {
    mockApi({});
    ve({ ...DU, nmmst: undefined });

    expect(nut()).toBeDisabled();
    expect(screen.getByText(/chọn một khách hàng/i)).toBeInTheDocument();
  });

  it("đang ở chiều Mua vào → khóa nút, nói ĐÚNG lý do đó", () => {
    mockApi({});
    ve({ ...DU, chieu: "purchase" });

    expect(nut()).toBeDisabled();
    expect(screen.getByText(/chỉ tải được hóa đơn bán ra/i)).toBeInTheDocument();
  });

  it("thiếu khoảng thời gian → khóa nút, nói ĐÚNG lý do đó", () => {
    mockApi({});
    ve({ ...DU, tuNgay: undefined });

    expect(nut()).toBeDisabled();
    expect(screen.getByText(/chọn khoảng thời gian/i)).toBeInTheDocument();
  });

  // Thiếu nhiều vế mà gộp một câu chung chung thì người dùng sửa xong vế này vẫn không
  // bấm được và không hiểu vì sao.
  it("thiếu HAI vế → nêu cả hai, không gộp thành một câu chung", () => {
    mockApi({});
    ve({ chieu: "purchase" });

    expect(screen.getByText(/chọn một khách hàng/i)).toBeInTheDocument();
    expect(screen.getByText(/chỉ tải được hóa đơn bán ra/i)).toBeInTheDocument();
  });
});

describe("TaiHoaDonGoc — cảnh báo có xác nhận (QĐ-7)", () => {
  it("bấm nút → hiện cảnh báo link công khai, CHƯA gọi API", async () => {
    const f = mockApi({});
    const nguoiDung = userEvent.setup();
    ve();

    await nguoiDung.click(screen.getByRole("button", { name: /tải hóa đơn gốc/i }));

    expect(screen.getByText(/ai có đường dẫn/i)).toBeInTheDocument();
    expect(f).not.toHaveBeenCalled();
  });

  it("chưa tick xác nhận → nút phát hành vẫn khóa", async () => {
    mockApi({});
    const nguoiDung = userEvent.setup();
    ve();

    await nguoiDung.click(screen.getByRole("button", { name: /tải hóa đơn gốc/i }));
    expect(screen.getByRole("button", { name: /^tạo đường dẫn/i })).toBeDisabled();
  });

  it("tick xác nhận rồi mới phát hành được", async () => {
    const f = mockApi({
      "POST /goi-chia-se": () => json({ id: "g1", soHoaDon: 2, trangThai: "dang_tao" }, 201),
      "GET /goi-chia-se/g1": () =>
        json({ id: "g1", trangThai: "dang_tao", tienDo: { tong: 2, xong: 0, conCho: 2 } }),
    });
    const nguoiDung = userEvent.setup();
    ve();

    await nguoiDung.click(screen.getByRole("button", { name: /tải hóa đơn gốc/i }));
    await nguoiDung.click(screen.getByRole("checkbox"));
    await nguoiDung.click(screen.getByRole("button", { name: /^tạo đường dẫn/i }));

    await waitFor(() => expect(f).toHaveBeenCalled());
    const goiPost = f.mock.calls.find((c) => (c[1]?.method ?? "GET") === "POST");
    expect(goiPost).toBeTruthy();
    expect(String(goiPost?.[1]?.body)).toContain("0312000001");
  });
});

describe("TaiHoaDonGoc — bốn trạng thái", () => {
  it("đang tải dở → hiện tiến độ, chưa có link", async () => {
    mockApi({
      "POST /goi-chia-se": () => json({ id: "g1", soHoaDon: 3, trangThai: "dang_tao" }, 201),
      "GET /goi-chia-se/g1": () =>
        json({ id: "g1", trangThai: "dang_tao", tienDo: { tong: 3, xong: 1, conCho: 2 } }),
    });
    const nguoiDung = userEvent.setup();
    ve();

    await nguoiDung.click(screen.getByRole("button", { name: /tải hóa đơn gốc/i }));
    await nguoiDung.click(screen.getByRole("checkbox"));
    await nguoiDung.click(screen.getByRole("button", { name: /^tạo đường dẫn/i }));

    expect(await screen.findByText(/1\s*\/\s*3/)).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("xong → hiện link tải và nút thu hồi", async () => {
    mockApi({
      "POST /goi-chia-se": () => json({ id: "g1", soHoaDon: 1, trangThai: "dang_tao" }, 201),
      "GET /goi-chia-se/g1": () =>
        json({ id: "g1", trangThai: "dang_tao", tienDo: { tong: 1, xong: 1, conCho: 0 } }),
      "POST /goi-chia-se/g1/dong-goi": () =>
        json({
          id: "g1",
          trangThai: "san_sang",
          soHoaDon: 1,
          soThieu: 0,
          url: "https://docs.tourdao.vn/goi-hoa-don/2026-07/abc.zip",
        }),
    });
    const nguoiDung = userEvent.setup();
    ve();

    await nguoiDung.click(screen.getByRole("button", { name: /tải hóa đơn gốc/i }));
    await nguoiDung.click(screen.getByRole("checkbox"));
    await nguoiDung.click(screen.getByRole("button", { name: /^tạo đường dẫn/i }));

    // U37c — KHÔNG phơi URL trần nữa: một chuỗi 26 ký tự ngẫu nhiên dán giữa giao diện vừa
    // rối vừa mời chép tay sai. Anchor mang chữ có nghĩa, URL nằm ở `href`.
    const link = await screen.findByRole("link", { name: "Liên kết tải hóa đơn" });
    expect(link).toHaveAttribute("href", "https://docs.tourdao.vn/goi-hoa-don/2026-07/abc.zip");
    expect(screen.queryByText(/goi-hoa-don\/2026-07\/abc\.zip/)).toBeNull();
    expect(screen.getByRole("button", { name: /sao chép liên kết/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /gửi email/i })).toHaveAttribute(
      "href",
      expect.stringContaining("mailto:") as unknown as string,
    );
    expect(screen.getByRole("button", { name: /thu hồi/i })).toBeInTheDocument();
  });

  it("có hóa đơn không lấy được → NÓI RA, không im lặng", async () => {
    mockApi({
      "POST /goi-chia-se": () => json({ id: "g1", soHoaDon: 3, trangThai: "dang_tao" }, 201),
      "GET /goi-chia-se/g1": () =>
        json({ id: "g1", trangThai: "dang_tao", tienDo: { tong: 3, xong: 2, conCho: 0 } }),
      "POST /goi-chia-se/g1/dong-goi": () =>
        json({ id: "g1", trangThai: "san_sang", soHoaDon: 2, soThieu: 1, url: "https://x/y.zip" }),
    });
    const nguoiDung = userEvent.setup();
    ve();

    await nguoiDung.click(screen.getByRole("button", { name: /tải hóa đơn gốc/i }));
    await nguoiDung.click(screen.getByRole("checkbox"));
    await nguoiDung.click(screen.getByRole("button", { name: /^tạo đường dẫn/i }));

    expect(await screen.findByText(/1 hóa đơn không lấy được/i)).toBeInTheDocument();
  });

  it("API lỗi → hiện lỗi, KHÔNG nuốt im lặng", async () => {
    mockApi({ "POST /goi-chia-se": () => json({ error: "khong_co_hoa_don" }, 400) });
    const nguoiDung = userEvent.setup();
    ve();

    await nguoiDung.click(screen.getByRole("button", { name: /tải hóa đơn gốc/i }));
    await nguoiDung.click(screen.getByRole("checkbox"));
    await nguoiDung.click(screen.getByRole("button", { name: /^tạo đường dẫn/i }));

    expect(await screen.findByText(/không có hóa đơn nào/i)).toBeInTheDocument();
  });
});

describe("TaiHoaDonGoc — nói đúng về thời hiệu", () => {
  it("nói 'khoảng 1 tuần', KHÔNG hứa mốc chính xác", async () => {
    mockApi({});
    const nguoiDung = userEvent.setup();
    ve();

    await nguoiDung.click(screen.getByRole("button", { name: /tải hóa đơn gốc/i }));
    // Cloudflare chỉ bảo đảm xóa TRONG VÒNG 24h sau mốc — hứa đúng ngày là hứa sai.
    expect(screen.getByText(/khoảng 1 tuần/i)).toBeInTheDocument();
  });
});

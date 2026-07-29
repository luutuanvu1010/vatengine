import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChonKhachHang } from "../../src/features/invoices/ChonKhachHang";

// Ba khách hàng phủ đúng các ca đo được ở production (U37 §4.8): tên có dấu, tên có chữ Đ
// (không tách được bằng NFD), và một khách để kiểm khớp theo MST.
const KHACH = [
  { nmmst: "0312000001", nmten: "CÔNG TY TNHH ABC", soHoaDon: 12 },
  { nmmst: "0312000002", nmten: "CÔNG TY TNHH TOUR ĐẢO", soHoaDon: 3 },
  { nmmst: "4201969169", nmten: "Minh Khang", soHoaDon: 1 },
];

function mockFetch(body: unknown, status = 200) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }) as Response,
  );
}

function ve(props: Partial<React.ComponentProps<typeof ChonKhachHang>> = {}) {
  const onChange = props.onChange ?? vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ChonKhachHang nmmst={props.nmmst} onChange={onChange} />
    </QueryClientProvider>,
  );
  return { onChange };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ChonKhachHang — nạp và hiển thị", () => {
  it("nạp danh sách và hiện 'Tên — MST · N hóa đơn'", async () => {
    mockFetch({ items: KHACH, biCatBot: false });
    const nguoiDung = userEvent.setup();
    ve();

    await nguoiDung.click(await screen.findByLabelText(/người mua/i));

    expect(await screen.findByText(/CÔNG TY TNHH ABC/)).toBeInTheDocument();
    // Dòng phụ gộp MST + số hóa đơn. Khớp CẢ CỤM: `/12/` trần trụi sẽ dính luôn chuỗi MST
    // "0312000001" (có "12" ở trong) và getByText ném vì tìm thấy nhiều phần tử.
    expect(screen.getByText("0312000001 · 12 hóa đơn")).toBeInTheDocument();
  });

  it("chưa có khách hàng nào → thông báo rỗng, KHÔNG màn trắng", async () => {
    mockFetch({ items: [], biCatBot: false });
    const nguoiDung = userEvent.setup();
    ve();

    await nguoiDung.click(await screen.findByLabelText(/người mua/i));
    expect(await screen.findByText(/chưa có người mua/i)).toBeInTheDocument();
  });

  it("API lỗi → hiện lỗi, KHÔNG nuốt im lặng", async () => {
    mockFetch({ error: "server" }, 500);
    const nguoiDung = userEvent.setup();
    ve();

    await nguoiDung.click(await screen.findByLabelText(/người mua/i));
    expect(await screen.findByText(/không tải được/i)).toBeInTheDocument();
  });

  it("biCatBot=true → nhắc gõ thêm để thu hẹp (không cắt im lặng)", async () => {
    mockFetch({ items: KHACH, biCatBot: true });
    const nguoiDung = userEvent.setup();
    ve();

    await nguoiDung.click(await screen.findByLabelText(/người mua/i));
    expect(await screen.findByText(/gõ thêm/i)).toBeInTheDocument();
  });
});

describe("ChonKhachHang — tìm live", () => {
  it("gõ KHÔNG dấu vẫn ra khách CÓ dấu", async () => {
    mockFetch({ items: KHACH, biCatBot: false });
    const nguoiDung = userEvent.setup();
    ve();

    const o = await screen.findByLabelText(/người mua/i);
    await nguoiDung.type(o, "cong ty");

    expect(await screen.findByText(/CÔNG TY TNHH ABC/)).toBeInTheDocument();
    expect(screen.queryByText(/Minh Khang/)).toBeNull();
  });

  it("gõ 'dao' ra được 'TOUR ĐẢO' — chữ Đ phải xử lý riêng", async () => {
    mockFetch({ items: KHACH, biCatBot: false });
    const nguoiDung = userEvent.setup();
    ve();

    await nguoiDung.type(await screen.findByLabelText(/người mua/i), "dao");
    expect(await screen.findByText(/TOUR ĐẢO/)).toBeInTheDocument();
  });

  it("gõ MST cũng tìm được (không chỉ tên)", async () => {
    mockFetch({ items: KHACH, biCatBot: false });
    const nguoiDung = userEvent.setup();
    ve();

    await nguoiDung.type(await screen.findByLabelText(/người mua/i), "42019");
    expect(await screen.findByText(/Minh Khang/)).toBeInTheDocument();
    expect(screen.queryByText(/CÔNG TY TNHH ABC/)).toBeNull();
  });

  it("gõ không khớp ai → báo không tìm thấy", async () => {
    mockFetch({ items: KHACH, biCatBot: false });
    const nguoiDung = userEvent.setup();
    ve();

    await nguoiDung.type(await screen.findByLabelText(/người mua/i), "khongcoai");
    expect(await screen.findByText(/không tìm thấy/i)).toBeInTheDocument();
  });
});

describe("ChonKhachHang — chọn và xóa", () => {
  it("chọn một khách → onChange nhận ĐÚNG nmmst, không phải chuỗi đang gõ", async () => {
    mockFetch({ items: KHACH, biCatBot: false });
    const nguoiDung = userEvent.setup();
    const { onChange } = ve();

    await nguoiDung.type(await screen.findByLabelText(/người mua/i), "cong ty tnhh abc");
    await nguoiDung.click(await screen.findByText(/CÔNG TY TNHH ABC/));

    expect(onChange).toHaveBeenCalledWith({ nmmst: "0312000001", nmten: "CÔNG TY TNHH ABC" });
  });

  // QĐ-B4 — ca dễ lọt nhất: ô có chữ nhưng CHƯA chọn thì KHÔNG được coi là đã chọn.
  it("gõ dở rồi KHÔNG chọn → onChange KHÔNG được gọi với nmmst nào", async () => {
    mockFetch({ items: KHACH, biCatBot: false });
    const nguoiDung = userEvent.setup();
    const { onChange } = ve();

    await nguoiDung.type(await screen.findByLabelText(/người mua/i), "CÔNG TY TNHH");

    for (const goi of (onChange as ReturnType<typeof vi.fn>).mock.calls) {
      expect(goi[0]?.nmmst).toBeUndefined();
    }
  });

  it("đã chọn rồi bấm xóa → onChange trả về undefined", async () => {
    mockFetch({ items: KHACH, biCatBot: false });
    const nguoiDung = userEvent.setup();
    const { onChange } = ve({ nmmst: "0312000001" });

    await nguoiDung.click(await screen.findByRole("button", { name: /xóa/i }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  // Chỉ truyền MST (đúng thứ bộ lọc lưu) — component phải TỰ tra ra tên để hiển thị.
  it("đang có lựa chọn → hiện TÊN khách (tra từ danh sách), không phải MST trần", async () => {
    mockFetch({ items: KHACH, biCatBot: false });
    ve({ nmmst: "0312000001" });

    await waitFor(() => {
      expect(screen.getByDisplayValue(/CÔNG TY TNHH ABC/)).toBeInTheDocument();
    });
  });
});

describe("ChonKhachHang — bàn phím", () => {
  it("↓ rồi Enter chọn mục đầu tiên", async () => {
    mockFetch({ items: KHACH, biCatBot: false });
    const nguoiDung = userEvent.setup();
    const { onChange } = ve();

    const o = await screen.findByLabelText(/người mua/i);
    await nguoiDung.click(o);
    await nguoiDung.keyboard("{ArrowDown}{Enter}");

    expect(onChange).toHaveBeenCalledWith({ nmmst: "0312000001", nmten: "CÔNG TY TNHH ABC" });
  });

  it("Esc đóng danh sách mà KHÔNG chọn gì", async () => {
    mockFetch({ items: KHACH, biCatBot: false });
    const nguoiDung = userEvent.setup();
    const { onChange } = ve();

    const o = await screen.findByLabelText(/người mua/i);
    await nguoiDung.click(o);
    expect(await screen.findByText(/CÔNG TY TNHH ABC/)).toBeInTheDocument();

    await nguoiDung.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByText(/CÔNG TY TNHH ABC/)).toBeNull());
    expect(onChange).not.toHaveBeenCalled();
  });
});

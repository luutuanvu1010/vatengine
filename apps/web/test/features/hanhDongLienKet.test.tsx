// U37c — hành vi của ba nút chia sẻ liên kết.
//
// Viết SAU khi `dod-auditor` chỉ ra `HanhDongLienKet.tsx` có 0% độ phủ HÀM: cả `saoChep`
// lẫn `chiaSe` chưa từng được gọi trong bộ test, và tiêu chí nghiệm thu #9 của
// `U37c-plan.md` ("nút Chia sẻ ẩn khi trình duyệt không hỗ trợ") không có ca nào canh.
// Độ phủ tổng của apps/web vẫn 92% nên khoảng trống này bị pha loãng — đúng kiểu lỗi mà
// con số tổng che mất.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HanhDongLienKet } from "../../src/features/invoices/HanhDongLienKet";

const T = {
  url: "https://vatengine.tourdao.vn/tai/abcdefghijkmnpqrstuvwxyz23",
  nmten: "Công ty TNHH ABC",
  tuNgay: "01/07/2026",
  denNgay: "31/07/2026",
};

/** Gắn/gỡ khả năng của trình duyệt. `navigator` không cấu hình lại được bằng phép gán
 * thường trong jsdom nên phải qua `defineProperty`. */
function datKhaNang(ten: "clipboard" | "share", gt: unknown) {
  Object.defineProperty(navigator, ten, { value: gt, configurable: true, writable: true });
}

beforeEach(() => {
  datKhaNang("share", undefined);
  datKhaNang("clipboard", { writeText: vi.fn().mockResolvedValue(undefined) });
});

afterEach(() => vi.restoreAllMocks());

describe("HanhDongLienKet — không phơi URL trần", () => {
  it("hiện anchor có nghĩa, KHÔNG in URL ra màn hình", () => {
    render(<HanhDongLienKet thongTin={T} />);

    expect(screen.getByRole("link", { name: "Liên kết tải hóa đơn" })).toHaveAttribute(
      "href",
      T.url,
    );
    expect(screen.queryByText(T.url)).toBeNull();
  });
});

describe("HanhDongLienKet — Sao chép", () => {
  it("bấm → ghi ĐÚNG liên kết vào bộ nhớ tạm và BÁO cho người dùng biết", async () => {
    const nguoiDung = userEvent.setup();
    // PHẢI đặt SAU `userEvent.setup()`: nó tự cài stub clipboard riêng lên `navigator` và
    // sẽ đè mất mock đặt trước. Bẫy này làm test đỏ với thông báo rất khó lần.
    const ghi = vi.fn().mockResolvedValue(undefined);
    datKhaNang("clipboard", { writeText: ghi });
    render(<HanhDongLienKet thongTin={T} />);

    await nguoiDung.click(screen.getByRole("button", { name: /sao chép liên kết/i }));

    expect(ghi).toHaveBeenCalledWith(T.url);
    // Im lặng thì người dùng không biết đã ăn hay chưa, rồi đi dán một thứ không có.
    expect(await screen.findByRole("button", { name: /đã sao chép/i })).toBeInTheDocument();
  });

  // Clipboard đòi ngữ cảnh bảo mật + quyền. Nuốt lỗi là để người dùng đi dán khoảng trắng.
  it("clipboard hỏng → NÓI RA, không nuốt im lặng", async () => {
    const nguoiDung = userEvent.setup();
    datKhaNang("clipboard", { writeText: vi.fn().mockRejectedValue(new Error("từ chối")) });
    render(<HanhDongLienKet thongTin={T} />);

    await nguoiDung.click(screen.getByRole("button", { name: /sao chép liên kết/i }));

    expect(await screen.findByText(/không sao chép được/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /đã sao chép/i })).toBeNull();
  });
});

describe("HanhDongLienKet — Chia sẻ (tiêu chí nghiệm thu #9)", () => {
  it("trình duyệt KHÔNG hỗ trợ → ẩn HẲN nút, không hiện nút bấm-không-ăn-gì", () => {
    datKhaNang("share", undefined);
    render(<HanhDongLienKet thongTin={T} />);

    expect(screen.queryByRole("button", { name: /^chia sẻ$/i })).toBeNull();
    // Vẫn còn đường khác để chia sẻ — ẩn nút không được làm cụt tính năng.
    expect(screen.getByRole("button", { name: /sao chép liên kết/i })).toBeInTheDocument();
  });

  it("trình duyệt CÓ hỗ trợ → hiện nút và gọi khay chia sẻ kèm đủ tiêu đề + liên kết", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    datKhaNang("share", share);
    const nguoiDung = userEvent.setup();
    render(<HanhDongLienKet thongTin={T} />);

    await nguoiDung.click(screen.getByRole("button", { name: /^chia sẻ$/i }));

    expect(share).toHaveBeenCalledTimes(1);
    const doi = share.mock.calls[0]?.[0] as { title: string; text: string; url: string };
    expect(doi.url).toBe(T.url);
    expect(doi.title).toContain("Công ty TNHH ABC");
    expect(doi.text).toContain(T.url);
  });

  // Người dùng bấm HỦY khay chia sẻ cũng ném lỗi — đó là hành vi bình thường, báo lỗi ở đây
  // là dạy người dùng sợ một thao tác vô hại.
  it("người dùng HỦY khay chia sẻ → không báo lỗi gì", async () => {
    datKhaNang("share", vi.fn().mockRejectedValue(new DOMException("Abort", "AbortError")));
    const nguoiDung = userEvent.setup();
    render(<HanhDongLienKet thongTin={T} />);

    await nguoiDung.click(screen.getByRole("button", { name: /^chia sẻ$/i }));

    expect(screen.queryByText(/không sao chép được/i)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("HanhDongLienKet — Gửi Email", () => {
  it("liên kết mailto mang tiêu đề + thân thư, KHÔNG điền sẵn người nhận", () => {
    render(<HanhDongLienKet thongTin={T} />);

    const href = screen.getByRole("link", { name: /gửi email/i }).getAttribute("href") ?? "";
    // Hóa đơn không mang email người mua ⇒ đoán địa chỉ là gửi nhầm.
    expect(href.startsWith("mailto:?")).toBe(true);
    const q = new URLSearchParams(href.slice("mailto:?".length));
    expect(q.get("subject")).toContain("Công ty TNHH ABC");
    expect(q.get("body")).toContain(T.url);
  });
});

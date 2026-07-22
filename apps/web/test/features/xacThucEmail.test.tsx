// Lát cắt 1 (U34c) — Trang xác thực email + màn chờ sau khi đăng ký.
//
// Hai mối lo, đều là chuyện người dùng chứ không phải chuyện kỹ thuật:
//   1. Bốn kết cục phải TÁCH BẠCH. Gộp lại là bắt người dùng đoán nên thử lại, nên đăng
//      nhập, hay nên liên hệ hỗ trợ.
//   2. Màn chờ KHÔNG được bảo người ta đi mở hộp thư khi thư chưa gửi được. Bắt ai đó ngồi
//      chờ một bức thư không bao giờ tới là cách chắc chắn nhất để mất họ.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DangKyPage } from "../../src/features/auth/DangKyPage";
import { XacThucEmailPage } from "../../src/features/auth/XacThucEmailPage";
import { json, renderWithProviders } from "../helpers/renderApp";

afterEach(() => vi.restoreAllMocks());

/** Chỉ mock đường `/xac-thuc-email`; `/me` trả 401 như khách chưa đăng nhập. */
function mockXacThuc(tra: () => Response) {
  const goi: Array<{ url: string; method: string; body: unknown }> = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/xac-thuc-email")) {
      goi.push({
        url,
        method: (init?.method ?? "GET").toUpperCase(),
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      return tra();
    }
    return json(401, { error: "unauthorized" });
  });
  return goi;
}

describe("Trang /xac-thuc-email", () => {
  it("🔴 gửi POST (KHÔNG phải GET) kèm token lấy từ URL", async () => {
    // Điểm cốt lõi của cả trang này. Token dùng MỘT LẦN, mà máy quét thư và phần mềm diệt
    // virus tự động fetch mọi URL trong thư. Nếu đây là `GET`, chúng sẽ tiêu mất token
    // trước khi khách kịp bấm — khách mở thư lần đầu đã thấy "liên kết đã được dùng".
    const goi = mockXacThuc(() => json(200, { ok: true, trangThai: "cho_duyet" }));
    renderWithProviders(<XacThucEmailPage />, "/xac-thuc-email?token=abc123");

    await screen.findByRole("heading", { name: /Đã xác nhận địa chỉ email/i });
    expect(goi).toHaveLength(1);
    expect(goi[0]?.method).toBe("POST");
    expect(goi[0]?.body).toEqual({ token: "abc123" });
  });

  it("🔴 gọi ĐÚNG MỘT LẦN dù effect chạy hai lượt (StrictMode)", async () => {
    // Token dùng một lần: gọi hai lượt thì lượt sau nhận `da_dung` và người dùng thấy
    // thông báo SAI cho một việc họ vừa làm đúng.
    const goi = mockXacThuc(() => json(200, { ok: true, trangThai: "cho_duyet" }));
    renderWithProviders(<XacThucEmailPage />, "/xac-thuc-email?token=abc123");
    await screen.findByRole("heading", { name: /Đã xác nhận/i });
    await new Promise((r) => setTimeout(r, 20));
    expect(goi).toHaveLength(1);
  });

  it.each([
    ["het_han", /hết hạn/i, /đăng ký lại/i],
    ["da_dung", /đã được xác nhận/i, /đăng nhập/i],
    ["khong_thay", /không hợp lệ/i, /đăng ký lại/i],
  ])("mã %s → thông điệp riêng + lối đi tiếp đúng", async (ma, tieuDe, loiDi) => {
    mockXacThuc(() => json(400, { error: ma }));
    renderWithProviders(<XacThucEmailPage />, "/xac-thuc-email?token=x");
    expect(await screen.findByRole("heading", { name: tieuDe })).toBeInTheDocument();
    // Mỗi kết cục dẫn người dùng đi một hướng khác nhau — đó mới là phần có ích.
    expect(screen.getByRole("link", { name: loiDi })).toBeInTheDocument();
  });

  it("🔴 'đã dùng rồi' KHÔNG hiện như một lỗi — người dùng đã làm đúng", async () => {
    mockXacThuc(() => json(400, { error: "da_dung" }));
    renderWithProviders(<XacThucEmailPage />, "/xac-thuc-email?token=x");
    await screen.findByRole("heading", { name: /đã được xác nhận/i });
    expect(screen.getByText(/không cần làm gì thêm/i)).toBeInTheDocument();
  });

  it("thiếu token trong URL → báo hỏng, KHÔNG gọi mạng", async () => {
    const goi = mockXacThuc(() => json(200, { ok: true }));
    renderWithProviders(<XacThucEmailPage />, "/xac-thuc-email");
    expect(await screen.findByRole("heading", { name: /không hợp lệ/i })).toBeInTheDocument();
    expect(goi).toHaveLength(0);
  });
});

describe("Màn sau khi đăng ký — phải nói ĐÚNG SỰ THẬT về lá thư", () => {
  async function dienVaGui(daGuiThu: boolean) {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      String(input).endsWith("/dang-ky")
        ? json(201, { ok: true, trangThai: "cho_xac_thuc_email", daGuiThu })
        : json(401, { error: "unauthorized" }),
    );
    renderWithProviders(<DangKyPage />);
    const u = userEvent.setup();
    await u.type(screen.getByLabelText(/^Email/i), "ketoan@congty.vn");
    await u.type(screen.getByLabelText(/^Tên doanh nghiệp$/i), "Công ty TNHH ABC");
    await u.type(screen.getByLabelText(/^Mã số thuế$/i), "0101234567");
    await u.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(screen.getByRole("button", { name: /Gửi đăng ký/i })).toBeEnabled());
    await u.click(screen.getByRole("button", { name: /Gửi đăng ký/i }));
  }

  it("gửi được thư → bảo khách đi mở hộp thư, nhắc cả thư mục Spam", async () => {
    await dienVaGui(true);
    expect(await screen.findByRole("heading", { name: /Kiểm tra hộp thư/i })).toBeInTheDocument();
    expect(screen.getByText(/ketoan@congty.vn/)).toBeInTheDocument();
    expect(screen.getByText(/Spam/i)).toBeInTheDocument();
  });

  it("🔴 KHÔNG gửi được thư → TUYỆT ĐỐI không bảo khách đi mở hộp thư", async () => {
    // Đây là lý do backend phải trả cờ `daGuiThu`. Nếu màn này nói câu giống hệt ca trên,
    // khách sẽ ngồi chờ một bức thư không bao giờ tới và im lặng bỏ đi — hỏng kiểu không
    // ai đo được, vì không có lỗi nào hiện ra ở đâu cả.
    await dienVaGui(false);
    expect(await screen.findByText(/chưa gửi được thư xác nhận/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Kiểm tra hộp thư/i })).not.toBeInTheDocument();
    // Vẫn phải nói rõ đăng ký ĐÃ được lưu — nếu không họ tưởng mất trắng và đăng ký lại,
    // rồi nhận lỗi "đã tồn tại".
    expect(screen.getByText(/đã được lưu/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /đăng ký lại/i })).toBeInTheDocument();
  });
});

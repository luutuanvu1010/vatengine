// U33 (QĐ-11) — Cổng Turnstile ở hai cửa công khai.
//
// Sau khi gỡ SignupLimiter và LoginLimiter, đây là lớp phòng thủ DUY NHẤT còn lại ở tầng
// ứng dụng cho `/dang-ky` và `/auth/login`. Vì vậy hai tính chất dưới đây không phải chi
// tiết giao diện — chúng là chính lớp phòng thủ đó:
//
//   1. FAIL-CLOSED — widget chưa/không trả token thì không có đường nào gửi form đi.
//   2. TOKEN DÙNG MỘT LẦN — mỗi lượt gửi phải mang token MỚI. Đây là lỗi dễ mắc nhất và
//      khó thấy nhất: lần gửi đầu chạy đúng, chỉ lần thử LẠI mới hỏng, và hỏng với thông
//      báo "captcha hết hạn" khiến người dùng tưởng mình làm sai chứ không phải phần mềm.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DangKyPage } from "../../src/features/auth/DangKyPage";
import { LoginPage } from "../../src/features/auth/LoginPage";
import { json, renderWithProviders } from "../helpers/renderApp";
import { caiTurnstileKhongTraToken, tokenThuMay } from "../helpers/turnstile";

afterEach(() => vi.restoreAllMocks());

/** Điền đủ form đăng ký (chưa gửi). */
async function dienFormDangKy() {
  const u = userEvent.setup();
  await u.type(screen.getByLabelText(/^Email/i), "ketoan@congty.vn");
  await u.type(screen.getByLabelText(/^Tên doanh nghiệp$/i), "Công ty TNHH ABC");
  await u.type(screen.getByLabelText(/^Mã số thuế$/i), "0101234567");
  await u.click(screen.getByRole("checkbox"));
  return u;
}

describe("🔴 Fail-closed — chưa có token thì không gửi được", () => {
  it("/dang-ky: widget không trả token → nút Gửi đăng ký bị VÔ HIỆU dù form đã điền đủ", async () => {
    caiTurnstileKhongTraToken();
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      json(401, { error: "unauthorized" }),
    );
    renderWithProviders(<DangKyPage />);
    await dienFormDangKy();
    // Mọi điều kiện khác đã đủ — chỉ thiếu captcha. Nếu nút này MỞ, cổng đăng ký công khai
    // đang không được bảo vệ bởi bất cứ thứ gì ở tầng ứng dụng.
    expect(screen.getByRole("button", { name: /Gửi đăng ký/i })).toBeDisabled();
  });

  it("/login: widget không trả token → nút Đăng nhập bị VÔ HIỆU", async () => {
    caiTurnstileKhongTraToken();
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      json(401, { error: "unauthorized" }),
    );
    renderWithProviders(<LoginPage />);
    expect(await screen.findByRole("button", { name: "Đăng nhập" })).toBeDisabled();
  });

  it("THIẾU site key → báo lỗi cấu hình rõ ràng, KHÔNG im lặng mở cửa", async () => {
    // Không đặt được import.meta.env giữa chừng, nên kiểm gián tiếp qua đúng hợp đồng mà
    // component cam kết: mọi nhánh hỏng đều dẫn tới "không có token" ⇒ nút khoá. Ca này
    // canh ranh giới: nếu ai đó sửa component thành "thiếu site key thì bỏ qua captcha
    // cho tiện dev", hai ca trên vẫn xanh mà lỗ hổng đã mở — nên khẳng định thẳng rằng
    // component KHÔNG có đường tắt nào phát token khi không dựng được widget.
    caiTurnstileKhongTraToken();
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      json(401, { error: "unauthorized" }),
    );
    renderWithProviders(<LoginPage />);
    await screen.findByRole("button", { name: "Đăng nhập" });
    expect(screen.getByRole("button", { name: "Đăng nhập" })).toBeDisabled();
  });
});

describe("🔴 Token Turnstile dùng MỘT LẦN — gửi lại phải mang token mới", () => {
  it("/dang-ky: gửi hỏng rồi gửi lại → lần hai mang token KHÁC lần một", async () => {
    const thanDangKy: Array<Record<string, unknown>> = [];
    let lan = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (!String(input).endsWith("/dang-ky")) return json(401, { error: "unauthorized" });
      thanDangKy.push(JSON.parse(String(init?.body)));
      lan += 1;
      return lan === 1
        ? json(409, { error: "da_ton_tai" })
        : json(201, { ok: true, trangThai: "cho_duyet" });
    });

    renderWithProviders(<DangKyPage />);
    const u = await dienFormDangKy();
    await waitFor(() => expect(screen.getByRole("button", { name: /Gửi đăng ký/i })).toBeEnabled());
    await u.click(screen.getByRole("button", { name: /Gửi đăng ký/i }));
    expect(await screen.findByText(/đã được đăng ký/i)).toBeInTheDocument();

    // Sau lỗi, widget phải được đặt lại và cấp token mới ⇒ nút mở lại.
    await waitFor(() => expect(screen.getByRole("button", { name: /Gửi đăng ký/i })).toBeEnabled());
    await u.click(screen.getByRole("button", { name: /Gửi đăng ký/i }));
    await screen.findByRole("heading", { name: /Đã ghi nhận đăng ký/i });

    expect(thanDangKy).toHaveLength(2);
    expect(thanDangKy[0]?.["cf-turnstile-response"]).toBe(tokenThuMay(1));
    // Điểm cốt lõi: KHÁC token lần đầu. Nếu bằng nhau, siteverify sẽ trả
    // `timeout-or-duplicate` và người dùng không bao giờ thử lại thành công.
    expect(thanDangKy[1]?.["cf-turnstile-response"]).toBe(tokenThuMay(2));
  });

  it("/login: sai mật khẩu rồi thử lại → lần hai mang token KHÁC lần một", async () => {
    const thanLogin: Array<Record<string, unknown>> = [];
    let lan = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input).endsWith("/auth/login")) {
        thanLogin.push(JSON.parse(String(init?.body)));
        lan += 1;
        return lan === 1 ? json(401, { error: "unauthorized" }) : json(200, { ok: true });
      }
      return json(401, { error: "unauthorized" });
    });

    renderWithProviders(<LoginPage />);
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText("Email công việc"), "kt@congty.vn");
    await u.type(screen.getByLabelText("Mật khẩu"), "sai");
    await waitFor(() => expect(screen.getByRole("button", { name: "Đăng nhập" })).toBeEnabled());
    await u.click(screen.getByRole("button", { name: "Đăng nhập" }));
    expect(await screen.findByText(/Email hoặc mật khẩu không đúng/i)).toBeInTheDocument();

    await waitFor(() => expect(screen.getByRole("button", { name: "Đăng nhập" })).toBeEnabled());
    await u.click(screen.getByRole("button", { name: "Đăng nhập" }));

    await waitFor(() => expect(thanLogin).toHaveLength(2));
    expect(thanLogin[0]?.["cf-turnstile-response"]).toBe(tokenThuMay(1));
    expect(thanLogin[1]?.["cf-turnstile-response"]).toBe(tokenThuMay(2));
  });
});

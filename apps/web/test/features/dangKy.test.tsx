// U20 §2 — Trang Đăng ký công khai.
//
// Đây là mắt xích cuối của chuỗi onboard: trước U20, `POST /dang-ky` sống trên production
// từ U17b nhưng không có đường nào tới nó từ trình duyệt. Test ở đây canh hai thứ dễ hỏng
// nhất: route phải CÔNG KHAI (đăng ký mà bắt đăng nhập trước là vô nghĩa), và thông điệp
// lỗi phải nói đúng việc người dùng cần làm — backend có 7 mã, không phải 4 như spec viết.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DangKyPage, thongDiepLoiDangKy } from "../../src/features/auth/DangKyPage";
import { ApiError } from "../../src/lib/apiClient";
import { AppRouter } from "../../src/routes/AppRouter";
import { json, mockFetch, renderWithProviders } from "../helpers/renderApp";
import { TOKEN_TURNSTILE_TEST } from "../helpers/turnstile";

afterEach(() => vi.restoreAllMocks());

/** Điền form hợp lệ (chưa gửi). */
async function dienForm(u = userEvent.setup()) {
  await u.type(screen.getByLabelText(/^Email/i), "ketoan@congty.vn");
  await u.type(screen.getByLabelText(/^Tên doanh nghiệp$/i), "Công ty TNHH ABC");
  await u.type(screen.getByLabelText(/^Mã số thuế$/i), "0101234567");
  await u.click(screen.getByRole("checkbox"));
  return u;
}

describe("🔴 /dang-ky là route CÔNG KHAI", () => {
  it("mở được khi CHƯA đăng nhập — không bị đá về /login", async () => {
    // `/me` trả 401 = chưa có cookie phiên. Nếu route lỡ nằm trong ProtectedLayout,
    // người dùng sẽ bị đá về đăng nhập và không đời nào đăng ký được.
    mockFetch({
      login: () => json(200, { ok: true }),
      me: () => json(401, { error: "unauthorized" }),
    });
    renderWithProviders(<AppRouter />, "/dang-ky");
    expect(
      await screen.findByRole("heading", { name: /Đăng ký sử dụng VATEngine/i }),
    ).toBeInTheDocument();
  });

  it("người ĐANG đăng nhập vào /dang-ky thì bị đưa về app", async () => {
    mockFetch({
      me: () =>
        json(200, {
          ten: "Cty",
          mst: "0101234567",
          goiDichVu: "Free",
          banQuyen: "x",
          ghiChu: null,
          role: "quan_tri",
        }),
    });
    renderWithProviders(<AppRouter />, "/dang-ky");
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: /Đăng ký sử dụng VATEngine/i }),
      ).not.toBeInTheDocument(),
    );
  });

  it("/login có liên kết sang Đăng ký", async () => {
    mockFetch({
      login: () => json(200, { ok: true }),
      me: () => json(401, { error: "unauthorized" }),
    });
    renderWithProviders(<AppRouter />, "/login");
    const link = await screen.findByRole("link", { name: /Đăng ký/i });
    expect(link).toHaveAttribute("href", "/dang-ky");
  });
});

describe("Gửi đăng ký", () => {
  it("form hợp lệ → gọi POST /dang-ky đúng tham số", async () => {
    const goi = vi.fn();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      goi(String(input), init?.body ? JSON.parse(String(init.body)) : null);
      return json(201, { ok: true, trangThai: "cho_duyet" });
    });
    renderWithProviders(<DangKyPage />);
    const u = await dienForm();
    await u.click(screen.getByRole("button", { name: /Gửi đăng ký/i }));

    await waitFor(() => expect(goi).toHaveBeenCalled());
    // AuthProvider gọi /me lúc mount nên calls[0] KHÔNG phải lời gọi ta cần — lọc theo path.
    const lanDangKy = goi.mock.calls.find(([u]) => String(u).endsWith("/dang-ky"));
    expect(lanDangKy, "không thấy lời gọi POST /dang-ky").toBeDefined();
    const body = (lanDangKy as [string, Record<string, unknown>])[1];
    expect(body).toEqual({
      email: "ketoan@congty.vn",
      tenDoanhNghiep: "Công ty TNHH ABC",
      mst: "0101234567",
      dongYDieuKhoan: true,
      // U33 — tên trường phải khớp TỪNG KÝ TỰ với hằng TURNSTILE_FIELD mà backend đọc
      // (apps/api/src/turnstile.ts). Đây là chỗ duy nhất trong test cả hai phía gặp nhau,
      // nên gõ thẳng chuỗi chứ không import hằng: nếu một phía đổi tên, ca này phải ĐỎ.
      "cf-turnstile-response": TOKEN_TURNSTILE_TEST,
    });
  });

  it("🔴 chưa tích cam kết ủy quyền → nút gửi bị VÔ HIỆU", async () => {
    // Cam kết ủy quyền MST là ranh giới pháp lý (NĐ 13/2023), không phải thủ tục. Chặn ở
    // client là lớp thứ nhất; backend vẫn từ chối bằng `chua_dong_y_dieu_khoan` — hai lớp.
    renderWithProviders(<DangKyPage />);
    const u = userEvent.setup();
    await u.type(screen.getByLabelText(/^Email/i), "ketoan@congty.vn");
    await u.type(screen.getByLabelText(/^Tên doanh nghiệp$/i), "Cty ABC");
    await u.type(screen.getByLabelText(/^Mã số thuế$/i), "0101234567");
    expect(screen.getByRole("button", { name: /Gửi đăng ký/i })).toBeDisabled();
    await u.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: /Gửi đăng ký/i })).toBeEnabled();
  });

  it("MST sai định dạng → chặn tại chỗ, nút vô hiệu + báo ngay", async () => {
    renderWithProviders(<DangKyPage />);
    const u = userEvent.setup();
    await u.type(screen.getByLabelText(/^Email/i), "a@b.vn");
    await u.type(screen.getByLabelText(/^Tên doanh nghiệp$/i), "Cty");
    await u.type(screen.getByLabelText(/^Mã số thuế$/i), "123");
    await u.click(screen.getByRole("checkbox"));
    expect(screen.getByText(/đúng 10 hoặc 13 chữ số/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Gửi đăng ký/i })).toBeDisabled();
  });
});

describe("Màn sau khi đăng ký", () => {
  it("201 → hiện xác nhận kèm email đã đăng ký", async () => {
    // mockImplementation chứ KHÔNG mockResolvedValue: body của một Response chỉ đọc được
    // MỘT lần, mà AuthProvider gọi /me trước ⇒ dùng chung một instance thì lời gọi
    // /dang-ky nhận về body đã bị tiêu thụ và ném lỗi.
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      json(201, { ok: true, trangThai: "cho_xac_thuc_email", daGuiThu: true }),
    );
    renderWithProviders(<DangKyPage />);
    const u = await dienForm();
    await u.click(screen.getByRole("button", { name: /Gửi đăng ký/i }));

    expect(await screen.findByRole("heading", { name: /Kiểm tra hộp thư/i })).toBeInTheDocument();
    expect(screen.getByText(/ketoan@congty.vn/)).toBeInTheDocument();
  });

  // ── ĐẢO CHIỀU, KHÔNG XOÁ ────────────────────────────────────────────────────────────
  // Ca này TRƯỚC ĐÂY khẳng định "KHÔNG hứa gửi email", vì lúc U20 ra đời hạ tầng email
  // chưa tồn tại và một lời hứa suông sẽ khiến khách ngồi chờ bức thư không bao giờ tới.
  //
  // Lát cắt 1 làm cho lời hứa đó thành SỰ THẬT — nhưng chỉ khi thư gửi được. Nên ràng buộc
  // gốc không mất đi, nó chuyển thành dạng CÓ ĐIỀU KIỆN: chỉ được nhắc tới hộp thư khi
  // backend xác nhận đã gửi. Ca "không gửi được → tuyệt đối không bảo đi mở hộp thư" nằm ở
  // `xacThucEmail.test.tsx`.
  it("🔴 chỉ hứa gửi thư KHI backend xác nhận đã gửi được", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      json(201, { ok: true, trangThai: "cho_xac_thuc_email", daGuiThu: false }),
    );
    const { container } = renderWithProviders(<DangKyPage />);
    const u = await dienForm();
    await u.click(screen.getByRole("button", { name: /Gửi đăng ký/i }));
    await screen.findByText(/chưa gửi được thư xác nhận/i);

    const chu = container.textContent ?? "";
    expect(chu).not.toMatch(/kiểm tra (hộp thư|email|inbox)/i);
  });
});

describe("🔴 Ánh xạ ĐỦ 8 mã lỗi của backend", () => {
  // Spec U20 chỉ liệt kê 4 mã; `apps/api/src/routes/dangKy.ts` thật sự trả 8 sau U33. Bảng
  // này đối chiếu với backend, không với spec — thiếu một mã là người dùng nhận "Có lỗi xảy
  // ra" và không biết phải sửa gì.
  it.each([
    ["email_khong_hop_le", 400, /email doanh nghiệp, Gmail hoặc Yahoo/i],
    ["mst_khong_hop_le", 400, /10 hoặc 13 chữ số/i],
    ["chua_dong_y_dieu_khoan", 400, /tích ô cam kết/i],
    ["da_ton_tai", 409, /đã được đăng ký/i],
    ["bad_request", 400, /kiểm tra lại các ô/i],
    // U33 — 4 mã của cổng Turnstile, thay cho `qua_nhieu_yeu_cau`/`khong_xac_dinh_duoc_ip`.
    ["thieu_captcha", 400, /ô xác minh/i],
    ["captcha_sai", 400, /ô xác minh/i],
    ["het_han", 400, /hết hạn/i],
    ["captcha_chua_cau_hinh", 503, /liên hệ hỗ trợ/i],
  ])("%s → thông điệp riêng, nói được việc cần làm", (code, status, mong) => {
    expect(thongDiepLoiDangKy(new ApiError(status, code))).toMatch(mong);
  });

  it("lỗi mạng → thông điệp mạng, không phải 'có lỗi xảy ra'", () => {
    expect(thongDiepLoiDangKy(new ApiError(0, "network_error"))).toMatch(/kết nối|mạng/i);
  });

  // U33/QĐ-11 — hai mã `qua_nhieu_yeu_cau` và `khong_xac_dinh_duoc_ip` đã CHẾT cùng
  // SignupLimiter. Giữ một ca khẳng định điều đó: nếu ai đó thêm lại câu "thử lại sau ít
  // phút" cho hai mã này, nghĩa là rate-limit tầng ứng dụng đang bò về — ca này sẽ ĐỎ.
  it.each(["qua_nhieu_yeu_cau", "khong_xac_dinh_duoc_ip"])(
    "%s — mã đã chết sau U33: KHÔNG còn thông điệp riêng, rơi về thông điệp chung",
    (code) => {
      expect(thongDiepLoiDangKy(new ApiError(429, code))).not.toMatch(/thử lại sau ít phút/i);
    },
  );

  it("mã lạ (backend thêm sau này) → không vỡ, rơi về thông điệp chung", () => {
    expect(thongDiepLoiDangKy(new ApiError(400, "mot_ma_moi_toanh"))).toBeTruthy();
  });

  it("lỗi hiện ra trên màn hình khi gửi thất bại", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      String(input).endsWith("/dang-ky")
        ? json(409, { error: "da_ton_tai" })
        : json(401, { error: "unauthorized" }),
    );
    renderWithProviders(<DangKyPage />);
    const u = await dienForm();
    await u.click(screen.getByRole("button", { name: /Gửi đăng ký/i }));
    expect(await screen.findByText(/đã được đăng ký/i)).toBeInTheDocument();
    // Thất bại thì KHÔNG được nhảy sang màn chờ duyệt.
    expect(screen.queryByRole("heading", { name: /Đã ghi nhận đăng ký/i })).not.toBeInTheDocument();
  });
});

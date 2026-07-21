// U20 §4 — Đổi mật khẩu (không ép).
//
// Màn này là thứ làm cho mật khẩu tạm 6 số DÙNG ĐƯỢC: U18 đặt hạn 72h cho nó, nên không
// có đường đổi thì mọi khách vừa được duyệt sẽ bị khoá cứng sau 3 ngày. Test canh hai
// điều: đường đổi thật sự chạy, và mật khẩu hiện tại là BẮT BUỘC (không cho phiên bị
// chiếm đổi mật khẩu rồi khoá chủ tài khoản ra ngoài).
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DoiMatKhauCard } from "../../src/features/settings/DoiMatKhauCard";
import { json, mockFetch, renderWithProviders } from "../helpers/renderApp";

afterEach(() => vi.restoreAllMocks());

const HO_SO = {
  ten: "Công ty TNHH ABC",
  mst: "0101234567",
  goiDichVu: "Miễn phí",
  banQuyen: "Mặc định",
  ghiChu: null,
  role: "quan_tri",
};

/** Định tuyến fetch theo path; `doiMatKhau` quyết định phản hồi của /auth/doi-mat-khau.
 * Trả Response MỚI mỗi lần — body chỉ đọc được một lần. */
function mockDoi(doiMatKhau: () => Response, loginTraCo?: boolean) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/auth/doi-mat-khau")) return doiMatKhau();
    if (url.endsWith("/auth/login"))
      return json(200, loginTraCo ? { ok: true, phai_doi_mat_khau: true } : { ok: true });
    return json(200, HO_SO);
  });
}

async function dienDoi(hienTai: string, moi: string, nhapLai = moi) {
  const u = userEvent.setup();
  await u.type(screen.getByLabelText(/^Mật khẩu hiện tại$/i), hienTai);
  await u.type(screen.getByLabelText(/^Mật khẩu mới$/i), moi);
  await u.type(screen.getByLabelText(/^Nhập lại mật khẩu mới$/i), nhapLai);
  return u;
}

describe("Đổi mật khẩu — đường thành công", () => {
  it("gửi đúng tham số tới /auth/doi-mat-khau và báo thành công", async () => {
    const goi = vi.fn();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/auth/doi-mat-khau")) {
        goi(init?.body ? JSON.parse(String(init.body)) : null);
        return json(200, { ok: true });
      }
      return json(200, HO_SO);
    });
    renderWithProviders(<DoiMatKhauCard />);
    const u = await dienDoi("matkhautam123", "matkhaurieng2026");
    await u.click(screen.getByRole("button", { name: /Đổi mật khẩu/i }));

    await waitFor(() => expect(goi).toHaveBeenCalled());
    // Tên trường phải khớp ĐÚNG hợp đồng backend (snake_case), không phải camelCase.
    expect(goi.mock.calls[0]?.[0]).toEqual({
      mat_khau_hien_tai: "matkhautam123",
      mat_khau_moi: "matkhaurieng2026",
    });
    expect(await screen.findByText(/Đã đổi mật khẩu thành công/i)).toBeInTheDocument();
  });

  it("thành công thì xoá sạch 3 ô — không để mật khẩu nằm lại trong DOM", async () => {
    mockDoi(() => json(200, { ok: true }));
    renderWithProviders(<DoiMatKhauCard />);
    const u = await dienDoi("matkhautam123", "matkhaurieng2026");
    await u.click(screen.getByRole("button", { name: /Đổi mật khẩu/i }));
    await screen.findByText(/Đã đổi mật khẩu thành công/i);

    expect(screen.getByLabelText(/^Mật khẩu hiện tại$/i)).toHaveValue("");
    expect(screen.getByLabelText(/^Mật khẩu mới$/i)).toHaveValue("");
    expect(screen.getByLabelText(/^Nhập lại mật khẩu mới$/i)).toHaveValue("");
  });
});

describe("🔴 Chặn ở client trước khi chạm server", () => {
  it("thiếu mật khẩu hiện tại → nút vô hiệu", async () => {
    renderWithProviders(<DoiMatKhauCard />);
    const u = userEvent.setup();
    await u.type(screen.getByLabelText(/^Mật khẩu mới$/i), "matkhaurieng2026");
    await u.type(screen.getByLabelText(/^Nhập lại mật khẩu mới$/i), "matkhaurieng2026");
    expect(screen.getByRole("button", { name: /Đổi mật khẩu/i })).toBeDisabled();
  });

  it("hai ô mật khẩu mới KHÔNG khớp → báo tại chỗ, nút vô hiệu, KHÔNG gọi API", async () => {
    const goi = vi.fn();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).endsWith("/auth/doi-mat-khau")) goi();
      return json(200, HO_SO);
    });
    renderWithProviders(<DoiMatKhauCard />);
    await dienDoi("matkhautam123", "matkhaurieng2026", "matkhaugonhau999");

    expect(screen.getByText(/chưa khớp nhau/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Đổi mật khẩu/i })).toBeDisabled();
    expect(goi).not.toHaveBeenCalled();
  });

  it("mật khẩu mới quá ngắn → báo ngưỡng 8 ký tự, nút vô hiệu", async () => {
    renderWithProviders(<DoiMatKhauCard />);
    await dienDoi("matkhautam123", "ngan");
    expect(screen.getByText(/từ 8 ký tự trở lên/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Đổi mật khẩu/i })).toBeDisabled();
  });
});

describe("Lỗi từ server", () => {
  it("🔴 401 → 'Mật khẩu hiện tại không đúng' (phiên bị chiếm không đủ để đổi)", async () => {
    mockDoi(() => json(401, { error: "unauthorized" }));
    renderWithProviders(<DoiMatKhauCard />);
    const u = await dienDoi("doan-bua", "matkhaurieng2026");
    await u.click(screen.getByRole("button", { name: /Đổi mật khẩu/i }));
    expect(await screen.findByText(/Mật khẩu hiện tại không đúng/i)).toBeInTheDocument();
    expect(screen.queryByText(/thành công/i)).not.toBeInTheDocument();
  });

  it("trùng mật khẩu cũ → thông điệp RIÊNG, không phải lỗi chung chung", async () => {
    mockDoi(() => json(400, { error: "mat_khau_moi_trung_hien_tai" }));
    renderWithProviders(<DoiMatKhauCard />);
    const u = await dienDoi("matkhaucu123456", "matkhaucu123456");
    await u.click(screen.getByRole("button", { name: /Đổi mật khẩu/i }));
    expect(await screen.findByText(/phải khác mật khẩu hiện tại/i)).toBeInTheDocument();
  });
});

describe("Nhắc mật khẩu tạm — NHẮC chứ không chặn", () => {
  it("chưa đăng nhập bằng mật khẩu tạm → KHÔNG hiện lời nhắc", () => {
    mockDoi(() => json(200, { ok: true }));
    renderWithProviders(<DoiMatKhauCard />);
    expect(screen.queryByText(/mật khẩu tạm/i)).not.toBeInTheDocument();
  });

  it("🔴 lời nhắc KHÔNG chặn đường — form vẫn dùng được bình thường", () => {
    // Chủ dự án chốt 2026-07-21: không buộc đổi. Nếu lời nhắc biến thành cổng chặn thì
    // đó là làm trái quyết định, không phải "cẩn thận hơn".
    mockDoi(() => json(200, { ok: true }));
    renderWithProviders(<DoiMatKhauCard />);
    expect(screen.getByLabelText(/^Mật khẩu hiện tại$/i)).toBeEnabled();
    expect(screen.getByRole("button", { name: /Đổi mật khẩu/i })).toBeInTheDocument();
  });
});

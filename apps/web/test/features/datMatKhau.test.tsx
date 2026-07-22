// Lát cắt 3 — Trang khách tự đặt mật khẩu sau khi hồ sơ được duyệt.
//
// Test canh ba điều: (1) trang KHÔNG tự tiêu token khi tải, (2) gõ hụt không đốt mất token,
// (3) bốn kết cục có bốn thông điệp khác nhau — gộp lại là bắt khách đoán nên làm gì tiếp.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DatMatKhauPage } from "../../src/features/auth/DatMatKhauPage";
import { json, renderWithProviders } from "../helpers/renderApp";

afterEach(() => vi.restoreAllMocks());

/** Định tuyến fetch theo path. `datMatKhau` quyết định phản hồi của POST /dat-mat-khau;
 * `/me` phải trả 401 vì AuthProvider gọi nó lúc gắn kết và khách ở đây chưa có phiên. */
function mockDat(datMatKhau: () => Response) {
  const goi: unknown[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/dat-mat-khau")) {
      goi.push(init?.body ? JSON.parse(String(init.body)) : null);
      return datMatKhau();
    }
    if (url.endsWith("/me")) return json(401, { error: "unauthorized" });
    return json(200, {});
  });
  return goi;
}

const OK = () => json(200, { ok: true });

function hien(token: string | null) {
  const duong = token === null ? "/dat-mat-khau" : `/dat-mat-khau?token=${token}`;
  return renderWithProviders(<DatMatKhauPage />, duong);
}

async function dienVaGui(mk: string, nhapLai = mk) {
  await userEvent.type(screen.getByLabelText(/mật khẩu mới/i), mk);
  await userEvent.type(screen.getByLabelText(/nhập lại/i), nhapLai);
  await userEvent.click(screen.getByRole("button", { name: /^đặt mật khẩu$/i }));
}

describe("Trang /dat-mat-khau", () => {
  it("🔴 KHÔNG gọi /dat-mat-khau khi vừa tải — token chỉ bị tiêu khi người dùng bấm gửi", async () => {
    const goi = mockDat(OK);
    hien("token-abc");
    await screen.findByLabelText(/mật khẩu mới/i);
    expect(goi).toHaveLength(0);
  });

  it("thiếu token trong URL → báo liên kết hỏng, KHÔNG hiện form", () => {
    mockDat(OK);
    hien(null);
    expect(screen.getByRole("heading", { name: /Liên kết không hợp lệ/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/mật khẩu mới/i)).not.toBeInTheDocument();
  });

  it("🔴 hai ô không khớp → báo tại chỗ, KHÔNG gọi API (không đốt token)", async () => {
    const goi = mockDat(OK);
    hien("token-abc");
    await dienVaGui("mat-khau-du-dai", "mat-khau-khac-han");
    expect(screen.getByText(/không khớp/i)).toBeInTheDocument();
    expect(goi).toHaveLength(0);
  });

  it("🔴 mật khẩu dưới 8 ký tự → báo tại chỗ, KHÔNG gọi API", async () => {
    const goi = mockDat(OK);
    hien("token-abc");
    await dienVaGui("ngan");
    // Bám cả câu, không bám mảnh "ít nhất 8" — mảnh đó có cả ở NHÃN ô nhập.
    expect(screen.getByText(/Mật khẩu phải có ít nhất 8 ký tự/i)).toBeInTheDocument();
    expect(goi).toHaveLength(0);
  });

  it("đặt thành công → báo xong, mời đăng nhập, và gửi ĐÚNG token + mật khẩu", async () => {
    const goi = mockDat(OK);
    hien("token-abc");
    await dienVaGui("mat-khau-du-dai");
    await waitFor(() => expect(screen.getByText(/Đã đặt mật khẩu xong/i)).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /Đăng nhập/i })).toBeInTheDocument();
    expect(goi[0]).toEqual({ token: "token-abc", mat_khau: "mat-khau-du-dai" });
  });

  it.each([
    ["het_han", /hết hạn/i],
    ["da_dung", /đã được dùng/i],
    ["khong_thay", /không hợp lệ/i],
  ])("lỗi %s hiện đúng thông điệp riêng", async (ma, mong) => {
    mockDat(() => json(400, { error: ma }));
    hien("token-abc");
    await dienVaGui("mat-khau-du-dai");
    await waitFor(() => expect(screen.getByText(mong)).toBeInTheDocument());
  });

  it("🔴 hai ô mật khẩu là type=password — không hiện rõ trên màn hình", () => {
    mockDat(OK);
    hien("token-abc");
    expect(screen.getByLabelText(/mật khẩu mới/i)).toHaveAttribute("type", "password");
    expect(screen.getByLabelText(/nhập lại/i)).toHaveAttribute("type", "password");
  });
});

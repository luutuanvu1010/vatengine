// U19 — Test component cho Cổng Admin. Mock `adminApiClient` ở ranh giới mạng; mọi thứ
// từ router, guard phiên, tới bảng thao tác đều đi qua đường thật.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/adminApiClient", async (importOriginal) => {
  const that = await importOriginal<typeof import("../../src/lib/adminApiClient")>();
  return {
    ...that,
    configureAdminApi: vi.fn(),
    adminApi: {
      docPhien: vi.fn(),
      dangNhap: vi.fn(),
      dangXuat: vi.fn(),
      lietKeTenant: vi.fn(),
      duyetTenant: vi.fn(),
      tuChoiTenant: vi.fn(),
      khoaTenant: vi.fn(),
      moKhoaTenant: vi.fn(),
      guiLaiLinkDatMatKhau: vi.fn(),
      suaMetadata: vi.fn(),
      docAudit: vi.fn(),
    },
  };
});

import { App } from "../../src/app";
import { AuditPage } from "../../src/features/audit/AuditPage";
import { TenantsPage, hanhDongChoTrangThai } from "../../src/features/tenants/TenantsPage";
import { AdminApiError, adminApi } from "../../src/lib/adminApiClient";

const api = vi.mocked(adminApi);

function tenant(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
    ten: "Công ty Chờ Duyệt",
    mst: "0100000001",
    email: "chu@congty.vn",
    trang_thai: "cho_duyet",
    goi_dich_vu: "free",
    ngay_tao: "2026-07-20T03:00:00.000Z",
    ...over,
  };
}

/** Render TenantsPage riêng (đã qua guard) để test bảng thao tác. */
function renderTenants() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TenantsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // window.confirm mặc định ĐỒNG Ý để test đi tới lời gọi API; ca "bấm Hủy" test riêng.
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("🔴 Guard phiên — không lẫn sang miền khách", () => {
  it("chưa đăng nhập → hiện màn đăng nhập ADMIN, KHÔNG phải login khách", async () => {
    api.docPhien.mockRejectedValue(new AdminApiError(401, "unauthorized"));
    render(<App />);

    // Dấu hiệu định danh phải là của khu vực quản trị. Nếu một refactor nào đó tái dùng
    // LoginPage của khách, chuỗi này biến mất và test đỏ — đúng mục đích.
    expect(await screen.findByText(/Đăng nhập VATEngine Admin/i)).toBeInTheDocument();
    expect(screen.getAllByText(/KHU VỰC QUẢN TRỊ/i).length).toBeGreaterThan(0);
  });

  it("trong lúc dò phiên → hiện trạng thái 'đang kiểm', KHÔNG loé form đăng nhập", async () => {
    // Nếu nhảy thẳng sang form khi chưa biết kết quả, người có phiên hợp lệ sẽ thấy màn
    // đăng nhập chớp lên mỗi lần tải trang — trông như phiên bị mất.
    api.docPhien.mockReturnValue(new Promise(() => {})); // không bao giờ resolve
    render(<App />);
    expect(await screen.findByRole("status")).toHaveTextContent(/Đang kiểm tra phiên/i);
    expect(screen.queryByText(/Đăng nhập VATEngine Admin/i)).not.toBeInTheDocument();
  });

  it("đã đăng nhập → vào thẳng danh sách doanh nghiệp, có dải cảnh báo thường trực", async () => {
    api.docPhien.mockResolvedValue({ id: "admin-1" });
    api.lietKeTenant.mockResolvedValue({ items: [], total: 0 });
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Doanh nghiệp" })).toBeInTheDocument();
    expect(screen.getByText(/ảnh hưởng tới tài khoản của khách hàng thật/i)).toBeInTheDocument();
  });
});

describe("Bảng thao tác bám máy trạng thái U18", () => {
  it("hanhDongChoTrangThai khớp đúng máy trạng thái", () => {
    expect(hanhDongChoTrangThai("cho_duyet")).toEqual(["duyet", "tu_choi"]);
    expect(hanhDongChoTrangThai("active")).toEqual(["khoa", "gui_lai_link"]);
    expect(hanhDongChoTrangThai("khoa")).toEqual(["mo_khoa"]);
    // tu_choi là trạng thái CUỐI — không hành động nào đưa nó đi tiếp.
    expect(hanhDongChoTrangThai("tu_choi")).toEqual([]);
    // Trạng thái lạ (dữ liệu cũ/hỏng — cột không có CHECK) → không đề xuất thao tác nào.
    expect(hanhDongChoTrangThai("trang_thai_la")).toEqual([]);
  });

  it.each([
    ["cho_duyet", ["Duyệt", "Từ chối"], ["Khóa", "Mở khóa"]],
    ["active", ["Khóa", "Gửi lại link đặt mật khẩu"], ["Duyệt", "Mở khóa"]],
    ["khoa", ["Mở khóa"], ["Duyệt", "Khóa"]],
  ])("trạng thái %s hiện đúng nút", async (trangThai, hien, khongHien) => {
    api.lietKeTenant.mockResolvedValue({ items: [tenant({ trang_thai: trangThai })], total: 1 });
    renderTenants();
    const hang = within(await screen.findByRole("row", { name: /Công ty Chờ Duyệt/ }));
    for (const nhan of hien) {
      expect(hang.getByRole("button", { name: nhan })).toBeInTheDocument();
    }
    for (const nhan of khongHien) {
      expect(hang.queryByRole("button", { name: nhan })).not.toBeInTheDocument();
    }
  });

  it("tenant 'tu_choi' chỉ xem — không nút thao tác nào", async () => {
    api.lietKeTenant.mockResolvedValue({
      items: [tenant({ trang_thai: "tu_choi", ten: "Cty Bị Từ Chối" })],
      total: 1,
    });
    renderTenants();
    const hang = within(await screen.findByRole("row", { name: /Cty Bị Từ Chối/ }));
    expect(hang.queryAllByRole("button")).toHaveLength(0);
  });
});

describe("🔴 Lát cắt 3 — Duyệt KHÔNG còn hiện mật khẩu, chỉ báo đã gửi thư", () => {
  const ketQua = {
    ok: true as const,
    trang_thai: "active" as const,
    email: "chu@congty.vn",
    da_gui_thu: true,
    het_han: "2026-07-25T03:00:00.000Z",
  };

  it("Duyệt → hộp thoại nói đã gửi thư tới đâu, KHÔNG có mật khẩu nào", async () => {
    api.lietKeTenant.mockResolvedValue({ items: [tenant()], total: 1 });
    api.duyetTenant.mockResolvedValue(ketQua);
    renderTenants();

    await userEvent.click(await screen.findByRole("button", { name: "Duyệt" }));

    const hop = within(await screen.findByRole("dialog"));
    expect(hop.getByText(/Đã gửi thư đặt mật khẩu/i)).toBeInTheDocument();
    expect(hop.getByText("chu@congty.vn")).toBeInTheDocument();
    // Bất biến cốt lõi của QĐ-14: không còn mã nào để chủ dự án nhìn thấy, và cũng không
    // còn thứ gì "không lấy lại được" để phải dặn dò.
    expect(screen.queryByTestId("mat-khau-tam")).not.toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toMatch(/\b\d{6}\b/);
    expect(api.duyetTenant).toHaveBeenCalledWith(tenant().id);
  });

  it("nút Đóng KHÔNG còn bị vô hiệu — không còn bí mật nào phải bắt xác nhận đã lưu", async () => {
    api.lietKeTenant.mockResolvedValue({ items: [tenant()], total: 1 });
    api.duyetTenant.mockResolvedValue(ketQua);
    renderTenants();
    await userEvent.click(await screen.findByRole("button", { name: "Duyệt" }));

    const hop = within(await screen.findByRole("dialog"));
    expect(hop.getByRole("button", { name: "Đóng" })).toBeEnabled();
    await userEvent.click(hop.getByRole("button", { name: "Đóng" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("🔴 gửi thư HỎNG → cảnh báo và có nút gửi lại ngay trong hộp thoại", async () => {
    // Nuốt lỗi này nghĩa là khách ngồi chờ một lá thư không bao giờ tới, và chủ dự án
    // tưởng mình đã xong việc.
    api.lietKeTenant.mockResolvedValue({ items: [tenant()], total: 1 });
    api.duyetTenant.mockResolvedValue({ ...ketQua, da_gui_thu: false });
    renderTenants();
    await userEvent.click(await screen.findByRole("button", { name: "Duyệt" }));

    const hop = within(await screen.findByRole("dialog"));
    expect(hop.getByText(/CHƯA gửi được thư/i)).toBeInTheDocument();
    expect(hop.getByRole("button", { name: "Gửi lại thư" })).toBeInTheDocument();
  });

  it("nút gửi lại trong hộp thoại gọi ĐÚNG tenant vừa duyệt", async () => {
    api.lietKeTenant.mockResolvedValue({ items: [tenant()], total: 1 });
    api.duyetTenant.mockResolvedValue({ ...ketQua, da_gui_thu: false });
    api.guiLaiLinkDatMatKhau.mockResolvedValue(ketQua);
    renderTenants();
    await userEvent.click(await screen.findByRole("button", { name: "Duyệt" }));

    const hop = within(await screen.findByRole("dialog"));
    await userEvent.click(hop.getByRole("button", { name: "Gửi lại thư" }));
    await waitFor(() => expect(api.guiLaiLinkDatMatKhau).toHaveBeenCalledWith(tenant().id));
  });

  it("tenant active có nút 'Gửi lại link đặt mật khẩu', KHÔNG còn 'Cấp lại mật khẩu'", async () => {
    api.lietKeTenant.mockResolvedValue({
      items: [tenant({ trang_thai: "active" })],
      total: 1,
    });
    api.guiLaiLinkDatMatKhau.mockResolvedValue(ketQua);
    renderTenants();

    await userEvent.click(await screen.findByRole("button", { name: "Gửi lại link đặt mật khẩu" }));
    expect(screen.queryByRole("button", { name: "Cấp lại mật khẩu" })).not.toBeInTheDocument();
    const hop = within(await screen.findByRole("dialog"));
    expect(hop.getByText(/Đã gửi thư đặt mật khẩu/i)).toBeInTheDocument();
  });
});

describe("Xác nhận & lỗi", () => {
  it("bấm Hủy ở hộp xác nhận → KHÔNG gọi API", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    api.lietKeTenant.mockResolvedValue({ items: [tenant()], total: 1 });
    renderTenants();

    await userEvent.click(await screen.findByRole("button", { name: "Duyệt" }));
    expect(api.duyetTenant).not.toHaveBeenCalled();
  });

  it("🔴 409 → nói đúng bản chất 'trạng thái vừa thay đổi', không phải lỗi chung chung", async () => {
    api.lietKeTenant.mockResolvedValue({ items: [tenant()], total: 1 });
    api.duyetTenant.mockRejectedValue(new AdminApiError(409, "chuyen_trang_thai_khong_hop_le"));
    renderTenants();

    await userEvent.click(await screen.findByRole("button", { name: "Duyệt" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/vừa thay đổi/i);
  });

  it("404 → báo không tìm thấy", async () => {
    api.lietKeTenant.mockResolvedValue({ items: [tenant()], total: 1 });
    api.duyetTenant.mockRejectedValue(new AdminApiError(404, "not_found"));
    renderTenants();
    await userEvent.click(await screen.findByRole("button", { name: "Duyệt" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Không tìm thấy/i);
  });
});

describe("Bốn trạng thái UI + bộ lọc", () => {
  it("mặc định mở tab 'Chờ duyệt' và gọi API đúng bộ lọc", async () => {
    api.lietKeTenant.mockResolvedValue({ items: [], total: 0 });
    renderTenants();
    await waitFor(() =>
      expect(api.lietKeTenant).toHaveBeenCalledWith(
        expect.objectContaining({ trangThai: "cho_duyet" }),
      ),
    );
    expect(screen.getByRole("button", { name: "Chờ duyệt" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("đổi tab 'Tất cả' → KHÔNG gửi bộ lọc trạng thái", async () => {
    api.lietKeTenant.mockResolvedValue({ items: [], total: 0 });
    renderTenants();
    await screen.findByRole("button", { name: "Tất cả" });
    await userEvent.click(screen.getByRole("button", { name: "Tất cả" }));
    await waitFor(() =>
      expect(api.lietKeTenant).toHaveBeenLastCalledWith(
        expect.objectContaining({ trangThai: undefined }),
      ),
    );
  });

  it("gõ ô tìm → truyền q lên API", async () => {
    api.lietKeTenant.mockResolvedValue({ items: [], total: 0 });
    renderTenants();
    await userEvent.type(await screen.findByLabelText(/Tìm theo MST/i), "0100");
    await waitFor(() =>
      expect(api.lietKeTenant).toHaveBeenLastCalledWith(expect.objectContaining({ q: "0100" })),
    );
  });

  it("trạng thái RỖNG nói rõ ngữ cảnh tab đang mở", async () => {
    api.lietKeTenant.mockResolvedValue({ items: [], total: 0 });
    renderTenants();
    expect(
      await screen.findByText(/Không có doanh nghiệp nào đang chờ duyệt/i),
    ).toBeInTheDocument();
  });

  it("trạng thái LỖI có nút thử lại và gọi lại được", async () => {
    api.lietKeTenant.mockRejectedValue(new AdminApiError(500));
    renderTenants();
    const nut = await screen.findByRole("button", { name: "Thử lại" });
    api.lietKeTenant.mockResolvedValue({ items: [], total: 0 });
    await userEvent.click(nut);
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });
});

describe("Trang nhật ký quản trị", () => {
  function renderAudit() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={qc}>
        <AuditPage />
      </QueryClientProvider>,
    );
  }

  const dong = {
    id: "a1",
    hanh_dong: "duyet_tenant",
    doi_tuong: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
    nguoi_thuc_hien: "admin-1",
    chi_tiet: { cu: "cho_duyet", moi: "active" },
    tao_luc: "2026-07-21T03:00:00.000Z",
  };

  it("hiện hành động bằng tiếng Việt và tóm tắt CŨ → MỚI", async () => {
    api.docAudit.mockResolvedValue({ items: [dong], total: 1 });
    renderAudit();
    expect(await screen.findByText("Duyệt doanh nghiệp")).toBeInTheDocument();
    // Nhật ký phải trả lời được "đã đổi thành cái gì", không chỉ "có ai đó động vào".
    expect(screen.getByText("cho_duyet → active")).toBeInTheDocument();
  });

  it("hành động lạ (backend vừa thêm, bảng nhãn chưa cập nhật) → hiện nguyên mã, không nuốt", async () => {
    api.docAudit.mockResolvedValue({
      items: [{ ...dong, hanh_dong: "mot_hanh_dong_moi_toanh" }],
      total: 1,
    });
    renderAudit();
    expect(await screen.findByText("mot_hanh_dong_moi_toanh")).toBeInTheDocument();
  });

  it("hiển thị giờ VN (UTC+7), không phải UTC", async () => {
    api.docAudit.mockResolvedValue({ items: [dong], total: 1 });
    renderAudit();
    // 03:00 UTC = 10:00 giờ VN. Hiện sai múi giờ sẽ khiến chủ dự án đối chiếu nhầm mốc
    // thời gian khi tra một sự cố.
    expect(await screen.findByText(/10:00/)).toBeInTheDocument();
  });

  it("rỗng và lỗi đều có trạng thái tường minh", async () => {
    api.docAudit.mockResolvedValue({ items: [], total: 0 });
    const { unmount } = renderAudit();
    expect(await screen.findByText(/Chưa có thao tác nào/i)).toBeInTheDocument();
    unmount();

    api.docAudit.mockRejectedValue(new AdminApiError(500));
    renderAudit();
    expect(await screen.findByRole("alert")).toHaveTextContent(/Không tải được nhật ký/i);
  });
});

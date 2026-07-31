import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../../src/features/auth/auth-context";
import { DashboardPage } from "../../src/features/dashboard/DashboardPage";
import { AppRouter } from "../../src/routes/AppRouter";
import type { MeResponse, Role, TaxAccountView } from "../../src/types/api";
import { json, mockFetch, renderWithProviders } from "../helpers/renderApp";

function taxAccount(over: Partial<TaxAccountView> = {}): TaxAccountView {
  return {
    id: "a1",
    username: "4201568932",
    loai: "chinh",
    uyQuyenLuc: null,
    tokenHetHan: null,
    ngayTao: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

/** Mock fetch chỉ trả /tax-accounts (Dashboard tối giản chỉ cần trạng thái kết nối). */
function mockTaxAccounts(accounts: TaxAccountView[], vaiTro: Role = "quan_tri") {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    // ADR-0003 Amendment #1 (C8): AuthProvider gọi /me lúc khởi động và lượt này về SAU
    // applyMe của DashboardAs ⇒ nó ghi đè vai. Phải trả ĐÚNG vai, nếu không rơi xuống
    // nhánh bắt-tất (object danh sách, không có `role`) và RBAC ẩn mất lối tắt.
    if (url.endsWith("/me")) {
      return json(200, {
        ten: "DN",
        mst: "0311772540",
        goiDichVu: null,
        banQuyen: "Mặc định",
        ghiChu: null,
        role: vaiTro,
      });
    }
    if (url.includes("/tax-accounts")) return json(200, accounts);
    return json(200, { rows: [], total: 0, limit: 50, offset: 0 });
  });
}

/** Render DashboardPage CÔ LẬP (không app-shell nav) với một vai — seed qua applyMe (1 lần).
 * Prop đặt tên `vaiTro` (không phải `role`) để tránh linter a11y hiểu nhầm là ARIA role. */
function DashboardAs({ vaiTro }: { vaiTro: Role }) {
  const { applyMe } = useAuth();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const me: MeResponse = {
      ten: "DN",
      mst: "4201568932",
      goiDichVu: null,
      goiDichVuTen: null,
      banQuyen: "Mặc định",
      ghiChu: null,
      role: vaiTro,
    };
    applyMe(me);
  }, [applyMe, vaiTro]);
  return <DashboardPage />;
}

describe("Dashboard — dòng trạng thái kết nối (U23-C) + lối tắt", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ⚠️ CA NÀY ĐỔI CÓ CHỦ ĐÍCH — U41 (2026-07-30). Đọc trước khi sửa tiếp.
  //
  // Bản cũ khoá HAI thứ trong cùng một khối:
  //   (1) "KHÔNG gọi /invoices/summary" — thuộc U23-C, NAY ĐÃ ĐỔI.
  //   (2) "KHÔNG gọi /reconcile"        — thuộc quyết định ẩn trang Đối chiếu, VẪN CÒN HIỆU LỰC.
  //
  // Hai điều đó có nguồn gốc KHÁC HẲN nhau. Xoá cả cụm cho nhanh là cách hỏng dễ xảy ra
  // nhất — test vẫn xanh và không ai biết Tổng quan đã lặng lẽ gọi lại /reconcile. Vì vậy (2)
  // được TÁCH RA thành ca riêng bên dưới và giữ nguyên sức nặng.
  //
  // Vì sao (1) đổi: U23-C gỡ số liệu vì khi đó trang phơi thẻ tiền RỜI RẠC, không dẫn tới
  // hành động nào — quyết định ấy đúng. U41 kế thừa chứ không đảo: số liệu quay lại CHỈ dưới
  // dạng việc cần làm, mỗi con số kèm một hành động. Dòng trạng thái kết nối của U23-C giữ
  // nguyên vai trò (các ca (b) bên dưới không đổi một chữ).
  it("(a) KHÔNG gọi /reconcile — trang Đối chiếu đang ẩn có chủ đích", async () => {
    const spy = mockTaxAccounts([]);
    renderWithProviders(<DashboardPage />);
    await screen.findByText(/Chưa kết nối/);
    const called = spy.mock.calls.map((c) => String(c[0]));
    expect(called.some((u) => u.includes("/reconcile"))).toBe(false);
  });

  it("(a2) số liệu chỉ xuất hiện kèm hành động — không có thẻ tiền rút gọn đứng một mình", async () => {
    mockTaxAccounts([]);
    renderWithProviders(<DashboardPage />);
    await screen.findByText(/Chưa kết nối/);
    // Chuỗi tiền rút gọn kiểu "12,4 tr đ" của bản dashboard cũ đã bỏ hẳn: tiền nay viết đủ
    // chữ số, phân nhóm nghìn, và luôn nằm trong một khối có ngữ cảnh.
    expect(screen.queryByText(/\btr đ\b|\btỷ đ\b/)).not.toBeInTheDocument();
  });

  it("(b) token còn hạn → 'Đã kết nối' + ngày giờ VN (UTC+7) đúng", async () => {
    mockTaxAccounts([taxAccount({ tokenHetHan: "2999-06-15T10:30:00.000Z" })]);
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByText(/Đã kết nối/)).toBeInTheDocument();
    // UTC 10:30 + 7h = 17:30 ngày 15/06/2999.
    expect(screen.getByText(/15\/06\/2999 17:30/)).toBeInTheDocument();
  });

  it("(b) không có tài khoản/token → 'Chưa kết nối'", async () => {
    mockTaxAccounts([]);
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByText(/Chưa kết nối/)).toBeInTheDocument();
  });

  it("(b) token đã hết hạn → 'Chưa kết nối'", async () => {
    mockTaxAccounts([taxAccount({ tokenHetHan: "2000-01-01T00:00:00.000Z" })]);
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByText(/Chưa kết nối/)).toBeInTheDocument();
  });

  it("(b) nhiều tài khoản: chọn token còn hạn MUỘN NHẤT, bỏ qua token hết hạn", async () => {
    mockTaxAccounts([
      taxAccount({ id: "expired", tokenHetHan: "2000-01-01T00:00:00.000Z" }),
      taxAccount({ id: "early", tokenHetHan: "2999-01-10T00:00:00.000Z" }),
      taxAccount({ id: "late", tokenHetHan: "2999-06-15T10:30:00.000Z" }),
    ]);
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByText(/Đã kết nối/)).toBeInTheDocument();
    // Hiển thị mốc MUỘN NHẤT (15/06/2999 17:30), không phải mốc sớm hơn.
    expect(screen.getByText(/15\/06\/2999 17:30/)).toBeInTheDocument();
    expect(screen.queryByText(/10\/01\/2999/)).not.toBeInTheDocument();
  });

  // U41: nhãn lối tắt nay lấy từ NGUỒN ĐIỀU HƯỚNG DÙNG CHUNG (`lib/nav.ts`) thay vì chuỗi gõ
  // rời trong trang — nên "Xem hóa đơn" thành "Danh sách hóa đơn", khớp đúng mục trên thanh
  // bên. Ý đồ ca test không đổi: vai ke_toan thấy ÍT hơn.
  it("(c) vai ke_toan: chỉ 'Danh sách hóa đơn'; ẩn 'Kết xuất' + 'Kết nối tài khoản thuế'", async () => {
    mockTaxAccounts([], "ke_toan");
    renderWithProviders(<DashboardAs vaiTro="ke_toan" />);
    // CHỜ ĐÚNG THỨ ĐANG KIỂM, không chờ một mốc tiện tay.
    //
    // Bản đầu chờ chữ "Lối tắt" rồi khẳng định đồng bộ — CI đỏ (2026-07-31). "Lối tắt" hiện
    // NGAY vì nó không phụ thuộc dữ liệu, trong khi khối "Cần xử lý" còn đang tải. Máy dev
    // nhanh nên kịp, runner CI chậm hơn nên trượt.
    //
    // Nguy hơn cả việc đỏ: mọi khẳng định `queryBy…toBeNull()` bên dưới đều XANH GIẢ trong
    // lúc còn đang tải — chưa render thì đương nhiên không tìm thấy. Chờ đúng câu văn của
    // trạng thái cuối mới làm chúng có sức nặng thật.
    expect(await screen.findByText(/liên hệ kế toán trưởng/)).toBeInTheDocument();
    expect(screen.getByText("Lối tắt")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Danh sách hóa đơn/ })).toBeInTheDocument();
    expect(screen.queryByText("Kết xuất & Convert")).not.toBeInTheDocument();
    // Vai này không có quyền quản lý tài khoản thuế ⇒ không lối tắt, và mục "chưa kết nối"
    // trong khối Cần xử lý cũng KHÔNG được chìa nút dẫn sang trang họ sẽ bị chặn.
    expect(screen.queryByRole("link", { name: "Kết nối tài khoản thuế" })).toBeNull();
  });

  // 2026-07-30: lối tắt "Kết xuất" ẩn theo cờ SHOW_EXPORTS ⇒ vai ke_toan_truong còn 2 lối tắt.
  // Ý đồ ca test KHÔNG đổi: vai này thấy NHIỀU HƠN ke_toan ở ca (c) — cụ thể là thấy thêm
  // "Kết nối tài khoản thuế". Sự vắng mặt của "Kết xuất" khoá ở exportsHidden.test.tsx.
  it("(d) vai ke_toan_truong: thấy thêm 'Kết nối tài khoản thuế' (Kết xuất vẫn ẩn theo cờ)", async () => {
    mockTaxAccounts([], "ke_toan_truong");
    renderWithProviders(<DashboardAs vaiTro="ke_toan_truong" />);
    // Chờ khối "Cần xử lý" tải xong (cùng lý do ca (c)). Ca này không đỏ trên CI, nhưng
    // `getAllByRole(…).length > 0` vẫn qua được nhờ liên kết ở khối "Lối tắt" vốn hiện ngay
    // — tức nó xanh mà chưa chứng minh được điều muốn nói. Chờ đúng trạng thái cuối rồi mới
    // khẳng định CẢ HAI liên kết cùng tồn tại: một ở việc cần làm, một ở lối tắt.
    expect(await screen.findByText(/Chưa kết nối tới hệ thống Tổng cục Thuế/)).toBeInTheDocument();
    expect(screen.getByText("Lối tắt")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Danh sách hóa đơn/ })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Kết nối tài khoản thuế" })).toHaveLength(2);
    expect(screen.queryByText("Kết xuất & Convert")).not.toBeInTheDocument();
  });
});

describe("Cài đặt chung (B6)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("hiện Tên/MST/Gói/Vai trò từ /me — KHÔNG địa chỉ bịa", async () => {
    mockFetch({
      login: () => json(200, { token: "jwt" }),
      me: () =>
        json(200, {
          ten: "Công ty TNHH Tour Đảo",
          mst: "4201568932",
          goiDichVu: "Miễn phí",
          banQuyen: "Mặc định",
          ghiChu: null,
          role: "ke_toan_truong",
        }),
    });
    renderWithProviders(<AppRouter />, "/");
    await userEvent.type(await screen.findByLabelText("Email công việc"), "kt@tourdao.vn");
    await userEvent.type(screen.getByLabelText("Mật khẩu"), "pw");
    await userEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
    await userEvent.click(await screen.findByRole("link", { name: "Cài đặt chung" }));

    expect(await screen.findByText("Mã số thuế")).toBeInTheDocument();
    expect(screen.getByText("4201568932")).toBeInTheDocument();
    expect(screen.getByText("Miễn phí")).toBeInTheDocument();
    // Không có địa chỉ bịa TRONG HỒ SƠ TENANT — bảng `tenants` chưa có cột `dia_chi`, nên
    // bất kỳ địa chỉ nào hiện ở đây đều là bịa và người dùng sẽ hiểu đó là địa chỉ CỦA HỌ.
    //
    // THU HẸP 2026-07-21 (U20): trang Cài đặt nay còn hiển thị danh tính TÁC GIẢ phần mềm
    // (`OrgIdentity`, gồm địa chỉ của Công ty TNHH Tour Đảo) — thông tin do chủ dự án cung
    // cấp, nằm ở khối riêng có tiêu đề rõ ràng. Vì vậy cổng này soi ĐÚNG hồ sơ tenant thay
    // vì cả trang; nếu vẫn cấm toàn trang thì nó chặn nhầm một thông tin hợp lệ.
    const hoSoTenant = (await screen.findByText("Mã số thuế")).closest("dl");
    expect(hoSoTenant, "không tìm thấy danh sách hồ sơ tenant").not.toBeNull();
    expect(hoSoTenant?.textContent ?? "").not.toMatch(/đường B2/i);
    expect(hoSoTenant?.textContent ?? "").not.toMatch(/Địa chỉ/i);
  });
});

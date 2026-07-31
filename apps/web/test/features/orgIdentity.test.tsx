// U32 — khối giới thiệu pháp nhân ở Tổng quan.
// NGUỒN SỰ THẬT DUY NHẤT: `lib/orgInfo.ts`. Trang "Giới thiệu & Ủng hộ" (U16) đã có phần
// giới thiệu MỤC ĐÍCH phần mềm; U32 bổ sung phần DANH TÍNH PHÁP NHÂN + hạ tầng. Hai thứ
// khác nhau, nhưng nội dung pháp nhân chỉ được khai ở MỘT nơi — component đọc từ hằng số,
// không chép chuỗi vào JSX của từng màn.
import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrgIdentity } from "../../src/features/about/OrgIdentity";
import { DashboardPage } from "../../src/features/dashboard/DashboardPage";
import { ORG } from "../../src/lib/orgInfo";
import { renderWithProviders } from "../helpers/renderApp";

function mockApi() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    const json = (v: unknown) =>
      new Response(JSON.stringify(v), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    if (url.includes("/me")) {
      return json({
        ten: "DN",
        mst: "0311772540",
        goiDichVu: null,
        goiDichVuTen: null,
        banQuyen: "Mặc định",
        ghiChu: null,
        role: "quan_tri",
      });
    }
    // ĐỊNH TUYẾN THEO PATH, không bắt-tất bằng `[]`.
    //
    // 2026-07-31 — nhánh bắt-tất cũ trả `[]` cho MỌI endpoint, kể cả `/invoices/summary`
    // vốn khai trả `{ byChieu, total }`. `[]` là truthy nên nó lọt qua chốt của Tổng quan
    // rồi làm vỡ lúc render; hai lỗi `Errors` của CI run f4c5991 sinh ra từ đây. Chốt ấy đã
    // siết bằng `?.` (cb14290) nên nay không vỡ nữa — nhưng mock vẫn phải trả ĐÚNG hợp đồng.
    // Mock nói dối về hình dạng thì mọi ca dựa vào nó chỉ chứng minh được hành vi trước một
    // phản hồi không bao giờ có thật.
    if (url.includes("/tax-accounts")) return json([]); // chưa kết nối tài khoản thuế
    if (url.includes("/invoices/summary")) return json({ byChieu: [], total: { count: 0 } });
    if (url.includes("/invoices")) return json({ rows: [], total: 0 });
    return json({});
  });
}

describe("U32 — hằng số pháp nhân (nguồn sự thật duy nhất)", () => {
  it("khai đủ và không rỗng", () => {
    expect(ORG.sanPham).toBe("VATEngine");
    expect(ORG.congTy.length).toBeGreaterThan(0);
    expect(ORG.diaChi.length).toBeGreaterThan(0);
    expect(ORG.haTang.length).toBeGreaterThan(0);
  });

  it("nội dung đúng như chủ dự án cung cấp — KHÔNG bịa thêm", () => {
    expect(ORG.congTy).toBe("Công ty TNHH Tour Đảo");
    expect(ORG.diaChi).toBe(
      "19 Đường B2, khu đô thị Vĩnh Điềm Trung, Phường Tây Nha Trang, Tỉnh Khánh Hoà",
    );
    expect(ORG.haTang).toContain("Cloudflare");
  });

  // Chống bịa: những trường KHÔNG được chủ dự án cung cấp thì không được tự chế ra.
  //
  // CẬP NHẬT 2026-07-21 (U20): `mst` nay ĐƯỢC PHÉP — chủ dự án viết số này trong
  // `docs/plans/U20-plan.md` §5 và xác nhận trực tiếp khi U20 cần hiện thông tin tác giả.
  // Tức điều kiện của cổng đã đổi ("chưa có thì để trống" → nay đã có), KHÔNG phải cổng bị
  // nới lỏng. `dienThoai`/`email` vẫn CẤM: chủ dự án chưa cung cấp.
  it("KHÔNG tự chế điện thoại / email pháp nhân (mst đã được cung cấp)", () => {
    const keys = Object.keys(ORG);
    expect(keys).not.toContain("dienThoai");
    expect(keys).not.toContain("email");
  });

  it("mst đúng giá trị chủ dự án xác nhận", () => {
    expect(ORG.mst).toBe("4201969169");
  });
});

describe("U32 — OrgIdentity render từ hằng số", () => {
  it("hiện tên công ty, địa chỉ và ghi chú hạ tầng", () => {
    renderWithProviders(<OrgIdentity />);
    expect(screen.getByText(new RegExp(ORG.congTy, "i"))).toBeTruthy();
    expect(screen.getByText(/Vĩnh Điềm Trung/i)).toBeTruthy();
    expect(screen.getByText(/Cloudflare/i)).toBeTruthy();
  });

  it("nêu rõ là dự án cộng đồng", () => {
    renderWithProviders(<OrgIdentity />);
    expect(document.body.textContent).toContain("dự án cộng đồng");
  });
});

// U41 (2026-07-30) — THÔNG TIN PHÁP NHÂN CHUYỂN CHỖ, không bị bỏ.
//
// Trước U41, `OrgIdentity` nằm ở cuối trang Tổng quan vì đó là nơi DUY NHẤT còn chỗ đặt.
// Nay Footer bốn cột có mặt ở MỌI trang và đã mang đầy đủ pháp nhân (tên, mã số thuế, địa
// chỉ, ghi chú hạ tầng) — giữ thêm một khối nữa ngay trên nó là nói hai lần trên cùng màn.
//
// Yêu cầu U32 KHÔNG bị nới lỏng: nội dung vẫn phải hiện cho người dùng, vẫn đọc từ một nguồn
// `lib/orgInfo.ts`. Chỗ khoá nay là `footerNhieuCot.test.tsx` (gồm cả ca chống-bịa địa chỉ),
// và `OrgIdentity` vẫn còn dùng ở trang Cài đặt (`features/settings/ThongTinSanPham.tsx`).
describe("U32/U41 — pháp nhân không còn lặp ở Tổng quan", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Tổng quan KHÔNG lặp lại khối pháp nhân (đã có ở Footer mọi trang)", async () => {
    mockApi();
    const { container } = renderWithProviders(<DashboardPage />);
    await screen.findByText("Lối tắt");
    expect(container.textContent).not.toContain("dự án cộng đồng");
  });

  it("không phá các khối sẵn có của Tổng quan (lối tắt vẫn còn)", async () => {
    mockApi();
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByText("Lối tắt")).toBeTruthy();
  });
});

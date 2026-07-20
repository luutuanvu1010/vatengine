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
    return json([]); // /tax-accounts rỗng
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
  it("KHÔNG tự chế mã số thuế / điện thoại / email pháp nhân", () => {
    const keys = Object.keys(ORG);
    expect(keys).not.toContain("mst");
    expect(keys).not.toContain("dienThoai");
    expect(keys).not.toContain("email");
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

describe("U32 — Tổng quan có khối giới thiệu", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("màn Tổng quan hiển thị khối pháp nhân", async () => {
    mockApi();
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByText(new RegExp(ORG.congTy, "i"))).toBeTruthy();
    expect(screen.getByText(/Cloudflare/i)).toBeTruthy();
  });

  it("không phá các khối sẵn có của Tổng quan (lối tắt vẫn còn)", async () => {
    mockApi();
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByText("Lối tắt")).toBeTruthy();
  });
});

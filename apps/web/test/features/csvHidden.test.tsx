import { screen } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../../src/features/auth/auth-context";
import { ExportsPage } from "../../src/features/exports/ExportsPage";
import { InvoiceExportButtons } from "../../src/features/invoices/InvoiceExportButtons";
import type { InvoiceFilter, MeResponse } from "../../src/types/api";
import { renderWithProviders } from "../helpers/renderApp";

// Cờ SHOW_CSV_EXPORT — nút/thẻ chọn "CSV" ở tầng trình bày.
//
// LỊCH SỬ: tắt 2026-07-30 — chủ dự án bỏ CSV khỏi trải nghiệm khách, chỉ còn Excel. Nghiên cứu
// đầy đủ: docs/NGHIEN-CUU-bo-xuat-csv-2026-07-30.md.
//
// Ba ca dưới khoá ĐÚNG hai lối vào CSV của người dùng — nút trong màn Tra cứu hóa đơn và thẻ
// chọn ở trang Kết xuất — cộng một ca chứng minh Excel VẪN sống (nếu không, một lần "dọn" tay
// nặng có thể làm mất cả hai nút mà bộ test vẫn xanh, vì hai ca đầu chỉ khẳng định sự VẮNG MẶT).
// Bật lại cờ phải đảo kỳ vọng ở đây; đỏ vì sửa một chỗ mà quên chỗ khác là hành vi đúng.
//
// KHÔNG khoá ở đây: `POST /exports?format=csv` phía API vẫn nhận CSV có chủ đích — lõi
// packages/export/src/csv.ts đang là hạ tầng kiểm thử của tầng API (xem lý do trong
// lib/featureFlags.ts). Cờ này chỉ nói về những gì người dùng THẤY.

const FILTER: InvoiceFilter = { chieu: "purchase", tuNgay: "2026-03-01", denNgay: "2026-03-31" };

/** Seed vai `quan_tri` (vai CÓ quyền kết xuất) rồi render nút — để chứng minh CSV vắng mặt do
 * CỜ, không phải do RBAC. Prop tên `vaiTro` chứ không phải `role`: tránh Biome hiểu nhầm là
 * JSX ARIA prop (cùng lý do đã ghi ở invoiceExportButtons.test.tsx). */
function NutXuatVaiQuanTri() {
  const { applyMe } = useAuth();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const me: MeResponse = {
      ten: "DN",
      mst: "0311772540",
      goiDichVu: null,
      goiDichVuTen: null,
      banQuyen: "Mặc định",
      ghiChu: null,
      role: "quan_tri",
    };
    applyMe(me);
  }, [applyMe]);
  return <InvoiceExportButtons filter={FILTER} />;
}

/** /me trả vai quan_tri: lượt này về SAU applyMe nên nó là bên ghi cuối cùng — để rơi xuống
 * nhánh bắt-tất thì `me` bị xoá về null và nút biến mất vì RBAC, cho ra ca test XANH GIẢ. */
function mockMe() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    if (String(input).endsWith("/me")) {
      return new Response(
        JSON.stringify({
          ten: "DN",
          mst: "0311772540",
          goiDichVu: null,
          banQuyen: "Mặc định",
          ghiChu: null,
          role: "quan_tri",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  });
}

describe("Xuất CSV (SHOW_CSV_EXPORT tắt)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("màn Tra cứu hóa đơn KHÔNG có nút 'Xuất CSV'", async () => {
    mockMe();
    renderWithProviders(<NutXuatVaiQuanTri />);
    // Chờ nút Excel hiện trước đã: khẳng định sớm sẽ đọc lúc `me` còn null (chưa nút nào tồn
    // tại) và cho ra ca xanh giả.
    await screen.findByRole("button", { name: "Xuất Excel" });
    expect(screen.queryByRole("button", { name: "Xuất CSV" })).not.toBeInTheDocument();
  });

  it("nút 'Xuất Excel' VẪN còn — ẩn CSV không được kéo theo Excel", async () => {
    mockMe();
    renderWithProviders(<NutXuatVaiQuanTri />);
    expect(await screen.findByRole("button", { name: "Xuất Excel" })).toBeInTheDocument();
  });

  it("trang Kết xuất KHÔNG còn thẻ chọn 'CSV (.csv)'", () => {
    mockMe();
    // Render trực tiếp, không qua router: trang này đang bị ẩn bởi SHOW_EXPORTS (khoá riêng ở
    // exportsHidden.test.tsx). Ca này trả lời câu khác: NẾU trang được bật lại thì CSV vẫn
    // phải vắng. Hai cờ độc lập nên phải khoá độc lập.
    renderWithProviders(<ExportsPage />);
    // Nhắm THẺ CHỌN bấm được (role=button), không dùng getByText: chữ "Excel (.xlsx)" còn xuất
    // hiện ở dòng tóm tắt bên phải nên getByText sẽ đa nghĩa và đỏ vì lý do sai.
    expect(screen.getByRole("button", { name: /Excel \(\.xlsx\)/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /CSV \(\.csv\)/ })).not.toBeInTheDocument();
  });
});

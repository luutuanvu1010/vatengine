// U-K4 — mặc định tháng hiện tại (yêu cầu 2) + đổi tên/vị trí nút + tự tải sau đồng bộ
// (yêu cầu 3). Đồng hồ ghim cố định để "tháng hiện tại" xác định.
//
// 2026-07-23: Danh sách hóa đơn bỏ BẢNG — kỳ mặc định nay phản ánh ở GET /invoices/summary
// (số đếm), không còn /invoices (list). Anchor chuyển từ ô bảng ("Cty Bán") sang số đếm.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../../src/features/auth/auth-context";
import { InvoicesPage } from "../../src/features/invoices/InvoicesPage";
import { saveInvoiceFilter } from "../../src/lib/filterStore";
import type { MeResponse, Role, TaxAccountView } from "../../src/types/api";
import { renderWithProviders } from "../helpers/renderApp";

const ACC: TaxAccountView = {
  id: "acc1",
  username: "0311772540",
  loai: "chinh",
  uyQuyenLuc: "2026-07-01T00:00:00.000Z",
  tokenHetHan: new Date(Date.now() + 3_600_000).toISOString(),
  ngayTao: "2026-07-01T00:00:00.000Z",
};

function summaryBody(count: number) {
  return {
    byChieu: [],
    total: { count, tongTcthue: null, tongTthue: null, tongTtbso: null },
  };
}

function j(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function InvoicesPageAs({ vaiTro = "quan_tri" }: { vaiTro?: Role }) {
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
      role: vaiTro,
    };
    applyMe(me);
  }, [applyMe, vaiTro]);
  return <InvoicesPage />;
}

/** Ghi lại mọi URL gọi ra để khẳng định hành vi mạng. `empty` → summary count 0 (kích auto). */
function mockApi(opts: { progressTong?: string; exportOk?: boolean; empty?: boolean } = {}) {
  const calls: { url: string; method: string }[] = [];
  const count = opts.empty ? 0 : 1;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method });
    if (url.endsWith("/me")) {
      return j(200, {
        ten: "DN",
        mst: "0311772540",
        goiDichVu: null,
        banQuyen: "Mặc định",
        ghiChu: null,
        role: "quan_tri",
      });
    }
    if (method === "POST" && url.includes("/backfill-lines")) {
      return j(202, { soHoaDonThieu: 0, soDaXepHang: 0, conLai: 0 });
    }
    if (method === "POST" && url.includes("/backfill")) {
      return j(202, { backfillId: "b1", thangCanLay: ["2026-07"], tongSoThang: 1 });
    }
    if (method === "GET" && url.includes("/backfill/")) {
      return j(200, {
        backfillId: "b1",
        thang: [{ period: "2026-07", trangThai: "xong" }],
        soXong: 1,
        tongSoThang: 1,
        trangThaiTong: opts.progressTong ?? "hoan_thanh",
      });
    }
    if (method === "POST" && url.includes("/exports")) {
      return j(opts.exportOk === false ? 403 : 201, { id: "e1" });
    }
    if (url.includes("/exports/")) return new Response("filebytes", { status: 200 });
    if (url.includes("/tax-accounts")) return j(200, [ACC]);
    if (url.includes("/invoices/summary")) return j(200, summaryBody(count));
    return j(200, { rows: [], total: count, limit: 50, offset: 0 });
  });
  return { calls };
}

describe("U-K4 — mặc định tháng hiện tại (yêu cầu 2)", () => {
  beforeEach(() => {
    // 15/07/2026 giờ VN (08:00Z = 15:00 VN) → tháng hiện tại = 07/2026.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-15T08:00:00.000Z"));
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("mở màn → truy vấn summary với kỳ = THÁNG HIỆN TẠI (giờ VN)", async () => {
    const { calls } = mockApi();
    renderWithProviders(<InvoicesPageAs />);
    await screen.findByText("hóa đơn khớp bộ lọc");
    await waitFor(() => {
      expect(
        calls.some(
          (c) =>
            c.url.includes("/invoices/summary?") &&
            c.url.includes("tuNgay=2026-07-01") &&
            c.url.includes("denNgay=2026-07-31"),
        ),
        "phải truy vấn kỳ tháng 7/2026",
      ).toBe(true);
    });
  });

  it("BỎ QUA kỳ cũ đã lưu — kỳ luôn là tháng hiện tại, không phải kỳ trong localStorage", async () => {
    saveInvoiceFilter({ chieu: "purchase", tuNgay: "2020-01-01", denNgay: "2020-01-31" });
    const { calls } = mockApi();
    renderWithProviders(<InvoicesPageAs />);
    await screen.findByText("hóa đơn khớp bộ lọc");
    await waitFor(() => {
      expect(calls.some((c) => c.url.includes("/invoices/summary?"))).toBe(true);
    });
    expect(calls.some((c) => c.url.includes("tuNgay=2020-01-01"))).toBe(false);
    expect(
      calls.some((c) => c.url.includes("/invoices/summary?") && c.url.includes("chieu=purchase")),
    ).toBe(true);
  });
});

describe("U-K4 — nút Lọc dữ liệu (đọc nhẹ) + Đồng bộ và tải xuống (kéo nặng) (yêu cầu 3)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-15T08:00:00.000Z"));
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("nút áp bộ lọc nay tên 'Lọc dữ liệu', KHÔNG còn 'Áp dụng'", async () => {
    mockApi();
    renderWithProviders(<InvoicesPageAs />);
    await screen.findByText("hóa đơn khớp bộ lọc");
    expect(screen.getByRole("button", { name: "Lọc dữ liệu" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Áp dụng" })).toBeNull();
  });

  it("'Lọc dữ liệu' CHỈ đọc — không gọi backfill/đồng bộ mạng", async () => {
    const { calls } = mockApi();
    renderWithProviders(<InvoicesPageAs />);
    await screen.findByText("hóa đơn khớp bộ lọc");
    const truoc = calls.filter((c) => c.url.includes("/backfill")).length;
    await userEvent.click(screen.getByRole("button", { name: "Lọc dữ liệu" }));
    const sau = calls.filter((c) => c.url.includes("/backfill")).length;
    expect(sau).toBe(truoc);
  });

  it("nút đồng bộ nay tên 'Đồng bộ và tải xuống'", async () => {
    mockApi();
    renderWithProviders(<InvoicesPageAs />);
    await screen.findByText("hóa đơn khớp bộ lọc");
    expect(screen.getByRole("button", { name: "Đồng bộ và tải xuống" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Đồng bộ khoảng này" })).toBeNull();
  });

  it("bấm 'Đồng bộ và tải xuống' → backfill; hoàn thành → TỰ gọi xuất /exports cho bộ lọc hiện tại", async () => {
    const { calls } = mockApi({ progressTong: "hoan_thanh" });
    renderWithProviders(<InvoicesPageAs />);
    await screen.findByText("hóa đơn khớp bộ lọc");
    await userEvent.click(screen.getByRole("button", { name: "Đồng bộ và tải xuống" }));
    await waitFor(() => {
      expect(
        calls.some((c) => c.method === "POST" && c.url.includes("/exports")),
        "backfill xong phải tự kích hoạt xuất",
      ).toBe(true);
    });
  });

  it("AUTO-backfill khi RỖNG chạy tới hoàn thành → KHÔNG tự tải (chỉ thủ công mới tải)", async () => {
    // count 0 → auto-backfill THẬT chạy (progress 'hoan_thanh') nhưng KHÔNG bấm nút
    // → taiSauDongBo=false → tuyệt đối không có /exports. Đây là nhánh auto mà test trước bỏ sót.
    const { calls } = mockApi({ progressTong: "hoan_thanh", empty: true });
    renderWithProviders(<InvoicesPageAs />);
    // Chờ auto-backfill kích hoạt (POST /backfill) rồi poll xong.
    await waitFor(() => expect(calls.some((c) => c.url.includes("/backfill"))).toBe(true));
    await waitFor(() => expect(calls.some((c) => c.url.includes("/backfill/"))).toBe(true));
    expect(calls.some((c) => c.method === "POST" && c.url.includes("/exports"))).toBe(false);
  });

  it("tự-tải sau đồng bộ THẤT BẠI (xuất 403) → hiện thông báo lỗi, KHÔNG nuốt im lặng", async () => {
    const { calls } = mockApi({ progressTong: "hoan_thanh", exportOk: false });
    renderWithProviders(<InvoicesPageAs />);
    await screen.findByText("hóa đơn khớp bộ lọc");
    await userEvent.click(screen.getByRole("button", { name: "Đồng bộ và tải xuống" }));
    // Đã cố xuất (POST /exports) và bị 403 → phải hiện lỗi tải cho người dùng.
    await waitFor(() => {
      expect(calls.some((c) => c.method === "POST" && c.url.includes("/exports"))).toBe(true);
    });
    expect(
      await screen.findByText(/tải file.*không thành công|không tải được|lỗi tải/i),
    ).toBeTruthy();
  });
});

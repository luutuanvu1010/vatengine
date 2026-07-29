// CHẾ ĐỘ XEM THỬ GIAO DIỆN — CHỈ TỒN TẠI TRONG BẢN DEV.
//
// Mục đích DUY NHẤT: cho chủ dự án soi cỡ chữ/bố cục bằng mắt trên máy mình mà không cần
// dựng Postgres + apps/api + tài khoản thật. Nó chặn `fetch` và trả DỮ LIỆU BỊA sẵn.
//
// ==== VÌ SAO AN TOÀN (đọc kỹ trước khi sửa) ====================================
// Đây là một đường VÒNG QUA XÁC THỰC. `.claude/rules/security.md` buộc mọi endpoint phải
// xác thực, nên thứ này KHÔNG ĐƯỢC PHÉP tồn tại trong bản chạy thật. Ba lớp chặn:
//
//   1. Nơi gọi trong `main.tsx` nằm trong `if (import.meta.env.DEV)`. Vite thay hằng đó
//      bằng `false` khi build ⇒ nhánh chết ⇒ Rollup vứt luôn cả chunk `import()` này.
//      KHÔNG có bất kỳ chuỗi nào dưới đây lọt vào `dist/`.
//   2. Ngay cả trong dev vẫn phải BẬT TƯỜNG MINH bằng `?xem-thu=1` — `npm run dev` bình
//      thường (chạy với apps/api thật) không bị đụng tới.
//   3. Tự chặn theo `location.hostname`: chỉ chạy trên localhost/127.0.0.1. Nếu file này
//      lỡ bị bundle ra một host thật, nó vẫn không kích hoạt.
//
// Phép kiểm máy giữ ba lớp trên: `test/conventions/xem-thu-chi-dev.test.ts` (quét nguồn)
// và bước grep `dist/` trước khi deploy.
//
// KHÔNG dùng module này để "test cho nhanh" thay cho test thật — dữ liệu ở đây là BỊA,
// không phải bằng chứng về hành vi hệ thống (Hiến pháp §Nguyên tắc bằng chứng).

import type {
  InvoiceDetailResponse,
  InvoiceListResult,
  InvoiceSummary,
  KhachHangResult,
  MeResponse,
  ReconcileReport,
  SyncStatusView,
  TaxAccountView,
} from "../types/api";

const CO_BAT = "xem-thu";

// Tiền tố API — ĐỌC CÙNG biến mà `apiClient.ts` đọc, không gõ lại "/api". Dev đặt
// `VITE_API_BASE=/api` (proxy Vite bóc tiền tố), production cũng `/api` qua front-door.
// Gõ lại hằng ở đây là tạo nguồn sự thật thứ hai — lần đầu viết đã dính đúng bẫy đó và
// mọi đường dẫn trượt hết, app rơi về màn đăng nhập.
const API_BASE = import.meta.env.VITE_API_BASE ?? "";

/** Chỉ localhost — lớp chặn #3. */
function laMayCucBo(): boolean {
  const h = location.hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
}

// --- Dữ liệu BỊA -----------------------------------------------------------------
// Cố ý dùng tên doanh nghiệp/mặt hàng tiếng Việt DÀI, đủ dấu: mục đích của chế độ này là
// soi chữ, nên dữ liệu phải ép xuống dòng và phơi đủ dấu thanh như hàng thật.
const MST_TA = "4201234567";

const HO_SO: MeResponse = {
  ten: "Công ty TNHH Thương mại & Dịch vụ Tour Đảo",
  mst: MST_TA,
  goiDichVu: "free",
  goiDichVuTen: "Gói miễn phí (Beta)",
  banQuyen: "© 2026 Công ty TNHH Tour Đảo",
  ghiChu: "Dữ liệu XEM THỬ — không phải số liệu thật.",
  role: "quan_tri",
};

const BAN_HANG = [
  {
    nbten: "Công ty Cổ phần Đầu tư & Phát triển Du lịch Nha Trang",
    nmten: "Công ty TNHH Một thành viên Lữ hành Biển Xanh Khánh Hoà",
    hang: "Dịch vụ tổ chức tour tham quan vịnh Nha Trang trọn gói 3 ngày 2 đêm",
    tien: ["45000000", "3600000", "48600000"],
  },
  {
    nbten: "Công ty TNHH Thương mại & Dịch vụ Tour Đảo",
    nmten: "Công ty Cổ phần Khách sạn & Nghỉ dưỡng Vĩnh Điềm Trung",
    hang: "Cung cấp suất ăn công nghiệp cho đoàn khách — tháng 07/2026",
    tien: ["128500000", "10280000", "138780000"],
  },
  {
    nbten: "Công ty TNHH Vận tải Hành khách Đường bộ Phương Trang",
    nmten: "Công ty TNHH Thương mại & Dịch vụ Tour Đảo",
    hang: "Thuê xe 45 chỗ tuyến Nha Trang – Đà Lạt (khứ hồi)",
    tien: ["18000000", "1440000", "19440000"],
  },
  {
    nbten: "Công ty Cổ phần Xăng dầu Khánh Hoà",
    nmten: "Công ty TNHH Thương mại & Dịch vụ Tour Đảo",
    hang: "Xăng RON 95-III",
    tien: ["9350000", "935000", "10285000"],
  },
  {
    nbten: "Công ty TNHH Thương mại & Dịch vụ Tour Đảo",
    nmten: "Chi nhánh Công ty Cổ phần Du lịch Việt — Văn phòng Khánh Hoà",
    hang: "Phí đặt phòng khách sạn 4 sao cho đoàn 32 khách",
    tien: ["76800000", "6144000", "82944000"],
  },
];

function hoaDon(i: number) {
  const m = BAN_HANG[i % BAN_HANG.length];
  if (!m) throw new Error("BAN_HANG rỗng");
  const banRa = m.nbten === HO_SO.ten;
  const ngay = `2026-07-${String((i % 28) + 1).padStart(2, "0")}T03:00:00.000Z`;
  return {
    id: `xem-thu-${i}`,
    tenantId: "xem-thu-tenant",
    nbmst: banRa ? MST_TA : `010${String(1234567 + i)}`,
    nbten: m.nbten,
    nmmst: banRa ? `030${String(7654321 - i)}` : MST_TA,
    nmten: m.nmten,
    khmshdon: "1",
    khhdon: "C26TDĐ",
    shdon: String(1200 + i),
    tdlap: ngay,
    ncnhat: ngay,
    tgtcthue: m.tien[0] ?? null,
    tgtthue: m.tien[1] ?? null,
    tgtttbso: m.tien[2] ?? null,
    ttcktmai: null,
    dvtte: "VND",
    tgia: "1",
    ttxly: 5,
    // Trộn vài trạng thái để thấy đủ kiểu chip (1 = Gốc, 2/4 = trung tính).
    tthai: i % 7 === 3 ? 4 : i % 5 === 2 ? 2 : 1,
    chieu: (banRa ? "sold" : "purchase") as "sold" | "purchase",
    nguon: (i % 4 === 1 ? "sco" : "normal") as "sco" | "normal",
    rawJson: null,
    createdAt: ngay,
    updatedAt: ngay,
    tenHangDau: m.hang,
    hangHoa: [{ ten: m.hang, sluong: "1", dvtinh: "Gói" }],
    soDongHang: 1,
  };
}

const DANH_SACH: InvoiceListResult = {
  rows: Array.from({ length: 18 }, (_, i) => hoaDon(i)),
  total: 18,
  limit: 50,
  offset: 0,
};

const TONG_HOP: InvoiceSummary = {
  byChieu: [
    {
      chieu: "sold",
      count: 11,
      countTinhTong: 10,
      soLoaiKhoiTong: 1,
      tongTcthue: "1250400000",
      tongTthue: "100032000",
      tongTtbso: "1350432000",
      soHdThayThe: 2,
      tcthueDaLoai: "45000000",
      thueDaLoai: "3600000",
      ttbsoDaLoai: "48600000",
    },
    {
      chieu: "purchase",
      count: 7,
      countTinhTong: 7,
      tongTcthue: "382600000",
      tongTthue: "32108000",
      tongTtbso: "414708000",
    },
  ],
  total: {
    count: 18,
    countTinhTong: 17,
    tongTcthue: "1633000000",
    tongTthue: "132140000",
    tongTtbso: "1765140000",
  },
};

const DOI_CHIEU: ReconcileReport = {
  findings: [
    {
      kind: "lech_thue",
      hoaDonId: "xem-thu-2",
      shdon: "1202",
      tgtcthue: "18000000",
      ttcktmai: null,
      tgtthue: "1440000",
      tgtttbso: "19450000",
      lech: "10000",
    },
    { kind: "thieu_so_dau_ra", nbmst: MST_TA, khhdon: "C26TDĐ", shdonThieu: 1207 },
    { kind: "huy", hoaDonId: "xem-thu-3", shdon: "1203", tthai: 4, ttxly: 5 },
    { kind: "thay_the", hoaDonId: "xem-thu-7", shdon: "1207", tthai: 2, ttxly: 5 },
  ],
  summary: { lechThue: 1, thieuSoDauRa: 1, huy: 1, thayThe: 1 },
};

const KHACH_HANG: KhachHangResult = {
  items: [
    { nmmst: "0307654321", nmten: "Công ty TNHH MTV Lữ hành Biển Xanh Khánh Hoà", soHoaDon: 6 },
    {
      nmmst: "0307654320",
      nmten: "Công ty CP Khách sạn & Nghỉ dưỡng Vĩnh Điềm Trung",
      soHoaDon: 4,
    },
    {
      nmmst: "0307654319",
      nmten: "Chi nhánh Công ty CP Du lịch Việt — Văn phòng Khánh Hoà",
      soHoaDon: 1,
    },
  ],
  biCatBot: false,
};

const TAI_KHOAN_THUE: TaxAccountView[] = [
  {
    id: "xem-thu-tk",
    username: MST_TA,
    loai: "chinh",
    uyQuyenLuc: "2026-07-01T02:00:00.000Z",
    tokenHetHan: "2026-07-30T02:00:00.000Z",
    ngayTao: "2026-06-15T02:00:00.000Z",
  },
];

const TRANG_THAI_DONG_BO: SyncStatusView = { soTacVu: 0, thang: [] };

function chiTiet(id: string): InvoiceDetailResponse {
  const i = Number.parseInt(id.replace("xem-thu-", ""), 10) || 0;
  const { tenHangDau, hangHoa, soDongHang, ...header } = hoaDon(i);
  void hangHoa;
  void soDongHang;
  return {
    ...header,
    dongHangHoa: [
      {
        id: `${id}-d1`,
        hoaDonId: id,
        tenantId: "xem-thu-tenant",
        stt: 1,
        ten: tenHangDau,
        dvtinh: "Gói",
        sluong: "1",
        dgia: header.tgtcthue,
        thtien: header.tgtcthue,
        ltsuat: "8%",
        tsuat: "8",
        tsuatTien: header.tgtthue,
        rawJson: null,
      },
    ],
  };
}

// --- Bộ định tuyến giả -------------------------------------------------------------
/** Trả body cho một đường dẫn API, hoặc `undefined` nếu không nhận (⇒ 404). */
function traLoi(duong: string): unknown {
  if (duong === "/me") return HO_SO;
  if (duong === "/invoices") return DANH_SACH;
  if (duong === "/invoices/summary") return TONG_HOP;
  if (duong === "/invoices/khach-hang") return KHACH_HANG;
  if (duong === "/reconcile") return DOI_CHIEU;
  if (duong === "/tax-accounts") return TAI_KHOAN_THUE;
  if (duong.endsWith("/sync-status")) return TRANG_THAI_DONG_BO;
  if (duong.startsWith("/invoices/")) return chiTiet(duong.slice("/invoices/".length));
  if (duong.startsWith("/tax-accounts/")) return TAI_KHOAN_THUE[0];
  return undefined;
}

// --- Thanh dò cỡ chữ ---------------------------------------------------------------
// Vì sao có: cỡ chữ là quyết định THẨM MỸ, chỉ mắt chủ dự án chốt được. Vòng "tôi đoán 16
// → xem → vẫn bé → tôi đoán 18 → xem lại" tốn một lượt cho mỗi con số. Thanh này cho dò
// tại chỗ; chốt xong thì báo số, tôi nướng vào `07-DESIGN_TOKENS.md` + `tokens.css`.
//
// Nó CHỈ ghi đè inline lên `:root` trong phiên đang mở — KHÔNG sửa file, KHÔNG lưu đâu cả.
// Tải lại trang là về đúng thang đang có trong `tokens.css`.

/** Bội số của từng bậc so với thân — giữ ĐÚNG tỉ lệ của thang trong 07-DESIGN_TOKENS §4. */
const BOI_SO: [string, number][] = [
  ["--fs-xs", 14 / 18],
  ["--fs-sm", 15 / 18],
  ["--fs-base", 1],
  ["--fs-md", 1],
  ["--fs-lg", 22 / 18],
  ["--fs-xl", 26 / 18],
  ["--fs-2xl", 32 / 18],
  ["--fs-3xl", 40 / 18],
];

function apThang(than: number): void {
  for (const [ten, boi] of BOI_SO) {
    document.documentElement.style.setProperty(ten, `${Math.round(than * boi)}px`);
  }
}

function dungThanhDoCoChu(): void {
  const than0 = Number.parseInt(
    getComputedStyle(document.documentElement).getPropertyValue("--fs-base"),
    10,
  );
  const hop = document.createElement("div");
  // Tô thẳng bằng px/hex ở đây là CỐ Ý và hợp lệ: đây là dụng cụ dev, không phải bề mặt
  // sản phẩm, nên nó KHÔNG được ăn theo token — nếu ăn theo, kéo thanh sẽ làm méo chính
  // cái thước đang dùng để đo.
  hop.style.cssText =
    "position:fixed;right:16px;bottom:16px;z-index:99999;background:#202124;color:#fff;" +
    "font:500 13px/1.4 system-ui,sans-serif;padding:10px 14px;border-radius:10px;" +
    "box-shadow:0 4px 16px rgba(0,0,0,.3);display:flex;gap:10px;align-items:center";
  const nhan = document.createElement("span");
  const thanh = document.createElement("input");
  thanh.type = "range";
  thanh.min = "14";
  thanh.max = "24";
  thanh.step = "1";
  thanh.value = String(than0 || 18);
  thanh.style.cssText = "width:130px;accent-color:#fe2c55";
  const ve = () => {
    nhan.textContent = `Thân ${thanh.value}px`;
    apThang(Number(thanh.value));
  };
  thanh.addEventListener("input", ve);
  hop.append(nhan, thanh);
  document.body.appendChild(hop);
  ve();
}

/**
 * Bật chế độ xem thử. Gọi TRƯỚC khi render (AuthProvider hỏi `/me` ngay lúc mount).
 *
 * @returns true nếu đã bật (để `main.tsx` báo ra console cho người dùng biết mình đang
 *          xem dữ liệu bịa — im lặng thì rất dễ tưởng là số thật).
 */
export function batXemThuGiaoDien(): boolean {
  if (!laMayCucBo()) return false;

  // Cờ ở URL bật một lần, rồi nhớ trong sessionStorage để điều hướng trong app không mất.
  // sessionStorage (không phải localStorage): đóng tab là hết, không dính sang phiên sau.
  const sp = new URLSearchParams(location.search);
  if (sp.get(CO_BAT) === "0") sessionStorage.removeItem(CO_BAT);
  else if (sp.has(CO_BAT)) sessionStorage.setItem(CO_BAT, "1");
  if (sessionStorage.getItem(CO_BAT) !== "1") return false;

  // Chờ có <body> rồi mới gắn thanh dò (module chạy trước khi React render).
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", dungThanhDoCoChu, { once: true });
  } else {
    dungThanhDoCoChu();
  }

  const fetchThat = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    // Chỉ chặn đường dẫn TƯƠNG ĐỐI của API nội bộ. Tài nguyên khác (font, ảnh, module của
    // Vite) phải đi tiếp bằng fetch thật, nếu không trang không tải nổi.
    if (!url.startsWith("/") || url.startsWith("//")) return fetchThat(input, init);

    const duongDayDu = url.split("?")[0] ?? url;
    // Bóc tiền tố API (`/api`) để so khớp theo ĐÚNG đường dẫn hợp đồng của apps/api.
    if (API_BASE && !duongDayDu.startsWith(API_BASE)) return fetchThat(input, init);
    const duong = API_BASE ? duongDayDu.slice(API_BASE.length) : duongDayDu;
    const method = (init?.method ?? "GET").toUpperCase();

    // Ghi/hành động: nhận nhưng KHÔNG làm gì — đủ để nút bấm không văng lỗi đỏ khi soi.
    if (method !== "GET") {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = traLoi(duong);
    if (body === undefined) return fetchThat(input, init);
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return true;
}

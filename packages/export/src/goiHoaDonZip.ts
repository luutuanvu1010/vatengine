// U37b Gói 4c — đóng gói hồ sơ gốc thành MỘT file ZIP giao cho khách hàng.
//
// Hàm THUẦN: không chạm R2, không chạm DB, không biết tenant là gì. Tầng gọi (`apps/api`)
// đọc object rồi đưa byte vào đây. Nhờ vậy toàn bộ quy tắc đặt tên/chống trùng/báo cáo
// test được offline.
//
// Cấu trúc PHẲNG với MỘT bộ tài nguyên tĩnh dùng chung: `invoice.html` do GDT dựng tham
// chiếu 3 tệp tĩnh bằng TÊN PHẲNG KHÔNG TIỀN TỐ và không nhúng base64 (đo thật, U37 §4.7)
// ⇒ đặt phẳng là chạy đúng mà KHÔNG phải sửa một ký tự nào trong HTML.
import { boDau } from "@vat/domain";
import { zipSync } from "fflate";

export interface TepHoaDon {
  hoaDonId: string;
  nbmst: string;
  khhdon: string;
  shdon: string;
  xml: Uint8Array;
  html: Uint8Array;
}

/** Hóa đơn thuộc kỳ nhưng KHÔNG vào được gói — phải nói ra, không im lặng bỏ sót. */
export interface HoaDonThieu {
  khhdon: string;
  shdon: string;
  lyDo: string;
}

export interface ThongTinGoi {
  /** Tên khách hàng — chỉ để hiển thị và đặt tên tệp tải về. */
  nmten: string;
  nmmst: string;
  /** `YYYY-MM-DD`. */
  tuNgay: string;
  denNgay: string;
}

export interface GoiDaDung {
  bytes: Uint8Array;
  /** Đặt qua `contentDisposition` lúc `put()` — KHÔNG bao giờ dùng làm khóa R2. */
  tenTepTaiVe: string;
  soTepTrongGoi: number;
}

const TEN_BAO_CAO = "bao-cao.txt";
/** Trần độ dài phần tên khách trong tên tệp — tên tệp quá dài vỡ trên vài hệ điều hành. */
const DAI_TOI_DA_TEN_KHACH = 60;

/**
 * Tên entry trong ZIP: GIỮ NGUYÊN HOA/THƯỜNG, chỉ thay ký tự không an toàn cho tên tệp.
 * Ký hiệu hóa đơn vốn viết hoa (`C26TQO`); hạ chữ thường làm người nhận khó đối chiếu với
 * hóa đơn giấy/phần mềm kế toán.
 */
function tenEntryAnToan(s: string): string {
  return s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Slug cho TÊN TỆP TẢI VỀ: bỏ dấu + hạ chữ thường (tên khách tiếng Việt có dấu). */
function slug(s: string): string {
  return boDau(s)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Gán tên (stem) cho từng hóa đơn, GIỮ NGUYÊN CẶP `.xml`/`.html`.
 *
 * Vì sao không dùng `uniqueName` của `zipStream.ts`: hàm đó khóa theo `stem` nên gọi hai
 * lần cho cùng một hóa đơn sẽ ra `X.xml` + `X-1.html` — người nhận không biết tệp html
 * thuộc hóa đơn nào.
 *
 * Đếm tần suất TRƯỚC rồi mới gán: khi hai hóa đơn trùng `<khhdon>-<shdon>`, CẢ HAI cùng
 * đổi sang dạng có `nbmst`. Nếu gán theo kiểu "ai tới trước giữ tên ngắn" thì hai hóa đơn
 * cùng dạng lại mang tên khác kiểu, người đọc phải đoán vì sao.
 *
 * Trả MẢNG THEO CHỈ SỐ (không phải Map theo `hoaDonId`): Map ngầm giả định id duy nhất —
 * đúng trong production vì đó là khóa chính, nhưng là điều kiện ẩn không cần thiết, và
 * nếu vỡ thì hai hóa đơn ghi đè nhau trong gói mà không ai biết.
 */
function ganTen(hoaDons: TepHoaDon[]): string[] {
  const ngans = hoaDons.map((h) => tenEntryAnToan(`${h.khhdon}-${h.shdon}`));
  const dais = hoaDons.map((h) => tenEntryAnToan(`${h.nbmst}-${h.khhdon}-${h.shdon}`));

  const dem = (ds: string[]) => {
    const m = new Map<string, number>();
    for (const x of ds) m.set(x, (m.get(x) ?? 0) + 1);
    return m;
  };
  const demNgan = dem(ngans);
  const demDai = dem(dais.filter((_, i) => (demNgan.get(ngans[i] as string) ?? 0) > 1));

  return hoaDons.map((h, i) => {
    const ngan = ngans[i] as string;
    if ((demNgan.get(ngan) ?? 0) === 1) return ngan;
    const dai = dais[i] as string;
    // Vẫn trùng cả nbmst ⇒ chỉ còn id phân biệt được. Hiếm (khóa tự nhiên có cả `tdlap`),
    // nhưng không được để hai hóa đơn ghi đè nhau trong gói.
    return (demDai.get(dai) ?? 0) > 1 ? `${dai}-${h.hoaDonId.slice(0, 6)}` : dai;
  });
}

function dungBaoCao(thongTin: ThongTinGoi, hoaDons: TepHoaDon[], thieu: HoaDonThieu[]): string {
  const tong = hoaDons.length + thieu.length;
  const dong = [
    `Gói hóa đơn — ${thongTin.nmten || "(không có tên)"} (MST ${thongTin.nmmst})`,
    `Kỳ: ${thongTin.tuNgay} – ${thongTin.denNgay}`,
    `Tổng hóa đơn trong kỳ: ${tong} | Có trong gói: ${hoaDons.length}`,
    "",
  ];

  if (thieu.length === 0) {
    dong.push("Gói đầy đủ — không thiếu hóa đơn nào trong kỳ.");
  } else {
    dong.push(`KHÔNG có trong gói (${thieu.length}):`);
    for (const t of thieu) dong.push(`  ${t.khhdon}-${t.shdon} — ${t.lyDo}`);
  }

  dong.push(
    "",
    "Tệp .xml là hóa đơn điện tử GỐC do người bán phát hành (có chữ ký số).",
    "Tệp .html là bản thể hiện do Cơ quan thuế dựng — mở bằng trình duyệt để xem.",
  );
  return dong.join("\n");
}

/** Tên tệp tải về (QĐ-B10). Tên khách vào ĐÂY thì được; vào khóa R2 thì TUYỆT ĐỐI KHÔNG. */
function dungTenTepTaiVe(thongTin: ThongTinGoi): string {
  const khach = slug(thongTin.nmten).slice(0, DAI_TOI_DA_TEN_KHACH).replace(/-+$/, "");
  const phan = ["hoa-don", khach, thongTin.tuNgay, thongTin.denNgay].filter(Boolean);
  return `${phan.join("-")}.zip`;
}

/**
 * Đóng gói. `taiNguyenChung` là 3 tệp tĩnh của GDT (`details.js`, `viewinvoice-bg.jpg`,
 * `sign-check.jpg`) — thiếu thì bản thể hiện xấu đi chứ không hỏng, nên KHÔNG ném.
 */
export function dungGoiZip(
  thongTin: ThongTinGoi,
  hoaDons: TepHoaDon[],
  thieu: HoaDonThieu[],
  taiNguyenChung: Record<string, Uint8Array>,
): GoiDaDung {
  const tenTheoChiSo = ganTen(hoaDons);
  const muc: Record<string, Uint8Array> = {};

  // Một bộ duy nhất cho cả gói — đây chính là chỗ tiết kiệm ~86% dung lượng (U37 §4.7).
  for (const [k, v] of Object.entries(taiNguyenChung)) muc[k] = v;

  hoaDons.forEach((h, i) => {
    const stem = tenTheoChiSo[i];
    if (!stem) return;
    muc[`${stem}.xml`] = h.xml;
    muc[`${stem}.html`] = h.html;
  });

  muc[TEN_BAO_CAO] = new TextEncoder().encode(dungBaoCao(thongTin, hoaDons, thieu));

  return {
    // level 0 = STORE: nội dung đã gồm 2 ảnh JPEG nén sẵn, nén lại tốn CPU mà gần như
    // không giảm dung lượng. Cùng lựa chọn với `zipStream.ts`.
    bytes: zipSync(muc, { level: 0 }),
    tenTepTaiVe: dungTenTepTaiVe(thongTin),
    soTepTrongGoi: hoaDons.length,
  };
}

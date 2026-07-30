// U41 — SUY RA VIỆC CẦN XỬ LÝ từ số liệu kỳ + trạng thái kết nối. Hàm thuần, không React,
// không mạng: mọi quyết định "hiện mục gì, câu chữ ra sao, dẫn đi đâu" nằm ở đây nên test
// được từng tổ hợp mà không phải dựng cả trang.
//
// NGUYÊN TẮC (chốt cùng chủ dự án 30/07): KHÔNG CON SỐ NÀO ĐỨNG MỘT MÌNH. Mỗi mục gồm ba
// phần — sự việc + hệ quả nghiệp vụ + một hành động. Đây là điều phân biệt U41 với bản
// dashboard cũ đã bị gỡ ở U23-C: bản đó phơi thẻ tiền rời rạc, không dẫn tới việc gì, nên
// gỡ đi là đúng. U41 đưa số liệu trở lại DƯỚI DẠNG VIỆC CẦN LÀM, không phải dưới dạng số.
//
// DỮ LIỆU: chỉ từ `GET /invoices/summary` + `GET /tax-accounts` + một phép đếm hóa đơn bị sửa
// ngoài kỳ. KHÔNG gọi `/reconcile` — trang Đối chiếu đang ẩn có chủ đích (quyết định
// 2026-07-29) và U41 không đụng tới.
import { truTienChuoi } from "@vat/domain";
import type { ChieuSummary } from "../types/api";
import { formatMoney } from "./format";

/** Sắc độ của một mục — ánh xạ sang token ở tầng trình bày, không nhúng màu vào đây.
 *
 * `canh_bao` = bỏ qua thì có hậu quả pháp lý · `info` = giải thích số liệu đã đổi ·
 * `nghiem_trong` = lệch tiền phải nộp · `trung_tinh` = mã CHƯA kiểm chứng, không được tô màu
 * gợi nghĩa (07-DESIGN_TOKENS §1). */
export type SacDo = "nghiem_trong" | "canh_bao" | "info" | "trung_tinh";

export interface ViecCanXuLy {
  /** Khoá ổn định — dùng làm `key` React và làm mốc trong test, không phải chữ hiển thị. */
  ma: string;
  /** Câu đủ nghĩa: sự việc — hệ quả nghiệp vụ. Luôn `--fs-base` ở tầng trình bày. */
  cau: string;
  /** Nhãn nút: cụm động từ ngắn ≤ 40 ký tự, KHÔNG dấu chấm cuối (ui.md). */
  nhanHanhDong: string;
  /** Đích đến, kèm sẵn bộ lọc để bấm vào là thấy đúng tập hóa đơn. */
  den: string;
  sacDo: SacDo;
  /** Nút chính (chỉ mục "chưa kết nối") — mọi mục khác là nút phụ. */
  chinh?: boolean;
}

const soLoai = (c: ChieuSummary): number => c.soLoaiKhoiTong ?? 0;

/**
 * Δ thuế phải nộp = thueDaLoai(mua vào) − thueDaLoai(bán ra).
 *
 * HAI CHIỀU NGƯỢC DẤU: loại hóa đơn mã 4 ở BÁN RA làm thuế đầu ra giảm ⇒ thuế phải nộp GIẢM;
 * loại ở MUA VÀO làm thuế được khấu trừ giảm ⇒ thuế phải nộp TĂNG. Cộng thẳng là sai.
 *
 * BigInt trên chuỗi (`truTienChuoi`) — tiền có thể vượt 2^53, `06-BINDING_MAP` §4.2 CẤM
 * `Number()`/`parseFloat`. Không chiều nào có mã 4 → `null`.
 *
 * U41: chuyển từ `features/invoices/ThongBaoTrangThai.tsx` sang đây để Tổng quan và Danh sách
 * hóa đơn dùng CHUNG một hàm thay vì mỗi nơi một bản.
 */
export function deltaThuePhaiNop(byChieu: readonly ChieuSummary[]): string | null {
  if (!byChieu.some((c) => soLoai(c) > 0)) return null;
  const ban = byChieu.find((c) => c.chieu === "sold");
  const mua = byChieu.find((c) => c.chieu === "purchase");
  return truTienChuoi(mua?.thueDaLoai ?? "0", ban?.thueDaLoai ?? "0");
}

/** "-4180000" → "giảm 4.180.000 đồng". Nêu hướng bằng CHỮ, không để dấu trừ đứng cạnh chữ
 * "giảm" (đọc thành phủ định kép). */
function dienGiaiDelta(delta: string): string {
  const am = delta.startsWith("-");
  return `${am ? "giảm" : "tăng"} ${formatMoney(am ? delta.slice(1) : delta)} đồng`;
}

export interface NguonViec {
  /** `byChieu` từ `GET /invoices/summary` của kỳ đang xem. */
  byChieu: readonly ChieuSummary[];
  /** Có ít nhất một token còn hạn hay không. */
  daKetNoi: boolean;
  /** Hóa đơn bị sửa nằm NGOÀI kỳ đang xem — nguồn duy nhất báo ca vắt kỳ. */
  soBiSuaKyKhac: number;
  /** Bộ lọc kỳ, để gắn vào liên kết "Xem danh sách". */
  tuNgay?: string;
  denNgay?: string;
}

function lienKetBiSua(tuNgay?: string, denNgay?: string): string {
  const q = new URLSearchParams({ biSua: "true" });
  if (tuNgay) q.set("tuNgay", tuNgay);
  if (denNgay) q.set("denNgay", denNgay);
  return `/invoices?${q}`;
}

/**
 * Danh sách việc cần xử lý, đã xếp theo mức nghiêm trọng (nặng trước).
 *
 * Rỗng = KHÔNG có việc nào — tầng trình bày chuyển sang trạng thái trấn an, KHÔNG hiện danh
 * sách rỗng. Đó là lúc phần mềm chứng minh giá trị rõ nhất, không phải lúc báo "chưa có dữ
 * liệu".
 */
export function viecCanXuLy(nguon: NguonViec): ViecCanXuLy[] {
  const { byChieu, daKetNoi, soBiSuaKyKhac, tuNgay, denNgay } = nguon;

  // Chưa kết nối thì mọi con số đều vô nghĩa (cache có thể còn số liệu kỳ cũ). Trả đúng một
  // việc — kết nối — thay vì trộn thêm cảnh báo gây nhiễu.
  if (!daKetNoi) {
    return [
      {
        ma: "chua_ket_noi",
        cau: "Chưa kết nối tới hệ thống Tổng cục Thuế — chưa thể truy xuất hóa đơn của kỳ này.",
        nhanHanhDong: "Kết nối tài khoản thuế",
        den: "/tax-accounts",
        sacDo: "canh_bao",
        chinh: true,
      },
    ];
  }

  const ds: ViecCanXuLy[] = [];
  const denBiSua = lienKetBiSua(tuNgay, denNgay);

  // 1. Lệch số thuế phải nộp — nặng nhất: đụng thẳng vào số tiền phải nộp.
  const delta = deltaThuePhaiNop(byChieu);
  if (delta !== null && delta !== "0") {
    ds.push({
      ma: "lech_thue_phai_nop",
      cau: `Số thuế phải nộp ${dienGiaiDelta(delta)} do hóa đơn bị sửa.`,
      nhanHanhDong: "Xem danh sách",
      den: denBiSua,
      sacDo: "nghiem_trong",
    });
  }

  // 2. Bị thay thế (mã 4) — không được tính vào tổng kê khai.
  const soThayThe = byChieu.reduce((n, c) => n + soLoai(c), 0);
  if (soThayThe > 0) {
    ds.push({
      ma: "bi_thay_the",
      cau: `${soThayThe} hóa đơn đã bị thay thế — không được tính vào tổng kê khai kỳ này.`,
      nhanHanhDong: "Xem danh sách",
      den: denBiSua,
      sacDo: "canh_bao",
    });
  }

  // 3. Kỳ khác bị sửa — rủi ro khai bổ sung; liên kết BỎ khoảng ngày để thấy được kỳ kia.
  if (soBiSuaKyKhac > 0) {
    ds.push({
      ma: "ky_khac_bi_sua",
      cau: `${soBiSuaKyKhac} hóa đơn thuộc kỳ khác vừa bị sửa — có thể phải khai bổ sung.`,
      nhanHanhDong: "Xem danh sách",
      den: lienKetBiSua(),
      sacDo: "canh_bao",
    });
  }

  // 4. Bị điều chỉnh (mã 5) — VẪN tính vào tổng, chỉ là số tiền đã đổi ⇒ `info`, không phải
  // cảnh báo. Bão hòa cảnh báo làm người dùng bỏ qua cả cái thật (07-DESIGN_TOKENS §1).
  const soDieuChinh = byChieu.reduce((n, c) => n + (c.soDuocDieuChinh ?? 0), 0);
  if (soDieuChinh > 0) {
    ds.push({
      ma: "bi_dieu_chinh",
      cau: `${soDieuChinh} hóa đơn đã bị điều chỉnh — số tiền kê khai thay đổi.`,
      nhanHanhDong: "Xem danh sách",
      den: denBiSua,
      sacDo: "info",
    });
  }

  // 5. Mã trạng thái lạ — CHƯA kiểm chứng nghĩa, nên trung tính và xếp cuối. Không tô màu
  // gợi ý một ngữ nghĩa mà chưa ai đo được.
  const soMaLa = byChieu.reduce((n, c) => n + (c.soMaLa ?? 0), 0);
  if (soMaLa > 0) {
    ds.push({
      ma: "ma_la",
      cau: `${soMaLa} hóa đơn mang mã trạng thái chưa xác định.`,
      nhanHanhDong: "Xem danh sách",
      den: "/invoices",
      sacDo: "trung_tinh",
    });
  }

  return ds;
}

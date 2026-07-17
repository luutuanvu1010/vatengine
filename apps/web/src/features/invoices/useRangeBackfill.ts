// U22 B7 — Đồng bộ theo KHOẢNG đã lọc, có THANH TIẾN ĐỘ theo tháng + tự chạy khi rỗng.
// Nâng cấp "Đồng bộ khoảng này" (trước chỉ báo 1 lần): nay bấm/tự → poll GET /backfill/:id
// hiện tiến độ từng tháng; token hết hạn → nhắc kết nối lại; xong → tự làm mới danh sách.
// Không dùng effect kích hoạt mutation (tránh vòng lặp): khởi tạo bằng useQuery tự chạy khi
// enabled (POST idempotent — khoảng đã phủ trả 0 job an toàn). Logic suy trạng thái tách ra
// `deriveRangeBackfillState` (thuần, dễ test). Đồng thời gọi backfill-lines (U26) đổ dòng hàng.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ApiError, api } from "../../lib/apiClient";
import type { BackfillProgress, TaxAccountView } from "../../types/api";

const POLL_MS = 2500;
const TERMINAL = new Set(["hoan_thanh", "co_loi", "can_dang_nhap_lai"]);

export type RangeBackfillState =
  | { kind: "idle" }
  | { kind: "phien_het_han" } // token thuế hết hạn → cần kết nối lại
  | { kind: "dang_lay"; soXong: number; tong: number; thangHienTai?: string }
  | { kind: "xong" }
  | { kind: "co_loi" };

/** "YYYY-MM" → "MM/YYYY" (giờ VN). */
export function formatPeriod(period: string): string {
  const [y, m] = period.split("-");
  return m && y ? `${m}/${y}` : period;
}

/** Tài khoản thuế còn phiên (token chưa hết hạn) — cái duy nhất backfill được. */
export function accountConPhien(accounts: TaxAccountView[]): TaxAccountView | undefined {
  return accounts.find((a) => a.tokenHetHan && new Date(a.tokenHetHan).getTime() > Date.now());
}

/** Suy trạng thái banner (THUẦN) từ tín hiệu khởi tạo + poll. */
export function deriveRangeBackfillState(x: {
  sessionExpired: boolean;
  otherError: boolean;
  preparing: boolean; // đã kích hoạt nhưng chưa có tiến độ (đang tải tài khoản/đang POST)
  startEmpty: boolean; // POST trả tongSoThang === 0 (header khoảng đã phủ)
  hasBackfillId: boolean; // POST xong, đang chờ poll đầu tiên
  startTong: number;
  progress: BackfillProgress | undefined;
}): RangeBackfillState {
  if (x.sessionExpired) return { kind: "phien_het_han" };
  if (x.otherError) return { kind: "co_loi" };
  if (x.progress) {
    switch (x.progress.trangThaiTong) {
      case "can_dang_nhap_lai":
        return { kind: "phien_het_han" };
      case "co_loi":
        return { kind: "co_loi" };
      case "hoan_thanh":
        return { kind: "xong" };
      default: {
        const thangHienTai = x.progress.thang.find((t) => t.trangThai !== "xong")?.period;
        return {
          kind: "dang_lay",
          soXong: x.progress.soXong,
          tong: x.progress.tongSoThang,
          ...(thangHienTai ? { thangHienTai } : {}),
        };
      }
    }
  }
  if (x.startEmpty) return { kind: "xong" };
  if (x.hasBackfillId) return { kind: "dang_lay", soXong: 0, tong: x.startTong };
  if (x.preparing) return { kind: "dang_lay", soXong: 0, tong: 0 };
  return { kind: "idle" };
}

export interface LineBackfillResult {
  soDaXepHang: number;
  conLai: number;
}

export function useRangeBackfill(opts: {
  tuNgay: string | undefined;
  denNgay: string | undefined;
  auto: boolean; // tự chạy khi danh sách rỗng
}): {
  state: RangeBackfillState;
  lineResult: LineBackfillResult | null;
  start: () => void;
} {
  const { tuNgay, denNgay, auto } = opts;
  const qc = useQueryClient();
  const hasRange = !!tuNgay && !!denNgay;
  const rangeKey = hasRange ? `${tuNgay}|${denNgay}` : "";

  // `manual` = người dùng đã bấm nút CHO ĐÚNG khoảng hiện tại. Lưu theo KHOẢNG (không phải
  // boolean) nên tự "reset" khi đổi khoảng — không cần effect (tránh vòng lặp + exhaustive-deps).
  const [clickedRange, setClickedRange] = useState<string | null>(null);
  const manual = hasRange && clickedRange === rangeKey;

  const accounts = useQuery({
    queryKey: ["tax-accounts"],
    queryFn: () => api.listTaxAccounts(),
    enabled: hasRange,
  });
  const acc = accountConPhien(Array.isArray(accounts.data) ? accounts.data : []);
  const triggered = auto || manual;
  const canRun = hasRange && !!acc;
  const noSession = hasRange && accounts.isSuccess && !acc;

  // Khởi tạo: chạy MỘT lần cho mỗi khoảng khi được kích hoạt (staleTime vô hạn, không retry).
  const startQ = useQuery({
    queryKey: ["range-backfill", tuNgay, denNgay],
    queryFn: async () => {
      const account = acc as TaxAccountView;
      const khoang = await api.backfillTaxAccount(account.id, {
        tuNgay: tuNgay as string,
        denNgay: denNgay as string,
      });
      // Đổ dòng hàng cho hóa đơn cũ ĐANG THIẾU (U26) — chạy nền; lỗi ở đây KHÔNG chặn
      // theo dõi tiến độ header (thứ chính người dùng đang chờ).
      const dongHang = await api
        .backfillInvoiceLines(account.id)
        .catch(() => ({ soHoaDonThieu: 0, soDaXepHang: 0, conLai: 0 }));
      return { khoang, dongHang };
    },
    enabled: canRun && triggered,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const backfillId = startQ.data?.khoang.backfillId ?? null;
  const pollQ = useQuery({
    queryKey: ["backfill-poll", backfillId],
    queryFn: () => api.getBackfill(backfillId as string),
    enabled: !!backfillId,
    gcTime: 0,
    refetchInterval: (q) => {
      const d = q.state.data;
      return d && TERMINAL.has(d.trangThaiTong) ? false : POLL_MS;
    },
  });

  // Header xong → làm mới danh sách + tổng hợp (dữ liệu hiện → banner tự ẩn).
  const done = pollQ.data?.trangThaiTong === "hoan_thanh";
  useEffect(() => {
    if (done) {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoices-summary"] });
    }
  }, [done, qc]);

  const err = startQ.error;
  const is409 = err instanceof ApiError && err.status === 409;
  const state = deriveRangeBackfillState({
    sessionExpired: (triggered && noSession) || is409,
    otherError: !!err && !is409,
    preparing: triggered && (accounts.isPending || (canRun && startQ.isFetching && !startQ.data)),
    startEmpty: startQ.data ? startQ.data.khoang.tongSoThang === 0 : false,
    hasBackfillId: !!backfillId,
    startTong: startQ.data?.khoang.tongSoThang ?? 0,
    progress: pollQ.data,
  });

  return {
    state,
    lineResult: startQ.data ? startQ.data.dongHang : null,
    start: () => setClickedRange(rangeKey),
  };
}

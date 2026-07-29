// U40 — "Hóa đơn bị sửa ở kỳ khác": lối tắt sang kỳ đang có vấn đề.
//
// VÌ SAO ĐỔI RUỘT (chủ dự án chốt 2026-07-29). Nút này trước đây đọc bảng lịch sử thay đổi và
// đếm "chưa đọc". Hai cái sai cùng lúc:
//   • THIẾU — bảng đó do trigger AFTER UPDATE ghi, chỉ có bản ghi khi trạng thái ĐỔI trong lúc
//     hệ thống đang theo dõi. 16/17 hóa đơn mã 4 đã là mã 4 ngay lần đồng bộ đầu (đo
//     2026-07-29) nên không bao giờ xuất hiện. Người dùng thấy "1" trong khi thực có 17.
//   • DƯ — hóa đơn của kỳ đang xem đã được thẻ Kết quả liệt kê đầy đủ ngay bên dưới.
// Nặng hơn cả: cảnh báo tắt ngay khi người dùng BẤM VÀO XEM. Nhìn một cái là mất vĩnh viễn,
// không có đường quay lại.
//
// RUỘT MỚI — KHÔNG có trạng thái "đã đọc". Con số là hàm thuần của dữ liệu × bộ lọc, nên
// không thể lệch, không thể lỡ tay tắt mất. Cùng triết lý `packages/reconcile`: tính ON-READ,
// không lưu, không tạo nguồn sự thật thứ hai.
//
// Nó đếm phần thẻ Kết quả KHÔNG THỂ thấy: hóa đơn bị sửa nằm NGOÀI kỳ đang xem. Đây là đường
// duy nhất báo ca vắt kỳ — HĐ 7914 lập 23/06 bị HĐ 9842 lập 09/07 điều chỉnh giảm 3.599.999 đ;
// ai đang xem tháng 7 sẽ không thấy gì nếu thiếu nút này, trong khi tờ khai tháng 6 có thể đã
// nộp (rủi ro khai bổ sung).
import { useQuery } from "@tanstack/react-query";
import { nhanTthai } from "@vat/domain";
import { useState } from "react";
import {
  Button,
  ErrorState,
  Loading,
  OChuaDoc,
  Popover,
  SoChuaDoc,
} from "../../components/ui/primitives";
import { api } from "../../lib/apiClient";
import { formatDateVN } from "../../lib/format";
import { monthRangeOf, vnYearMonth } from "../../lib/period";
import type { InvoiceFilter, InvoiceListRow } from "../../types/api";

/** Trần tải danh sách. Thực tế toàn kho hiện có ~20 hóa đơn bị sửa; trần này là phòng thủ. */
const TRAN = 100;

/** Bỏ khoảng ngày, GIỮ mọi điều kiện khác. Bỏ ngày để đếm được toàn bộ; giữ chiều/nguồn/MST
 * để con số so sánh được với số của thẻ Kết quả — lệch bộ lọc là lệch số. */
function boNgay(f: InvoiceFilter): InvoiceFilter {
  const { tuNgay: _tu, denNgay: _den, ...conLai } = f;
  return { ...conLai, biSua: true };
}

/** Tháng theo giờ VN của một thời khắc UTC. `tdlap` quan sát luôn 17:00:00Z = 00:00 giờ VN
 * hôm sau, nên đọc theo UTC sẽ xếp nhầm tháng ở ngày cuối tháng. */
function thangVn(iso: string): { y: number; m: number } {
  return vnYearMonth(new Date(iso));
}

/** Thời khắc UTC → "YYYY-MM-DD" theo giờ VN, so sánh trực tiếp được với `tuNgay`/`denNgay`
 * của bộ lọc (cùng định dạng, so chuỗi là so đúng thứ tự ngày). */
function ngayVn(iso: string): string {
  const vn = new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000);
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${vn.getUTCFullYear()}-${p2(vn.getUTCMonth() + 1)}-${p2(vn.getUTCDate())}`;
}

function nhanThang(y: number, m: number): string {
  return `${String(m).padStart(2, "0")}/${y}`;
}

function DanhSachTheoKy({
  filter,
  onChonKy,
}: {
  filter: InvoiceFilter;
  onChonKy: (tuNgay: string, denNgay: string) => void;
}) {
  const ds = useQuery({
    queryKey: ["bi-sua-ky-khac-ds", boNgay(filter)],
    queryFn: () => api.getInvoices(boNgay(filter), { limit: TRAN }),
  });

  if (ds.isPending) return <Loading />;
  if (ds.isError)
    return <ErrorState message="Không tải được danh sách." onRetry={() => ds.refetch()} />;

  const kyDang =
    filter.tuNgay && filter.denNgay ? { tu: filter.tuNgay, den: filter.denNgay } : null;
  const ngoaiKy = ds.data.rows.filter((r: InvoiceListRow) => {
    if (!kyDang) return true;
    // So NGÀY LẬP của chính hóa đơn với khoảng đang lọc.
    //
    // Bản đầu so "tháng chứa hóa đơn có nằm trọn trong khoảng lọc không" — SAI khi người
    // dùng chọn kỳ không trùng biên tháng (FilterBar cho nhập ngày tự do). Ví dụ lọc
    // 15/06–15/07: hóa đơn lập 20/06 nằm hẳn trong kỳ, nhưng tháng 6 (01/06–30/06) KHÔNG
    // nằm trọn trong khoảng đó ⇒ bị xếp nhầm sang "kỳ khác", hiện lặp với thẻ Kết quả —
    // đúng cái "DƯ" mà U40 sinh ra để dẹp.
    const ngay = ngayVn(r.tdlap);
    return !(ngay >= kyDang.tu && ngay <= kyDang.den);
  });

  if (ngoaiKy.length === 0) return <div>Không còn hóa đơn bị sửa nào ngoài kỳ đang xem.</div>;

  const theoThang = new Map<string, InvoiceListRow[]>();
  for (const r of ngoaiKy) {
    const { y, m } = thangVn(r.tdlap);
    const k = `${y}-${String(m).padStart(2, "0")}`;
    const cu = theoThang.get(k);
    if (cu) cu.push(r);
    else theoThang.set(k, [r]);
  }

  return (
    <div style={{ display: "grid", gap: "var(--sp-3)" }}>
      {[...theoThang.entries()]
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([k, rows]) => {
          const [y, m] = k.split("-").map(Number);
          const ky = monthRangeOf(y as number, m as number);
          return (
            <div key={k}>
              <Button type="button" variant="ghost" onClick={() => onChonKy(ky.tuNgay, ky.denNgay)}>
                Xem kỳ {nhanThang(y as number, m as number)} ({rows.length} hóa đơn)
              </Button>
              <div style={{ display: "grid", gap: "var(--sp-1)", fontSize: "var(--fs-sm)" }}>
                {rows.map((r) => (
                  <span key={r.id}>
                    {r.khhdon}-{r.shdon} · {formatDateVN(r.tdlap)} · {nhanTthai(r.tthai)}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
    </div>
  );
}

export function BiSuaKyKhacBadge({
  filter,
  trongKy,
  onChonKy,
}: {
  filter: InvoiceFilter;
  /** Số hóa đơn bị sửa TRONG kỳ đang xem — lấy từ summary, thẻ Kết quả đã hiện đủ.
   *
   * `undefined` = CHƯA BIẾT (tab đang giữ dữ liệu summary shape CŨ, chưa có trường này).
   * Khi đó KHÔNG hiện gì: không trừ được phần trong kỳ thì mọi hóa đơn bị sửa sẽ bị đếm
   * nhầm thành "ở kỳ khác", tức báo một con số sai to hơn thực tế. Thà im lặng vài giây tới
   * lần refetch còn hơn nói sai. */
  trongKy: number | undefined;
  onChonKy: (tuNgay: string, denNgay: string) => void;
}) {
  const [mo, setMo] = useState(false);
  // Chỉ cần TỔNG, không cần dữ liệu → limit 1. Server trả `total` của toàn bộ tập khớp lọc.
  const tong = useQuery({
    queryKey: ["bi-sua-ky-khac-tong", boNgay(filter)],
    queryFn: () => api.getInvoices(boNgay(filter), { limit: 1 }),
  });

  if (trongKy === undefined) return null;
  // `Math.max(0, …)`: summary và tổng-toàn-bộ là hai truy vấn riêng, có thể chạy lệch nhau
  // vài giây khi đồng bộ đang ghi. Thà hiện 0 còn hơn hiện số âm vô nghĩa.
  const ngoaiKy = Math.max(0, (tong.data?.total ?? 0) - trongKy);
  if (ngoaiKy === 0) return null;

  return (
    <Popover
      ariaLabel="Hóa đơn bị sửa ở kỳ khác"
      trigger={({ toggle }) => (
        <OChuaDoc>
          <Button
            type="button"
            variant="secondary"
            aria-label={`Hóa đơn bị sửa ở kỳ khác (${ngoaiKy})`}
            onClick={() => {
              setMo(true);
              toggle();
            }}
          >
            Hóa đơn bị sửa ở kỳ khác
            <SoChuaDoc so={ngoaiKy} />
          </Button>
        </OChuaDoc>
      )}
    >
      <div style={{ padding: "var(--sp-3)", maxWidth: 420 }}>
        <div style={{ marginBottom: "var(--sp-2)", fontSize: "var(--fs-sm)" }}>
          Những hóa đơn này đã bị thay thế hoặc điều chỉnh, nhưng{" "}
          <strong>không thuộc kỳ bạn đang xem</strong>. Nếu tờ khai của kỳ đó đã nộp, cần cân nhắc
          khai bổ sung.
        </div>
        {mo ? <DanhSachTheoKy filter={filter} onChonKy={onChonKy} /> : null}
      </div>
    </Popover>
  );
}

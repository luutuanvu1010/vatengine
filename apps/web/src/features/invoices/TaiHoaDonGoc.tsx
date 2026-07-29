// U37b Gói 6 — nút "Tải hóa đơn gốc" + cảnh báo có xác nhận + theo dõi + link + thu hồi.
//
// Đây là hành động NẶNG chạy nền (ui.md:23) nhưng quy mô thật rất nhỏ — lớn nhất 56 hóa
// đơn ≈ 28 giây, trung bình ~3 giây (đo production, U37 §4.8). Nên KHÔNG dựng thanh tiến
// trình cầu kỳ: một dòng "đã xong x/y" là đủ.
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Alert, Button, Checkbox } from "../../components/ui/primitives";
import { ApiError, api } from "../../lib/apiClient";
import type { InvoiceFilter } from "../../types/api";

/**
 * Ba vế mở nút (QĐ-B4 + B1 + B9). Trả DANH SÁCH lý do, không phải một câu gộp: thiếu hai
 * vế mà chỉ báo một thì người dùng sửa xong vế đó vẫn không bấm được và không hiểu vì sao.
 */
function lyDoChuaBamDuoc(filter: InvoiceFilter): string[] {
  const ds: string[] = [];
  if (!filter.nmmst) ds.push("Chọn một khách hàng để tải hóa đơn đã xuất cho họ");
  if (filter.chieu !== "sold") ds.push("Chỉ tải được hóa đơn bán ra");
  if (!filter.tuNgay || !filter.denNgay) ds.push("Chọn khoảng thời gian");
  return ds;
}

function thongBaoLoi(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "khong_co_hoa_don" || err.status === 400)
      return "Không có hóa đơn nào khớp khách hàng và khoảng thời gian đã chọn.";
    if (err.status === 403) return "Bạn không có quyền phát hành đường dẫn chia sẻ.";
    if (err.code === "thieu_tai_khoan_thue")
      return "Chưa có tài khoản thuế cho mã số thuế của những hóa đơn này.";
  }
  return "Không tạo được đường dẫn. Thử lại.";
}

export function TaiHoaDonGoc({ filter }: { filter: InvoiceFilter }) {
  const [moCanhBao, setMoCanhBao] = useState(false);
  const [daXacNhan, setDaXacNhan] = useState(false);
  const [goiId, setGoiId] = useState<string | null>(null);

  const lyDo = lyDoChuaBamDuoc(filter);
  const bamDuoc = lyDo.length === 0;

  const tao = useMutation({
    mutationFn: () =>
      api.taoGoiChiaSe({
        nmmst: filter.nmmst as string,
        tuNgay: filter.tuNgay as string,
        denNgay: filter.denNgay as string,
      }),
    onSuccess: (g) => setGoiId(g.id),
  });

  // Hỏi lại tiến độ trong lúc còn tải. Quy mô nhỏ nên 2 giây một lần là đủ dày.
  const trangThai = useQuery({
    queryKey: ["goi-chia-se", goiId],
    queryFn: () => api.layGoiChiaSe(goiId as string),
    enabled: Boolean(goiId),
    retry: false,
    refetchInterval: (q) => (q.state.data?.trangThai === "dang_tao" ? 2000 : false),
  });

  const dongGoi = useMutation({
    mutationFn: () => api.dongGoiChiaSe(goiId as string),
    onSuccess: () => trangThai.refetch(),
  });
  const thuHoi = useMutation({
    mutationFn: () => api.thuHoiGoiChiaSe(goiId as string),
    onSuccess: () => trangThai.refetch(),
  });

  const g = dongGoi.data ?? trangThai.data;
  const tienDo = trangThai.data?.tienDo;
  const daTaiXong = Boolean(tienDo && tienDo.conCho === 0 && tienDo.tong > 0);

  // Tải xong nhưng chưa đóng gói ⇒ đóng ngay. Đóng gói là POST RIÊNG (không để GET gây
  // tác dụng phụ — điểm 1 đã chốt), nên phải gọi tường minh.
  //
  // PHẢI nằm trong `useEffect`: bản đầu gọi `mutate()` thẳng trong thân render — tác dụng
  // phụ khi render, chạy không đáng tin và có thể lặp vô hạn. Test "xong → hiện link" bắt
  // được vì link không bao giờ hiện ra.
  const canDongGoi =
    daTaiXong &&
    trangThai.data?.trangThai === "dang_tao" &&
    !dongGoi.isPending &&
    !dongGoi.data &&
    !dongGoi.isError;
  const chayDongGoi = dongGoi.mutate;
  useEffect(() => {
    if (canDongGoi) chayDongGoi();
  }, [canDongGoi, chayDongGoi]);

  const sanSang = g?.trangThai === "san_sang" && g.url;
  const daThuHoi = g?.trangThai === "da_thu_hoi" || thuHoi.data?.trangThai === "da_thu_hoi";

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--sp-2)" }}>
      <Button
        variant="secondary"
        disabled={!bamDuoc}
        onClick={() => setMoCanhBao((v) => !v)}
        title={bamDuoc ? undefined : lyDo.join(" · ")}
      >
        Tải hóa đơn gốc
      </Button>

      {!bamDuoc && (
        <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-tertiary)" }}>
          {lyDo.map((l) => (
            <span key={l} style={{ display: "block" }}>
              {l}
            </span>
          ))}
        </span>
      )}

      {/* QĐ-B11: khối cảnh báo INLINE, không dựng primitive Modal. */}
      {bamDuoc && moCanhBao && !goiId && (
        <span style={{ display: "inline-flex", flexDirection: "column", gap: "var(--sp-2)" }}>
          <Alert tone="warning">
            Đường dẫn tạo ra là CÔNG KHAI: ai có đường dẫn đều tải được tệp, không cần đăng nhập.
            Chỉ gửi cho đúng người nhận. Đường dẫn tự hết hạn sau khoảng 1 tuần, và bạn có thể thu
            hồi bất cứ lúc nào.
          </Alert>
          <Checkbox
            label="Tôi hiểu đường dẫn này là công khai"
            checked={daXacNhan}
            onChange={setDaXacNhan}
          />
          <span>
            <Button disabled={!daXacNhan || tao.isPending} onClick={() => tao.mutate()}>
              {tao.isPending ? "Đang tạo…" : "Tạo đường dẫn chia sẻ"}
            </Button>
          </span>
        </span>
      )}

      {tao.isError && (
        <span style={{ fontSize: "var(--fs-xs)", color: "var(--danger-600)" }}>
          {thongBaoLoi(tao.error)}
        </span>
      )}

      {goiId && !sanSang && !daThuHoi && (
        <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-secondary)" }}>
          {tienDo ? `Đang chuẩn bị… ${tienDo.xong}/${tienDo.tong}` : "Đang chuẩn bị…"}
        </span>
      )}

      {sanSang && !daThuHoi && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--sp-2)" }}>
          <a href={g?.url as string} target="_blank" rel="noreferrer">
            {g?.url}
          </a>
          {typeof g?.soThieu === "number" && g.soThieu > 0 && (
            <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-tertiary)" }}>
              {g.soThieu} hóa đơn không lấy được — xem bao-cao.txt trong tệp
            </span>
          )}
          <Button variant="danger" onClick={() => thuHoi.mutate()} disabled={thuHoi.isPending}>
            {thuHoi.isPending ? "Đang thu hồi…" : "Thu hồi"}
          </Button>
        </span>
      )}

      {daThuHoi && (
        <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-tertiary)" }}>
          Đã thu hồi — đường dẫn không còn tải được.
        </span>
      )}
    </span>
  );
}

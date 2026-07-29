// U37b Gói 6 — thẻ "Tải hóa đơn gốc": cảnh báo có xác nhận → theo dõi → link → thu hồi.
//
// BỐ CỤC (sửa 2026-07-29 theo yêu cầu chủ dự án + cổng kiểm ui.md).
// Bản đầu nhét cả module vào `hanhDongPhu` của FilterBar — hàng ngang đó đã phải chứa 5
// nhóm (Đồng bộ, Chọn cột, Xuất, Badge, và cái này), rồi module còn bung THÊM khối cảnh
// báo + checkbox + tiến độ + link + nút thu hồi vào cùng một dòng. Chật là tất yếu, không
// phải chuyện tinh chỉnh vài px.
//
// Sai ở TẦNG (cổng kiểm ui.md câu 1 + 5), nên sửa ở tầng:
//  - `hanhDongPhu` là chỗ của hành động NGẮN, một-cú-bấm ăn theo bộ lọc. Việc này là một
//    QUY TRÌNH NHIỀU BƯỚC có trạng thái sống (chờ → tiến độ → link → thu hồi) ⇒ nó xứng
//    một thẻ riêng, không phải một nút chen vào thanh công cụ.
//  - ui.md:23 tách "đọc nhẹ" khỏi "kéo nặng". Đứng cạnh "Xuất Excel" (nhẹ, tức thời) làm
//    người dùng tưởng bấm xong là có file ngay — trong khi đây là kéo bản gốc từ GDT.
// Vì vậy component tự dựng `Card` + `SectionLabel` của mình; `InvoicesPage` chỉ đặt nó
// xuống, không phải bọc thêm gì.
//
// Quy mô thật rất nhỏ — lớn nhất 56 hóa đơn ≈ 28 giây, trung bình ~3 giây (đo production,
// U37 §4.8). Nên KHÔNG dựng thanh tiến trình cầu kỳ: một dòng "đã xong x/y" là đủ.
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  ChuPhu,
  Cot,
  Hang,
  SectionLabel,
} from "../../components/ui/primitives";
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
    <Card style={{ marginBottom: "var(--sp-4)" }}>
      <SectionLabel>Tải hóa đơn gốc gửi khách hàng</SectionLabel>
      <Cot khoang="3">
        <ChuPhu>
          Kéo bản gốc có chữ ký số từ Tổng cục Thuế cho những hóa đơn đã xuất cho khách hàng đang
          chọn, gói thành một tệp ZIP và tạo đường dẫn để gửi cho họ.
        </ChuPhu>

        <Hang khoang="3" xuongDong>
          <Button
            variant="secondary"
            disabled={!bamDuoc}
            onClick={() => setMoCanhBao((v) => !v)}
            title={bamDuoc ? undefined : lyDo.join(" · ")}
          >
            Tải hóa đơn gốc
          </Button>

          {/* Nêu TỪNG lý do còn thiếu, cạnh nút — không giấu trong tooltip: người dùng
              chạm/di chuột mới thấy thì coi như không có. */}
          {!bamDuoc && (
            <Cot khoang="1">
              {lyDo.map((l) => (
                <ChuPhu key={l} nhan>
                  {l}
                </ChuPhu>
              ))}
            </Cot>
          )}
        </Hang>

        {/* QĐ-B11: khối cảnh báo INLINE, không dựng primitive Modal. Nay xếp DỌC trong thẻ
            nên cảnh báo đọc được trọn câu, thay vì bị bóp trong một ô hẹp giữa các nút. */}
        {bamDuoc && moCanhBao && !goiId && (
          <Cot khoang="2">
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
            <Hang>
              <Button disabled={!daXacNhan || tao.isPending} onClick={() => tao.mutate()}>
                {tao.isPending ? "Đang tạo…" : "Tạo đường dẫn chia sẻ"}
              </Button>
            </Hang>
          </Cot>
        )}

        {tao.isError && <Alert tone="danger">{thongBaoLoi(tao.error)}</Alert>}

        {goiId && !sanSang && !daThuHoi && (
          <ChuPhu>
            {tienDo ? `Đang chuẩn bị… ${tienDo.xong}/${tienDo.tong}` : "Đang chuẩn bị…"}
          </ChuPhu>
        )}

        {sanSang && !daThuHoi && (
          <Cot khoang="2">
            <Hang khoang="3" xuongDong>
              <a href={g?.url as string} target="_blank" rel="noreferrer">
                {g?.url}
              </a>
              <Button variant="danger" onClick={() => thuHoi.mutate()} disabled={thuHoi.isPending}>
                {thuHoi.isPending ? "Đang thu hồi…" : "Thu hồi"}
              </Button>
            </Hang>
            {typeof g?.soThieu === "number" && g.soThieu > 0 && (
              <ChuPhu nhan>{g.soThieu} hóa đơn không lấy được — xem bao-cao.txt trong tệp</ChuPhu>
            )}
          </Cot>
        )}

        {daThuHoi && <ChuPhu nhan>Đã thu hồi — đường dẫn không còn tải được.</ChuPhu>}
      </Cot>
    </Card>
  );
}

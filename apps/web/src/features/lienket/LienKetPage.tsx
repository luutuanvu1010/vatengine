// U37c Gói 5 — trang "Liên kết chia sẻ": không gian quản lý các liên kết đã phát hành.
//
// Vì sao là MỤC ĐIỀU HƯỚNG RIÊNG chứ không phải một phần của trang Danh sách hóa đơn
// (QĐ-C2): quản lý liên kết là việc độc lập với tra cứu — người dùng vào đây để trả lời
// "mình đã phát những liên kết nào, cái nào còn sống, cái nào cần thu hồi", chứ không phải
// để xem hóa đơn. Bắt họ lọc lại đúng khách hàng cũ mới thấy liên kết là bắt nhớ hộ máy.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import {
  Badge,
  Button,
  Card,
  ChuPhu,
  Cot,
  EmptyState,
  ErrorState,
  Hang,
  Loading,
  SectionLabel,
} from "../../components/ui/primitives";
import { api } from "../../lib/apiClient";
import type { GoiChiaSeItem } from "../../types/api";
import { HanhDongLienKet } from "../invoices/HanhDongLienKet";

/** Nhãn trạng thái. Chỉ gán cho mã ĐÃ có trong `TRANG_THAI_GOI_CHIA_SE` — không bịa thêm.
 *
 * `Badge` chỉ có ba tone (neutral/info/success) và `07-DESIGN_TOKENS` §1 giữ sắc "danger"
 * riêng cho cảnh báo lệch thuế / hành động phá hủy. Không nới bảng màu chỉ để tô một chữ
 * "Lỗi" — ca đó bù bằng một dòng giải thích bên dưới, rõ hơn một chấm màu. */
const NHAN: Record<
  GoiChiaSeItem["trangThai"],
  { chu: string; tone: "neutral" | "info" | "success" }
> = {
  dang_tao: { chu: "Đang chuẩn bị", tone: "info" },
  dang_dong_goi: { chu: "Đang đóng gói", tone: "info" },
  san_sang: { chu: "Đang chia sẻ", tone: "success" },
  loi: { chu: "Lỗi", tone: "neutral" },
  da_thu_hoi: { chu: "Đã thu hồi", tone: "neutral" },
};

function ngayVn(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("vi-VN");
}

function MotLienKet({
  goi,
  onThuHoi,
  dangThuHoi,
}: {
  goi: GoiChiaSeItem;
  onThuHoi: (id: string) => void;
  dangThuHoi: boolean;
}) {
  const nhan = NHAN[goi.trangThai];
  return (
    <Card style={{ marginBottom: "var(--sp-3)" }}>
      <Cot khoang="2">
        <Hang khoang="3" xuongDong>
          <strong>{goi.nmten ?? goi.nmmst}</strong>
          <Badge tone={nhan.tone}>{nhan.chu}</Badge>
          <ChuPhu nhan>MST {goi.nmmst}</ChuPhu>
        </Hang>

        <ChuPhu>
          Kỳ {ngayVn(goi.tuNgay)} – {ngayVn(goi.denNgay)} · {goi.soHoaDon} hóa đơn · tạo{" "}
          {ngayVn(goi.taoLuc)}
        </ChuPhu>

        {/* Số lượt tải là dữ kiện ĐIỀU TRA: "liên kết này đã bị dùng mấy lần?" là câu hỏi
            đầu tiên khi nghi lộ. Hiện cả khi bằng 0 — vắng con số dễ đọc thành "chưa đo". */}
        <ChuPhu nhan>
          Đã tải {goi.soLuotTai ?? 0} lượt
          {goi.lanTaiCuoi ? ` · gần nhất ${ngayVn(goi.lanTaiCuoi)}` : ""}
          {goi.trangThai === "san_sang" ? ` · hết hạn ${ngayVn(goi.hetHanLuc)}` : ""}
        </ChuPhu>

        {goi.trangThai === "san_sang" && goi.url && (
          <Hang khoang="3" xuongDong>
            <HanhDongLienKet
              thongTin={{
                url: goi.url,
                nmten: goi.nmten,
                tuNgay: ngayVn(goi.tuNgay),
                denNgay: ngayVn(goi.denNgay),
              }}
            />
            <Button variant="danger" disabled={dangThuHoi} onClick={() => onThuHoi(goi.id)}>
              {dangThuHoi ? "Đang thu hồi…" : "Thu hồi"}
            </Button>
          </Hang>
        )}

        {goi.trangThai === "loi" && (
          <ChuPhu nhan>Không dựng được gói — hãy tạo lại từ Danh sách hóa đơn.</ChuPhu>
        )}

        {goi.trangThai === "da_thu_hoi" && (
          <ChuPhu nhan>Đã thu hồi — liên kết không còn tải được.</ChuPhu>
        )}
      </Cot>
    </Card>
  );
}

export function LienKetPage() {
  const qc = useQueryClient();
  const ds = useQuery({
    queryKey: ["ds-goi-chia-se"],
    queryFn: () => api.dsGoiChiaSe(),
    retry: false,
  });

  const thuHoi = useMutation({
    mutationFn: (id: string) => api.thuHoiGoiChiaSe(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ds-goi-chia-se"] }),
  });

  return (
    <div>
      <PageHeader
        title="Liên kết chia sẻ"
        subtitle="Các đường dẫn tải hóa đơn đã phát cho khách hàng"
      />
      <Card>
        <SectionLabel>Đã phát hành</SectionLabel>
        {/* Bốn trạng thái (ui.md): đang tải / lỗi / rỗng / có dữ liệu. */}
        {ds.isPending ? (
          <Loading />
        ) : ds.isError ? (
          <ErrorState message="Không tải được danh sách liên kết." onRetry={() => ds.refetch()} />
        ) : (ds.data?.items.length ?? 0) === 0 ? (
          // Trạng thái rỗng phải NÓI ĐƯỢC việc cần làm tiếp, không chỉ báo "trống".
          <EmptyState message="Chưa phát hành liên kết nào. Vào Danh sách hóa đơn, chọn một khách hàng và kỳ, rồi bấm 'Tải hóa đơn gốc'." />
        ) : (
          <div>
            {ds.data?.items.map((g) => (
              <MotLienKet
                key={g.id}
                goi={g}
                onThuHoi={(id) => thuHoi.mutate(id)}
                dangThuHoi={thuHoi.isPending && thuHoi.variables === g.id}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

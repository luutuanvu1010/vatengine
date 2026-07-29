// U37b Gói 1 — chọn MỘT khách hàng (bên mua) để tải hóa đơn gốc đã xuất cho họ.
//
// Vì sao là ô TÌM LIVE chứ không phải ô nhập MST thô: người dùng nhớ TÊN khách, không nhớ
// MST. Nhưng thứ ràng vào bộ lọc phải là MST — tên viết tắt/thiếu dấu là trượt (đo thật:
// 165/169 MST chỉ có một cách viết tên, nhưng vẫn có MST viết hai kiểu — U37 §4.8).
//
// QĐ-B4: chỉ coi là "đã chọn" khi người dùng CHỌN một mục. Gõ dở rồi bấm nút thì ô có chữ
// nhưng chưa ràng vào MST nào ⇒ gói rỗng hoặc sai khách. Component này KHÔNG BAO GIỜ gọi
// `onChange` khi người dùng chỉ đang gõ.
import { useQuery } from "@tanstack/react-query";
import { ComboBox, type ComboBoxItem } from "../../components/ui/primitives";
import { api } from "../../lib/apiClient";
import { khopTim } from "../../lib/boDau";

export interface KhachHangDaChon {
  nmmst: string;
  nmten: string;
}

export function ChonKhachHang({
  nmmst,
  onChange,
}: {
  /** MST đang chọn. CỐ Ý chỉ nhận MST chứ không nhận cả cặp {nmmst, nmten}: bộ lọc (và
   * `filterStore` giữ qua phiên) chỉ lưu `nmmst`, nên sau khi tải lại trang caller KHÔNG
   * có tên để truyền vào. Component tự tra tên từ danh sách nó đã nạp. */
  nmmst?: string;
  /** Gọi khi CHỌN một khách (kèm MST chính xác) hoặc XÓA lựa chọn (`undefined`). */
  onChange: (next: KhachHangDaChon | undefined) => void;
}) {
  const ds = useQuery({
    queryKey: ["khach-hang"],
    queryFn: () => api.listKhachHang(),
    retry: false,
    staleTime: 5 * 60_000,
  });

  const items: ComboBoxItem[] = (ds.data?.items ?? []).map((k) => ({
    giaTri: k.nmmst,
    nhan: k.nmten,
    phu: `${k.nmmst} · ${k.soHoaDon} hóa đơn`,
  }));

  // Bốn trạng thái (ui.md:22). `thongBao` thay chỗ danh sách; `undefined` ⇒ hiện danh sách.
  // Tra tên từ danh sách đã nạp. Chưa nạp xong ⇒ tạm hiện MST để ô không trống trơn (người
  // dùng vẫn thấy bộ lọc đang có hiệu lực), rồi tự thay bằng tên khi danh sách về.
  const daChon = nmmst
    ? (items.find((i) => i.giaTri === nmmst) ?? { giaTri: nmmst, nhan: nmmst })
    : undefined;

  const thongBao = ds.isPending
    ? "Đang tải danh sách khách hàng…"
    : ds.isError
      ? "Không tải được danh sách khách hàng."
      : items.length === 0
        ? "Chưa có khách hàng nào có mã số thuế."
        : undefined;

  return (
    <ComboBox
      label="Khách hàng"
      hideLabel
      co="lg"
      placeholder="Tìm khách hàng theo tên hoặc MST"
      daChon={daChon}
      items={items}
      // Khớp CẢ nhãn lẫn dòng phụ ⇒ gõ MST cũng tìm được, không chỉ tên.
      khop={(daGo, i) => khopTim(daGo, i.nhan) || khopTim(daGo, i.phu ?? "")}
      onChon={(i) => onChange({ nmmst: i.giaTri, nmten: i.nhan })}
      onXoa={() => onChange(undefined)}
      thongBao={thongBao}
      chanPanel={ds.data?.biCatBot ? "Danh sách đã bị cắt bớt — gõ thêm để thu hẹp." : undefined}
    />
  );
}

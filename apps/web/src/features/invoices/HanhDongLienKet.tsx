// U37c — hàng hành động cho một liên kết đã phát hành. Dùng chung ở thẻ "Tải hóa đơn gốc"
// và trang "Liên kết chia sẻ", nên sửa một nơi là cả hai cùng hưởng.
//
// KHÔNG phơi URL trần (yêu cầu chủ dự án 2026-07-29): một chuỗi 26 ký tự ngẫu nhiên dán
// giữa giao diện vừa rối vừa mời người ta chép tay sai. Hiện một anchor có nghĩa, còn thao
// tác thật thì giao cho nút.
import { useState } from "react";
import { Button, ChuPhu, Hang } from "../../components/ui/primitives";
import {
  type ThongTinChiaSe,
  coKhayChiaSe,
  mailtoChiaSe,
  noiDungChiaSe,
  tieuDeChiaSe,
} from "../../lib/chiaSeLink";

export function HanhDongLienKet({ thongTin }: { thongTin: ThongTinChiaSe }) {
  const [daChep, setDaChep] = useState(false);
  const [loiChep, setLoiChep] = useState(false);

  // Khay chia sẻ hỏi MỘT LẦN lúc dựng: `navigator.share` không đổi giữa chừng, mà gọi lại
  // mỗi lần render thì trên máy tính nút sẽ chớp tắt theo re-render.
  const [coKhay] = useState(coKhayChiaSe);

  async function saoChep() {
    try {
      await navigator.clipboard.writeText(thongTin.url);
      setDaChep(true);
      setLoiChep(false);
      // Trả nhãn về sau vài giây: "Đã sao chép" đứng mãi thì lần bấm thứ hai không có phản
      // hồi nào, người dùng không biết nó có ăn hay không.
      setTimeout(() => setDaChep(false), 2000);
    } catch {
      // Clipboard đòi ngữ cảnh bảo mật và quyền; hỏng thì phải NÓI, không nuốt im lặng —
      // người dùng sẽ đi dán một thứ không có trong bộ nhớ tạm.
      setLoiChep(true);
    }
  }

  async function chiaSe() {
    try {
      await navigator.share({
        title: tieuDeChiaSe(thongTin),
        text: noiDungChiaSe(thongTin),
        url: thongTin.url,
      });
    } catch {
      // Người dùng bấm hủy khay chia sẻ cũng ném lỗi — đó là hành vi bình thường, không
      // phải sự cố, nên không báo gì.
    }
  }

  return (
    <Hang khoang="3" xuongDong>
      <a href={thongTin.url} target="_blank" rel="noreferrer">
        Liên kết tải hóa đơn
      </a>
      <Button variant="secondary" onClick={saoChep}>
        {daChep ? "Đã sao chép" : "Sao chép liên kết"}
      </Button>
      {/* Ẩn HẲN khi trình duyệt không có khay chia sẻ, không hiện nút bấm-không-ăn-gì. */}
      {coKhay && (
        <Button variant="secondary" onClick={chiaSe}>
          Chia sẻ
        </Button>
      )}
      <a href={mailtoChiaSe(thongTin)}>Gửi Email</a>
      {loiChep && (
        <ChuPhu nhan>Không sao chép được — hãy mở liên kết rồi chép từ thanh địa chỉ.</ChuPhu>
      )}
    </Hang>
  );
}

// Cuộn tới mục mang `id` khớp `location.hash`. React Router KHÔNG tự làm việc này khi điều
// hướng trong SPA — trình duyệt chỉ cuộn theo neo khi tải trang thật. Không có hook này thì
// "Câu hỏi thường gặp" ở Footer mở đúng trang nhưng dừng ở đầu trang, trông như liên kết hỏng.
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/** `sanSang` = nội dung đã dựng xong chưa. Trong lúc phiên còn ở trạng thái `checking`, trang
 * đích chưa render nên `#faq` chưa tồn tại trong DOM — cuộn lúc đó là cuộn vào chỗ trống. */
export function useCuonTheoHash(sanSang: boolean): void {
  const { hash } = useLocation();
  useEffect(() => {
    if (!sanSang || hash === "") return;
    const dich = document.getElementById(hash.slice(1));
    dich?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [hash, sanSang]);
}

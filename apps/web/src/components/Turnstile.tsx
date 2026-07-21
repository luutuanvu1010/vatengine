// U33 (QĐ-11) — Widget Cloudflare Turnstile.
//
// Sau khi gỡ toàn bộ rate-limit tầng ứng dụng, đây là lớp phòng thủ DUY NHẤT còn lại ở
// tầng ứng dụng cho hai cổng công khai (`/dang-ky`, `/auth/login`). Vì vậy component này
// FAIL-CLOSED ở mọi nhánh hỏng: thiếu site key, script không tải được, token hết hạn —
// tất cả đều dẫn tới `onToken(null)`, và trang gọi phải khoá nút Gửi khi chưa có token.
// Mở cửa khi widget hỏng nghĩa là một lần cấu hình sai âm thầm bỏ trống cổng.
//
// Site key là dữ liệu CÔNG KHAI (nó nằm trong HTML mọi khách tải về) — khác secret key,
// vốn chỉ sống ở Workers Secrets phía API. Đưa site key vào bundle qua VITE_ là đúng chỗ.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
      language?: string;
    },
  ) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/** Nạp script api.js đúng MỘT lần cho cả vòng đời trang, kể cả khi có nhiều widget hoặc
 * người dùng đi qua lại giữa /login và /dang-ky. Promise được giữ lại để lần gọi sau dùng
 * chung kết quả thay vì chèn thêm thẻ <script>. */
let dangNap: Promise<void> | null = null;
function napScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (dangNap) return dangNap;
  dangNap = new Promise<void>((resolve, reject) => {
    const el = document.createElement("script");
    el.src = SCRIPT_URL;
    el.async = true;
    el.defer = true;
    el.onload = () => resolve();
    el.onerror = () => {
      // Cho phép thử lại ở lần mount sau (mạng chập chờn) thay vì hỏng vĩnh viễn.
      dangNap = null;
      reject(new Error("khong tai duoc turnstile"));
    };
    document.head.appendChild(el);
  });
  return dangNap;
}

export interface TurnstileHandle {
  /** Xin token MỚI. Token Turnstile dùng MỘT LẦN: sau mỗi lượt gửi form (dù thành công
   * hay thất bại) token cũ đã tiêu, gửi lại nó sẽ bị siteverify trả `timeout-or-duplicate`
   * → người dùng thấy "captcha hết hạn" ở lần thử thứ hai dù không làm gì sai. */
  reset: () => void;
}

export const Turnstile = forwardRef<TurnstileHandle, { onToken: (token: string | null) => void }>(
  function Turnstile({ onToken }, ref) {
    const hopRef = useRef<HTMLDivElement | null>(null);
    const idRef = useRef<string | null>(null);
    const [loi, setLoi] = useState<string | null>(null);

    // onToken thường là hàm mới mỗi lần render (inline arrow ở trang gọi). Giữ qua ref để
    // effect dưới KHÔNG phụ thuộc nó — nếu phụ thuộc, widget bị gỡ và dựng lại sau mỗi lần
    // gõ phím trên form, người dùng phải giải captcha lại liên tục.
    const onTokenRef = useRef(onToken);
    onTokenRef.current = onToken;

    useImperativeHandle(ref, () => ({
      reset() {
        onTokenRef.current(null);
        if (idRef.current && window.turnstile) window.turnstile.reset(idRef.current);
      },
    }));

    useEffect(() => {
      if (!SITE_KEY) {
        setLoi("Hệ thống chưa cấu hình kiểm tra bảo mật. Vui lòng liên hệ hỗ trợ.");
        onTokenRef.current(null);
        return;
      }
      let huy = false;
      napScript()
        .then(() => {
          if (huy || !hopRef.current || !window.turnstile) return;
          idRef.current = window.turnstile.render(hopRef.current, {
            sitekey: SITE_KEY,
            language: "vi",
            callback: (token) => onTokenRef.current(token),
            // Hết hạn và lỗi đều TRẢ VỀ null, không giữ token cũ: nút Gửi khoá lại và
            // người dùng giải lại — thà bắt làm lại còn hơn gửi đi một token đã chết.
            "expired-callback": () => onTokenRef.current(null),
            "error-callback": () => onTokenRef.current(null),
          });
        })
        .catch(() => {
          if (huy) return;
          setLoi("Không tải được lớp kiểm tra bảo mật. Vui lòng tải lại trang.");
          onTokenRef.current(null);
        });
      return () => {
        huy = true;
        if (idRef.current && window.turnstile) window.turnstile.remove(idRef.current);
        idRef.current = null;
      };
    }, []);

    if (loi) {
      return (
        <p role="alert" style={{ margin: 0, fontSize: "var(--fs-sm)", color: "var(--danger-600)" }}>
          {loi}
        </p>
      );
    }
    return <div ref={hopRef} data-testid="turnstile" />;
  },
);

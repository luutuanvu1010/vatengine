// U33 — Widget Turnstile giả cho jsdom.
//
// Cùng lý do với polyfill `matchMedia` trong setup.ts: jsdom không có `window.turnstile`,
// và component fail-closed (không token ⇒ nút Gửi khoá), nên NẾU KHÔNG giả lập thì mọi test
// đi qua màn đăng nhập hay đăng ký đều hỏng vì một lý do không liên quan tới điều nó kiểm.
//
// Giả lập bám sát hành vi thật ở ba điểm quan trọng:
//   1. callback đến BẤT ĐỒNG BỘ (widget thật phải giải xong mới trả token);
//   2. `reset(id)` cấp token MỚI, KHÁC token cũ — đây là cách duy nhất test bắt được lỗi
//      "gửi lại token đã tiêu";
//   3. `remove(id)` gỡ hẳn, gọi callback sau đó là sai.

export const TOKEN_TURNSTILE_TEST = "token-turnstile-gia-1";

interface WidgetGia {
  callback: (token: string) => void;
}

const widget = new Map<string, WidgetGia>();
let demWidget = 0;
let demToken = 0;

/** Token mà lần cấp KẾ TIẾP sẽ trả về — để test khẳng định form gửi đi token MỚI sau reset,
 * không phải token đã dùng. */
export function tokenThuMay(n: number): string {
  return `token-turnstile-gia-${n}`;
}

/** Cài `window.turnstile` giả. Dùng HÀM THƯỜNG (không phải vi.fn) để `vi.restoreAllMocks()`
 * trong các test không gỡ mất — đúng bài học đã ghi sẵn cho `matchMedia` ở setup.ts. */
export function caiTurnstileGia(): void {
  widget.clear();
  demWidget = 0;
  demToken = 0;
  window.turnstile = {
    render: (_el, opts) => {
      const id = `w${++demWidget}`;
      widget.set(id, { callback: opts.callback });
      queueMicrotask(() => {
        if (widget.has(id)) opts.callback(tokenThuMay(++demToken));
      });
      return id;
    },
    reset: (id) => {
      const w = widget.get(id);
      if (!w) return;
      queueMicrotask(() => {
        if (widget.has(id)) w.callback(tokenThuMay(++demToken));
      });
    },
    remove: (id) => {
      widget.delete(id);
    },
  };
}

/** Mô phỏng widget KHÔNG BAO GIỜ trả token: script tải được nhưng người dùng chưa giải,
 * hoặc Turnstile chặn. Dùng để kiểm nhánh fail-closed. */
export function caiTurnstileKhongTraToken(): void {
  widget.clear();
  window.turnstile = {
    render: () => "w-im-lang",
    reset: () => {},
    remove: () => {},
  };
}

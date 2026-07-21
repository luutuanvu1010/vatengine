import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom KHÔNG có window.matchMedia → useMediaQuery ném lỗi khi render khung app.
// Polyfill trả matches=false (mặc định DESKTOP) để test chạy ở layout sidebar tĩnh.
// Dùng HÀM THƯỜNG (không phải vi.fn) để vi.restoreAllMocks() trong các test không gỡ mất.
const noop = () => {};
window.matchMedia = (query: string): MediaQueryList =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: noop,
    removeEventListener: noop,
    addListener: noop,
    removeListener: noop,
    dispatchEvent: () => false,
  }) as MediaQueryList;

// Dọn DOM sau mỗi test (Testing Library) để test độc lập.
afterEach(() => {
  cleanup();
});

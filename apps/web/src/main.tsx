import "@fontsource/be-vietnam-pro/vietnamese-400.css";
import "@fontsource/be-vietnam-pro/vietnamese-500.css";
import "@fontsource/be-vietnam-pro/vietnamese-600.css";
import "@fontsource/be-vietnam-pro/vietnamese-700.css";
import "@fontsource/be-vietnam-pro/vietnamese-800.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./styles/global.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Không tìm thấy #root");

function veLen() {
  if (!rootEl) throw new Error("Không tìm thấy #root");
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

// Chế độ XEM THỬ giao diện (`?xem-thu=1`) — CHỈ bản dev. `import.meta.env.DEV` là hằng
// được Vite thay bằng `false` khi build, nên cả nhánh này lẫn chunk `import()` bị loại
// khỏi `dist/`. Xem đầu `src/dev/xemThuGiaoDien.ts` để biết vì sao phải như vậy.
//
// Phải `await` TRƯỚC khi render: AuthProvider hỏi `/me` ngay lúc mount, vá `fetch` sau đó
// là muộn — app đã kịp nhận 401 và đá về màn đăng nhập.
if (import.meta.env.DEV) {
  import("./dev/xemThuGiaoDien")
    .then(({ batXemThuGiaoDien }) => {
      if (batXemThuGiaoDien()) {
        console.warn(
          "[XEM THỬ] Đang dùng DỮ LIỆU BỊA, không phải số liệu thật. Tắt bằng ?xem-thu=0",
        );
      }
    })
    .finally(veLen);
} else {
  veLen();
}

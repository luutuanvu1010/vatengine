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

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

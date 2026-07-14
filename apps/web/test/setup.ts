import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Dọn DOM sau mỗi test (Testing Library) để test độc lập.
afterEach(() => {
  cleanup();
});

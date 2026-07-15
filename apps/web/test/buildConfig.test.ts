// H-A.6 — build production KHÔNG phát sourcemap công khai (tránh lộ mã nguồn qua
// Static Assets phục vụ file .map). Guard trên cấu hình build. (Không import trực
// tiếp vite.config vì nó kéo theo esbuild + setup jsdom; đọc text là đủ + ổn định.
// Bằng chứng hành vi thật: build production → dist KHÔNG có .map — kiểm ở /verify.)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// import.meta.dirname (Node 20.11+) = thư mục test này → độc lập với cwd khi chạy.
const CONFIG = readFileSync(join(import.meta.dirname, "..", "vite.config.ts"), "utf8");

describe("vite build — không lộ sourcemap production", () => {
  it("build.sourcemap = false (không phát .map)", () => {
    expect(CONFIG).toMatch(/sourcemap:\s*false/);
    expect(CONFIG).not.toMatch(/sourcemap:\s*true/);
  });
});

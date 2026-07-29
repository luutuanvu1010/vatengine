// Phép kiểm CONVENTION cho chế độ XEM THỬ (`src/dev/xemThuGiaoDien.ts`).
//
// Module đó là một đường VÒNG QUA XÁC THỰC — nó giả `/me` trả 200 nên app vào thẳng, không
// cần đăng nhập. `.claude/rules/security.md` buộc mọi endpoint phải xác thực, nên thứ này
// chỉ được phép sống trong bản dev. Rủi ro thật không phải "hôm nay nó lọt ra production"
// (hôm nay không lọt — đã grep `dist/`), mà là MAI ai đó sửa `main.tsx` cho gọn, bỏ mất
// `import.meta.env.DEV`, và không ai nhận ra. Phép kiểm này là cái chuông đó.
//
// Nó kiểm NGUỒN, không kiểm bundle. Bước grep `dist/` trước deploy là lớp còn lại.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MAIN = readFileSync(resolve(process.cwd(), "src", "main.tsx"), "utf8");
const MODULE_XEM_THU = resolve(process.cwd(), "src", "dev", "xemThuGiaoDien.ts");

describe("Chế độ xem thử — không được rò ra bản chạy thật", () => {
  it("main.tsx CHỈ nạp module xem thử bên trong `import.meta.env.DEV`", () => {
    // Mọi lần nhắc tới module phải nằm sau một cổng `import.meta.env.DEV` trong cùng file.
    const viTriNap = MAIN.indexOf("./dev/xemThuGiaoDien");
    expect(
      viTriNap,
      "main.tsx không còn nạp module xem thử — xoá luôn phép kiểm này",
    ).toBeGreaterThan(-1);
    const viTriCong = MAIN.indexOf("import.meta.env.DEV");
    expect(viTriCong, "thiếu cổng import.meta.env.DEV").toBeGreaterThan(-1);
    expect(
      viTriCong,
      "cổng DEV phải đứng TRƯỚC lời nạp, nếu không Vite không loại được nhánh chết",
    ).toBeLessThan(viTriNap);
  });

  it("nạp bằng import() ĐỘNG, không phải import tĩnh đầu file", () => {
    // import tĩnh sẽ kéo module vào graph bất kể cổng DEV ⇒ dữ liệu bịa nằm trong dist.
    expect(MAIN).not.toMatch(/^import .*dev\/xemThuGiaoDien/m);
    expect(MAIN).toContain('import("./dev/xemThuGiaoDien")');
  });

  it("module tự chặn theo hostname (lớp phòng thủ cuối)", () => {
    const src = readFileSync(MODULE_XEM_THU, "utf8");
    expect(src).toContain("location.hostname");
    expect(src).toContain("localhost");
  });

  it("module xem thử KHÔNG bị import từ bất kỳ đâu trong src/ ngoài main.tsx", () => {
    // Quét toàn bộ src/: chỉ main.tsx được nhắc tới nó.
    const { readdirSync, statSync } = require("node:fs") as typeof import("node:fs");
    const goc = resolve(process.cwd(), "src");
    const pham: string[] = [];
    const di = (d: string) => {
      for (const ten of readdirSync(d)) {
        const p = resolve(d, ten);
        if (statSync(p).isDirectory()) di(p);
        else if (/\.tsx?$/.test(p) && p !== MODULE_XEM_THU && !p.endsWith("main.tsx")) {
          if (readFileSync(p, "utf8").includes("xemThuGiaoDien")) pham.push(p);
        }
      }
    };
    di(goc);
    expect(pham, `chỉ main.tsx được nạp module xem thử:\n${pham.join("\n")}`).toEqual([]);
  });
});

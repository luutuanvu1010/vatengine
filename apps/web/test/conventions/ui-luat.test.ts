// Phép kiểm CONVENTION cho Luật giao diện (.claude/rules/ui.md) — chạy trong `make test`
// nên tự động thành cổng bắt buộc (CI `quality` + Stop hook), không phụ thuộc ai nhớ rà tay.
//
// Hai luật được máy kiểm ở đây:
//   1. Chỉ dùng token — cấm màu hex cứng trong `features/` (token nằm ở tokens.css).
//   2. Chỉ dùng primitive — cấm tô kiểu nội tuyến cho ô nhập/ô chọn trong `features/`.
//
// Vì sao đặt ở U-K3 mà không sớm hơn: `FilterBar` vốn còn `selectStyle`/`inputStyle` nội
// tuyến, bật phép kiểm trước khi dọn sẽ làm CI đỏ mà chưa có bản sửa. Thêm phép kiểm CÙNG
// đơn vị dọn nó (khoảng hở #2 trong AUDIT-hooks-2026-07-22).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const GOC = resolve(process.cwd(), "src");
const THU_MUC_QUET = [join(GOC, "features")];

function liet(duong: string): string[] {
  const ra: string[] = [];
  for (const ten of readdirSync(duong)) {
    const p = join(duong, ten);
    if (statSync(p).isDirectory()) {
      ra.push(...liet(p));
    } else if ([".ts", ".tsx"].includes(extname(p))) {
      ra.push(p);
    }
  }
  return ra;
}

const TEP = THU_MUC_QUET.flatMap(liet);

/** Bỏ chú thích: chú thích được phép nhắc mã màu để giải thích lịch sử/quyết định. */
function boChuThich(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("Luật ui.md — chỉ dùng design token, cấm màu hex cứng", () => {
  it("không tệp nào trong features/ chứa mã màu hex", () => {
    const pham: string[] = [];
    for (const tep of TEP) {
      const ma = boChuThich(readFileSync(tep, "utf8"));
      // #rgb / #rrggbb / #rrggbbaa
      const hit = ma.match(/#[0-9a-fA-F]{3,8}\b/g);
      if (hit) pham.push(`${relative(process.cwd(), tep)}: ${[...new Set(hit)].join(", ")}`);
    }
    expect(pham, `dùng biến --… trong tokens.css thay vì hex cứng:\n${pham.join("\n")}`).toEqual(
      [],
    );
  });
});

describe("Luật ui.md — ô nhập/ô chọn dùng primitive, không tô kiểu nội tuyến", () => {
  it("không có <input>/<select> mang thuộc tính style= trong features/", () => {
    const pham: string[] = [];
    for (const tep of TEP) {
      const ma = boChuThich(readFileSync(tep, "utf8"));
      // Thẻ <input …> hoặc <select …> có `style=` trước dấu đóng thẻ.
      const re = /<(input|select)\b[^>]*?\bstyle=/gs;
      const hit = ma.match(re);
      if (hit) pham.push(`${relative(process.cwd(), tep)}: ${hit.length} chỗ`);
    }
    expect(
      pham,
      `thêm/ dùng primitive (Select/Field/TextField) thay vì style nội tuyến:\n${pham.join("\n")}`,
    ).toEqual([]);
  });

  // Chốt chặn phép kiểm KHÔNG rỗng: nếu đường dẫn quét sai thì hai test trên xanh giả.
  it("phép kiểm thật sự có quét file (không xanh giả do quét rỗng)", () => {
    expect(TEP.length).toBeGreaterThan(10);
  });
});

// --- Thang cỡ chữ: một nguồn sự thật + thân 16px (QĐ-9b) --------------------------------
// 07-DESIGN_TOKENS.md tự tuyên bố là nguồn DUY NHẤT và `tokens.css` chỉ là serialization của
// nó — nhưng trước đây KHÔNG có gì ép hai bên khớp, nên lệch được mà không ai biết. Hai phép
// kiểm dưới đây biến lời tuyên bố đó thành cổng máy.
const DUONG_DOC_TOKEN = resolve(process.cwd(), "..", "..", "docs", "07-DESIGN_TOKENS.md");
const DUONG_TOKENS_CSS = resolve(GOC, "styles", "tokens.css");

/** Rút mọi cặp `--fs-*: <px>` từ một nguồn CSS bất kỳ (block ```css trong .md cũng khớp). */
function docCoChu(src: string): Record<string, string> {
  const ra: Record<string, string> = {};
  for (const [, ten, px] of src.matchAll(/(--fs-[\w-]+)\s*:\s*(\d+px)/g)) {
    if (ten && px) ra[ten] = px;
  }
  return ra;
}

describe("Luật ui.md — thang cỡ chữ một nguồn, thân 18px (QĐ-9b)", () => {
  const doc = docCoChu(readFileSync(DUONG_DOC_TOKEN, "utf8"));
  const css = docCoChu(readFileSync(DUONG_TOKENS_CSS, "utf8"));

  it("tokens.css khớp NGUYÊN VĂN thang trong 07-DESIGN_TOKENS.md §7", () => {
    expect(Object.keys(css).length, "tokens.css không có --fs-* nào ⇒ regex hỏng").toBeGreaterThan(
      5,
    );
    expect(css, "sửa docs/07-DESIGN_TOKENS.md TRƯỚC rồi đồng bộ về tokens.css").toEqual(doc);
  });

  it("thân là 18px và mọi bậc tiêu đề LỚN HƠN thân", () => {
    const px = (t: string) => Number.parseInt(css[t] ?? "", 10);
    const than = px("--fs-base");
    expect(than).toBe(18);
    // Nhãn phải NHỎ hơn thân — nếu không, `--fs-sm` lại bị dùng như thân và vòng lặp
    // "chữ bé" (U20 → U37b) tái diễn theo chiều ngược lại.
    for (const t of ["--fs-xs", "--fs-sm"]) {
      expect(px(t), `${t} là NHÃN, phải nhỏ hơn thân ${than}px`).toBeLessThan(than);
    }
    // Bậc tăng đơn điệu — chống việc sửa lẻ một token làm thang gãy.
    expect([px("--fs-lg"), px("--fs-xl"), px("--fs-2xl"), px("--fs-3xl")]).toEqual([
      22, 26, 32, 40,
    ]);
  });

  it("primitive ChuPhu (câu văn để ĐỌC) dùng --fs-base, không phải --fs-sm", () => {
    const src = readFileSync(resolve(GOC, "components", "ui", "primitives.tsx"), "utf8");
    const than = src.slice(src.indexOf("export function ChuPhu"));
    expect(than).toContain('fontSize: "var(--fs-base)"');
    expect(boChuThich(than)).not.toContain("var(--fs-sm)");
  });
});

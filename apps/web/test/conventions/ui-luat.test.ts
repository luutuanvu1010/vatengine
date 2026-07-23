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

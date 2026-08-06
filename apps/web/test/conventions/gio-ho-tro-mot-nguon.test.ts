// Giờ hỗ trợ phải đọc từ `lib/contact.ts`, không gõ cứng ở bề mặt. Khối "Cần hỗ trợ?" ở màn
// Đăng nhập và phần Trung tâm hỗ trợ trong trang Giới thiệu hiện CÙNG một chuỗi; hai nơi gõ
// tay sẽ lệch vào ngày đổi giờ mà không ai biết.
//
// CỐ Ý quét riêng, KHÔNG nối vào `THU_MUC_QUET` của `ui-luat.test.ts`: quét này phủ cả
// `src/components`, mà thư mục đó có `#fff` hợp lệ trong `Brand.tsx` và `primitives.tsx` —
// nối vào sẽ làm hai ca kiểm màu hex đỏ oan.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GIO_HO_TRO } from "../../src/lib/contact";

const GOC = resolve(process.cwd(), "src");
const THU_MUC = [join(GOC, "features"), join(GOC, "components")];

function liet(duong: string): string[] {
  const ra: string[] = [];
  for (const ten of readdirSync(duong)) {
    const p = join(duong, ten);
    if (statSync(p).isDirectory()) ra.push(...liet(p));
    else if ([".ts", ".tsx"].includes(extname(p))) ra.push(p);
  }
  return ra;
}

/** Bỏ chú thích: chú thích được phép nhắc chuỗi cũ để giải thích lịch sử. */
function boChuThich(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("Luật một-nguồn — giờ hỗ trợ", () => {
  it("không tệp bề mặt nào gõ cứng chuỗi giờ hỗ trợ", () => {
    const pham = THU_MUC.flatMap(liet).filter((p) =>
      boChuThich(readFileSync(p, "utf8")).includes(GIO_HO_TRO),
    );
    expect(pham.map((p) => relative(GOC, p))).toEqual([]);
  });
});

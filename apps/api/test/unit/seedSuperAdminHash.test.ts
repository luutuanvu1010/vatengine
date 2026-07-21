// U18 — HỢP ĐỒNG GIỮA HAI HIỆN THỰC BĂM MẬT KHẨU.
//
// `scripts/seed-super-admin.mjs` chạy trên Node và băm bằng `node:crypto`.
// `apps/api/src/password.ts` chạy trên workerd và verify bằng WebCrypto.
// Hai hiện thực khác nhau, cùng một định dạng chuỗi — và không có gì trong trình biên
// dịch bắt được nếu chúng trôi khỏi nhau.
//
// Hậu quả khi lệch: seed chạy "thành công", ghi hash vào DB, rồi chủ dự án gõ ĐÚNG mật
// khẩu và nhận 401 gọn — không manh mối, vì /admin/auth/login cố ý không phân biệt lý do
// thất bại. Đây đúng là loại lỗi tốn nhiều giờ nhất để tìm ra, nên nó được ghim bằng test
// thay vì bằng một dòng chú thích "PHẢI KHỚP".
import { describe, expect, it } from "vitest";
// @ts-expect-error — script .mjs thuần JS, không có khai báo kiểu. Import CHÍNH nó (không
// chép lại logic) mới là điều làm test này có giá trị.
import { hashPassword as hashPasswordNode } from "../../../../scripts/seed-super-admin.mjs";
import { hashPassword as hashPasswordWorker, verifyPassword } from "../../src/password";

const MAT_KHAU = "mat-khau-chu-du-an-rat-dai";

describe("🔴 Hash của seed script phải verify được bằng chính hàm Worker dùng", () => {
  it("node:crypto → verifyPassword (WebCrypto) chấp nhận", async () => {
    const stored = (await hashPasswordNode(MAT_KHAU)) as string;
    expect(await verifyPassword(MAT_KHAU, stored)).toBe(true);
  });

  it("sai mật khẩu vẫn bị từ chối (chứng minh test trên không xanh vì lý do sai)", async () => {
    const stored = (await hashPasswordNode(MAT_KHAU)) as string;
    expect(await verifyPassword("mat-khau-khac", stored)).toBe(false);
  });

  it("hai hiện thực sinh ra CÙNG một hình dạng chuỗi", async () => {
    const tuNode = (await hashPasswordNode(MAT_KHAU)) as string;
    const tuWorker = await hashPasswordWorker(MAT_KHAU);
    const dang = (s: string) => {
      const [scheme, iter, salt, hash] = s.split("$");
      return {
        scheme,
        iter,
        saltByte: atob(salt as string).length,
        hashByte: atob(hash as string).length,
      };
    };
    // Số vòng, kích thước muối và kích thước khoá đều phải trùng: hash tự mô tả số vòng
    // nên verify vẫn chạy nếu lệch, nhưng lệch KEYLEN thì `timingSafeEqual` trả false vì
    // độ dài khác — thất bại im lặng, không lỗi.
    expect(dang(tuNode)).toEqual(dang(tuWorker));
  });

  it("chéo hai chiều: hash Worker cũng đúng định dạng script mong đợi", async () => {
    const tuWorker = await hashPasswordWorker(MAT_KHAU);
    expect(tuWorker).toMatch(/^pbkdf2\$100000\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  });
});

import { sql } from "drizzle-orm";
// U37c — đường tải CÔNG KHAI `/tai/<token>`. Không đăng nhập, không tenant.
//
// VÌ SAO CÓ ĐƯỜNG NÀY: trước đây file nằm trên bucket công khai gắn custom domain, nên
// "thu hồi" = xóa object. Probe thật 2026-07-29 cho thấy xóa object KHÔNG vô hiệu hóa bản
// đã nằm trong cache CDN — tệp còn tải được tới 4 GIỜ sau khi thu hồi. Ở đây, hiệu lực của
// liên kết là một câu truy vấn DB tại MỖI lượt tải, nên thu hồi ăn ngay.
import { Hono } from "hono";
import type { AppDeps, AppEnv } from "../types";

/** Một phản hồi 404 DUY NHẤT cho mọi lý do từ chối.
 *
 * Token sai · đã thu hồi · hết hạn · mất file — bốn ca phải KHÔNG phân biệt được nhau.
 * Phân biệt là xác nhận cho người dò rằng token đó từng tồn tại, và với liên kết công khai
 * thì đó là thứ duy nhất họ cần biết để đoán tiếp. */
const KHONG_THAY = () =>
  new Response("Không tìm thấy tệp. Liên kết có thể đã hết hạn hoặc bị thu hồi.", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });

export function taiCongKhaiRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();

  r.get("/:token", async (c) => {
    const token = c.req.param("token");
    // Chặn từ đầu: token của ta là 26 ký tự base32. Không để chuỗi lạ đi tới DB.
    if (!/^[a-z0-9]{20,64}$/.test(token)) return KHONG_THAY();

    const kho = c.env.CHIA_SE;
    if (!kho) return KHONG_THAY();

    const { db, close } = await deps.getDb(c.env);
    try {
      // `tai_tra_goi` là SECURITY DEFINER (migration 0022) — đường tải không có phiên nên
      // không đặt được `app.tenant_id`, mà chính bước tra tenant cũng đã bị RLS chặn.
      // Hàm tự gộp cả ba điều kiện hiệu lực; tầng này KHÔNG kiểm lại để khỏi có hai nguồn
      // sự thật về "liên kết còn sống hay không".
      const rows = (await db.execute(
        sql`select khoa_r2 from tai_tra_goi(${token}::text)`,
      )) as unknown as { rows?: Array<{ khoa_r2: string }> };
      const khoaR2 = (Array.isArray(rows) ? rows : (rows.rows ?? []))[0]?.khoa_r2;
      if (!khoaR2) return KHONG_THAY();

      const obj = await kho.get(khoaR2);
      if (!obj) return KHONG_THAY();

      await db.execute(sql`select tai_ghi_nhan_luot(${token}::text)`);

      // Stream thẳng, KHÔNG đọc trọn vào RAM.
      return new Response(obj.body, {
        headers: {
          "content-type": "application/zip",
          "content-disposition":
            obj.httpMetadata?.contentDisposition ?? 'attachment; filename="hoa-don.zip"',
          // BẮT BUỘC. Thiếu dòng này là tái lập nguyên lỗi vừa sửa, chỉ đổi chỗ: biên giữ
          // bản sao thì thu hồi lại thành lời hứa suông.
          "cache-control": "no-store",
        },
      });
    } finally {
      await close();
    }
  });

  return r;
}

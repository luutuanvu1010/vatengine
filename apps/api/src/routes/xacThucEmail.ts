import { sql } from "drizzle-orm";
// U34c (QĐ-15) — Xác thực địa chỉ email của khách.
//
// ── VÌ SAO LÀ `POST`, KHÔNG PHẢI `GET` ───────────────────────────────────────────────
// Đây là lần thứ BA cùng một bài học xuất hiện trong dự án này, mỗi lần ở một tầng khác:
//   1. Hyperdrive cache `SELECT ... FROM admin_*()` vì nó trông như câu đọc.
//   2. QĐ-12: không đặt nút Duyệt dưới dạng đường link trong thư.
//   3. Ở đây: nếu xác thực là `GET /xac-thuc?token=…` thì máy quét thư, phần mềm diệt
//      virus và bộ lọc doanh nghiệp sẽ TỰ ĐỘNG FETCH nó. Token bị tiêu trước khi khách kịp
//      bấm, và khách mở thư lần đầu đã thấy "liên kết đã được dùng".
//
// Nên: liên kết trong thư trỏ tới TRANG của SPA (tải trước thì vô hại), và trang đó gửi
// `POST` lên đây. Máy quét không chạy JavaScript, nên chỉ người thật mới tiêu được token.
//
// Route CÔNG KHAI — chưa có phiên nào tại thời điểm gọi. Thứ bảo vệ nó là chính token:
// 32 byte ngẫu nhiên, lưu ở dạng băm, dùng một lần, hết hạn sau 24 giờ.
import { Hono } from "hono";
import { z } from "zod";
import { bamToken } from "../email/token";
import type { AppDeps, AppEnv } from "../types";

const schema = z.object({ token: z.string().min(1) }).strict();

/** Kết quả từ hàm `xac_thuc_email_dung` trong DB. */
interface HangKetQua {
  ket_qua: string;
  r_tenant_id: string | null;
  r_ten: string | null;
  r_mst: string | null;
  r_email: string | null;
}

export function xacThucEmailRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();

  r.post("/", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "bad_request" }, 400);
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) return c.json({ error: "bad_request" }, 400);

    const tokenBam = await bamToken(parsed.data.token);
    const { db, close } = await deps.getDb(c.env);
    try {
      // Kiểm + tiêu + chuyển trạng thái nằm TRỌN trong một lời gọi hàm, có `FOR UPDATE`.
      // Tách ra ở tầng ứng dụng sẽ để lại khe hở TOCTOU: hai lần bấm đồng thời cùng thấy
      // token còn hiệu lực. Đúng lớp lỗi U18 đã gặp một lần ở đường duyệt tenant.
      //
      // ⚠️ Viết dưới dạng `select ... from <hàm>()` cho khớp khuôn mẫu sẵn có của các hàm
      // SECURITY DEFINER, nhưng đây LÀ MỘT THAO TÁC GHI. Nó chỉ an toàn nhờ QĐ-10 (cache
      // Hyperdrive đang TẮT). Bật lại cache là câu này bị cache và việc xác thực hỏng theo
      // đúng cách mà sự cố 2026-07-21 đã hỏng.
      const res = (await db.execute(
        sql`select ket_qua, r_tenant_id, r_ten, r_mst, r_email from xac_thuc_email_dung(${tokenBam})`,
      )) as { rows: HangKetQua[] };
      const h = res.rows[0];

      if (!h || h.ket_qua !== "ok") {
        // Ba mã lỗi TÁCH BẠCH, vì người dùng làm việc khác nhau với chúng: `het_han` thì
        // xin gửi lại thư; `da_dung` thì cứ đăng nhập bình thường (rất hay gặp — bấm hai
        // lần, hoặc mở lại thư cũ); `khong_thay` mới là liên kết hỏng thật.
        const ma = h?.ket_qua === "het_han" || h?.ket_qua === "da_dung" ? h.ket_qua : "khong_thay";
        return c.json({ error: ma }, 400);
      }

      // QĐ-15 — CHÍNH CHỖ NÀY mới báo admin, không phải lúc đăng ký. Tới đây thì địa chỉ
      // email đã được chứng minh là có thật và thuộc về người vừa thao tác.
      //
      // Fail-silent như U34a: thông báo hỏng không được làm hỏng việc xác thực của khách —
      // họ đã làm đúng phần của mình rồi.
      try {
        await deps.baoDangKyMoi(c.env, {
          tenantId: h.r_tenant_id as string,
          tenDoanhNghiep: h.r_ten ?? "",
          mst: h.r_mst ?? "",
          email: h.r_email ?? "",
        });
      } catch (err) {
        console.warn(
          "[xacThucEmail] báo admin thất bại, bỏ qua:",
          err instanceof Error ? err.message : err,
        );
      }

      return c.json({ ok: true, trangThai: "cho_duyet" });
    } finally {
      await close();
    }
  });

  return r;
}

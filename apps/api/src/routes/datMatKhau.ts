// Lát cắt 3 (QĐ-14) — Khách tự đặt mật khẩu bằng token trong thư duyệt.
//
// ── ROUTE CÔNG KHAI, VÀ VÌ SAO KHÔNG CÓ TURNSTILE ────────────────────────────────────
// `/dang-ky` và `/auth/login` có cổng Turnstile vì chúng nhận đầu vào ĐOÁN ĐƯỢC: một địa
// chỉ email, một mật khẩu do người đặt. Ở đây đầu vào là 32 byte ngẫu nhiên — không có
// gì để đoán, và mỗi lần thử sai chỉ tốn một truy vấn index. Thêm captcha ở đây không
// chặn thêm được gì, nhưng lại thêm một nhánh 503: cấu hình Turnstile sai nghĩa là khách
// đã được duyệt KHÔNG đặt nổi mật khẩu, mà đó lại là bước cuối của cả đường đăng ký.
// Chặn nhịp là việc của rule WAF ở tầng zone (QĐ-11). Cùng tiền lệ với `/xac-thuc-email`
// (Lát cắt 1, đang chạy production).
//
// ── VÌ SAO `POST` ────────────────────────────────────────────────────────────────────
// Cùng bài học QĐ-12: một thao tác GHI dưới dạng `GET` sẽ bị máy quét thư tự fetch. Ở
// đường này còn chắc hơn một bậc — trang SPA không tự gọi khi tải, phải có người gõ mật
// khẩu rồi bấm gửi.
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { bamToken } from "../email/token";
import { hashPassword, resolvePbkdf2Iterations } from "../password";
import type { AppDeps, AppEnv } from "../types";

// 8 ký tự — khớp `MAT_KHAU_TOI_THIEU` ở `routes/auth.ts`. Mật khẩu này KHÔNG có cửa sổ
// hết hạn như mật khẩu tạm cũ, nên nó phải tự đứng vững.
const TOI_THIEU = 8;

const schema = z.object({ token: z.string().min(1), mat_khau: z.string() }).strict();

interface HangKetQua {
  ket_qua: string;
  r_email: string | null;
}

export function datMatKhauRoutes(deps: AppDeps) {
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

    // Kiểm độ dài TRƯỚC khi chạm DB: mật khẩu quá ngắn không được TIÊU MẤT token. Khách gõ
    // hụt một lần mà mất luôn liên kết duy nhất thì họ kẹt hoàn toàn — và đó là kiểu kẹt
    // không ai báo cho ta biết, họ chỉ bỏ đi.
    if (parsed.data.mat_khau.length < TOI_THIEU) {
      return c.json({ error: "mat_khau_qua_ngan" }, 400);
    }

    // Băm ở tầng Worker (WebCrypto) rồi mới xuống DB: mật khẩu thô KHÔNG BAO GIỜ đi vào
    // Postgres, nên nó cũng không lọt vào nhật ký truy vấn chậm hay bản sao lưu của DB.
    const hash = await hashPassword(parsed.data.mat_khau, resolvePbkdf2Iterations(c.env));
    const tokenBam = await bamToken(parsed.data.token);

    const { db, close } = await deps.getDb(c.env);
    try {
      // Kiểm + tiêu + đặt mật khẩu nằm TRỌN trong một lời gọi hàm, có `FOR UPDATE`. Tách ra
      // ở tầng ứng dụng sẽ để lại khe hở TOCTOU: hai lần submit đồng thời cùng thấy token
      // còn hiệu lực. Đúng lớp lỗi U18 đã gặp một lần ở đường duyệt tenant.
      //
      // ⚠️ Viết dưới dạng `select ... from <hàm>()` cho khớp khuôn mẫu SECURITY DEFINER
      // sẵn có, nhưng đây LÀ MỘT THAO TÁC GHI. Nó chỉ an toàn nhờ QĐ-10 (cache Hyperdrive
      // đang TẮT). Bật lại cache là đường đặt mật khẩu hỏng theo đúng cách mà sự cố
      // 2026-07-21 đã hỏng.
      const res = (await db.execute(
        sql`select ket_qua, r_email from dat_mat_khau_dung(${tokenBam}, ${hash})`,
      )) as { rows: HangKetQua[] };
      const h = res.rows[0];

      if (!h || h.ket_qua !== "ok") {
        // Ba mã lỗi TÁCH BẠCH, vì người dùng làm việc khác nhau với chúng: `het_han` thì
        // xin liên kết mới; `da_dung` thì cứ đăng nhập bình thường (rất hay gặp — bấm hai
        // lần, hoặc mở lại thư cũ); `khong_thay` mới là liên kết hỏng thật.
        const ma = h?.ket_qua === "het_han" || h?.ket_qua === "da_dung" ? h.ket_qua : "khong_thay";
        return c.json({ error: ma }, 400);
      }

      // KHÔNG tự đăng nhập giùm ở đây, dù kỹ thuật làm được. Đặt mật khẩu xong mà vào thẳng
      // app thì khách không bao giờ gõ mật khẩu vừa đặt, và lần sau họ không nhớ nổi nó.
      // Một lần gõ lại ngay lúc còn nhớ là rẻ hơn nhiều một lượt "quên mật khẩu".
      return c.json({ ok: true });
    } finally {
      await close();
    }
  });

  return r;
}

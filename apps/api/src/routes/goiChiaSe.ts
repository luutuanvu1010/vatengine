// U37b Gói 4b — phát hành gói hóa đơn gốc cho MỘT khách hàng.
//
// Route này CHỈ tạo gói và đẩy job; việc tải hồ sơ gốc do `vat-sync-worker` làm (U37a),
// việc đóng ZIP + phát link do Gói 4c làm (QĐ-B7: `vat-api` đóng gói, không phải worker).
// API giữ PHI TRẠNG THÁI — chỉ producer (ADR-0001 §3).
import { goiChiaSe, nguoiDung, taiKhoanThue, withTenant } from "@vat/db";
import { type HoaDonChoGoi, listHoaDonChoGoi } from "@vat/query";
import { buildHoSoGocMessages } from "@vat/sync";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { requireTenant } from "../auth";
import { requireRole } from "../rbac";
import type { AppDeps, AppEnv } from "../types";

/**
 * Thân request. `.strict()` là CỔNG AN TOÀN, không phải chuyện gọn gàng: `runHoSoGocJob`
 * TIN THẲNG `msg.ref` và không tra lại `hoa_don` theo tenant (review bảo mật U37a). Nếu
 * client gửi kèm `ref`/`hoaDonId` mà ta âm thầm bỏ qua, người đọc mã sau này dễ tưởng là
 * có nhận — `.strict()` khiến ý đồ đó bị TỪ CHỐI ngay ở biên với 400.
 *
 * Ba trường đều BẮT BUỘC: QĐ-B2 (phải chọn khách hàng) + QĐ-B9 (khoảng ngày trống ⇒ chặn,
 * không mặc định "toàn bộ lịch sử").
 */
const taoGoiSchema = z
  .object({
    nmmst: z.string().trim().min(1).max(20),
    tuNgay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    denNgay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();

const SO_NGAY_SONG = 30;

/** Bảng chữ base32 thường, bỏ ký tự dễ nhìn nhầm (0/1/l/o) — khóa còn để đọc/gõ lại được. */
const CHU_CAI = "abcdefghijkmnpqrstuvwxyz23456789";

/**
 * Số ký tự của token. ĐẾM THEO BIT, không theo byte — mỗi ký tự của bảng chữ 32 ký tự chỉ
 * mang log2(32) = 5 bit:
 *
 *     26 ký tự × 5 bit = 130 bit  ≥ 128 bit (yêu cầu ở U37b-plan.md §4 Gói 4)
 *
 * ⚠️ Bản đầu sinh 20 byte rồi ánh xạ MỖI BYTE thành MỘT ký tự — vứt 3 bit mỗi byte, còn
 * đúng 100 bit chứ không phải 160 như tên biến gợi ý. Test canh định dạng khóa bắt được.
 * Khóa là hàng rào DUY NHẤT bảo vệ file công khai nên chỗ này không được đếm nhầm.
 */
const SO_KY_TU_TOKEN = 26;

/**
 * Token ngẫu nhiên ≥128-bit. Đây là thứ DUY NHẤT bảo vệ file sau khi phát hành: bucket
 * công khai không cho liệt kê nội dung ở gốc (đã kiểm thật 2026-07-29: `GET /` trả 404),
 * nên đoán không ra khóa là đoán không ra file.
 *
 * 256 chia hết cho 32 nên `b % 32` phân bố ĐỀU — không lệch modulo.
 */
function sinhToken(soKyTu = SO_KY_TU_TOKEN): string {
  const bytes = crypto.getRandomValues(new Uint8Array(soKyTu));
  let s = "";
  for (const b of bytes) s += CHU_CAI[b % CHU_CAI.length];
  return s;
}

/**
 * Khóa object trong bucket CÔNG KHAI.
 *
 * Tiền tố `<YYYY-MM>` là THÁNG PHÁT HÀNH (không phải kỳ hóa đơn) — khớp thẳng lifecycle
 * rule theo prefix `goi-hoa-don/` và tiện dọn/thống kê. TUYỆT ĐỐI không nhúng MST, tên
 * doanh nghiệp, khoảng ngày hóa đơn hay `tenant_id`: mỗi mẩu đó là một manh mối thu hẹp
 * không gian đoán, mà khóa lại là hàng rào duy nhất.
 */
function sinhKhoaR2(now: Date): string {
  const thang = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return `goi-hoa-don/${thang}/${sinhToken()}.zip`;
}

/** Gom hóa đơn theo tài khoản thuế sở hữu (MST người bán) — tenant có thể có nhiều MST. */
function gomTheoTaiKhoan(
  hoaDons: HoaDonChoGoi[],
  theoMst: Map<string, string>,
): Array<[string, HoaDonChoGoi[]]> {
  const nhom = new Map<string, HoaDonChoGoi[]>();
  for (const h of hoaDons) {
    const taikhoanId = theoMst.get(h.nbmst);
    if (!taikhoanId) continue;
    const cu = nhom.get(taikhoanId);
    if (cu) cu.push(h);
    else nhom.set(taikhoanId, [h]);
  }
  return [...nhom.entries()];
}

export function goiChiaSeRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();

  r.use("*", requireTenant);
  // Phát hành một link CÔNG KHAI không cần đăng nhập là hành động nhạy cảm hơn tra cứu —
  // giữ cùng mức với kết xuất (`exports.ts`): kế toán trưởng trở lên.
  r.use("*", requireRole("ke_toan_truong", "quan_tri"));

  r.post("/", async (c) => {
    const queue = c.env.SYNC_QUEUE;
    // Kiểm TRƯỚC khi chạm DB: thiếu hàng đợi mà vẫn tạo hàng thì gói treo mãi ở `dang_tao`
    // và không bao giờ có ai kéo nó lên.
    if (!queue) return c.json({ error: "sync_unavailable" }, 503);

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "bad_request" }, 400);
    }
    const parsed = taoGoiSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "bad_request" }, 400);
    const { nmmst, tuNgay, denNgay } = parsed.data;
    if (tuNgay > denNgay) return c.json({ error: "khoang_ngay_khong_hop_le" }, 400);

    const tenantId = c.get("tenantId");
    const nguoiTao = c.get("userId") ?? null;
    const { db, close } = await deps.getDb(c.env);
    try {
      const chuanBi = await withTenant(db, tenantId, async (tx) => {
        // NGUỒN DUY NHẤT sinh `ref` — đã lọc `tenant_id`. Không bao giờ nhận từ client.
        const hoaDons = await listHoaDonChoGoi(tx, tenantId, { nmmst, tuNgay, denNgay });
        if (hoaDons.length === 0) return null;

        // Message cần `taikhoanId` để job nạp token. Tenant có thể có NHIỀU MST, và với
        // hóa đơn BÁN RA thì MST của chính tenant nằm ở `nbmst` — ánh xạ theo đó, đúng
        // cầu nối mà `packages/sync/src/missingLines.ts` đã dùng (sold → nbmst).
        const dsTaiKhoan = await tx
          .select({ id: taiKhoanThue.id, username: taiKhoanThue.username })
          .from(taiKhoanThue)
          .where(eq(taiKhoanThue.tenantId, tenantId));
        const theoMst = new Map(dsTaiKhoan.map((t) => [t.username, t.id]));

        // `nguoi_tao` có FK tới `nguoi_dung`. `sub` trong JWT là người dùng THẬT lúc đăng
        // nhập, nhưng token sống lâu hơn tài khoản: nếu người đó bị xóa mà token còn hạn
        // thì insert vỡ FK và request hợp lệ nhận 500. Tra trước, không có thì để null —
        // mất tên người tạo còn hơn hỏng cả thao tác. Đồng thời chặn luôn ca `sub` của
        // tenant khác lọt vào (phòng thủ chiều sâu, dù JWT đã gắn tenant).
        const nguoiTaoHopLe = nguoiTao
          ? ((
              await tx
                .select({ id: nguoiDung.id })
                .from(nguoiDung)
                .where(and(eq(nguoiDung.id, nguoiTao), eq(nguoiDung.tenantId, tenantId)))
                .limit(1)
            )[0]?.id ?? null)
          : null;

        return { hoaDons, theoMst, nguoiTaoHopLe };
      });

      // Không phát hành gói rỗng, và không tạo hàng "dang_tao" chẳng bao giờ xong.
      if (!chuanBi) return c.json({ error: "khong_co_hoa_don" }, 400);

      const { hoaDons, theoMst, nguoiTaoHopLe } = chuanBi;
      const thieuTaiKhoan = hoaDons.filter((h) => !theoMst.has(h.nbmst));
      if (thieuTaiKhoan.length > 0) {
        // Không có token cho MST đó ⇒ không tài nào tải được. Báo rõ thay vì tạo gói rồi
        // để người dùng chờ một thứ không bao giờ tới.
        return c.json({ error: "thieu_tai_khoan_thue", soHoaDon: thieuTaiKhoan.length }, 409);
      }

      const now = new Date();
      const khoaR2 = sinhKhoaR2(now);
      const hetHanLuc = new Date(now.getTime() + SO_NGAY_SONG * 86_400_000);

      const rows = await withTenant(db, tenantId, (tx) =>
        tx
          .insert(goiChiaSe)
          .values({
            tenantId,
            khoaR2,
            nmmst,
            tuNgay,
            denNgay,
            soHoaDon: hoaDons.length,
            nguoiTao: nguoiTaoHopLe,
            hetHanLuc,
            trangThai: "dang_tao",
          })
          .returning({ id: goiChiaSe.id }),
      );
      const id = rows[0]?.id;
      if (!id) return c.json({ error: "server_error" }, 500);

      // Một message / hóa đơn. Hóa đơn đã có trong kho thì `daCo` ở worker chặn từ đầu,
      // không tốn request nào tới máy chủ thuế (U37a).
      //
      // Nhóm theo `taikhoanId` rồi dựng một lượt: `buildHoSoGocMessages` là NGUỒN SỰ THẬT
      // DUY NHẤT về hình dạng message (`@vat/sync`) — không tự ghép tay ở đây để hai nơi
      // khỏi lệch nhau khi hợp đồng message đổi.
      for (const [taikhoanId, cuaTaiKhoan] of gomTheoTaiKhoan(hoaDons, theoMst)) {
        const msgs = buildHoSoGocMessages(
          { tenantId, taikhoanId },
          cuaTaiKhoan.map((h) => ({
            hoaDonId: h.hoaDonId,
            ref: {
              nbmst: h.nbmst,
              khhdon: h.khhdon,
              khmshdon: h.khmshdon,
              shdon: h.shdon,
              source: h.source,
            },
          })),
        );
        for (const msg of msgs) await queue.send(msg);
      }

      return c.json({ id, soHoaDon: hoaDons.length, trangThai: "dang_tao" }, 201);
    } finally {
      await close();
    }
  });

  return r;
}

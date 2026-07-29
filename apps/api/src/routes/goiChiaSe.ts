// U37b Gói 4b — phát hành gói hóa đơn gốc cho MỘT khách hàng.
//
// Route này CHỈ tạo gói và đẩy job; việc tải hồ sơ gốc do `vat-sync-worker` làm (U37a),
// việc đóng ZIP + phát link do Gói 4c làm (QĐ-B7: `vat-api` đóng gói, không phải worker).
// API giữ PHI TRẠNG THÁI — chỉ producer (ADR-0001 §3).
import { maskSensitive } from "@vat/crypto";
import { auditLog, goiChiaSe, nguoiDung, taiKhoanThue, tepHoaDonGoc, withTenant } from "@vat/db";
import { type HoaDonThieu, type TepHoaDon, dungGoiZip } from "@vat/export";
import { type HoaDonChoGoi, demTienDoGoi, listHoaDonChoGoi } from "@vat/query";
import type { HoSoGocDaTach } from "@vat/sync";
import { KHOA_TAI_NGUYEN_CHUNG, TEP_TINH_DUNG_CHUNG } from "@vat/sync";
import { buildHoSoGocMessages } from "@vat/sync";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { isUuid, requireTenant } from "../auth";
import { requireRole } from "../rbac";
import type { AnyDb, AppDeps, AppEnv } from "../types";

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

/** Thời hiệu link công khai. PHẢI khớp lifecycle `het-han-1-tuan` trên bucket `vat-chia-se`
 * (7 ngày, prefix `goi-hoa-don/`). Lệch nhau thì sổ và thực tế nói khác nhau — QĐ-6 sửa
 * 2026-07-29 từ 30 ngày xuống 1 tuần. */
const SO_NGAY_SONG = 7;

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
  // Đọc trạng thái và THU HỒI mở cho mọi vai; PHÁT HÀNH/ĐÓNG GÓI mới giới hạn (điểm 4 đã
  // chốt): thu hồi là hành động GIẢM rủi ro — chặn người phát hiện link lộ là hại hơn lợi.
  r.use("*", requireRole("ke_toan", "ke_toan_truong", "quan_tri"));

  r.post("/", requireRole("ke_toan_truong", "quan_tri"), async (c) => {
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

      const rows = await withTenant(db, tenantId, async (tx) => {
        const r = await tx
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
          .returning({ id: goiChiaSe.id });

        // Bước TẠO là chỗ người dùng CHỌN kéo hồ sơ gốc của khách hàng nào, kỳ nào — vừa là
        // "đồng bộ hóa đơn" vừa là "xuất dữ liệu", cả hai đều bắt buộc ghi audit theo
        // `.claude/rules/security.md`. Bản đầu chỉ ghi ở hai bước phát hành/thu hồi, nên gói
        // TẠO rồi bỏ đó (không phát hành) là không tra được qua `audit_log` — đúng kịch bản
        // cần điều tra nhất khi nghi lạm dụng. Phát hiện ở review bảo mật U37b.
        //
        // Ghi TRONG CÙNG giao dịch với việc chèn gói: tách ra thì có cảnh gói tạo xong mà vết
        // thì mất, và đó là chiều hỏng nguy hiểm.
        //
        // `chiTiet` KHÔNG chứa `khoa_r2` — cùng lý do như hai chỗ kia: audit log đọc được bởi
        // nhiều người trong tenant, mà khóa là mật khẩu của tệp công khai.
        await tx.insert(auditLog).values({
          tenantId,
          hanhDong: "tao_goi_chia_se",
          doiTuong: r[0]?.id,
          chiTiet: maskSensitive({ nmmst, tuNgay, denNgay, soHoaDon: hoaDons.length }),
        });

        return r;
      });
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

  /** Đường dẫn công khai của một gói. Tên miền khớp bucket đã gắn ở Gói 3. */
  const urlCongKhai = (goc: string | undefined, khoaR2: string) =>
    `${goc ?? "https://docs.tourdao.vn"}/${khoaR2}`;

  /** Nạp một gói của ĐÚNG tenant đang gọi. `null` ⇒ 404, không lộ cả sự tồn tại. */
  async function napGoi(db: AnyDb, tenantId: string, id: string) {
    const rows = await withTenant(db, tenantId, (tx) =>
      tx
        .select()
        .from(goiChiaSe)
        .where(and(eq(goiChiaSe.id, id), eq(goiChiaSe.tenantId, tenantId)))
        .limit(1),
    );
    return rows[0] ?? null;
  }

  // GET /goi-chia-se — danh sách gói đã phát, mới nhất trước. KHÔNG trả `khoa_r2`: khóa LÀ
  // mật khẩu của file, lộ ở danh sách là mất luôn hàng rào duy nhất.
  r.get("/", async (c) => {
    const tenantId = c.get("tenantId");
    const { db, close } = await deps.getDb(c.env);
    try {
      const rows = await withTenant(db, tenantId, (tx) =>
        tx
          .select()
          .from(goiChiaSe)
          .where(eq(goiChiaSe.tenantId, tenantId))
          .orderBy(desc(goiChiaSe.taoLuc))
          .limit(100),
      );
      return c.json({
        items: rows.map((g) => ({
          id: g.id,
          nmmst: g.nmmst,
          tuNgay: g.tuNgay,
          denNgay: g.denNgay,
          soHoaDon: g.soHoaDon,
          kichThuoc: g.kichThuoc,
          trangThai: g.trangThai,
          taoLuc: g.taoLuc,
          hetHanLuc: g.hetHanLuc,
          url: g.trangThai === "san_sang" ? urlCongKhai(c.env.URL_CHIA_SE, g.khoaR2) : null,
        })),
      });
    } finally {
      await close();
    }
  });

  // GET /goi-chia-se/:id — THUẦN ĐỌC: trạng thái + tiến độ. KHÔNG đóng gói ở đây; một GET
  // gây tác dụng phụ là bẫy (prefetch của trình duyệt/proxy sẽ kích hoạt ngoài ý muốn).
  r.get("/:id", async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id)) return c.json({ error: "bad_request" }, 400);
    const tenantId = c.get("tenantId");
    const { db, close } = await deps.getDb(c.env);
    try {
      const g = await napGoi(db, tenantId, id);
      if (!g) return c.json({ error: "not_found" }, 404);

      const tienDo = await withTenant(db, tenantId, async (tx) => {
        const hoaDons = await listHoaDonChoGoi(tx, tenantId, {
          nmmst: g.nmmst,
          tuNgay: g.tuNgay,
          denNgay: g.denNgay,
        });
        return demTienDoGoi(
          tx,
          tenantId,
          hoaDons.map((h) => h.hoaDonId),
        );
      });

      return c.json({
        id: g.id,
        trangThai: g.trangThai,
        soHoaDon: g.soHoaDon,
        tienDo,
        hetHanLuc: g.hetHanLuc,
        url: g.trangThai === "san_sang" ? urlCongKhai(c.env.URL_CHIA_SE, g.khoaR2) : null,
      });
    } finally {
      await close();
    }
  });

  // POST /goi-chia-se/:id/dong-goi — đóng ZIP và phát hành. Giới hạn vai như lúc tạo.
  r.post("/:id/dong-goi", requireRole("ke_toan_truong", "quan_tri"), async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id)) return c.json({ error: "bad_request" }, 400);
    const tenantId = c.get("tenantId");
    const { db, close } = await deps.getDb(c.env);
    try {
      const g = await napGoi(db, tenantId, id);
      if (!g) return c.json({ error: "not_found" }, 404);
      // Đã phát hành rồi ⇒ trả lại link cũ, không dựng lần hai (idempotent).
      if (g.trangThai === "san_sang") {
        return c.json({
          id: g.id,
          trangThai: g.trangThai,
          url: urlCongKhai(c.env.URL_CHIA_SE, g.khoaR2),
        });
      }
      if (g.trangThai !== "dang_tao") return c.json({ error: "trang_thai_khong_hop_le" }, 409);

      const chuanBi = await withTenant(db, tenantId, async (tx) => {
        const hoaDons = await listHoaDonChoGoi(tx, tenantId, {
          nmmst: g.nmmst,
          tuNgay: g.tuNgay,
          denNgay: g.denNgay,
        });
        const ids = hoaDons.map((h) => h.hoaDonId);
        const tienDo = await demTienDoGoi(tx, tenantId, ids);
        const kho = ids.length
          ? await tx
              .select()
              .from(tepHoaDonGoc)
              .where(and(eq(tepHoaDonGoc.tenantId, tenantId), inArray(tepHoaDonGoc.hoaDonId, ids)))
          : [];
        return { hoaDons, tienDo, kho };
      });

      const { hoaDons, tienDo, kho } = chuanBi;
      // Chưa tải xong ⇒ KHÔNG phát hành nửa vời. Người dùng chờ thêm rồi bấm lại.
      if (tienDo.conCho > 0) return c.json({ error: "chua_du", tienDo }, 409);

      // Không hóa đơn nào tải được ⇒ gói rỗng, KHÔNG phát link (yêu cầu gốc số 3).
      if (tienDo.xong === 0) {
        await withTenant(db, tenantId, (tx) =>
          tx
            .update(goiChiaSe)
            .set({ trangThai: "loi", maLoi: "khong_tai_duoc_hoa_don_nao" })
            .where(and(eq(goiChiaSe.id, id), eq(goiChiaSe.tenantId, tenantId))),
        );
        return c.json({ error: "khong_tai_duoc_hoa_don_nao", tienDo }, 409);
      }

      // BẦU NGƯỜI ĐÓNG GÓI: hai tab bấm cùng lúc đều thấy "đã đủ". UPDATE có điều kiện chỉ
      // cho MỘT request đi tiếp; kẻ thua trả về trạng thái hiện tại, không dựng lần hai.
      const bau = await withTenant(db, tenantId, (tx) =>
        tx
          .update(goiChiaSe)
          .set({ trangThai: "dang_dong_goi" })
          .where(
            and(
              eq(goiChiaSe.id, id),
              eq(goiChiaSe.tenantId, tenantId),
              eq(goiChiaSe.trangThai, "dang_tao"),
            ),
          )
          .returning({ id: goiChiaSe.id }),
      );
      if (bau.length === 0) return c.json({ error: "dang_dong_goi" }, 409);

      const theoId = new Map(kho.map((k) => [k.hoaDonId, k]));
      const coTrongGoi: TepHoaDon[] = [];
      const thieu: HoaDonThieu[] = [];

      for (const h of hoaDons) {
        const k = theoId.get(h.hoaDonId);
        if (!k || k.trangThai !== "da_tai" || !k.khoaXml || !k.khoaHtml) {
          thieu.push({
            khhdon: h.khhdon,
            shdon: h.shdon,
            lyDo:
              k?.trangThai === "khong_co_ho_so_goc"
                ? "Cơ quan thuế không có hồ sơ gốc của hóa đơn này"
                : `Tải thất bại (${k?.maLoi ?? "khong_ro"})`,
          });
          continue;
        }
        const xml = await c.env.RAW.get(k.khoaXml);
        const html = await c.env.RAW.get(k.khoaHtml);
        if (!xml || !html) {
          // Sổ nói đã tải nhưng tệp không có trong kho — nói ra, đừng lặng lẽ bỏ sót.
          thieu.push({ khhdon: h.khhdon, shdon: h.shdon, lyDo: "Không tìm thấy tệp trong kho" });
          continue;
        }
        coTrongGoi.push({
          hoaDonId: h.hoaDonId,
          nbmst: h.nbmst,
          khhdon: h.khhdon,
          shdon: h.shdon,
          xml: new Uint8Array(await xml.arrayBuffer()),
          html: new Uint8Array(await html.arrayBuffer()),
        });
      }

      // Một bộ tệp tĩnh dùng chung — thiếu thì bản thể hiện xấu đi chứ không hỏng.
      const taiNguyenChung: Record<string, Uint8Array> = {};
      for (const ten of TEP_TINH_DUNG_CHUNG) {
        const o = await c.env.RAW.get(KHOA_TAI_NGUYEN_CHUNG[ten] as string);
        if (o) taiNguyenChung[ten] = new Uint8Array(await o.arrayBuffer());
      }

      const goi = dungGoiZip(
        {
          nmten: hoaDons.find((h) => h.nmten)?.nmten ?? "",
          nmmst: g.nmmst,
          tuNgay: g.tuNgay,
          denNgay: g.denNgay,
        },
        coTrongGoi,
        thieu,
        taiNguyenChung,
      );

      await c.env.CHIA_SE.put(g.khoaR2, goi.bytes, {
        httpMetadata: {
          contentType: "application/zip",
          contentDisposition: `attachment; filename="${goi.tenTepTaiVe}"`,
          // BẮT BUỘC — thiếu dòng này thì nút "Thu hồi" hứa sai.
          //
          // `docs.tourdao.vn` là custom domain của R2 ⇒ phản hồi đi qua CDN Cloudflare.
          // Probe THẬT trên bucket production 2026-07-29:
          //   không đặt cache-control → `max-age=14400`; GET lần 2 `HIT`; DELETE khỏi R2
          //   → GET VẪN trả `200` + `cf-cache-status: HIT` + nguyên nội dung, tới 4 GIỜ.
          //   đặt `no-store` → `cf-cache-status: BYPASS`; DELETE → GET `404` ngay lập tức.
          //
          // Xóa object KHÔNG vô hiệu hóa bản đã nằm ở biên. Đây là lý do lớp CDN phải
          // được tính vào mô hình thu hồi, dù nó không xuất hiện trong mã.
          cacheControl: "no-store",
        },
      });

      // `het_han_luc` đặt Ở ĐÂY chứ không phải lúc tạo (điểm 2 đã chốt): lifecycle của R2
      // đếm từ lúc GHI OBJECT, nên đặt lúc tạo thì sổ lệch với vòng đời thật của tệp.
      const hetHanLuc = new Date(Date.now() + SO_NGAY_SONG * 86_400_000);
      await withTenant(db, tenantId, async (tx) => {
        await tx
          .update(goiChiaSe)
          .set({
            trangThai: "san_sang",
            kichThuoc: goi.bytes.length,
            hetHanLuc,
            soHoaDon: goi.soTepTrongGoi,
          })
          .where(and(eq(goiChiaSe.id, id), eq(goiChiaSe.tenantId, tenantId)));
        // chiTiet KHÔNG chứa `khoa_r2`: audit log đọc được bởi nhiều người trong tenant,
        // mà khóa là mật khẩu của tệp công khai.
        await tx.insert(auditLog).values({
          tenantId,
          hanhDong: "phat_hanh_goi_chia_se",
          doiTuong: id,
          chiTiet: maskSensitive({
            nmmst: g.nmmst,
            tuNgay: g.tuNgay,
            denNgay: g.denNgay,
            soHoaDon: goi.soTepTrongGoi,
            soThieu: thieu.length,
          }),
        });
      });

      return c.json({
        id,
        trangThai: "san_sang",
        soHoaDon: goi.soTepTrongGoi,
        soThieu: thieu.length,
        hetHanLuc,
        url: urlCongKhai(c.env.URL_CHIA_SE, g.khoaR2),
      });
    } finally {
      await close();
    }
  });

  // POST /goi-chia-se/:id/thu-hoi — MỌI VAI (điểm 4). Xóa tệp TRƯỚC, đổi trạng thái SAU:
  // ngược lại thì sổ nói đã thu hồi trong khi tệp vẫn tải được — sai theo hướng nguy hiểm.
  r.post("/:id/thu-hoi", async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id)) return c.json({ error: "bad_request" }, 400);
    const tenantId = c.get("tenantId");
    const { db, close } = await deps.getDb(c.env);
    try {
      const g = await napGoi(db, tenantId, id);
      if (!g) return c.json({ error: "not_found" }, 404);
      // Thu hồi lần hai vẫn 200: người dùng hoảng bấm nhiều lần không được nhận lỗi.
      if (g.trangThai === "da_thu_hoi") return c.json({ id, trangThai: g.trangThai });

      await c.env.CHIA_SE.delete(g.khoaR2);
      await withTenant(db, tenantId, async (tx) => {
        await tx
          .update(goiChiaSe)
          .set({ trangThai: "da_thu_hoi" })
          .where(and(eq(goiChiaSe.id, id), eq(goiChiaSe.tenantId, tenantId)));
        await tx.insert(auditLog).values({
          tenantId,
          hanhDong: "thu_hoi_goi_chia_se",
          doiTuong: id,
          chiTiet: maskSensitive({ nmmst: g.nmmst, tuNgay: g.tuNgay, denNgay: g.denNgay }),
        });
      });

      return c.json({ id, trangThai: "da_thu_hoi" });
    } finally {
      await close();
    }
  });

  return r;
}

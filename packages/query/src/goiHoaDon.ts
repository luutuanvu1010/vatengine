// U37b Gói 4a — tầng truy vấn cho việc phát hành gói hóa đơn gốc cho MỘT khách hàng.
//
// Chỉ ĐỌC dữ liệu đã đồng bộ (KHÔNG gọi GDT). Mọi truy vấn lọc `tenant_id` tường minh
// (lớp 1) và chạy trong `withTenant` ở tầng gọi (RLS lớp 2).
import { hoaDon, tepHoaDonGoc } from "@vat/db";
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { TablesRelationalConfig } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

type AnyTx = PgDatabase<PgQueryResultHKT, Record<string, unknown>, TablesRelationalConfig>;

/** Một hóa đơn trong gói, kèm ĐỦ dữ kiện để dựng `HoSoGocMessage.ref`. */
export interface HoaDonChoGoi {
  hoaDonId: string;
  nbmst: string;
  khhdon: string;
  khmshdon: string;
  shdon: string;
  /** Chọn họ endpoint GDT: `normal` → /api/query/…, `sco` → /api/sco-query/… */
  source: "normal" | "sco";
}

export interface PhamViGoi {
  /** MST khách hàng — QĐ-B2: mỗi gói đúng MỘT khách hàng. */
  nmmst: string;
  /** `YYYY-MM-DD`, lịch VN. QĐ-B9: tầng gọi phải CHẶN khi thiếu, không mặc định "tất cả". */
  tuNgay: string;
  denNgay: string;
}

/**
 * Liệt kê hóa đơn thuộc gói.
 *
 * 🔴 ĐÂY LÀ CHỖ RÀNG BUỘC BẢO MẬT NẰM. `runHoSoGocJob` (U37a) tin thẳng `msg.ref` và
 * KHÔNG tra lại `hoa_don` theo tenant — phát hiện ở review bảo mật U37a. Vì vậy `ref`
 * BẮT BUỘC dựng từ hàng đã lọc `tenant_id`, tức từ chính hàm này, và TUYỆT ĐỐI không
 * nhận `ref` do client gửi lên. Một hàng lọt của tenant khác = tải hồ sơ gốc của họ.
 *
 * Chỉ chiều BÁN RA (QĐ-B1). Khoảng ngày bao gồm cả hai đầu mút.
 */
export async function listHoaDonChoGoi(
  tx: AnyTx,
  tenantId: string,
  phamVi: PhamViGoi,
): Promise<HoaDonChoGoi[]> {
  const rows = await tx
    .select({
      hoaDonId: hoaDon.id,
      nbmst: hoaDon.nbmst,
      khhdon: hoaDon.khhdon,
      khmshdon: hoaDon.khmshdon,
      shdon: hoaDon.shdon,
      nguon: hoaDon.nguon,
    })
    .from(hoaDon)
    .where(
      and(
        eq(hoaDon.tenantId, tenantId),
        eq(hoaDon.chieu, "sold"),
        eq(hoaDon.nmmst, phamVi.nmmst),
        // `tdlap` là timestamptz; so với mốc ngày để lấy trọn cả ngày cuối.
        gte(hoaDon.tdlap, sql`${phamVi.tuNgay}::date`),
        lte(
          hoaDon.tdlap,
          sql`${phamVi.denNgay}::date + interval '1 day' - interval '1 microsecond'`,
        ),
      ),
    )
    .orderBy(asc(hoaDon.tdlap), asc(hoaDon.id));

  return rows.map((r) => ({
    hoaDonId: r.hoaDonId,
    nbmst: r.nbmst,
    khhdon: r.khhdon,
    khmshdon: r.khmshdon,
    shdon: r.shdon,
    source: r.nguon === "sco" ? "sco" : "normal",
  }));
}

/** Tiến độ tải hồ sơ gốc của một gói. */
export interface TienDoGoi {
  tong: number;
  /** Đã tải xong, có file trong kho. */
  xong: number;
  /** GDT KHÔNG có bản gốc — kết quả HỢP LỆ, không phải sự cố (~19,9% nhóm purchase/normal). */
  khongCoHoSoGoc: number;
  loi: number;
  /** Chưa có bản ghi nào trong kho ⇒ job chưa chạy tới. */
  conCho: number;
}

/**
 * Đếm tiến độ từ `tep_hoa_don_goc` (QĐ-B8) — KHÔNG thêm cột đếm ở `goi_chia_se`, để
 * không tạo nguồn sự thật thứ hai cho cùng một con số.
 *
 * Hóa đơn chưa có hàng nào trong kho được tính là **còn chờ** — kể cả khi id đó thuộc
 * tenant khác (RLS chặn đọc), nên hàm không bao giờ rò trạng thái chéo tenant.
 */
export async function demTienDoGoi(
  tx: AnyTx,
  tenantId: string,
  hoaDonIds: string[],
): Promise<TienDoGoi> {
  const tong = hoaDonIds.length;
  // `inArray` với mảng rỗng sinh SQL `in ()` — Postgres báo lỗi cú pháp. Chặn từ đầu.
  if (tong === 0) return { tong: 0, xong: 0, khongCoHoSoGoc: 0, loi: 0, conCho: 0 };

  const rows = await tx
    .select({ trangThai: tepHoaDonGoc.trangThai, soLuong: sql<number>`count(*)::int` })
    .from(tepHoaDonGoc)
    .where(and(eq(tepHoaDonGoc.tenantId, tenantId), inArray(tepHoaDonGoc.hoaDonId, hoaDonIds)))
    .groupBy(tepHoaDonGoc.trangThai);

  const dem = (tt: string) => rows.find((r) => r.trangThai === tt)?.soLuong ?? 0;
  const xong = dem("da_tai");
  const khongCoHoSoGoc = dem("khong_co_ho_so_goc");
  const loi = dem("loi");

  return {
    tong,
    xong,
    khongCoHoSoGoc,
    loi,
    conCho: tong - xong - khongCoHoSoGoc - loi,
  };
}

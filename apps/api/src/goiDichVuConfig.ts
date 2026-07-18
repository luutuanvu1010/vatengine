// U17a (QĐ-5 hạng A) — Đọc hạn mức theo GÓI DỊCH VỤ, thay hardcode. Admin sửa hàng
// goi_dich_vu ở U18 là áp cho toàn bộ tenant dùng gói đó, không cần deploy.
//
// FAIL-SAFE-TO-DEFAULT: DB hỏng / gói không tồn tại → rơi về hằng trong mã. KHÔNG
// fail-open (mở toang hạn mức cho khách chưa trả tiền) và KHÔNG fail-closed (khóa sạch
// khách vì sự cố DB của mình). Mọi lần rơi về mặc định đều phát log có cấu trúc để phân
// biệt "admin đặt vậy" với "DB hỏng".
import { maskSensitive } from "@vat/crypto";
import { goiDichVu } from "@vat/db";
import { eq } from "drizzle-orm";
import { clampInt } from "./configClamp";
import type { AnyDb } from "./types";

export interface HanMucGoi {
  soMstToiDa: number;
  soHoaDonThang: number | null;
  choTaiKhoanCon: boolean;
  ghInvoicesMoiPhut: number;
  ghExportsMoiPhut: number;
  ghReconcileMoiPhut: number;
}

/** Mặc định bảo thủ = đúng gói `free`. Dùng khi không đọc được DB. */
export const HAN_MUC_MAC_DINH: HanMucGoi = {
  soMstToiDa: 1,
  soHoaDonThang: null,
  choTaiKhoanCon: false,
  ghInvoicesMoiPhut: 120,
  ghExportsMoiPhut: 20,
  ghReconcileMoiPhut: 20,
};

// Biên cứng cho giá trị đến từ DB. CHƯA KIỂM CHỨNG bằng số thật của tenant production —
// đặt rộng rãi, chỉ để chặn giá trị phi lý (0 khóa sạch khách; 9 chữ số vô hiệu hóa
// chống lạm dụng). Siết lại sau khi đo (U17-plan §3.6).
const BIEN = {
  soMstToiDa: { min: 1, max: 1_000 },
  ghMoiPhut: { min: 1, max: 10_000 },
} as const;

export async function docHanMucGoi(db: AnyDb, maGoi: string): Promise<HanMucGoi> {
  try {
    const rows = await db
      .select({
        soMstToiDa: goiDichVu.soMstToiDa,
        soHoaDonThang: goiDichVu.soHoaDonThang,
        choTaiKhoanCon: goiDichVu.choTaiKhoanCon,
        ghInvoicesMoiPhut: goiDichVu.ghInvoicesMoiPhut,
        ghExportsMoiPhut: goiDichVu.ghExportsMoiPhut,
        ghReconcileMoiPhut: goiDichVu.ghReconcileMoiPhut,
      })
      .from(goiDichVu)
      .where(eq(goiDichVu.ma, maGoi));

    const row = rows[0];
    if (!row) {
      console.warn(JSON.stringify({ type: "goi_dich_vu_khong_thay", ma: maGoi }));
      return HAN_MUC_MAC_DINH;
    }

    return {
      soMstToiDa: clampInt(
        row.soMstToiDa,
        BIEN.soMstToiDa.min,
        BIEN.soMstToiDa.max,
        HAN_MUC_MAC_DINH.soMstToiDa,
      ),
      // NULL = không giới hạn — giữ nguyên, không kẹp.
      soHoaDonThang: row.soHoaDonThang,
      choTaiKhoanCon: row.choTaiKhoanCon,
      ghInvoicesMoiPhut: clampInt(
        row.ghInvoicesMoiPhut,
        BIEN.ghMoiPhut.min,
        BIEN.ghMoiPhut.max,
        HAN_MUC_MAC_DINH.ghInvoicesMoiPhut,
      ),
      ghExportsMoiPhut: clampInt(
        row.ghExportsMoiPhut,
        BIEN.ghMoiPhut.min,
        BIEN.ghMoiPhut.max,
        HAN_MUC_MAC_DINH.ghExportsMoiPhut,
      ),
      ghReconcileMoiPhut: clampInt(
        row.ghReconcileMoiPhut,
        BIEN.ghMoiPhut.min,
        BIEN.ghMoiPhut.max,
        HAN_MUC_MAC_DINH.ghReconcileMoiPhut,
      ),
    };
  } catch (err) {
    // DB hỏng KHÔNG được làm hỏng luồng khách — vẫn dùng mặc định. NHƯNG review Task 5,
    // việc 1: bắt lỗi rỗng (không tham số) nuốt sạch chi tiết, khiến một bug thật (sai
    // tên cột sau refactor, lỗi kiểu…) trông y hệt "DB hỏng" — không còn dấu vết để điều
    // tra. Log kèm name+message (quy ước app.ts) để phân biệt được hai loại sự cố. Bảng
    // goi_dich_vu chỉ chứa định nghĩa gói toàn cục, KHÔNG dữ liệu tenant → an toàn log
    // message; vẫn qua maskSensitive để nhất quán phòng thủ (JWT/conn-string lỡ lọt vào
    // chuỗi lỗi tự do).
    const loi =
      err instanceof Error ? { name: err.name, message: err.message } : { message: String(err) };
    console.warn(
      JSON.stringify({ type: "goi_dich_vu_doc_loi", ma: maGoi, loi: maskSensitive(loi) }),
    );
    return HAN_MUC_MAC_DINH;
  }
}

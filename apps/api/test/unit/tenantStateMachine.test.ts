// U18 — Máy trạng thái vòng đời tenant. Logic THUẦN, không I/O: đây là nơi duy nhất định
// nghĩa "chuyển nào hợp lệ", để route và hàm SQL cùng bám một nguồn.
//
// VÌ SAO PHỦ TOÀN BỘ 16 Ô (4 hành động × 4 trạng thái) THAY VÌ VÀI CA MẪU: cái nguy hiểm ở
// đây không phải chuyển hợp lệ bị chặn (lộ ra ngay khi dùng), mà chuyển KHÔNG hợp lệ lọt
// qua — vd `tu_choi` → `active` sẽ hồi sinh một tenant chủ dự án đã chối từ, hoặc
// `cho_duyet` → `khoa` tạo ra tenant chưa từng được duyệt mà đã ở trạng thái "bị khoá",
// một nhánh không có đường ra. Ca mẫu không bắt được lớp này; bảng đầy đủ thì có.
import { describe, expect, it } from "vitest";
import {
  HANH_DONG_ADMIN,
  type HanhDongAdmin,
  TRANG_THAI_TENANT,
  type TrangThaiTenant,
  chuyenTrangThai,
  chuyenTuHanhDong,
} from "../../src/admin/tenantStateMachine";

// Bảng chân lý ĐẦY ĐỦ — nguồn đối chiếu độc lập với hiện thực (viết tay từ sơ đồ trong
// docs/plans/U18-plan.md §5, KHÔNG sinh ra từ chính code đang kiểm).
//
//   cho_duyet ──duyet──▶ active ──khoa──▶ khoa ──mo_khoa──▶ active
//       └────tu_choi───▶ tu_choi
//
// null = chuyển không hợp lệ (route phải trả 409).
const BANG: Record<HanhDongAdmin, Record<TrangThaiTenant, TrangThaiTenant | null>> = {
  duyet: { cho_duyet: "active", active: null, khoa: null, tu_choi: null },
  tu_choi: { cho_duyet: "tu_choi", active: null, khoa: null, tu_choi: null },
  khoa: { cho_duyet: null, active: "khoa", khoa: null, tu_choi: null },
  mo_khoa: { cho_duyet: null, active: null, khoa: "active", tu_choi: null },
};

describe("chuyenTrangThai — máy trạng thái vòng đời tenant (U18)", () => {
  for (const hanhDong of HANH_DONG_ADMIN) {
    for (const tu of TRANG_THAI_TENANT) {
      const den = BANG[hanhDong][tu];
      const nhan = den === null ? "TỪ CHỐI" : `→ ${den}`;
      it(`${hanhDong} từ '${tu}' ${nhan}`, () => {
        expect(chuyenTrangThai(tu, hanhDong)).toBe(den);
      });
    }
  }

  it("đúng 4 chuyển hợp lệ trong toàn bộ 16 ô — không nhiều hơn", () => {
    const hopLe = HANH_DONG_ADMIN.flatMap((h) =>
      TRANG_THAI_TENANT.map((t) => chuyenTrangThai(t, h)).filter((x) => x !== null),
    );
    expect(hopLe).toHaveLength(4);
  });

  it("'tu_choi' là trạng thái CUỐI — không hành động nào đưa nó đi tiếp", () => {
    // Ràng buộc nghiệp vụ, không phải chi tiết hiện thực: tenant đã bị chối từ không được
    // hồi sinh bằng một cú bấm nhầm trong Cổng Admin. Muốn nhận lại thì đăng ký lại.
    for (const hanhDong of HANH_DONG_ADMIN) {
      expect(chuyenTrangThai("tu_choi", hanhDong)).toBeNull();
    }
  });

  it("không trạng thái nào tự chuyển về chính nó (thao tác lặp phải là 409, không phải no-op im lặng)", () => {
    for (const hanhDong of HANH_DONG_ADMIN) {
      for (const tu of TRANG_THAI_TENANT) {
        expect(chuyenTrangThai(tu, hanhDong)).not.toBe(tu);
      }
    }
  });

  it("chuyenTuHanhDong suy đúng cặp (nguồn, đích) — nền của UPDATE nguyên tử ở route", () => {
    expect(chuyenTuHanhDong("duyet")).toEqual({ tu: "cho_duyet", den: "active" });
    expect(chuyenTuHanhDong("tu_choi")).toEqual({ tu: "cho_duyet", den: "tu_choi" });
    expect(chuyenTuHanhDong("khoa")).toEqual({ tu: "active", den: "khoa" });
    expect(chuyenTuHanhDong("mo_khoa")).toEqual({ tu: "khoa", den: "active" });
  });

  it("chuyenTuHanhDong khớp ĐÚNG bảng chân lý — không có nguồn hợp lệ thứ hai nào bị bỏ sót", () => {
    // Nếu ai đó thêm một ô hợp lệ nữa cho cùng một hành động (vd cho phép duyệt lại từ
    // 'tu_choi'), `chuyenTuHanhDong` sẽ âm thầm chỉ thấy ô ĐẦU TIÊN và route sẽ mất một
    // đường chuyển mà không ai biết. Test này bắt đúng ca đó.
    for (const hanhDong of HANH_DONG_ADMIN) {
      const nguonHopLe = TRANG_THAI_TENANT.filter((t) => chuyenTrangThai(t, hanhDong) !== null);
      expect({ hanhDong, soNguon: nguonHopLe.length }).toEqual({ hanhDong, soNguon: 1 });
      expect(chuyenTuHanhDong(hanhDong).tu).toBe(nguonHopLe[0]);
    }
  });

  it("trạng thái lạ trong DB (dữ liệu cũ/hỏng) → TỪ CHỐI, không ném", () => {
    // Cột `tenants.trang_thai` là text KHÔNG có CHECK (đối chiếu schema thật — xem
    // U18-plan-thuc-thi.md D4), nên một giá trị ngoài tập hợp là chuyện có thể xảy ra.
    // Fail-closed: từ chối, không cho hành động admin chạy trên trạng thái không hiểu được.
    expect(chuyenTrangThai("trang_thai_la" as TrangThaiTenant, "duyet")).toBeNull();
  });
});

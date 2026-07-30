// Bộ lọc chuẩn (dùng chung mọi màn danh sách/summary/đối chiếu). B4: KHÔNG ô tìm tự do
// "tên đối tác/số HĐ" (backend không hỗ trợ) — chỉ các trường filters.ts chấp nhận:
// chiều/nguồn/khoảng ngày/MST bán/MST mua.
//
// U-K3: kỳ chọn qua pattern `ChonKy` (Tháng/Quý/Năm dạng dropdown, chọn kỳ bất kỳ kể cả quá
// khứ); ô nhập/chọn dùng primitive `Select`/`Field` — KHÔNG tô kiểu nội tuyến (phép kiểm
// convention `test/conventions/ui-luat.test.ts` chặn `style=` trên input/select trong
// features/). Lựa chọn chiều/nguồn lấy từ Registry miền hoá đơn (một nguồn, không khai lại).
import { INVOICE_FIELDS } from "@vat/domain";
import type { ReactNode } from "react";
import { useState } from "react";
import { Button, DateField, Field, SegmentedControl, Select } from "../../components/ui/primitives";
import type { DateRange } from "../../lib/period";
import type { Chieu, InvoiceFilter, Nguon } from "../../types/api";
import { ChonKhachHang } from "./ChonKhachHang";
import { ChonKy } from "./ChonKy";

/** Lựa chọn enum của một trường trong Registry (chiều/nguồn) — một nguồn, không gõ lại. */
function luaChon(key: string): ReadonlyArray<readonly [string, string]> {
  return INVOICE_FIELDS.find((f) => f.key === key)?.enum ?? [];
}

export function FilterBar({
  value,
  onApply,
  hanhDongPhu,
}: {
  value: InvoiceFilter;
  onApply: (next: InvoiceFilter) => void;
  /** Task 12 — hành động liền sau "Lọc dữ liệu" trong CÙNG thẻ (vd nút "Đồng bộ từ Thuế" +
   * InfoTip). Cho phép InvoicesPage gộp lọc + đồng bộ vào một thẻ mà không FilterBar phải
   * biết gì về đồng bộ (giữ tách bạch trách nhiệm — chỉ nhận ReactNode để render). */
  hanhDongPhu?: ReactNode;
}) {
  // Chiều mặc định = Mua vào (bỏ "Tất cả chiều"): filter luôn có chiều để nút segmented đúng
  // và ô MST liên quan hiển thị đúng ngay từ đầu (chủ dự án 2026-07-23).
  const [draft, setDraft] = useState<InvoiceFilter>(() => ({
    ...value,
    chieu: value.chieu ?? "purchase",
  }));
  const set = (patch: Partial<InvoiceFilter>) => setDraft((d) => ({ ...d, ...patch }));

  // Thống nhất hợp đồng tương tác (ui.md "Hợp đồng tương tác nhất quán" + CHUAN §D5): MỌI
  // thay đổi — KỂ CẢ chọn kỳ — chỉ cập nhật BẢN NHÁP; bấm "Lọc dữ liệu" mới áp. Hết cảnh
  // "nút kỳ áp tức thì còn ô khác thì chờ" (anti-pattern chuẩn cấm). ChonKy chỉ điền
  // tuNgay/denNgay vào nháp, không tự fetch.
  const capNhatKyNhap = (r: DateRange) => setDraft((d) => ({ ...d, ...r }));

  // B1 (U27) — CHIỀU quyết định ô MST nào liên quan: mua vào chỉ lọc theo người bán,
  // bán ra chỉ lọc theo người mua. Ẩn ô còn lại VÀ dọn giá trị của nó để không lọc
  // ngầm bằng trường đã ẩn.
  const setChieu = (raw: string) => {
    const chieu = (raw || undefined) as Chieu | undefined;
    setDraft((d) => ({
      ...d,
      chieu,
      nmmst: chieu === "purchase" ? undefined : d.nmmst,
      nbmst: chieu === "sold" ? undefined : d.nbmst,
    }));
  };
  const showNbmst = draft.chieu !== "sold";
  const showNmmst = draft.chieu !== "purchase";

  return (
    <div style={{ display: "grid", gap: "var(--sp-4)" }}>
      <ChonKy onChon={capNhatKyNhap} />

      {/* Hairline ngăn nhóm "kỳ nhanh" với nhóm "khoảng ngày + lọc" — tách nhẹ, không kẻ nặng. */}
      <div style={{ borderTop: "1px solid var(--border-subtle)" }} />

      {/* Hàng lọc chi tiết: HAI nhóm con trong cùng container flex-wrap (gap --sp-4) — nhóm
          "khoảng ngày" và nhóm "điều kiện" — để mỗi nhóm giữ khối riêng và tự xuống hàng gọn
          (mỗi ô có min-width qua `co`). ChonKy điền tuNgay/denNgay vào bản nháp; TẤT CẢ chỉ áp
          khi bấm "Lọc dữ liệu" — hợp đồng tương tác nhất quán (ui.md/CHUAN §D5). */}
      <div style={{ display: "flex", gap: "var(--sp-4)", flexWrap: "wrap", alignItems: "end" }}>
        {/* Nhóm khoảng ngày */}
        <div style={{ display: "flex", gap: "var(--sp-4)", flexWrap: "wrap", alignItems: "end" }}>
          {/* 2026-07-30: DateField (dd/mm/yyyy đồng nhất mọi thiết bị) thay input type="date"
              gốc — cái sau hiển thị theo locale hệ điều hành nên mỗi máy một kiểu 01/07 vs
              07/01, và trên trình duyệt không hỗ trợ đẩy chuỗi dd/mm/yyyy thô lên API → 400.
              Giá trị trong nháp/bộ lọc vẫn là ISO YYYY-MM-DD (hợp đồng filters.ts). */}
          <DateField
            label="Từ ngày"
            co="md"
            value={draft.tuNgay}
            onChangeIso={(iso) => set({ tuNgay: iso })}
          />
          <DateField
            label="Đến ngày"
            co="md"
            value={draft.denNgay}
            onChangeIso={(iso) => set({ denNgay: iso })}
          />
        </div>

        {/* Nhóm điều kiện */}
        <div style={{ display: "flex", gap: "var(--sp-4)", flexWrap: "wrap", alignItems: "end" }}>
          {/* Chiều: segmented Mua vào/Bán ra (bỏ "Tất cả" — mặc định Mua vào, vẫn chuyển được).
              Nhãn lấy từ Registry (một nguồn). Chỉ cập nhật nháp; áp khi bấm "Lọc dữ liệu". */}
          <span style={{ display: "flex", flexDirection: "column", gap: "var(--sp-1)" }}>
            <span
              style={{
                fontSize: "var(--fs-sm)",
                fontWeight: "var(--fw-semibold)",
                color: "var(--text-secondary)",
              }}
            >
              Chiều
            </span>
            <SegmentedControl<Chieu>
              ariaLabel="Chiều"
              value={(draft.chieu ?? "purchase") as Chieu}
              onChange={(v) => setChieu(v)}
              options={luaChon("chieu").map(([v, nhan]) => ({ value: v as Chieu, label: nhan }))}
            />
          </span>
          <Select
            label="Nguồn"
            co="md"
            value={draft.nguon ?? ""}
            onChange={(e) => set({ nguon: (e.target.value || undefined) as Nguon | undefined })}
          >
            <option value="">Mọi nguồn</option>
            {luaChon("nguon").map(([v, nhan]) => (
              <option key={v} value={v}>
                {nhan}
              </option>
            ))}
          </Select>
          {showNbmst ? (
            <Field
              label="Mã số thuế người bán"
              hideLabel
              co="lg"
              placeholder="Mã số thuế người bán"
              value={draft.nbmst ?? ""}
              onChange={(e) => set({ nbmst: e.target.value || undefined })}
            />
          ) : null}
          {/* U37b — chiều BÁN RA: chọn khách hàng bằng ô TÌM LIVE thay vì gõ MST thô. Người
              dùng nhớ TÊN khách chứ không nhớ MST, nhưng thứ ràng vào bộ lọc vẫn là MST
              (khớp chính xác ở `filters.ts`). Xem docs/plans/U37b-plan.md §4 Gói 1. */}
          {showNmmst ? (
            <ChonKhachHang nmmst={draft.nmmst} onChange={(k) => set({ nmmst: k?.nmmst })} />
          ) : null}
        </div>

        {/* U-K4 — "Lọc dữ liệu" (đọc nhẹ): đứng LIỀN SAU nhóm điều kiện (theo dòng chảy, đúng
            mockup) — KHÔNG đẩy ra sát mép để khỏi lẻ loi. Variant secondary để khác trọng số
            với "Đồng bộ từ Thuế" (primary, truyền qua `hanhDongPhu` — Task 12). */}
        <Button variant="secondary" onClick={() => onApply(draft)}>
          Lọc dữ liệu
        </Button>
        {hanhDongPhu}
      </div>
    </div>
  );
}

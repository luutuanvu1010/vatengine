// Bộ lọc chuẩn (dùng chung mọi màn danh sách/summary/đối chiếu). B4: KHÔNG ô tìm tự do
// "tên đối tác/số HĐ" (backend không hỗ trợ) — chỉ các trường filters.ts chấp nhận:
// chiều/nguồn/khoảng ngày/MST bán/MST mua.
//
// U-K3: kỳ chọn qua pattern `ChonKy` (Tháng/Quý/Năm dạng dropdown, chọn kỳ bất kỳ kể cả quá
// khứ); ô nhập/chọn dùng primitive `Select`/`Field` — KHÔNG tô kiểu nội tuyến (phép kiểm
// convention `test/conventions/ui-luat.test.ts` chặn `style=` trên input/select trong
// features/). Lựa chọn chiều/nguồn lấy từ Registry miền hoá đơn (một nguồn, không khai lại).
import { INVOICE_FIELDS } from "@vat/domain";
import { useState } from "react";
import { Button, Field, Select } from "../../components/ui/primitives";
import type { DateRange } from "../../lib/period";
import type { Chieu, InvoiceFilter, Nguon } from "../../types/api";
import { ChonKy } from "./ChonKy";

/** Lựa chọn enum của một trường trong Registry (chiều/nguồn) — một nguồn, không gõ lại. */
function luaChon(key: string): ReadonlyArray<readonly [string, string]> {
  return INVOICE_FIELDS.find((f) => f.key === key)?.enum ?? [];
}

export function FilterBar({
  value,
  onApply,
}: {
  value: InvoiceFilter;
  onApply: (next: InvoiceFilter) => void;
}) {
  const [draft, setDraft] = useState<InvoiceFilter>(value);
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
          <Field
            label="Từ ngày"
            type="date"
            co="md"
            value={draft.tuNgay ?? ""}
            onChange={(e) => set({ tuNgay: e.target.value || undefined })}
          />
          <Field
            label="Đến ngày"
            type="date"
            co="md"
            value={draft.denNgay ?? ""}
            onChange={(e) => set({ denNgay: e.target.value || undefined })}
          />
        </div>

        {/* Nhóm điều kiện */}
        <div style={{ display: "flex", gap: "var(--sp-4)", flexWrap: "wrap", alignItems: "end" }}>
          <Select
            label="Chiều"
            co="md"
            value={draft.chieu ?? ""}
            onChange={(e) => setChieu(e.target.value)}
          >
            <option value="">Tất cả chiều</option>
            {luaChon("chieu").map(([v, nhan]) => (
              <option key={v} value={v}>
                {nhan}
              </option>
            ))}
          </Select>
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
              label="MST người bán"
              hideLabel
              co="lg"
              placeholder="MST người bán"
              value={draft.nbmst ?? ""}
              onChange={(e) => set({ nbmst: e.target.value || undefined })}
            />
          ) : null}
          {showNmmst ? (
            <Field
              label="MST người mua"
              hideLabel
              co="lg"
              placeholder="MST người mua"
              value={draft.nmmst ?? ""}
              onChange={(e) => set({ nmmst: e.target.value || undefined })}
            />
          ) : null}
        </div>

        {/* U-K4 — "Lọc dữ liệu" (đọc nhẹ): đứng LIỀN SAU nhóm điều kiện (theo dòng chảy, đúng
            mockup) — KHÔNG đẩy ra sát mép để khỏi lẻ loi. Lời gọi Button mặc định (variant +
            onClick), secondary để khác trọng số với "Đồng bộ và tải xuống" (primary). */}
        <Button variant="secondary" onClick={() => onApply(draft)}>
          Lọc dữ liệu
        </Button>
      </div>
    </div>
  );
}

// Bộ lọc chuẩn (dùng chung mọi màn danh sách/summary/đối chiếu). B4: KHÔNG ô tìm tự do
// "tên đối tác/số HĐ" (backend không hỗ trợ) — chỉ các trường filters.ts chấp nhận:
// chiều/nguồn/khoảng ngày/MST bán/MST mua. Nút kỳ nhanh Tháng/Quý/Năm → tuNgay/denNgay.
import { useState } from "react";
import { Button } from "../../components/ui/primitives";
import { monthRange, quarterRange, yearRange } from "../../lib/period";
import type { Chieu, InvoiceFilter, Nguon } from "../../types/api";

const selectStyle: React.CSSProperties = {
  padding: "var(--sp-2) var(--sp-3)",
  fontSize: "var(--fs-sm)",
  fontFamily: "inherit",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-card)",
};
const inputStyle: React.CSSProperties = { ...selectStyle };

export function FilterBar({
  value,
  onApply,
}: {
  value: InvoiceFilter;
  onApply: (next: InvoiceFilter) => void;
}) {
  const [draft, setDraft] = useState<InvoiceFilter>(value);
  const set = (patch: Partial<InvoiceFilter>) => setDraft((d) => ({ ...d, ...patch }));
  const applyPeriod = (r: { tuNgay: string; denNgay: string }) => {
    const next = { ...draft, ...r };
    setDraft(next);
    onApply(next);
  };

  return (
    <div style={{ display: "grid", gap: "var(--sp-3)" }}>
      <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap", alignItems: "center" }}>
        <fieldset
          aria-label="Kỳ nhanh"
          style={{ display: "flex", gap: "var(--sp-1)", border: "none", padding: 0, margin: 0 }}
        >
          <Button variant="secondary" onClick={() => applyPeriod(monthRange(new Date()))}>
            Tháng
          </Button>
          <Button variant="secondary" onClick={() => applyPeriod(quarterRange(new Date()))}>
            Quý
          </Button>
          <Button variant="secondary" onClick={() => applyPeriod(yearRange(new Date()))}>
            Năm
          </Button>
        </fieldset>

        <label style={{ display: "inline-flex", gap: "var(--sp-1)", alignItems: "center" }}>
          <span className="sr-only">Từ ngày</span>
          <input
            type="date"
            aria-label="Từ ngày"
            style={inputStyle}
            value={draft.tuNgay ?? ""}
            onChange={(e) => set({ tuNgay: e.target.value || undefined })}
          />
        </label>
        <span aria-hidden="true">–</span>
        <label style={{ display: "inline-flex", gap: "var(--sp-1)", alignItems: "center" }}>
          <span className="sr-only">Đến ngày</span>
          <input
            type="date"
            aria-label="Đến ngày"
            style={inputStyle}
            value={draft.denNgay ?? ""}
            onChange={(e) => set({ denNgay: e.target.value || undefined })}
          />
        </label>
      </div>

      <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap", alignItems: "center" }}>
        <select
          aria-label="Chiều"
          style={selectStyle}
          value={draft.chieu ?? ""}
          onChange={(e) => set({ chieu: (e.target.value || undefined) as Chieu | undefined })}
        >
          <option value="">Tất cả chiều</option>
          <option value="purchase">Mua vào</option>
          <option value="sold">Bán ra</option>
        </select>
        <select
          aria-label="Nguồn"
          style={selectStyle}
          value={draft.nguon ?? ""}
          onChange={(e) => set({ nguon: (e.target.value || undefined) as Nguon | undefined })}
        >
          <option value="">Mọi nguồn</option>
          <option value="normal">HĐĐT thường</option>
          <option value="sco">Máy tính tiền</option>
        </select>
        <input
          aria-label="MST người bán"
          placeholder="MST người bán"
          style={inputStyle}
          value={draft.nbmst ?? ""}
          onChange={(e) => set({ nbmst: e.target.value || undefined })}
        />
        <input
          aria-label="MST người mua"
          placeholder="MST người mua"
          style={inputStyle}
          value={draft.nmmst ?? ""}
          onChange={(e) => set({ nmmst: e.target.value || undefined })}
        />
        <Button onClick={() => onApply(draft)}>Áp dụng</Button>
      </div>
    </div>
  );
}

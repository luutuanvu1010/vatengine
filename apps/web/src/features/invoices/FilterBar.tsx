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

  // Kỳ chọn xong áp NGAY (giữ hành vi cũ: bấm Tháng/Quý/Năm → lọc liền). Các ô còn lại
  // (chiều/nguồn/MST) vẫn theo hợp đồng "sửa bản nháp → bấm Lọc dữ liệu".
  const apKy = (r: DateRange) => {
    const next = { ...draft, ...r };
    setDraft(next);
    onApply(next);
  };

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
    <div style={{ display: "grid", gap: "var(--sp-3)" }}>
      <ChonKy onChon={apKy} />

      <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap", alignItems: "end" }}>
        {/* 2026-07-23 — bộ CHỌN NGÀY trả lại (day-level) BÊN CẠNH nút kỳ nhanh: sửa ngày rồi
            bấm "Lọc dữ liệu" mới áp (đúng hợp đồng "sửa nháp → bấm Lọc", khác ChonKy áp ngay).
            ChonKy áp kỳ nào thì draft.tuNgay/denNgay đổi theo, hai ô này hiện đúng khoảng đó. */}
        <Field
          label="Từ ngày"
          type="date"
          value={draft.tuNgay ?? ""}
          onChange={(e) => set({ tuNgay: e.target.value || undefined })}
        />
        <Field
          label="Đến ngày"
          type="date"
          value={draft.denNgay ?? ""}
          onChange={(e) => set({ denNgay: e.target.value || undefined })}
        />
        {/* U-K4 — "Lọc dữ liệu" (đọc nhẹ): hành động đọc dữ liệu ĐÃ CÓ, tách bạch với
            "Đồng bộ và tải xuống" (kéo nặng từ Tổng cục Thuế) ở panel dưới. */}
        <Button onClick={() => onApply(draft)}>Lọc dữ liệu</Button>
        <Select label="Chiều" value={draft.chieu ?? ""} onChange={(e) => setChieu(e.target.value)}>
          <option value="">Tất cả chiều</option>
          {luaChon("chieu").map(([v, nhan]) => (
            <option key={v} value={v}>
              {nhan}
            </option>
          ))}
        </Select>
        <Select
          label="Nguồn"
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
            placeholder="MST người bán"
            value={draft.nbmst ?? ""}
            onChange={(e) => set({ nbmst: e.target.value || undefined })}
          />
        ) : null}
        {showNmmst ? (
          <Field
            label="MST người mua"
            hideLabel
            placeholder="MST người mua"
            value={draft.nmmst ?? ""}
            onChange={(e) => set({ nmmst: e.target.value || undefined })}
          />
        ) : null}
      </div>
    </div>
  );
}

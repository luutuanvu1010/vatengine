// Panel "Chọn cột" cho file xuất (S1). Đọc catalog cột từ @vat/domain (một nguồn — cùng danh
// sách server dùng để sinh file), gom theo nhóm, tick ẩn/hiện. Lựa chọn chảy vào createExport
// qua `cols`; server allowlist + sắp theo catalog. Thuần primitive + token (Checkbox/Button/Card).
import { FLAT_EXPORT_COLUMNS, FLAT_EXPORT_DEFAULT_KEYS, type FlatExportNhom } from "@vat/domain";
import { useState } from "react";
import { Button, Card, Checkbox } from "../../components/ui/primitives";

const NHOM_NHAN: Record<FlatExportNhom, string> = {
  stt: "Số thứ tự",
  hd: "Thông tin hóa đơn",
  nguoi: "Người bán / mua",
  dong: "Chi tiết dòng hàng",
  trangthai: "Trạng thái",
  hdTien: "Tiền (cả hóa đơn)",
};
const THU_TU_NHOM: FlatExportNhom[] = ["stt", "hd", "nguoi", "dong", "trangthai", "hdTien"];

export function ChonCotXuat({
  value,
  onChange,
}: {
  value: string[];
  onChange: (keys: string[]) => void;
}) {
  const [mo, setMo] = useState(false);
  const chon = new Set(value);

  const toggle = (key: string) => {
    const next = new Set(chon);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    // Giữ THỨ TỰ catalog cho gọn (server cũng sắp theo catalog).
    onChange(FLAT_EXPORT_COLUMNS.filter((c) => next.has(c.key)).map((c) => c.key));
  };

  return (
    <div style={{ position: "relative" }}>
      <Button variant="secondary" onClick={() => setMo((o) => !o)}>
        Tùy chỉnh cột ({value.length})
      </Button>
      {mo ? (
        <div style={{ position: "absolute", zIndex: 20, right: 0, marginTop: "var(--sp-2)" }}>
          <Card style={{ width: 280, maxHeight: 380, overflowY: "auto" }}>
            <div style={{ display: "grid", gap: "var(--sp-4)" }}>
              {THU_TU_NHOM.map((nhom) => {
                const cols = FLAT_EXPORT_COLUMNS.filter((c) => c.nhom === nhom);
                if (cols.length === 0) return null;
                return (
                  <div key={nhom} style={{ display: "grid", gap: "var(--sp-2)" }}>
                    <div
                      style={{
                        fontSize: "var(--fs-xs)",
                        fontWeight: "var(--fw-bold)",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        color: "var(--text-tertiary)",
                      }}
                    >
                      {NHOM_NHAN[nhom]}
                    </div>
                    {cols.map((c) => (
                      <Checkbox
                        key={c.key}
                        label={c.nhan}
                        checked={chon.has(c.key)}
                        onChange={() => toggle(c.key)}
                      />
                    ))}
                  </div>
                );
              })}
              <Button variant="ghost" onClick={() => onChange([...FLAT_EXPORT_DEFAULT_KEYS])}>
                Về mặc định (16 cột)
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

// U-K3 — bộ chọn kỳ (yêu cầu 1): chọn Tháng/Quý/Năm CỤ THỂ, kể cả kỳ QUÁ KHỨ, bằng
// dropdown gốc (cảm ứng tốt). Segmented Tháng/Quý/Năm đổi độ chi tiết + phát khoảng kỳ ra
// cha qua `onChon`. Việc ÁP là của cha: FilterBar đưa vào BẢN NHÁP, chỉ fetch khi bấm "Lọc
// dữ liệu" — thống nhất hợp đồng tương tác ui.md/CHUAN §D5 (không còn áp tức thì).
//
// Kỳ suy qua period.ts (hàm THUẦN nhận kỳ tường minh) — component không tự tính lịch, không
// gọi Date.now bên trong (nhận `homNay` để test xác định; production để rơi về new Date()).
import { useState } from "react";
import { SegmentedControl, Select } from "../../components/ui/primitives";
import {
  type DateRange,
  monthRangeOf,
  quarterRangeOf,
  vnYearMonth,
  yearRangeOf,
} from "../../lib/period";

type DoChiTiet = "thang" | "quy" | "nam";

/** Số năm gần nhất hiện trong dropdown (trần cấu hình được). */
const SO_NAM = 5;

const THANG = Array.from({ length: 12 }, (_, i) => i + 1);
const QUY = [1, 2, 3, 4];

export function ChonKy({
  onChon,
  homNay = new Date(),
}: {
  onChon: (r: DateRange) => void;
  /** Ngày tham chiếu (mặc định hôm nay). Test truyền cố định để xác định. */
  homNay?: Date;
}) {
  const { y: namNay, m: thangNay } = vnYearMonth(homNay);
  const quyNay = Math.floor((thangNay - 1) / 3) + 1;
  const namGanNhat = Array.from({ length: SO_NAM }, (_, i) => namNay - i);

  // Trạng thái bản nháp: độ chi tiết + kỳ đang chọn. Khởi tạo trỏ đúng kỳ chứa hôm nay.
  const [doChiTiet, setDoChiTiet] = useState<DoChiTiet>("thang");
  const [nam, setNam] = useState(namNay);
  const [thang, setThang] = useState(thangNay);
  const [quy, setQuy] = useState(quyNay);

  const phat = (level: DoChiTiet, y: number, m: number, q: number) => {
    if (level === "thang") onChon(monthRangeOf(y, m));
    else if (level === "quy") onChon(quarterRangeOf(y, q));
    else onChon(yearRangeOf(y));
  };

  // Kỳ nhanh: đổi độ chi tiết + phát kỳ HIỆN TẠI ra cha (cha đưa vào nháp, áp khi bấm Lọc).
  const chonNhanh = (level: DoChiTiet) => {
    setDoChiTiet(level);
    setNam(namNay);
    setThang(thangNay);
    setQuy(quyNay);
    phat(level, namNay, thangNay, quyNay);
  };

  return (
    <fieldset
      aria-label="Chọn kỳ"
      style={{
        display: "flex",
        gap: "var(--sp-2)",
        flexWrap: "wrap",
        alignItems: "end",
        border: "none",
        padding: 0,
        margin: 0,
      }}
    >
      {/* Nhóm "kỳ nhanh" dạng segmented control (khớp mockup): nhãn nhỏ + hộp liền khối. */}
      <span style={{ display: "flex", flexDirection: "column", gap: "var(--sp-1)" }}>
        <span
          style={{
            fontSize: "var(--fs-xs)",
            fontWeight: "var(--fw-semibold)",
            color: "var(--text-disabled)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          Kỳ nhanh
        </span>
        <SegmentedControl<DoChiTiet>
          ariaLabel="Kỳ nhanh"
          value={doChiTiet}
          onChange={chonNhanh}
          options={[
            { value: "thang", label: "Tháng" },
            { value: "quy", label: "Quý" },
            { value: "nam", label: "Năm" },
          ]}
        />
      </span>

      <Select
        label="Năm"
        value={String(nam)}
        onChange={(e) => {
          const y = Number(e.target.value);
          setNam(y);
          phat(doChiTiet, y, thang, quy);
        }}
      >
        {namGanNhat.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </Select>

      {doChiTiet === "thang" ? (
        <Select
          label="Tháng"
          value={String(thang)}
          onChange={(e) => {
            const m = Number(e.target.value);
            setThang(m);
            phat("thang", nam, m, quy);
          }}
        >
          {THANG.map((m) => (
            <option key={m} value={m}>
              Tháng {m}
            </option>
          ))}
        </Select>
      ) : null}

      {doChiTiet === "quy" ? (
        <Select
          label="Quý"
          value={String(quy)}
          onChange={(e) => {
            const q = Number(e.target.value);
            setQuy(q);
            phat("quy", nam, thang, q);
          }}
        >
          {QUY.map((q) => (
            <option key={q} value={q}>
              Quý {q}
            </option>
          ))}
        </Select>
      ) : null}
    </fieldset>
  );
}

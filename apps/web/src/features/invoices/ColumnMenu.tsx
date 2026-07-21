// U31 — menu nhỏ trên đầu cột: sắp xếp + lọc. Mọi thao tác đều SERVER-SIDE (áp trên toàn
// tập, không lọc cục bộ 50 dòng đang xem — lọc client sẽ khiến người dùng tưởng đã lọc hết
// rồi xuất thiếu dữ liệu). Bám design token, không hardcode màu.
import { useEffect, useRef, useState } from "react";
import type { SortBy } from "../../types/api";

export type LoaiLoc = "text" | "select" | "range" | "none";

export interface ColumnMenuProps {
  /** Nhãn cột — dùng cho nhãn trợ năng của nút mở menu. */
  nhan: string;
  /** Khóa sắp xếp; bỏ trống nếu cột không sắp xếp được (vd cột tóm tắt dòng hàng). */
  sortBy?: SortBy;
  loaiLoc: LoaiLoc;
  /** Lựa chọn cho `loaiLoc="select"`: [giá trị, nhãn]. */
  chonLua?: ReadonlyArray<readonly [string, string]>;
  /** Giá trị lọc đang áp (rỗng = không lọc). Với `range`: "tu|den". */
  giaTri: string;
  dangSap: "asc" | "desc" | null;
  onSap: (dir: "asc" | "desc") => void;
  onLoc: (giaTri: string) => void;
}

const nutMo: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: "0 var(--sp-1)",
  cursor: "pointer",
  color: "inherit",
  font: "inherit",
};

const menuBox: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  zIndex: 20,
  minWidth: 200,
  padding: "var(--sp-3)",
  display: "grid",
  gap: "var(--sp-2)",
  background: "var(--surface-card)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  boxShadow: "var(--shadow-md)",
  margin: 0, // fieldset có margin/padding mặc định của trình duyệt — dọn sạch
  minInlineSize: "auto",
  textTransform: "none",
  letterSpacing: "normal",
};

const nutMuc: React.CSSProperties = {
  ...nutMo,
  textAlign: "left",
  padding: "var(--sp-2)",
  borderRadius: "var(--radius-sm)",
  fontSize: "var(--fs-sm)",
  color: "var(--text-secondary)",
  width: "100%",
};

const oNhap: React.CSSProperties = {
  padding: "var(--sp-2)",
  fontSize: "var(--fs-sm)",
  fontFamily: "inherit",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--surface-card)",
  width: "100%",
};

export function ColumnMenu(p: ColumnMenuProps) {
  const [mo, setMo] = useState(false);
  const [nhap, setNhap] = useState(p.giaTri);
  const boc = useRef<HTMLSpanElement>(null);

  // Đồng bộ khi bộ lọc bị xóa từ ngoài (vd nút "Áp dụng" của FilterBar).
  useEffect(() => setNhap(p.giaTri), [p.giaTri]);

  // Đóng menu khi bấm ra ngoài hoặc nhấn Esc — hành vi menu quen thuộc.
  useEffect(() => {
    if (!mo) return;
    const ngoai = (e: MouseEvent) => {
      if (boc.current && !boc.current.contains(e.target as Node)) setMo(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMo(false);
    };
    document.addEventListener("mousedown", ngoai);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", ngoai);
      document.removeEventListener("keydown", esc);
    };
  }, [mo]);

  const apLoc = (v: string) => {
    p.onLoc(v);
    setMo(false);
  };

  const coLoc = p.giaTri !== "";
  const dauHieu = `${p.dangSap === "asc" ? " ↑" : p.dangSap === "desc" ? " ↓" : ""}${
    coLoc ? " •" : ""
  }`;

  return (
    <span ref={boc} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        style={nutMo}
        aria-label={`Tùy chọn cột ${p.nhan}`}
        aria-expanded={mo}
        onClick={() => setMo((v) => !v)}
      >
        ⋮{dauHieu}
      </button>

      {/* `<fieldset>` chứ không phải `dialog`: đây là NHÓM ĐIỀU KHIỂN lọc/sắp xếp, không
          chiếm tiêu điểm và không chặn tương tác phía sau như một hộp thoại thật.
          Phần tử ngữ nghĩa mang sẵn role="group" — không cần gán role thủ công. */}
      {mo && (
        <fieldset aria-label={`Tùy chọn cột ${p.nhan}`} style={menuBox}>
          {p.sortBy && (
            <>
              <button
                type="button"
                style={nutMuc}
                onClick={() => {
                  p.onSap("asc");
                  setMo(false);
                }}
              >
                ↑ Sắp xếp tăng dần
              </button>
              <button
                type="button"
                style={nutMuc}
                onClick={() => {
                  p.onSap("desc");
                  setMo(false);
                }}
              >
                ↓ Sắp xếp giảm dần
              </button>
            </>
          )}

          {p.loaiLoc === "text" && (
            <>
              <input
                style={oNhap}
                value={nhap}
                placeholder="Chứa…"
                onChange={(e) => setNhap(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && apLoc(nhap)}
              />
              <div style={{ display: "flex", gap: "var(--sp-2)" }}>
                <button type="button" style={nutMuc} onClick={() => apLoc(nhap)}>
                  Lọc
                </button>
                <button type="button" style={nutMuc} onClick={() => apLoc("")}>
                  Xóa lọc
                </button>
              </div>
            </>
          )}

          {p.loaiLoc === "range" && (
            <>
              {/* Giá trị truyền lên dạng "tu|den" — trang cha tách ra thành hai tham số. */}
              <input
                style={oNhap}
                inputMode="decimal"
                placeholder="Từ…"
                value={nhap.split("|")[0] ?? ""}
                onChange={(e) => setNhap(`${e.target.value}|${nhap.split("|")[1] ?? ""}`)}
              />
              <input
                style={oNhap}
                inputMode="decimal"
                placeholder="Đến…"
                value={nhap.split("|")[1] ?? ""}
                onChange={(e) => setNhap(`${nhap.split("|")[0] ?? ""}|${e.target.value}`)}
              />
              <div style={{ display: "flex", gap: "var(--sp-2)" }}>
                <button type="button" style={nutMuc} onClick={() => apLoc(nhap)}>
                  Lọc
                </button>
                <button type="button" style={nutMuc} onClick={() => apLoc("")}>
                  Xóa lọc
                </button>
              </div>
            </>
          )}

          {p.loaiLoc === "select" && (
            <>
              {(p.chonLua ?? []).map(([v, nhanChon]) => (
                <button key={v} type="button" style={nutMuc} onClick={() => apLoc(v)}>
                  {nhanChon}
                </button>
              ))}
              <button type="button" style={nutMuc} onClick={() => apLoc("")}>
                Xóa lọc
              </button>
            </>
          )}
        </fieldset>
      )}
    </span>
  );
}

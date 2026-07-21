// Lịch sử cập nhật phần mềm — timeline dọc từ file tĩnh `lib/changelog.ts`. Mặc định
// hiện 5 mục mới nhất, nút "Xem thêm" mở phần còn lại.
import { useState } from "react";
import { Button } from "../../components/ui/primitives";
import { CHANGELOG, type ChangelogKind } from "../../lib/changelog";

const DEFAULT_VISIBLE = 5;

const kindLabel: Record<ChangelogKind, string> = {
  feature: "Tính năng mới",
  improvement: "Cải tiến",
  fix: "Sửa lỗi",
};

function formatDateVn(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function Changelog() {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? CHANGELOG : CHANGELOG.slice(0, DEFAULT_VISIBLE);

  return (
    <div style={{ display: "grid", gap: "var(--sp-2)" }}>
      <ol style={{ display: "grid", gap: "var(--sp-5)", margin: 0, padding: 0, listStyle: "none" }}>
        {visible.map((entry) => (
          <li
            key={entry.version}
            style={{ borderLeft: "2px solid var(--border)", paddingLeft: "var(--sp-4)" }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "baseline",
                gap: "var(--sp-2)",
              }}
            >
              <strong style={{ fontSize: "var(--fs-base)" }}>{entry.version}</strong>
              <span style={{ color: "var(--text-tertiary)", fontSize: "var(--fs-sm)" }}>
                {formatDateVn(entry.date)}
              </span>
              <span
                style={{
                  fontSize: "var(--fs-sm)",
                  color: "var(--text-secondary)",
                  background: "var(--surface-card)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  padding: "0 var(--sp-2)",
                }}
              >
                {kindLabel[entry.kind]}
              </span>
            </div>
            <p style={{ margin: "var(--sp-1) 0 var(--sp-2)", fontWeight: "var(--fw-semibold)" }}>
              {entry.title}
            </p>
            <ul style={{ margin: 0, paddingLeft: "var(--sp-5)", color: "var(--text-secondary)" }}>
              {entry.changes.map((change) => (
                <li key={change}>{change}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      {CHANGELOG.length > DEFAULT_VISIBLE ? (
        <Button variant="secondary" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Thu gọn" : "Xem thêm"}
        </Button>
      ) : null}
    </div>
  );
}

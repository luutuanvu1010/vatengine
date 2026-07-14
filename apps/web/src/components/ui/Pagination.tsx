import { Button } from "./primitives";

/** Phân trang limit/offset → điều khiển trang. `limit`≤200 (backend). */
export function Pagination({
  total,
  limit,
  offset,
  onOffset,
}: {
  total: number;
  limit: number;
  offset: number;
  onOffset: (next: number) => void;
}) {
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "var(--sp-3)",
        padding: "var(--sp-3) 0",
      }}
    >
      <span style={{ fontSize: "var(--fs-sm)", color: "var(--text-tertiary)" }}>
        Trang {page}/{pages} · {total} dòng
      </span>
      <div style={{ display: "flex", gap: "var(--sp-2)" }}>
        <Button
          variant="secondary"
          disabled={page <= 1}
          onClick={() => onOffset(Math.max(0, offset - limit))}
        >
          Trước
        </Button>
        <Button
          variant="secondary"
          disabled={page >= pages}
          onClick={() => onOffset(offset + limit)}
        >
          Sau
        </Button>
      </div>
    </div>
  );
}

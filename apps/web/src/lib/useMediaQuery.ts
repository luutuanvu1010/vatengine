import { useEffect, useState } from "react";

/** Breakpoint mobile ⩽767px — NGUỒN DUY NHẤT cho quyết định layout khung (drawer vs
 * sidebar tĩnh). Đổi mốc → sửa ở đây, không rải số magic trong component. */
export const MOBILE_QUERY = "(max-width: 767px)";

/** True khi `query` khớp bề rộng hiện tại; cập nhật theo resize/xoay màn hình.
 * SPA client-render (ADR-0003) nên `window` luôn tồn tại lúc mount. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange(); // đồng bộ nếu query đổi giữa các render
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

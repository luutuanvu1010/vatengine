import type { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { ApiError } from "../../src/lib/apiClient";
import { t } from "../../src/lib/i18n/vi";
import { makeQueryClient } from "../../src/lib/queryClient";

describe("i18n", () => {
  it("t() trả chuỗi tiếng Việt", () => {
    expect(t("brand")).toBe("VATEngine");
    expect(t("logout")).toBe("Đăng xuất");
  });
});

describe("queryClient — retry chỉ lỗi mạng/5xx, KHÔNG retry 4xx", () => {
  const retry = (): ((n: number, e: Error) => boolean) => {
    const qc: QueryClient = makeQueryClient();
    const fn = qc.getDefaultOptions().queries?.retry;
    if (typeof fn !== "function") throw new Error("retry phải là hàm");
    return fn as (n: number, e: Error) => boolean;
  };

  it("4xx → không retry", () => {
    expect(retry()(0, new ApiError(403, "forbidden"))).toBe(false);
    expect(retry()(0, new ApiError(404))).toBe(false);
  });
  it("lỗi mạng/5xx → retry 1 lần", () => {
    expect(retry()(0, new ApiError(0, "network_error"))).toBe(true);
    expect(retry()(1, new ApiError(0, "network_error"))).toBe(false);
  });
});

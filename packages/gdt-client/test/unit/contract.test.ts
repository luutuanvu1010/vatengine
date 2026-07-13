import { describe, expect, it } from "vitest";
import { checkContract } from "../../src/contract";
import { GdtContractDriftError } from "../../src/errors";

describe("checkContract", () => {
  it("không ném lỗi khi response đủ trường bắt buộc", () => {
    expect(() =>
      checkContract({ key: "a", content: "b" }, "captcha", "/api/captcha"),
    ).not.toThrow();
  });

  it("ném GdtContractDriftError khi response thiếu trường bắt buộc", () => {
    expect(() => checkContract({ key: "a" }, "captcha", "/api/captcha")).toThrow(
      GdtContractDriftError,
    );
  });

  it("fail-open (không ném) khi schemaKey chưa được định nghĩa", () => {
    expect(() => checkContract({}, "khong-ton-tai", "/api/khong-ton-tai")).not.toThrow();
  });
});

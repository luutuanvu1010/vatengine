import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/app";

describe("App smoke", () => {
  it("khởi động → chưa đăng nhập → màn Đăng nhập", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Đăng nhập" })).toBeInTheDocument();
  });
});

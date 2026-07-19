import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/app";

describe("App smoke", () => {
  it("khởi động → chưa đăng nhập → màn Đăng nhập", async () => {
    render(<App />);
    // ADR-0003 Amendment #1 (C8): app hỏi /me trước để biết cookie phiên còn hiệu lực
    // không. Không có server trong jsdom ⇒ fetch hỏng ⇒ về 'anon' ⇒ màn Đăng nhập —
    // nhưng chỉ SAU một nhịp bất đồng bộ, nên phải findBy chứ không getBy.
    expect(await screen.findByRole("heading", { name: "Đăng nhập" })).toBeInTheDocument();
  });
});

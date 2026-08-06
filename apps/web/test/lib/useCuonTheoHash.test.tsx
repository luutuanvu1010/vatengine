// jsdom KHÔNG hiện thực `scrollIntoView` — thuộc tính này không tồn tại trên Element.prototype,
// nên `vi.spyOn` sẽ ném "not a function". Vì vậy phải tự gắn hàm giả bằng defineProperty.
import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useCuonTheoHash } from "../../src/lib/useCuonTheoHash";
import { renderWithProviders } from "../helpers/renderApp";

let daCuonToi: string[] = [];
let goc: PropertyDescriptor | undefined;

beforeEach(() => {
  daCuonToi = [];
  goc = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    writable: true,
    value: function (this: Element) {
      daCuonToi.push(this.id);
    },
  });
});

afterEach(() => {
  if (goc) Object.defineProperty(Element.prototype, "scrollIntoView", goc);
  else Reflect.deleteProperty(Element.prototype, "scrollIntoView");
});

function Trang({ sanSang }: { sanSang: boolean }) {
  useCuonTheoHash(sanSang);
  return (
    <div>
      <div id="faq">Câu hỏi thường gặp</div>
      <div id="lich-su">Lịch sử cập nhật</div>
    </div>
  );
}

describe("useCuonTheoHash", () => {
  it("cuộn tới đúng mục khớp hash", () => {
    renderWithProviders(<Trang sanSang={true} />, "/gioi-thieu#lich-su");
    expect(screen.getByText("Lịch sử cập nhật")).toBeInTheDocument();
    expect(daCuonToi).toEqual(["lich-su"]);
  });

  it("chưa sẵn sàng ⇒ không cuộn — nội dung chưa dựng thì cuộn vào chỗ trống", () => {
    renderWithProviders(<Trang sanSang={false} />, "/gioi-thieu#faq");
    expect(daCuonToi).toEqual([]);
  });

  it("không có hash ⇒ không cuộn, giữ nguyên đầu trang", () => {
    renderWithProviders(<Trang sanSang={true} />, "/gioi-thieu");
    expect(daCuonToi).toEqual([]);
  });

  it("hash trỏ tới id không tồn tại ⇒ bỏ qua, không ném lỗi", () => {
    expect(() =>
      renderWithProviders(<Trang sanSang={true} />, "/gioi-thieu#khong-co-that"),
    ).not.toThrow();
    expect(daCuonToi).toEqual([]);
  });
});

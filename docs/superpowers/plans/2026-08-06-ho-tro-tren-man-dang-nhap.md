# Kế hoạch thi công — Đưa kênh hỗ trợ ra bề mặt công khai

> **Dành cho tác nhân thực thi:** BẮT BUỘC dùng skill `superpowers:subagent-driven-development`
> (khuyến nghị) hoặc `superpowers:executing-plans` để thi công từng nhiệm vụ. Các bước dùng cú
> pháp checkbox (`- [ ]`) để theo dõi.

**Mục tiêu:** Khách chưa đăng nhập thấy được kênh hỗ trợ ngay tại màn Đăng nhập và Đăng ký, và
đọc được trang Giới thiệu & Hỗ trợ mà không cần tài khoản.

**Kiến trúc:** Đưa `/gioi-thieu` ra ngoài `ProtectedLayout`, bọc bằng một route cha tự chọn
khung theo trạng thái phiên — đã đăng nhập thì `AppLayout` (sidebar y như hôm nay), chưa đăng
nhập thì `KhungCongKhai`. `AboutPage` không sửa một dòng. Thêm component `KhoiHoTro` dùng chung
cho hai trang công khai, đọc dữ liệu từ một nguồn duy nhất ở `lib/contact.ts` và
`lib/contactLinks.ts`.

**Ngăn xếp:** React 18 + react-router-dom v6, TypeScript, Vitest + Testing Library (jsdom),
Biome. Chỉ tầng trình bày `apps/web` — không đụng API, schema, RBAC, dữ liệu tenant.

**Spec nguồn:** `docs/superpowers/specs/2026-08-06-ho-tro-tren-man-dang-nhap-design.md`

## Ràng buộc toàn cục

Áp cho **mọi** nhiệm vụ dưới đây, không nhắc lại trong từng bước:

- **TDD bắt buộc** (`.claude/rules/testing.md`): viết test → chạy cho **đỏ** → hiện thực → chạy
  cho **xanh** → commit. Test viết sau để khớp mã đã có không tính là xong.
- **Kết luận xanh/đỏ bằng mã thoát**, không đọc dòng đếm. Vitest có thể in "N passed" trong khi
  vẫn thoát khác 0. Lệnh chạy một tệp: `npx vitest run <đường-dẫn> -w apps/web`. Lệnh cổng đầy
  đủ: `make lint && make test`.
- **Chỉ dùng token + primitive** (`.claude/rules/ui.md`): màu/khoảng cách/chữ chỉ qua biến
  `--…`; cấm hex và px cứng. Nút mới phải nằm ở `components/ui/primitives.tsx`, không tô kiểu
  nội tuyến trong `features/`.
- **Câu văn hoàn chỉnh luôn `--fs-base`**; `--fs-sm`/`--fs-xs` chỉ dành cho nhãn.
- **Văn phong:** sentence case; nhãn nút là cụm động từ ngắn không dấu chấm; không dấu chấm
  than; không biểu tượng cảm xúc; dùng gạch ngang `—` chứ không `-` giữa hai vế câu. Viết `hóa`
  không viết `hoá`.
- **Không gõ chuỗi rời:** số điện thoại, giờ hỗ trợ, URL liên hệ đều đọc từ `lib/contact.ts` /
  `lib/contactLinks.ts`.
- **Commit nhỏ**, mỗi nhiệm vụ một commit, không trộn nhiều nhiệm vụ.
- Chuỗi giờ hỗ trợ dùng **gạch ngang en `–`** đúng như bản đang chạy: `08:00 – 17:00`.
- **Biome tự sắp xếp `import` theo đường dẫn.** Các đoạn mã dưới đây liệt kê import theo cụm
  cho dễ đọc, không phải theo đúng vị trí chèn. Sau khi thêm import, chạy
  `npx biome check --write apps/web/src` rồi mới chạy `make lint` — nếu không, cổng lint sẽ đỏ
  vì thứ tự import chứ không phải vì lỗi thật.

---

### Nhiệm vụ 1: Nguồn sự thật cho số điện thoại và giờ hỗ trợ

**Tệp:**
- Sửa: `apps/web/src/lib/contact.ts`
- Sửa: `apps/web/src/lib/contactLinks.ts`
- Test: `apps/web/test/lib/contactLinks.test.ts`

**Giao diện:**
- Dùng của nhiệm vụ trước: không có (nhiệm vụ đầu tiên).
- Cung cấp cho nhiệm vụ sau: `GIO_HO_TRO: string`, `telUrl(phone: string): string`,
  `hienThiSoDienThoai(phone: string): string`.

- [ ] **Bước 1: Viết test đỏ cho hai hàm thuần**

Thêm vào cuối `apps/web/test/lib/contactLinks.test.ts`. Sửa dòng `import` đầu tệp thành:

```ts
import { hienThiSoDienThoai, telUrl, whatsappUrl, zaloUrl } from "../../src/lib/contactLinks";
```

Rồi thêm:

```ts
describe("telUrl — E.164 để bấm gọi", () => {
  it("số 0 đầu → mã quốc gia 84, có dấu cộng", () => {
    expect(telUrl("0989929373")).toBe("tel:+84989929373");
  });
  it("đã có 84 → giữ nguyên", () => {
    expect(telUrl("84989929373")).toBe("tel:+84989929373");
  });
  it("bỏ ký tự không phải số", () => {
    expect(telUrl("+84 989 929 373")).toBe("tel:+84989929373");
  });
});

describe("hienThiSoDienThoai — số để đọc trên màn hình", () => {
  it("đúng 10 chữ số → tách 4-3-3 như cách viết quen thuộc ở Việt Nam", () => {
    expect(hienThiSoDienThoai("0989929373")).toBe("0989 929 373");
  });
  it("đầu vào đã có khoảng trắng vẫn cho ra cùng kết quả", () => {
    expect(hienThiSoDienThoai("0989 929 373")).toBe("0989 929 373");
  });
  // Không đoán cách chia cho độ dài lạ — đoán sai còn tệ hơn hiện nguyên dãy.
  it("độ dài khác 10 → trả nguyên dãy chữ số, không tách", () => {
    expect(hienThiSoDienThoai("02871234567")).toBe("02871234567");
  });
});
```

- [ ] **Bước 2: Chạy test cho đỏ**

Chạy: `npx vitest run test/lib/contactLinks.test.ts -w apps/web`
Chờ: FAIL — `telUrl is not a function` / `hienThiSoDienThoai is not a function`.

- [ ] **Bước 3: Hiện thực hai hàm**

Thêm vào cuối `apps/web/src/lib/contactLinks.ts` (tệp đã có sẵn `digitsOnly`):

```ts
/** `tel:` dạng E.164 — bấm gọi được cả khi máy đang ở mạng nước ngoài. Chuẩn hóa giống
 * `whatsappUrl`: 0xxxxxxxxx → 84xxxxxxxxx. */
export function telUrl(phone: string): string {
  let d = digitsOnly(phone);
  if (d.startsWith("0")) d = `84${d.slice(1)}`;
  return `tel:+${d}`;
}

/** Số ĐỂ ĐỌC trên màn hình. Tách nhóm bằng hàm chứ không gõ tay chuỗi đã tách sẵn — chuỗi gõ
 * tay sẽ lệch khỏi số thật vào ngày số đổi, mà không test nào bắt được.
 * Đúng 10 chữ số → 4-3-3 (`0989 929 373`). Độ dài khác → trả nguyên dãy, không đoán. */
export function hienThiSoDienThoai(phone: string): string {
  const d = digitsOnly(phone);
  if (d.length !== 10) return d;
  return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
}
```

- [ ] **Bước 4: Thêm hằng giờ hỗ trợ**

Thêm vào cuối `apps/web/src/lib/contact.ts`:

```ts
/** Giờ hỗ trợ — NGUỒN DUY NHẤT. Trước đây gõ cứng trong `features/about/SupportCenter.tsx`;
 * khối hỗ trợ ở màn Đăng nhập cần đúng chuỗi này, nên gõ lại là tạo nơi thứ hai và hai nơi
 * sẽ lệch vào ngày đổi giờ. Gạch ngang en `–` giữ đúng bản đang chạy. */
export const GIO_HO_TRO = "08:00 – 17:00";
```

- [ ] **Bước 5: Chạy test cho xanh**

Chạy: `npx vitest run test/lib/contactLinks.test.ts -w apps/web`
Chờ: PASS, mã thoát 0.

- [ ] **Bước 6: Commit**

```bash
git add apps/web/src/lib/contact.ts apps/web/src/lib/contactLinks.ts apps/web/test/lib/contactLinks.test.ts
git commit -m "feat(web): một nguồn cho số điện thoại hiển thị, liên kết gọi và giờ hỗ trợ"
```

---

### Nhiệm vụ 2: Primitive `LienKetNut` và dọn `SupportCenter`

`SupportCenter.tsx` đang có `LinkButton` cục bộ tô kiểu nội tuyến — trái `.claude/rules/ui.md`.
Khối hỗ trợ mới cần đúng loại nút đó, nên nâng lên thư viện primitive rồi cho cả hai dùng chung.

**Tệp:**
- Sửa: `apps/web/src/components/ui/primitives.tsx` (thêm ở cuối tệp)
- Sửa: `apps/web/src/features/about/SupportCenter.tsx:8-32` (gỡ `LinkButton`), `:120-125`
- Tạo: `apps/web/test/conventions/gio-ho-tro-mot-nguon.test.ts`

**Giao diện:**
- Dùng của nhiệm vụ trước: `GIO_HO_TRO` từ `lib/contact.ts`.
- Cung cấp cho nhiệm vụ sau:
  `LienKetNut({ href: string, ngoai?: boolean, children: ReactNode })` — mặc định `ngoai = true`
  (mở tab mới kèm `rel="noopener noreferrer"`).

- [ ] **Bước 1: Viết test quy ước cho đỏ**

Tạo `apps/web/test/conventions/gio-ho-tro-mot-nguon.test.ts`:

```ts
// Giờ hỗ trợ phải đọc từ `lib/contact.ts`, không gõ cứng ở bề mặt. Khối "Cần hỗ trợ?" ở màn
// Đăng nhập và phần Trung tâm hỗ trợ trong trang Giới thiệu hiện CÙNG một chuỗi; hai nơi gõ
// tay sẽ lệch vào ngày đổi giờ mà không ai biết.
//
// CỐ Ý quét riêng, KHÔNG nối vào `THU_MUC_QUET` của `ui-luat.test.ts`: quét này phủ cả
// `src/components`, mà thư mục đó có `#fff` hợp lệ trong `Brand.tsx` và `primitives.tsx` —
// nối vào sẽ làm hai ca kiểm màu hex đỏ oan.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GIO_HO_TRO } from "../../src/lib/contact";

const GOC = resolve(process.cwd(), "src");
const THU_MUC = [join(GOC, "features"), join(GOC, "components")];

function liet(duong: string): string[] {
  const ra: string[] = [];
  for (const ten of readdirSync(duong)) {
    const p = join(duong, ten);
    if (statSync(p).isDirectory()) ra.push(...liet(p));
    else if ([".ts", ".tsx"].includes(extname(p))) ra.push(p);
  }
  return ra;
}

/** Bỏ chú thích: chú thích được phép nhắc chuỗi cũ để giải thích lịch sử. */
function boChuThich(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("Luật một-nguồn — giờ hỗ trợ", () => {
  it("không tệp bề mặt nào gõ cứng chuỗi giờ hỗ trợ", () => {
    const pham = THU_MUC.flatMap(liet).filter((p) =>
      boChuThich(readFileSync(p, "utf8")).includes(GIO_HO_TRO),
    );
    expect(pham.map((p) => relative(GOC, p))).toEqual([]);
  });
});
```

- [ ] **Bước 2: Chạy test cho đỏ**

Chạy: `npx vitest run test/conventions/gio-ho-tro-mot-nguon.test.ts -w apps/web`
Chờ: FAIL — danh sách phạm chứa `features/about/SupportCenter.tsx`.

- [ ] **Bước 3: Thêm primitive `LienKetNut`**

Thêm vào cuối `apps/web/src/components/ui/primitives.tsx`:

```tsx
/** Liên kết trông như nút chính. Có `<Button>` rồi nhưng nó render `<button>` — điều hướng
 * phải là `<a>` để trình đọc màn hình, chuột giữa và "mở tab mới" hoạt động đúng.
 * `ngoai = false` cho các lược đồ không rời trang như `tel:` và `mailto:`. */
export function LienKetNut({
  href,
  ngoai = true,
  children,
}: {
  href: string;
  ngoai?: boolean;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      {...(ngoai ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--sp-2)",
        padding: "var(--sp-3) var(--sp-5)",
        fontSize: "var(--fs-base)",
        fontWeight: "var(--fw-semibold)",
        color: "var(--text-on-brand)",
        background: "var(--brand-600)",
        border: "1px solid transparent",
        borderRadius: "var(--radius-md)",
        textDecoration: "none",
      }}
    >
      {children}
    </a>
  );
}
```

Kiểu ở đây **giống nguyên văn** `LinkButton` cũ trong `SupportCenter.tsx`, nên
`about.test.tsx` (đang kiểm `href`, `target`, `rel`) vẫn xanh.

- [ ] **Bước 4: Dọn `SupportCenter.tsx`**

Ba sửa đổi:

1. Xóa hẳn hàm `LinkButton` (dòng 8–32) và bỏ `ReactNode` khỏi dòng `import` nếu không còn chỗ
   nào dùng.
2. Sửa khối import đầu tệp thành:

```tsx
import { useId, useState } from "react";
import { LienKetNut } from "../../components/ui/primitives";
import { CONTACT_PHONE, GIO_HO_TRO } from "../../lib/contact";
import { whatsappUrl, zaloUrl } from "../../lib/contactLinks";
import { FAQ } from "../../lib/faq";
```

3. Thay hai nút và dòng giờ hỗ trợ:

```tsx
<LienKetNut href={zaloUrl(CONTACT_PHONE)}>Góp ý qua Zalo</LienKetNut>
<LienKetNut href={whatsappUrl(CONTACT_PHONE)}>Góp ý qua WhatsApp</LienKetNut>
```

```tsx
<p style={{ color: "var(--text-secondary)", margin: "var(--sp-4) 0 0" }}>
  <strong>Giờ hỗ trợ: {GIO_HO_TRO}</strong>
</p>
```

- [ ] **Bước 5: Chạy test cho xanh — cả ca cũ**

Chạy: `npx vitest run test/conventions/gio-ho-tro-mot-nguon.test.ts test/features/about.test.tsx -w apps/web`
Chờ: PASS cả hai tệp. `about.test.tsx` phải **vẫn xanh** — nó là bằng chứng việc dọn không đổi
hành vi nhìn thấy được.

- [ ] **Bước 6: Commit**

```bash
git add apps/web/src/components/ui/primitives.tsx apps/web/src/features/about/SupportCenter.tsx apps/web/test/conventions/gio-ho-tro-mot-nguon.test.ts
git commit -m "refactor(web): nâng nút liên kết lên primitive, giờ hỗ trợ về một nguồn"
```

---

### Nhiệm vụ 3: Khối "Cần hỗ trợ?" trên màn Đăng nhập và Đăng ký

**Tệp:**
- Tạo: `apps/web/src/components/KhoiHoTro.tsx`
- Sửa: `apps/web/src/features/auth/LoginPage.tsx:178-180` (chèn sau dòng "Chưa có tài khoản?")
- Sửa: `apps/web/src/features/auth/DangKyPage.tsx:182-184` (chèn trong khối bọc, sau `<Card>`)
- Tạo: `apps/web/test/features/khoiHoTro.test.tsx`

**Giao diện:**
- Dùng của nhiệm vụ trước: `GIO_HO_TRO`, `CONTACT_PHONE`, `telUrl`, `hienThiSoDienThoai`,
  `zaloUrl`, `whatsappUrl`, `LienKetNut`.
- Cung cấp cho nhiệm vụ sau: `KhoiHoTro()` — component không nhận props.

- [ ] **Bước 1: Viết test đỏ**

Tạo `apps/web/test/features/khoiHoTro.test.tsx`:

```tsx
// Khối "Cần hỗ trợ?" — kênh liên hệ trên các trang CÔNG KHAI.
//
// VÌ SAO nằm ở cột trái chứ không ở panel giới thiệu bên phải: `LoginPage` đặt
// `hidden={isMobile}` cho <aside>, tức panel phải BIẾN MẤT trên điện thoại. Đặt kênh hỗ trợ
// vào đó là giấu nó khỏi một nửa người dùng.
import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KhoiHoTro } from "../../src/components/KhoiHoTro";
import { CONTACT_PHONE, GIO_HO_TRO } from "../../src/lib/contact";
import {
  hienThiSoDienThoai,
  telUrl,
  whatsappUrl,
  zaloUrl,
} from "../../src/lib/contactLinks";
import { AppRouter } from "../../src/routes/AppRouter";
import { json, mockFetch, renderWithProviders } from "../helpers/renderApp";

/** Kịch bản "chưa đăng nhập": mockFetch CÓ khai `login` ⇒ `/me` trả 401 cho tới khi đăng
 * nhập thật. Khai `me` mà không khai `login` là kịch bản đã-có-cookie, sai đời cho ca này. */
function chuaDangNhap() {
  mockFetch({ login: () => json(401, { error: "unauthorized" }) });
}

describe("Khối Cần hỗ trợ?", () => {
  afterEach(() => vi.restoreAllMocks());

  it("đủ ba kênh liên hệ, tất cả dẫn xuất từ hàm dựng liên kết", () => {
    renderWithProviders(<KhoiHoTro />);
    expect(screen.getByRole("link", { name: "Nhắn qua Zalo" })).toHaveAttribute(
      "href",
      zaloUrl(CONTACT_PHONE),
    );
    expect(screen.getByRole("link", { name: "Nhắn qua WhatsApp" })).toHaveAttribute(
      "href",
      whatsappUrl(CONTACT_PHONE),
    );
    expect(
      screen.getByRole("link", { name: hienThiSoDienThoai(CONTACT_PHONE) }),
    ).toHaveAttribute("href", telUrl(CONTACT_PHONE));
  });

  it("hiện giờ hỗ trợ đọc từ nguồn chung", () => {
    renderWithProviders(<KhoiHoTro />);
    expect(screen.getByText(new RegExp(GIO_HO_TRO))).toBeInTheDocument();
  });

  // CHỐNG BỊA SỐ: ca trên so với `hienThiSoDienThoai(CONTACT_PHONE)` nên một chuỗi gõ tay
  // TRÙNG khớp vẫn lọt. Ca này quét toàn bộ chữ trên khối: không được có dãy số nào khác.
  it("không có dãy số nào khác số liên hệ lọt vào khối", () => {
    const { container } = renderWithProviders(<KhoiHoTro />);
    const cacDay = (container.textContent ?? "").match(/\d[\d ]{8,}\d/g) ?? [];
    expect(cacDay).toHaveLength(1);
    expect(cacDay[0]?.replace(/\s/g, "")).toBe(CONTACT_PHONE);
  });

  it("Zalo và WhatsApp mở tab mới, chống tabnabbing; nút gọi thì không", () => {
    renderWithProviders(<KhoiHoTro />);
    const zalo = screen.getByRole("link", { name: "Nhắn qua Zalo" });
    expect(zalo).toHaveAttribute("target", "_blank");
    expect(zalo.getAttribute("rel")).toContain("noopener");
    // `tel:` không rời trang — mở tab mới chỉ để lại một tab trắng.
    expect(
      screen.getByRole("link", { name: hienThiSoDienThoai(CONTACT_PHONE) }),
    ).not.toHaveAttribute("target");
  });

  it("có mặt ở màn Đăng nhập", async () => {
    chuaDangNhap();
    renderWithProviders(<AppRouter />, "/login");
    expect(await screen.findByRole("heading", { name: "Cần hỗ trợ?" })).toBeInTheDocument();
  });

  // QĐ-6 (chủ dự án, 2026-08-06): trang Đăng ký KHÔNG thêm Footer. Ca này khóa quyết định
  // lại, để lần sau không ai "sửa cho đồng bộ" mà vô tình lật nó.
  it("có mặt ở trang Đăng ký, và trang đó vẫn không có Footer", async () => {
    chuaDangNhap();
    const { container } = renderWithProviders(<AppRouter />, "/dang-ky");
    expect(await screen.findByRole("heading", { name: "Cần hỗ trợ?" })).toBeInTheDocument();
    expect(container.querySelector("footer")).toBeNull();
  });
});
```

- [ ] **Bước 2: Chạy test cho đỏ**

Chạy: `npx vitest run test/features/khoiHoTro.test.tsx -w apps/web`
Chờ: FAIL — không phân giải được `../../src/components/KhoiHoTro`.

- [ ] **Bước 3: Tạo component**

Tạo `apps/web/src/components/KhoiHoTro.tsx`:

```tsx
// Khối "Cần hỗ trợ?" trên các trang CÔNG KHAI (Đăng nhập, Đăng ký).
//
// VỊ TRÍ CÓ CHỦ ĐÍCH — cột trái, ngay dưới form. `LoginPage` đặt `hidden={isMobile}` cho
// panel giới thiệu bên phải, nên mọi thứ đặt vào panel đó biến mất trên điện thoại.
//
// NGUỒN SỰ THẬT — không gõ chuỗi rời: số điện thoại + giờ hỗ trợ đọc từ `lib/contact.ts`;
// URL Zalo/WhatsApp/tel dựng bằng hàm ở `lib/contactLinks.ts`.
import { CONTACT_PHONE, GIO_HO_TRO } from "../lib/contact";
import { hienThiSoDienThoai, telUrl, whatsappUrl, zaloUrl } from "../lib/contactLinks";
import { LienKetNut, SectionTitle } from "./ui/primitives";

export function KhoiHoTro() {
  return (
    <div
      style={{
        display: "grid",
        gap: "var(--sp-3)",
        paddingTop: "var(--sp-4)",
        borderTop: "1px solid var(--border-subtle)",
      }}
    >
      <SectionTitle>Cần hỗ trợ?</SectionTitle>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-3)" }}>
        <LienKetNut href={zaloUrl(CONTACT_PHONE)}>Nhắn qua Zalo</LienKetNut>
        <LienKetNut href={whatsappUrl(CONTACT_PHONE)}>Nhắn qua WhatsApp</LienKetNut>
      </div>
      <p
        style={{
          margin: 0,
          fontSize: "var(--fs-base)",
          lineHeight: "var(--lh-body)",
          color: "var(--text-secondary)",
        }}
      >
        Hoặc gọi{" "}
        <a href={telUrl(CONTACT_PHONE)} style={{ color: "var(--info-600)" }}>
          {hienThiSoDienThoai(CONTACT_PHONE)}
        </a>{" "}
        — giờ hỗ trợ {GIO_HO_TRO}.
      </p>
    </div>
  );
}
```

- [ ] **Bước 4: Chèn vào màn Đăng nhập**

Trong `apps/web/src/features/auth/LoginPage.tsx`, thêm import:

```tsx
import { KhoiHoTro } from "../../components/KhoiHoTro";
```

và chèn ngay **sau** đoạn "Chưa có tài khoản? Đăng ký", vẫn bên trong `<form>`:

```tsx
            <p style={{ fontSize: "var(--fs-base)", margin: 0 }}>
              Chưa có tài khoản? <Link to="/dang-ky">Đăng ký</Link>
            </p>

            <KhoiHoTro />
```

- [ ] **Bước 5: Chèn vào trang Đăng ký**

Trong `apps/web/src/features/auth/DangKyPage.tsx`, thêm import:

```tsx
import { KhoiHoTro } from "../../components/KhoiHoTro";
```

và chèn ngay **sau** khối `{xong ? … : …}`, tức là con cuối của
`<div style={{ width: "min(100%, 34rem)", … }}>`:

```tsx
        <KhoiHoTro />
      </div>
```

Đặt ở đây thì khối hiện cả lúc đang điền form lẫn lúc đã gửi và đang chờ duyệt — chờ duyệt
đúng là lúc người ta hay muốn hỏi nhất.

- [ ] **Bước 6: Chạy test cho xanh**

Chạy: `npx vitest run test/features/khoiHoTro.test.tsx test/features/auth.test.tsx test/features/dangKy.test.tsx -w apps/web`
Chờ: PASS cả ba tệp. Hai tệp cũ phải **vẫn xanh** — chèn khối mới không được làm lệch bất kỳ
truy vấn nào của chúng.

- [ ] **Bước 7: Commit**

```bash
git add apps/web/src/components/KhoiHoTro.tsx apps/web/src/features/auth/LoginPage.tsx apps/web/src/features/auth/DangKyPage.tsx apps/web/test/features/khoiHoTro.test.tsx
git commit -m "feat(web): khối Cần hỗ trợ? trên màn Đăng nhập và Đăng ký"
```

---

### Nhiệm vụ 4: Hook cuộn theo neo

React Router không tự cuộn tới `id` khi điều hướng trong SPA, nên `/gioi-thieu#faq` từ Footer
vốn mở đúng trang mà dừng ở đầu trang.

**Tệp:**
- Tạo: `apps/web/src/lib/useCuonTheoHash.ts`
- Test: `apps/web/test/lib/useCuonTheoHash.test.tsx`

**Giao diện:**
- Dùng của nhiệm vụ trước: không có.
- Cung cấp cho nhiệm vụ sau: `useCuonTheoHash(sanSang: boolean): void`.

- [ ] **Bước 1: Viết test đỏ**

Tạo `apps/web/test/lib/useCuonTheoHash.test.tsx`:

```tsx
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
```

- [ ] **Bước 2: Chạy test cho đỏ**

Chạy: `npx vitest run test/lib/useCuonTheoHash.test.tsx -w apps/web`
Chờ: FAIL — không phân giải được `../../src/lib/useCuonTheoHash`.

- [ ] **Bước 3: Hiện thực hook**

Tạo `apps/web/src/lib/useCuonTheoHash.ts`:

```ts
// Cuộn tới mục mang `id` khớp `location.hash`. React Router KHÔNG tự làm việc này khi điều
// hướng trong SPA — trình duyệt chỉ cuộn theo neo khi tải trang thật. Không có hook này thì
// "Câu hỏi thường gặp" ở Footer mở đúng trang nhưng dừng ở đầu trang, trông như liên kết hỏng.
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/** `sanSang` = nội dung đã dựng xong chưa. Trong lúc phiên còn ở trạng thái `checking`, trang
 * đích chưa render nên `#faq` chưa tồn tại trong DOM — cuộn lúc đó là cuộn vào chỗ trống. */
export function useCuonTheoHash(sanSang: boolean): void {
  const { hash } = useLocation();
  useEffect(() => {
    if (!sanSang || hash === "") return;
    const dich = document.getElementById(hash.slice(1));
    dich?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [hash, sanSang]);
}
```

- [ ] **Bước 4: Chạy test cho xanh**

Chạy: `npx vitest run test/lib/useCuonTheoHash.test.tsx -w apps/web`
Chờ: PASS, mã thoát 0.

- [ ] **Bước 5: Commit**

```bash
git add apps/web/src/lib/useCuonTheoHash.ts apps/web/test/lib/useCuonTheoHash.test.tsx
git commit -m "feat(web): cuộn tới đúng mục khi điều hướng theo neo"
```

---

### Nhiệm vụ 5: Mở `/gioi-thieu` ra công khai

**Tệp:**
- Tạo: `apps/web/src/components/layout/KhungCongKhai.tsx`
- Sửa: `apps/web/src/routes/AppRouter.tsx:130` (gỡ khỏi `ProtectedLayout`), `:80-96` (thêm route)
- Test: `apps/web/test/features/gioiThieuCongKhai.test.tsx`

**Giao diện:**
- Dùng của nhiệm vụ trước: `useCuonTheoHash(sanSang: boolean)`.
- Cung cấp cho nhiệm vụ sau: không có — đây là nhiệm vụ hiện thực cuối.

- [ ] **Bước 1: Viết test đỏ**

Tạo `apps/web/test/features/gioiThieuCongKhai.test.tsx`:

```tsx
// `/gioi-thieu` mở ra CÔNG KHAI (QĐ-1, chủ dự án 2026-08-06).
//
// Trước thay đổi này route nằm trong `ProtectedLayout`, nên ba liên kết trong cột "Hỗ trợ" của
// Footer — "Giới thiệu & Hỗ trợ", "Câu hỏi thường gặp", "Lịch sử cập nhật" — đều bật ngược về
// màn Đăng nhập với khách chưa có tài khoản, không báo lỗi gì. Đó là liên kết chết.
//
// Ca "đã đăng nhập vẫn thấy sidebar" là ca CHỐNG HỒI QUY quan trọng nhất ở đây: chuyển route
// ra ngoài `ProtectedLayout` rất dễ làm người đang dùng app mất khung điều hướng.
import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppRouter } from "../../src/routes/AppRouter";
import { json, mockFetch, renderWithProviders } from "../helpers/renderApp";

function chuaDangNhap() {
  mockFetch({ login: () => json(401, { error: "unauthorized" }) });
}

function daDangNhap() {
  mockFetch({
    me: () =>
      json(200, {
        ten: "Công ty TNHH Tour Đảo",
        mst: "4201568932",
        goiDichVu: "Miễn phí",
        role: "ke_toan_truong",
      }),
  });
}

describe("Trang Giới thiệu & Hỗ trợ — công khai", () => {
  afterEach(() => vi.restoreAllMocks());

  it("chưa đăng nhập: đọc được nội dung, KHÔNG bị đá về màn Đăng nhập", async () => {
    chuaDangNhap();
    renderWithProviders(<AppRouter />, "/gioi-thieu");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Giới thiệu & Hỗ trợ" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: "Đăng nhập" })).toBeNull();
  });

  it("chưa đăng nhập: có Footer và lối quay lại Đăng nhập", async () => {
    chuaDangNhap();
    const { container } = renderWithProviders(<AppRouter />, "/gioi-thieu");
    await screen.findByRole("heading", { level: 1, name: "Giới thiệu & Hỗ trợ" });
    expect(container.querySelector("footer")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Đăng nhập" })).toHaveAttribute("href", "/login");
  });

  it("chưa đăng nhập: KHÔNG có thanh điều hướng của ứng dụng", async () => {
    chuaDangNhap();
    renderWithProviders(<AppRouter />, "/gioi-thieu");
    await screen.findByRole("heading", { level: 1, name: "Giới thiệu & Hỗ trợ" });
    expect(screen.queryByRole("navigation", { name: "Điều hướng chính" })).toBeNull();
  });

  it("đã đăng nhập: vẫn thấy thanh điều hướng như cũ", async () => {
    daDangNhap();
    renderWithProviders(<AppRouter />, "/gioi-thieu");
    expect(
      await screen.findByRole("navigation", { name: "Điều hướng chính" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Giới thiệu & Hỗ trợ" }),
    ).toBeInTheDocument();
  });
});

describe("Neo #faq và #lich-su cuộn tới đúng mục", () => {
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
    vi.restoreAllMocks();
  });

  it("chưa đăng nhập: /gioi-thieu#faq cuộn tới mục FAQ", async () => {
    chuaDangNhap();
    renderWithProviders(<AppRouter />, "/gioi-thieu#faq");
    await screen.findByRole("heading", { level: 1, name: "Giới thiệu & Hỗ trợ" });
    expect(daCuonToi).toContain("faq");
  });

  it("đã đăng nhập: /gioi-thieu#lich-su cuộn tới mục Lịch sử", async () => {
    daDangNhap();
    renderWithProviders(<AppRouter />, "/gioi-thieu#lich-su");
    await screen.findByRole("navigation", { name: "Điều hướng chính" });
    expect(daCuonToi).toContain("lich-su");
  });
});
```

- [ ] **Bước 2: Chạy test cho đỏ**

Chạy: `npx vitest run test/features/gioiThieuCongKhai.test.tsx -w apps/web`
Chờ: FAIL — ca "chưa đăng nhập" tìm không thấy tiêu đề vì bị chuyển hướng về `/login`.

- [ ] **Bước 3: Tạo khung công khai**

Tạo `apps/web/src/components/layout/KhungCongKhai.tsx`:

```tsx
// Khung cho trang CÔNG KHAI có nội dung dài — hiện chỉ `/gioi-thieu` khi chưa đăng nhập.
// Không sidebar, không hồ sơ người dùng: chưa có phiên thì chẳng có gì để hiện, và mọi liên
// kết trong ứng dụng đều sẽ bật về màn Đăng nhập.
//
// Bề ngang giới hạn 1200px cho khớp `Footer` — lệch số này thì nội dung và chân trang so le.
import { Link, Outlet } from "react-router-dom";
import { Brand } from "../Brand";
import { Footer } from "./Footer";

export function KhungCongKhai() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          borderBottom: "1px solid var(--border-subtle)",
          background: "var(--surface-card)",
          padding: "var(--sp-4) var(--sp-8)",
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--sp-4)",
          }}
        >
          <Brand />
          <Link
            to="/login"
            style={{ color: "var(--info-600)", fontSize: "var(--fs-base)" }}
          >
            Đăng nhập
          </Link>
        </div>
      </header>

      <main
        style={{
          flex: 1,
          width: "100%",
          maxWidth: 1200,
          margin: "0 auto",
          padding: "var(--sp-8)",
        }}
      >
        <Outlet />
      </main>

      {/* KHÔNG truyền `role` — biến thể ẩn cột "Sản phẩm", vì chưa đăng nhập thì mọi liên kết
          trong ứng dụng đều là liên kết chết. `Footer` đã lo sẵn biến thể này. */}
      <Footer />
    </div>
  );
}
```

- [ ] **Bước 4: Chuyển route trong `AppRouter.tsx`**

Bốn sửa đổi:

1. Thêm import:

```tsx
import { KhungCongKhai } from "../components/layout/KhungCongKhai";
import { useCuonTheoHash } from "../lib/useCuonTheoHash";
```

2. Thêm hàm khung, đặt ngay sau `DangKyRoute`:

```tsx
/** U42 — `/gioi-thieu` CÔNG KHAI, khung đổi theo trạng thái phiên.
 *
 * Trước đây route này nằm trong `ProtectedLayout`, nên ba liên kết trong cột "Hỗ trợ" của
 * Footer bật ngược về màn Đăng nhập với khách chưa có tài khoản — liên kết chết, không báo
 * lỗi gì. Nội dung trang vốn thuần tĩnh (giới thiệu, FAQ, changelog), không gọi API và không
 * chạm dữ liệu tenant, nên chẳng có lý do gì phải giấu sau đăng nhập.
 *
 * MỘT đường dẫn, MỘT nội dung: người đã đăng nhập vẫn nhận `AppLayout` y như cũ. Tách thành
 * hai URL sẽ là hai nguồn sự thật cho cùng một trang. */
function KhungGioiThieu() {
  const { status, me, logout } = useAuth();
  // Hook gọi TRƯỚC mọi nhánh trả sớm — nhánh `checking` không được làm lệch thứ tự hook.
  useCuonTheoHash(status !== "checking");
  if (status === "checking") return <DangKiemTraPhien />;
  if (status === "authed" && me) return <AppLayout me={me} onLogout={logout} />;
  return <KhungCongKhai />;
}
```

3. **Xóa** dòng trong `ProtectedLayout`:

```tsx
        <Route path="gioi-thieu" element={<AboutPage />} />
```

4. Thêm route mới, đặt cạnh các route công khai khác (trước `<Route element={<ProtectedLayout />}>`):

```tsx
      <Route path="/gioi-thieu" element={<KhungGioiThieu />}>
        <Route index element={<AboutPage />} />
      </Route>
```

- [ ] **Bước 5: Chạy test cho xanh**

Chạy: `npx vitest run test/features/gioiThieuCongKhai.test.tsx test/features/footerNhieuCot.test.tsx test/features/responsiveNav.test.tsx -w apps/web`
Chờ: PASS cả ba. Hai tệp cũ phải **vẫn xanh** — chúng là bằng chứng Footer và thanh điều hướng
không bị chuyển route làm gãy.

- [ ] **Bước 6: Chạy cổng đầy đủ**

Chạy: `make lint && make test`
Chờ: **mã thoát 0**. Không đọc dòng đếm — Vitest có thể in "N passed" mà vẫn thoát khác 0.

- [ ] **Bước 7: Commit**

```bash
git add apps/web/src/components/layout/KhungCongKhai.tsx apps/web/src/routes/AppRouter.tsx apps/web/test/features/gioiThieuCongKhai.test.tsx
git commit -m "feat(web): mở trang Giới thiệu & Hỗ trợ ra công khai"
```

---

### Nhiệm vụ 6: Xác minh bằng mắt và chốt với chủ dự án

QĐ-7 (chủ dự án, 2026-08-06): **không đóng đơn vị khi chưa có ảnh chụp được duyệt.** Test xanh
không chứng minh bố cục đọc được — riêng khổ hẹp là nơi panel giới thiệu biến mất, tức là nơi
quyết định vị trí khối hỗ trợ (QĐ-2) đúng hay sai.

**Tệp:** không sửa mã. Nếu phát sinh chỉnh sửa từ phản hồi, sửa rồi chạy lại cổng ở bước 4.

- [ ] **Bước 1: Chạy bản dev tại máy**

```bash
npm run dev -w apps/web
```

Ghi lại địa chỉ Vite in ra (thường `http://localhost:5173`).

- [ ] **Bước 2: Chụp bốn màn, mỗi màn hai khổ**

Khổ máy tính 1440×900 và khổ điện thoại 390×844 (dùng chế độ thiết bị của trình duyệt):

1. `/login`
2. `/dang-ky`
3. `/gioi-thieu` khi **đã đăng xuất**
4. `/gioi-thieu` khi **đã đăng nhập**

Với màn 4, đăng nhập bằng tài khoản thật rồi mới mở đường dẫn.

- [ ] **Bước 3: Kiểm bằng mắt bốn điểm**

- Khối "Cần hỗ trợ?" **hiện ở khổ điện thoại** trên cả `/login` lẫn `/dang-ky`.
- Bấm "Câu hỏi thường gặp" ở Footer màn Đăng nhập: mở đúng trang và **cuộn tới mục FAQ**,
  không dừng ở đầu trang, không bật về màn Đăng nhập.
- `/gioi-thieu` lúc đã đăng nhập: sidebar, header, vai còn nguyên.
- Số điện thoại hiện đúng `0989 929 373` và bấm được.

- [ ] **Bước 4: Đưa chủ dự án duyệt**

Gửi tám ảnh kèm kết quả bước 3. **Chờ duyệt.** Có chỉnh sửa thì sửa, chạy lại
`make lint && make test`, chụp lại phần liên quan, rồi xin duyệt lần nữa.

- [ ] **Bước 5: Cập nhật tài liệu và đóng đơn vị**

Thêm mục sau vào **đầu** mảng `CHANGELOG` trong `apps/web/src/lib/changelog.ts` (mới nhất đứng
đầu). Đặt `date` là ngày thi công thật, không chép ngày trong kế hoạch:

```ts
  {
    version: "v2.5",
    date: "2026-08-06",
    title: "Kênh hỗ trợ hiện ngay ở màn hình đăng nhập",
    changes: [
      "Màn hình Đăng nhập và trang Đăng ký nay có khối 'Cần hỗ trợ?' ngay dưới biểu mẫu, gồm nút nhắn qua Zalo, nút nhắn qua WhatsApp, số điện thoại bấm gọi được và giờ hỗ trợ. Khối này hiện trên cả máy tính lẫn điện thoại.",
      "Trang Giới thiệu & Hỗ trợ nay đọc được mà không cần đăng nhập. Trước đây các liên kết Câu hỏi thường gặp và Lịch sử cập nhật ở chân trang đưa người chưa có tài khoản quay lại màn hình đăng nhập.",
      "Bấm vào Câu hỏi thường gặp hoặc Lịch sử cập nhật nay đưa thẳng tới đúng mục, không dừng ở đầu trang.",
    ],
    kind: "improvement",
  },
```

Đối chiếu số hiệu phiên bản với mục đầu mảng trước khi ghi — nếu đã có `v2.5` thì tăng tiếp.

```bash
git add apps/web/src/lib/changelog.ts
git commit -m "docs(web): changelog — kênh hỗ trợ trên trang công khai"
```

---

## Ghi chú thi công

**Không đụng tới:** nội dung `AboutPage`, `Footer.tsx`, `nav.ts`, RBAC, API, schema, dữ liệu
tenant. Nếu thấy "tiện tay sửa luôn", dừng lại — đó là nở phạm vi.

**Nếu `about.test.tsx` đỏ sau nhiệm vụ 2:** nghĩa là kiểu của `LienKetNut` lệch khỏi
`LinkButton` cũ, hoặc chuỗi giờ hỗ trợ đổi ký tự gạch ngang. So lại từng thuộc tính; không sửa
test cũ cho khớp mã mới — test cũ đang mô tả đúng hành vi phải giữ.

**Nếu `vi.spyOn(Element.prototype, "scrollIntoView")` ném "not a function":** đó là dấu jsdom
không hiện thực hàm này. Kế hoạch đã dùng `Object.defineProperty` thay cho `spyOn` đúng vì lý
do đó — đừng đổi ngược lại.

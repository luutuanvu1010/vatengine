# U17b — Đăng ký công khai + cổng trạng thái login — Kế hoạch thực thi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Mở cổng đăng ký công khai có kiểm soát — khách tự đăng ký → tenant `cho_duyet`, chưa đăng nhập được cho tới khi Admin duyệt (U18).

**Architecture:** Endpoint công khai `POST /dang-ky` (không auth) tạo `tenants` + `nguoi_dung` trong một transaction dưới `withTenant(UUID tự sinh)`. Chống lạm dụng bằng Durable Object `SignupLimiter` khoá theo IP. Cổng trạng thái ở `POST /auth/login` chặn tenant chưa duyệt bằng **đúng nhánh 401 gọn đang có**, không thêm mã lỗi mới (chống dò tài khoản).

**Tech Stack:** TypeScript · Hono · Drizzle · PostgreSQL (Neon) · Cloudflare Durable Objects · Vitest + PGlite

## Global Constraints

- **Spec nguồn:** `docs/plans/U17-plan.md` §3.2, §3.3, §3.4 + QĐ-1..QĐ-4. Mọi quyết định ở đó là ràng buộc.
- **Worktree:** `/Users/tuanbao/Documents/Projects/vat-u17`, nhánh `feat/u17b-dang-ky-cong-khai`, cắt từ trunk `1940687`.
- **TDD bắt buộc**: test đỏ trước. Coverage tầng nghiệp vụ ≥ 80%.
- **Chạy test PHẢI qua workspace**: `npm run test -w apps/api`. Chạy `vitest` từ gốc kho mất môi trường jsdom và không nạp config timeout — phiên trước đã chẩn đoán nhầm hai lần vì lỗi này.
- **Chú thích tiếng Việt.** Commit tiếng Việt, kết thúc bằng:
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```
- **Không hard-code bí mật, không log dữ liệu nhạy cảm** (`.claude/rules/security.md`).

## ⚠️ HAI ĐIỀU CHỈNH SO VỚI SPEC — đọc trước

**1. Migration là `0008`, KHÔNG phải `0007`.** Spec §3.3 viết "migration `0007` `CREATE OR REPLACE` `auth_lookup_user`". Nhưng `0007` **đã áp lên production 2026-07-19** — sửa file đã áp thì drizzle bỏ qua vĩnh viễn (nó so mốc thời gian, không so hash). Tạo `0008_auth_lookup_trang_thai.sql`.

**2. Luồng login đã đổi (U29, PR #14).** Token nay đi bằng **cookie HttpOnly** (`setSessionCookie`), không trả trong body; đăng nhập thành công trả `{ ok: true }`. Mọi số dòng trong spec §3.3 đã lệch — đọc mã thật.

## ⚠️ BẤT BIẾN CHỐNG DÒ TÀI KHOẢN — không được phá

`POST /auth/login` hiện có ba bảo đảm. Thêm cổng trạng thái **không được** làm hỏng cái nào:

1. **verify PBKDF2 luôn chạy đúng một lần** kể cả khi email không tồn tại (`DUMMY_HASH`) → độ trễ đồng nhất.
2. **`limiter.recordFailure()` gọi uniform** cho mọi nhánh sai.
3. **Audit đẩy off-critical-path** qua `settle()` → độ trễ không phụ thuộc việc có ghi audit hay không.

⇒ Cổng trạng thái phải nằm **trong cùng biểu thức điều kiện** của nhánh 401 hiện có, không phải một `if` riêng đặt trước.

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `packages/db/migrations/0008_auth_lookup_trang_thai.sql` | **Tạo.** `CREATE OR REPLACE auth_lookup_user` trả thêm `tenant_trang_thai` |
| `apps/api/src/lib/disposableDomains.ts` | **Tạo.** Danh sách tĩnh ~50 miền dùng-1-lần |
| `apps/api/src/lib/validateEmailDangKy.ts` | **Tạo.** Hàm thuần validate email đăng ký |
| `apps/api/src/signupLimiter.ts` | **Tạo.** Logic thuần đếm lượt đăng ký theo cửa sổ trượt |
| `apps/api/src/signupLimiterDO.ts` | **Tạo.** Durable Object bọc mỏng logic trên |
| `apps/api/src/routes/dangKy.ts` | **Tạo.** `POST /dang-ky` |
| `apps/api/src/routes/auth.ts` | **Sửa.** Cổng trạng thái vào nhánh 401 hiện có |
| `apps/api/src/types.ts` | **Sửa.** Thêm `SIGNUP_LIMITER` binding + `getSignupLimiter` vào `AppDeps` |
| `apps/api/src/app.ts` | **Sửa.** Mount `/dang-ky` |
| `apps/api/src/index.ts` | **Sửa.** Wiring DO thật |
| `apps/api/wrangler.jsonc` | **Sửa.** Binding + migration tag `v5` (thuần cộng dồn) |

---

## Task 1: `validateEmailDangKy` + `disposableDomains`

Hàm thuần, không phụ thuộc gì — làm trước.

**Files:** Create `apps/api/src/lib/disposableDomains.ts`, `apps/api/src/lib/validateEmailDangKy.ts`; Test `apps/api/test/unit/validateEmailDangKy.test.ts`

**Interfaces:**
- Produces: `validateEmailDangKy(email: string): { ok: true } | { ok: false; ly_do: 'dang_sai' | 'alias_cong' | 'mien_dung_mot_lan' | 'mien_khong_duoc_phep' }`

- [ ] **Step 1: Viết test đỏ** — `apps/api/test/unit/validateEmailDangKy.test.ts`

```ts
// U17b (§3.4) — Validate email đăng ký công khai. Thứ tự kiểm CÓ CHỦ Ý: dạng → alias '+' →
// miền dùng-1-lần → allowlist đuôi. Mỗi tầng chặn một kiểu lạm dụng khác nhau, và thứ tự
// quyết định THÔNG BÁO người dùng nhận được.
import { describe, expect, it } from "vitest";
import { validateEmailDangKy } from "../../src/lib/validateEmailDangKy";

describe("validateEmailDangKy", () => {
  it("email doanh nghiệp hợp lệ → ok", () => {
    for (const e of [
      "ketoan@tourdao.com.vn", "a@congty.vn", "x@abc.com",
      "y@abc.net.vn", "z@truong.edu.vn", "w@to-chuc.org",
    ]) expect(validateEmailDangKy(e)).toEqual({ ok: true });
  });

  it("gmail/yahoo được phép (khách nhỏ thường dùng)", () => {
    expect(validateEmailDangKy("anh.nguyen@gmail.com")).toEqual({ ok: true });
    expect(validateEmailDangKy("chi@yahoo.com")).toEqual({ ok: true });
  });

  it("dạng sai → dang_sai", () => {
    for (const e of ["", "khongcoa", "@abc.com", "a@", "a@b", "a b@abc.com", "a@@b.com"])
      expect(validateEmailDangKy(e)).toEqual({ ok: false, ly_do: "dang_sai" });
  });

  it("alias dấu cộng bị chặn (một người tạo vô hạn tài khoản từ 1 hộp thư)", () => {
    expect(validateEmailDangKy("a+1@gmail.com")).toEqual({ ok: false, ly_do: "alias_cong" });
    expect(validateEmailDangKy("ketoan+test@tourdao.com.vn")).toEqual({
      ok: false, ly_do: "alias_cong",
    });
  });

  it("miền dùng-1-lần bị chặn", () => {
    expect(validateEmailDangKy("a@mailinator.com")).toEqual({
      ok: false, ly_do: "mien_dung_mot_lan",
    });
    // KHÔNG phân biệt hoa/thường — miền là case-insensitive.
    expect(validateEmailDangKy("a@MAILINATOR.COM")).toEqual({
      ok: false, ly_do: "mien_dung_mot_lan",
    });
  });

  it("đuôi ngoài allowlist bị chặn", () => {
    for (const e of ["a@abc.xyz", "a@abc.top", "a@abc.ru"])
      expect(validateEmailDangKy(e)).toEqual({ ok: false, ly_do: "mien_khong_duoc_phep" });
  });

  it("THỨ TỰ: miền dùng-1-lần được kiểm TRƯỚC allowlist đuôi", () => {
    // mailinator.com có đuôi .com hợp lệ — nếu kiểm allowlist trước thì nó lọt.
    expect(validateEmailDangKy("a@mailinator.com").ok).toBe(false);
    expect(validateEmailDangKy("a@mailinator.com")).toEqual({
      ok: false, ly_do: "mien_dung_mot_lan",
    });
  });

  it("THỨ TỰ: alias '+' kiểm TRƯỚC miền — báo đúng lý do người dùng sửa được", () => {
    expect(validateEmailDangKy("a+x@mailinator.com")).toEqual({
      ok: false, ly_do: "alias_cong",
    });
  });

  it("khoảng trắng thừa hai đầu được bỏ qua, không làm sai kết quả", () => {
    expect(validateEmailDangKy("  a@abc.com  ")).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Chạy xác nhận ĐỎ** — `npx vitest run apps/api/test/unit/validateEmailDangKy.test.ts` → FAIL (chưa có module)

- [ ] **Step 3: Hiện thực**

`apps/api/src/lib/disposableDomains.ts` — danh sách tĩnh, **offline**, chữ thường:

```ts
// U17b (§3.4) — Miền email dùng-một-lần. Danh sách TĨNH, tra offline có chủ ý: gọi API bên
// thứ ba ở đường đăng ký công khai là thêm một phụ thuộc mạng vào đúng chỗ dễ bị dội tải
// nhất, và làm rò địa chỉ email của khách sang bên ngoài.
// Danh sách không bao giờ đầy đủ — nó chỉ nâng chi phí lạm dụng, không phải hàng rào tuyệt
// đối. Bổ sung dần khi thấy lạm dụng thật.
export const DISPOSABLE_DOMAINS: ReadonlySet<string> = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com",
  "temp-mail.org", "throwawaymail.com", "yopmail.com", "fakeinbox.com",
  "trashmail.com", "getnada.com", "dispostable.com", "maildrop.cc",
  "sharklasers.com", "grr.la", "guerrillamailblock.com", "spam4.me",
  "mailnesia.com", "mytemp.email", "tempinbox.com", "emailondeck.com",
  "mohmal.com", "tempr.email", "discard.email", "mailcatch.com",
  "inboxbear.com", "spambog.com", "burnermail.io", "anonaddy.com",
  "simplelogin.io", "33mail.com", "moakt.com", "tmpmail.org",
  "email-temp.com", "luxusmail.org", "vomoto.com", "byom.de",
  "one-time.email", "mailtemp.net", "instant-mail.de", "tmail.ws",
  "minuteinbox.com", "fakemail.net", "tempmailo.com", "mail-temp.com",
  "tempemail.co", "nowmymail.com", "spamgourmet.com", "trbvm.com",
  "harakirimail.com", "incognitomail.com",
]);
```

`apps/api/src/lib/validateEmailDangKy.ts`:

```ts
// U17b (§3.4) — Validate email đăng ký công khai. Hàm THUẦN, không side-effect.
//
// THỨ TỰ KIỂM CÓ CHỦ Ý (dạng → alias '+' → miền dùng-1-lần → allowlist đuôi): mỗi tầng chặn
// một kiểu lạm dụng khác, và thứ tự quyết định thông báo người dùng nhận được. Ví dụ
// "a+x@mailinator.com" sai CẢ HAI cách — báo 'alias_cong' trước vì đó là thứ người dùng
// hợp pháp sửa được ngay; báo 'mien_dung_mot_lan' cho một người dùng thật đang lỡ gõ dấu
// cộng thì họ không hiểu phải làm gì.
//
// Đây KHÔNG phải hàng rào tuyệt đối — chỉ nâng chi phí lạm dụng. Cổng thật là bước Admin
// duyệt ở U18.
import { DISPOSABLE_DOMAINS } from "./disposableDomains";

// QĐ-4. Sắp theo độ dài GIẢM DẦN để khớp đuôi ghép trước đuôi đơn ('com.vn' trước 'vn').
const DUOI_CHO_PHEP: readonly string[] = [
  "com.vn", "net.vn", "org.vn", "edu.vn", "gov.vn",
  "com", "net", "org", "vn", "biz", "info", "co",
];

// Hộp thư phổ thông được chấp nhận nguyên miền (khách nhỏ thường không có tên miền riêng).
const MIEN_PHO_THONG: ReadonlySet<string> = new Set(["gmail.com", "yahoo.com"]);

export type KetQuaValidate =
  | { ok: true }
  | {
      ok: false;
      ly_do: "dang_sai" | "alias_cong" | "mien_dung_mot_lan" | "mien_khong_duoc_phep";
    };

// Cố ý CHẶT hơn RFC 5322: chỉ chấp nhận dạng thông dụng. Đường đăng ký công khai không cần
// đỡ mọi biến thể hợp lệ về lý thuyết; chặt hơn = ít bề mặt lạm dụng hơn.
const DANG_EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

export function validateEmailDangKy(email: string): KetQuaValidate {
  const e = email.trim().toLowerCase();
  if (!DANG_EMAIL.test(e)) return { ok: false, ly_do: "dang_sai" };

  const [phanTen, mien] = e.split("@") as [string, string];
  if (phanTen.includes("+")) return { ok: false, ly_do: "alias_cong" };
  if (DISPOSABLE_DOMAINS.has(mien)) return { ok: false, ly_do: "mien_dung_mot_lan" };
  if (MIEN_PHO_THONG.has(mien)) return { ok: true };

  const hopLe = DUOI_CHO_PHEP.some((d) => mien.endsWith(`.${d}`));
  return hopLe ? { ok: true } : { ok: false, ly_do: "mien_khong_duoc_phep" };
}
```

- [ ] **Step 4: Chạy xác nhận XANH** — kỳ vọng 9 test pass
- [ ] **Step 5: `make lint` sạch**
- [ ] **Step 6: Commit** — `U17b-1: validateEmailDangKy + danh sách miền dùng-một-lần`

---

## Task 2: `SignupLimiter` — logic thuần + Durable Object

**Files:** Create `apps/api/src/signupLimiter.ts`, `apps/api/src/signupLimiterDO.ts`; Test `apps/api/test/unit/signupLimiter.test.ts`; Modify `apps/api/src/types.ts`, `apps/api/wrangler.jsonc`

**Interfaces:**
- Consumes: `clampInt` (`apps/api/src/configClamp.ts`, đã có từ U17a)
- Produces:
  - `resolveSignupLimitConfig(env): SignupLimitConfig` · `initialSignupState()` · `checkSignup(state, nowMs, cfg): SignupGate` · `recordSignup(state, nowMs, cfg): SignupState`
  - `SignupLimiterClient { check(): Promise<SignupGate>; record(): Promise<void> }` trong `types.ts`

> **KHÁC `LoginLimiter` ở điểm cốt lõi:** `LoginLimiter` đếm **lần SAI** rồi khoá, và `recordSuccess()` xoá sạch bộ đếm. `SignupLimiter` đếm **MỌI lượt** kể cả thành công — vì một kẻ lạm dụng đăng ký thành công 1000 tenant rác vẫn là lạm dụng. Đừng tái dùng `LoginLimiter`.

- [ ] **Step 1: Viết test đỏ** — `apps/api/test/unit/signupLimiter.test.ts`

```ts
// U17b (QĐ-2) — Logic đếm lượt đăng ký theo IP, cửa sổ trượt. THUẦN, nhận nowMs tiêm nên
// test xác định, không phụ thuộc đồng hồ thật.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SIGNUP_LIMIT_CONFIG, checkSignup, initialSignupState,
  recordSignup, resolveSignupLimitConfig,
} from "../../src/signupLimiter";

const CFG = { maxMoiCuaSo: 5, cuaSoMs: 60 * 60_000 };
const T0 = 1_700_000_000_000;

describe("signupLimiter", () => {
  it("dưới ngưỡng → cho qua", () => {
    let s = initialSignupState();
    for (let i = 0; i < 4; i++) s = recordSignup(s, T0 + i * 1000, CFG);
    expect(checkSignup(s, T0 + 5000, CFG).chan).toBe(false);
  });

  it("chạm ngưỡng → chặn, kèm thời gian chờ dương", () => {
    let s = initialSignupState();
    for (let i = 0; i < 5; i++) s = recordSignup(s, T0 + i * 1000, CFG);
    const g = checkSignup(s, T0 + 5000, CFG);
    expect(g.chan).toBe(true);
    expect(g.thuLaiSauMs).toBeGreaterThan(0);
  });

  it("ĐẾM CẢ LƯỢT THÀNH CÔNG — khác LoginLimiter (đăng ký rác thành công vẫn là lạm dụng)", () => {
    let s = initialSignupState();
    for (let i = 0; i < 5; i++) s = recordSignup(s, T0 + i * 1000, CFG);
    // Không có recordSuccess() nào xoá bộ đếm — đúng thiết kế.
    expect(checkSignup(s, T0 + 6000, CFG).chan).toBe(true);
  });

  it("cửa sổ TRƯỢT: lượt cũ hết hạn thì lại cho qua", () => {
    let s = initialSignupState();
    for (let i = 0; i < 5; i++) s = recordSignup(s, T0 + i * 1000, CFG);
    expect(checkSignup(s, T0 + CFG.cuaSoMs + 2000, CFG).chan).toBe(false);
  });

  it("thời gian chờ giảm dần khi thời gian trôi", () => {
    let s = initialSignupState();
    for (let i = 0; i < 5; i++) s = recordSignup(s, T0, CFG);
    const a = checkSignup(s, T0 + 1000, CFG).thuLaiSauMs;
    const b = checkSignup(s, T0 + 60_000, CFG).thuLaiSauMs;
    expect(b).toBeLessThan(a);
  });

  it("config: env hợp lệ thắng mặc định; rác → mặc định; luôn bị KẸP BIÊN", () => {
    expect(resolveSignupLimitConfig({ DANGKY_MAX_MOI_IP_GIO: "12" }).maxMoiCuaSo).toBe(12);
    expect(resolveSignupLimitConfig({ DANGKY_MAX_MOI_IP_GIO: "rác" }).maxMoiCuaSo)
      .toBe(DEFAULT_SIGNUP_LIMIT_CONFIG.maxMoiCuaSo);
    // Kẹp biên 1..50 — admin đặt 0 không được phép khoá sạch, đặt 99999 không được phép
    // vô hiệu hoá chống lạm dụng.
    expect(resolveSignupLimitConfig({ DANGKY_MAX_MOI_IP_GIO: "0" }).maxMoiCuaSo).toBe(1);
    expect(resolveSignupLimitConfig({ DANGKY_MAX_MOI_IP_GIO: "99999" }).maxMoiCuaSo).toBe(50);
  });
});
```

- [ ] **Step 2: ĐỎ** → **Step 3: Hiện thực** `signupLimiter.ts` (thuần) + `signupLimiterDO.ts` (bọc mỏng, theo đúng khuôn `loginLimiterDO.ts`: nạp state → uỷ quyền logic thuần → lưu; fail-open kèm `console.warn` khi thiếu binding).

Thêm vào `apps/api/src/types.ts`: `SIGNUP_LIMITER?: DurableObjectNamespace` trong `Env`, `SignupLimiterClient`, và `getSignupLimiter: (env: Env, key: string) => SignupLimiterClient` trong `AppDeps`.

`apps/api/wrangler.jsonc`: thêm binding `SIGNUP_LIMITER` + migration **`{ "tag": "v5", "new_sqlite_classes": ["SignupLimiter"] }`** — **thuần cộng dồn**, KHÔNG đụng tag cũ (sự cố `v2 deleted_classes` từng xoá `LoginLimiter` production).

- [ ] **Step 4: XANH** → **Step 5: lint** → **Step 6: Commit**

---

## Task 3: Migration `0008` — `auth_lookup_user` trả thêm trạng thái tenant

**Files:** Create `packages/db/migrations/0008_auth_lookup_trang_thai.sql`; Modify `packages/db/migrations/meta/_journal.json`; Test `packages/db/test/integration/authLookup.test.ts`

> **`_journal.json` BẮT BUỘC có entry mới** — drizzle chỉ áp migration theo `journal.entries`, **không quét thư mục**. Quên là file nằm chết trên đĩa. Đặt `when` **lớn hơn** `1784400000000` (mốc của 0007).

- [ ] **Step 1: Test đỏ** — khẳng định hàm trả đủ 5 cột và `tenant_trang_thai` khớp `tenants.trang_thai`; tenant `cho_duyet` trả đúng `'cho_duyet'`.

- [ ] **Step 2: ĐỎ** → **Step 3: Migration**

```sql
-- U17b — auth_lookup_user trả thêm tenant_trang_thai để login chặn tenant chưa duyệt.
--
-- VÌ SAO PHẢI SỬA HÀM chứ không query bảng: login xảy ra TRƯỚC khi biết tenant nên không
-- chạy trong withTenant; `tenants` bật FORCE RLS ⇒ SELECT thường thấy 0 hàng. Hàm này là
-- đường hợp lệ duy nhất (owner `auth_lookup` NOLOGIN BYPASSRLS, xem 0001).
--
-- GIỮ NGUYÊN OWNER + GRANT của 0001 — CREATE OR REPLACE không đổi chủ sở hữu, nên KHÔNG
-- cần lặp lại nghi thức SET ROLE/ALTER OWNER. Bề mặt vẫn hẹp: chỉ thêm MỘT cột trạng thái,
-- không thêm dữ liệu nhạy cảm nào.
CREATE OR REPLACE FUNCTION auth_lookup_user(p_email text)
RETURNS TABLE (id uuid, tenant_id uuid, vai_tro text, password_hash text, tenant_trang_thai text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT n.id, n.tenant_id, n.vai_tro, n.password_hash, t.trang_thai
  FROM nguoi_dung n
  JOIN tenants t ON t.id = n.tenant_id
  WHERE n.email = p_email
$$;--> statement-breakpoint
-- Owner `auth_lookup` cần SELECT trên `tenants` (BYPASSRLS chỉ bỏ qua policy HÀNG, không
-- thay quyền BẢNG). 0001 mới cấp trên `nguoi_dung`.
GRANT SELECT ON "tenants" TO auth_lookup;
```

> **JOIN chứ không LEFT JOIN có chủ ý:** `nguoi_dung.tenant_id` là NOT NULL + FK, nên không có người dùng mồ côi. Nếu vì lý do nào đó có, `JOIN` làm họ **không đăng nhập được** — fail-closed, đúng hướng an toàn cho một hàm xác thực.

- [ ] **Step 4: XANH** → **Step 5: Commit**

---

## Task 4: Cổng trạng thái ở `POST /auth/login`

**Files:** Modify `apps/api/src/routes/auth.ts`; Test `apps/api/test/integration/auth.trangThai.test.ts`

**Interfaces:** Consumes `auth_lookup_user` 5 cột (Task 3)

- [ ] **Step 1: Test đỏ**

```ts
// U17b (§3.3) — Cổng trạng thái tenant ở đường đăng nhập.
// Tenant chưa duyệt / bị khoá / bị từ chối KHÔNG được đăng nhập, và phải nhận ĐÚNG mã lỗi
// giống hệt sai mật khẩu — nếu khác, kẻ tấn công phân biệt được "tenant này có thật, đang
// chờ duyệt" với "không tồn tại", tức rò thông tin.
```

Ca kiểm bắt buộc:
- `trang_thai = 'cho_duyet'` + mật khẩu **ĐÚNG** → **401** với **cùng thân lỗi** như sai mật khẩu, và **KHÔNG** set cookie phiên.
- `'khoa'`, `'tu_choi'` → như trên.
- `'active'` + mật khẩu đúng → **200** `{ ok: true }` + có cookie phiên (**không hồi quy U8/U29**).
- `'cho_duyet'` → ghi audit `login_fail_chua_duyet`; **không** ghi `dang_nhap_saas` thành công.

- [ ] **Step 2: ĐỎ** → **Step 3: Hiện thực**

Thêm `tenant_trang_thai: string` vào `interface AuthRow`, và thêm điều kiện vào **đúng biểu thức 401 đang có**:

```ts
      if (
        !row || !row.password_hash || !passwordOk || !isRole(row.vai_tro) ||
        // U17b — cổng trạng thái. ĐẶT TRONG CÙNG biểu thức 401 có chủ ý: một `if` riêng đặt
        // trước sẽ trả về SỚM hơn, bỏ qua verify PBKDF2 và recordFailure() ⇒ tenant chưa
        // duyệt phản hồi nhanh hơn tenant sai mật khẩu, đo được từ ngoài ⇒ rò trạng thái.
        row.tenant_trang_thai !== "active"
      ) {
```

và phân nhánh audit (giữ nguyên `settle()` off-critical-path):

```ts
        const hanhDong =
          row?.password_hash && row.tenant_trang_thai !== "active"
            ? "login_fail_chua_duyet"
            : "that_bai";
```

- [ ] **Step 4: XANH** → **Step 5: `npm run test -w apps/api` toàn bộ, không hồi quy** → **Step 6: Commit**

---

## Task 5: `POST /dang-ky`

**Files:** Create `apps/api/src/routes/dangKy.ts`; Modify `apps/api/src/app.ts`, `apps/api/src/index.ts`; Test `apps/api/test/integration/dangKy.test.ts`

**Interfaces:** Consumes `validateEmailDangKy` (T1), `getSignupLimiter` (T2)

> **QĐ-1 — đường ghi:** tự sinh UUID rồi `withTenant(db, idMoi, …)` và INSERT `tenants{id: idMoi}`. Policy RLS trên `tenants` là `id = current_setting('app.tenant_id')` cho **cả** `USING` lẫn `WITH CHECK`, nên INSERT lọt mà **không cần** hàm SECURITY DEFINER nào. U17a đã chứng minh đường ghi này bằng test dưới role production — nếu Task này thấy bị chặn, **DỪNG và báo**, đừng tự thêm hàm BYPASSRLS.

- [ ] **Step 1: Test đỏ** — ca bắt buộc:
  - Hợp lệ → **201** `{ ok: true, trangThai: "cho_duyet" }`; DB có `tenants(trang_thai='cho_duyet', goi_dich_vu='free')` + `nguoi_dung(vai_tro='quan_tri', password_hash IS NULL)` + audit `dang_ky`.
  - Thiếu/`false` `dongYDieuKhoan` → **400** `chua_dong_y_dieu_khoan`, **không tạo hàng nào** (kiểm `count(*)` cả hai bảng).
  - Email rác → 400 `email_khong_hop_le` · MST sai (9 số, 14 số, có chữ) → 400 `mst_khong_hop_le`.
  - MST trùng → **409** `da_ton_tai` · email trùng → **409** `da_ton_tai`.
  - Vượt ngưỡng IP → **429** `qua_nhieu_yeu_cau` + `Retry-After`.
  - **Cách ly:** đăng ký không đọc/ghi chạm dữ liệu tenant khác đang có.
  - **Tenant vừa đăng ký KHÔNG đăng nhập được** (nối với Task 4) — dù có đặt mật khẩu thì `trang_thai='cho_duyet'` vẫn chặn.

- [ ] **Step 2: ĐỎ** → **Step 3: Hiện thực** (Zod `.strict()`; MST `/^\d{10}$|^\d{13}$/`; kiểm limiter **TRƯỚC** khi mở DB; bắt lỗi UNIQUE → 409, không để lộ trường nào trùng)

- [ ] **Step 4: XANH** → **Step 5: `make lint` + toàn bộ test** → **Step 6: Commit**

---

## Task 6: Cổng hoàn thành U17b

- [ ] `make lint` sạch · `make test` exit 0
- [ ] Coverage tầng nghiệp vụ ≥ 80%
- [ ] **Review chéo `security-reviewer`** — bắt buộc: endpoint công khai mới + sửa hàm SECURITY DEFINER + cổng xác thực
- [ ] Cập nhật `U17-plan.md` §7 đánh dấu U17b xong + ghi kết quả kiểm chứng thật
- [ ] Commit tài liệu

## Ghi chú deploy (khi tới lượt)

1. `make migrate` (`0008`) **TRƯỚC** khi deploy `apps/api`.
2. Wrangler migration tag `v5` tạo DO `SignupLimiter` — thuần cộng dồn, an toàn.
3. Smoke đúng đường `POST /dang-ky`, không chỉ `/health`. Kiểm cả ca 429.
4. **Kiểm lại local-vs-origin trước deploy** (vết sự cố 2026-07-16).

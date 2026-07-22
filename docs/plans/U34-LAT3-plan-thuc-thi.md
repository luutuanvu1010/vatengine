# Lát cắt 3 — Duyệt xong khách tự đặt mật khẩu (kế hoạch thực thi)

> **Cho tác nhân thực thi:** dùng `superpowers:subagent-driven-development` (khuyến nghị) hoặc
> `superpowers:executing-plans` để chạy từng Việc. Các Bước dùng cú pháp checkbox (`- [ ]`).
>
> Spec nguồn: `docs/plans/U34-KE-HOACH-LAT-CAT.md` §Lát cắt 3. Quyết định chi phối:
> **QĐ-14** (bỏ mật khẩu tạm 6 số, thay bằng link 72h), **QĐ-11** (chặn nhịp = WAF, không
> dựng lại limiter), **QĐ-16** (email = Amazon SES), **QĐ-17** (audit không lưu dữ liệu cá nhân).

**Mục tiêu:** chủ dự án bấm Duyệt → hệ thống tự gửi thư kèm **đường link** đặt mật khẩu →
khách tự đặt → đăng nhập được. Chủ dự án **không còn nhìn thấy mật khẩu của khách**.

**Cách làm:** tái dùng nguyên khuôn mẫu token của Lát cắt 1 (32 byte ngẫu nhiên · băm
SHA-256 · dùng-một-lần · hết hạn), nhưng hạn **72 giờ** và một bảng + role riêng. Đường
duyệt của admin đổi từ "sinh mật khẩu tạm rồi trả về" sang "tạo token rồi gửi thư".

**Ngăn xếp:** Postgres (migration SQL viết tay) · Hono + Zod trên Workers · React + Vite
(`apps/web`, `apps/admin`) · Vitest + PGlite.

---

## Ràng buộc toàn cục

Mọi Việc bên dưới ngầm mang các ràng buộc này.

| # | Ràng buộc | Nguồn |
|---|---|---|
| G1 | **Thư chứa LINK, KHÔNG chứa mã 6 số.** Không mở lại tranh luận này | QĐ-14, `U34-KE-HOACH-LAT-CAT.md` §Lát 3 |
| G2 | **Link trong thư trỏ tới TRANG SPA, không trỏ thẳng vào API.** Token chỉ bị tiêu khi người dùng **submit form** (POST). Máy quét thư không chạy JavaScript | `tokenXacThuc.ts`, QĐ-12 |
| G3 | **Không dựng lại rate-limit tầng ứng dụng.** Không thêm Durable Object, không thêm bộ đếm DB | QĐ-11 |
| G4 | **Không thêm Turnstile vào `/dat-mat-khau`.** Theo đúng tiền lệ `/xac-thuc-email` (Lát 1, đã LIVE): thứ bảo vệ là chính token 32 byte; chặn nhịp là việc của WAF | QĐ-11 + tiền lệ Lát 1 |
| G5 | **`audit_log_admin.chi_tiet` không chứa email, không chứa token, không chứa mật khẩu** | QĐ-17, `security.md` |
| G6 | Mọi hàm `SECURITY DEFINER` **bắt buộc** `SET search_path = public`, `REVOKE ALL ... FROM PUBLIC`, và `GRANT EXECUTE` cho **cả** `vat_app` **và** `app_user` | `0011`, `0013`, [[vat-bai-hoc-migration-security-definer]] |
| G7 | Migration cộng dồn, an toàn chạy lại (`IF NOT EXISTS`, `CREATE OR REPLACE`) | `deploy.md` |
| G8 | Mật khẩu thô **không bao giờ** xuống Postgres — băm bằng WebCrypto ở tầng Worker rồi mới gửi hash | `admin/tenants.ts:49`, `security.md` |
| G9 | Độ dài mật khẩu tối thiểu **8** ký tự, dùng đúng hằng `MAT_KHAU_TOI_THIEU` đã có ở `routes/auth.ts` | `routes/auth.ts:24` |
| G10 | `make lint` và `make test` phải xanh trước khi coi một Việc là xong | `CLAUDE.md` DoD |

### Những gì PHẢI deploy cùng nhau, đúng thứ tự

```
make migrate  →  vat-api  →  vat-web  →  vat-admin
```

Lý do: hợp đồng phản hồi của `POST /admin/tenants/:id/duyet` **đổi** (bỏ `mat_khau_tam`).
Deploy `vat-admin` trước thì Cổng Admin đọc một trường không còn tồn tại và hộp thoại vỡ.
Deploy `vat-api` trước khi migrate thì đường duyệt chết vì thiếu bảng.

### Quyết định thiết kế đã chốt trong kế hoạch này (không phải suy đoán giữa đường)

| Câu hỏi | Chốt | Vì sao |
|---|---|---|
| Role sở hữu hàm mới? | **Role MỚI `dat_mat_khau_api`**, không dùng lại `xac_thuc_api` | Hàm mới cần `UPDATE` trên `nguoi_dung.password_hash` — bảng thông tin xác thực. Không nhét quyền đó vào role đang gánh đường xác thực email. Cùng lập luận đã viết ở `0013` khi tách khỏi `admin_api` |
| Token gắn vào `tenant` hay `nguoi_dung`? | **`nguoi_dung_id`** | Token đặt mật khẩu cho MỘT tài khoản cụ thể, không cho cả doanh nghiệp |
| Cấp lại link thì token cũ ra sao? | **Vô hiệu ngay** (đánh dấu `da_dung_luc` cho mọi token chưa dùng của người đó) | Giữ đúng lời hứa của nút "Gửi lại": link cũ trong hộp thư cũ không được sống song song |
| Đổi tên route `reset-mat-khau`? | **Có** → `POST /admin/tenants/:id/gui-link-dat-mat-khau` | Tên cũ nói dối: nó không còn reset mật khẩu, nó gửi thư. Cổng Admin phải deploy cùng lượt rồi nên chi phí đổi tên bằng 0 |
| Trang `/dat-mat-khau` có kiểm token trước khi hiện form? | **KHÔNG.** Hiện form ngay; lỗi trả về khi submit | Kiểm trước cần thêm một endpoint, mà endpoint đó lại là đường `GET` mở cho máy quét dò. Một lần chạm token, một endpoint |
| Cột `mat_khau_tam_het_han` / `phai_doi_mat_khau` và cổng kiểm ở login? | **GIỮ NGUYÊN** | Chúng bảo vệ các hàng CŨ có thể còn mật khẩu tạm đang sống. Gỡ cổng kiểm = cho một mật khẩu tạm quá hạn đăng nhập được. Lát cắt này chỉ gỡ đường **CẤP** mật khẩu tạm, không gỡ đường **chặn** nó |
| `/auth/doi-mat-khau` có gỡ không? | **KHÔNG** | Đó là đường đổi mật khẩu bình thường của người đang đăng nhập, không liên quan mật khẩu tạm |

---

## Bản đồ file

### Tạo mới

| File | Trách nhiệm |
|---|---|
| `packages/db/migrations/0014_dat_mat_khau.sql` | Bảng `dat_mat_khau`, role `dat_mat_khau_api`, 2 hàm `SECURITY DEFINER` |
| `apps/api/src/email/token.ts` | Hai hàm **generic**: `sinhToken()`, `bamToken()` — tách khỏi `tokenXacThuc.ts` để đường đặt mật khẩu không phải import từ một module mang tên "xác thực" |
| `apps/api/src/email/tokenDatMatKhau.ts` | `HAN_GIO_DAT_MAT_KHAU = 72`, `hanTokenDatMatKhau()`, `lienKetDatMatKhau()` |
| `apps/api/src/routes/datMatKhau.ts` | `POST /dat-mat-khau` — công khai, tiêu token, đặt mật khẩu |
| `apps/web/src/features/auth/DatMatKhauPage.tsx` | Trang `/dat-mat-khau` |
| `apps/admin/src/features/tenants/DaGuiThuDialog.tsx` | Thay `MatKhauTamDialog` — báo đã gửi thư tới đâu, hoặc cảnh báo đỏ khi gửi hỏng |
| `apps/api/test/integration/datMatKhau.test.ts` | Test đường đặt mật khẩu đầu-cuối |
| `apps/api/test/unit/tokenDatMatKhau.test.ts` | Test hạn 72h + dựng link |
| `apps/web/test/features/datMatKhau.test.tsx` | Test 4 kết cục của trang |

### Sửa

| File | Sửa gì |
|---|---|
| `packages/db/migrations/meta/_journal.json` | Thêm mục `idx: 14` |
| `apps/api/src/email/tokenXacThuc.ts` | Bỏ `sinhToken`/`bamToken` (chuyển sang `token.ts`), giữ `HAN_GIO`/`hanToken`/`lienKetXacThuc` |
| `apps/api/src/routes/dangKy.ts`, `apps/api/src/routes/xacThucEmail.ts` | Đổi đường import sang `email/token` |
| `apps/api/src/email/mau.ts` | Thêm `thuDatMatKhau()`; tách khung HTML dùng chung |
| `apps/api/src/routes/admin/tenants.ts` | Bỏ `datMatKhauTam()`; thêm `guiLinkDatMatKhau()`; đổi route `reset-mat-khau` → `gui-link-dat-mat-khau` |
| `apps/api/src/app.ts` | Gắn `app.route("/dat-mat-khau", ...)` |
| `apps/web/src/routes/AppRouter.tsx` | Thêm `<Route path="/dat-mat-khau" ...>` |
| `apps/web/src/lib/apiClient.ts` | Thêm `datMatKhau(token, matKhau)` |
| `apps/admin/src/lib/types.ts` | Bỏ `KetQuaCapMatKhau`, thêm `KetQuaGuiThuDatMatKhau` |
| `apps/admin/src/lib/adminApiClient.ts` | `resetMatKhau` → `guiLaiLinkDatMatKhau`; đổi kiểu trả của `duyetTenant` |
| `apps/admin/src/features/tenants/TenantsPage.tsx` | Dùng dialog mới; đổi nhãn/hành động |

### Xoá

| File | Vì sao |
|---|---|
| `apps/api/src/admin/matKhauTam.ts` | QĐ-14 — không còn đường nào sinh mật khẩu tạm |
| `apps/api/test/unit/matKhauTam.test.ts` | Test của file đã xoá |
| `apps/admin/src/features/tenants/MatKhauTamDialog.tsx` | Không còn mật khẩu nào để hiện |

> ⚠️ **KHÔNG xoá** hàm SQL `admin_dat_mat_khau_tam` ở `0011`. Migration là lịch sử — không
> sửa file cũ. Hàm sẽ mồ côi (không ai gọi); ghi vào BACKLOG để dọn ở một migration sau,
> không dọn trong lát cắt này.

---

## Việc 1 — Migration 0014: bảng token + hai hàm

**Files:**
- Tạo: `packages/db/migrations/0014_dat_mat_khau.sql`
- Sửa: `packages/db/migrations/meta/_journal.json`
- Test: `apps/api/test/integration/datMatKhau.test.ts` (phần "hàm DB")

**Giao diện — phần sau dựa vào:**
- `dat_mat_khau_tao(p_tenant_id uuid, p_token_bam text, p_het_han timestamptz)`
  → `TABLE (r_nguoi_dung_id uuid, r_email text)`; **0 hàng** nếu tenant không có tài khoản `quan_tri`.
- `dat_mat_khau_dung(p_token_bam text, p_hash text)`
  → `TABLE (ket_qua text, r_email text)`; `ket_qua` ∈ `ok` | `het_han` | `da_dung` | `khong_thay`.

---

- [ ] **Bước 1: Viết test đỏ cho hai hàm DB**

Tạo `apps/api/test/integration/datMatKhau.test.ts`:

```ts
// Lát cắt 3 (QĐ-14) — Đặt mật khẩu bằng link dùng-một-lần, thay mật khẩu tạm 6 số.
import { nguoiDung } from "@vat/db";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { type Db, freshDb, makeTenant } from "../helpers";

/** Tạo tenant + tài khoản quản trị chưa có mật khẩu (đúng hình dạng sau `POST /dang-ky`). */
async function tenantCoQuanTri(db: Db, email: string): Promise<string> {
  const id = await makeTenant(db, "Cty Thử", "0100000001");
  await db.insert(nguoiDung).values({ tenantId: id, email, vaiTro: "quan_tri" });
  return id;
}

const SAU_MOT_GIO = () => new Date(Date.now() + 3600_000).toISOString();
const TRUOC_MOT_GIO = () => new Date(Date.now() - 3600_000).toISOString();

describe("hàm DB dat_mat_khau_tao / dat_mat_khau_dung", () => {
  let db: Db;
  let tenantId: string;

  beforeEach(async () => {
    db = await freshDb();
    tenantId = await tenantCoQuanTri(db, "chu.cty@congty.vn");
  });

  const tao = (tokenBam: string, hetHan = SAU_MOT_GIO()) =>
    db.execute(
      sql`select r_nguoi_dung_id, r_email from dat_mat_khau_tao(${tenantId}::uuid, ${tokenBam}, ${hetHan}::timestamptz)`,
    ) as Promise<{ rows: Array<{ r_nguoi_dung_id: string; r_email: string }> }>;

  const dung = (tokenBam: string, hash = "hash-moi") =>
    db.execute(sql`select ket_qua, r_email from dat_mat_khau_dung(${tokenBam}, ${hash})`) as Promise<{
      rows: Array<{ ket_qua: string; r_email: string | null }>;
    }>;

  it("tao trả về id + email của tài khoản quản trị", async () => {
    const r = await tao("bam-1");
    expect(r.rows[0]?.r_email).toBe("chu.cty@congty.vn");
  });

  it("tao cho tenant KHÔNG có tài khoản quản trị → 0 hàng", async () => {
    const trong = await makeTenant(db, "Cty Rỗng", "0100000002");
    const r = (await db.execute(
      sql`select r_nguoi_dung_id from dat_mat_khau_tao(${trong}::uuid, 'bam-x', ${SAU_MOT_GIO()}::timestamptz)`,
    )) as { rows: unknown[] };
    expect(r.rows).toHaveLength(0);
  });

  it("🔴 tao lần hai VÔ HIỆU HOÁ token cũ chưa dùng", async () => {
    await tao("bam-cu");
    await tao("bam-moi");
    expect((await dung("bam-cu")).rows[0]?.ket_qua).toBe("da_dung");
    expect((await dung("bam-moi")).rows[0]?.ket_qua).toBe("ok");
  });

  it("dung với token hợp lệ → ok, và ĐẶT hash vào nguoi_dung", async () => {
    await tao("bam-2");
    const r = await dung("bam-2", "hash-that");
    expect(r.rows[0]).toEqual({ ket_qua: "ok", r_email: "chu.cty@congty.vn" });

    const u = (await db.select().from(nguoiDung).where(eq(nguoiDung.tenantId, tenantId)))[0];
    expect(u?.passwordHash).toBe("hash-that");
    // Đặt mật khẩu qua link ⇒ đây là mật khẩu CHÍNH THỨC, không phải mật khẩu tạm.
    expect(u?.phaiDoiMatKhau).toBe(false);
    expect(u?.matKhauTamHetHan).toBeNull();
  });

  it("dung lần hai → da_dung (dùng-một-lần)", async () => {
    await tao("bam-3");
    await dung("bam-3");
    expect((await dung("bam-3")).rows[0]?.ket_qua).toBe("da_dung");
  });

  it("dung với token quá hạn → het_han, KHÔNG đổi mật khẩu", async () => {
    await tao("bam-4", TRUOC_MOT_GIO());
    expect((await dung("bam-4", "khong-duoc-dat")).rows[0]?.ket_qua).toBe("het_han");
    const u = (await db.select().from(nguoiDung).where(eq(nguoiDung.tenantId, tenantId)))[0];
    expect(u?.passwordHash).toBeNull();
  });

  it("dung với token không tồn tại → khong_thay", async () => {
    expect((await dung("bam-khong-co")).rows[0]?.ket_qua).toBe("khong_thay");
  });

  it("🔴 bảng dat_mat_khau fail-closed: RLS bật + force, KHÔNG policy nào", async () => {
    const r = (await db.execute(sql`
      select c.relrowsecurity, c.relforcerowsecurity,
             (select count(*) from pg_policy p where p.polrelid = c.oid) as so_policy
      from pg_class c where c.relname = 'dat_mat_khau'`)) as {
      rows: Array<{ relrowsecurity: boolean; relforcerowsecurity: boolean; so_policy: string }>;
    };
    expect(r.rows[0]?.relrowsecurity).toBe(true);
    expect(r.rows[0]?.relforcerowsecurity).toBe(true);
    expect(Number(r.rows[0]?.so_policy)).toBe(0);
  });

  it("🔴 hai hàm mới thuộc role dat_mat_khau_api và PUBLIC không gọi được", async () => {
    const r = (await db.execute(sql`
      select p.proname, r.rolname,
             has_function_privilege('public', p.oid, 'EXECUTE') as public_goi_duoc
      from pg_proc p join pg_roles r on r.oid = p.proowner
      where p.proname in ('dat_mat_khau_tao', 'dat_mat_khau_dung')`)) as {
      rows: Array<{ proname: string; rolname: string; public_goi_duoc: boolean }>;
    };
    expect(r.rows).toHaveLength(2);
    for (const h of r.rows) {
      expect(h.rolname).toBe("dat_mat_khau_api");
      expect(h.public_goi_duoc).toBe(false);
    }
  });
});
```

- [ ] **Bước 2: Chạy test, xác nhận ĐỎ**

```bash
cd /Users/tuanbao/Documents/Projects/vatengine
npx vitest run -w apps/api apps/api/test/integration/datMatKhau.test.ts
```

Kỳ vọng: ĐỎ với `relation "dat_mat_khau" does not exist` hoặc
`function dat_mat_khau_tao(...) does not exist`.

- [ ] **Bước 3: Viết migration**

Tạo `packages/db/migrations/0014_dat_mat_khau.sql`:

```sql
-- Lát cắt 3 (QĐ-14) — Đặt mật khẩu bằng LINK dùng-một-lần, thay mật khẩu tạm 6 chữ số.
--
-- Mật khẩu tạm 6 số ra đời (U18, 2026-07-15) CHỈ vì chủ dự án phải đọc nó cho khách qua
-- điện thoại. Nó chấp nhận không gian 10^6 và bù bằng ba ràng buộc; QĐ-7 và QĐ-11 đã lấy
-- đi hai, chỉ còn hạn 72h. Khi hệ thống tự gửi được thư thì lý do "phải đọc qua điện
-- thoại" biến mất, và cùng với nó là toàn bộ lý do chịu đựng 10^6. Token 32 byte không
-- dò được, và khách bấm một nút thay vì gõ lại sáu chữ số.
--
-- Khuôn mẫu sao chép nguyên từ `0013_xac_thuc_email.sql`. Khác đúng ba điểm:
--   • hạn 72h thay vì 24h (nằm ở tầng ứng dụng — cột chỉ lưu mốc);
--   • token gắn vào NGƯỜI DÙNG, không phải tenant (nó đặt mật khẩu cho một tài khoản);
--   • tạo token mới thì token cũ chưa dùng CHẾT NGAY.

-- ══════════════════════════════════════════════════════════════════════════════════════
-- Bước 1 — Role sở hữu. TÁCH khỏi `xac_thuc_api`, có chủ ý.
-- ══════════════════════════════════════════════════════════════════════════════════════
-- `xac_thuc_api` (0013) chỉ cần đọc/sửa `tenants`. Hàm ở đây phải GHI ĐƯỢC
-- `nguoi_dung.password_hash` — bảng thông tin xác thực của toàn hệ thống. Gộp hai thứ
-- nghĩa là một lỗ hổng ở đường xác thực email mượn được quyền đổi mật khẩu người khác.
-- Cùng lập luận 0013 đã dùng khi tách khỏi `admin_api`: một role giữ bán kính thiệt hại
-- đúng bằng việc nó làm.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'dat_mat_khau_api') THEN
    CREATE ROLE dat_mat_khau_api NOLOGIN BYPASSRLS;
  END IF;
END $$;--> statement-breakpoint

-- ══════════════════════════════════════════════════════════════════════════════════════
-- Bước 2 — Bảng token
-- ══════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "dat_mat_khau" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "nguoi_dung_id" uuid NOT NULL REFERENCES "nguoi_dung"("id") ON DELETE CASCADE,
  -- BĂM, không phải token thô: token này đổi được mật khẩu, nên phải đối xử như mật khẩu.
  "token_bam" text NOT NULL UNIQUE,
  "het_han" timestamptz NOT NULL,
  -- NULL = chưa dùng. Mốc thời gian thay cờ boolean để còn truy được lúc nào đã tiêu.
  "da_dung_luc" timestamptz,
  "ngay_tao" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "dat_mat_khau_nguoi_dung_idx" ON "dat_mat_khau" ("nguoi_dung_id");--> statement-breakpoint

-- RLS ENABLE + FORCE, KHÔNG policy ⇒ fail-closed: không ai đọc/ghi được, kể cả owner.
-- Đường vào DUY NHẤT là hai hàm SECURITY DEFINER bên dưới. FORCE bắt buộc — ENABLE một
-- mình không chi phối table owner (bài học U4).
ALTER TABLE "dat_mat_khau" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dat_mat_khau" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "dat_mat_khau" FROM PUBLIC;--> statement-breakpoint

-- Postgres đòi chủ sở hữu MỚI của một hàm phải có CREATE trên schema chứa nó, nếu không
-- `ALTER FUNCTION … OWNER TO` hỏng với `permission denied for schema public` — đã gặp
-- thật khi áp 0013 lên production 2026-07-22.
GRANT USAGE, CREATE ON SCHEMA public TO dat_mat_khau_api;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "dat_mat_khau" TO dat_mat_khau_api;--> statement-breakpoint
GRANT SELECT, UPDATE ON "nguoi_dung" TO dat_mat_khau_api;--> statement-breakpoint

-- ══════════════════════════════════════════════════════════════════════════════════════
-- Bước 3 — Hai cửa hẹp. `SET search_path = public` BẮT BUỘC trên mọi SECURITY DEFINER:
-- thiếu nó, kẻ gọi dựng được schema giả đứng trước public và cướp quyền của owner BYPASSRLS.
-- ══════════════════════════════════════════════════════════════════════════════════════

-- 3.1 Tạo token cho tài khoản quản trị của một tenant.
--
-- Chọn tài khoản theo ĐÚNG quy tắc `admin_dat_mat_khau_tam` (0011) đang dùng — `vai_tro =
-- 'quan_tri'`, cũ nhất trước — để đường mới không âm thầm nhắm một tài khoản khác đường cũ.
--
-- `UPDATE ... SET da_dung_luc = now()` trước khi INSERT: bấm "Gửi lại link" mà link cũ vẫn
-- sống là hai chìa cùng mở một cửa, và người bấm tưởng mình vừa thu hồi chìa cũ.
CREATE OR REPLACE FUNCTION dat_mat_khau_tao(
  p_tenant_id uuid, p_token_bam text, p_het_han timestamptz
)
RETURNS TABLE (r_nguoi_dung_id uuid, r_email text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_email text;
BEGIN
  SELECT n.id, n.email INTO v_id, v_email
  FROM nguoi_dung n
  WHERE n.tenant_id = p_tenant_id AND n.vai_tro = 'quan_tri'
  ORDER BY n.ngay_tao
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN;  -- 0 hàng: tenant không có tài khoản quản trị. Nơi gọi trả 404.
  END IF;

  UPDATE dat_mat_khau SET da_dung_luc = now()
  WHERE nguoi_dung_id = v_id AND da_dung_luc IS NULL;

  INSERT INTO dat_mat_khau (nguoi_dung_id, token_bam, het_han)
  VALUES (v_id, p_token_bam, p_het_han);

  RETURN QUERY SELECT v_id, v_email;
END $$;--> statement-breakpoint

-- 3.2 Dùng token: kiểm + tiêu + đặt mật khẩu, TRỌN VẸN trong một lời gọi.
--
-- Không tách "kiểm" rồi "đặt" ở tầng ứng dụng: giữa hai bước có khe hở, và hai lần submit
-- đồng thời sẽ cùng thấy token còn hiệu lực. `FOR UPDATE` khoá hàng nên lần thứ hai phải
-- chờ, và khi tới lượt thì thấy `da_dung_luc` đã có. Đúng lớp lỗi TOCTOU U18 đã gặp.
--
-- `p_hash` là mật khẩu ĐÃ BĂM ở tầng Worker (WebCrypto). Mật khẩu thô không bao giờ đi
-- vào Postgres, nên nó cũng không lọt vào nhật ký truy vấn chậm hay bản sao lưu.
--
-- KHÔNG kiểm trạng thái tenant ở đây, có chủ ý: cổng trạng thái nằm ở đường ĐĂNG NHẬP
-- (`routes/auth.ts` chỉ cho `active` vào). Tenant bị khoá sau khi duyệt mà đặt được mật
-- khẩu thì cũng vẫn không đăng nhập được — thêm một chốt nữa ở đây chỉ nhân đôi nơi phải
-- sửa khi máy trạng thái đổi.
CREATE OR REPLACE FUNCTION dat_mat_khau_dung(p_token_bam text, p_hash text)
RETURNS TABLE (ket_qua text, r_email text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r record;
  v_email text;
BEGIN
  SELECT d.id, d.nguoi_dung_id, d.het_han, d.da_dung_luc INTO r
  FROM dat_mat_khau d
  WHERE d.token_bam = p_token_bam
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'khong_thay'::text, NULL::text;
    RETURN;
  END IF;

  IF r.da_dung_luc IS NOT NULL THEN
    RETURN QUERY SELECT 'da_dung'::text, NULL::text;
    RETURN;
  END IF;

  IF r.het_han <= now() THEN
    RETURN QUERY SELECT 'het_han'::text, NULL::text;
    RETURN;
  END IF;

  UPDATE dat_mat_khau SET da_dung_luc = now() WHERE id = r.id;

  -- Xoá luôn dấu vết mật khẩu tạm: mật khẩu này do CHÍNH người dùng đặt, nên cờ nhắc đổi
  -- và mốc hết hạn 72h của mật khẩu tạm đều không còn nghĩa. Bỏ sót hai dòng này thì một
  -- tài khoản cũ từng nhận mật khẩu tạm sẽ bị cổng hết-hạn ở login chặn dù vừa đặt xong.
  UPDATE nguoi_dung SET
    password_hash = p_hash,
    phai_doi_mat_khau = false,
    mat_khau_tam_het_han = NULL
  WHERE id = r.nguoi_dung_id
  RETURNING email INTO v_email;

  RETURN QUERY SELECT 'ok'::text, v_email;
END $$;--> statement-breakpoint

-- ══════════════════════════════════════════════════════════════════════════════════════
-- Bước 4 — Nghi thức sở hữu. Viết bằng vòng lặp vì bỏ sót đúng một dòng REVOKE là mở một
-- hàm BYPASSRLS cho PUBLIC (khuôn mẫu 0011/0013).
-- ══════════════════════════════════════════════════════════════════════════════════════
-- Mượn TẠM membership: `ALTER FUNCTION ... OWNER TO r` đòi role đang chạy phải là THÀNH
-- VIÊN của `r`. Thiếu dòng này, migration hỏng với "must be able to SET ROLE" — đã gặp
-- thật trên production 2026-07-22. PGlite KHÔNG bắt được vì nó chạy superuser.
--
-- KHÔNG có bước trả lại membership, cùng lý do đã ghi ở cuối 0013: trên Neon, role chạy
-- migration là `neondb_owner` (không phải superuser) và câu REVOKE hỏng; mà nó cũng không
-- bảo vệ thêm gì vì `neondb_owner` sở hữu toàn bộ bảng, tự tắt RLS được bất cứ lúc nào.
GRANT dat_mat_khau_api TO CURRENT_USER;--> statement-breakpoint
DO $$
DECLARE
  sig text;
  ten_role text;
  cap_duoc boolean;
  sigs text[] := ARRAY[
    'dat_mat_khau_tao(uuid,text,timestamptz)',
    'dat_mat_khau_dung(text,text)'
  ];
BEGIN
  FOREACH sig IN ARRAY sigs LOOP
    EXECUTE format('ALTER FUNCTION public.%s OWNER TO dat_mat_khau_api', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', sig);
  END LOOP;

  -- Tên role app KHÁC NHAU theo môi trường: production `vat_app`, test `app_user`.
  -- 0013 đã học bài này bằng một test đỏ — cấp cho MỌI tên role app đã biết, không chỉ một.
  cap_duoc := false;
  FOREACH ten_role IN ARRAY ARRAY['vat_app', 'app_user'] LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = ten_role) THEN
      cap_duoc := true;
      FOREACH sig IN ARRAY sigs LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO %I', sig, ten_role);
      END LOOP;
    END IF;
  END LOOP;

  IF NOT cap_duoc THEN
    RAISE WARNING 'Lát cắt 3: KHÔNG tìm thấy role app nào (đã thử vat_app, app_user) — BỎ QUA cấp EXECUTE cho dat_mat_khau_tao/dung. Nếu môi trường này dùng tên role khác, DUYỆT TENANT VÀ ĐẶT MẬT KHẨU SẼ HỎNG (permission denied) cho tới khi cấp tay: GRANT EXECUTE ON FUNCTION public.dat_mat_khau_tao(uuid,text,timestamptz), public.dat_mat_khau_dung(text,text) TO <ten_role_app>;';
  END IF;
END $$;
```

- [ ] **Bước 4: Thêm mục vào `_journal.json`**

Chèn ngay trước dấu `]` đóng mảng `entries`, sau mục `idx: 13`:

```json
    ,{
      "idx": 14,
      "version": "7",
      "when": 1785559200000,
      "tag": "0014_dat_mat_khau",
      "breakpoints": true
    }
```

Sau khi chèn, chạy `npx biome format --write packages/db/migrations/meta/_journal.json` để
dấu phẩy về đúng chỗ.

- [ ] **Bước 5: Chạy test, xác nhận XANH**

```bash
npx vitest run -w apps/api apps/api/test/integration/datMatKhau.test.ts
```

Kỳ vọng: 8 test PASS.

- [ ] **Bước 6: Commit**

```bash
git add packages/db/migrations/0014_dat_mat_khau.sql packages/db/migrations/meta/_journal.json apps/api/test/integration/datMatKhau.test.ts
git commit -m "Lát cắt 3: migration 0014 — bảng token đặt mật khẩu + 2 hàm SECURITY DEFINER"
```

---

## Việc 2 — Token 72h, liên kết, và mẫu thư

**Files:**
- Tạo: `apps/api/src/email/token.ts`, `apps/api/src/email/tokenDatMatKhau.ts`
- Sửa: `apps/api/src/email/tokenXacThuc.ts`, `apps/api/src/email/mau.ts`,
  `apps/api/src/routes/dangKy.ts`, `apps/api/src/routes/xacThucEmail.ts`
- Test: `apps/api/test/unit/tokenDatMatKhau.test.ts`

**Giao diện — dùng từ Việc trước:** không có.

**Giao diện — phần sau dựa vào:**
- `sinhToken(): string`, `bamToken(token: string): Promise<string>` từ `email/token`
- `HAN_GIO_DAT_MAT_KHAU: 72`, `hanTokenDatMatKhau(bayGio?: Date): Date`,
  `lienKetDatMatKhau(urlNen: string, token: string): string` từ `email/tokenDatMatKhau`
- `thuDatMatKhau(tenDoanhNghiep: string, lienKet: string): ThuCanGui & { den: string }` từ `email/mau`

---

- [ ] **Bước 1: Viết test đỏ**

Tạo `apps/api/test/unit/tokenDatMatKhau.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { thuDatMatKhau } from "../../src/email/mau";
import {
  HAN_GIO_DAT_MAT_KHAU,
  hanTokenDatMatKhau,
  lienKetDatMatKhau,
} from "../../src/email/tokenDatMatKhau";

describe("hạn token đặt mật khẩu", () => {
  it("đúng 72 giờ — dài hơn token xác thực email (24h)", () => {
    expect(HAN_GIO_DAT_MAT_KHAU).toBe(72);
    const bayGio = new Date("2026-07-22T10:00:00.000Z");
    expect(hanTokenDatMatKhau(bayGio).toISOString()).toBe("2026-07-25T10:00:00.000Z");
  });
});

describe("lienKetDatMatKhau", () => {
  it("trỏ tới TRANG SPA /dat-mat-khau, không trỏ vào /api", () => {
    const l = lienKetDatMatKhau("https://vatengine.tourdao.vn", "abc-123");
    expect(l).toBe("https://vatengine.tourdao.vn/dat-mat-khau?token=abc-123");
  });

  it("bỏ dấu / thừa ở cuối url nền", () => {
    expect(lienKetDatMatKhau("https://x.vn///", "t")).toBe("https://x.vn/dat-mat-khau?token=t");
  });

  it("mã hoá token cho an toàn trong query string", () => {
    expect(lienKetDatMatKhau("https://x.vn", "a+b/c=")).toContain("token=a%2Bb%2Fc%3D");
  });
});

describe("thuDatMatKhau", () => {
  const thu = thuDatMatKhau("Cty <Thử> & Co", "https://x.vn/dat-mat-khau?token=t1");

  it("có CẢ html lẫn text — bản text tự đủ nghĩa", () => {
    expect(thu.html).toContain("https://x.vn/dat-mat-khau?token=t1");
    expect(thu.text).toContain("https://x.vn/dat-mat-khau?token=t1");
    expect(thu.text).toContain("72 giờ");
  });

  it("🔴 thoát HTML cho tên doanh nghiệp (người lạ nhập vào form công khai)", () => {
    expect(thu.html).toContain("Cty &lt;Thử&gt; &amp; Co");
    expect(thu.html).not.toContain("<Thử>");
  });

  it("🔴 KHÔNG chứa mật khẩu nào — QĐ-14 bỏ hẳn mã 6 số", () => {
    expect(thu.html).not.toMatch(/\b\d{6}\b/);
    expect(thu.text).not.toMatch(/\b\d{6}\b/);
  });

  it("nói rõ hạn 72 giờ và dùng một lần", () => {
    expect(thu.html).toContain("72 giờ");
    expect(thu.text).toContain("một lần");
  });
});
```

- [ ] **Bước 2: Chạy test, xác nhận ĐỎ**

```bash
npx vitest run -w apps/api apps/api/test/unit/tokenDatMatKhau.test.ts
```

Kỳ vọng: ĐỎ — `Failed to resolve import "../../src/email/tokenDatMatKhau"`.

- [ ] **Bước 3: Tách hai hàm generic ra `email/token.ts`**

Tạo `apps/api/src/email/token.ts`:

```ts
// Sinh và băm token dùng-một-lần. GENERIC — dùng chung cho mọi đường thư có token
// (xác thực email 24h ở Lát 1, đặt mật khẩu 72h ở Lát 3).
//
// ── VÌ SAO BĂM BẰNG SHA-256 CHỨ KHÔNG PHẢI PBKDF2 ────────────────────────────────────
// `password.ts` dùng PBKDF2 100.000 vòng vì mật khẩu do NGƯỜI đặt: entropy thấp, đoán
// được, nên phải làm mỗi lần thử đắt lên. Token ở đây là 32 byte NGẪU NHIÊN từ
// `getRandomValues` — 256 bit entropy, không có từ điển nào dò nổi. Băm chậm ở đây chỉ
// làm chậm chính ta mà không thêm một chút an toàn nào. SHA-256 là đúng công cụ.
//
// Vẫn PHẢI băm (không lưu token thô): rò cơ sở dữ liệu không được biến thành rò quyền —
// các token này chuyển được trạng thái tenant và đặt được mật khẩu.

/** 32 byte = 256 bit. Dư sức, và vẫn đủ ngắn để nằm gọn trong một URL. */
const SO_BYTE = 32;

/** Sinh token thô. CHỈ giá trị này đi vào thư; cơ sở dữ liệu chỉ giữ bản băm. */
export function sinhToken(): string {
  const b = new Uint8Array(SO_BYTE);
  crypto.getRandomValues(b);
  // base64url: an toàn trong URL, không cần mã hoá thêm — tránh cả lớp lỗi "token hỏng vì
  // ký tự `+` bị đổi thành khoảng trắng khi qua query string".
  return btoa(String.fromCharCode(...b))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function bamToken(token: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
```

- [ ] **Bước 4: Rút gọn `tokenXacThuc.ts` và sửa hai chỗ import**

Thay TOÀN BỘ `apps/api/src/email/tokenXacThuc.ts` bằng:

```ts
// U34c — Token xác thực email: hạn và cách dựng liên kết. Phần sinh/băm token đã chuyển
// sang `email/token.ts` (generic, dùng chung với đường đặt mật khẩu ở Lát cắt 3).

/** 24 giờ. Đủ dài cho người bận, đủ ngắn để một hộp thư bị chiếm sau đó không dùng lại được. */
export const HAN_GIO = 24;

export function hanToken(bayGio: Date = new Date()): Date {
  return new Date(bayGio.getTime() + HAN_GIO * 3600_000);
}

/**
 * Liên kết trong thư trỏ tới TRANG của SPA, không trỏ thẳng vào API.
 *
 * ⚠️ Đây là cùng bài học với QĐ-12, ở một chỗ khác. Nếu liên kết là `GET /api/xac-thuc?
 * token=…` thì máy quét thư, phần mềm diệt virus và bộ lọc doanh nghiệp sẽ TỰ ĐỘNG FETCH
 * nó — token bị tiêu trước khi khách kịp bấm, và khách nhận thông báo "liên kết đã được
 * dùng" cho một lá thư họ vừa mở lần đầu.
 *
 * Trỏ vào trang SPA thì việc tải trước là vô hại (chỉ là một trang tĩnh); token chỉ bị
 * tiêu khi JavaScript trên trang đó gửi `POST`, mà máy quét thì không chạy JavaScript.
 */
export function lienKetXacThuc(urlNen: string, token: string): string {
  return `${urlNen.replace(/\/+$/, "")}/xac-thuc-email?token=${encodeURIComponent(token)}`;
}
```

Trong `apps/api/src/routes/dangKy.ts` dòng 19, đổi:

```ts
import { bamToken, hanToken, lienKetXacThuc, sinhToken } from "../email/tokenXacThuc";
```

thành:

```ts
import { bamToken, sinhToken } from "../email/token";
import { hanToken, lienKetXacThuc } from "../email/tokenXacThuc";
```

Trong `apps/api/src/routes/xacThucEmail.ts` dòng 19, đổi:

```ts
import { bamToken } from "../email/tokenXacThuc";
```

thành:

```ts
import { bamToken } from "../email/token";
```

Nếu `apps/api/test/unit/tokenXacThuc.test.ts` tồn tại và import `sinhToken`/`bamToken` từ
`tokenXacThuc`, đổi đường import trong file test đó sang `../../src/email/token`. Kiểm bằng:

```bash
grep -rn "from \"../../src/email/tokenXacThuc\"" apps/api/test
```

- [ ] **Bước 5: Viết `tokenDatMatKhau.ts`**

Tạo `apps/api/src/email/tokenDatMatKhau.ts`:

```ts
// Lát cắt 3 (QĐ-14) — Token đặt mật khẩu. Cùng khuôn mẫu token xác thực email (Lát 1),
// khác đúng hai điểm: hạn 72 giờ, và đích là trang `/dat-mat-khau`.

/**
 * 72 giờ — DÀI HƠN token xác thực email (24h), có chủ ý.
 *
 * Hai lá thư ở hai thời điểm khác hẳn nhau về mức chú ý của khách. Thư xác thực tới NGAY
 * SAU khi họ vừa bấm "Đăng ký" — họ đang ngồi trước máy, chờ nó. Thư đặt mật khẩu tới khi
 * chủ dự án duyệt, có thể vài giờ hoặc vài ngày sau, và khách không biết trước lúc nào.
 * Bắt họ phản ứng trong 24h cho một lá thư họ không chờ là cách chắc chắn để tạo ra một
 * hàng người phải xin gửi lại.
 *
 * 72h cũng đúng bằng hạn của mật khẩu tạm mà nó thay thế (U18) — không nới lỏng gì so với
 * trạng thái trước, chỉ đổi thứ được gửi đi.
 */
export const HAN_GIO_DAT_MAT_KHAU = 72;

export function hanTokenDatMatKhau(bayGio: Date = new Date()): Date {
  return new Date(bayGio.getTime() + HAN_GIO_DAT_MAT_KHAU * 3600_000);
}

/**
 * Trỏ tới TRANG SPA, không trỏ thẳng vào API — cùng lý do đã ghi ở `lienKetXacThuc`.
 *
 * Ở đường này còn một lớp an toàn nữa mà đường xác thực không có: trang `/dat-mat-khau`
 * KHÔNG tự gọi API khi tải. Token chỉ bị tiêu khi khách gõ mật khẩu và bấm gửi. Nên kể cả
 * một máy quét biết chạy JavaScript cũng không tiêu được nó.
 */
export function lienKetDatMatKhau(urlNen: string, token: string): string {
  return `${urlNen.replace(/\/+$/, "")}/dat-mat-khau?token=${encodeURIComponent(token)}`;
}
```

- [ ] **Bước 6: Thêm `thuDatMatKhau` vào `mau.ts`**

Trong `apps/api/src/email/mau.ts`, thêm vào CUỐI file (giữ nguyên `thoat`, `KHUNG_HTML`,
`thuXacThucEmail`):

```ts
/**
 * Lát cắt 3 (QĐ-14) — Thư gửi khi chủ dự án bấm Duyệt.
 *
 * ⚠️ Thư này KHÔNG chứa mật khẩu, và đó là điểm cốt lõi của QĐ-14. Trước Lát cắt 3, chủ
 * dự án nhìn thấy mật khẩu 6 chữ số của khách rồi tự gửi qua Zalo/điện thoại. Mã 6 số ra
 * đời CHỈ vì phải đọc qua điện thoại; khi hệ thống tự gửi được thư thì lý do đó biến mất
 * và chỉ còn lại điểm yếu (10^6 khả năng). Gửi mã 6 số qua email là giữ nguyên điểm yếu
 * mà vứt đi lý do duy nhất biện minh cho nó.
 */
export function thuDatMatKhau(
  tenDoanhNghiep: string,
  lienKet: string,
): ThuCanGui & { den: string } {
  const html = KHUNG_HTML(`
<p style="font-size:16px;line-height:1.6;margin:0 0 16px">
Hồ sơ của <strong>${thoat(tenDoanhNghiep)}</strong> đã được duyệt.
</p>
<p style="font-size:16px;line-height:1.6;margin:0 0 24px">
Bước cuối: đặt mật khẩu để đăng nhập.
</p>
<p style="margin:0 0 24px">
<a href="${thoat(lienKet)}" style="display:inline-block;background:#1f6feb;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:16px">Đặt mật khẩu</a>
</p>
<p style="font-size:14px;line-height:1.6;color:#6b7280;margin:0 0 8px">
Liên kết có hiệu lực trong <strong>72 giờ</strong> và chỉ dùng được một lần.
Quá hạn thì liên hệ chúng tôi để nhận liên kết mới.
</p>
<p style="font-size:14px;line-height:1.6;color:#6b7280;margin:0">
Nếu nút trên không bấm được, sao chép liên kết này vào trình duyệt:<br>
<span style="word-break:break-all">${thoat(lienKet)}</span>
</p>`);

  // Bản văn bản thuần phải TỰ ĐỦ NGHĨA — với một số người đây là bản DUY NHẤT họ đọc được.
  const text = [
    `Hồ sơ VATEngine của ${tenDoanhNghiep} đã được duyệt.`,
    "",
    "Bước cuối: đặt mật khẩu để đăng nhập, bằng cách mở liên kết sau:",
    lienKet,
    "",
    "Liên kết có hiệu lực trong 72 giờ và chỉ dùng được một lần.",
    "Quá hạn thì liên hệ chúng tôi để nhận liên kết mới.",
  ].join("\n");

  return { den: "", tieuDe: "Đặt mật khẩu cho tài khoản VATEngine", html, text };
}
```

> Chú ý: đoạn chân thư trong `KHUNG_HTML` hiện ghi *"địa chỉ của bạn vừa được dùng để đăng
> ký VATEngine"* — vẫn đúng với lá thư này (khách đã đăng ký trước đó), nên **không sửa
> `KHUNG_HTML`**. Đổi nó sẽ đụng cả thư xác thực của Lát 1 đang chạy production.

- [ ] **Bước 7: Chạy test, xác nhận XANH**

```bash
npx vitest run -w apps/api apps/api/test/unit/
make lint
```

Kỳ vọng: toàn bộ unit test PASS, lint sạch.

- [ ] **Bước 8: Commit**

```bash
git add apps/api/src/email apps/api/src/routes/dangKy.ts apps/api/src/routes/xacThucEmail.ts apps/api/test/unit
git commit -m "Lát cắt 3: token đặt mật khẩu 72h + mẫu thư; tách sinhToken/bamToken thành module generic"
```

---

## Việc 3 — `POST /dat-mat-khau`

**Files:**
- Tạo: `apps/api/src/routes/datMatKhau.ts`
- Sửa: `apps/api/src/app.ts`
- Test: `apps/api/test/integration/datMatKhau.test.ts` (thêm describe mới)

**Giao diện — dùng từ Việc trước:** `bamToken` (`email/token`), hàm DB `dat_mat_khau_dung`.

**Giao diện — phần sau dựa vào:**
- `POST /dat-mat-khau`, body `{ token: string, mat_khau: string }`
- 200 → `{ ok: true }`
- 400 → `{ error: "het_han" | "da_dung" | "khong_thay" | "bad_request" | "mat_khau_qua_ngan" }`

---

- [ ] **Bước 1: Viết test đỏ**

Thêm bốn dòng `import` này vào **khối import ở ĐẦU** `apps/api/test/integration/datMatKhau.test.ts`
(không đặt giữa file — Biome sẽ báo lỗi và ESM đòi import ở top level):

```ts
import { createApp } from "../../src/app";
import { bamToken } from "../../src/email/token";
import { injectDb, makeEnv, stubTurnstile, voiCaptcha } from "../helpers";
```

rồi thêm `describe` sau vào CUỐI file:

```ts
describe("POST /dat-mat-khau — khách tự đặt mật khẩu bằng link trong thư", () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;
  let tenantId: string;

  beforeEach(async () => {
    stubTurnstile();
    db = await freshDb();
    app = createApp(injectDb(db));
    tenantId = await tenantCoQuanTri(db, "chu.cty@congty.vn");
    // Tenant phải `active` thì mới đăng nhập được sau khi đặt mật khẩu.
    await db.execute(sql`update tenants set trang_thai = 'active' where id = ${tenantId}::uuid`);
  });

  /** Tạo một token thật (thô + băm) đã nằm trong DB, trả về bản THÔ để gửi lên route. */
  async function tokenThat(hetHan = SAU_MOT_GIO()): Promise<string> {
    const tho = "token-tho-cho-test";
    await db.execute(
      sql`select r_nguoi_dung_id from dat_mat_khau_tao(${tenantId}::uuid, ${await bamToken(tho)}, ${hetHan}::timestamptz)`,
    );
    return tho;
  }

  const dat = (body: unknown) =>
    app.request(
      "/dat-mat-khau",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
      makeEnv(),
    );

  it("token hợp lệ + mật khẩu đủ dài → 200, và ĐĂNG NHẬP ĐƯỢC ngay sau đó", async () => {
    const token = await tokenThat();
    const res = await dat({ token, mat_khau: "mat-khau-that-cua-toi" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const login = await app.request(
      "/auth/login",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          voiCaptcha({ email: "chu.cty@congty.vn", password: "mat-khau-that-cua-toi" }),
        ),
      },
      makeEnv(),
    );
    expect(login.status).toBe(200);
  });

  it("🔴 mật khẩu thô KHÔNG đi vào DB — cột chỉ giữ bản băm PBKDF2", async () => {
    const token = await tokenThat();
    await dat({ token, mat_khau: "mat-khau-that-cua-toi" });
    const u = (await db.select().from(nguoiDung).where(eq(nguoiDung.tenantId, tenantId)))[0];
    expect(u?.passwordHash).toMatch(/^pbkdf2\$/);
    expect(u?.passwordHash).not.toContain("mat-khau-that-cua-toi");
  });

  it("token dùng lần hai → 400 da_dung", async () => {
    const token = await tokenThat();
    await dat({ token, mat_khau: "mat-khau-lan-mot" });
    const res = await dat({ token, mat_khau: "mat-khau-lan-hai" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "da_dung" });
  });

  it("token quá hạn → 400 het_han", async () => {
    const token = await tokenThat(TRUOC_MOT_GIO());
    const res = await dat({ token, mat_khau: "mat-khau-du-dai" });
    expect(await res.json()).toEqual({ error: "het_han" });
  });

  it("token bịa → 400 khong_thay", async () => {
    const res = await dat({ token: "khong-he-ton-tai", mat_khau: "mat-khau-du-dai" });
    expect(await res.json()).toEqual({ error: "khong_thay" });
  });

  it("🔴 mật khẩu dưới 8 ký tự → 400 mat_khau_qua_ngan, và token KHÔNG bị tiêu", async () => {
    const token = await tokenThat();
    const res = await dat({ token, mat_khau: "ngan" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "mat_khau_qua_ngan" });
    // Gõ hụt một lần không được đốt mất liên kết duy nhất của khách.
    expect((await dat({ token, mat_khau: "mat-khau-du-dai" })).status).toBe(200);
  });

  it("body hỏng / thiếu trường → 400 bad_request", async () => {
    expect((await dat({ token: "x" })).status).toBe(400);
    expect((await dat(null)).status).toBe(400);
  });

  it("khoá lạ trong body bị TỪ CHỐI (strict), không bị bỏ qua im lặng", async () => {
    const token = await tokenThat();
    const res = await dat({ token, mat_khau: "mat-khau-du-dai", vai_tro: "quan_tri" });
    expect(await res.json()).toEqual({ error: "bad_request" });
  });
});
```

- [ ] **Bước 2: Chạy test, xác nhận ĐỎ**

```bash
npx vitest run -w apps/api apps/api/test/integration/datMatKhau.test.ts
```

Kỳ vọng: các test mới ĐỎ với 404 (route chưa gắn).

- [ ] **Bước 3: Viết route**

Tạo `apps/api/src/routes/datMatKhau.ts`:

```ts
// Lát cắt 3 (QĐ-14) — Khách tự đặt mật khẩu bằng token trong thư duyệt.
//
// ── ROUTE CÔNG KHAI, VÀ VÌ SAO KHÔNG CÓ TURNSTILE ────────────────────────────────────
// `/dang-ky` và `/auth/login` có cổng Turnstile vì chúng nhận đầu vào ĐOÁN ĐƯỢC: một địa
// chỉ email, một mật khẩu do người đặt. Ở đây đầu vào là 32 byte ngẫu nhiên — không có
// gì để đoán, và mỗi lần thử sai chỉ tốn một truy vấn index. Thêm captcha ở đây không
// chặn thêm được gì, nhưng lại thêm một nhánh 503: cấu hình Turnstile sai nghĩa là khách
// đã được duyệt KHÔNG đặt nổi mật khẩu, mà đó lại là bước cuối của cả đường đăng ký.
// Chặn nhịp là việc của rule WAF ở tầng zone (QĐ-11). Cùng tiền lệ với `/xac-thuc-email`
// (Lát cắt 1, đang chạy production).
//
// ── VÌ SAO `POST` ────────────────────────────────────────────────────────────────────
// Cùng bài học QĐ-12: một thao tác GHI dưới dạng `GET` sẽ bị máy quét thư tự fetch. Ở
// đường này còn chắc hơn một bậc — trang SPA không tự gọi khi tải, phải có người gõ mật
// khẩu rồi bấm gửi.
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { bamToken } from "../email/token";
import { hashPassword, resolvePbkdf2Iterations } from "../password";
import type { AppDeps, AppEnv } from "../types";

// 8 ký tự — khớp `MAT_KHAU_TOI_THIEU` ở `routes/auth.ts`. Mật khẩu này KHÔNG có cửa sổ
// hết hạn nên nó phải tự đứng vững.
const TOI_THIEU = 8;

const schema = z.object({ token: z.string().min(1), mat_khau: z.string() }).strict();

interface HangKetQua {
  ket_qua: string;
  r_email: string | null;
}

export function datMatKhauRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();

  r.post("/", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "bad_request" }, 400);
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) return c.json({ error: "bad_request" }, 400);

    // Kiểm độ dài TRƯỚC khi chạm DB: mật khẩu quá ngắn không được TIÊU MẤT token. Khách gõ
    // hụt một lần mà mất luôn liên kết duy nhất thì họ kẹt hoàn toàn — và đó là kiểu kẹt
    // không ai báo cho ta biết, họ chỉ bỏ đi.
    if (parsed.data.mat_khau.length < TOI_THIEU) {
      return c.json({ error: "mat_khau_qua_ngan" }, 400);
    }

    // Băm ở tầng Worker (WebCrypto) rồi mới xuống DB: mật khẩu thô KHÔNG BAO GIỜ đi vào
    // Postgres, nên nó cũng không lọt vào nhật ký truy vấn chậm hay bản sao lưu của DB.
    const hash = await hashPassword(parsed.data.mat_khau, resolvePbkdf2Iterations(c.env));
    const tokenBam = await bamToken(parsed.data.token);

    const { db, close } = await deps.getDb(c.env);
    try {
      // Kiểm + tiêu + đặt mật khẩu nằm TRỌN trong một lời gọi hàm, có `FOR UPDATE`.
      //
      // ⚠️ Viết dưới dạng `select ... from <hàm>()` cho khớp khuôn mẫu SECURITY DEFINER
      // sẵn có, nhưng đây LÀ MỘT THAO TÁC GHI. Nó chỉ an toàn nhờ QĐ-10 (cache Hyperdrive
      // đang TẮT). Bật lại cache là đường đặt mật khẩu hỏng theo đúng cách sự cố
      // 2026-07-21 đã hỏng.
      const res = (await db.execute(
        sql`select ket_qua, r_email from dat_mat_khau_dung(${tokenBam}, ${hash})`,
      )) as { rows: HangKetQua[] };
      const h = res.rows[0];

      if (!h || h.ket_qua !== "ok") {
        // Ba mã lỗi TÁCH BẠCH, vì người dùng làm việc khác nhau với chúng: `het_han` thì
        // xin liên kết mới; `da_dung` thì cứ đăng nhập bình thường (rất hay gặp — bấm hai
        // lần, hoặc mở lại thư cũ); `khong_thay` mới là liên kết hỏng thật.
        const ma = h?.ket_qua === "het_han" || h?.ket_qua === "da_dung" ? h.ket_qua : "khong_thay";
        return c.json({ error: ma }, 400);
      }

      // KHÔNG tự đăng nhập giùm ở đây, dù kỹ thuật làm được. Đặt mật khẩu xong mà vào thẳng
      // app thì khách không bao giờ gõ mật khẩu vừa đặt, và lần sau họ không nhớ nổi nó.
      // Một lần gõ lại ngay lúc còn nhớ là rẻ hơn nhiều một lượt "quên mật khẩu".
      return c.json({ ok: true });
    } finally {
      await close();
    }
  });

  return r;
}
```

- [ ] **Bước 4: Gắn route vào app**

Trong `apps/api/src/app.ts`, thêm import cạnh các import route khác:

```ts
import { datMatKhauRoutes } from "./routes/datMatKhau";
```

và thêm ngay SAU dòng `app.route("/xac-thuc-email", xacThucEmailRoutes(deps));`:

```ts
  // Lát cắt 3 — CÔNG KHAI như /xac-thuc-email: khách chưa có mật khẩu thì đương nhiên
  // chưa có phiên. Thứ bảo vệ là chính token 32 byte trong thư.
  app.route("/dat-mat-khau", datMatKhauRoutes(deps));
```

- [ ] **Bước 5: Chạy test, xác nhận XANH**

```bash
npx vitest run -w apps/api apps/api/test/integration/datMatKhau.test.ts
```

Kỳ vọng: toàn bộ PASS.

- [ ] **Bước 6: Commit**

```bash
git add apps/api/src/routes/datMatKhau.ts apps/api/src/app.ts apps/api/test/integration/datMatKhau.test.ts
git commit -m "Lát cắt 3: POST /dat-mat-khau — khách tự đặt mật khẩu bằng token trong thư"
```

---

## Việc 4 — Đường duyệt gửi thư; gỡ hẳn mật khẩu tạm 6 số

**Files:**
- Sửa: `apps/api/src/routes/admin/tenants.ts`
- Xoá: `apps/api/src/admin/matKhauTam.ts`, `apps/api/test/unit/matKhauTam.test.ts`
- Test: `apps/api/test/integration/admin.tenants.test.ts` (sửa các test cũ)

**Giao diện — dùng từ Việc trước:** `sinhToken`/`bamToken` (`email/token`),
`hanTokenDatMatKhau`/`lienKetDatMatKhau` (`email/tokenDatMatKhau`), `thuDatMatKhau`
(`email/mau`), hàm DB `dat_mat_khau_tao`.

**Giao diện — phần sau (Cổng Admin) dựa vào:**
- `POST /admin/tenants/:id/duyet` → `200 { ok: true, trang_thai: "active", email: string,
  da_gui_thu: boolean, het_han: string }`; **không còn** `mat_khau_tam`.
- `POST /admin/tenants/:id/gui-link-dat-mat-khau` → `200 { ok: true, email, da_gui_thu, het_han }`
  hoặc `404 { error: "not_found" }`. Route `reset-mat-khau` **không còn tồn tại**.

---

- [ ] **Bước 1: Sửa test cũ cho khớp hợp đồng mới (test sẽ ĐỎ)**

Trong `apps/api/test/integration/admin.tenants.test.ts`, thay mọi khẳng định về
`mat_khau_tam`. Các test cần đổi (tìm bằng `grep -n "mat_khau_tam\|reset-mat-khau"`):

```ts
  it("🔴 Duyệt KHÔNG trả mật khẩu — trả kết quả GỬI THƯ (QĐ-14)", async () => {
    const email = makeEmailSpy();
    const app2 = createApp({ ...injectDb(db), getEmailTransport: email.factory });
    const res = await app2.request(
      `/admin/tenants/${tenantChoDuyet}/duyet`,
      { method: "POST", headers: bearer(await adminTokenFor(crypto.randomUUID())) },
      makeEnv(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ ok: true, trang_thai: "active", da_gui_thu: true });
    // Bất biến cốt lõi của Lát cắt 3: không đường nào trả mật khẩu của khách về cho admin.
    expect(body.mat_khau_tam).toBeUndefined();
    expect(JSON.stringify(body)).not.toMatch(/\b\d{6}\b/);

    // Thư đi đúng một lá, tới đúng địa chỉ, và mang link `/dat-mat-khau`.
    expect(email.daGui).toHaveLength(1);
    expect(email.daGui[0]?.den).toBe("chu.cty@congty.vn");
    expect(email.daGui[0]?.text).toContain("/dat-mat-khau?token=");
  });

  it("🔴 gửi thư HỎNG → vẫn duyệt, nhưng phản hồi NÓI RA da_gui_thu=false", async () => {
    // Nếu nuốt lỗi này thì Cổng Admin báo "xong" trong khi khách không bao giờ nhận được
    // gì, và không ai biết cho tới khi khách gọi điện hỏi.
    const email = makeEmailSpy({ daGui: false, lyDo: "tai_khoan_bi_khoa" });
    const app2 = createApp({ ...injectDb(db), getEmailTransport: email.factory });
    const res = await app2.request(
      `/admin/tenants/${tenantChoDuyet}/duyet`,
      { method: "POST", headers: bearer(await adminTokenFor(crypto.randomUUID())) },
      makeEnv(),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, da_gui_thu: false });
  });

  it("🔴 audit ghi ĐÃ GỬI, không ghi token và không ghi email (QĐ-17)", async () => {
    await duyet(tenantChoDuyet);
    const rows = await db.select().from(auditLogAdmin);
    const hang = rows.find((a) => a.hanhDong === "gui_link_dat_mat_khau");
    expect(hang).toBeDefined();
    const chiTiet = JSON.stringify(hang?.chiTiet);
    expect(chiTiet).not.toContain("chu.cty@congty.vn");
    expect(chiTiet).not.toContain("dat-mat-khau?token=");
  });

  it("gui-link-dat-mat-khau gửi thư MỚI và vô hiệu link cũ", async () => {
    const email = makeEmailSpy();
    const app2 = createApp({ ...injectDb(db), getEmailTransport: email.factory });
    const hdr = { method: "POST", headers: bearer(await adminTokenFor(crypto.randomUUID())) };
    await app2.request(`/admin/tenants/${tenantChoDuyet}/duyet`, hdr, makeEnv());
    await app2.request(`/admin/tenants/${tenantChoDuyet}/gui-link-dat-mat-khau`, hdr, makeEnv());
    expect(email.daGui).toHaveLength(2);
    expect(email.daGui[0]?.text).not.toBe(email.daGui[1]?.text); // token khác nhau
  });

  it("gui-link-dat-mat-khau cho tenant không tồn tại → 404", async () => {
    const res = await app.request(
      `/admin/tenants/${crypto.randomUUID()}/gui-link-dat-mat-khau`,
      { method: "POST", headers: bearer(await adminTokenFor(crypto.randomUUID())) },
      makeEnv(),
    );
    expect(res.status).toBe(404);
  });

  it("🔴 route reset-mat-khau cũ KHÔNG còn tồn tại", async () => {
    const res = await app.request(
      `/admin/tenants/${tenantChoDuyet}/reset-mat-khau`,
      { method: "POST", headers: bearer(await adminTokenFor(crypto.randomUUID())) },
      makeEnv(),
    );
    expect(res.status).toBe(404);
  });
```

Đồng thời **xoá** các test cũ dựa vào mật khẩu tạm: test *"Duyệt đặt cờ phai_doi_mat_khau
+ hạn 72h"*, test đăng nhập bằng `mat_khau_tam`, và test *"lần 2 khác lần 1"*. Trong
`apps/api/test/integration/auth.doiMatKhau.test.ts`, hàm trợ giúp ở dòng ~55 lấy
`mat_khau_tam` từ phản hồi duyệt — thay bằng cách đặt mật khẩu trực tiếp:

```ts
/** Đặt mật khẩu cho tài khoản chính của tenant, đi qua đúng đường Lát cắt 3. */
async function datMatKhauQuaLink(db: Db, app: App, tenantId: string, matKhau: string) {
  const tho = `token-${crypto.randomUUID()}`;
  await db.execute(
    sql`select r_nguoi_dung_id from dat_mat_khau_tao(${tenantId}::uuid, ${await bamToken(tho)}, ${new Date(Date.now() + 3600_000).toISOString()}::timestamptz)`,
  );
  const res = await app.request(
    "/dat-mat-khau",
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tho, mat_khau: matKhau }) },
    makeEnv(),
  );
  if (res.status !== 200) throw new Error(`đặt mật khẩu hỏng: ${await res.text()}`);
}
```

- [ ] **Bước 2: Chạy test, xác nhận ĐỎ**

```bash
npx vitest run -w apps/api apps/api/test/integration/admin.tenants.test.ts
```

Kỳ vọng: ĐỎ — phản hồi vẫn có `mat_khau_tam`, `gui-link-dat-mat-khau` trả 404.

- [ ] **Bước 3: Viết `guiLinkDatMatKhau` và thay `datMatKhauTam`**

Trong `apps/api/src/routes/admin/tenants.ts`:

Đổi khối import (bỏ `hanMatKhauTam`/`sinhMatKhauTam`, bỏ `hashPassword`):

```ts
import { ghiAuditAdmin } from "../../admin/auditAdmin";
import { requireSuperAdmin } from "../../admin/requireSuperAdmin";
import { type HanhDongAdmin, chuyenTuHanhDong } from "../../admin/tenantStateMachine";
import { isUuid } from "../../auth";
import { thuDatMatKhau } from "../../email/mau";
import { bamToken, sinhToken } from "../../email/token";
import { hanTokenDatMatKhau, lienKetDatMatKhau } from "../../email/tokenDatMatKhau";
import type { AdminEnv, AnyDb, AppDeps, Env } from "../../types";
import { urlWeb } from "../../urlWeb";
```

Thay TOÀN BỘ hàm `datMatKhauTam` (dòng 43-57) bằng:

```ts
/**
 * Lát cắt 3 (QĐ-14) — Tạo token đặt mật khẩu rồi GỬI THƯ. Dùng chung cho "duyệt" và
 * "gửi lại link". Thay hẳn `datMatKhauTam` cũ.
 *
 * Trả `null` khi tenant không có tài khoản `quan_tri` nào (không tồn tại, hoặc dữ liệu
 * bất thường) — nơi gọi trả 404. KHÔNG tạo người dùng mới: đó không phải việc của đường này.
 *
 * `daGuiThu` phải NỔI LÊN tới phản hồi, không được nuốt. Thư hỏng nghĩa là khách không
 * bao giờ nhận được gì, và chủ dự án là người DUY NHẤT có thể phát hiện — nhưng chỉ khi
 * màn hình nói ra. Đây đúng chỗ mà "đường lỗi bị bỏ quên vì không nằm trên luồng chính".
 */
async function guiLinkDatMatKhau(
  db: AnyDb,
  tenantId: string,
  tenDoanhNghiep: string,
  env: Env,
  deps: AppDeps,
): Promise<{ email: string; hetHan: Date; daGuiThu: boolean } | null> {
  const token = sinhToken();
  const hetHan = hanTokenDatMatKhau();
  const r = (await db.execute(
    sql`select r_nguoi_dung_id, r_email from dat_mat_khau_tao(${tenantId}::uuid, ${await bamToken(token)}, ${hetHan.toISOString()}::timestamptz)`,
  )) as { rows: Array<{ r_nguoi_dung_id: string; r_email: string }> };
  const row = r.rows[0];
  if (!row) return null;

  // Thư hỏng KHÔNG được ném đè lên kết quả chính: tenant đã đổi trạng thái trong DB rồi,
  // trả 500 cho admin sẽ khiến họ bấm Duyệt lại và nhận 409 khó hiểu (F9, cùng lớp với
  // `/dang-ky`). Nhưng KHÁC với Telegram, thư này là mắt xích BẮT BUỘC — nên phản hồi
  // phải nói ra là chưa gửi được.
  let daGuiThu = false;
  try {
    const thu = thuDatMatKhau(tenDoanhNghiep, lienKetDatMatKhau(urlWeb(env), token));
    const kq = await deps.getEmailTransport(env).gui({ ...thu, den: row.r_email });
    daGuiThu = kq.daGui;
    if (!kq.daGui) console.warn(`[admin] không gửi được thư đặt mật khẩu: ${kq.lyDo}`);
  } catch (err) {
    console.warn("[admin] gửi thư đặt mật khẩu ném lỗi:", err instanceof Error ? err.message : err);
  }
  return { email: row.r_email, hetHan, daGuiThu };
}
```

Trong handler chuyển trạng thái, thay khối `if (hanhDong === "duyet")` (dòng 145-167) bằng:

```ts
      // Duyệt = mở tài khoản cho khách ⇒ khách phải đặt được mật khẩu. Trước Lát cắt 3,
      // chỗ này sinh mật khẩu tạm 6 chữ số rồi trả về cho admin tự chuyển cho khách
      // (QĐ-1). QĐ-14 bỏ hẳn đường đó: hệ thống tự gửi thư kèm liên kết, và admin không
      // còn nhìn thấy mật khẩu của khách nữa.
      if (hanhDong === "duyet") {
        const ten = (await db.execute(
          sql`select ten from admin_chi_tiet_tenant(${id}::uuid)`,
        )) as { rows: Array<{ ten: string }> };
        const kq = await guiLinkDatMatKhau(db, id, ten.rows[0]?.ten ?? "", c.env, deps);
        if (kq) {
          await ghiAuditAdmin(db, {
            hanhDong: "gui_link_dat_mat_khau",
            doiTuong: id,
            nguoiThucHien: adminId,
            // QĐ-17 — ghi RẰNG đã gửi, KHÔNG ghi gửi cái gì và gửi cho ai. Token là chìa
            // khoá; email là dữ liệu cá nhân trong một bảng bất biến.
            chiTiet: { da_gui_thu: kq.daGuiThu, het_han: kq.hetHan.toISOString() },
          });
          return c.json({
            ok: true,
            trang_thai: den,
            email: kq.email,
            da_gui_thu: kq.daGuiThu,
            het_han: kq.hetHan.toISOString(),
          });
        }
      }
```

Thay TOÀN BỘ route `reset-mat-khau` (dòng 213-239) bằng:

```ts
  // ── Gửi lại link đặt mật khẩu ──────────────────────────────────────────────────────
  // Tên route đổi từ `reset-mat-khau` (QĐ-14): nó không còn reset mật khẩu nào cả, nó gửi
  // một lá thư. Giữ tên cũ là để lại một cái tên nói dối trong hợp đồng API.
  //
  // Tác dụng phụ CÓ CHỦ Ý: mọi link chưa dùng của tài khoản này chết ngay (hàm
  // `dat_mat_khau_tao` lo). Bấm "Gửi lại" mà link cũ vẫn sống là hai chìa cùng mở một cửa.
  r.post("/:id/gui-link-dat-mat-khau", async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id)) return c.json({ error: "bad_request" }, 400);
    const { db, close } = await deps.getDb(c.env);
    try {
      const ten = (await db.execute(sql`select ten from admin_chi_tiet_tenant(${id}::uuid)`)) as {
        rows: Array<{ ten: string }>;
      };
      if (ten.rows.length === 0) return c.json({ error: "not_found" }, 404);

      const kq = await guiLinkDatMatKhau(db, id, ten.rows[0]?.ten ?? "", c.env, deps);
      if (!kq) return c.json({ error: "not_found" }, 404);

      await ghiAuditAdmin(db, {
        hanhDong: "gui_link_dat_mat_khau",
        doiTuong: id,
        nguoiThucHien: c.get("adminId"),
        chiTiet: { da_gui_thu: kq.daGuiThu, het_han: kq.hetHan.toISOString(), gui_lai: true },
      });
      return c.json({
        ok: true,
        email: kq.email,
        da_gui_thu: kq.daGuiThu,
        het_han: kq.hetHan.toISOString(),
      });
    } finally {
      await close();
    }
  });
```

- [ ] **Bước 4: Xoá mật khẩu tạm**

```bash
git rm apps/api/src/admin/matKhauTam.ts apps/api/test/unit/matKhauTam.test.ts
grep -rn "matKhauTam\|MAT_KHAU_TAM\|cap_mat_khau_tam\|reset_mat_khau_tenant" apps/api/src
```

Lệnh `grep` cuối phải trả về **rỗng**. Còn kết quả nào thì dọn nốt trước khi đi tiếp.

> Nhắc lại ràng buộc: **KHÔNG** đụng `nguoiDung.matKhauTamHetHan`, `phaiDoiMatKhau`, cổng
> kiểm hết-hạn ở `routes/auth.ts`, hay `POST /auth/doi-mat-khau`. Chúng bảo vệ các hàng CŨ.

- [ ] **Bước 5: Chạy toàn bộ test API + lint, xác nhận XANH**

```bash
npx vitest run -w apps/api
make lint
```

Kỳ vọng: tất cả PASS, lint sạch. Nếu `admin.cachLy.test.ts` liệt kê tên hàm `admin_*`,
kiểm xem nó có khẳng định gì về `admin_dat_mat_khau_tam` không — hàm vẫn tồn tại trong DB
(migration cũ không sửa), chỉ không còn ai gọi, nên test đó phải vẫn xanh.

- [ ] **Bước 6: Commit**

```bash
git add -A apps/api
git commit -m "Lát cắt 3 (QĐ-14): duyệt gửi thư link đặt mật khẩu; gỡ hẳn mật khẩu tạm 6 số"
```

---

## Việc 5 — Trang `/dat-mat-khau` (apps/web)

**Files:**
- Tạo: `apps/web/src/features/auth/DatMatKhauPage.tsx`, `apps/web/test/features/datMatKhau.test.tsx`
- Sửa: `apps/web/src/routes/AppRouter.tsx`, `apps/web/src/lib/apiClient.ts`

**Giao diện — dùng từ Việc trước:** `POST /dat-mat-khau` `{token, mat_khau}`.

---

- [ ] **Bước 1: Viết test đỏ**

Tạo `apps/web/test/features/datMatKhau.test.tsx`. Bám đúng khuôn nhà: mock `fetch` (không
mock module `api`), dùng `renderWithProviders(ui, route)` và `json()` từ
`../helpers/renderApp`.

```tsx
// Lát cắt 3 — Trang khách tự đặt mật khẩu.
//
// Test canh ba điều: (1) trang KHÔNG tự tiêu token khi tải, (2) gõ hụt không đốt mất token,
// (3) bốn kết cục có bốn thông điệp khác nhau — gộp lại là bắt khách đoán nên làm gì tiếp.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DatMatKhauPage } from "../../src/features/auth/DatMatKhauPage";
import { json, renderWithProviders } from "../helpers/renderApp";

afterEach(() => vi.restoreAllMocks());

/** Định tuyến fetch theo path. `datMatKhau` quyết định phản hồi của POST /dat-mat-khau;
 * `/me` phải trả 401 vì AuthProvider gọi nó lúc gắn kết và khách ở đây chưa có phiên. */
function mockDat(datMatKhau: () => Response) {
  const goi: unknown[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/dat-mat-khau")) {
      goi.push(init?.body ? JSON.parse(String(init.body)) : null);
      return datMatKhau();
    }
    if (url.endsWith("/me")) return json(401, { error: "unauthorized" });
    return json(200, {});
  });
  return goi;
}

const OK = () => json(200, { ok: true });

function hien(token: string | null) {
  const duong = token === null ? "/dat-mat-khau" : `/dat-mat-khau?token=${token}`;
  return renderWithProviders(<DatMatKhauPage />, duong);
}

async function dienVaGui(mk: string, nhapLai = mk) {
  await userEvent.type(screen.getByLabelText(/mật khẩu mới/i), mk);
  await userEvent.type(screen.getByLabelText(/nhập lại/i), nhapLai);
  await userEvent.click(screen.getByRole("button", { name: /đặt mật khẩu/i }));
}

describe("Trang /dat-mat-khau", () => {
  it("🔴 KHÔNG gọi /dat-mat-khau khi vừa tải — token chỉ bị tiêu khi người dùng bấm gửi", async () => {
    const goi = mockDat(OK);
    hien("token-abc");
    await screen.findByLabelText(/mật khẩu mới/i);
    expect(goi).toHaveLength(0);
  });

  it("thiếu token trong URL → báo liên kết hỏng, KHÔNG hiện form", () => {
    mockDat(OK);
    hien(null);
    expect(screen.getByText(/Liên kết không hợp lệ/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/mật khẩu mới/i)).not.toBeInTheDocument();
  });

  it("🔴 hai ô không khớp → báo tại chỗ, KHÔNG gọi API (không đốt token)", async () => {
    const goi = mockDat(OK);
    hien("token-abc");
    await dienVaGui("mat-khau-du-dai", "mat-khau-khac-han");
    expect(screen.getByText(/không khớp/i)).toBeInTheDocument();
    expect(goi).toHaveLength(0);
  });

  it("🔴 mật khẩu dưới 8 ký tự → báo tại chỗ, KHÔNG gọi API", async () => {
    const goi = mockDat(OK);
    hien("token-abc");
    await dienVaGui("ngan");
    expect(screen.getByText(/ít nhất 8/i)).toBeInTheDocument();
    expect(goi).toHaveLength(0);
  });

  it("đặt thành công → báo xong, mời đăng nhập, và gửi ĐÚNG token + mật khẩu", async () => {
    const goi = mockDat(OK);
    hien("token-abc");
    await dienVaGui("mat-khau-du-dai");
    await waitFor(() => expect(screen.getByText(/Đã đặt mật khẩu xong/i)).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /Đăng nhập/i })).toBeInTheDocument();
    expect(goi[0]).toEqual({ token: "token-abc", mat_khau: "mat-khau-du-dai" });
  });

  it.each([
    ["het_han", /hết hạn/i],
    ["da_dung", /đã được dùng/i],
    ["khong_thay", /không hợp lệ/i],
  ])("lỗi %s hiện đúng thông điệp riêng", async (ma, mong) => {
    mockDat(() => json(400, { error: ma }));
    hien("token-abc");
    await dienVaGui("mat-khau-du-dai");
    await waitFor(() => expect(screen.getByText(mong)).toBeInTheDocument());
  });

  it("🔴 hai ô mật khẩu là type=password — không hiện rõ trên màn hình", () => {
    mockDat(OK);
    hien("token-abc");
    expect(screen.getByLabelText(/mật khẩu mới/i)).toHaveAttribute("type", "password");
    expect(screen.getByLabelText(/nhập lại/i)).toHaveAttribute("type", "password");
  });
});
```

> `ApiError` ở `apps/web/src/lib/apiClient.ts` có chữ ký `(status: number, code?: string)`
> và `request()` tự ném nó từ trường `error` của body — nên mock `fetch` trả
> `json(400, { error: "het_han" })` là đủ để trang nhận đúng `err.code`.

- [ ] **Bước 2: Chạy test, xác nhận ĐỎ**

```bash
npx vitest run -w apps/web apps/web/test/features/datMatKhau.test.tsx
```

Kỳ vọng: ĐỎ — không resolve được `DatMatKhauPage`.

- [ ] **Bước 3: Thêm `datMatKhau` vào apiClient**

Trong `apps/web/src/lib/apiClient.ts`, thêm ngay sau `xacThucEmail` (dòng ~189):

```ts
  /** Lát cắt 3 — Đặt mật khẩu bằng token trong thư duyệt.
   *
   * `POST` và chỉ gọi khi người dùng BẤM GỬI. Trang không tự gọi lúc tải, nên kể cả một
   * máy quét thư biết chạy JavaScript cũng không tiêu được token. */
  datMatKhau(token: string, matKhau: string): Promise<{ ok: true }> {
    return request("POST", "/dat-mat-khau", { body: { token, mat_khau: matKhau } });
  },
```

- [ ] **Bước 4: Viết trang**

Tạo `apps/web/src/features/auth/DatMatKhauPage.tsx`:

```tsx
// Lát cắt 3 (QĐ-14) — Trang khách tự đặt mật khẩu sau khi hồ sơ được duyệt.
//
// ── KHÁC TRANG /xac-thuc-email MỘT ĐIỂM QUAN TRỌNG ───────────────────────────────────
// Trang xác thực tự gửi POST ngay khi tải, vì nó không cần khách nhập gì. Trang này thì
// KHÔNG — nó hiện form và chỉ gọi API khi khách bấm gửi. Hệ quả tốt: token không bị tiêu
// bởi bất kỳ thứ gì tự động, kể cả trình duyệt tải trước hay tiện ích mở link ngầm.
//
// Cũng vì thế trang KHÔNG kiểm token trước khi hiện form. Kiểm trước cần thêm một endpoint
// đọc, mà một endpoint `GET` nhận token lại mở đúng cánh cửa vừa đóng. Một lần chạm token,
// một endpoint.
import { type FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Brand } from "../../components/Brand";
import { Alert, Card } from "../../components/ui/primitives";
import { ApiError, api } from "../../lib/apiClient";

/** Khớp `TOI_THIEU` ở `apps/api/src/routes/datMatKhau.ts` và `MAT_KHAU_TOI_THIEU` ở
 * `routes/auth.ts`. Kiểm ở client là để báo NGAY, không phải để bảo vệ — server vẫn ép. */
const TOI_THIEU = 8;

type KetCuc = "het_han" | "da_dung" | "khong_thay";

const LOI_MAY_CHU: Record<KetCuc, string> = {
  het_han:
    "Liên kết đã hết hạn. Liên kết đặt mật khẩu chỉ có hiệu lực trong 72 giờ — vui lòng liên hệ chúng tôi để nhận liên kết mới.",
  da_dung:
    "Liên kết này đã được dùng để đặt mật khẩu rồi. Nếu đó là bạn, hãy đăng nhập bình thường.",
  khong_thay:
    "Liên kết không hợp lệ. Liên kết có thể bị cắt ngắn khi sao chép từ thư — hãy thử mở lại đúng liên kết trong thư.",
};

function maLoi(err: unknown): KetCuc {
  if (err instanceof ApiError && (err.code === "het_han" || err.code === "da_dung")) {
    return err.code;
  }
  return "khong_thay";
}

export function DatMatKhauPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [matKhau, setMatKhau] = useState("");
  const [nhapLai, setNhapLai] = useState("");
  const [loi, setLoi] = useState<string | null>(null);
  const [dangGui, setDangGui] = useState(false);
  const [xong, setXong] = useState(false);

  async function gui(e: FormEvent) {
    e.preventDefault();
    // Kiểm tại chỗ TRƯỚC khi gọi: một lần gõ hụt không được đốt mất liên kết duy nhất của
    // khách. Server cũng kiểm độ dài trước khi chạm token, nên hai tầng khớp nhau.
    if (matKhau.length < TOI_THIEU) {
      setLoi(`Mật khẩu phải có ít nhất ${TOI_THIEU} ký tự.`);
      return;
    }
    if (matKhau !== nhapLai) {
      setLoi("Hai ô mật khẩu không khớp.");
      return;
    }
    setLoi(null);
    setDangGui(true);
    try {
      await api.datMatKhau(token as string, matKhau);
      setXong(true);
    } catch (err) {
      setLoi(LOI_MAY_CHU[maLoi(err)]);
    } finally {
      setDangGui(false);
    }
  }

  const khung = (noiDung: React.ReactNode) => (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "var(--sp-6) var(--sp-4)",
      }}
    >
      <div style={{ width: "min(100%, 34rem)", display: "grid", gap: "var(--sp-5)" }}>
        <Brand />
        <Card>{noiDung}</Card>
      </div>
    </main>
  );

  if (!token) {
    return khung(
      <>
        <h1 style={{ margin: "0 0 var(--sp-3)", fontSize: "var(--fs-2xl)" }}>
          Liên kết không hợp lệ
        </h1>
        <Alert tone="danger">{LOI_MAY_CHU.khong_thay}</Alert>
        <p style={{ fontSize: "var(--fs-base)", marginBottom: 0 }}>
          <Link to="/login">← Về trang đăng nhập</Link>
        </p>
      </>,
    );
  }

  if (xong) {
    return khung(
      <>
        <h1 style={{ margin: "0 0 var(--sp-3)", fontSize: "var(--fs-2xl)" }}>
          Đã đặt mật khẩu xong
        </h1>
        <Alert tone="success">
          Tài khoản của bạn đã sẵn sàng. Hãy đăng nhập bằng email và mật khẩu vừa đặt.
        </Alert>
        <p style={{ fontSize: "var(--fs-base)", marginBottom: 0 }}>
          <Link to="/login">Đăng nhập →</Link>
        </p>
      </>,
    );
  }

  return khung(
    <form onSubmit={(e) => void gui(e)}>
      <h1 style={{ margin: "0 0 var(--sp-3)", fontSize: "var(--fs-2xl)" }}>Đặt mật khẩu</h1>
      <p style={{ fontSize: "var(--fs-base)", marginTop: 0 }}>
        Hồ sơ của bạn đã được duyệt. Đặt mật khẩu để bắt đầu dùng VATEngine.
      </p>

      {loi && <Alert tone="danger">{loi}</Alert>}

      <label htmlFor="mk" style={{ display: "block", marginBottom: "var(--sp-2)" }}>
        Mật khẩu mới (ít nhất {TOI_THIEU} ký tự)
      </label>
      <input
        id="mk"
        type="password"
        autoComplete="new-password"
        value={matKhau}
        onChange={(e) => setMatKhau(e.target.value)}
        style={{ width: "100%", marginBottom: "var(--sp-4)" }}
      />

      <label htmlFor="mk2" style={{ display: "block", marginBottom: "var(--sp-2)" }}>
        Nhập lại mật khẩu
      </label>
      <input
        id="mk2"
        type="password"
        autoComplete="new-password"
        value={nhapLai}
        onChange={(e) => setNhapLai(e.target.value)}
        style={{ width: "100%", marginBottom: "var(--sp-4)" }}
      />

      <button type="submit" disabled={dangGui} style={{ width: "100%" }}>
        {dangGui ? "Đang đặt…" : "Đặt mật khẩu"}
      </button>
    </form>,
  );
}
```

> Đọc `apps/web/src/features/auth/LoginPage.tsx` và `components/ui/primitives` trước khi
> chốt phần trình bày — dùng đúng các nguyên thuỷ và biến CSS đang có, không tự đặt style
> mới. `07-DESIGN_TOKENS.md` là nguồn cho biến CSS.

- [ ] **Bước 5: Thêm route**

Trong `apps/web/src/routes/AppRouter.tsx`, thêm import:

```tsx
import { DatMatKhauPage } from "../features/auth/DatMatKhauPage";
```

và thêm ngay sau route `/xac-thuc-email`:

```tsx
      {/* Lát cắt 3 — Đích của liên kết trong thư duyệt. CÔNG KHAI và KHÔNG đá người đang
          đăng nhập đi đâu cả, cùng lý do với /xac-thuc-email: rất có thể họ mở thư ở một
          máy khác, hoặc đang đăng nhập bằng một tài khoản khác. */}
      <Route path="/dat-mat-khau" element={<DatMatKhauPage />} />
```

- [ ] **Bước 6: Chạy test, xác nhận XANH**

```bash
npx vitest run -w apps/web
make lint
```

- [ ] **Bước 7: Commit**

```bash
git add apps/web
git commit -m "Lát cắt 3: trang /dat-mat-khau — khách tự đặt mật khẩu từ link trong thư"
```

---

## Việc 6 — Cổng Admin thôi hiện mật khẩu

**Files:**
- Tạo: `apps/admin/src/features/tenants/DaGuiThuDialog.tsx`
- Xoá: `apps/admin/src/features/tenants/MatKhauTamDialog.tsx`
- Sửa: `apps/admin/src/lib/types.ts`, `apps/admin/src/lib/adminApiClient.ts`,
  `apps/admin/src/features/tenants/TenantsPage.tsx`, `apps/admin/src/features/audit/AuditPage.tsx`
- Test: `apps/admin/test/features/congAdmin.test.tsx`

**Giao diện — dùng từ Việc 4:** `duyetTenant` / `guiLaiLinkDatMatKhau` trả
`{ ok, trang_thai?, email, da_gui_thu, het_han }`.

---

- [ ] **Bước 1: Sửa test cho khớp hợp đồng mới (test sẽ ĐỎ)**

Trong `apps/admin/test/features/congAdmin.test.tsx`:

1. Trong khối `vi.mock` ở đầu file, đổi `resetMatKhau: vi.fn()` → `guiLaiLinkDatMatKhau: vi.fn()`.
2. Thay TOÀN BỘ `describe("🔴 D3 — mật khẩu tạm hiện MỘT LẦN", ...)` (dòng ~132-210) bằng:

```tsx
describe("🔴 Lát cắt 3 — Duyệt KHÔNG còn hiện mật khẩu, chỉ báo đã gửi thư", () => {
  const ketQua = {
    ok: true as const,
    trang_thai: "active" as const,
    email: "chu@congty.vn",
    da_gui_thu: true,
    het_han: "2026-07-25T03:00:00.000Z",
  };

  it("Duyệt → hộp thoại nói đã gửi thư tới đâu, KHÔNG có mật khẩu nào", async () => {
    api.lietKeTenant.mockResolvedValue({ items: [tenant()], total: 1 });
    api.duyetTenant.mockResolvedValue(ketQua);
    renderTenants();

    await userEvent.click(await screen.findByRole("button", { name: "Duyệt" }));

    const hop = within(await screen.findByRole("dialog"));
    expect(hop.getByText(/Đã gửi thư đặt mật khẩu/i)).toBeInTheDocument();
    expect(hop.getByText("chu@congty.vn")).toBeInTheDocument();
    // Bất biến cốt lõi của QĐ-14: không còn mã nào để chủ dự án nhìn thấy.
    expect(screen.queryByTestId("mat-khau-tam")).not.toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toMatch(/\b\d{6}\b/);
    expect(api.duyetTenant).toHaveBeenCalledWith(tenant().id);
  });

  it("nút Đóng KHÔNG còn bị vô hiệu — không còn bí mật nào phải bắt xác nhận đã lưu", async () => {
    api.lietKeTenant.mockResolvedValue({ items: [tenant()], total: 1 });
    api.duyetTenant.mockResolvedValue(ketQua);
    renderTenants();
    await userEvent.click(await screen.findByRole("button", { name: "Duyệt" }));

    const hop = within(await screen.findByRole("dialog"));
    expect(hop.getByRole("button", { name: "Đóng" })).toBeEnabled();
    await userEvent.click(hop.getByRole("button", { name: "Đóng" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("🔴 gửi thư HỎNG → cảnh báo ĐỎ và có nút gửi lại ngay trong hộp thoại", async () => {
    // Nuốt lỗi này nghĩa là khách ngồi chờ một lá thư không bao giờ tới, và chủ dự án
    // tưởng mình đã xong việc.
    api.lietKeTenant.mockResolvedValue({ items: [tenant()], total: 1 });
    api.duyetTenant.mockResolvedValue({ ...ketQua, da_gui_thu: false });
    renderTenants();
    await userEvent.click(await screen.findByRole("button", { name: "Duyệt" }));

    const hop = within(await screen.findByRole("dialog"));
    expect(hop.getByText(/CHƯA gửi được thư/i)).toBeInTheDocument();
    expect(hop.getByRole("button", { name: "Gửi lại thư" })).toBeInTheDocument();
  });

  it("nút gửi lại trong hộp thoại gọi ĐÚNG tenant vừa duyệt", async () => {
    api.lietKeTenant.mockResolvedValue({ items: [tenant()], total: 1 });
    api.duyetTenant.mockResolvedValue({ ...ketQua, da_gui_thu: false });
    api.guiLaiLinkDatMatKhau.mockResolvedValue(ketQua);
    renderTenants();
    await userEvent.click(await screen.findByRole("button", { name: "Duyệt" }));

    const hop = within(await screen.findByRole("dialog"));
    await userEvent.click(hop.getByRole("button", { name: "Gửi lại thư" }));
    await waitFor(() =>
      expect(api.guiLaiLinkDatMatKhau).toHaveBeenCalledWith(tenant().id),
    );
  });

  it("tenant active có nút 'Gửi lại link đặt mật khẩu', KHÔNG còn 'Cấp lại mật khẩu'", async () => {
    api.lietKeTenant.mockResolvedValue({
      items: [tenant({ trang_thai: "active" })],
      total: 1,
    });
    api.guiLaiLinkDatMatKhau.mockResolvedValue(ketQua);
    renderTenants();

    await userEvent.click(
      await screen.findByRole("button", { name: "Gửi lại link đặt mật khẩu" }),
    );
    expect(screen.queryByRole("button", { name: "Cấp lại mật khẩu" })).not.toBeInTheDocument();
    const hop = within(await screen.findByRole("dialog"));
    expect(hop.getByText(/Đã gửi thư đặt mật khẩu/i)).toBeInTheDocument();
  });
});
```

3. Nếu có test nào khẳng định `hanhDongChoTrangThai("active")` trả `["khoa", "reset"]`,
   đổi giá trị mong đợi thành `["khoa", "gui_lai_link"]`. Tìm bằng:
   `grep -n "hanhDongChoTrangThai" apps/admin/test/features/congAdmin.test.tsx`

> `renderTenants()`, `tenant()` và `vi.spyOn(window, "confirm")` đã có sẵn trong file —
> các test trên bám đúng khuôn đó, không dựng thêm hạ tầng test mới.

- [ ] **Bước 2: Chạy test, xác nhận ĐỎ**

```bash
npx vitest run -w apps/admin
```

- [ ] **Bước 3: Đổi kiểu**

Trong `apps/admin/src/lib/types.ts`, thay TOÀN BỘ `KetQuaCapMatKhau` bằng:

```ts
/**
 * Phản hồi của `duyet` và `gui-link-dat-mat-khau` (QĐ-14).
 *
 * KHÔNG còn `mat_khau_tam`. Trước Lát cắt 3, chủ dự án nhìn thấy mật khẩu 6 chữ số của
 * khách rồi tự chuyển cho họ qua điện thoại/Zalo. Giờ hệ thống gửi thư kèm liên kết, và
 * thứ duy nhất Cổng Admin biết là thư ĐÃ ĐI HAY CHƯA.
 *
 * `da_gui_thu` phải được hiện ra, không được nuốt: nó `false` nghĩa là khách sẽ không bao
 * giờ nhận được gì, và chủ dự án là người duy nhất có thể phát hiện.
 */
export interface KetQuaGuiThuDatMatKhau {
  ok: true;
  trang_thai?: TrangThaiTenant;
  /** Địa chỉ thư đã gửi tới — để chủ dự án đối chiếu đúng người. */
  email: string;
  da_gui_thu: boolean;
  het_han: string;
}
```

- [ ] **Bước 4: Đổi apiClient**

Trong `apps/admin/src/lib/adminApiClient.ts`:

```ts
  /**
   * Duyệt tenant. Hệ thống TỰ gửi thư kèm liên kết đặt mật khẩu (QĐ-14) — phản hồi chỉ
   * cho biết thư đã đi hay chưa, KHÔNG mang mật khẩu nào.
   */
  duyetTenant(id: string): Promise<KetQuaGuiThuDatMatKhau> {
    return request("POST", `/admin/tenants/${id}/duyet`);
  },
```

Thay `resetMatKhau` bằng:

```ts
  /** Gửi LẠI liên kết đặt mật khẩu. Mọi liên kết cũ chưa dùng của tài khoản này chết ngay. */
  guiLaiLinkDatMatKhau(id: string): Promise<KetQuaGuiThuDatMatKhau> {
    return request("POST", `/admin/tenants/${id}/gui-link-dat-mat-khau`);
  },
```

Sửa import kiểu ở đầu file: `KetQuaCapMatKhau` → `KetQuaGuiThuDatMatKhau`.

- [ ] **Bước 5: Viết `DaGuiThuDialog`**

Tạo `apps/admin/src/features/tenants/DaGuiThuDialog.tsx`:

```tsx
// Lát cắt 3 (QĐ-14) — Báo kết quả gửi thư sau khi Duyệt / Gửi lại liên kết.
//
// Thay `MatKhauTamDialog`. Hộp thoại cũ tồn tại để hiện MỘT THỨ KHÔNG LẤY LẠI ĐƯỢC — mật
// khẩu 6 chữ số mà chủ dự án phải tự chuyển cho khách. Giờ hệ thống tự gửi, nên hộp thoại
// này không còn giữ bí mật nào. Việc DUY NHẤT của nó là trả lời một câu: thư đã đi chưa?
//
// Và chính câu đó mới là lý do nó vẫn phải tồn tại. Nếu SES hỏng mà màn hình vẫn báo
// "xong", khách ngồi chờ một lá thư không bao giờ tới, và không ai biết cho tới khi họ
// gọi điện — nếu họ còn buồn gọi.
import type { KetQuaGuiThuDatMatKhau } from "../../lib/types";

interface Props {
  ketQua: KetQuaGuiThuDatMatKhau;
  onDong: () => void;
  /** Bấm để thử gửi lại ngay, không phải đóng ra rồi đi tìm nút. Chỉ hiện khi gửi hỏng. */
  onGuiLai: () => void;
}

export function DaGuiThuDialog({ ketQua, onDong, onGuiLai }: Props) {
  const hetHan = new Date(ketQua.het_han);
  const hong = !ketQua.da_gui_thu;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "grid",
        placeItems: "center",
        padding: "1.5rem",
        zIndex: 50,
      }}
    >
      <dialog
        open
        aria-modal="true"
        aria-labelledby="gui-thu-tieu-de"
        style={{
          position: "static",
          width: "min(100%, 32rem)",
          color: "var(--chu)",
          background: "var(--nen-noi)",
          border: `2px solid ${hong ? "var(--nguy)" : "var(--tot)"}`,
          borderRadius: "12px",
          padding: "1.75rem",
        }}
      >
        <h2 id="gui-thu-tieu-de" style={{ margin: "0 0 0.75rem", fontSize: "1.25rem" }}>
          {hong ? "⚠️ CHƯA gửi được thư" : "Đã gửi thư đặt mật khẩu"}
        </h2>

        {hong ? (
          <>
            <p style={{ margin: "0 0 1rem", color: "var(--nguy)", fontWeight: 600 }}>
              Doanh nghiệp đã được duyệt, nhưng thư tới <strong>{ketQua.email}</strong> KHÔNG gửi
              được. Khách sẽ không nhận được gì và không đặt được mật khẩu.
            </p>
            <p style={{ margin: "0 0 1.25rem", color: "var(--chu-mo)" }}>
              Thử gửi lại. Nếu vẫn hỏng, kiểm tra cấu hình gửi thư (SES) trước khi báo cho khách.
            </p>
            <button
              type="button"
              onClick={onGuiLai}
              style={{
                width: "100%",
                padding: "0.7rem",
                background: "var(--nhan)",
                color: "#1f1300",
                border: "none",
                fontWeight: 700,
                marginBottom: "0.75rem",
              }}
            >
              Gửi lại thư
            </button>
          </>
        ) : (
          <>
            <p style={{ margin: "0 0 1rem" }}>
              Thư kèm liên kết đặt mật khẩu đã gửi tới <strong>{ketQua.email}</strong>.
            </p>
            <p style={{ margin: "0 0 1.25rem", color: "var(--chu-mo)" }}>
              Liên kết hết hạn lúc{" "}
              <strong>{hetHan.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</strong>{" "}
              (giờ VN). Khách tự đặt mật khẩu rồi đăng nhập — bạn không cần làm gì thêm.
            </p>
          </>
        )}

        <button
          type="button"
          onClick={onDong}
          style={{
            width: "100%",
            padding: "0.7rem",
            background: "var(--nen-noi-2)",
            color: "var(--chu)",
            border: "1px solid var(--vien)",
            fontWeight: 600,
          }}
        >
          Đóng
        </button>
      </dialog>
    </div>
  );
}
```

- [ ] **Bước 6: Sửa `TenantsPage.tsx`**

Bốn chỗ:

1. Import: `MatKhauTamDialog` → `DaGuiThuDialog`; `KetQuaCapMatKhau` → `KetQuaGuiThuDatMatKhau`.
2. `HanhDong`: `"reset"` → `"gui_lai_link"`; `goiApi` gọi `adminApi.guiLaiLinkDatMatKhau(id)`;
   `NHAN_NUT.gui_lai_link = "Gửi lại link đặt mật khẩu"`;
   `hanhDongChoTrangThai("active")` trả `["khoa", "gui_lai_link"]`.
3. Câu xác nhận:

```ts
const XAC_NHAN: Record<HanhDong, (t: TenantRow) => string> = {
  duyet: (t) => `Duyệt "${t.ten}" (MST ${t.mst})? Hệ thống sẽ gửi thư kèm liên kết đặt mật khẩu cho khách.`,
  tu_choi: (t) => `Từ chối "${t.ten}"? Đây là trạng thái CUỐI — không hoàn tác được.`,
  khoa: (t) => `Khóa "${t.ten}"? Khách sẽ không đăng nhập mới được nữa.`,
  mo_khoa: (t) => `Mở khóa "${t.ten}"? Khách đăng nhập lại được ngay.`,
  gui_lai_link: (t) => `Gửi lại liên kết đặt mật khẩu cho "${t.ten}"? Liên kết cũ sẽ hết hiệu lực ngay.`,
};
```

4. State + render:

```ts
  const [ketQuaGui, setKetQuaGui] = useState<KetQuaGuiThuDatMatKhau | null>(null);
  const [tenantDangThaoTac, setTenantDangThaoTac] = useState<string | null>(null);
```

trong `onSuccess`: `if ("da_gui_thu" in kq) setKetQuaGui(kq as KetQuaGuiThuDatMatKhau);`
(nhớ đặt `setTenantDangThaoTac(id)` trong `bam()` để nút "Gửi lại thư" biết gửi cho ai);
và cuối JSX:

```tsx
      {ketQuaGui && (
        <DaGuiThuDialog
          ketQua={ketQuaGui}
          onDong={() => setKetQuaGui(null)}
          onGuiLai={() => {
            if (tenantDangThaoTac) {
              thaoTac.mutate({ hanhDong: "gui_lai_link", id: tenantDangThaoTac });
            }
          }}
        />
      )}
```

Đồng thời sửa `KetQuaThaoTac` = `KetQuaGuiThuDatMatKhau | { ok: true; trang_thai: TrangThaiTenant }`.

- [ ] **Bước 7: Sửa nhãn nhật ký**

Trong `apps/admin/src/features/audit/AuditPage.tsx` dòng 20, thay:

```ts
  cap_mat_khau_tam: "Cấp mật khẩu tạm",
```

bằng:

```ts
  // Giữ nhãn cũ để các hàng audit ĐÃ GHI trước Lát cắt 3 vẫn đọc được — bảng này bất biến.
  cap_mat_khau_tam: "Cấp mật khẩu tạm (đã ngừng)",
  reset_mat_khau_tenant: "Cấp lại mật khẩu tạm (đã ngừng)",
  gui_link_dat_mat_khau: "Gửi liên kết đặt mật khẩu",
```

- [ ] **Bước 8: Xoá hộp thoại cũ, chạy test**

```bash
git rm apps/admin/src/features/tenants/MatKhauTamDialog.tsx
grep -rn "mat_khau_tam\|MatKhauTam\|resetMatKhau" apps/admin/src
npx vitest run -w apps/admin
make lint
```

`grep` phải trả rỗng; test và lint phải xanh.

- [ ] **Bước 9: Commit**

```bash
git add -A apps/admin
git commit -m "Lát cắt 3: Cổng Admin bỏ hiện mật khẩu, báo kết quả gửi thư (kèm cảnh báo khi hỏng)"
```

---

## Việc 7 — Tài liệu và runbook deploy

**Files:**
- Sửa: `docs/plans/U34-KE-HOACH-LAT-CAT.md`, `docs/plans/COMMERCIAL-LAYER-tinh-hinh.md`,
  `docs/BACKLOG-y-tuong-va-de-xuat.md`, `docs/CHECKLIST-NGHIEM-THU.md`

---

- [ ] **Bước 1: Chạy cổng kiểm chứng đầy đủ**

```bash
make lint && make test
```

Không nối `&&` từ một lệnh in màn hình (bài học đã ghi trong bộ nhớ dự án). Cả hai phải xanh.

- [ ] **Bước 2: Cập nhật kế hoạch lát cắt**

Trong `docs/plans/U34-KE-HOACH-LAT-CAT.md` §Lát cắt 3, thêm bảng trạng thái từng việc
(migration / route / thư / trang `/dat-mat-khau` / Cổng Admin / gỡ mã 6 số / deploy /
nghiệm thu) — đánh dấu tất cả trừ **deploy** và **nghiệm thu**, vì hai mục đó chưa xảy ra.

- [ ] **Bước 3: Ghi vào sổ tầng chương trình và BACKLOG**

`COMMERCIAL-LAYER-tinh-hinh.md`: đánh dấu nợ mức CAO số 4 (mật khẩu tạm 6 số) là **ĐÃ GIẢI
— QĐ-14 thực thi ở Lát cắt 3**.

`BACKLOG-y-tuong-va-de-xuat.md`: thêm hai mục nhỏ
1. Hàm `admin_dat_mat_khau_tam` (0011) nay mồ côi — dọn ở một migration sau, không dọn ở đây
   vì migration là lịch sử.
2. Cột `nguoi_dung.mat_khau_tam_het_han` / `phai_doi_mat_khau` chỉ còn phục vụ các hàng CŨ.
   Khi xác nhận không hàng nào còn mật khẩu tạm sống, bỏ cột và cổng kiểm ở `routes/auth.ts`.

- [ ] **Bước 4: Viết runbook deploy vào `CHECKLIST-NGHIEM-THU.md`**

```markdown
## Lát cắt 3 — deploy (thứ tự KHÔNG được đảo)

1. `make migrate` — áp 0014. `drizzle-kit migrate` NUỐT thông báo lỗi (chỉ quay spinner
   rồi thoát mã 1). Hỏng thì áp tay bằng `pg`: tách theo `--> statement-breakpoint`, chạy
   trong transaction, in lỗi TỪNG CÂU.
2. Hậu kiểm DB, 6 điểm:
   - `dat_mat_khau` tồn tại; `relrowsecurity` và `relforcerowsecurity` đều `true`; 0 policy.
   - `dat_mat_khau_tao` và `dat_mat_khau_dung` thuộc role `dat_mat_khau_api`.
   - `has_function_privilege('vat_app', <oid>, 'EXECUTE')` = `true` cho cả hai hàm.
   - `has_function_privilege('public', <oid>, 'EXECUTE')` = `false` cho cả hai hàm.
3. Deploy `vat-api`.
4. Deploy `vat-web`.
5. Deploy `vat-admin`.
6. Smoke: mở `https://vatengine.tourdao.vn/dat-mat-khau` (không có token) → phải thấy
   "Liên kết không hợp lệ", KHÔNG phải trang trắng.

**Nghiệm thu bằng người thật, không bằng test:** đăng ký một hồ sơ thật → xác thực email →
chủ dự án bấm Duyệt trên Cổng Admin → xác nhận **không thấy mã 6 số nào** → mở hộp thư
khách → bấm liên kết → đặt mật khẩu → đăng nhập được.
```

- [ ] **Bước 5: Commit và đẩy**

```bash
git add docs
git commit -m "docs: Lát cắt 3 — runbook deploy, cập nhật sổ nợ và kế hoạch lát cắt"
git push origin HEAD:feat/u34-lat3-dat-mat-khau
```

> ⚠️ Luôn dùng dạng tường minh `HEAD:<nhánh>`. Kho này đã một lần đẩy nhầm nhánh cục bộ cũ
> trùng tên và bị từ chối non-fast-forward một cách khó hiểu.

---

## Việc bị BỎ SÓT nếu không rà — đã rà, và đây là kết luận

| Đường ít ai nghĩ tới | Xử lý trong lát cắt này |
|---|---|
| Gửi thư hỏng lúc duyệt | ✅ `da_gui_thu` nổi lên tới phản hồi + cảnh báo đỏ + nút gửi lại (Việc 4, 6) |
| Khách gõ hụt mật khẩu → mất token | ✅ Kiểm độ dài TRƯỚC khi chạm DB, cả ở client lẫn server (Việc 3, 5) |
| Bấm liên kết hai lần | ✅ `da_dung` có thông điệp riêng, giọng không doạ (Việc 3, 5) |
| Bấm "Gửi lại" nhưng link cũ vẫn sống | ✅ `dat_mat_khau_tao` vô hiệu mọi token chưa dùng (Việc 1) |
| Tenant bị khoá sau khi duyệt | ✅ Cổng trạng thái ở `routes/auth.ts` vẫn chặn; không nhân đôi chốt (Việc 1) |
| Người dùng CŨ còn mật khẩu tạm đang sống | ✅ Giữ nguyên cột + cổng kiểm hết-hạn ở login (Ràng buộc toàn cục) |
| Máy quét thư tiêu mất token | ✅ Trang không tự gọi API; chỉ POST khi người bấm (Việc 5) |
| Hạn mức SES cạn | ⚠️ **Không thuộc lát cắt này.** SES 50.000/ngày (QĐ-16) — trần cứng tầng ứng dụng thuộc **Lát cắt 2** |

## Còn treo — KHÔNG thuộc lát cắt này, chủ dự án quyết

1. 🔴 **Rule rate-limit WAF trên Cloudflare vẫn chưa ai kiểm chứng.** Sau Lát cắt 3, nó
   không còn che cho mật khẩu 6 số nữa (mã đó biến mất) — nên rủi ro **giảm**, không tăng.
   Nhưng `/auth/login` vẫn cần nó. Vẫn là việc của chủ dự án.
2. **Câu hỏi pháp lý về email thô đã nằm trong `audit_log`** (ADR-0007 §2.4) — Lát cắt 4.
3. **Từ chối hồ sơ có báo khách không** — chưa chốt, ghi ở §7 của
   `U34-plan-email-va-thong-bao.md`.

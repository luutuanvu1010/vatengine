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
    db.execute(
      sql`select ket_qua, r_email from dat_mat_khau_dung(${tokenBam}, ${hash})`,
    ) as Promise<{
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

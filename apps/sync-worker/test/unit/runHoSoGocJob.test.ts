import { GdtError } from "@vat/gdt-client";
import type { HoSoGocDaTach, HoSoGocMessage } from "@vat/sync";
import { zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import {
  type RunHoSoGocJobDeps,
  hoSoGocConsumerAction,
  runHoSoGocJob,
} from "../../src/runHoSoGocJob";
import type { AccountToken } from "../../src/types";

const MSG: HoSoGocMessage = {
  kind: "hoso",
  tenantId: "t-A",
  taikhoanId: "acc-1",
  hoaDonId: "hd-1",
  ref: { nbmst: "0100000001", khhdon: "C26TQO", khmshdon: "1", shdon: "13580", source: "normal" },
};

const enc = new TextEncoder();
const ZIP = zipSync({
  "invoice.xml": enc.encode("<HDon/>"),
  "invoice.html": enc.encode("<html></html>"),
  "details.js": enc.encode("jq"),
});

const TOKEN_SONG: AccountToken = {
  tokenHienTai: "jwt-song",
  tokenHetHan: new Date("2026-07-29T00:00:00Z"),
};

function deps(over: Partial<RunHoSoGocJobDeps> = {}): RunHoSoGocJobDeps {
  return {
    now: () => new Date("2026-07-28T00:00:00Z").getTime(),
    loadAccount: async () => TOKEN_SONG,
    limiter: { tryAcquire: async () => ({ allowed: true }), recordResult: async () => {} },
    daCo: async () => false,
    taiHoSoGoc: async () => ZIP,
    luuHoSoGoc: async () => {},
    ghiNhanKhongCoHoSoGoc: async () => {},
    markTokenDead: async () => {},
    ...over,
  };
}

describe("runHoSoGocJob — đường thành công", () => {
  it("tải, tách, lưu → completed; lưu ĐÚNG hai tệp riêng + tài nguyên chung", async () => {
    const daLuu: Array<[string, string, HoSoGocDaTach]> = [];
    const out = await runHoSoGocJob(
      deps({
        luuHoSoGoc: async (tenantId, hoaDonId, daTach) => {
          daLuu.push([tenantId, hoaDonId, daTach]);
        },
      }),
      MSG,
    );

    expect(out.kind).toBe("completed");
    expect(daLuu).toHaveLength(1);
    expect(daLuu[0]?.[0]).toBe("t-A");
    expect(daLuu[0]?.[1]).toBe("hd-1");
    expect(new TextDecoder().decode(daLuu[0]?.[2].xml)).toBe("<HDon/>");
    expect(Object.keys(daLuu[0]?.[2].taiNguyenChung ?? {})).toEqual(["details.js"]);
  });
});

describe("runHoSoGocJob — kho bất biến: đã có thì KHÔNG gọi GDT", () => {
  it("daCo=true → ack_skip 'da_co', KHÔNG chạm token, KHÔNG chạm limiter, KHÔNG gọi GDT", async () => {
    const taiHoSoGoc = vi.fn();
    const tryAcquire = vi.fn();
    const loadAccount = vi.fn();

    const out = await runHoSoGocJob(
      deps({
        daCo: async () => true,
        taiHoSoGoc,
        loadAccount,
        limiter: { tryAcquire, recordResult: async () => {} },
      }),
      MSG,
    );

    expect(out).toEqual({ kind: "ack_skip", reason: "da_co" });
    // Đây là toàn bộ lý do tồn tại của kho: chạy lại không tốn request nào tới máy chủ thuế.
    expect(taiHoSoGoc).not.toHaveBeenCalled();
    expect(tryAcquire).not.toHaveBeenCalled();
    expect(loadAccount).not.toHaveBeenCalled();
  });
});

describe("runHoSoGocJob — hóa đơn KHÔNG có hồ sơ gốc (ca ~19,9% nhóm purchase/normal)", () => {
  it("NO_SOURCE_DOCUMENT → ack_skip + GHI NHẬN vào sổ, KHÔNG retry", async () => {
    const ghi: Array<[string, string, string]> = [];
    const out = await runHoSoGocJob(
      deps({
        taiHoSoGoc: async () => {
          throw new GdtError("Không tồn tại hồ sơ gốc của hóa đơn.", "NO_SOURCE_DOCUMENT", 500);
        },
        ghiNhanKhongCoHoSoGoc: async (t, h, ma) => {
          ghi.push([t, h, ma]);
        },
      }),
      MSG,
    );

    expect(out).toEqual({ kind: "ack_skip", reason: "khong_co_ho_so_goc" });
    // Phải GHI SỔ, nếu không lần chạy sau lại gọi GDT cho đúng hóa đơn này mãi mãi.
    expect(ghi).toEqual([["t-A", "hd-1", "NO_SOURCE_DOCUMENT"]]);
  });

  it("ca đó KHÔNG được tính là GDT hỏng — nếu tính, breaker mở oan và chặn cả giỏ", async () => {
    const recordResult = vi.fn(async () => {});
    await runHoSoGocJob(
      deps({
        taiHoSoGoc: async () => {
          throw new GdtError("Không tồn tại hồ sơ gốc của hóa đơn.", "NO_SOURCE_DOCUMENT", 500);
        },
        limiter: { tryAcquire: async () => ({ allowed: true }), recordResult },
      }),
      MSG,
    );

    expect(recordResult).toHaveBeenCalledWith(true);
  });
});

describe("runHoSoGocJob — phân loại lỗi", () => {
  it("token hết hạn → ack_skip, KHÔNG gọi GDT", async () => {
    const taiHoSoGoc = vi.fn();
    const out = await runHoSoGocJob(
      deps({
        loadAccount: async () => ({
          tokenHienTai: "cu",
          tokenHetHan: new Date("2026-07-27T00:00:00Z"),
        }),
        taiHoSoGoc,
      }),
      MSG,
    );

    expect(out).toEqual({ kind: "ack_skip", reason: "token_het_han" });
    expect(taiHoSoGoc).not.toHaveBeenCalled();
  });

  it("tài khoản không còn → retry (để DLQ ghi nhận, không nuốt)", async () => {
    const out = await runHoSoGocJob(deps({ loadAccount: async () => null }), MSG);
    expect(out).toEqual({ kind: "retry", reason: "tai_khoan_khong_ton_tai" });
  });

  it("SESSION_EXPIRED → needs_reauth + đánh dấu token chết", async () => {
    const markTokenDead = vi.fn(async () => {});
    const out = await runHoSoGocJob(
      deps({
        taiHoSoGoc: async () => {
          throw new GdtError("hết phiên", "SESSION_EXPIRED");
        },
        markTokenDead,
      }),
      MSG,
    );

    expect(out).toEqual({ kind: "needs_reauth", reason: "session_expired" });
    expect(markTokenDead).toHaveBeenCalled();
  });

  it("429 → retry_backpressure (đẩy lùi có delay, KHÔNG dồn dập)", async () => {
    const out = await runHoSoGocJob(
      deps({
        taiHoSoGoc: async () => {
          throw new GdtError("quá nhiều", "HTTP_ERROR", 429);
        },
      }),
      MSG,
    );
    expect(out).toEqual({ kind: "retry_backpressure", reason: "rate_limited" });
  });

  it("limiter từ chối → retry_backpressure, KHÔNG gọi GDT", async () => {
    const taiHoSoGoc = vi.fn();
    const out = await runHoSoGocJob(
      deps({
        limiter: {
          tryAcquire: async () => ({ allowed: false, reason: "breaker_open" as const }),
          recordResult: async () => {},
        },
        taiHoSoGoc,
      }),
      MSG,
    );

    expect(out).toEqual({ kind: "retry_backpressure", reason: "breaker_open" });
    expect(taiHoSoGoc).not.toHaveBeenCalled();
  });

  it("ZIP hỏng/đổi định dạng → retry, nhưng KHÔNG tính GDT hỏng (GDT đã trả lời)", async () => {
    const recordResult = vi.fn(async () => {});
    const out = await runHoSoGocJob(
      deps({
        taiHoSoGoc: async () => zipSync({ "invoice.xml": enc.encode("<HDon/>") }), // thiếu html
        limiter: { tryAcquire: async () => ({ allowed: true }), recordResult },
      }),
      MSG,
    );

    expect(out.kind).toBe("retry");
    expect(recordResult).toHaveBeenCalledWith(true);
  });

  it("lỗi tạm chung (không phải 401/429/thiếu hồ sơ gốc) → retry + TÍNH là GDT hỏng", async () => {
    // Nhánh cuối của khối bắt lỗi khi gọi adapter: 5xx thật, timeout, lỗi mạng. Khác
    // hai nhánh trên ở chỗ PHẢI ghi `false` — đây mới là tín hiệu GDT thật sự có vấn đề,
    // đủ nhiều liên tiếp thì breaker mở đúng.
    const recordResult = vi.fn(async () => {});
    const out = await runHoSoGocJob(
      deps({
        taiHoSoGoc: async () => {
          throw new GdtError("Tải hồ sơ gốc lỗi (HTTP 502).", "HTTP_ERROR", 502);
        },
        limiter: { tryAcquire: async () => ({ allowed: true }), recordResult },
      }),
      MSG,
    );

    expect(out.kind).toBe("retry");
    expect(recordResult).toHaveBeenCalledWith(false);
  });

  it("lỗi ghi R2/DB → retry, KHÔNG tính GDT hỏng", async () => {
    const recordResult = vi.fn(async () => {});
    const out = await runHoSoGocJob(
      deps({
        luuHoSoGoc: async () => {
          throw new Error("R2 sập");
        },
        limiter: { tryAcquire: async () => ({ allowed: true }), recordResult },
      }),
      MSG,
    );

    expect(out.kind).toBe("retry");
    expect(recordResult).toHaveBeenCalledWith(true);
  });
});

describe("hoSoGocConsumerAction — ánh xạ sang hành động hàng đợi", () => {
  const opts = { backpressureDelaySeconds: 180, bpAttempt: 0, maxBackpressure: 10 };

  it("completed và mọi ack_skip → ack (không để message quay lại queue)", () => {
    expect(hoSoGocConsumerAction({ kind: "completed", soByte: 1 }, opts).type).toBe("ack");
    for (const reason of ["da_co", "token_het_han", "khong_co_ho_so_goc"] as const) {
      expect(hoSoGocConsumerAction({ kind: "ack_skip", reason }, opts).type).toBe("ack");
    }
  });

  it("retry_backpressure → reenqueue có delay (không tiêu quota max_retries)", () => {
    const a = hoSoGocConsumerAction({ kind: "retry_backpressure", reason: "rate_limited" }, opts);
    expect(a.type).toBe("reenqueue");
  });

  it("needs_reauth → ack (chờ người đăng nhập lại; retry vô ích, không được kẹt queue)", () => {
    const a = hoSoGocConsumerAction({ kind: "needs_reauth", reason: "session_expired" }, opts);
    expect(a.type).toBe("ack");
  });

  it("retry → retry thật (tính vào max_retries → DLQ)", () => {
    expect(hoSoGocConsumerAction({ kind: "retry", reason: "loi" }, opts).type).toBe("retry");
  });
});

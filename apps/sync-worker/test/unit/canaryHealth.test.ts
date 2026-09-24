// U43 — Máy trạng thái canary (thuần). QĐ-5: WAF_BLOCKED/DRIFT báo NGAY lần đầu (tín hiệu
// xác định), im tới khi hồi phục, hồi phục thì báo; TIMEOUT/ERROR cần 3 lần liên tiếp.
// Tin "đã bật" (bat_giam_sat) neo vào cờ BỀN `daChao`, KHÔNG suy ra từ `prev === undefined`:
// nếu tick đầu sau deploy vướng nhiễu mạng (TIMEOUT) thì `prev` hết undefined vĩnh viễn và
// chuông thử-khi-deploy mất câm (review U43, mục B).
import type { CanaryResult } from "@vat/gdt-client";
import { describe, expect, it } from "vitest";
import {
  type CanaryState,
  HEALTHY_CANARY,
  nextCanaryHealth,
  trangThaiKhiGiaoHong,
} from "../../src/canaryHealth";

/** Trạng thái "khỏe và ĐÃ chào" — mốc bình thường sau khi chuông đã được thử. */
const DA_CHAO: CanaryState = {
  lastVerdict: "OK",
  consecutiveBad: 0,
  alerted: false,
  daChao: true,
};

const NOW = "2026-09-24T05:00:00.000Z";
const kq = (verdict: CanaryResult["verdict"], httpStatus?: number): CanaryResult => ({
  verdict,
  httpStatus,
  latencyMs: 10,
});

describe("nextCanaryHealth", () => {
  it("chưa có trạng thái + OK → alert bat_giam_sat, state khỏe + daChao", () => {
    const s = nextCanaryHealth(undefined, kq("OK", 401), NOW);
    expect(s.alert?.kind).toBe("bat_giam_sat");
    expect(s.state).toEqual({
      lastVerdict: "OK",
      consecutiveBad: 0,
      alerted: false,
      daChao: true,
    });
  });

  it("chưa có trạng thái + WAF_BLOCKED → alert chan (KHÔNG phải 'đã bật')", () => {
    const s = nextCanaryHealth(undefined, kq("WAF_BLOCKED", 403), NOW);
    expect(s.alert?.kind).toBe("chan");
    expect(s.state.alerted).toBe(true);
    expect(s.state.since).toBe(NOW);
  });

  it("đã chào + OK khi đang khỏe → không alert", () => {
    expect(nextCanaryHealth(DA_CHAO, kq("OK", 401), NOW).alert).toBeNull();
  });

  // Mục B — tick ĐẦU TIÊN sau deploy vướng nhiễu mạng: dưới ngưỡng 3 nên KHÔNG có alert
  // nào, nhưng cờ `daChao` vẫn tắt ⇒ tick OK kế tiếp VẪN chào. Trước đây điều kiện là
  // `prev === undefined` nên chuông thử-khi-deploy mất vĩnh viễn, lặng lẽ.
  it("chưa có trạng thái + TIMEOUT → không alert; tick OK sau VẪN chào", () => {
    const s1 = nextCanaryHealth(undefined, kq("TIMEOUT"), NOW);
    expect(s1.alert).toBeNull();
    expect(s1.state.daChao).toBeFalsy();
    const s2 = nextCanaryHealth(s1.state, kq("OK", 401), NOW);
    expect(s2.alert?.kind).toBe("bat_giam_sat");
    expect(s2.state.daChao).toBe(true);
  });

  // Mặt trái của ca trên: `daChao` phải đi XUYÊN nhánh xấu, nếu không mọi blip dưới
  // ngưỡng sẽ làm hệ thống chào lại (spam).
  it("đã chào + TIMEOUT dưới ngưỡng + OK → KHÔNG chào lại", () => {
    const xau = nextCanaryHealth(DA_CHAO, kq("TIMEOUT"), NOW);
    expect(xau.state.daChao).toBe(true);
    expect(nextCanaryHealth(xau.state, kq("OK", 401), NOW).alert).toBeNull();
  });

  it("WAF_BLOCKED lần đầu → alert chan; lần hai → im (chống spam)", () => {
    const b1 = nextCanaryHealth(HEALTHY_CANARY, kq("WAF_BLOCKED", 403), NOW);
    expect(b1.alert?.kind).toBe("chan");
    expect(b1.alert?.result.httpStatus).toBe(403);
    const b2 = nextCanaryHealth(b1.state, kq("WAF_BLOCKED", 403), NOW);
    expect(b2.alert).toBeNull();
    expect(b2.state.consecutiveBad).toBe(2);
    expect(b2.state.since).toBe(NOW); // giữ mốc bắt đầu sự cố
  });

  it("DRIFT lần đầu → alert drift", () => {
    expect(nextCanaryHealth(HEALTHY_CANARY, kq("DRIFT", 200), NOW).alert?.kind).toBe("drift");
  });

  it("OK sau khi đã báo → alert hoi_phuc, state về khỏe", () => {
    const chan: CanaryState = {
      lastVerdict: "WAF_BLOCKED",
      consecutiveBad: 5,
      alerted: true,
      since: NOW,
    };
    const s = nextCanaryHealth(chan, kq("OK", 401), NOW);
    expect(s.alert?.kind).toBe("hoi_phuc");
    // Tin hồi phục GIAO ĐƯỢC cũng chứng minh chuông sống ⇒ coi như đã chào.
    expect(s.state).toEqual({
      lastVerdict: "OK",
      consecutiveBad: 0,
      alerted: false,
      daChao: true,
    });
  });

  it("TIMEOUT ×2 → im; ×3 → alert loi_lien_tiep; ×4 → im", () => {
    let st: CanaryState = HEALTHY_CANARY;
    let s = nextCanaryHealth(st, kq("TIMEOUT"), NOW);
    expect(s.alert).toBeNull();
    st = s.state;
    s = nextCanaryHealth(st, kq("ERROR"), NOW);
    expect(s.alert).toBeNull();
    st = s.state;
    s = nextCanaryHealth(st, kq("TIMEOUT"), NOW);
    expect(s.alert?.kind).toBe("loi_lien_tiep");
    expect(s.alert?.consecutiveBad).toBe(3);
    st = s.state;
    s = nextCanaryHealth(st, kq("TIMEOUT"), NOW);
    expect(s.alert).toBeNull();
  });

  it("đang chuỗi TIMEOUT chưa báo, gặp WAF_BLOCKED → báo chan ngay", () => {
    const st: CanaryState = {
      lastVerdict: "TIMEOUT",
      consecutiveBad: 1,
      alerted: false,
      since: NOW,
    };
    expect(nextCanaryHealth(st, kq("WAF_BLOCKED", 403), NOW).alert?.kind).toBe("chan");
  });
});

// Mục A — với hệ cảnh báo, "báo trùng" rẻ hơn "mất báo" rất nhiều. `nextCanaryHealth` LẠC
// QUAN (giả định tin đã tới); khi sink báo KHÔNG giao được thì lưu trạng thái do hàm này
// tính: giữ diễn biến (consecutiveBad/since/lastVerdict) nhưng xoá dấu "đã báo" để tick
// sau báo LẠI.
describe("trangThaiKhiGiaoHong", () => {
  it("chan giao hỏng → alerted false (tick sau báo lại), giữ nguyên diễn biến", () => {
    const step = nextCanaryHealth(DA_CHAO, kq("WAF_BLOCKED", 403), NOW);
    expect(step.state.alerted).toBe(true);
    const luu = trangThaiKhiGiaoHong(step, DA_CHAO);
    expect(luu).toEqual({
      lastVerdict: "WAF_BLOCKED",
      consecutiveBad: 1,
      alerted: false,
      since: NOW,
      daChao: true,
    });
    // Tick sau vẫn WAF_BLOCKED ⇒ báo `chan` LẠI.
    expect(nextCanaryHealth(luu, kq("WAF_BLOCKED", 403), NOW).alert?.kind).toBe("chan");
  });

  it("loi_lien_tiep giao hỏng → alerted false, tick xấu sau báo lại", () => {
    const truoc: CanaryState = { lastVerdict: "TIMEOUT", consecutiveBad: 2, alerted: false };
    const step = nextCanaryHealth(truoc, kq("TIMEOUT"), NOW);
    expect(step.alert?.kind).toBe("loi_lien_tiep");
    const luu = trangThaiKhiGiaoHong(step, truoc);
    expect(luu.alerted).toBe(false);
    expect(luu.consecutiveBad).toBe(3);
    expect(nextCanaryHealth(luu, kq("TIMEOUT"), NOW).alert?.kind).toBe("loi_lien_tiep");
  });

  it("bat_giam_sat giao hỏng → daChao vẫn tắt, tick OK sau chào lại", () => {
    const step = nextCanaryHealth(undefined, kq("OK", 401), NOW);
    const luu = trangThaiKhiGiaoHong(step, undefined);
    expect(luu.daChao).toBe(false);
    expect(nextCanaryHealth(luu, kq("OK", 401), NOW).alert?.kind).toBe("bat_giam_sat");
  });

  // QUYẾT ĐỊNH (review U43): tin hồi phục giao hỏng ⇒ GIỮ `alerted: true`. Người vận hành
  // vẫn đang tin "GDT bị chặn" nên tick OK sau phải báo hồi phục LẠI. `alerted: true` ở
  // đây nằm trên state đã "khỏe" (lastVerdict OK) nên KHÔNG bịt miệng một sự cố xấu MỚI
  // ngay tick kế tiếp (xem ca "hoi_phuc giao hỏng rồi gặp WAF_BLOCKED MỚI" bên dưới).
  it("hoi_phuc giao hỏng → giữ alerted true, tick OK sau báo hồi phục lại", () => {
    const chan: CanaryState = {
      lastVerdict: "WAF_BLOCKED",
      consecutiveBad: 5,
      alerted: true,
      since: NOW,
    };
    const step = nextCanaryHealth(chan, kq("OK", 401), NOW);
    const luu = trangThaiKhiGiaoHong(step, chan);
    expect(luu.alerted).toBe(true);
    expect(luu.daChao).toBeFalsy();
    expect(nextCanaryHealth(luu, kq("OK", 401), NOW).alert?.kind).toBe("hoi_phuc");
  });

  // Bẫy vừa vá: `alerted: true` còn lại từ `hoi_phuc` giao hỏng là tàn dư của đợt XẤU CŨ
  // (state đã "khỏe": lastVerdict OK, consecutiveBad 0). Nó không được phép bịt miệng một
  // đợt sự cố MỚI — nếu không, một lần gửi "đã thông lại" thất bại sẽ làm mọi cảnh báo kế
  // tiếp (chan/drift/loi_lien_tiep) câm vô thời hạn tới khi có một tick OK.
  it("hoi_phuc giao hỏng rồi gặp WAF_BLOCKED MỚI → vẫn báo chan (không bị cờ alerted cũ bịt)", () => {
    const chan: CanaryState = {
      lastVerdict: "WAF_BLOCKED",
      consecutiveBad: 5,
      alerted: true,
      since: NOW,
      daChao: true,
    };
    const step = nextCanaryHealth(chan, kq("OK", 401), NOW);
    const luu = trangThaiKhiGiaoHong(step, chan);
    expect(luu).toEqual({
      lastVerdict: "OK",
      consecutiveBad: 0,
      alerted: true,
      daChao: true,
    });
    const suCoMoi = nextCanaryHealth(luu, kq("WAF_BLOCKED", 403), NOW);
    expect(suCoMoi.alert?.kind).toBe("chan");
    expect(suCoMoi.state.alerted).toBe(true);
  });
});

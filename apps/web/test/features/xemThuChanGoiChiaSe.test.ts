// Chế độ XEM THỬ phải chặn ĐỦ mọi đường GET của API nội bộ.
//
// Vì sao có phép kiểm này: bộ định tuyến giả (`traLoi`) là danh sách khai TAY, nên mỗi
// endpoint mới thêm vào `apiClient` lại là một lần có thể quên. Quên thì không ai thấy —
// `traLoi` trả `undefined` và lời gọi ÂM THẦM rơi về `fetch` thật. Chế độ tự quảng cáo là
// "dữ liệu bịa" nhưng vẫn chạm hệ thống thật, đúng kiểu sai lệch mà Hiến pháp §Nguyên tắc
// bằng chứng cấm: bề mặt nói một đằng, hành vi một nẻo.
//
// Ca đã dính: `/goi-chia-se` — `LienKetPage` gọi ngay lúc mount, nên chỉ cần mở trang
// "Liên kết chia sẻ" trong chế độ xem thử là có một request thật bay đi.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { batXemThuGiaoDien } from "../../src/dev/xemThuGiaoDien";

// Đọc CÙNG biến mà `apiClient.ts` và module xem thử đọc — gõ lại "/api" ở đây là dựng
// nguồn sự thật thứ hai, đúng cái bẫy module kia đã ghi lại trong chú thích của nó.
const API_BASE = import.meta.env.VITE_API_BASE ?? "";

const fetchGoc = globalThis.fetch;

describe("Chế độ xem thử — không đường GET nào rơi về mạng thật", () => {
  let fetchThat: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Đặt fetch giả TRƯỚC khi bật: module chụp `globalThis.fetch` tại thời điểm bật và giữ
    // làm đường thoát. Nếu nó rơi về đường thoát, spy này sẽ ghi lại.
    fetchThat = vi.fn(async () => new Response("{}", { status: 200 }));
    globalThis.fetch = fetchThat as unknown as typeof fetch;
    sessionStorage.setItem("xem-thu", "1");
    expect(batXemThuGiaoDien(), "phải bật được (jsdom chạy trên localhost)").toBe(true);
  });

  afterEach(() => {
    globalThis.fetch = fetchGoc;
    sessionStorage.clear();
    document.body.innerHTML = "";
  });

  it("GET /goi-chia-se trả dữ liệu bịa, KHÔNG gọi mạng thật", async () => {
    const res = await globalThis.fetch(`${API_BASE}/goi-chia-se`);

    expect(
      fetchThat,
      "lọt ra fetch thật — chế độ xem thử đang chạm hệ thống thật",
    ).not.toHaveBeenCalled();
    expect(res.status).toBe(200);

    // Khớp ĐÚNG hợp đồng của `api.dsGoiChiaSe()` (`{ items: GoiChiaSeItem[] }`), không phải
    // một hình dạng bắt-tất cho qua. Mock sai hợp đồng từng là lỗi thật (commit 2136940).
    const body = (await res.json()) as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThan(0);

    const g = body.items[0] as Record<string, unknown>;
    for (const truong of ["id", "nmmst", "tuNgay", "denNgay", "soHoaDon", "trangThai"]) {
      expect(g, `thiếu trường bắt buộc \`${truong}\` của GoiChiaSeItem`).toHaveProperty(truong);
    }
    // `url` chỉ có khi `san_sang` — giữ đúng ràng buộc của hợp đồng, không bịa liên kết cho
    // gói chưa đóng xong.
    for (const item of body.items as Record<string, unknown>[]) {
      if (item.trangThai !== "san_sang") {
        expect(item.url ?? null, "gói chưa sẵn sàng không được có liên kết tải").toBeNull();
      }
    }
  });

  it("GET /goi-chia-se/:id cũng được chặn", async () => {
    const res = await globalThis.fetch(`${API_BASE}/goi-chia-se/bat-ky`);

    expect(fetchThat).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect((await res.json()) as Record<string, unknown>).toHaveProperty("trangThai");
  });
});

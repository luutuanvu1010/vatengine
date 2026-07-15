// Tra cứu danh sách hóa đơn GDT: gộp hai họ endpoint (thường + máy tính tiền),
// tự phân trang bằng con trỏ `state`, khử trùng theo khóa tự nhiên.
// Nhận token (đã đăng nhập ở U1) — KHÔNG tự đăng nhập, KHÔNG chạm DB/tenant_id
// (upsert idempotent theo (tenant_id, ...) là tầng U4–U5).
// Xem .claude/rules/gdt-adapter.md và KIEN_TRUC_VA_KE_HOACH.md mục 7.
//
// ĐÃ KIỂM CHỨNG (2026-07-13, probe query thật từ Chrome đăng nhập thật): phong bì
// là `{datas, total, state, time}` — `datas` LUÔN hiện diện kể cả khi rỗng
// (sco-query/purchase trả `datas: []`), `state` là chuỗi con trỏ khi có dữ liệu
// và `null` khi rỗng (khớp điều kiện dừng phân trang bên dưới). Cú pháp RSQL
// `tdlap=ge=DD/MM/YYYYT00:00:00;tdlap=le=...T23:59:59` khớp portal; token gắn qua
// header `Authorization: Bearer` (bare fetch không kèm → 401). Row chứa đủ 5
// trường khóa tự nhiên. Bằng chứng: docs/CHECKLIST-NGHIEM-THU.md (U2) + ADR-0001
// Amendment #5. Không ghi lại token/giá trị hóa đơn.

import { missingContractKeys } from "./contract";
import { BASE, INVOICE_ENDPOINTS } from "./endpoints";
import { GdtError } from "./errors";
import { type RetryOptions, fetchWithRetry } from "./http";
import type { GdtTransport } from "./transport";

export type InvoiceDirection = "purchase" | "sold";

export interface InvoiceQueryParams {
  /** Chiều hóa đơn: 'purchase' (đầu vào/mua vào) | 'sold' (đầu ra/bán ra). */
  direction: InvoiceDirection;
  /** Ngày lập từ, định dạng dd/mm/yyyy. */
  dateFrom: string;
  /** Ngày lập đến, định dạng dd/mm/yyyy. */
  dateTo: string;
  /**
   * Lọc theo trạng thái xử lý `ttxly` (mỗi giá trị là một truy vấn RSQL riêng
   * rồi gộp). Bỏ trống = KHÔNG lọc, lấy tất cả hóa đơn trong khoảng ngày
   * (quyết định U2: không mặc định 5/6/8 vì tập giá trị chưa kiểm chứng đủ).
   */
  statuses?: number[];
  /** Có lấy thêm hóa đơn máy tính tiền (sco) không. Mặc định true. */
  includeSco?: boolean;
  /** Kích thước trang. Mặc định 50. */
  size?: number;
}

/** Một dòng hóa đơn thô từ GDT, kèm nhãn nguồn/chiều do adapter gắn thêm. */
export type InvoiceRow = Record<string, unknown> & {
  _source: "normal" | "sco";
  _direction: InvoiceDirection;
};

const DEFAULT_SIZE = 50;
// GDT CHỈ hỗ trợ sắp xếp MỘT trường. KIỂM CHỨNG 2026-07-15 (probe token production thật):
// `sort=tdlap:desc,khmshdon:asc,shdon:desc` → HTTP 500 {"message":"Không hỗ trợ sắp xếp
// theo nhiều trường"}; `sort=tdlap:desc` (một trường) → HTTP 200 + datas.
// ĐÃ KIỂM CHỨNG tính ổn định phân trang con trỏ `state` với sort MỘT trường (2026-07-15,
// scripts/gdt-paginate-probe.mjs, token production thật, MST 4201969169, endpoint
// /api/query/invoices/purchase): dù `tdlap` phân giải theo NGÀY (Amendment #7) nên nhiều HĐ
// trùng `tdlap` và ranh giới trang (ép size=5) rơi GIỮA cụm cùng ngày, con trỏ `state` KHÔNG
// mất/trùng. Bằng chứng quyết định: kỳ 06/2026 = 53 HĐ / 11 trang → distinct 53 === total 53
// GDT trả, 0 trùng chéo trang; đối chứng 05/2026 (38 HĐ/4 trang) + 03/2026 (22 HĐ/5 trang)
// đều distinct === total. ⇒ con trỏ có tie-breaker ẩn đủ tin cậy; khử trùng theo khóa tự
// nhiên bên dưới là lớp phòng thủ dư, không phải chỗ dựa cho việc mất trang.
// RÀNG BUỘC GDT phát hiện kèm (cùng probe): mỗi truy vấn khoảng ngày ≤ 1 THÁNG — range >1
// tháng → HTTP 400 "Khoảng thời gian tìm kiếm không được lớn hơn 1 tháng"; tầng đồng bộ phải
// chia truy vấn theo tháng. (Probe cũng gặp HTTP 429 khi gọi dồn — GDT rate-limit phía server.)
const DEFAULT_SORT = "tdlap:desc";
// Trần số trang để chặn vòng lặp vô hạn nếu server trả `state` không dừng.
const MAX_PAGES = 2000;

/**
 * Dựng chuỗi truy vấn RSQL giống portal thuế.
 * date* định dạng dd/mm/yyyy. ttxly bỏ trống = không lọc theo trạng thái.
 */
export function buildSearch(dateFrom: string, dateTo: string, ttxly?: number): string {
  const parts = [`tdlap=ge=${dateFrom}T00:00:00`, `tdlap=le=${dateTo}T23:59:59`];
  if (ttxly !== undefined) parts.push(`ttxly==${ttxly}`);
  return parts.join(";");
}

/** Gọi 1 endpoint và tự phân trang bằng con trỏ `state` tới khi hết dữ liệu. */
async function queryOne(
  transport: GdtTransport,
  token: string,
  endpoint: string,
  search: string,
  size: number,
  opts?: RetryOptions,
): Promise<Array<Record<string, unknown>>> {
  const rows: Array<Record<string, unknown>> = [];
  let state: string | undefined;
  let pages = 0;
  let truncated = false;

  while (true) {
    if (pages >= MAX_PAGES) {
      truncated = true;
      break;
    }
    pages += 1;

    const query = new URLSearchParams({ sort: DEFAULT_SORT, size: String(size), search });
    if (state) query.set("state", state);

    const res = await fetchWithRetry(
      transport,
      `${BASE}${endpoint}?${query.toString()}`,
      { method: "GET", headers: { authorization: `Bearer ${token}` } },
      opts,
    );

    if (res.status === 401) {
      throw new GdtError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", "SESSION_EXPIRED");
    }
    if (!res.ok) {
      // KHÔNG nuốt lỗi HTTP im lặng (gdt-adapter.md): trích thông điệp lỗi GDT để chẩn
      // đoán lệch contract/tham số. Body lỗi GDT dạng JSON {timestamp,message,details,
      // path,requestId} → CHỈ lấy `message` (mô tả lỗi), KHÔNG dump body thô (giảm bề mặt
      // rò rỉ — thong_diep_loi chưa qua maskSensitive; review contract-guardian 2026-07-15).
      let detail = "";
      try {
        const raw = await res.text();
        try {
          const j = JSON.parse(raw) as { message?: unknown };
          detail = typeof j.message === "string" ? j.message.slice(0, 200) : "";
        } catch {
          detail = raw.replace(/\s+/g, " ").trim().slice(0, 120);
        }
      } catch {
        /* body không đọc được — giữ nguyên chỉ status */
      }
      throw new GdtError(
        `Truy vấn ${endpoint} lỗi (HTTP ${res.status})${detail ? ` — GDT: ${detail}` : ""}.`,
        "HTTP_ERROR",
        res.status,
      );
    }

    let data: Record<string, unknown>;
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      throw new GdtError(`Phản hồi không hợp lệ từ ${endpoint} (HTTP ${res.status}).`);
    }

    // Kiểm hợp đồng MỀM: thiếu 'datas' chỉ cảnh báo, KHÔNG throw/không mở
    // circuit breaker (ngoại lệ invoice_envelope, .claude/rules/gdt-adapter.md).
    const missing = missingContractKeys(data, "invoice_envelope");
    if (missing.length > 0) {
      console.warn(
        `Phong bì hóa đơn từ ${endpoint} thiếu ${JSON.stringify(missing)} so với hợp đồng kỳ vọng (invoice_envelope). Coi là rỗng, KHÔNG mở circuit breaker — điểm còn mơ hồ chưa xác nhận thủ công, xem .claude/rules/gdt-adapter.md.`,
      );
    }

    const datas = Array.isArray(data.datas) ? (data.datas as Array<Record<string, unknown>>) : [];
    rows.push(...datas);

    state = typeof data.state === "string" ? data.state : undefined;
    if (datas.length < size || !state) break;
  }

  if (truncated) {
    // Chạm trần phân trang: KHÔNG nuốt im lặng (xem .claude/rules/gdt-adapter.md).
    // Tầng đồng bộ (U9) cần biết kết quả có thể bị cắt cụt để tiếp tục từ điểm cắt.
    console.warn(
      `Truy vấn ${endpoint} chạm trần ${MAX_PAGES} trang mà server vẫn còn con trỏ state; kết quả có thể bị cắt cụt. Cần thu hẹp khoảng ngày hoặc tiếp tục đồng bộ từ điểm cắt (U9).`,
    );
  }

  return rows;
}

/** Khóa tự nhiên hóa đơn ở tầng adapter (5 trường; tenant_id thêm ở tầng DB U4/U5). */
function naturalKey(row: Record<string, unknown>): string {
  return [row.nbmst, row.khmshdon, row.khhdon, row.shdon, row.tdlap]
    .map((v) => String(v ?? ""))
    .join("|");
}

/**
 * Lấy toàn bộ hóa đơn của MỘT chiều trong khoảng ngày: gộp endpoint thường + sco,
 * phân trang đầy đủ, khử trùng theo khóa tự nhiên. Idempotent/upsert theo
 * tenant_id là việc của tầng đồng bộ (U5), không thuộc adapter.
 *
 * 401 (kể cả giữa phân trang, kể cả nhánh sco) → dừng ngay, ném GdtError hết phiên.
 * Nhánh sco: CHỈ bỏ qua khi HTTP 404 (endpoint máy tính tiền không áp dụng cho
 * tài khoản này) hoặc 200 + datas rỗng (vốn không ném). Mọi lỗi sco khác
 * (400/5xx/timeout/lệch contract) propagate — KHÔNG nuốt im lặng. Lỗi nhánh
 * normal luôn propagate.
 */
export async function queryInvoices(
  transport: GdtTransport,
  token: string,
  params: InvoiceQueryParams,
  opts?: RetryOptions,
): Promise<InvoiceRow[]> {
  const size = params.size ?? DEFAULT_SIZE;
  const includeSco = params.includeSco ?? true;

  const kinds: Array<{ source: "normal" | "sco"; endpoint: string }> = [
    { source: "normal", endpoint: INVOICE_ENDPOINTS[params.direction] },
  ];
  if (includeSco) {
    const scoKey = params.direction === "purchase" ? "scoPurchase" : "scoSold";
    kinds.push({ source: "sco", endpoint: INVOICE_ENDPOINTS[scoKey] });
  }

  const statusList: Array<number | undefined> =
    params.statuses && params.statuses.length > 0 ? params.statuses : [undefined];

  const seen = new Set<string>();
  const merged: InvoiceRow[] = [];

  for (const kind of kinds) {
    for (const st of statusList) {
      const search = buildSearch(params.dateFrom, params.dateTo, st);
      let rows: Array<Record<string, unknown>>;
      try {
        rows = await queryOne(transport, token, kind.endpoint, search, size, opts);
      } catch (err) {
        // Nhánh sco: CHỈ bỏ qua khi HTTP 404 — endpoint máy tính tiền không áp
        // dụng cho tài khoản này. Bằng chứng quan sát trực tiếp trên GDT (MST
        // 4201969169, 2026-07-15): hóa đơn máy tính tiền TỒN TẠI và tra cứu được
        // bình thường (docs/CHAN-DOAN-thieu-truong-va-mtt.md) — nên một lỗi sco
        // KHÁC 404 (400/5xx/timeout/lệch contract) là LỖI THẬT có thể làm hóa đơn
        // máy tính tiền biến mất, PHẢI nổi lên chứ không nuốt im lặng. 401 propagate
        // (SESSION_EXPIRED). 200 + datas rỗng vốn không ném → tự nhiên đi tiếp.
        if (kind.source === "sco" && err instanceof GdtError && err.httpStatus === 404) {
          console.warn(
            `Nhánh sco (${kind.endpoint}) trả HTTP 404: endpoint hóa đơn máy tính tiền không áp dụng cho tài khoản này — bỏ qua. (Chỉ 404 mới bỏ qua; mọi lỗi sco khác được ném để phân biệt với lỗi cấu hình/lệch contract — gdt-adapter.md.)`,
          );
          continue;
        }
        throw err;
      }

      for (const row of rows) {
        const key = naturalKey(row);
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push({ ...row, _source: kind.source, _direction: params.direction });
      }
    }
  }

  return merged;
}

# U30 — Chọn dòng để xuất (lát B)

> **Mục tiêu:** người dùng tick chọn từng hóa đơn ngay trên bảng danh sách và xuất
> **đúng những dòng đã chọn**, thay vì luôn xuất toàn bộ kết quả khớp bộ lọc.
>
> Trạng thái: ✅ ĐÃ HIỆN THỰC 2026-07-20 — `make lint` EXIT=0, `make test` EXIT=0.
> T1–T12 đều có test, review chéo (bảo mật + DoD) đã xử lý findings.
> Lập theo `.claude/skills/plan-unit`. Ngày lập: 2026-07-20. Nền: `c0a26fa` (sau U29).

## 0. Hiện trạng (đã kiểm chứng 2026-07-20, không suy đoán)

| Câu hỏi | Trả lời | Bằng chứng |
|---|---|---|
| Có checkbox chọn dòng? | **KHÔNG** | `InvoiceTable.tsx:44-57` — 14 `<th>`, ô đầu là "Ngày lập"; grep `checkbox\|selected\|selection` trong `features/invoices/` → 0 kết quả |
| Bảng có nhận props chọn dòng? | **KHÔNG** | `InvoiceTable.tsx:38` — `InvoiceTable({ rows }: { rows: InvoiceListRow[] })` |
| Trang có giữ state chọn dòng? | **KHÔNG** | `InvoicesPage.tsx:24-25` — chỉ `filter` và `offset` |
| Nút xuất gửi gì lên API? | **Chỉ bộ lọc** | `InvoiceExportButtons.tsx:13` nhận `{ filter }`; `apiClient.ts:154-156` gửi `POST /exports?format=…&<filter>` |
| API nhận danh sách ID? | **KHÔNG** | `exports.ts:57,134-135` — `invoiceFilterSchema.safeParse(c.req.query())`, không có tham số ID |

## 1. Quyết định chủ dự án 2026-07-20

**"Chọn tất cả" = chọn trang hiện tại, GIỮ lựa chọn khi lật trang.** Tức:
- Tick ô header → chọn/bỏ chọn 50 dòng **đang xem**.
- Chuyển trang → lựa chọn cũ **được giữ**, hiển thị "đã chọn N hóa đơn".
- KHÔNG có nút "chọn toàn bộ kết quả khớp bộ lọc" — hành vi đó đã có sẵn dưới dạng
  "không chọn gì thì xuất theo bộ lọc", thêm nữa chỉ gây nhầm.

## 2. Phạm vi

**Trong phạm vi:** cột checkbox ở bảng, state lựa chọn giữ qua phân trang, thanh
hành động hiện số đã chọn, và mở rộng hợp đồng `POST /exports` để nhận danh sách ID.

**NGOÀI phạm vi:**
- ❌ Lọc/sắp xếp theo cột — **U31**, đơn vị riêng.
- ❌ Khối giới thiệu ở Tổng quan — **U32**.
- ❌ Đổi mẫu cột kết xuất (vừa xong ở U29).
- ❌ Nhóm theo khách hàng/sản phẩm (lát C/D).
- ❌ Đụng profile kế toán `reference`.

## 3. Thiết kế

### 3.1 Hợp đồng API — mở rộng CỘNG THÊM, không phá cũ

`POST /exports` hiện nhận bộ lọc qua **query string** (`exports.ts:57`). Danh sách vài
nghìn UUID **không nhét được vào query string** (giới hạn độ dài URL) ⇒ phải dùng **body**.

```
POST /exports?format=xlsx            ← query giữ nguyên: format + bộ lọc (tương thích ngược)
Content-Type: application/json
Body (TÙY CHỌN): { "ids": ["<uuid>", …] }
```

- **Không có body / `ids` rỗng** → hành vi **y hệt hôm nay**: xuất theo bộ lọc.
  Client cũ không đổi gì vẫn chạy → không phá tương thích.
- **Có `ids`** → xuất đúng các hóa đơn đó, **bỏ qua bộ lọc** (lựa chọn của người dùng
  cụ thể hơn bộ lọc; giữ cả hai sẽ mơ hồ khi họ đổi bộ lọc sau lúc chọn).

### 3.2 Cách ly tenant — KHÔNG tin ID từ client

`ids` do client gửi lên là **input không tin cậy**. Truy vấn phải là:

```ts
buildWhere(tenantId, {})  AND  inArray(hoaDon.id, ids)
```

`tenant_id` tường minh giữ nguyên (lớp 1), `withTenant`/RLS là lớp 2. Tenant A gửi ID
của tenant B ⇒ trả về **rỗng**, không phải lỗi rò. Có test canh (§4 T6).

### 3.3 Trần số lượng

Cần chặn trên để không dựng câu `IN (...)` khổng lồ (giới hạn tham số Postgres + CPU
Workers). Đề xuất **`MAX_EXPORT_IDS = 1000`**; vượt → `400` với thông điệp rõ, gợi ý
dùng bộ lọc thay vì chọn tay. Xem §7-M1.

### 3.4 Frontend

- `InvoiceTable` nhận thêm props: `selectedIds: Set<string>`, `onToggle(id)`,
  `onTogglePage(ids, checked)`. Cột checkbox chèn **trước** "Ngày lập".
- Ô header là **tri-state**: rỗng / gạch ngang (chọn một phần trang) / tick (cả trang).
- `InvoicesPage` giữ `selectedIds` ở state. **Xóa sạch khi đổi bộ lọc** — giữ lựa chọn
  cũ sau khi đổi bộ lọc là bẫy: người dùng xuất nhầm hóa đơn không còn nhìn thấy.
- Thanh hành động khi `selectedIds.size > 0`: "Đã chọn N hóa đơn · Bỏ chọn tất cả",
  và nút xuất đổi nhãn thành "Xuất N hóa đơn đã chọn".
- Nhãn nút khi không chọn gì: giữ nguyên như hôm nay (xuất theo bộ lọc).

⚠️ **Ràng buộc đa tenant (multi-tenant.md H-B.3):** `selectedIds` là state React cục bộ
của trang, không vào localStorage ⇒ tự mất khi đăng xuất/đổi phiên. **Không** được lưu
nó vào `filterStore`/localStorage — sẽ thành dữ liệu tenant còn sót ở client.

## 4. Test viết trước (TDD)

| # | Test | Nhóm | Khẳng định |
|---|---|---|---|
| T1 | `ids` rỗng/không có → xuất theo bộ lọc (hành vi cũ nguyên vẹn) | integration (api) | tương thích ngược |
| T2 | `ids` có 3 phần tử → file chứa đúng 3 hóa đơn đó, không hơn | integration | lõi tính năng |
| T3 | `ids` có → **bỏ qua** bộ lọc trong query string | integration | §3.1 |
| T4 | `ids` chứa uuid không tồn tại → bỏ qua lặng lẽ, xuất phần còn lại | integration | không fail-loud vì dữ liệu có thể vừa bị xóa |
| T5 | `ids` vượt `MAX_EXPORT_IDS` → 400, KHÔNG dựng file, KHÔNG ghi R2 | integration | §3.3 |
| T6 | **Cách ly:** tenant A gửi ID hóa đơn của tenant B → file RỖNG | integration | multi-tenant.md, Critical |
| T7 | `ids` không phải mảng uuid → 400 (Zod) | unit | validate đầu vào |
| T8 | Audit log "xuất dữ liệu" vẫn ghi, kèm số lượng ID đã chọn | integration | security.md |
| T9 | Bảng render cột checkbox; tick 1 dòng → `onToggle` đúng id | unit (web) | |
| T10 | Header tri-state: chọn một phần trang → trạng thái "một phần" | unit (web) | |
| T11 | Đổi bộ lọc → `selectedIds` bị xóa sạch | unit (web) | §3.4, chống xuất nhầm |
| T12 | Lật trang → lựa chọn được GIỮ | unit (web) | quyết định §1 |

## 5. Tiêu chí nghiệm thu

1. `make lint` sạch, `make test` xanh, coverage không tụt dưới 80%.
2. T1–T12 xanh; T6 chạy trên PGlite thật.
3. Client cũ (không gửi body) vẫn xuất được — kiểm bằng T1.
4. Chọn 3 hóa đơn ở 2 trang khác nhau → file xuất có đúng 3 dòng đó.
5. Không có `selectedIds` nào lọt vào localStorage (grep `filterStore`).

## 6. Ràng buộc bắt buộc chạm tới

- ✅ **`tenant_id` tường minh** — `buildWhere` + `inArray`, không tin ID client (§3.2).
- ✅ **RBAC** — route giữ `requireRole("ke_toan_truong","quan_tri")` (`exports.ts:53`).
- ✅ **Audit log** — hành động "xuất dữ liệu" là nhạy cảm (security.md), giữ nguyên + ghi
  thêm số ID.
- ✅ **Dọn state client khi đổi phiên** — §3.4, không đưa lựa chọn vào localStorage.
- ➖ Không gọi GDT, không đụng `gdt-client`/`GdtTransport`.

## 7. Điểm mơ hồ — ĐÃ QUYẾT (chủ dự án 2026-07-20)

**M1. `MAX_EXPORT_IDS = 1000`.** ✅ CHỐT
Căn cứ: tenant lớn nhất hiện có 22.350 hóa đơn (đo 2026-07-20); chọn tay quá 1000 dòng
là hành vi phi thực tế — quá ngưỡng đó nên dùng bộ lọc.
⚠️ Con số này **CHƯA KIỂM CHỨNG** bằng đo giới hạn thật của Workers/Hyperdrive với câu
`IN (...)` dài — nó là trần *sản phẩm* (chặn hành vi vô lý), không phải trần *kỹ thuật*
đã đo. Ghi nhãn đúng như vậy trong mã; nếu sau này chạm giới hạn kỹ thuật thấp hơn thì
hạ xuống, đừng coi 1000 là đã kiểm chứng.

**M2. Có `ids` ⇒ BỎ QUA bộ lọc.** ✅ CHỐT
Lựa chọn cụ thể hơn ý định. Nếu giao cả hai (AND), file xuất có thể ít hơn con số
"đã chọn N" đang hiển thị — người dùng mất niềm tin vào phần mềm kế toán. §3.4 đã chặn
phần lớn ca lệch bằng cách xóa lựa chọn khi đổi bộ lọc.

**M3. Trần KÍCH THƯỚC body — bổ sung SAU khi lập kế hoạch.** ✅ CHỐT 2026-07-20
*(Nguồn: review bảo mật độc lập, mức Medium. Ghi lại drift thay vì âm thầm chọn một bên —
Hiến pháp §8.)*

Kế hoạch gốc chỉ có M1 (trần **số phần tử**), thiếu trần **số byte**. Lỗ hổng: `MAX_EXPORT_IDS`
chỉ chặn **sau khi** `c.req.json()` đã đọc và parse xong toàn bộ body — một request body
hàng chục MB vẫn đốt CPU/RAM của Worker trước khi Zod kịp từ chối. Trần số phần tử không
thay được trần byte.

Hiện thực: `bodyLimit({ maxSize: 256KB })` trên `POST /exports`, vượt → **413**.
256KB rộng rãi cho ca hợp lệ tối đa (1000 uuid + khung JSON ≈ 40KB) mà vẫn chặn sớm.
Có 2 test canh: body 2MB → 413 và không chạm R2; body 1000 uuid → vẫn 201.

Vì sao không đẩy sang backlog: đây là hệ quả **trực tiếp** của bề mặt mới do U30 tạo ra
(route trước đây không đọc body). Vá ngay trong đơn vị sinh ra nó, không để lại nợ.

⚠️ Trước đó hệ thống **dựa ngầm** vào giới hạn mặc định của nền tảng Cloudflare — một
phụ thuộc không được kiểm chứng và không ghi ở đâu. Nay là phòng thủ tường minh.

## 8. Thiết kế truy vấn (bổ sung sau khi đọc mã)

`buildWhere` (`packages/query/src/filters.ts:61-74`) đã gom điều kiện dạng mảng `conds`
và LUÔN mở đầu bằng `eq(hoaDon.tenantId, tenantId)`. Cách rẻ nhất và an toàn nhất là
**thêm `ids` vào chính bộ lọc**, thay vì thêm tham số cho `iterateInvoices`:

```ts
export type InvoiceSelection = InvoiceFilter & { ids?: string[] };
// trong buildWhere:
if (selection.ids?.length) conds.push(inArray(hoaDon.id, selection.ids));
```

Vì sao chọn cách này:
- **Không đụng chữ ký `iterateInvoices`** — nó có 5 nơi gọi trong `exports.ts`
  (dòng 81, 82, 85, 105, 145); thêm tham số thứ 5 sẽ buộc sửa cả 5 và bắt truyền
  `undefined` cho `pageSize` ở giữa — dễ sai lặng lẽ.
- **`tenant_id` vẫn là điều kiện đầu tiên, không thể bỏ qua** — ID từ client chỉ *thu hẹp*
  tập, không bao giờ *mở rộng* nó. Đây là điểm mấu chốt về an toàn: gửi ID của tenant khác
  ⇒ giao với `tenant_id` của chính mình ⇒ rỗng.
- `listInvoices` dùng chung `buildWhere` nên tự có khả năng này về sau nếu cần.

---

**Bước kế tiếp sau khi M1–M2 chốt:** `/start-unit U30` theo TDD §4.

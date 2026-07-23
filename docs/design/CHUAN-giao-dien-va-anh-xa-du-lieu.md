# Chuẩn dựng giao diện & ánh xạ dữ liệu — VATCrawlbot

**Ngày:** 22/07/2026 · **Trạng thái:** BẢN NHÁP để chủ dự án duyệt (chưa thành Luật, chưa sửa mã)
**Mục đích:** dựng "gốc" cho tầng trình bày, để mọi thay đổi giao diện về sau *khai báo thêm* chứ không *đập đi làm lại*.

Tài liệu này lấp đúng chỗ trống trong khung quản trị hiện có: dự án đã có Hiến pháp/Luật/Cổng kiểm soát cho **tầng sau**, nhưng chưa có Luật tương đương cho **tầng trình bày**.

---

## Phần A — Chẩn đoán gốc (dựa trên mã thật)

### A1. Sự thật quan trọng: dự án KHÔNG thiếu nguyên liệu

Rà soát mã cho thấy đã có sẵn phần lớn các mảnh của một hệ thống giao diện tốt:

| Tầng thực hành tốt | Đã có trong dự án | Vị trí |
|---|---|---|
| Design tokens | ✅ Có, có kỷ luật (chỉ dùng biến `--…`, cấm hardcode hex) | `apps/web/src/styles/tokens.css` |
| Primitive dùng chung | ⚠️ Một phần: `Button`, `TextField`, `Card`, `Alert` + 4 trạng thái | `components/ui/primitives.tsx` |
| Lớp hợp đồng dữ liệu (client) | ✅ "Nơi DUY NHẤT cập nhật khi backend đổi shape" | `apps/web/src/types/api.ts` |
| Lớp ánh xạ nhãn trạng thái | ✅ Có kỷ luật bằng chứng (verified flag) | `apps/web/src/lib/statusLabels.ts` |
| Nguồn cột kết xuất | ✅ `EXPORT_COLUMNS` — "nguồn sự thật DUY NHẤT cho csv lẫn xlsx" | `packages/export/src/columns.ts` |
| Allowlist lọc/sắp (server) | ✅ Zod schema + `SORT_COLUMNS` | `packages/query/src/filters.ts` |

Kết luận: đây **không phải** dự án làm ẩu. Có tư duy nguồn-sự-thật-duy-nhất ở nhiều nơi.

### A2. Vấn đề thực sự: "tập trường hoá đơn" bị định nghĩa 4 lần song song

Cùng một khái niệm — ví dụ *"Ngày lập = trường `tdlap`, kiểu ngày, sắp được, không lọc"* — đang được viết lại **độc lập** ở bốn nơi, và giữ khớp nhau bằng tay + chú thích "KHÔNG bịa cột":

| Nơi định nghĩa | Nó khai báo điều gì | Ví dụ trường `tdlap` |
|---|---|---|
| `packages/export/columns.ts` → `EXPORT_COLUMNS` | Cột nào vào file xuất, nhãn, kiểu định dạng | `{ key:"tdlap", label:"Ngày lập", kind:"date" }` |
| `features/invoices/InvoiceTable.tsx` | Cột nào lên bảng, nhãn, lọc/sắp kiểu gì | `<ThMenu nhan="Ngày lập" sortBy="tdlap" …/>` |
| `packages/query/filters.ts` → `SORT_COLUMNS`, `invoiceFilterSchema` | Trường nào lọc/sắp được ở server | `SORT_COLUMNS.tdlap`, biên ngày `tuNgay/denNgay` |
| `apps/web/types/api.ts` | Kiểu dữ liệu + `SortBy` cho client | `SortBy = "tdlap" \| …` |

**Hệ quả (đây chính là "đập đi làm lại"):**

1. Thêm/đổi một trường phải sửa **4 tệp** ở 4 gói khác nhau, dễ quên một chỗ.
2. Nhãn **đã bắt đầu lệch** — bằng chứng ngay trong mã:
   - Tổng thanh toán: bảng ghi **"Tổng TT"**, file xuất ghi **"Tổng thanh toán"**.
   - Trạng thái xử lý: bảng ghi **"TT xử lý"**, file xuất ghi **"Trạng thái xử lý (mã)"**.
   Người dùng thấy hai tên cho cùng một thứ tùy màn — dấu hiệu kinh điển của thiếu nguồn-sự-thật-duy-nhất.
3. Cấu hình lọc/sắp của bảng nằm **rải trong JSX** (`nhan/khoa/sortBy/loaiLoc/chonLua` lặp cho từng cột), nên mỗi yêu cầu mới lại chèn tay vào giữa đám JSX — đúng kiểu "vá ở ngọn".

### A3. Hai lỗ hổng phụ, cùng bản chất

- **Primitive form chưa đủ.** Có `Button`, `TextField` nhưng **không có `Select`/`Field`/`FilterBar`**. Nên `FilterBar.tsx` tự tô kiểu nội tuyến (`selectStyle`, `inputStyle`) — mỗi màn tự chế lại ô nhập.
- **Chuẩn giao diện nằm rải trong tài liệu kế hoạch** (`docs/06-BINDING_MAP.md`, các "brief §4/§5", `07-DESIGN_TOKENS`) chứ **chưa gom vào một Luật** ở `.claude/rules/` — nơi Luật thực sự được nạp và ép tuân thủ. Nên chuẩn tồn tại nhưng không "có hiệu lực".

---

## Phần B — Kiến trúc chuẩn (đích đến)

Mô hình 6 tầng, mỗi tầng chỉ phụ thuộc tầng dưới — song song với cách backend đã phân tầng:

```
┌─────────────────────────────────────────────────────────────┐
│ 6. Trang (InvoicesPage, ReconcilePage…)                     │  ghép pattern, giữ state
├─────────────────────────────────────────────────────────────┤
│ 5. Pattern: FilterBar · DataTable · Toolbar                 │  ĐỌC từ Registry (tầng 4)
├─────────────────────────────────────────────────────────────┤
│ 4. ★ REGISTRY MIỀN HOÁ ĐƠN (nguồn sự thật DUY NHẤT)         │  ← phần đang thiếu
│    field ↔ nhãn VN ↔ kiểu ↔ lọc?/sắp?/hiển thị?/xuất? ↔ map │
├─────────────────────────────────────────────────────────────┤
│ 3. Primitive: Button·Input·Select·Field·Table·Chip·Alert    │  đã có 1 phần
├─────────────────────────────────────────────────────────────┤
│ 2. Hợp đồng dữ liệu (types/api.ts) + format (tiền/ngày VN)  │  đã có
├─────────────────────────────────────────────────────────────┤
│ 1. Design tokens (màu/khoảng cách/chữ)                      │  đã có
└─────────────────────────────────────────────────────────────┘
```

Trọng tâm cần dựng là **tầng 4 — Registry**, và **rút các định nghĩa rải rác về đó**. Tầng 1–3 chỉ cần bổ sung, không làm lại.

---

## Phần C — Trọng tâm: Registry miền hoá đơn (nguồn sự thật duy nhất)

### C1. Ý tưởng

Một bảng khai báo duy nhất mô tả **mọi trường hoá đơn một lần**. Bảng (DataTable), thanh lọc (FilterBar), allowlist sắp xếp, và cột kết xuất đều **dẫn xuất từ đây** thay vì tự khai lại. Đây vừa là *nguồn sự thật duy nhất*, vừa là *lớp chống ăn mòn* (ngăn tên trường thô của Tổng cục Thuế — `nbmst`, `tdlap` — rò thẳng lên màn hình).

### C2. Hình dạng mỗi mục (đề xuất)

```ts
interface InvoiceField {
  key: string;             // mã kỹ thuật: 'tdlap' (khớp cột DB + api.ts)
  nhan: string;            // nhãn VN DUY NHẤT: 'Ngày lập'  ← hết cảnh "Tổng TT" vs "Tổng thanh toán"
  nhanNgan?: string;       // nhãn rút gọn cho cột hẹp (nếu cần, vẫn khai ở ĐÂY)
  kieu: 'text'|'ngay'|'tien'|'ma'|'enum'|'list';  // gộp/kế thừa ColumnKind của export
  canh?: 'trai'|'phai';    // canh lề hiển thị (tiền → phải)

  locDuoc?: false | 'text' | 'range' | 'enum' | 'ngay';  // sinh ô lọc kiểu gì
  sapDuoc?: boolean;       // có vào SORT allowlist không
  enum?: ReadonlyArray<readonly [ma: string, nhan: string]>; // chiều/nguồn
  anhXaMa?: (code) => StatusLabel;  // ttxly/tthai → dùng lại statusLabels.ts

  tren: {                  // xuất hiện ở đâu — thay cho việc khai 4 nơi
    bang?: boolean;        // lên DataTable
    fileXuat?: boolean;    // vào EXPORT_COLUMNS
    chiTiet?: boolean;     // màn chi tiết
  };
}
```

### C3. Toàn bộ các nơi cũ trở thành hàm dẫn xuất

- `EXPORT_COLUMNS` ⟶ `registry.filter(f => f.tren.fileXuat)` (giữ đúng thứ tự nghiệp vụ đã chốt).
- Cột bảng ⟶ `registry.filter(f => f.tren.bang)` — `InvoiceTable` không còn khai cột trong JSX.
- Allowlist sắp xếp server ⟶ `registry.filter(f => f.sapDuoc)` — vẫn là allowlist chống SQL injection, nhưng **một nguồn**.
- Ô lọc trong FilterBar/ColumnMenu ⟶ sinh từ `f.locDuoc`.

> **Ranh giới an toàn (giữ nguyên tắc bằng chứng + đa tenant):** Registry chỉ mô tả *trình bày & khả năng*. Nó **không** thay Zod `invoiceFilterSchema` phía server (vẫn validate input không tin cậy) và **không** nới allowlist `ORDER BY`. Registry *sinh ra* allowlist đó, không *bỏ qua* nó. Nhãn mã trạng thái vẫn tuân `statusLabels.ts` (chỉ gán nhãn cho mã đã kiểm chứng).

### C4. Đặt ở đâu

Đề xuất một gói dùng chung `packages/domain` (hoặc `packages/query` mở rộng) để **cả client lẫn export/query cùng đọc một registry** — vì tách client/server hai bản là tái tạo đúng vấn đề đang có. Chi tiết vị trí sẽ chốt ở bước kế hoạch.

---

## Phần D — Luật giao diện (nội dung dự kiến của `.claude/rules/ui.md`)

Gom các chuẩn đang rải rác thành một Luật có hiệu lực, gồm:

1. **Tokens:** cấm hardcode màu/px; chỉ dùng biến `--…`. (Đã có, chỉ ghi thành luật.)
2. **Primitive bắt buộc:** mọi ô nhập/chọn/nút dùng primitive chung. **Bổ sung `Select` và `Field`** để `FilterBar` thôi tô kiểu nội tuyến.
3. **Nhãn một nguồn:** mọi nhãn trường lấy từ Registry (Phần C). Cấm gõ chuỗi nhãn thẳng trong màn.
4. **Pattern chuẩn:** `FilterBar`, `DataTable`, `Toolbar` — đọc Registry, không tự khai cột/ô lọc.
5. **Hợp đồng tương tác:** thống nhất "sửa bộ lọc → bấm *Lọc dữ liệu* mới áp dụng" (hết cảnh nút kỳ áp dụng tức thì còn nút khác thì không). Tách bạch hành động **đọc dữ liệu đã có** (nhẹ) với **kéo mới từ Tổng cục Thuế** (nặng, chạy nền).
6. **Bốn trạng thái mỗi màn:** rảnh / đang tải / rỗng / lỗi — đã có `Loading/EmptyState/ErrorState`, nâng thành luật "không màn trắng".
7. **Bộ lọc trên URL:** đưa bộ lọc vào query-string để chia sẻ/lưu/back được (hiện chỉ ở localStorage + state).
8. **Khả năng tiếp cận & di động:** dùng thẻ gốc (`<select>`, `<progress>`…) cho đúng a11y và thân thiện cảm ứng.

---

## Phần E — Ba yêu cầu ban đầu trở thành hệ quả của khung

Khi có khung, ba yêu cầu bạn nêu **không còn là vá rời** mà là cấu hình/áp luật:

- **(1) Chọn kỳ bằng dropdown** → thêm một pattern `ChonKy` (Tháng/Quý/Năm) trong thư viện, dùng lại `period.ts`. Áp cho mọi màn có lọc thời gian, không riêng danh sách.
- **(2) Mặc định tháng hiện tại** → một quy tắc khởi tạo bộ lọc trong Luật (mục D5) + bỏ nhớ kỳ ở `filterStore`. Áp đồng nhất mọi màn.
- **(3) Đổi tên/vị trí nút** → "Lọc dữ liệu" và "Đồng bộ và tải xuống" là hai hành động chuẩn trong hợp đồng tương tác (mục D5), không phải sửa nhãn lẻ.

Ngoài ra, khung làm lộ **hai việc nền đáng làm** (ghi vào `docs/BACKLOG`): gộp nhãn về một nguồn (sửa lệch "Tổng TT"/"Tổng thanh toán"), và thêm chỉ mục `(tenant_id, tdlap)` cho hiệu năng quy mô lớn.

---

## Phần F — Cách triển khai (tăng dần, KHÔNG đập đi làm lại)

Nguyên tắc: **không viết lại toàn bộ frontend**. Dựng khung rồi *rút dần* các màn về khung — mỗi bước một đơn vị U, có test, xanh mới đi tiếp.

| Đơn vị | Nội dung | Kết quả |
|---|---|---|
| **U-K0** | Chốt & tạo `.claude/rules/ui.md` + tài liệu Registry (từ tài liệu này) | Có "gốc" thành văn, có hiệu lực |
| **U-K1** ✅ | Dựng Registry miền hoá đơn; **`EXPORT_COLUMNS` dẫn xuất từ Registry** (không đổi hành vi file xuất — có test giữ nguyên đầu ra) | Một nguồn sự thật, đã chứng minh không phá xuất |
| **U-K2** ✅ | `InvoiceTable` + allowlist sắp/lọc **đọc Registry** thay vì khai tay | Bảng & server cùng nguồn; nhãn hết lệch |
| **U-K3** ✅ | Bổ sung primitive `Select`/`Field`; `FilterBar` dùng primitive + pattern `ChonKy` | Yêu cầu (1) rơi ra tự nhiên |
| **U-K4** ✅ | Áp hợp đồng tương tác + mặc định tháng hiện tại + đổi tên nút + tự tải sau đồng bộ | Yêu cầu (2)(3) hoàn tất |
| **U-K5** *(tùy chọn)* | Bộ lọc lên URL; chỉ mục `(tenant_id, tdlap)` | Chia sẻ được + nhanh ở quy mô lớn |

Mỗi đơn vị đều theo vòng lặp chuẩn của dự án (viết test trước → hiện thực tối thiểu → `make lint && make test` → review chéo → commit nhỏ). Có thể dừng ở bất kỳ đơn vị nào mà hệ thống vẫn chạy.

---

## Phần G — Triết lý thiết kế & cách nghiệm thu "đạt chuẩn"

Đây là phần trả lời hai câu hỏi cốt lõi: *bộ gốc này theo triết lý nào?* và *làm sao biết nó đạt chuẩn SaaS và hợp dự án?*

### G1. Kim chỉ nam (một câu)

> **"Khai báo một lần — chiếu ra nhiều bề mặt."** Giao diện, thanh lọc và file xuất đều là *hình chiếu* của một mô hình miền duy nhất, không phải ba bản chép tay giữ khớp bằng kỷ luật.

Bộ gốc không phải sáng chế riêng. Nó là hợp lưu của các nguyên tắc kỹ nghệ đã được kiểm chứng rộng rãi trong ngành, và — quan trọng hơn — **chính là các nguyên tắc mà tầng sau của dự án đã dùng và đã thắng.**

### G2. Bảy nguyên tắc nền (có tên, có nguồn, và cách bộ gốc hiện thân)

| Nguyên tắc (nguồn) | Nội dung | Bộ gốc hiện thân ở đâu |
|---|---|---|
| **Single Source of Truth / DRY** (Hunt & Thomas, *The Pragmatic Programmer*) | Mỗi tri thức tồn tại đúng một chỗ | Registry miền hoá đơn (Phần C) — thay 4 bản định nghĩa |
| **Ubiquitous Language** (Evans, *Domain-Driven Design*) | Một vốn từ thống nhất cho cả code lẫn người dùng | Nhãn VN duy nhất trong Registry — hết "Tổng TT" vs "Tổng thanh toán" |
| **Anti-Corruption Layer** (Evans, DDD) | Ngăn khái niệm hệ ngoài rò vào miền của mình | Registry + `types/api.ts` chặn tên trường thô GDT (`nbmst`, `tdlap`) lên màn hình |
| **Atomic Design** (Brad Frost) | Tokens → primitive → pattern → trang | Đúng mô hình 6 tầng ở Phần B |
| **Design Tokens** (W3C Design Tokens CG) | Quyết định thị giác là biến tập trung | `tokens.css` — đã có, nay thành Luật |
| **Ports & Adapters / Separation of Concerns** (Cockburn) | Lõi nghiệp vụ tách khỏi chi tiết bên ngoài | Song song `GdtTransport` của backend — pattern chỉ *đọc* Registry, không dính DB/API |
| **Consistency & Accessibility** (Nielsen 10 heuristics #4; WCAG 2.1 AA) | Nhất quán + ai cũng dùng được | Hợp đồng tương tác + 4 trạng thái + thẻ gốc a11y (Phần D) |

### G3. Vì sao HỢP dự án (không phải triết lý ngoại lai)

Đây là luận điểm mạnh nhất: bộ gốc **áp đúng những nguyên tắc Hiến pháp dự án đã tuyên**, chỉ mở sang tầng trình bày.

- Hiến pháp yêu cầu *"cô lập mọi phụ thuộc API thuế trong một adapter duy nhất"* → chính là **Anti-Corruption Layer**. Registry làm điều tương tự cho trường dữ liệu ở tầng UI.
- Hiến pháp có *"khóa tự nhiên hoá đơn"* + *"đồng bộ idempotent"* → tư duy **một nguồn sự thật** cho dữ liệu. Registry là một-nguồn-sự-thật cho *trình bày* dữ liệu đó.
- Hiến pháp có *"Nguyên tắc bằng chứng"* → bộ gốc **không nới lỏng nó**: Registry sinh allowlist lọc/sắp chứ không bỏ qua Zod; nhãn mã trạng thái vẫn theo `statusLabels.ts` (chỉ gán nhãn mã đã kiểm chứng).
- Hiến pháp có *đa tenant* → hợp đồng tương tác giữ quy tắc "lựa chọn/bộ lọc không sót qua phiên" (đã có ở `filterStore`/`selectedIds`).

Nói cách khác: **nếu backend của bạn đã đạt chuẩn nhờ các nguyên tắc này, thì đây là cùng bộ nguyên tắc — nên tính "hợp dự án" là bắc cầu, không phải khẳng định suông.**

### G4. "Chuẩn SaaS Enterprise (100.000 tenant)" cụ thể đòi gì — và bộ gốc đáp ở đâu

| Đòi hỏi của SaaS quy mô lớn | Bộ gốc đáp |
|---|---|
| Nhất quán khi màn hình & tính năng phình to | Registry + primitive + Luật ui.md |
| Sửa nhanh, ít rủi ro hồi quy | Sửa 1 nơi thay 4; có test dẫn xuất |
| Sẵn sàng đa ngôn ngữ / đổi nhãn hàng loạt | Nhãn tập trung (đổi 1 chỗ áp mọi bề mặt) |
| An toàn đa tenant tới tận UI | Hợp đồng tương tác giữ quy tắc không-sót-qua-phiên |
| Tiếp cận được (a11y) + di động | WCAG AA + thẻ gốc + dropdown cảm ứng |
| Hiệu năng ở khối lượng lớn | Chỉ mục `(tenant_id, tdlap)` + mặc định kỳ hẹp (U-K5) |

### G5. Bộ tiêu chí nghiệm thu — cách bạn BIẾT nó đạt chuẩn (đo được, không cảm tính)

Bạn không phải "tin" là nó đạt chuẩn — có thể **kiểm bằng máy**, và biến thành cổng kiểm soát (hook) đúng như cách backend đang làm:

1. **Một nơi định nghĩa:** thêm một trường mới chỉ sửa **đúng một tệp** (Registry). *Kiểm:* mã trường xuất hiện như *định nghĩa* đúng một chỗ.
2. **Không nhãn lệch:** nhãn của cùng một trường **giống nhau** ở bảng và file xuất. *Kiểm:* một test đối chiếu nhãn — hiện tại sẽ ĐỎ ("Tổng TT" ≠ "Tổng thanh toán"), sau khung phải XANH.
3. **Không hardcode thị giác:** không có mã màu hex/px cứng ngoài `tokens.css`. *Kiểm:* lint/grep.
4. **Mọi ô nhập là primitive:** không còn `selectStyle`/`inputStyle` tô tay trong `features/`. *Kiểm:* grep.
5. **Bốn trạng thái mỗi màn:** rảnh/tải/rỗng/lỗi đều có. *Kiểm:* test render.
6. **A11y AA:** mọi control có nhãn; tương phản đạt AA. *Kiểm:* kỹ năng `accessibility-review` có sẵn trong phiên.
7. **Độ phủ test ≥ 80%** tầng nghiệp vụ (đúng DoD Hiến pháp).

> Ba tiêu chí 1–4 có thể gắn vào `Stop` hook (`.claude/settings.json`) → **conformance được ép tự động**, không phụ thuộc trí nhớ. Đó là câu trả lời dứt khoát cho "làm sao biết": *bạn biết vì máy chặn mọi vi phạm, giống hệt cổng lint+test của backend.*

---

## Phần H — Cổng kiểm một ý tưởng/thay đổi giao diện (dùng hằng ngày)

Đây là câu trả lời cho: *"Căn cứ vào đâu để biết một ý tưởng giao diện hay một thay đổi nút là thuận hệ thống, không sai thiết kế?"*

Mỗi khi có một ý tưởng hoặc muốn đổi một nút, chạy qua **7 câu hỏi theo thứ tự**. Tất cả "Đạt" → cứ làm. Bất kỳ câu "Chưa" nào → **dừng, xử lý theo cột phải rồi mới làm.** Không có câu nào được bỏ qua bằng "lần này ngoại lệ".

| # | Câu hỏi phải trả lời | Nếu "Chưa" thì đang sai gì / phải làm gì |
|---|---|---|
| 1 | **Đúng tầng chưa?** Thay đổi này thuộc tầng nào (token / primitive / Registry / pattern / trang) và tôi đang sửa đúng tầng đó chứ? | Nếu một "đổi nút nhỏ" mà phải sửa rải nhiều tệp → đang vá ở ngọn. Đưa về đúng tầng. |
| 2 | **Đụng trường dữ liệu không?** Nếu có (thêm/ẩn/đổi cột, đổi cách lọc-sắp) → nó đã khai trong **Registry** chưa, và tôi sửa ở Registry chứ không sửa tay trong bảng? | Chưa có → thêm vào Registry trước. Đang sửa tay trong `InvoiceTable` → sai, quay về Registry. |
| 3 | **Nhãn lấy từ một nguồn chưa?** Chữ hiển thị có lấy từ Registry/`statusLabels` không, hay tôi đang gõ chuỗi mới? | Gõ tay → nguy cơ lệch nhãn. Đưa nhãn về Registry. |
| 4 | **Dùng nguyên liệu có sẵn chưa?** Ô nhập/nút/màu dùng **primitive + token** hay tự tô kiểu mới? | Tự tô → hoặc dùng primitive có sẵn, hoặc (nếu thật sự thiếu) **thêm một primitive mới vào thư viện** để cả hệ dùng chung. |
| 5 | **Ý nghĩa hành động đúng chưa?** (với nút) Đây là "đọc dữ liệu đã có" (nhẹ) hay "kéo mới từ Tổng cục Thuế/ghi" (nặng)? Tên nút + vị trí có phản ánh đúng, và có theo **hợp đồng tương tác** chung không? | Tên mập mờ hoặc trộn hai loại → đặt lại tên/tách hành động cho đúng loại. |
| 6 | **Đủ 4 trạng thái + an toàn chưa?** Có lo rảnh/tải/rỗng/lỗi? Có làm **rò dữ liệu qua phiên** (đa tenant)? Có **bịa nhãn/giá trị chưa kiểm chứng** không? | Thiếu trạng thái → bổ sung. Rò/bịa → vi phạm Hiến pháp, không làm. |
| 7 | **Qua được tiêu chí máy-kiểm G5 chưa?** Thay đổi có phá tiêu chí nào ở Phần G5 (một-nơi, không-lệch-nhãn, không-hardcode…)? | Phá → sửa cho qua trước khi commit (hook sẽ chặn). |

### Câu hỏi vàng (nếu chỉ nhớ một câu)

> **"Để làm điều này tôi phải sửa mấy nơi — và nếu mai một màn khác cần điều tương tự, nó tự được hưởng hay phải chép lại?"**

- Sửa **một nơi**, màn khác **tự hưởng** → thuận thiết kế.
- Sửa **nhiều nơi**, hoặc phải **chép lại** → đang chống lại thiết kế (dấu hiệu "vá ở ngọn"). Dừng, tìm đúng tầng ở câu 1.

### Ví dụ áp cổng vào chính 3 yêu cầu của bạn

- **Đổi "Áp dụng" → "Lọc dữ liệu":** câu 3 (nhãn nút thuộc hợp đồng tương tác, không gõ rời) + câu 5 (đúng loại "đọc dữ liệu nhẹ"). → Đạt, làm ở tầng pattern, mọi màn có lọc hưởng chung.
- **"Đồng bộ khoảng này" → "Đồng bộ và tải xuống":** câu 5 phát hiện đây là hành động **nặng** và nay thêm bước ghi/tải → phải tách bạch rõ, đúng hợp đồng. → Đạt sau khi làm rõ loại.
- **Chọn kỳ bằng dropdown:** câu 1 hỏi "đúng tầng chưa?" → đây là **pattern `ChonKy`** dùng lại `period.ts`, không phải sửa lẻ trong `FilterBar`. Câu hỏi vàng: mọi màn có lọc thời gian tự hưởng. → Đạt.

Ngược lại, một ý tưởng **trượt cổng** trông như: "thêm riêng cột X vào mỗi bảng bằng cách chèn JSX" (trượt câu 1 + 2 + câu hỏi vàng) → phải quy về "khai trường X trong Registry một lần".

---

## Quyết định đã chốt (2026-07-22)

1. **Vị trí Registry:** ✅ gói **dùng chung** (client + export/query cùng đọc một nguồn).
2. **Phạm vi:** ✅ làm tới **U-K4 ở mức cơ bản** (đủ để 3 yêu cầu hoàn tất trên nền khung, chưa tinh chỉnh sâu).
3. **Hiệu lực:** ✅ đưa **`ui.md` vào `.claude/rules/`** (thành Luật) + **bản hướng dẫn cơ bản vào `docs/`**.

**Bước kế tiếp:** tôi soạn **prompt thực thi cho U-K0** (tạo `ui.md` + tài liệu Registry từ tài liệu này) và **U-K1** (dựng Registry; `EXPORT_COLUMNS` dẫn xuất, có test giữ nguyên đầu ra file xuất), theo đúng vòng lặp viết-test-trước của dự án.

---

## Nhật ký thực thi

### U-K1 (xong) — Registry + file xuất dẫn xuất

`packages/domain` giữ `INVOICE_FIELDS`. `EXPORT_COLUMNS` (`packages/export/src/columns.ts`) nay là `deriveExportColumns(fieldsForExport())`. Đầu ra csv/xlsx **bất biến** — bộ test golden có sẵn không sửa một dòng nào và vẫn xanh.

### U-K2 (xong) — bảng + allowlist đọc Registry

- `InvoiceTable.tsx` không còn khai `<ThMenu>` từng cột. Cột, nhãn, kiểu ô lọc, lựa chọn enum, khả năng sắp, căn lề đều duyệt từ `fieldsForTable()`. File chỉ còn giữ **renderer ô** (`O_BANG`) — tách bạch "có cột nào" (Registry) với "vẽ ra sao" (bảng).
- `SORT_COLUMNS` (`packages/query/src/filters.ts`) giữ vai trò **hàng rào** (khóa → cột Drizzle, chống SQL injection) nhưng **danh sách khóa** nay do Registry quyết. `kiemAllowlistKhopRegistry()` chạy lúc nạp module: hai bên lệch ⇒ ném ngay, không trôi âm thầm. Zod `invoiceFilterSchema` **không đổi**, allowlist **không nới**.

**Hai khái niệm cố ý tách rời** (đừng gộp lại khi đọc mã):

| Thuộc tính | Nghĩa | Hiện có |
|---|---|---|
| `sapDuoc` | Vào allowlist `ORDER BY` phía server | 12 khóa |
| `sapTrenBang` | Bảng có phơi menu **Sắp** cho cột đó không | 9 cột |

`dvtte`, `ttxly`, `tthai` server sắp được nhưng bảng **chưa** mời sắp — khoảng lệch này có từ U31, U-K2 chỉ biến nó thành **dữ liệu thấy được** thay vì ẩn trong JSX. Bật thêm là quyết định sản phẩm, không phải việc của refactor.

**Nhãn ngắn (`nhanNgan`) là có chủ ý, không phải trôi.** Bảng hẹp nên hiện "Tổng TT", file xuất hiện "Tổng thanh toán" — nhưng cả hai nay sinh từ **một** khai báo `tgtttbso`, nên không thể lệch ngẫu nhiên nữa. Muốn bảng hiện nhãn đầy đủ: xoá đúng dòng `nhanNgan` trong Registry, một nơi.

### U-K3 (xong) — primitive Select/Field + bộ chọn kỳ dropdown (yêu cầu 1)

- **Primitive mới** `Select` + `Field` (`components/ui/primitives.tsx`): `<select>`/`<input>` gốc (cảm ứng tốt), nhãn gắn `htmlFor`↔`id`, ẩn nhãn được (`hideLabel`) mà vẫn đọc cho trình đọc màn hình. Chỉ token.
- **`period.ts`**: thêm hàm THUẦN nhận kỳ tường minh — `monthRangeOf(y,m)`/`quarterRangeOf(y,q)`/`yearRangeOf(y)`; hàm cũ (`monthRange(ref)`…) gọi lại chúng → một hiện thực, có test khẳng định hai đường cho cùng kết quả. Kỳ phi lý (tháng 0/13, quý 5) ném (fail-loud).
- **`ChonKy`**: chọn Tháng/Quý/Năm CỤ THỂ (kể cả quá khứ) qua dropdown Năm (5 năm gần nhất) + Tháng/Quý. Ba nút Tháng/Quý/Năm giữ nguyên vai trò cũ — bấm là áp kỳ HIỆN TẠI ngay (PARITY: `invoices.test.tsx` vẫn xanh).
- **`FilterBar`**: bỏ `selectStyle`/`inputStyle` nội tuyến, dùng `ChonKy` + `Select`/`Field`. Lựa chọn chiều/nguồn lấy từ `INVOICE_FIELDS[].enum` (một nguồn).
- **Phép kiểm convention** (`test/conventions/ui-luat.test.ts`): quét `features/**` cấm hex cứng + cấm `style=` trên `<input>/<select>`. Nay là test trong `make test` → cổng bắt buộc (khoảng hở #2 của AUDIT-hooks đã vá).
- **Dọn kèm** (chủ dự án duyệt mở phạm vi): thêm token `--text-on-brand`, thay 4 chỗ `color:"#fff"` (SupportCenter/LoginPage/SettingsPage/TaxAccountsPage) — **không đổi pixel** (token = `#ffffff`); `ColumnMenu` 3 ô lọc chuyển sang `Field`. Cần để phép kiểm convention xanh mà không nới.

### U-K4 (xong) — mặc định tháng hiện tại + đổi tên nút + tự tải (yêu cầu 2, 3)

- **(2) Mặc định tháng hiện tại:** `InvoicesPage` khởi tạo bộ lọc = (đã lưu chiều/nguồn/MST) **ghi đè** kỳ = `kyThangHienTai()` (tháng hiện tại giờ VN). `filterStore` **bỏ nhớ** `tuNgay/denNgay` (vẫn nhớ chiều/nguồn/MST) — kỳ cũ không lọt vào, mở màn luôn là tháng này.
- **(3a) "Áp dụng" → "Lọc dữ liệu"** đặt ngay sau `ChonKy`: hành động **đọc nhẹ** (dữ liệu đã có), không gọi mạng đồng bộ.
- **(3b) "Đồng bộ khoảng này" → "Đồng bộ và tải xuống":** sau backfill **thủ công** (bấm nút) hoàn thành → tự xuất+tải file cho bộ lọc đang xem. Auto-backfill lúc rỗng **KHÔNG** tự tải (tránh bất ngờ tải mỗi lần mở màn rỗng). Tái dùng `taiXuatHoaDon` — **không bộ xuất thứ hai** (nút Xuất Excel/CSV và tự-tải cùng gọi một hàm).

Hợp đồng tương tác (ui.md) hiện rõ: **đọc nhẹ** ("Lọc dữ liệu") tách bạch trực quan với **kéo nặng** ("Đồng bộ và tải xuống"). Guard hiển thị panel tách thành hàm thuần `nenHienPanelDongBo` (test cả hai nhánh).

**Ba yêu cầu ban đầu hoàn tất:** (1) chọn kỳ dropdown — K3; (2) mặc định tháng hiện tại + (3) đổi tên nút + tự tải — K4.

# U16b — Prompt triển khai (dán cho Claude Code)

> Copy toàn bộ khối dưới đây làm prompt. Bám vòng lặp U của dự án: đọc spec → test trước → hiện thực tối thiểu → `make lint && make test` → review chéo. **Chỉ một đơn vị.** Thuần frontend `apps/web`, không đụng backend/DB/GDT/tenant.

---

## PROMPT

Thực hiện đơn vị **U16b — Thiết kế lại trang "Giới thiệu & Hỗ trợ"** cho `apps/web`. Đây là module frontend thuần client, KHÔNG thêm endpoint, KHÔNG đụng `apps/api` / `packages/*` / DB / GDT / dữ liệu tenant.

### Đọc trước khi làm
- `docs/plans/U16b-thiet-ke-lai-trang-gioi-thieu.md` (thiết kế + phạm vi + DoD).
- `docs/plans/U16b-noi-dung-faq-va-changelog.md` (nội dung FAQ + changelog ĐÃ CHỐT — dùng đúng nội dung này).
- `apps/web/src/features/about/AboutPage.tsx` (trang hiện tại), `DonationQr.tsx`, `apps/web/src/lib/donation.ts`.
- `apps/web/src/components/ui/primitives.tsx` (Card/Alert/Button/TextField), `apps/web/src/lib/i18n/vi.ts`.

### Việc cần làm (5 phần)

**1. Ẩn phần Đóng góp bằng cờ — KHÔNG xóa code.**
- Thêm vào `apps/web/src/lib/donation.ts`: `export const SHOW_DONATION = false;`
- Trong `AboutPage.tsx`, bọc toàn bộ `<Card>` chứa `<DonationQr/>` trong `{SHOW_DONATION && ( … )}`.
- GIỮ NGUYÊN `DonationQr.tsx`, `lib/vietqr.ts` và toàn bộ test unit VietQR — chúng vẫn phải chạy xanh (test hàm thuần không phụ thuộc cờ render).

**2. Lịch sử cập nhật — file tĩnh + component.**
- Tạo `apps/web/src/lib/changelog.ts` với kiểu:
  ```ts
  export type ChangelogKind = "feature" | "improvement" | "fix";
  export type ChangelogEntry = {
    version: string; date: string; title: string;
    changes: string[]; kind: ChangelogKind;
  };
  export const CHANGELOG: ChangelogEntry[] = [ /* … */ ];
  ```
  Nạp đúng 6 phiên bản (v1.5 → v1.0) từ `U16b-noi-dung-faq-va-changelog.md` §B, mới nhất đầu mảng. `date` dạng ISO `YYYY-MM-DD`.
- Tạo `apps/web/src/features/about/Changelog.tsx`: render timeline dọc, mỗi mục hiện version + ngày (định dạng VN `dd/MM/yyyy`) + nhãn `kind` + danh sách `changes`. Mặc định hiện 5 mục mới nhất, nút "Xem thêm" mở phần còn lại.

**3. Trung tâm hỗ trợ & tài liệu — FAQ + liên hệ.**
- Tạo `apps/web/src/lib/faq.ts`:
  ```ts
  export type FaqItem = { q: string; a: string; group: string };
  export const FAQ: FaqItem[] = [ /* 10 câu */ ];
  ```
  Nạp đúng 10 câu từ §A (giữ nguyên 3 nhóm: "Bảo mật thông tin", "Tuân thủ pháp luật", "Tính năng phần mềm").
- Tạo `apps/web/src/features/about/SupportCenter.tsx`:
  - Phần a) FAQ: accordion nhóm theo `group`, mỗi câu là `<button aria-expanded>` mở/đóng câu trả lời.
  - Phần b) Kênh liên hệ: giữ 2 nút Zalo/WhatsApp (dùng lại `zaloUrl`/`whatsappUrl` + `CONTACT_PHONE`), thêm dòng **"Giờ hỗ trợ: 08:00 – 17:00"** và mục **"Cách báo lỗi hiệu quả"** (liệt kê: ảnh màn hình, MST, thời điểm, thao tác đang làm).

**4. Ghép lại `AboutPage.tsx` + i18n.**
- Thứ tự khối: (1) Giới thiệu [giữ] → (2) `<SupportCenter/>` → (3) `<Changelog/>` → (4) Đóng góp [sau `{SHOW_DONATION && …}`].
- Cập nhật `PageHeader title="Giới thiệu & Hỗ trợ"`, subtitle phù hợp.
- `lib/i18n/vi.ts`: đổi `navAbout: "Giới thiệu & Hỗ trợ"`. Route `/gioi-thieu` GIỮ NGUYÊN.

**5. Cập nhật test.**
- Sửa `apps/web/test/features/about.test.tsx`:
  - Tiêu đề trang mới "Giới thiệu & Hỗ trợ".
  - Có mục FAQ: bấm một câu hỏi → câu trả lời hiện (`aria-expanded` đổi).
  - Có mục Lịch sử cập nhật: hiện version mới nhất.
  - Zalo/WhatsApp `href` đúng + `rel` chứa `noopener`; hiện "08:00 – 17:00".
  - **Khi `SHOW_DONATION` tắt: khối Đóng góp KHÔNG render** (không có nút chọn mức / QR).
  - Giữ test cho cả 3 vai (mọi vai xem được).

### Ràng buộc bắt buộc (DoD)
- TDD đỏ→xanh. `make lint` sạch (Biome + `tsc --noEmit`), `make test` xanh gồm test mới + test VietQR cũ không hỏng.
- KHÔNG hardcode hex — dùng tokens `var(--…)`. Liên kết ngoài `rel="noopener noreferrer"`.
- A11y: accordion `aria-expanded`; nút "Xem thêm" có nhãn rõ; changelog cấu trúc danh sách đúng ngữ nghĩa.
- KHÔNG đụng `gdt-adapter.md` / `multi-tenant.md`. Không secret trong mã/log.
- Commit nhỏ theo 5 phần. Cập nhật `CLAUDE.md` §"Quy trình làm việc" nối `→ U16b`.

### Sau khi xanh
Review chéo bằng subagent độc lập (dod-auditor): kiểm bằng chứng test, A11y, không rò tenant, cờ ẩn Donation đúng. Báo lại kết quả `make lint` + `make test`.

**Điểm còn treo (không chặn triển khai, ghi rõ trong PR):** ① FAQ câu 4 (chính sách xóa dữ liệu) đang để ngỏ — chờ chủ dự án. ② Link nhóm Zalo/Telegram cộng đồng — chưa gắn nút, thêm sau. ③ Số phiên bản changelog là đề xuất — chủ dự án chốt lại nếu muốn.

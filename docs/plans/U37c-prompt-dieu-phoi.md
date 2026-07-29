# U37c — Prompt điều phối

> Đặc tả: `docs/plans/U37c-plan.md` (đã duyệt QA1 ngày 2026-07-29).
> Nhật ký: `docs/plans/U37c-tien-do.md`. Mỗi gói một commit, không trộn.

## Luật chung cho mọi gói

1. **TDD thật**: viết test ĐỎ trước, chạy thấy đỏ, rồi mới hiện thực. Không viết test sau
   để khớp mã đã có.
2. **Không khẳng định vô căn cứ.** Mọi phát biểu về hành vi hệ thống ngoài (CDN, R2, trình
   duyệt, Zalo) phải kèm lệnh + kết quả tái lập được, hoặc gắn nhãn **CHƯA KIỂM CHỨNG**.
3. **Không suy luận thay cho probe.** Bài học sinh ra đơn vị này: lỗi nằm ở tầng CDN, ngoài
   mọi file mã — đọc mã bao nhiêu cũng không thấy.
4. `make lint && make test` xanh trước khi commit. Hook DoD chặn ở cổng `Stop`.
5. Không mở rộng phạm vi. Thấy việc đáng làm mà lạc phạm vi ⇒ ghi vào
   `docs/BACKLOG-y-tuong-va-de-xuat.md`.

## Gói 1 — Migration `0021` + schema

**Mục tiêu:** thêm `token`, `nmten`, `so_luot_tai`, `lan_tai_cuoi` vào `goi_chia_se`.

- `token`: `text NOT NULL UNIQUE` **toàn cục** (không theo tenant) — cùng lý do `khoa_r2`:
  trùng token nghĩa là một liên kết mở ra gói của tenant khác. Ràng buộc AN TOÀN.
- Bảng đã có dữ liệu (2 hàng) ⇒ **không thể** thêm `NOT NULL` trần. Phải backfill trong
  chính migration (sinh giá trị cho hàng cũ) rồi mới `SET NOT NULL`.
- Giữ nguyên khuôn RLS: `ENABLE` + `FORCE`, policy cách ly, `DO $$ GRANT SELECT, INSERT,
  UPDATE TO vat_app $$`. **Không** cấp DELETE.

⚠️ **Bẫy ADR-0008 sẽ nổ lần thứ ba.** `_journal.json` có mốc `when` ở tương lai
(2026-08-02). `drizzle-kit generate` đóng dấu `when = now` ⇒ `0021` **bị bỏ qua im lặng** mà
CLI vẫn báo thành công. Đặt lại `when = <mốc trước> + 60000`.

**Cổng dừng:** sau khi áp, chạy `node scripts/hau-kiem-bang.mjs goi_chia_se` — phải ĐẠT.
Không tin CLI báo "thành công", hậu kiểm trên DB thật.

## Gói 2 — Đường tải công khai

**Mục tiêu:** `GET /tai/:token` tải được đúng gói còn hiệu lực, và **404 với mọi thứ khác**.

- Route nội bộ ở `vat-api`; `vat-web` nhận `/tai/*` và chuyển qua service binding.
  **KHÔNG** gắn `docs.tourdao.vn` vào `vat-api` — làm vậy là phơi TOÀN BỘ route của
  `vat-api` ra công cộng để đổi lấy đúng một đường tải.
- Chỉ trả file khi đủ **cả ba**: `trang_thai === "san_sang"`, `het_han_luc > now`, object còn
  trong R2. Thiếu vế nào → 404.
- **Bốn ca 404 phải KHÔNG phân biệt được nhau**: token sai · đã thu hồi · hết hạn · mất
  file. Khác nhau là xác nhận cho người dò rằng token từng tồn tại.
- Stream thẳng `R2ObjectBody.body`, không đọc trọn vào RAM.
- **`Cache-Control: no-store` — có test khóa.** Đây đúng chỗ đã trượt một lần; thiếu nó là
  tái lập nguyên lỗi cũ ở chỗ mới.
- Tăng `so_luot_tai` + đặt `lan_tai_cuoi`. Endpoint này KHÔNG xác thực ⇒ chỉ `UPDATE` tăng
  đếm, tuyệt đối không dựng bảng log mỗi lượt tải.

**Cổng dừng (tiêu chí 2 của plan):** probe THẬT trên production — tải được → thu hồi →
`curl` lại **phải 404 NGAY**. Ghi lệnh + kết quả vào nhật ký. Đây là tiêu chí sinh ra cả
đơn vị này.

## Gói 3 — Đấu dây token vào luồng tạo/phát hành

- `POST /goi-chia-se`: sinh `token`, lưu `nmten` chụp tại thời điểm tạo.
- Mọi chỗ trả `url` đổi sang `/tai/<token>`; `khoa_r2` thành thuần nội bộ, **không** rời khỏi
  máy chủ.
- Test khóa: phản hồi API **không chứa** `khoa_r2` ở bất kỳ route nào.

## Gói 4 — Bucket thành riêng tư

⚠️ **Cổng dừng 2:** **đo lại ngay trước khi gỡ** — nếu có gói `san_sang` thật thì DỪNG và
hỏi chủ dự án. Lần đo 2026-07-29: 2 gói, cả hai `da_thu_hoi`.

Gỡ custom domain `docs.tourdao.vn` khỏi `vat-chia-se`. Giữ lifecycle 7 ngày (dọn rác — thôi
là cơ chế hết hạn). Hậu kiểm: truy cập trực tiếp không còn đường nào.

## Gói 5 — Trang "Liên kết chia sẻ"

Mục điều hướng mới → `/lien-ket`. Đủ **bốn trạng thái** (`ui.md`): rảnh / đang tải / rỗng /
lỗi. Trạng thái rỗng phải nói được việc cần làm tiếp.

Nhãn lấy từ Registry, **không** gõ chuỗi rời trong màn.

## Gói 6 — Anchor + Sao chép / Chia sẻ / Email

- Anchor **"Liên kết tải hóa đơn"**, không phơi URL trần.
- **Sao chép**: `navigator.clipboard.writeText` + phản hồi thấy được ("Đã sao chép"). Im
  lặng thì người dùng không biết đã ăn hay chưa.
- **Chia sẻ**: `navigator.share` — **ẩn hẳn nút** khi không hỗ trợ, không hiện nút
  bấm-không-ăn-gì. Gọi thẳng trong `onClick` (API đòi cử chỉ người dùng).
- **Gửi Email**: `mailto:` dựng bằng **hàm thuần** test được, mã hóa URL đúng cách.
- Dùng `Hang`/`Cot`/`ChuPhu` (`22bccff`). Thiếu primitive thì THÊM vào thư viện, không tô
  kiểu nội tuyến trong `features/`.

## Gói 7 — Tài liệu + review + deploy

- `06-BINDING_MAP.md` §3d: endpoint tải công khai + cột mới, **đọc TỪ MÃ** (không chép từ
  kế hoạch — kế hoạch là ý định, mã là sự thật).
- `.claude/rules/security.md`: ghi thành luật — **tài nguyên phục vụ qua HTTP công khai
  phải probe tầng cache, không suy luận từ mã**.
- Review chéo `dod-auditor` **+** `security-reviewer`, ghi kết quả vào nhật ký.
- Deploy đúng thứ tự: DB → sync-worker → api → web. Grep bundle **kèm cache-buster** trước
  khi kết luận web đã lên.

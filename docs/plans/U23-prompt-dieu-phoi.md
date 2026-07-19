# U23 — Prompt điều phối tuần tự (A → E) theo Loop Engineering

> Đây là **một prompt duy nhất** vận hành **vòng lặp điều phối** (`TRIEN_KHAI_BANG_CLAUDE_CODE.md` mục 5): chạy lần lượt từng đơn vị, mỗi đơn vị đi trọn vòng lặp con (spec → test trước → hiện thực → tự kiểm chứng → review chéo → commit), giữa các đơn vị chạy **test hồi quy toàn bộ** + cập nhật nhật ký tiến độ, rồi mới sang đơn vị kế. Đặc tả chi tiết từng đơn vị nằm ở `docs/plans/U23-prompts.md`; kế hoạch ở `docs/plans/U23-plan-4-tinh-chinh.md`.
>
> **Cách dùng:** dán toàn bộ khối dưới vào một phiên làm việc. Có **cổng dừng bắt buộc** giữa các đơn vị — phiên sẽ dừng chờ bạn duyệt trước khi sang đơn vị tiếp theo (không tự ý chạy hết một mạch).

---

```
NHIỆM VỤ ĐIỀU PHỐI: Thực thi tuần tự U23 (A→D) rồi Admin (E: U17→U18→U19→U21), theo đúng Loop Engineering của dự án.

Đọc trước khi bắt đầu: `CLAUDE.md` (Hiến pháp — đặc biệt §Nguyên tắc bằng chứng, §Definition of Done, §Kiến trúc quy tắc cứng), `TRIEN_KHAI_BANG_CLAUDE_CODE.md` mục 1/4/5/6, `docs/plans/U23-plan-4-tinh-chinh.md`, `docs/plans/U23-prompts.md`, và `.claude/rules/*.md` áp dụng cho các file mỗi đơn vị chạm.

QUY TẮC ĐIỀU PHỐI (bắt buộc, áp cho MỌI đơn vị):
1. Làm ĐÚNG MỘT đơn vị mỗi lần, theo thứ tự cố định:
   A (dòng hàng ở màn chi tiết) → B (dòng hàng vào xlsx/csv) → C (tổng quan tối giản) →
   D (MST auto + hạn mức + ngắt kết nối; 4 lát D1→D2→D3→D4 tuần tự) →
   E1 U17 → E2 U18 → E3 U19 → E4 U21.
   KHÔNG gộp đơn vị, KHÔNG nhảy thứ tự, KHÔNG làm trước phần của đơn vị sau.
2. Với mỗi đơn vị, chạy trọn vòng lặp con qua `/start-unit`:
   (a) đọc spec đơn vị trong `docs/plans/U23-prompts.md` (mục tương ứng) + tài liệu nguồn;
   (b) trình bày kế hoạch ngắn (file sẽ sửa, test sẽ viết, tiêu chí nghiệm thu);
   (c) VIẾT TEST TRƯỚC (đỏ) theo nhóm đúng của `testing.md`;
   (d) hiện thực tối thiểu để test xanh — không dư phạm vi;
   (e) tự kiểm chứng bằng `/verify` (make lint && make test; + make test-contract nếu đụng packages/gdt-client). Đỏ → tự sửa và lặp (d)-(e).
3. Cổng review chéo bằng `/qa-unit` khi lint/test đã xanh:
   - dod-auditor: LUÔN.
   - security-reviewer: nếu đụng xác thực/token/dữ liệu đa tenant (bắt buộc cho D, U18; áp cho B vì kết xuất đa tenant).
   - contract-guardian: nếu đụng packages/gdt-client hoặc endpoint thuế.
   Nếu QA trả về Critical → CHẶN, sửa rồi chạy lại /verify + /qa-unit. Không đóng đơn vị khi còn Critical.
4. Đóng đơn vị: commit nhỏ, thông điệp rõ (không trộn đơn vị). Nếu đổi hợp đồng API → cập nhật `06-BINDING_MAP` TỪ MÃ. Cập nhật tài liệu liên quan nếu hành vi đổi.
5. HỒI QUY giữa các đơn vị: sau khi đóng một đơn vị, chạy TOÀN BỘ `make test` (không chỉ test của đơn vị) để đảm bảo không phá phần cũ. Đỏ hồi quy → dừng, sửa trước khi đi tiếp.
6. NHẬT KÝ TIẾN ĐỘ: sau mỗi đơn vị, ghi một dòng vào `docs/plans/U23-tien-do.md` (tạo nếu chưa có): [đơn vị] — DONE/BLOCKED — commit hash — ghi chú. Đây là "tín hiệu khách quan" của vòng điều phối.
7. CỔNG DỪNG GIỮA CÁC ĐƠN VỊ: sau khi đóng một đơn vị + hồi quy xanh + ghi nhật ký, DỪNG và báo cáo gọn (đơn vị vừa xong, kết quả verify/QA, commit, đơn vị kế tiếp). CHỜ tôi duyệt "tiếp" rồi mới sang đơn vị sau. Không tự chạy hết A→E một mạch.

RÀNG BUỘC BẰNG CHỨNG (Hiến pháp): mọi khẳng định về mã/hệ thống ngoài phải truy được về file:line hoặc lệnh+kết quả tái lập. Nếu phải ĐOÁN cấu trúc phản hồi API thuế hoặc gặp yêu cầu chưa rõ (vd: cờ bật module tài khoản con đặt ở đâu; hình dạng token vault cho endpoint disconnect) → DỪNG và HỎI kèm phương án đề xuất + một contract test để kiểm chứng. KHÔNG giả định thầm rồi code tiếp.

CÁC CHỐT ĐÃ CÓ (áp dụng khi tới đơn vị liên quan):
- Hạn mức tài khoản thuế = theo GÓI DỊCH VỤ (U17). Ở D, vì U17 chưa xong → TẠM hardcode = 1 tại một hàm getGioiHanTkThue(tenant), TODO nối U17. Khi làm U17 (E1), thay hardcode bằng nguồn gói dịch vụ.
- Module tài khoản con: ẩn sau cờ, mặc định TẮT ở D (chỉ dựng nền + validate username startsWith(tenants.mst)).
- Dòng hàng trong xlsx/csv (B) = sheet/khối "Chi tiết dòng hàng" RIÊNG, khóa shdon liên kết; tái dùng fetchLinesForInvoices (packages/export/src/lineRows.ts).
- Admin (E) là super-admin XUYÊN-TENANT — đơn vị nhạy cảm bảo mật nhất; U18 bắt buộc security-reviewer, danh tính/đăng nhập/token admin TÁCH khỏi khách, không lộ token thuế/nội dung hóa đơn của tenant.

BẮT ĐẦU NGAY với đơn vị A. Trình bày kế hoạch ngắn cho A trước, chờ không cần tôi duyệt kế hoạch — cứ chạy vòng lặp A tới khi đóng đơn vị, rồi dừng ở CỔNG DỪNG (quy tắc 7).
```

---

## Ghi chú vận hành

- **Vì sao có cổng dừng giữa các đơn vị:** U23 chạm DB migration (D1), xác thực/token (D), và super-admin xuyên-tenant (E) — đều là bề mặt rủi ro cao. Cổng dừng cho bạn duyệt từng bước thay vì để chạy hết một mạch. Nếu muốn chạy liên tục không dừng, sửa quy tắc 7 thành "tự động sang đơn vị kế nếu hồi quy xanh và QA không Critical".
- **Nếu một phiên không đủ dài** để chạy hết A→E: nhật ký `docs/plans/U23-tien-do.md` cho phép phiên sau đọc trạng thái và tiếp tục đúng đơn vị dở — đây chính là cơ chế vòng điều phối "đọc trạng thái → chọn đơn vị kế" ở mục 5.
- **E (Admin)** có thể tách sang phiên riêng: nó là 4 unit lớn (U17–U21) với plan riêng đầy đủ; nếu muốn, dừng điều phối sau D và chạy Admin bằng một phiên chuyên biệt.

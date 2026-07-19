# Thiết kế: Quy trình Deploy Production tự động có cổng xác nhận

> **Trạng thái:** BẢN THIẾT KẾ — chờ duyệt. Chưa code.
> **Ngày:** 2026-07-16
> **Mục tiêu:** Chạy một lệnh trên Claude Code → tự kiểm tra "đạt chuẩn / không vi phạm Hiến pháp / không mất tính năng cũ / đúng kế hoạch" bằng **bằng chứng cụ thể** → báo cáo → người dùng gõ "đồng ý" → Claude deploy lên Production.

---

## 1. Nguyên tắc thiết kế

1. **Tận dụng cái đã có, không đẻ trùng.** Dự án đã có 3 subagent thẩm định (`dod-auditor`, `contract-guardian`, `security-reviewer`), skill `verify`, và hook `gate-dod.sh`. Quy trình này *điều phối* chúng, không viết lại.
2. **Không deploy khi chưa có bằng chứng.** Mọi kết luận "đạt chuẩn" phải kèm output thật (lệnh + kết quả), đúng "Nguyên tắc bằng chứng" trong Hiến pháp. Không có bằng chứng ⇒ coi như CHƯA ĐẠT.
3. **Người giữ nút cuối.** Claude chỉ deploy sau khi người dùng gõ xác nhận rõ ràng. Không tự suy diễn "chắc là đồng ý".
4. **Kết hợp hai tầng** (theo lựa chọn của bạn): Claude Code lo **kiểm tra + báo cáo bằng chứng**; GitHub lo **thực thi deploy an toàn** sau khi bạn duyệt.

---

## 2. Kiến trúc tổng thể — 2 tầng

```
┌─────────────────────── TẦNG 1: CLAUDE CODE (trên máy bạn) ───────────────────────┐
│                                                                                   │
│   Bạn gõ:  /deploy-check                                                           │
│      │                                                                             │
│      ▼                                                                             │
│   [Chốt A] Cổng kỹ thuật    → make lint + make test (coverage ≥80%)               │
│      │                         Bằng chứng: output thật, số coverage                │
│      ▼                                                                             │
│   [Chốt B] Cổng Hiến pháp   → 3 subagent chạy song song, đọc diff:                │
│      │                         • dod-auditor     (DoD + không lệch Hiến pháp)      │
│      │                         • security-reviewer (bí mật + cách ly tenant)       │
│      │                         • contract-guardian (adapter GDT, nếu có đụng)      │
│      ▼                                                                             │
│   [Chốt C] Không mất tính năng → đối chiếu checklist parity (mục 12b) +           │
│      │                            so kế hoạch U0–U16 (đơn vị đang làm)             │
│      ▼                                                                             │
│   [Chốt D] BÁO CÁO cho bạn  → bảng PASS/FAIL từng chốt, kèm bằng chứng.           │
│      │                         Nếu có bất kỳ FAIL → DỪNG, không mời deploy.        │
│      ▼                                                                             │
│   Nếu tất cả PASS → hỏi bạn:  "Đủ điều kiện. Gõ 'đồng ý' để deploy?"              │
│      │                                                                             │
│      ▼  (bạn gõ "đồng ý")                                                          │
└──────┼────────────────────────────────────────────────────────────────────────────┘
       │
┌──────▼─────────────────── TẦNG 2: THỰC THI DEPLOY ───────────────────────────────┐
│   Claude chạy:  push lên nhánh release → GitHub Actions job "deploy" chạy         │
│                 wrangler deploy cho 3 app (api, sync-worker, web)                  │
│                 (hoặc chạy trực tiếp wrangler deploy nếu bạn chọn đường nhanh)     │
│      │                                                                             │
│      ▼                                                                             │
│   [Chốt E] Kiểm tra sau deploy → gọi health-check 3 Worker, xác nhận sống.        │
│                                   Bằng chứng: HTTP 200 thật.                       │
└───────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Bốn chốt kiểm tra — dùng bằng chứng gì

### Chốt A — Cổng kỹ thuật (đã có sẵn, chỉ gọi lại)
- **Công cụ:** skill `verify` (đã tồn tại) → chạy `make lint` + `make test`.
- **Bằng chứng:** output thật của lệnh; con số coverage từng package (ngưỡng ≥ 80%).
- **Chặn khi:** lint đỏ, test đỏ, hoặc coverage tụt dưới 80%.

### Chốt B — Cổng Hiến pháp & Điều cấm (3 subagent đã có)
Chạy **song song** 3 subagent độc lập, mỗi cái đọc `git diff` và báo cáo:

| Subagent | Canh gác điều gì | Cờ Critical |
|---|---|---|
| `dod-auditor` | Không lệch Hiến pháp (ngăn xếp Cloudflare/TS, adapter cô lập, stateless, tenant_id, khóa tự nhiên), code chết, tài liệu | Lệch quy tắc cứng, lộ bí mật |
| `security-reviewer` | Không lưu mật khẩu thuế thô, không log token, cách ly đa tenant, xác thực endpoint | **Rò rỉ dữ liệu chéo tenant** |
| `contract-guardian` | Adapter GDT cô lập, không đoán ngầm response API thuế, **không bypass captcha**, egress T0→T1 | fetch GDT ngoài adapter, bypass captcha |

- **Bằng chứng:** báo cáo từng subagent, kèm dòng/file cụ thể.
- **Chặn khi:** bất kỳ subagent nào báo mức **Critical** (= vi phạm Hiến pháp hoặc điều cấm).

### Chốt C — Không mất tính năng + đúng kế hoạch (phần cần bổ sung mới)
Đây là phần dự án **chưa có sẵn** — cần thêm. Hai việc:

1. **Không mất tính năng cũ (regression):**
   - Bằng chứng mạnh nhất = **test cũ vẫn xanh** (đã có ở Chốt A). Test là lưới an toàn: nếu một bản mới làm hỏng tính năng cũ mà tính năng đó có test → test đỏ → Chốt A chặn.
   - Bổ sung: đối chiếu **checklist parity (mục 12b `KIEN_TRUC_VA_KE_HOACH.md`)** — subagent đọc checklist, xác nhận không có mục nào *đang "Lõi/đã xong"* bị gỡ bỏ trong diff.
   - ⚠️ **Giới hạn thành thật:** test chỉ bắt được regression ở phần *có test phủ*. Tính năng không có test thì quy trình **không đảm bảo** — cần nói rõ trong báo cáo, không hứa hão.

2. **Đúng kế hoạch U0–U16:**
   - Subagent đọc file plan của đơn vị đang làm (vd `docs/plans/U15-plan.md`) + phần "Thứ tự triển khai" trong `CLAUDE.md`, xác nhận diff thuộc đúng đơn vị đang làm, không trộn nhiều U, không lạc ngoài kế hoạch.

- **Chặn khi:** phát hiện gỡ bỏ tính năng "Lõi" đã xong, hoặc diff lạc khỏi đơn vị công việc đã khai báo.

### Chốt E — Kiểm tra sau deploy (khói/smoke test)
- Sau khi deploy, gọi endpoint health-check của 3 Worker.
- **Bằng chứng:** phản hồi HTTP 200 thật từ domain production.
- **Nếu đỏ:** báo ngay + hướng dẫn rollback (`wrangler rollback` hoặc deploy lại bản trước).

---

## 4. Các mảnh cần XÂY MỚI (khối lượng thật)

| # | Việc | Loại | Ghi chú |
|---|---|---|---|
| 1 | Slash command `/deploy-check` | File `.claude/commands/deploy-check.md` | Điều phối chốt A→D, gọi verify + 3 subagent, tổng hợp báo cáo, hỏi xác nhận |
| 2 | Subagent `regression-planner` (Chốt C) | File `.claude/agents/regression-planner.md` | Đọc checklist parity + plan U-unit, báo mất tính năng / lạc kế hoạch |
| 3 | Job `deploy` trong CI | Thêm vào `.github/workflows/ci.yml` | Chạy `wrangler deploy` 3 app; **chỉ chạy trên nhánh release + môi trường "production" có yêu cầu duyệt** |
| 4 | Cấu hình secret CI | GitHub repo settings (bạn tự làm) | `CLOUDFLARE_API_TOKEN` để CI có quyền deploy. **KHÔNG commit vào code** |
| 5 | Health-check endpoint (nếu chưa có) | Kiểm tra 3 app đã có `/health` chưa | Chốt E cần cái này |

**Lưu ý pháp lý/an toàn:** mục #4 (cấp API token cho CI) và bước bật "môi trường production có duyệt" trên GitHub là **thao tác đổi cấu hình/quyền** — theo quy tắc an toàn, **bạn tự làm**, Claude chỉ hướng dẫn.

---

## 5. Trải nghiệm thực tế (bạn sẽ thấy gì)

```
Bạn:   /deploy-check

Claude: ⏳ Chốt A (kỹ thuật)...  ✅ lint sạch · test 214/214 xanh · coverage 86%
        ⏳ Chốt B (Hiến pháp)... ✅ dod-auditor: không vi phạm
                                 ✅ security: không rò rỉ tenant, không lộ bí mật
                                 ✅ contract-guardian: adapter cô lập, không đụng captcha
        ⏳ Chốt C (tính năng)... ✅ parity: không gỡ tính năng Lõi
                                 ✅ kế hoạch: khớp U15, không trộn U khác
                                 ⚠️  Lưu ý: 2 tính năng chưa có test phủ (liệt kê) — 
                                     không đảm bảo regression ở phần này.

        ✅ ĐỦ ĐIỀU KIỆN DEPLOY. Bản này: [tóm tắt diff].
        Gõ "đồng ý" để deploy 3 Worker lên Production.

Bạn:   đồng ý

Claude: 🚀 Đang deploy... ✅ api · ✅ sync-worker · ✅ web
        Chốt E: health-check 3 Worker → 200 OK. Xong.
```

Nếu bất kỳ chốt nào FAIL, Claude **không hiện lời mời deploy** — chỉ báo chỗ hỏng kèm bằng chứng để sửa.

---

## 6. Ranh giới thành thật (không hứa quá)

- **"Không gây lỗi" = không lỗi ở phần CÓ test phủ.** Test là bằng chứng mạnh nhưng không tuyệt đối. Phần không có test, quy trình sẽ *cảnh báo* chứ không *bảo đảm*. Muốn mạnh hơn → tăng độ phủ test (đó là lý do Hiến pháp ép ≥80%).
- **Chốt B dựa vào chất lượng subagent.** Subagent đọc diff bằng suy luận, không phải công cụ tuyệt đối như test. Nó bắt được phần lớn vi phạm rõ ràng (lộ bí mật, fetch GDT ngoài adapter, thiếu tenant_id), nhưng vi phạm tinh vi vẫn có thể lọt. Đây là *lớp phòng thủ*, không phải *tường bất khả xâm phạm*.
- **Chốt kỹ thuật thật sự bất biến vẫn là hook `gate-dod.sh`** (chạy độc lập, không phụ thuộc Claude tự giác). `/deploy-check` là lớp điều phối *phía trên*, tiện dùng nhưng nên xem hook là chốt cứng cuối.

---

## 7. Đề xuất triển khai (nếu bạn duyệt)

Theo vòng lặp U-unit của dự án, nên tách thành 1 đơn vị công việc riêng (vd **U-DEPLOY**), làm theo thứ tự:

1. Viết `regression-planner` subagent (Chốt C) + test giả lập một diff "gỡ tính năng" để chứng minh nó bắt được.
2. Viết `/deploy-check` command điều phối, chạy thử ở chế độ "chỉ báo cáo, chưa deploy".
3. Thêm job `deploy` vào CI, gắn môi trường production có duyệt (bạn cấp secret + bật duyệt).
4. Chạy thử toàn trình trên một thay đổi nhỏ, vô hại, để lấy bằng chứng cả chuỗi hoạt động.
5. Review chéo + tài liệu hóa vào `CLAUDE.md` mục "Quy trình làm việc".

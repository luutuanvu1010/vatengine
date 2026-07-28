-- Kiểm chứng sức khoẻ đồng bộ — CHỈ ĐỌC, không sửa gì.
--
-- Mục đích: trả lời câu hỏi vận hành "cron 03:00 sáng nay có chạy trơn không?"
-- trước khi khôi phục cấu hình nhịp gọi GDT về giá trị gốc (biên bản
-- docs/plans/HANDOFF-phien-2026-07-27-thieu-hd-ngay-26.md mục 5).
--
-- Cách chạy (trên máy có DATABASE_URL production):
--   psql "$DATABASE_URL" -f scripts/kiem-suc-khoe-dong-bo.sql
-- hoặc lấy URL từ packages/db/.dev.vars như Makefile `migrate` vẫn làm.
--
-- Chạy bằng vai trò sở hữu bảng (bypass RLS) — đây là truy vấn vận hành toàn hệ,
-- không phải đường dữ liệu ứng dụng. KHÔNG dùng kết quả này cho tính năng nào.

\echo '=== 1. Phiên đồng bộ 24h qua, gộp theo trạng thái ==='
-- Kỳ vọng cron lành: phần lớn completed/audit; failed và can_dang_nhap_lai ~0.
SELECT trang_thai,
       loai,
       count(*)                                        AS so_phien,
       min(bat_dau)                                    AS som_nhat,
       max(coalesce(ket_thuc, bat_dau))                AS muon_nhat
FROM lan_dong_bo
WHERE bat_dau > now() - interval '24 hours'
GROUP BY trang_thai, loai
ORDER BY so_phien DESC;

\echo ''
\echo '=== 2. Thông điệp lỗi 24h qua (dấu hiệu bão 429) ==='
-- Kỳ vọng cron lành: 0 dòng, hoặc vài dòng lẻ tẻ. Nhiều dòng chứa 429 /
-- "Kìm nhịp GDT" ⇒ CHƯA được khôi phục cấu hình gốc.
SELECT left(thong_diep_loi, 120) AS loi,
       count(*)                  AS so_lan,
       max(bat_dau)              AS gan_nhat
FROM lan_dong_bo
WHERE bat_dau > now() - interval '24 hours'
  AND thong_diep_loi IS NOT NULL
GROUP BY 1
ORDER BY so_lan DESC
LIMIT 20;

\echo ''
\echo '=== 3. Chuỗi còn treo running quá 2 giờ (run mồ côi) ==='
-- Trần tuổi trong mã là 2h (TUOI_TOI_DA_CHUOI_KEO_MS). Dòng ở đây = chuỗi đã
-- chết mà chưa kịp chốt; guard bỏ qua chúng nhưng chúng làm nhiễu thống kê.
SELECT t.ten            AS tenant,
       tk.username      AS mst,
       ldb.chieu,
       to_char(ldb.tu_ngay, 'YYYY-MM')            AS ky,
       ldb.bat_dau,
       now() - ldb.bat_dau                        AS treo_bao_lau
FROM lan_dong_bo ldb
JOIN tai_khoan_thue tk ON tk.id = ldb.taikhoan_id
JOIN tenants t         ON t.id  = ldb.tenant_id
WHERE ldb.trang_thai = 'running'
  AND ldb.bat_dau < now() - interval '2 hours'
ORDER BY ldb.bat_dau;

\echo ''
\echo '=== 4. Chuỗi ĐANG chạy thật (< 2 giờ), theo tài khoản thuế ==='
-- Đây chính là con số UI hiện "Đang có x tác vụ đồng bộ chạy nền".
-- Kéo lần đầu một tài khoản mới: ~2 chuỗi / tháng (mua vào + bán ra) là BÌNH THƯỜNG.
-- Nhiều chuỗi cho CÙNG một kỳ ⇒ guard khử trùng lặp có vấn đề.
SELECT tk.username                        AS mst,
       to_char(ldb.tu_ngay, 'YYYY-MM')    AS ky,
       ldb.chieu,
       count(*)                           AS so_chuoi,
       min(ldb.bat_dau)                   AS bat_dau_som_nhat
FROM lan_dong_bo ldb
JOIN tai_khoan_thue tk ON tk.id = ldb.taikhoan_id
WHERE ldb.trang_thai = 'running'
  AND ldb.loai = 'sync'
  AND ldb.bat_dau > now() - interval '2 hours'
GROUP BY 1, 2, 3
ORDER BY so_chuoi DESC, ky;

\echo ''
\echo '=== 5. Sản lượng cron đêm qua (00:00-06:00 giờ VN = 17:00-23:00 UTC hôm trước) ==='
-- Cron nền chạy 03:00 VN (0 20 * * * UTC). Có số HĐ mới > 0 ⇒ chuỗi thực sự kéo
-- được dữ liệu, không phải chỉ chạy rồi chết.
SELECT date_trunc('hour', ldb.bat_dau AT TIME ZONE 'Asia/Ho_Chi_Minh') AS gio_vn,
       count(*)                  AS so_phien,
       sum(ldb.so_hd_moi)        AS hd_moi,
       sum(ldb.so_hd_cap_nhat)   AS hd_cap_nhat
FROM lan_dong_bo ldb
WHERE ldb.bat_dau > now() - interval '30 hours'
GROUP BY 1
ORDER BY 1;

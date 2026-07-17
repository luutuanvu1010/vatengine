// 2026-07-17 — Đồng bộ theo KHOẢNG đã lọc, ngay trong bảng điều khiển (yêu cầu chủ
// dự án). Bấm một nút → gọi CẢ HAI đường nền: (1) POST /tax-accounts/:id/backfill
// {tuNgay, denNgay} — enqueue các THÁNG còn thiếu header trong khoảng (U22); (2) POST
// /tax-accounts/:id/backfill-lines — enqueue hóa đơn ĐANG THIẾU dòng hàng (U26; đường
// đổ Hàng hóa + Số lượng cho hóa đơn đã có header từ trước). Cả hai idempotent — bấm
// lại an toàn. Tài khoản = cái còn phiên thuế; hết phiên → nhắc kết nối lại, không gọi.
import { useMutation, useQuery } from "@tanstack/react-query";
import { Alert, Button } from "../../components/ui/primitives";
import { ApiError, api } from "../../lib/apiClient";

function accountConPhien(accounts: { id: string; tokenHetHan: string | null }[]) {
  return accounts.find((a) => a.tokenHetHan && new Date(a.tokenHetHan).getTime() > Date.now());
}

export function RangeSyncPanel({ tuNgay, denNgay }: { tuNgay: string; denNgay: string }) {
  const accounts = useQuery({ queryKey: ["tax-accounts"], queryFn: () => api.listTaxAccounts() });
  const run = useMutation({
    mutationFn: async () => {
      const acc = accountConPhien(accounts.data ?? []);
      if (!acc) throw new Error("phien_thue_het_han");
      // Header các tháng thiếu TRƯỚC (tạo hóa đơn mới → tự enqueue dòng hàng kèm theo),
      // rồi quét hóa đơn cũ đang thiếu dòng hàng — phủ cả hai nguồn thiếu dữ liệu.
      const khoang = await api.backfillTaxAccount(acc.id, { tuNgay, denNgay });
      const dongHang = await api.backfillInvoiceLines(acc.id);
      return { khoang, dongHang };
    },
  });

  const loiPhien =
    run.error instanceof Error &&
    (run.error.message === "phien_thue_het_han" ||
      (run.error instanceof ApiError && run.error.status === 409));

  return (
    <div style={{ marginTop: "var(--sp-3)", display: "grid", gap: "var(--sp-2)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", flexWrap: "wrap" }}>
        <Button onClick={() => run.mutate()} disabled={run.isPending || accounts.isPending}>
          {run.isPending ? "Đang gửi yêu cầu…" : "Đồng bộ khoảng này"}
        </Button>
        <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-tertiary)" }}>
          Kéo hóa đơn + dòng hàng từ Tổng cục Thuế cho khoảng {tuNgay} → {denNgay} (chạy nền)
        </span>
      </div>
      {run.isSuccess && (
        <Alert tone="info">
          Đã xếp hàng <strong>{run.data.khoang.tongSoThang} tháng</strong> cần lấy thêm hóa đơn
          {run.data.khoang.thangCanLay.length > 0 && (
            <> ({run.data.khoang.thangCanLay.join(", ")})</>
          )}{" "}
          và <strong>{run.data.dongHang.soDaXepHang}</strong> hóa đơn cần lấy dòng hàng
          {run.data.dongHang.conLai > 0 && (
            <> (còn {run.data.dongHang.conLai} — bấm lại sau đợt này)</>
          )}
          . Hệ thống chạy nền, tôn trọng giới hạn máy chủ thuế — cột{" "}
          <strong>Hàng hóa, dịch vụ</strong> và <strong>Số lượng</strong> sẽ đầy dần trong ít phút;
          tải lại danh sách để xem.
        </Alert>
      )}
      {run.isError &&
        (loiPhien ? (
          <Alert tone="danger">
            Phiên đăng nhập thuế đã hết hạn — vui lòng <strong>kết nối lại</strong> ở trang{" "}
            <strong>Tài khoản thuế</strong> rồi bấm lại.
          </Alert>
        ) : (
          <Alert tone="danger">Không gửi được yêu cầu đồng bộ. Thử lại sau ít phút.</Alert>
        ))}
    </div>
  );
}

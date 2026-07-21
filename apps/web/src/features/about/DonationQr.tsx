import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { Button, TextField } from "../../components/ui/primitives";
import {
  ACCOUNT_NAME,
  ACCOUNT_NUMBER,
  BANK_BIN,
  BANK_NAME,
  DONATION_ADD_INFO,
  DONATION_TIERS,
} from "../../lib/donation";
import { formatMoney } from "../../lib/format";
import { buildVietQrPayload, normalizeAmount } from "../../lib/vietqr";

type Selection = number | "custom";

/**
 * Bộ chọn mức đóng góp + ô "Số khác" → sinh mã VietQR động (offline) cho đúng số tiền.
 * Chọn mức khác/nhập số khác → QR cập nhật tức thì. Mã tĩnh (không số tiền) khi "Số
 * khác" còn trống — người chuyển tự nhập.
 */
export function DonationQr() {
  const [selection, setSelection] = useState<Selection>(DONATION_TIERS[1]);
  const [custom, setCustom] = useState("");

  // Giữ số tiền dạng CHUỖI xuyên suốt (quy tắc tiền: không ép float cho input người dùng).
  const amountDigits = normalizeAmount(selection === "custom" ? custom : selection);
  const payload = buildVietQrPayload({
    bankBin: BANK_BIN,
    accountNumber: ACCOUNT_NUMBER,
    amount: amountDigits || null,
    addInfo: DONATION_ADD_INFO,
  });

  return (
    <div style={{ display: "grid", gap: "var(--sp-4)", justifyItems: "center" }}>
      <fieldset
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "var(--sp-2)",
          justifyContent: "center",
          border: "none",
          padding: 0,
          margin: 0,
          minInlineSize: "auto",
        }}
      >
        <legend className="sr-only">Chọn mức đóng góp</legend>
        {DONATION_TIERS.map((tier) => (
          <Button
            key={tier}
            variant={selection === tier ? "primary" : "secondary"}
            aria-pressed={selection === tier}
            onClick={() => setSelection(tier)}
          >
            {formatMoney(String(tier))} ₫
          </Button>
        ))}
        <Button
          variant={selection === "custom" ? "primary" : "secondary"}
          aria-pressed={selection === "custom"}
          onClick={() => setSelection("custom")}
        >
          Số khác
        </Button>
      </fieldset>

      {selection === "custom" ? (
        <div style={{ width: "100%", maxWidth: 280 }}>
          <TextField
            label="Nhập số tiền (₫)"
            inputMode="numeric"
            placeholder="Ví dụ: 200000"
            value={custom}
            onChange={(e) => setCustom(e.target.value.replace(/\D/g, "").slice(0, 13))}
          />
        </div>
      ) : null}

      <figure
        data-testid="donation-qr"
        data-payload={payload}
        style={{
          margin: 0,
          display: "grid",
          justifyItems: "center",
          gap: "var(--sp-3)",
          padding: "var(--sp-5)",
          background: "var(--surface-card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <QRCodeSVG value={payload} size={220} marginSize={2} title={`Mã QR ủng hộ ${BANK_NAME}`} />
        {/* QĐ-9 (U20) — dòng này chứa TÊN NGÂN HÀNG và SỐ TÀI KHOẢN, thứ người dùng
            phải đọc chính xác để chuyển khoản. 13px + màu tertiary là chỗ dễ nhìn nhầm
            chữ số nhất trên toàn app; đọc sai một số là tiền đi nhầm chỗ. */}
        <figcaption
          style={{
            textAlign: "center",
            fontSize: "var(--fs-base)",
            color: "var(--text-secondary)",
            lineHeight: "var(--lh-body)",
          }}
        >
          <strong style={{ color: "var(--text-primary)" }}>{BANK_NAME}</strong> · {ACCOUNT_NUMBER}
          <br />
          {ACCOUNT_NAME}
          <br />
          {amountDigits ? (
            <span style={{ color: "var(--success-700)", fontWeight: "var(--fw-semibold)" }}>
              Số tiền: {formatMoney(amountDigits)} ₫
            </span>
          ) : (
            <span>Quét rồi nhập số tiền tùy ý</span>
          )}
        </figcaption>
      </figure>
    </div>
  );
}

// Trung tâm hỗ trợ & tài liệu — a) FAQ accordion nhóm theo chủ đề, b) kênh liên hệ
// (nâng cấp từ phần "Góp ý" cũ của U16).
import { type ReactNode, useId, useState } from "react";
import { CONTACT_PHONE } from "../../lib/contact";
import { whatsappUrl, zaloUrl } from "../../lib/contactLinks";
import { FAQ } from "../../lib/faq";

function LinkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--sp-2)",
        padding: "var(--sp-3) var(--sp-5)",
        fontSize: "var(--fs-base)",
        fontWeight: "var(--fw-semibold)",
        color: "var(--text-on-brand)",
        background: "var(--brand-600)",
        border: "1px solid transparent",
        borderRadius: "var(--radius-md)",
        textDecoration: "none",
      }}
    >
      {children}
    </a>
  );
}

function FaqAccordionItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div style={{ borderBottom: "1px solid var(--border)", padding: "var(--sp-3) 0" }}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          textAlign: "left",
          background: "transparent",
          border: "none",
          padding: 0,
          font: "inherit",
          fontWeight: "var(--fw-semibold)",
          color: "var(--text-primary)",
          cursor: "pointer",
        }}
      >
        {q}
      </button>
      {open ? (
        <p
          id={panelId}
          style={{
            margin: "var(--sp-2) 0 0",
            color: "var(--text-secondary)",
            lineHeight: "var(--lh-body)",
          }}
        >
          {a}
        </p>
      ) : null}
    </div>
  );
}

const groups = [...new Set(FAQ.map((item) => item.group))];

export function SupportCenter() {
  return (
    <div style={{ display: "grid", gap: "var(--sp-6)" }}>
      <div>
        {groups.map((group) => (
          <div key={group} style={{ marginBottom: "var(--sp-4)" }}>
            <h3
              style={{
                fontSize: "var(--fs-base)",
                fontWeight: "var(--fw-bold)",
                marginBottom: "var(--sp-1)",
              }}
            >
              {group}
            </h3>
            {FAQ.filter((item) => item.group === group).map((item) => (
              <FaqAccordionItem key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
        ))}
      </div>

      <div>
        <h3 style={{ fontSize: "var(--fs-base)", fontWeight: "var(--fw-bold)" }}>
          Kênh liên hệ hỗ trợ
        </h3>
        <p
          style={{
            color: "var(--text-secondary)",
            lineHeight: "var(--lh-body)",
            margin: "var(--sp-2) 0 0",
          }}
        >
          Mọi góp ý, báo lỗi hay đề xuất tính năng đều được đón nhận. Nhắn trực tiếp cho nhóm phát
          triển:
        </p>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--sp-3)",
            marginTop: "var(--sp-4)",
          }}
        >
          <LinkButton href={zaloUrl(CONTACT_PHONE)}>Góp ý qua Zalo</LinkButton>
          <LinkButton href={whatsappUrl(CONTACT_PHONE)}>Góp ý qua WhatsApp</LinkButton>
        </div>
        <p style={{ color: "var(--text-secondary)", margin: "var(--sp-4) 0 0" }}>
          <strong>Giờ hỗ trợ: 08:00 – 17:00</strong>
        </p>
        <div style={{ marginTop: "var(--sp-3)" }}>
          <strong>Cách báo lỗi hiệu quả</strong>
          <ul
            style={{
              margin: "var(--sp-2) 0 0",
              paddingLeft: "var(--sp-5)",
              color: "var(--text-secondary)",
            }}
          >
            <li>Ảnh chụp màn hình lúc gặp lỗi.</li>
            <li>Mã số thuế đang thao tác.</li>
            <li>Thời điểm xảy ra.</li>
            <li>Thao tác đang làm khi gặp lỗi.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

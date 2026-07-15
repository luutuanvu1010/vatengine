// S5 — Kết nối tài khoản thuế (GDT). Luồng: Đăng ký MST → Ủy quyền → Nhập captcha →
// Đăng nhập. A2 (GET /tax-accounts) khôi phục trạng thái (stepper + panel token) khi tải
// lại. RÀNG BUỘC (BINDING_MAP §5): captcha người TỰ nhập (không tự giải); mật khẩu thuế
// KHÔNG lưu client, chỉ gửi thẳng bước login; 409 = chưa ủy quyền → chặn login.
// BẢO MẬT: captcha SVG render qua <img> data-URI (KHÔNG dangerouslySetInnerHTML — chặn
// script nhúng trong SVG).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Alert, Button, Card, Loading, TextField } from "../../components/ui/primitives";
import { ApiError, api } from "../../lib/apiClient";
import { formatDateVN } from "../../lib/format";
import type { TaxAccountView } from "../../types/api";

const STEPS = ["Đăng ký MST", "Ủy quyền", "Nhập captcha", "Đăng nhập"];

function Stepper({ current }: { current: number }) {
  return (
    <ol style={{ display: "flex", gap: "var(--sp-3)", listStyle: "none", padding: 0, margin: 0 }}>
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
            <span
              style={{
                width: 24,
                height: 24,
                borderRadius: "var(--radius-full)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "var(--fs-xs)",
                fontWeight: "var(--fw-bold)",
                color: done || active ? "#fff" : "var(--text-tertiary)",
                background: done
                  ? "var(--success-600)"
                  : active
                    ? "var(--brand-600)"
                    : "var(--surface-muted)",
              }}
            >
              {done ? "✓" : i + 1}
            </span>
            <span
              style={{
                fontSize: "var(--fs-sm)",
                color: active ? "var(--brand-700)" : "var(--text-tertiary)",
                fontWeight: active ? "var(--fw-semibold)" : "var(--fw-regular)",
              }}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function maskMst(mst: string): string {
  if (mst.length <= 4) return mst;
  return mst.slice(0, 4) + "x".repeat(mst.length - 4);
}

function RegisterForm({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState("");
  const [loai, setLoai] = useState<"chinh" | "con">("chinh");
  const m = useMutation({
    mutationFn: () => api.registerTaxAccount(username, loai),
    onSuccess: onDone,
  });
  return (
    <Card>
      <h2 style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-bold)" }}>Đăng ký mã số thuế</h2>
      <div style={{ display: "grid", gap: "var(--sp-3)", marginTop: "var(--sp-3)", maxWidth: 360 }}>
        <TextField
          label="Mã số thuế (MST)"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <label
          style={{
            display: "grid",
            gap: "var(--sp-1)",
            fontSize: "var(--fs-sm)",
            color: "var(--text-secondary)",
            fontWeight: "var(--fw-semibold)",
          }}
        >
          Loại
          <select
            value={loai}
            onChange={(e) => setLoai(e.target.value as "chinh" | "con")}
            style={{
              padding: "var(--sp-3)",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
            }}
          >
            <option value="chinh">Chính</option>
            <option value="con">Con</option>
          </select>
        </label>
        <Button onClick={() => m.mutate()} disabled={!username || m.isPending}>
          {m.isPending ? "Đang đăng ký…" : "Đăng ký"}
        </Button>
        {m.isError ? (
          <Alert tone="danger">Không đăng ký được. Kiểm tra MST và thử lại.</Alert>
        ) : null}
      </div>
    </Card>
  );
}

function AuthorizeStep({ account, onDone }: { account: TaxAccountView; onDone: () => void }) {
  const m = useMutation({
    mutationFn: () => api.authorizeTaxAccount(account.id),
    onSuccess: onDone,
  });
  return (
    <Card>
      <h2 style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-bold)" }}>Ủy quyền truy cập</h2>
      <p style={{ color: "var(--text-secondary)", marginTop: "var(--sp-2)" }}>
        Xác nhận ủy quyền cho VATEngine đăng nhập tài khoản thuế MST{" "}
        <strong>{maskMst(account.username)}</strong> để đồng bộ hóa đơn (theo Nghị định
        13/2023/NĐ-CP). Bạn có thể thu hồi bất cứ lúc nào.
      </p>
      <div style={{ marginTop: "var(--sp-3)" }}>
        <Button onClick={() => m.mutate()} disabled={m.isPending}>
          {m.isPending ? "Đang ghi nhận…" : "Tôi đồng ý ủy quyền"}
        </Button>
      </div>
      {m.isError ? <Alert tone="danger">Không ghi nhận được ủy quyền. Thử lại.</Alert> : null}
    </Card>
  );
}

function LoginStep({ account, onDone }: { account: TaxAccountView; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [cvalue, setCvalue] = useState("");
  const captcha = useQuery({
    queryKey: ["captcha", account.id],
    queryFn: () => api.getCaptcha(account.id),
    staleTime: 0,
    gcTime: 0,
  });
  const login = useMutation({
    mutationFn: () => {
      const key = captcha.data?.key ?? "";
      return api.loginTaxAccount(account.id, password, key, cvalue);
    },
    onSuccess: () => {
      setPassword("");
      setCvalue("");
      onDone();
    },
    onError: () => {
      // Sai captcha/mật khẩu (401) → xin captcha mới; không giữ gì.
      setCvalue("");
      captcha.refetch();
    },
  });

  const loginError =
    login.error instanceof ApiError
      ? login.error.status === 409
        ? "Chưa ủy quyền — vui lòng ủy quyền trước."
        : "Sai captcha hoặc mật khẩu. Vui lòng nhập captcha mới."
      : null;

  return (
    <Card>
      <h2 style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-bold)" }}>
        Nhập captcha để đăng nhập GDT
      </h2>
      <p
        style={{
          color: "var(--text-tertiary)",
          fontSize: "var(--fs-sm)",
          marginTop: "var(--sp-1)",
        }}
      >
        Hệ thống <strong>không tự giải captcha</strong>. Vui lòng nhập chính xác ký tự trong ảnh —
        MST {maskMst(account.username)}.
      </p>
      <div style={{ display: "grid", gap: "var(--sp-3)", marginTop: "var(--sp-3)", maxWidth: 420 }}>
        <div style={{ display: "flex", gap: "var(--sp-3)", alignItems: "center" }}>
          {captcha.isPending ? (
            <Loading label="Đang tải captcha…" />
          ) : captcha.isError ? (
            <Alert tone="danger">Không tải được captcha.</Alert>
          ) : (
            <img
              alt="Ảnh captcha — nhập ký tự bạn nhìn thấy"
              src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(captcha.data.content)}`}
              style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                height: 64,
              }}
            />
          )}
          <button
            type="button"
            onClick={() => captcha.refetch()}
            aria-label="Đổi captcha khác"
            style={{
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              background: "var(--surface-card)",
              cursor: "pointer",
              padding: "var(--sp-2)",
            }}
          >
            ↻
          </button>
        </div>
        <TextField
          label="Mật khẩu thuế"
          type="password"
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <TextField label="Mã captcha" value={cvalue} onChange={(e) => setCvalue(e.target.value)} />
        <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-disabled)" }}>
          Không phân biệt hoa/thường · Mật khẩu thuế không lưu tại trình duyệt.
        </div>
        {loginError ? <Alert tone="danger">{loginError}</Alert> : null}
        <Button onClick={() => login.mutate()} disabled={!password || !cvalue || login.isPending}>
          {login.isPending ? "Đang đăng nhập…" : "Đăng nhập GDT"}
        </Button>
      </div>
    </Card>
  );
}

// Trạng thái ĐÃ KẾT NỐI (token còn hạn): báo thành công rõ ràng + CTA Đồng bộ ngay.
// KHÔNG ép lại form captcha (đỡ gây rối); muốn lấy phiên mới thì bấm "Kết nối lại".
function ConnectedPanel({ account, onDone }: { account: TaxAccountView; onDone: () => void }) {
  const [reauth, setReauth] = useState(false);
  const sync = useMutation({ mutationFn: () => api.syncTaxAccount(account.id) });
  return (
    <>
      <Card>
        <div style={{ display: "grid", gap: "var(--sp-3)" }}>
          <Alert tone="success">
            <strong>Đã kết nối mã số thuế {maskMst(account.username)} thành công.</strong> VATEngine
            đang giữ phiên đăng nhập Tổng cục Thuế cho MST này.
          </Alert>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>
            Bấm <strong>Đồng bộ ngay</strong> để kéo hóa đơn mua vào &amp; bán ra mới nhất về.
          </p>
          <div
            style={{ display: "flex", gap: "var(--sp-3)", alignItems: "center", flexWrap: "wrap" }}
          >
            <Button onClick={() => sync.mutate()} disabled={sync.isPending}>
              {sync.isPending ? "Đang gửi yêu cầu…" : "Đồng bộ ngay"}
            </Button>
            {account.tokenHetHan && (
              <span style={{ fontSize: "var(--fs-sm)", color: "var(--text-tertiary)" }}>
                Phiên còn hiệu lực đến {formatDateVN(account.tokenHetHan, true)} (giờ VN)
              </span>
            )}
          </div>
          {sync.isSuccess && (
            <Alert tone="info">
              Đã gửi yêu cầu đồng bộ kỳ {sync.data.period}. Hóa đơn sẽ xuất hiện ở{" "}
              <strong>Danh sách hóa đơn</strong> sau ít phút (chạy nền).
            </Alert>
          )}
          {sync.isError && (
            <Alert tone="danger">
              {sync.error instanceof ApiError && sync.error.status === 409
                ? "Phiên đã hết hạn — vui lòng kết nối lại."
                : "Không gửi được yêu cầu đồng bộ. Thử lại sau ít phút."}
            </Alert>
          )}
          <button
            type="button"
            onClick={() => setReauth((v) => !v)}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-secondary)",
              cursor: "pointer",
              padding: 0,
              fontSize: "var(--fs-sm)",
              textDecoration: "underline",
              justifySelf: "start",
            }}
          >
            {reauth ? "Ẩn kết nối lại" : "Kết nối lại (lấy phiên mới)"}
          </button>
        </div>
      </Card>
      {reauth && (
        <LoginStep
          account={account}
          onDone={() => {
            setReauth(false);
            onDone();
          }}
        />
      )}
    </>
  );
}

export function TaxAccountsPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["tax-accounts"], queryFn: () => api.listTaxAccounts() });
  const refresh = () => qc.invalidateQueries({ queryKey: ["tax-accounts"] });

  const account = list.data?.[0] ?? null;
  // ĐÃ KẾT NỐI = đã ủy quyền + có token CÒN HẠN. Khi đó KHÔNG hiện lại form captcha.
  const connected = !!(
    account?.uyQuyenLuc &&
    account.tokenHetHan &&
    new Date(account.tokenHetHan).getTime() > Date.now()
  );
  const step = !account ? 0 : !account.uyQuyenLuc ? 1 : connected ? 4 : 2;

  return (
    <div style={{ display: "grid", gap: "var(--sp-4)" }}>
      <PageHeader
        title="Kết nối tài khoản thuế"
        subtitle="Đăng nhập Tổng cục Thuế để đồng bộ hóa đơn"
      />
      <Stepper current={step} />

      {list.isPending ? (
        <Loading />
      ) : !account ? (
        <RegisterForm onDone={refresh} />
      ) : !account.uyQuyenLuc ? (
        <AuthorizeStep account={account} onDone={refresh} />
      ) : connected ? (
        <ConnectedPanel account={account} onDone={refresh} />
      ) : (
        <>
          {account.tokenHetHan && (
            <Alert tone="warning">
              Phiên đăng nhập Tổng cục Thuế đã hết hạn ({formatDateVN(account.tokenHetHan, true)}).
              Đăng nhập lại để tiếp tục đồng bộ.
            </Alert>
          )}
          <LoginStep account={account} onDone={refresh} />
        </>
      )}
    </div>
  );
}

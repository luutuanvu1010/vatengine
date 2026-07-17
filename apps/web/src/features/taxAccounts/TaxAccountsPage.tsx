// S5 — Kết nối tài khoản thuế (GDT). Luồng (U23-D): MST CỐ ĐỊNH (auto từ tenant, không nhập
// tay) → Ủy quyền → Nhập captcha + mật khẩu → Đăng nhập; có Ngắt kết nối (xóa token, giữ MST).
// A2 (GET /tax-accounts) khôi phục trạng thái (stepper + panel token) khi tải lại. RÀNG BUỘC
// (BINDING_MAP §5): captcha người TỰ nhập (không tự giải); mật khẩu thuế KHÔNG lưu client, chỉ
// gửi thẳng bước login; 409 = chưa ủy quyền → chặn login.
// BẢO MẬT: captcha SVG render qua <img> data-URI (KHÔNG dangerouslySetInnerHTML — chặn
// script nhúng trong SVG).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Alert, Button, Card, Loading, TextField } from "../../components/ui/primitives";
import { ApiError, api } from "../../lib/apiClient";
import { formatDateVN } from "../../lib/format";
import type { TaxAccountView } from "../../types/api";
import { useAuth } from "../auth/auth-context";

// U23-D4 — MST cố định theo doanh nghiệp (không nhập tay); backend auto-gán username=MST.
const STEPS = ["Mã số thuế", "Ủy quyền", "Nhập captcha + mật khẩu", "Đăng nhập"];

// U23-D — module "Thêm tài khoản con" ẩn sau cờ, MẶC ĐỊNH TẮT (chỉ dựng nền). Bật ⇒ hiện
// khối thêm tài khoản con (validate tiền tố MST phía client; backend cũng validate ở D2).
export const SUB_ACCOUNT_UI_ENABLED = false;

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

// U23-D4 — MST cố định (read-only, che) từ /me (auth context); KHÔNG ô nhập MST. Tài khoản
// chính: backend auto-gán username = MST gốc (D2) → đăng ký không gửi username.
function RegisterForm({ mst, onDone }: { mst: string | null; onDone: () => void }) {
  const m = useMutation({
    mutationFn: () => api.registerTaxAccount(),
    onSuccess: onDone,
  });
  if (!mst) {
    return (
      <Card>
        <Alert tone="warning">
          Doanh nghiệp <strong>chưa khai mã số thuế</strong>. Vui lòng cập nhật MST ở{" "}
          <strong>Cài đặt chung</strong> trước khi kết nối Tổng cục Thuế.
        </Alert>
      </Card>
    );
  }
  return (
    <Card>
      <h2 style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-bold)" }}>Kết nối mã số thuế</h2>
      <div style={{ display: "grid", gap: "var(--sp-3)", marginTop: "var(--sp-3)", maxWidth: 360 }}>
        <div>
          <div style={{ color: "var(--text-tertiary)", fontSize: "var(--fs-sm)" }}>
            Mã số thuế (cố định theo doanh nghiệp)
          </div>
          <div
            style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-bold)" }}
            className="tabular"
          >
            {maskMst(mst)}
          </div>
        </div>
        <Button onClick={() => m.mutate()} disabled={m.isPending}>
          {m.isPending ? "Đang kết nối…" : "Kết nối tài khoản thuế"}
        </Button>
        {m.isError ? <Alert tone="danger">Không kết nối được. Thử lại sau ít phút.</Alert> : null}
      </div>
    </Card>
  );
}

// U23-D — Khối "Thêm tài khoản con" (dựng nền, ẩn sau cờ SUB_ACCOUNT_UI_ENABLED). Validate
// tiền tố MST gốc phía client (backend validate lại ở D2). Chỉ render khi cờ bật.
export function SubAccountBlock({ mst, onDone }: { mst: string; onDone: () => void }) {
  const [username, setUsername] = useState("");
  const valid = username.length > mst.length && username.startsWith(mst);
  const m = useMutation({
    mutationFn: () => api.registerTaxAccount({ loai: "con", username }),
    onSuccess: onDone,
  });
  return (
    <Card>
      <h3 style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-bold)" }}>Thêm tài khoản con</h3>
      <div style={{ display: "grid", gap: "var(--sp-3)", marginTop: "var(--sp-3)", maxWidth: 360 }}>
        <TextField
          label={`Mã số thuế nhánh (bắt đầu bằng ${maskMst(mst)})`}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <Button onClick={() => m.mutate()} disabled={!valid || m.isPending}>
          {m.isPending ? "Đang thêm…" : "Thêm tài khoản con"}
        </Button>
        {username && !valid ? (
          <Alert tone="warning">Mã số thuế nhánh phải bắt đầu bằng MST gốc của doanh nghiệp.</Alert>
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

// Lỗi "Đồng bộ ngay" → thông báo theo status. 503 `sync_busy` (Queue 429 — hệ thống
// quá tải do enqueue đồng thời nhiều tenant, sự cố 2026-07-17) KHÁC lỗi chung: báo rõ
// đang quá tải + mốc thử lại, tránh người dùng tưởng hỏng vĩnh viễn.
function syncErrorStatus(err: unknown): number | undefined {
  return err instanceof ApiError ? err.status : undefined;
}
function syncErrorMessage(err: unknown): string {
  const status = syncErrorStatus(err);
  if (status === 409) return "Phiên đã hết hạn — vui lòng kết nối lại.";
  if (status === 503)
    return "Hệ thống đang quá tải do yêu cầu đồng thời từ nhiều doanh nghiệp, vui lòng thử lại sau 10 phút.";
  return "Không gửi được yêu cầu đồng bộ. Thử lại sau ít phút.";
}

// Trạng thái ĐÃ KẾT NỐI (token còn hạn): báo thành công rõ ràng + CTA Đồng bộ ngay.
// KHÔNG ép lại form captcha (đỡ gây rối); muốn lấy phiên mới thì bấm "Kết nối lại".
function ConnectedPanel({ account, onDone }: { account: TaxAccountView; onDone: () => void }) {
  const [reauth, setReauth] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const sync = useMutation({ mutationFn: () => api.syncTaxAccount(account.id) });
  // U23-D4 — Ngắt kết nối (gọi D3): xóa token đã lưu, GIỮ MST. Có bước xác nhận.
  const disconnect = useMutation({
    mutationFn: () => api.disconnectTaxAccount(account.id),
    onSuccess: () => {
      setConfirmDisconnect(false);
      onDone();
    },
  });
  const linkBtn: React.CSSProperties = {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 0,
    fontSize: "var(--fs-sm)",
    textDecoration: "underline",
    justifySelf: "start",
  };
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
            <Alert tone={syncErrorStatus(sync.error) === 503 ? "warning" : "danger"}>
              {syncErrorMessage(sync.error)}
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

          {confirmDisconnect ? (
            <div style={{ display: "grid", gap: "var(--sp-2)", justifyItems: "start" }}>
              <span style={{ fontSize: "var(--fs-sm)", color: "var(--text-secondary)" }}>
                Ngắt kết nối sẽ xóa phiên đăng nhập Tổng cục Thuế đã lưu (giữ MST). Xác nhận?
              </span>
              <div style={{ display: "flex", gap: "var(--sp-3)", alignItems: "center" }}>
                <Button onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
                  {disconnect.isPending ? "Đang ngắt…" : "Xác nhận ngắt kết nối"}
                </Button>
                <button
                  type="button"
                  onClick={() => setConfirmDisconnect(false)}
                  style={{ ...linkBtn, color: "var(--text-secondary)" }}
                >
                  Hủy
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDisconnect(true)}
              style={{ ...linkBtn, color: "var(--danger-600)" }}
            >
              Ngắt kết nối
            </button>
          )}
          {disconnect.isError ? (
            <Alert tone="danger">Không ngắt kết nối được. Thử lại.</Alert>
          ) : null}
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
  const { me } = useAuth();
  // MST cố định của doanh nghiệp từ /me (auth context — không nhập tay). Rỗng → chưa khai MST.
  const mst = me?.mst ? me.mst : null;
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
        <RegisterForm mst={mst} onDone={refresh} />
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

      {/* U23-D — Khối "Thêm tài khoản con": dựng nền, ẩn sau cờ (mặc định TẮT). */}
      {SUB_ACCOUNT_UI_ENABLED && account && mst ? (
        <SubAccountBlock mst={mst} onDone={refresh} />
      ) : null}
    </div>
  );
}

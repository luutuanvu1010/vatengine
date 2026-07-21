import type { GdtTransport } from "@vat/gdt-client";
import type { VatSyncQueueMessage } from "@vat/sync";
// Kiểu dùng chung cho Worker API (U6). Tầng ứng dụng PHI TRẠNG THÁI (mục 11).
import type { TablesRelationalConfig } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { BackfillDef } from "./backfillTracker";
import type { LockGate, LoginLockEnv } from "./loginLimiter";
import type { Role } from "./rbac";
import type { SignupGate, SignupLimitEnv } from "./signupLimiter";

export interface Env extends LoginLockEnv, SignupLimitEnv {
  ENVIRONMENT?: string;
  // Postgres qua Hyperdrive (ADR-0001). `.connectionString` dùng để mở kết nối pg.
  HYPERDRIVE: Hyperdrive;
  // Khóa ký JWT NỘI BỘ của SaaS (KHÔNG phải token thuế). Workers Secret — security.md.
  JWT_SECRET: string;
  // U18 — Khóa ký token SUPER-ADMIN. PHẢI khác `JWT_SECRET`: đây là lớp tách chính giữa
  // miền khách và miền quản trị (adminAuth.ts). Optional ở kiểu vì môi trường chưa cấu
  // hình vẫn phải khởi chạy được — nhưng khi thiếu/trùng thì mọi route /admin/* trả 503
  // (requireSuperAdmin), KHÔNG chạy tiếp với một lớp phòng thủ duy nhất.
  ADMIN_JWT_SECRET?: string;
  // R2: lưu file kết xuất (U7) — không giữ file lớn trong RAM Worker (ADR-0001).
  RAW: R2Bucket;
  // U14 — KEK mã hóa token thuế tại nghỉ (base64 32 byte). Workers Secret (security.md).
  TOKEN_KEK: string;
  // Hàng đợi đồng bộ nền — producer cho "Đồng bộ ngay" (POST /tax-accounts/:id/sync)
  // và backfill dòng hàng U26 (POST /tax-accounts/:id/backfill-lines, message
  // `kind:"detail"`). Optional: chỉ có ở production; dev/test tiêm qua makeEnv.
  SYNC_QUEUE?: Queue<VatSyncQueueMessage>;
  // Sự cố Queue 429 (2026-07-17) — nhịp giãn (ms) GIỮA các lô sendBatch khi backfill
  // dòng hàng enqueue hàng loạt, giữ tốc độ ghi dưới trần 5.000 msg/giây/queue. Var
  // wrangler (KHÔNG nhạy cảm); bỏ trống → mặc định queueEnqueue.ts. "0" → tắt (test).
  BACKFILL_LINES_PACE_MS?: string;
  // H-A.5a — số vòng PBKDF2 cho hash MỚI (var wrangler, không nhạy cảm). Không đặt →
  // DEFAULT 100k (an toàn Free). Đặt "600000" khi nâng Paid (H-A.3) để đạt OWASP.
  PBKDF2_ITERATIONS?: string;
  // H-A.5b — Durable Object khóa đăng nhập per-account (lockout). Optional: binding
  // production; test tiêm getLoginLimiter giả. Thiếu → fail-open (login vẫn chạy; WAF
  // per-IP + timing/audit vẫn bảo vệ).
  LOGIN_LIMITER?: DurableObjectNamespace;
  // U22 — Durable Object theo dõi backfill (1 DO / backfillId). Optional: binding
  // production; thiếu → producer backfill (B5) trả 503 (không fail-open — không tracker
  // thì không theo dõi tiến độ được).
  BACKFILL_TRACKER?: DurableObjectNamespace;
  // U17b (QĐ-2) — Durable Object đếm lượt đăng ký công khai theo IP (chống lạm dụng cổng
  // /dang-ky). Optional: binding production; test tiêm getSignupLimiter giả. Thiếu →
  // fail-open (đăng ký vẫn chạy; WAF per-IP ở edge vẫn còn một lớp bảo vệ).
  SIGNUP_LIMITER?: DurableObjectNamespace;
}

// Trích từ JWT nội bộ (U6/U8): `tenantId` để lọc + RLS; `role` (vai RBAC, U8) để
// requireRole gác route. Cả hai do requireTenant xác minh và đặt vào context.
export type AppEnv = {
  Bindings: Env;
  // `userId` optional có chủ ý — xem chú thích tại auth.ts: token phát trước U18 không
  // mang `sub`. Route cần nó phải tự kiểm, không được giả định luôn có.
  Variables: { tenantId: string; role: Role; userId?: string };
};

// U18 — Context của route `/admin/*`. TÁCH HẲN khỏi AppEnv, và đó là chủ ý: `Variables`
// ở đây KHÔNG có `tenantId`, nên bất kỳ code nào trong nhánh admin lỡ viết `c.get(
// "tenantId")` sẽ hỏng ở `tsc` chứ không âm thầm nhận `undefined` rồi dựng ra một truy
// vấn thiếu điều kiện lọc tenant. Ranh giới cách ly được ép bằng KIỂU, không chỉ bằng ý
// thức người viết. `adminId` = `sub` của token admin, dùng làm `nguoi_thuc_hien` trong
// audit_log_admin.
export type AdminEnv = {
  Bindings: Env;
  Variables: { adminId: string };
};

// Db route dùng: một PgDatabase bất kỳ (pg/Hyperdrive khi chạy; PGlite khi test).
// Query fns của @vat/query là generic nên nhận lại kiểu này rồi suy ra tham số cụ thể.
export type AnyDb = PgDatabase<PgQueryResultHKT, Record<string, unknown>, TablesRelationalConfig>;

// Vòng đời một kết nối cho MỘT request: mở → dùng → `close()` (finally). Stateless.
export interface DbHandle {
  db: AnyDb;
  close: () => Promise<void>;
}

// Trừu tượng lưu trữ đối tượng cho kết xuất (U7). Production = R2; test = R2 giả trong
// bộ nhớ (tiêm qua AppDeps) để integration test đi qua route thật, offline.
export interface StorageHandle {
  put: (key: string, body: Uint8Array | ReadableStream<Uint8Array>) => Promise<void>;
  get: (key: string) => Promise<Uint8Array | null>;
}

// H-A.5b — client gọi Durable Object khóa đăng nhập theo key (email chuẩn hóa). Production
// gọi DO thật; test tiêm giả (in-memory dùng logic thuần). check() TRƯỚC khi làm DB.
export interface LoginLimiterClient {
  check: () => Promise<LockGate>;
  recordFailure: () => Promise<void>;
  recordSuccess: () => Promise<void>;
}

// U22 — client gọi Durable Object tracker backfill theo backfillId. Production gọi DO
// thật; test tiêm giả. `init` store-once (idempotent); `get` kiểm phạm vi tenant (def
// tenant khác → null, như 404). Tiến độ từng tháng suy từ lan_dong_bo ở tầng GET (B6).
export interface BackfillTrackerClient {
  init: (def: BackfillDef) => Promise<{ def: BackfillDef; created: boolean }>;
  get: (tenantId: string) => Promise<BackfillDef | null>;
}

// U17b (QĐ-2, Finding 1 — TOCTOU) — kết quả một lượt kiểm+ghi NGUYÊN TỬ (checkAndRecord()).
// `token` (= nowMs DO dùng để ghi) CHỈ có khi `gate.chan === false` (có ghi thật) — dùng để
// refund() ĐÚNG một lượt cụ thể nếu request sau đó lộ ra là lỗi HẠ TẦNG của hệ thống (không
// phải hành vi của người gọi — xem dangKy.ts).
export interface SignupCheckAndRecordResult {
  gate: SignupGate;
  token?: number;
}

// U17b (QĐ-2) — client gọi Durable Object đếm lượt đăng ký công khai theo IP. Production
// gọi DO thật; test tiêm giả (in-memory dùng logic thuần).
//
// F1 (2026-07-20, TOCTOU) — TRƯỚC bản vá: check() + record() là HAI round-trip DO RIÊNG,
// với việc DB thật xen giữa ⇒ N request đồng thời cùng IP đều lọt qua check() trước khi
// request đầu kịp record() (đo được 12/12 lọt ngưỡng 3, xem RED-PROOF trong dangKy.test.ts).
// checkAndRecord() gộp kiểm+ghi vào MỘT round-trip DO nguyên tử — DO chỉ tuần tự hoá TỪNG
// fetch() riêng lẻ nên gộp làm một fetch() duy nhất khép được lỗ hổng. Một request đã biết
// bị chặn KHÔNG ghi thêm (không thổi phồng cửa sổ — xử lý bên trong checkAndRecordSignup).
//
// refund() hoàn lại lượt vừa ghi CHỈ khi request thất bại vì lỗi HẠ TẦNG của hệ thống (vd DB
// mất kết nối giữa chừng) — KHÔNG dùng cho 4xx nghiệp vụ hay 409 trùng lặp (những ca đó VẪN
// phải tính vào quota, đúng thiết kế "đếm mọi lượt kể cả sẽ thất bại sau ở tầng validate" đã
// chốt — validate rẻ không được là đường né limiter). KHÔNG tái dùng LoginLimiterClient
// (record() đơn nhất, không tách failure/success vì SignupLimiter đếm mọi kết quả, kể cả
// thành công — 1000 tenant rác thành công vẫn là lạm dụng, KHÔNG có success-reset).
export interface SignupLimiterClient {
  checkAndRecord: () => Promise<SignupCheckAndRecordResult>;
  refund: (token: number) => Promise<void>;
}

// Tiêm phụ thuộc để test đi qua route thật với PGlite + R2 giả (không cần binding thật).
export interface AppDeps {
  getDb: (env: Env) => Promise<DbHandle>;
  getStorage: (env: Env) => StorageHandle;
  // U14 — đường ra GDT (getCaptcha/authenticate). Production = createDirectCfTransport();
  // test tiêm transport giả (không mạng). Cô lập adapter (gdt-adapter.md).
  getTransport: (env: Env) => GdtTransport;
  // H-A.5b — khóa đăng nhập per-account (lockout). key = email chuẩn hóa.
  getLoginLimiter: (env: Env, key: string) => LoginLimiterClient;
  // U22 — tracker backfill theo backfillId (DO thật ở production; test tiêm giả).
  getBackfillTracker: (env: Env, backfillId: string) => BackfillTrackerClient;
  // U17b (QĐ-2) — đếm lượt đăng ký công khai theo IP. key = IP nguồn. Route /dang-ky
  // (Task 5) tiêu thụ; KHÔNG hiện thực ở đây.
  getSignupLimiter: (env: Env, key: string) => SignupLimiterClient;
}

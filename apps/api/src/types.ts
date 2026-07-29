import type { GdtTransport } from "@vat/gdt-client";
import type { VatSyncQueueMessage } from "@vat/sync";
// Kiểu dùng chung cho Worker API (U6). Tầng ứng dụng PHI TRẠNG THÁI (mục 11).
import type { TablesRelationalConfig } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { BackfillDef } from "./backfillTracker";
import type { EmailTransport } from "./email/types";
import type { Role } from "./rbac";
import type { ThongTinDangKyMoi } from "./thongBao/telegram";

export interface Env {
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
  // U33 — Secret key của Cloudflare Turnstile, dùng để xác minh token phía MÁY CHỦ.
  // Optional ở kiểu vì môi trường chưa cấu hình vẫn phải khởi chạy được — nhưng khi
  // thiếu thì `/dang-ky` và `/auth/login` trả 503 (FAIL-CLOSED). Sau QĐ-11, Turnstile là
  // lớp bảo vệ duy nhất còn lại ở tầng ứng dụng nên không được fail-open.
  TURNSTILE_SECRET_KEY?: string;
  // U34b (ADR-0007) — Gửi thư qua Amazon SES. Cả bốn optional: thiếu thì đường thư TẮT và
  // `taoEmailTransport` trả về transport luôn từ chối với lý do `chua_cau_hinh`. Hai khoá
  // AWS là BÍ MẬT (`wrangler secret put`); IAM user phải CHỈ có quyền `ses:SendEmail` —
  // khoá rộng quyền rò ra từ Worker thì thiệt hại vượt xa phạm vi email. AWS_REGION và
  // EMAIL_FROM không nhạy cảm, khai ở "vars" được.
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  AWS_REGION?: string;
  EMAIL_FROM?: string;
  // U34c — Địa chỉ gốc của SPA khách, dùng dựng liên kết trong thư. Không nhạy cảm.
  URL_WEB?: string;
  // U34a — Báo super-admin khi có đăng ký mới. CẢ BA optional và thiếu thì thông báo
  // TẮT (fail-silent) — ngược chiều TURNSTILE_SECRET_KEY ở trên, có chủ ý: captcha bảo vệ
  // hệ thống nên phải fail-closed, còn thông báo chỉ báo cho một con người nên không được
  // phép chặn đăng ký của khách khi bot Telegram chết. Token là bí mật (`wrangler secret
  // put`); URL_CONG_ADMIN công khai nên khai ở "vars" cũng được.
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  URL_CONG_ADMIN?: string;
  // R2: lưu file kết xuất (U7) — không giữ file lớn trong RAM Worker (ADR-0001).
  RAW: R2Bucket;
  // U37b — bucket CÔNG KHAI (docs.tourdao.vn). Chỉ chứa gói ZIP đã phát hành; KHÔNG
  // bao giờ ghi hồ sơ gốc hay file kết xuất của tenant vào đây.
  CHIA_SE: R2Bucket;
  /** Gốc URL công khai của bucket chia sẻ. Phải khớp tên miền đã gắn ở Gói 3. */
  URL_CHIA_SE?: string;
  /** Gốc URL đường tải công khai `/tai/<token>` (U37c). Mặc định miền ứng dụng. */
  URL_TAI?: string;
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
  // U22 — Durable Object theo dõi backfill (1 DO / backfillId). Optional: binding
  // production; thiếu → producer backfill (B5) trả 503 (không fail-open — không tracker
  // thì không theo dõi tiến độ được).
  BACKFILL_TRACKER?: DurableObjectNamespace;
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

// U22 — client gọi Durable Object tracker backfill theo backfillId. Production gọi DO
// thật; test tiêm giả. `init` store-once (idempotent); `get` kiểm phạm vi tenant (def
// tenant khác → null, như 404). Tiến độ từng tháng suy từ lan_dong_bo ở tầng GET (B6).
export interface BackfillTrackerClient {
  init: (def: BackfillDef) => Promise<{ def: BackfillDef; created: boolean }>;
  get: (tenantId: string) => Promise<BackfillDef | null>;
}

// Tiêm phụ thuộc để test đi qua route thật với PGlite + R2 giả (không cần binding thật).
export interface AppDeps {
  getDb: (env: Env) => Promise<DbHandle>;
  getStorage: (env: Env) => StorageHandle;
  // U14 — đường ra GDT (getCaptcha/authenticate). Production = createDirectCfTransport();
  // test tiêm transport giả (không mạng). Cô lập adapter (gdt-adapter.md).
  getTransport: (env: Env) => GdtTransport;
  // U22 — tracker backfill theo backfillId (DO thật ở production; test tiêm giả).
  getBackfillTracker: (env: Env, backfillId: string) => BackfillTrackerClient;
  // U34a — báo super-admin khi có đăng ký mới. Tiêm qua deps (không gọi thẳng module) để
  // test khẳng định được ĐÃ GỌI với ĐÚNG dữ liệu, và để dựng được nhánh "thông báo ném lỗi"
  // — nhánh mà bản thật cố tình không bao giờ đi vào, nhưng luồng chính vẫn phải chịu được.
  baoDangKyMoi: (env: Env, tt: ThongTinDangKyMoi) => Promise<unknown>;
  // U34b — đường gửi thư. Tiêm qua deps cùng lý do với `getTransport` (GDT): test không
  // được đụng mạng, và phải dựng được các nhánh hỏng mà bản thật hiếm khi đi vào.
  getEmailTransport: (env: Env) => EmailTransport;
}

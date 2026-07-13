import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { HOA_DON_NATURAL_KEY_CONSTRAINT } from "../naturalKey";
import { tenantIsolationPolicy } from "./_rls";
import { tenants } from "./tenants";

// Bảng trung tâm. Khóa tự nhiên duy nhất (tenant_id, nbmst, khmshdon, khhdon, shdon,
// tdlap) — nền tảng upsert idempotent ở U5 (CLAUDE.md). Cột nghiệp vụ đầy đủ mục 7.1;
// `raw_json` JSONB giữ nguyên bản phản hồi để không mất trường khi lược đồ mở rộng.
export const hoaDon = pgTable(
  "hoa_don",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    // Người bán
    nbmst: text("nbmst").notNull(),
    nbten: text("nbten"),
    // Người mua
    nmmst: text("nmmst"),
    nmten: text("nmten"),
    // Định danh hóa đơn
    khmshdon: text("khmshdon").notNull(),
    khhdon: text("khhdon").notNull(),
    shdon: text("shdon").notNull(),
    // Thời gian
    tdlap: timestamp("tdlap", { withTimezone: true }).notNull(),
    ncnhat: timestamp("ncnhat", { withTimezone: true }),
    // Tiền (numeric — tránh sai số dấu phẩy động của money)
    tgtcthue: numeric("tgtcthue"), // chưa thuế
    tgtthue: numeric("tgtthue"), // tiền thuế
    tgtttbso: numeric("tgtttbso"), // tổng thanh toán
    ttcktmai: numeric("ttcktmai"), // chiết khấu
    dvtte: text("dvtte"), // đơn vị tiền tệ
    tgia: numeric("tgia"), // tỷ giá
    // Trạng thái — lưu MÃ (nhãn tiếng Việt hiển thị để tầng U6)
    ttxly: integer("ttxly"), // trạng thái xử lý
    tthai: integer("tthai"), // trạng thái hóa đơn
    // Phân loại nội bộ do adapter gắn (U2)
    chieu: text("chieu").notNull(), // 'purchase' | 'sold'
    nguon: text("nguon").notNull(), // 'normal' | 'sco'
    // Nguyên bản phản hồi GDT — JSONB (7.1/9)
    rawJson: jsonb("raw_json").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique(HOA_DON_NATURAL_KEY_CONSTRAINT).on(
      t.tenantId,
      t.nbmst,
      t.khmshdon,
      t.khhdon,
      t.shdon,
      t.tdlap,
    ),
    index("hoa_don_tenant_idx").on(t.tenantId),
    tenantIsolationPolicy("hoa_don", t.tenantId),
  ],
);

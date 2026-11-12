import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";

// ----------------------------------------------------
// CUSTOMER FEEDBACK QR (1 Branch = 1 Unique QR Code)
// ----------------------------------------------------
export const customerFeedbackQr = sqliteTable(
  "customer_feedback_qr",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    branchId: text("branch_id").notNull().unique(),
    uniqueToken: text("unique_token").notNull().unique(),
    publicUrl: text("public_url").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("cf_qr_org_idx").on(table.organizationId),
    uniqueIndex("cf_qr_branch_uidx").on(table.branchId),
    uniqueIndex("cf_qr_token_uidx").on(table.uniqueToken),
  ]
);

// ----------------------------------------------------
// CUSTOMER FEEDBACK (Anonymous/Named Client Reviews)
// ----------------------------------------------------
export const customerFeedback = sqliteTable(
  "customer_feedback",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    branchId: text("branch_id").notNull(),
    qrCodeId: text("qr_code_id"),
    customerName: text("customer_name"),
    category: text("category"),
    comment: text("comment").notNull(),
    isFavorite: integer("is_favorite", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("cf_org_idx").on(table.organizationId),
    index("cf_branch_idx").on(table.organizationId, table.branchId),
    index("cf_qr_idx").on(table.qrCodeId),
    index("cf_created_idx").on(table.organizationId, table.createdAt),
    index("cf_fav_idx").on(table.organizationId, table.isFavorite),
  ]
);

export type CustomerFeedbackQrRow = typeof customerFeedbackQr.$inferSelect;
export type InsertCustomerFeedbackQrRow = typeof customerFeedbackQr.$inferInsert;

export type CustomerFeedbackRow = typeof customerFeedback.$inferSelect;
export type InsertCustomerFeedbackRow = typeof customerFeedback.$inferInsert;

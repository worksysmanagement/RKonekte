import { sqliteTable, text, integer, index, uniqueIndex, real, sqliteTableCreator } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import { UserSearch } from "lucide-react";

// ----------------------------------------------------
// ORGANIZATIONS (Tenants)
// ----------------------------------------------------
export const organizations = sqliteTable(
  "organizations",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    logoUrl: text("logo_url"),
    email: text("email"),
    phone: text("phone"),
    address: text("address"),
    status: text("status", { enum: ["ACTIVE", "DISABLED"] }).notNull().default("ACTIVE"),
    matriculeFormat: text("matricule_format").default("FULLNAME_SEQ"),
    matriculePrefix: text("matricule_prefix"),
    primaryCurrency: text("primary_currency").default("HTG"),
    dateFormat: text("date_format").default("DD/MM/YYYY"),
    language: text("language").default("fr"),
    activatedAt: integer("activated_at"),
    lastRenewedAt: integer("last_renewed_at"),
    subscriptionExpiresAt: integer("subscription_expires_at"),
    serviceStopped: integer("service_stopped", { mode: "boolean" }).notNull().default(false),
    serviceStoppedAt: integer("service_stopped_at"),
    lastReminderType: text("last_reminder_type"),
    lastReminderCycleExp: integer("last_reminder_cycle_exp"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("org_slug_idx").on(table.slug),
    index("org_status_idx").on(table.status),
  ]
);

// ----------------------------------------------------
// USERS (SUPER_ADMIN, ORGANIZATION_ADMIN, SECRETARY)
// ----------------------------------------------------
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").references(() => organizations.id),
    branchId: text("branch_id").references(() => branches.id),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull(),
    status: text("status", { enum: ["ACTIVE", "DISABLED"] }).notNull().default("ACTIVE"),
    permissions: text("permissions"),
    lastLoginAt: integer("last_login_at"),
    lastSeenAt: integer("last_seen_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("users_email_idx").on(table.email),
    index("users_org_idx").on(table.organizationId),
    index("users_branch_idx").on(table.branchId),
    index("users_role_idx").on(table.role),
  ]
);

// ----------------------------------------------------
// EMPLOYEES
// ----------------------------------------------------
export const employees = sqliteTable(
  "employees",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    branchId: text("branch_id").references(() => branches.id),
    employeeNumber: text("employee_number").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    department: text("department"),
    position: text("position"),
    phone: text("phone").notNull(),
    email: text("email"),
    birthDate: text("birth_date"),
    studyDomain: text("study_domain"),
    bloodGroup: text("blood_group"),
    medicalNotes: text("medical_notes"),
    emergencyContactName: text("emergency_contact_name"),
    emergencyContactRelation: text("emergency_contact_relation"),
    emergencyContactPhone: text("emergency_contact_phone"),
    status: text("status", { enum: ["ACTIVE", "INACTIVE"] }).notNull().default("ACTIVE"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("emp_org_idx").on(table.organizationId),
    index("emp_branch_idx").on(table.branchId),
    index("emp_org_num_idx").on(table.organizationId, table.employeeNumber),
  ]
);

// ----------------------------------------------------
// LEAVE REQUESTS (All employee & leave details captured directly)
// ----------------------------------------------------
export const leaveRequests = sqliteTable(
  "leave_requests",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    branchId: text("branch_id").references(() => branches.id),
    employeeId: text("employee_id").references(() => employees.id),
    requestNumber: text("request_number").notNull().unique(), // e.g. CONG-2026-0001
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    employeeNumber: text("employee_number").notNull(),
    department: text("department").notNull(),
    position: text("position").notNull(),
    leaveType: text("leave_type", {
      enum: ["ANNUAL", "SICK", "UNPAID", "MATERNITY_PATERNITY", "OTHER"],
    }).notNull(),
    leaveTypeOther: text("leave_type_other"),
    startDate: text("start_date").notNull(), // ISO YYYY-MM-DD
    endDate: text("end_date").notNull(),     // ISO YYYY-MM-DD
    requestedDays: integer("requested_days").notNull(),
    replacementName: text("replacement_name"),
    contactPhone: text("contact_phone").notNull(),
    contactEmail: text("contact_email"),
    status: text("status", {
      enum: ["PENDING", "APPROVED", "REJECTED", "CANCELLED"],
    })
      .notNull()
      .default("PENDING"),
    employeeAccessTokenHash: text("employee_access_token_hash").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    submittedAt: integer("submitted_at").notNull(),
    decidedAt: integer("decided_at"),
    decidedBy: text("decided_by").references(() => users.id),
    rejectionReason: text("rejection_reason"),
    decisionComment: text("decision_comment"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("leave_req_num_idx").on(table.requestNumber),
    uniqueIndex("leave_token_hash_idx").on(table.employeeAccessTokenHash),
    index("leave_org_idx").on(table.organizationId),
    index("leave_org_status_idx").on(table.organizationId, table.status),
    index("leave_created_idx").on(table.createdAt),
  ]
);

// ----------------------------------------------------
// AUDIT LOGS
// ----------------------------------------------------
export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: text("user_id"), // null if public action / system
    leaveRequestId: text("leave_request_id").references(() => leaveRequests.id),
    action: text("action", {
      enum: [
        "SUBMITTED",
        "VIEWED",
        "APPROVED",
        "REJECTED",
        "CANCELLED",
        "NOTIFICATION_SENT",
        "NOTIFICATION_FAILED",
        "USER_LOGIN",
      ],
    }).notNull(),
    oldStatus: text("old_status"),
    newStatus: text("new_status"),
    metadata: text("metadata"), // JSON stringified
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("audit_org_idx").on(table.organizationId),
    index("audit_req_idx").on(table.leaveRequestId),
    index("audit_created_idx").on(table.createdAt),
  ]
);

// ----------------------------------------------------
// NOTIFICATION LOGS
// ----------------------------------------------------
export const notificationLogs = sqliteTable(
  "notification_logs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    leaveRequestId: text("leave_request_id").references(() => leaveRequests.id),
    channel: text("channel", { enum: ["EMAIL", "WHATSAPP"] }).notNull(),
    recipient: text("recipient").notNull(),
    notificationType: text("notification_type", {
      enum: ["NEW_REQUEST", "REQUEST_APPROVED", "REQUEST_REJECTED"],
    }).notNull(),
    status: text("status", { enum: ["SENT", "FAILED"] }).notNull(),
    providerMessageId: text("provider_message_id"),
    errorMessage: text("error_message"),
    sentAt: integer("sent_at"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("notif_org_idx").on(table.organizationId),
    index("notif_req_idx").on(table.leaveRequestId),
    index("notif_status_idx").on(table.status),
    index("notif_created_idx").on(table.createdAt),
  ]
);

// ----------------------------------------------------
// RELATIONS
// ----------------------------------------------------
export const organizationsRelations = relations(organizations, ({ many }) => ({
  branches: many(branches),
  users: many(users),
  employees: many(employees),
  leaveRequests: many(leaveRequests),
  auditLogs: many(auditLogs),
  notificationLogs: many(notificationLogs),
  roles: many(organizationRoles),
}));

export const employeesRelations = relations(employees, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [employees.organizationId],
    references: [organizations.id],
  }),
  branch: one(branches, {
    fields: [employees.branchId],
    references: [branches.id],
  }),
  leaveRequests: many(leaveRequests),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
  decisions: many(leaveRequests),
}));

export const leaveRequestsRelations = relations(leaveRequests, ({ one, many }) => ({
  organization : one(organizations, {
    fields: [leaveRequests.organizationId],
    references: [organizations.id],
  }),
  employee: one(employees, {
    fields: [leaveRequests.employeeId],
    references: [employees.id],
  }),
  decidedByUser: one(users, {
    fields: [leaveRequests.decidedBy],
    references: [users.id],
  }),
  auditLogs: many(auditLogs),
  notificationLogs: many(notificationLogs),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  organization: one(organizations, {
    fields: [auditLogs.organizationId],
    references: [organizations.id],
  }),
  leaveRequest: one(leaveRequests, {
    fields: [auditLogs.leaveRequestId],
    references: [leaveRequests.id],
  }),
}));

export const notificationLogsRelations = relations(notificationLogs, ({ one }) => ({
  organization: one(organizations, {
    fields: [notificationLogs.organizationId],
    references: [organizations.id],
  }),
  leaveRequest: one(leaveRequests, {
    fields: [notificationLogs.leaveRequestId],
    references: [leaveRequests.id],
  }),
}));

// ----------------------------------------------------
// BRANCHES (Succursales)
// ----------------------------------------------------
export const branches = sqliteTable(
  "branches",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    city: text("city").notNull(),
    address: text("address"),
    managerName: text("manager_name"),
    phone: text("phone"),
    status: text("status", { enum: ["ACTIVE", "INACTIVE"] }).notNull().default("ACTIVE"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("branches_org_idx").on(table.organizationId),
    index("branches_status_idx").on(table.status),
  ]
);

export const branchesRelations = relations(branches, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [branches.organizationId],
    references: [organizations.id],
  }),
  employees : many(employees),
  users : many(users),
  leaveRequests: many(leaveRequests),
}));

// Export types
export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = typeof organizations.$inferInsert;

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export type Employee = typeof employees.$inferSelect;
export type InsertEmployee = typeof employees.$inferInsert;

export type LeaveRequest = typeof leaveRequests.$inferSelect;
export type InsertLeaveRequest = typeof leaveRequests.$inferInsert;

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

export type NotificationLog = typeof notificationLogs.$inferSelect;
export type InsertNotificationLog = typeof notificationLogs.$inferInsert;

export type Branch = typeof branches.$inferSelect;
export type InsertBranch = typeof branches.$inferInsert;

// ----------------------------------------------------
// ORGANIZATION ROLES (Custom roles per tenant)
// ----------------------------------------------------
export const organizationRoles = sqliteTable(
  "organization_roles",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    description: text("description"),
    hierarchyLevel: text("hierarchy_level", {
      enum: ["DIRECTION", "MANAGEMENT", "SUPERVISOR", "OPERATIONAL"],
    })
      .notNull()
      .default("OPERATIONAL"),
    isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
    permissions: text("permissions").notNull(), // JSON stringified TabPermission map
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("roles_org_idx").on(table.organizationId),
  ]
);

export type OrganizationRole = typeof organizationRoles.$inferSelect;
export type InsertOrganizationRole = typeof organizationRoles.$inferInsert;

// ----------------------------------------------------
// CASH RUBRIQUES (Configurable cash entry categories per organization)
// ----------------------------------------------------
export const cashRubriques = sqliteTable(
  "cash_rubriques",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    currency: text("currency", { enum: ["HTG", "USD"] }).notNull().default("HTG"),
    orderIndex: integer("order_index").notNull().default(0),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("cash_rub_org_idx").on(table.organizationId),
  ]
);

export type CashRubrique = typeof cashRubriques.$inferSelect;
export type InsertCashRubrique = typeof cashRubriques.$inferInsert;

// ----------------------------------------------------
// CASHIER DAILY ENTRIES (Daily income entries per cashier/date)
// ----------------------------------------------------
export const cashierDailyEntries = sqliteTable(
  "cashier_daily_entries",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    branchId: text("branch_id"),
    cashierId: text("cashier_id").notNull(),
    cashierName: text("cashier_name").notNull(),
    cashierMatricule: text("cashier_matricule"),
    entryDate: text("entry_date").notNull(), // YYYY-MM-DD
    amounts: text("amounts").notNull(), // JSON Record<rubriqueId, number>
    totalHtg: real("total_htg").notNull().default(0),
    totalUsd: real("total_usd").notNull().default(0),
    notes: text("notes"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("cash_entry_org_date_idx").on(table.organizationId, table.entryDate),
    index("cash_entry_cashier_idx").on(table.cashierId),
  ]
);

export type CashierDailyEntry = typeof cashierDailyEntries.$inferSelect;
export type InsertCashierDailyEntry = typeof cashierDailyEntries.$inferInsert;

// ----------------------------------------------------
// COMPANY EVENTS (Événements d'entreprise & personnels)
// ----------------------------------------------------
export const companyEvents = sqliteTable(
  "company_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    title: text("title").notNull(),
    description: text("description"),
    eventDate: text("event_date").notNull(), // YYYY-MM-DD
    startTime: text("start_time").notNull().default("09:00"),
    endTime: text("end_time").notNull().default("10:00"),
    eventType: text("event_type").notNull(), // MEETING | TRAINING | HOLIDAY | ANNOUNCEMENT | WORKSHOP | PERSONAL
    personalCategory: text("personal_category"),
    location: text("location"),
    audienceType: text("audience_type"), // ALL_EMPLOYEES | DEPARTMENT | BRANCH | CUSTOM
    audienceTargetName: text("audience_target_name"),
    audienceBranchId: text("audience_branch_id"),
    targetEmployeeIds: text("target_employee_ids"), // JSON string[] of employee IDs
    notifyImmediate: integer("notify_immediate", { mode: "boolean" }).notNull().default(true),
    reminder24h: integer("reminder_24h", { mode: "boolean" }).notNull().default(true),
    isPersonal: integer("is_personal", { mode: "boolean" }).notNull().default(false),
    creatorUserId: text("creator_user_id"),
    creatorEmployeeId: text("creator_employee_id"),
    creatorEmployeeNumber: text("creator_employee_number"),
    creatorName: text("creator_name"),
    recipientsCount: integer("recipients_count").notNull().default(0),
    emailsSentCount: integer("emails_sent_count").notNull().default(0),
    emailsFailedCount: integer("emails_failed_count").notNull().default(0),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("company_events_org_idx").on(table.organizationId),
    index("company_events_date_idx").on(table.organizationId, table.eventDate),
  ]
);

export type CompanyEventRow = typeof companyEvents.$inferSelect;
export type InsertCompanyEventRow = typeof companyEvents.$inferInsert;

// ----------------------------------------------------
// PLATFORM SUBSCRIPTION SETTINGS (Tarifs & Comptes SuperAdmin)
// ----------------------------------------------------
export const platformSubscriptionSettings = sqliteTable("platform_subscription_settings", {
  id: text("id").primaryKey(),
  trialMonths: integer("trial_months").notNull().default(1),
  currency: text("currency").notNull().default("USD"),
  priceMonthly: real("price_monthly").notNull().default(50),
  priceQuarterly: real("price_quarterly").notNull().default(135),
  priceSemiannual: real("price_semiannual").notNull().default(255),
  priceAnnual: real("price_annual").notNull().default(510),
  discountQuarterlyPct: real("discount_quarterly_pct").notNull().default(10),
  discountSemiannualPct: real("discount_semiannual_pct").notNull().default(15),
  discountAnnualPct: real("discount_annual_pct").notNull().default(15),
  paymentAccounts: text("payment_accounts").notNull(),
  autoMessageTitle: text("auto_message_title").notNull(),
  autoMessageBody: text("auto_message_body").notNull(),
  superAdminAlertEmail: text("super_admin_alert_email"),
  updatedAt: integer("updated_at").notNull(),
});

export type PlatformSubscriptionSettings = typeof platformSubscriptionSettings.$inferSelect;
export type InsertPlatformSubscriptionSettings = typeof platformSubscriptionSettings.$inferInsert;

// ----------------------------------------------------
// SUBSCRIPTION RENEWALS (Références soumises & historique)
// ----------------------------------------------------
export const subscriptionRenewals = sqliteTable(
  "subscription_renewals",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    durationMonths: integer("duration_months").notNull(),
    amountExpected: real("amount_expected").notNull().default(0),
    currency: text("currency").notNull().default("USD"),
    paymentMethod: text("payment_method").notNull(),
    paymentReference: text("payment_reference"),
    payerCompanyName: text("payer_company_name"),
    payerNote: text("payer_note"),
    proofDataUrl: text("proof_data_url"),
    proofFileName: text("proof_file_name"),
    status: text("status", { enum: ["PENDING", "APPROVED", "REJECTED"] })
      .notNull()
      .default("PENDING"),
    periodStart: integer("period_start"),
    periodEnd: integer("period_end"),
    submittedByUserId: text("submitted_by_user_id"),
    submittedByName: text("submitted_by_name"),
    submittedByEmail: text("submitted_by_email"),
    reviewedByUserId: text("reviewed_by_user_id"),
    reviewedByName: text("reviewed_by_name"),
    reviewedAt: integer("reviewed_at"),
    rejectionReason: text("rejection_reason"),
    // Snapshots immuables du partage des revenus au moment de l'encaissement
    revenueTechnoziPct: real("revenue_technozi_pct"),
    revenueDeveloperPct: real("revenue_developer_pct"),
    revenueTechnoziAmount: real("revenue_technozi_amount"),
    revenueDeveloperAmount: real("revenue_developer_amount"),
    revenueCalculatedAt: integer("revenue_calculated_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("sub_renewals_org_idx").on(table.organizationId),
    index("sub_renewals_status_idx").on(table.organizationId, table.status),
  ]
);

export type SubscriptionRenewal = typeof subscriptionRenewals.$inferSelect;
export type InsertSubscriptionRenewal = typeof subscriptionRenewals.$inferInsert;

// ----------------------------------------------------
// REVENUE SHARING CONFIGURATION (Clé de répartition TECHNOZI / Développeur)
// ----------------------------------------------------
export const revenueSharingConfigs = sqliteTable("revenue_sharing_configs", {
  id: text("id").primaryKey(), // "default"
  technoziPct: real("technozi_pct").notNull().default(60),
  developerPct: real("developer_pct").notNull().default(40),
  directorEmail: text("director_email"), // E-mail du Directeur Général TECHNOZI
  directorName: text("director_name"),
  developerEmail: text("developer_email"), // E-mail du Développeur
  developerName: text("developer_name"),
  effectiveFrom: integer("effective_from").notNull(),
  updatedAt: integer("updated_at").notNull(),
  updatedByUserId: text("updated_by_user_id"),
  updatedByName: text("updated_by_name"),
});

export type RevenueSharingConfig = typeof revenueSharingConfigs.$inferSelect;
export type InsertRevenueSharingConfig = typeof revenueSharingConfigs.$inferInsert;

// ----------------------------------------------------
// REVENUE SHARING PROPOSALS (Propositions avec validation croisée)
// ----------------------------------------------------
export const revenueSharingProposals = sqliteTable(
  "revenue_sharing_proposals",
  {
    id: text("id").primaryKey(),
    previousTechnoziPct: real("previous_technozi_pct").notNull(),
    previousDeveloperPct: real("previous_developer_pct").notNull(),
    proposedTechnoziPct: real("proposed_technozi_pct").notNull(),
    proposedDeveloperPct: real("proposed_developer_pct").notNull(),
    status: text("status", { enum: ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] })
      .notNull()
      .default("PENDING"),
    proposedByUserId: text("proposed_by_user_id").notNull(),
    proposedByName: text("proposed_by_name").notNull(),
    proposedByEmail: text("proposed_by_email").notNull(),
    targetEmail: text("target_email").notNull(),
    targetName: text("target_name"),
    validationToken: text("validation_token").notNull(),
    note: text("note"),
    validatedByUserId: text("validated_by_user_id"),
    validatedByName: text("validated_by_name"),
    validatedByEmail: text("validated_by_email"),
    validatedAt: integer("validated_at"),
    rejectionReason: text("rejection_reason"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("rev_proposals_status_idx").on(table.status),
    index("rev_proposals_created_idx").on(table.createdAt),
  ]
);

export type RevenueSharingProposal = typeof revenueSharingProposals.$inferSelect;
export type InsertRevenueSharingProposal = typeof revenueSharingProposals.$inferInsert;

// ----------------------------------------------------
// ADMINISTRATIVE DOCUMENTS (Échanges Administratifs)
// ----------------------------------------------------
export const administrativeDocuments = sqliteTable(
  "administrative_documents",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    senderUserId: text("sender_user_id").notNull(),
    senderName: text("sender_name").notNull(),
    senderEmail: text("sender_email").notNull(),
    fileName: text("file_name").notNull(),
    fileType: text("file_type").notNull(),
    fileExtension: text("file_extension").notNull(),
    fileSize: integer("file_size").notNull(),
    fileHash: text("file_hash"),
    storagePath: text("storage_path").notNull(),
    storageProvider: text("storage_provider").notNull().default("local"),
    batchId: text("batch_id"),
    isArchived: integer("is_archived", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("admin_docs_org_idx").on(table.organizationId),
    index("admin_docs_sender_idx").on(table.senderUserId),
    index("admin_docs_created_idx").on(table.createdAt),
    index("admin_docs_batch_idx").on(table.batchId),
  ]
);

export type AdministrativeDocument = typeof administrativeDocuments.$inferSelect;
export type InsertAdministrativeDocument = typeof administrativeDocuments.$inferInsert;

// ----------------------------------------------------
// ADMINISTRATIVE DOCUMENT RECIPIENTS (Destinataires & Accusés de Réception)
// ----------------------------------------------------
export const administrativeDocumentRecipients = sqliteTable(
  "administrative_document_recipients",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id").notNull().references(() => administrativeDocuments.id),
    organizationId: text("organization_id").notNull(),
    recipientUserId: text("recipient_user_id").notNull(),
    recipientName: text("recipient_name").notNull(),
    recipientEmail: text("recipient_email").notNull(),
    status: text("status", { enum: ["TRANSMITTED", "DELIVERED", "VIEWED"] })
      .notNull()
      .default("DELIVERED"),
    deliveredAt: integer("delivered_at").notNull(),
    viewedAt: integer("viewed_at"),
    notificationEmailSent: integer("notification_email_sent", { mode: "boolean" }).notNull().default(false),
    notificationEmailSentAt: integer("notification_email_sent_at"),
    notificationEmailError: text("notification_email_error"),
    isArchived: integer("is_archived", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("admin_doc_recp_doc_idx").on(table.documentId),
    index("admin_doc_recp_org_idx").on(table.organizationId),
    index("admin_doc_recp_user_idx").on(table.recipientUserId),
    index("admin_doc_recp_status_idx").on(table.status),
    index("admin_doc_recp_created_idx").on(table.createdAt),
  ]
);

export type AdministrativeDocumentRecipient = typeof administrativeDocumentRecipients.$inferSelect;
export type InsertAdministrativeDocumentRecipient = typeof administrativeDocumentRecipients.$inferInsert;

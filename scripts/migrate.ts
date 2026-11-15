import { getDb } from "../src/lib/db/client";
import { sql } from "drizzle-orm";

export async function runMigrations(dbInstance?: any) {
  const db = dbInstance || getDb();
  console.log("Creating database tables and indexes...");

  // Drop old tables to rebuild clean schemas
  await db.run(sql`DROP TABLE IF EXISTS revenue_sharing_proposals`);
  await db.run(sql`DROP TABLE IF EXISTS revenue_sharing_configs`);
  await db.run(sql`DROP TABLE IF EXISTS subscription_renewals`);
  await db.run(sql`DROP TABLE IF EXISTS platform_subscription_settings`);
  await db.run(sql`DROP TABLE IF EXISTS company_events`);
  await db.run(sql`DROP TABLE IF EXISTS notification_logs`);
  await db.run(sql`DROP TABLE IF EXISTS audit_logs`);
  await db.run(sql`DROP TABLE IF EXISTS leave_requests`);
  await db.run(sql`DROP TABLE IF EXISTS employees`);
  await db.run(sql`DROP TABLE IF EXISTS users`);
  await db.run(sql`DROP TABLE IF EXISTS branches`);

  // Organizations Table
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      logo_url TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      matricule_format TEXT DEFAULT 'FULLNAME_SEQ',
      matricule_prefix TEXT,
      primary_currency TEXT DEFAULT 'HTG',
      date_format TEXT DEFAULT 'DD/MM/YYYY',
      language TEXT DEFAULT 'fr',
      activated_at INTEGER,
      last_renewed_at INTEGER,
      subscription_expires_at INTEGER,
      service_stopped INTEGER NOT NULL DEFAULT 0,
      service_stopped_at INTEGER,
      last_reminder_type TEXT,
      last_reminder_cycle_exp INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Ensure new subscription & configuration columns exist even when organizations table already existed on disk
  for (const alterSql of [
    sql`ALTER TABLE organizations ADD COLUMN matricule_format TEXT DEFAULT 'FULLNAME_SEQ'`,
    sql`ALTER TABLE organizations ADD COLUMN matricule_prefix TEXT`,
    sql`ALTER TABLE organizations ADD COLUMN primary_currency TEXT DEFAULT 'HTG'`,
    sql`ALTER TABLE organizations ADD COLUMN date_format TEXT DEFAULT 'DD/MM/YYYY'`,
    sql`ALTER TABLE organizations ADD COLUMN language TEXT DEFAULT 'fr'`,
    sql`ALTER TABLE organizations ADD COLUMN activated_at INTEGER`,
    sql`ALTER TABLE organizations ADD COLUMN last_renewed_at INTEGER`,
    sql`ALTER TABLE organizations ADD COLUMN subscription_expires_at INTEGER`,
    sql`ALTER TABLE organizations ADD COLUMN service_stopped INTEGER NOT NULL DEFAULT 0`,
    sql`ALTER TABLE organizations ADD COLUMN service_stopped_at INTEGER`,
    sql`ALTER TABLE organizations ADD COLUMN last_reminder_type TEXT`,
    sql`ALTER TABLE organizations ADD COLUMN last_reminder_cycle_exp INTEGER`,
  ]) {
    try {
      await db.run(alterSql);
    } catch (_) {}
  }

  // Branches Table
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS branches (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      name TEXT NOT NULL,
      city TEXT NOT NULL,
      address TEXT,
      manager_name TEXT,
      phone TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Users Table
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      organization_id TEXT REFERENCES organizations(id),
      branch_id TEXT REFERENCES branches(id),
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      last_login_at INTEGER,
      last_seen_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  for (const alterUserSql of [
    sql`ALTER TABLE users ADD COLUMN last_login_at INTEGER`,
    sql`ALTER TABLE users ADD COLUMN last_seen_at INTEGER`,
  ]) {
    try {
      await db.run(alterUserSql);
    } catch (_) {}
  }

  // Employees Table
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      branch_id TEXT REFERENCES branches(id),
      employee_number TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      department TEXT NOT NULL,
      position TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      birth_date TEXT,
      study_domain TEXT,
      blood_group TEXT,
      medical_notes TEXT,
      emergency_contact_name TEXT,
      emergency_contact_relation TEXT,
      emergency_contact_phone TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Leave Requests Table
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS leave_requests (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      branch_id TEXT REFERENCES branches(id),
      employee_id TEXT REFERENCES employees(id),
      request_number TEXT NOT NULL UNIQUE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      employee_number TEXT NOT NULL,
      department TEXT NOT NULL,
      position TEXT NOT NULL,
      leave_type TEXT NOT NULL,
      leave_type_other TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      requested_days INTEGER NOT NULL,
      replacement_name TEXT,
      contact_phone TEXT NOT NULL,
      contact_email TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      employee_access_token_hash TEXT NOT NULL UNIQUE,
      ip_address TEXT,
      user_agent TEXT,
      submitted_at INTEGER NOT NULL,
      decided_at INTEGER,
      decided_by TEXT REFERENCES users(id),
      rejection_reason TEXT,
      decision_comment TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Audit Logs Table
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      user_id TEXT,
      leave_request_id TEXT REFERENCES leave_requests(id),
      action TEXT NOT NULL,
      old_status TEXT,
      new_status TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL
    )
  `);

  // Notification Logs Table
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS notification_logs (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      leave_request_id TEXT REFERENCES leave_requests(id),
      channel TEXT NOT NULL,
      recipient TEXT NOT NULL,
      notification_type TEXT NOT NULL,
      status TEXT NOT NULL,
      provider_message_id TEXT,
      error_message TEXT,
      sent_at INTEGER,
      created_at INTEGER NOT NULL
    )
  `);

  // Indexes
  await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS org_slug_idx ON organizations(slug)`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS org_status_idx ON organizations(status)`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS branches_org_idx ON branches(organization_id)`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS branches_status_idx ON branches(status)`);
  await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users(email)`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS users_org_idx ON users(organization_id)`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS users_branch_idx ON users(branch_id)`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS users_role_idx ON users(role)`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS emp_org_idx ON employees(organization_id)`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS emp_branch_idx ON employees(branch_id)`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS emp_org_num_idx ON employees(organization_id, employee_number)`);
  await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS leave_req_num_idx ON leave_requests(request_number)`);
  await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS leave_token_hash_idx ON leave_requests(employee_access_token_hash)`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS leave_org_idx ON leave_requests(organization_id)`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS leave_branch_idx ON leave_requests(branch_id)`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS leave_org_status_idx ON leave_requests(organization_id, status)`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS audit_org_idx ON audit_logs(organization_id)`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS audit_req_idx ON audit_logs(leave_request_id)`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS notif_org_idx ON notification_logs(organization_id)`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS notif_req_idx ON notification_logs(leave_request_id)`);

  // Company Events Table
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS company_events (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      title TEXT NOT NULL,
      description TEXT,
      event_date TEXT NOT NULL,
      start_time TEXT NOT NULL DEFAULT '09:00',
      end_time TEXT NOT NULL DEFAULT '10:00',
      event_type TEXT NOT NULL,
      personal_category TEXT,
      location TEXT,
      audience_type TEXT,
      audience_target_name TEXT,
      audience_branch_id TEXT,
      target_employee_ids TEXT,
      notify_immediate INTEGER NOT NULL DEFAULT 1,
      reminder_24h INTEGER NOT NULL DEFAULT 1,
      is_personal INTEGER NOT NULL DEFAULT 0,
      creator_user_id TEXT,
      creator_employee_id TEXT,
      creator_employee_number TEXT,
      creator_name TEXT,
      recipients_count INTEGER NOT NULL DEFAULT 0,
      emails_sent_count INTEGER NOT NULL DEFAULT 0,
      emails_failed_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )
  `);
  await db.run(sql`CREATE INDEX IF NOT EXISTS company_events_org_idx ON company_events(organization_id)`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS company_events_date_idx ON company_events(organization_id, event_date)`);

  // Platform Subscription Settings Table
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS platform_subscription_settings (
      id TEXT PRIMARY KEY,
      trial_months INTEGER NOT NULL DEFAULT 1,
      currency TEXT NOT NULL DEFAULT 'USD',
      price_monthly REAL NOT NULL DEFAULT 50,
      price_quarterly REAL NOT NULL DEFAULT 135,
      price_semiannual REAL NOT NULL DEFAULT 255,
      price_annual REAL NOT NULL DEFAULT 510,
      discount_quarterly_pct REAL NOT NULL DEFAULT 10,
      discount_semiannual_pct REAL NOT NULL DEFAULT 15,
      discount_annual_pct REAL NOT NULL DEFAULT 15,
      payment_accounts TEXT NOT NULL,
      auto_message_title TEXT NOT NULL,
      auto_message_body TEXT NOT NULL,
      super_admin_alert_email TEXT,
      updated_at INTEGER NOT NULL
    )
  `);

  // Subscription Renewals Table
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS subscription_renewals (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      duration_months INTEGER NOT NULL,
      amount_expected REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'USD',
      payment_method TEXT NOT NULL,
      payment_reference TEXT,
      payer_company_name TEXT,
      payer_note TEXT,
      proof_data_url TEXT,
      proof_file_name TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      period_start INTEGER,
      period_end INTEGER,
      submitted_by_user_id TEXT,
      submitted_by_name TEXT,
      submitted_by_email TEXT,
      reviewed_by_user_id TEXT,
      reviewed_by_name TEXT,
      reviewed_at INTEGER,
      rejection_reason TEXT,
      revenue_technozi_pct REAL,
      revenue_developer_pct REAL,
      revenue_technozi_amount REAL,
      revenue_developer_amount REAL,
      revenue_calculated_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  await db.run(sql`CREATE INDEX IF NOT EXISTS sub_renewals_org_idx ON subscription_renewals(organization_id)`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS sub_renewals_status_idx ON subscription_renewals(organization_id, status)`);

  for (const alterSql of [
    sql`ALTER TABLE subscription_renewals ADD COLUMN revenue_technozi_pct REAL`,
    sql`ALTER TABLE subscription_renewals ADD COLUMN revenue_developer_pct REAL`,
    sql`ALTER TABLE subscription_renewals ADD COLUMN revenue_technozi_amount REAL`,
    sql`ALTER TABLE subscription_renewals ADD COLUMN revenue_developer_amount REAL`,
    sql`ALTER TABLE subscription_renewals ADD COLUMN revenue_calculated_at INTEGER`,
  ]) {
    try {
      await db.run(alterSql);
    } catch (_) {}
  }

  // Revenue Sharing Configs Table
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS revenue_sharing_configs (
      id TEXT PRIMARY KEY,
      technozi_pct REAL NOT NULL DEFAULT 60,
      developer_pct REAL NOT NULL DEFAULT 40,
      director_email TEXT,
      director_name TEXT,
      developer_email TEXT,
      developer_name TEXT,
      effective_from INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      updated_by_user_id TEXT,
      updated_by_name TEXT
    )
  `);

  // Revenue Sharing Proposals Table
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS revenue_sharing_proposals (
      id TEXT PRIMARY KEY,
      previous_technozi_pct REAL NOT NULL,
      previous_developer_pct REAL NOT NULL,
      proposed_technozi_pct REAL NOT NULL,
      proposed_developer_pct REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      proposed_by_user_id TEXT NOT NULL,
      proposed_by_name TEXT NOT NULL,
      proposed_by_email TEXT NOT NULL,
      target_email TEXT NOT NULL,
      target_name TEXT,
      validation_token TEXT NOT NULL,
      note TEXT,
      validated_by_user_id TEXT,
      validated_by_name TEXT,
      validated_by_email TEXT,
      validated_at INTEGER,
      rejection_reason TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  await db.run(sql`CREATE INDEX IF NOT EXISTS rev_proposals_status_idx ON revenue_sharing_proposals(status)`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS rev_proposals_created_idx ON revenue_sharing_proposals(created_at)`);

  console.log("Migrations applied successfully.");
}

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Migration error:", err);
      process.exit(1);
    });
}

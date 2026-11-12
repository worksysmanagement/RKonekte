-- ====================================================
-- SUPABASE POSTGRESQL SCHEMA — SYSTEM MANAGEMENT
-- ====================================================

-- 1. Table: Organizations
CREATE TABLE IF NOT EXISTS public.organizations (
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
  activated_at BIGINT,
  last_renewed_at BIGINT,
  subscription_expires_at BIGINT,
  service_stopped BOOLEAN NOT NULL DEFAULT false,
  service_stopped_at BIGINT,
  last_reminder_type TEXT,
  last_reminder_cycle_exp BIGINT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- 2. Table: Users
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id TEXT REFERENCES public.branches(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  last_login_at BIGINT,
  last_seen_at BIGINT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- 3. Table: Employees
CREATE TABLE IF NOT EXISTS public.employees (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id TEXT REFERENCES public.branches(id) ON DELETE SET NULL,
  employee_number TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  department TEXT,
  position TEXT,
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
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- 4. Table: Leave Requests
CREATE TABLE IF NOT EXISTS public.leave_requests (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id TEXT REFERENCES public.branches(id) ON DELETE SET NULL,
  employee_id TEXT REFERENCES public.employees(id) ON DELETE SET NULL,
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
  submitted_at BIGINT NOT NULL,
  decided_at BIGINT,
  decided_by TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  rejection_reason TEXT,
  decision_comment TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- 5. Table: Audit Logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id TEXT,
  leave_request_id TEXT REFERENCES public.leave_requests(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT,
  metadata TEXT,
  created_at BIGINT NOT NULL
);

-- 6. Table: Notification Logs
CREATE TABLE IF NOT EXISTS public.notification_logs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  leave_request_id TEXT REFERENCES public.leave_requests(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  recipient TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_message_id TEXT,
  error_message TEXT,
  sent_at BIGINT,
  created_at BIGINT NOT NULL
);

-- ====================================================
-- INDEXES FOR MAXIMUM QUERY PERFORMANCE
-- ====================================================

CREATE UNIQUE INDEX IF NOT EXISTS org_slug_idx ON public.organizations(slug);
CREATE INDEX IF NOT EXISTS org_status_idx ON public.organizations(status);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON public.users(email);
CREATE INDEX IF NOT EXISTS users_org_idx ON public.users(organization_id);
CREATE INDEX IF NOT EXISTS users_role_idx ON public.users(role);
CREATE INDEX IF NOT EXISTS users_last_login_idx ON public.users(last_login_at);
CREATE INDEX IF NOT EXISTS users_last_seen_idx ON public.users(last_seen_at);
CREATE INDEX IF NOT EXISTS emp_org_idx ON public.employees(organization_id);
CREATE INDEX IF NOT EXISTS emp_org_num_idx ON public.employees(organization_id, employee_number);
CREATE UNIQUE INDEX IF NOT EXISTS leave_req_num_idx ON public.leave_requests(request_number);
CREATE UNIQUE INDEX IF NOT EXISTS leave_token_hash_idx ON public.leave_requests(employee_access_token_hash);
CREATE INDEX IF NOT EXISTS leave_org_idx ON public.leave_requests(organization_id);
CREATE INDEX IF NOT EXISTS leave_org_status_idx ON public.leave_requests(organization_id, status);
CREATE INDEX IF NOT EXISTS audit_org_idx ON public.audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS audit_req_idx ON public.audit_logs(leave_request_id);
CREATE INDEX IF NOT EXISTS notif_org_idx ON public.notification_logs(organization_id);
CREATE INDEX IF NOT EXISTS notif_req_idx ON public.notification_logs(leave_request_id);

-- ====================================================
-- ROW-LEVEL SECURITY (RLS) FOR DATA PROTECTION
-- ====================================================
ALTER TABLE IF EXISTS public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notification_logs ENABLE ROW LEVEL SECURITY;

-- 7. Table: Branches (Succursales)
CREATE TABLE IF NOT EXISTS public.branches (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  address TEXT,
  manager_name TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS branches_org_idx ON public.branches(organization_id);
CREATE INDEX IF NOT EXISTS branches_status_idx ON public.branches(status);
ALTER TABLE IF EXISTS public.branches ENABLE ROW LEVEL SECURITY;

-- 8. Table: Organization Roles (Matrice d'accès personnalisée par entreprise)
CREATE TABLE IF NOT EXISTS public.organization_roles (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  hierarchy_level TEXT NOT NULL DEFAULT 'OPERATIONAL',
  is_system BOOLEAN NOT NULL DEFAULT false,
  permissions TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS roles_org_idx ON public.organization_roles(organization_id);
ALTER TABLE IF EXISTS public.organization_roles ENABLE ROW LEVEL SECURITY;

-- 9. Table: Bank Accounts (Comptes Bancaires de l'Entreprise)
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'HTG',
  initial_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  initial_balance_date TEXT,
  current_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  branch_id TEXT REFERENCES public.branches(id) ON DELETE SET NULL,
  branch_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS bank_accounts_org_idx ON public.bank_accounts(organization_id);
CREATE INDEX IF NOT EXISTS bank_accounts_branch_idx ON public.bank_accounts(branch_id);
CREATE INDEX IF NOT EXISTS bank_accounts_active_idx ON public.bank_accounts(is_active);
ALTER TABLE IF EXISTS public.bank_accounts ENABLE ROW LEVEL SECURITY;

-- 10. Table: Bank Transactions (Dépôts & Retraits Bancaires)
CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('DEPOSIT', 'WITHDRAWAL')),
  bank_account_id TEXT NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  amount NUMERIC(15, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'HTG',
  reference_number TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT,
  author_id TEXT,
  author_name TEXT NOT NULL,
  author_matricule TEXT,
  author_role TEXT,
  delegate_name TEXT,
  branch_id TEXT REFERENCES public.branches(id) ON DELETE SET NULL,
  branch_name TEXT,
  reason TEXT NOT NULL,
  receipt_data_url TEXT,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS bank_tx_org_idx ON public.bank_transactions(organization_id);
CREATE INDEX IF NOT EXISTS bank_tx_account_idx ON public.bank_transactions(bank_account_id);
CREATE INDEX IF NOT EXISTS bank_tx_type_idx ON public.bank_transactions(type);
CREATE INDEX IF NOT EXISTS bank_tx_date_idx ON public.bank_transactions(date);
CREATE INDEX IF NOT EXISTS bank_tx_branch_idx ON public.bank_transactions(branch_id);
ALTER TABLE IF EXISTS public.bank_transactions ENABLE ROW LEVEL SECURITY;

-- 11. Table: Company Events (Calendrier & Planification d'Entreprise)
CREATE TABLE IF NOT EXISTS public.company_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
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
  notify_immediate BOOLEAN NOT NULL DEFAULT true,
  reminder_24h BOOLEAN NOT NULL DEFAULT true,
  is_personal BOOLEAN NOT NULL DEFAULT false,
  creator_user_id TEXT,
  creator_employee_id TEXT,
  creator_employee_number TEXT,
  creator_name TEXT,
  recipients_count INTEGER NOT NULL DEFAULT 0,
  emails_sent_count INTEGER NOT NULL DEFAULT 0,
  emails_failed_count INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS company_events_org_idx ON public.company_events(organization_id);
CREATE INDEX IF NOT EXISTS company_events_date_idx ON public.company_events(organization_id, event_date);
ALTER TABLE IF EXISTS public.company_events ENABLE ROW LEVEL SECURITY;

-- 12. Table: Platform Subscription Settings (Tarifs & Comptes SuperAdmin)
CREATE TABLE IF NOT EXISTS public.platform_subscription_settings (
  id TEXT PRIMARY KEY,
  trial_months INTEGER NOT NULL DEFAULT 1,
  currency TEXT NOT NULL DEFAULT 'USD',
  price_monthly NUMERIC(12, 2) NOT NULL DEFAULT 50,
  price_quarterly NUMERIC(12, 2) NOT NULL DEFAULT 135,
  price_semiannual NUMERIC(12, 2) NOT NULL DEFAULT 255,
  price_annual NUMERIC(12, 2) NOT NULL DEFAULT 510,
  discount_quarterly_pct NUMERIC(5, 2) NOT NULL DEFAULT 10,
  discount_semiannual_pct NUMERIC(5, 2) NOT NULL DEFAULT 15,
  discount_annual_pct NUMERIC(5, 2) NOT NULL DEFAULT 15,
  payment_accounts TEXT NOT NULL,
  auto_message_title TEXT NOT NULL,
  auto_message_body TEXT NOT NULL,
  super_admin_alert_email TEXT,
  updated_at BIGINT NOT NULL
);

ALTER TABLE IF EXISTS public.platform_subscription_settings ENABLE ROW LEVEL SECURITY;

-- 13. Table: Subscription Renewals (Références soumises & historique)
CREATE TABLE IF NOT EXISTS public.subscription_renewals (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  duration_months INTEGER NOT NULL,
  amount_expected NUMERIC(12, 2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  payment_method TEXT NOT NULL,
  payment_reference TEXT,
  payer_company_name TEXT,
  payer_note TEXT,
  proof_data_url TEXT,
  proof_file_name TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  period_start BIGINT,
  period_end BIGINT,
  submitted_by_user_id TEXT,
  submitted_by_name TEXT,
  submitted_by_email TEXT,
  reviewed_by_user_id TEXT,
  reviewed_by_name TEXT,
  reviewed_at BIGINT,
  rejection_reason TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS sub_renewals_org_idx ON public.subscription_renewals(organization_id);
CREATE INDEX IF NOT EXISTS sub_renewals_status_idx ON public.subscription_renewals(organization_id, status);
ALTER TABLE IF EXISTS public.subscription_renewals ENABLE ROW LEVEL SECURITY;



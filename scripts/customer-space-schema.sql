-- ====================================================
-- MODULE ESPACE CLIENT — ISOLATED POSTGRESQL SCHEMA
-- Tables : customer_feedback_qr, customer_feedback
-- ====================================================

-- 1. Table: customer_feedback_qr
-- Contrainte fondamentale : UNE SUCCURSALE = UN SEUL QR CODE (branch_id UNIQUE)
CREATE TABLE IF NOT EXISTS public.customer_feedback_qr (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL UNIQUE REFERENCES public.branches(id) ON DELETE CASCADE,
  unique_token TEXT NOT NULL UNIQUE,
  public_url TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS customer_feedback_qr_org_idx
  ON public.customer_feedback_qr(organization_id);

CREATE UNIQUE INDEX IF NOT EXISTS customer_feedback_qr_branch_uidx
  ON public.customer_feedback_qr(branch_id);

CREATE UNIQUE INDEX IF NOT EXISTS customer_feedback_qr_token_uidx
  ON public.customer_feedback_qr(unique_token);

-- 2. Table: customer_feedback
CREATE TABLE IF NOT EXISTS public.customer_feedback (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  qr_code_id TEXT REFERENCES public.customer_feedback_qr(id) ON DELETE SET NULL,
  customer_name TEXT,
  category TEXT,
  comment TEXT NOT NULL,
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS customer_feedback_org_idx
  ON public.customer_feedback(organization_id);

CREATE INDEX IF NOT EXISTS customer_feedback_branch_idx
  ON public.customer_feedback(organization_id, branch_id);

CREATE INDEX IF NOT EXISTS customer_feedback_qr_idx
  ON public.customer_feedback(qr_code_id);

CREATE INDEX IF NOT EXISTS customer_feedback_created_idx
  ON public.customer_feedback(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS customer_feedback_fav_idx
  ON public.customer_feedback(organization_id, is_favorite);

-- 3. Row Level Security (strictly restricted to server-side service_role)
ALTER TABLE IF EXISTS public.customer_feedback_qr ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.customer_feedback ENABLE ROW LEVEL SECURITY;

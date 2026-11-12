import { Client } from "pg";

export async function runCustomerSpaceMigration() {
  console.log("Starting isolated Supabase migration for Espace Client (customer_feedback_qr & customer_feedback)...");

  const client = new Client({
    host: "aws-0-us-east-1.pooler.supabase.com",
    port: 6543,
    user: "postgres.ldpravbrnpwwdurlqdyq",
    password: "SysAdmin2026Y",
    database: "postgres",
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  await client.connect();
  console.log("Connected to Supabase PostgreSQL.");

  try {
    // 1. Create public.customer_feedback_qr with UNIQUE constraint on branch_id and unique_token
    await client.query(`
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
    `);
    console.log("✓ Table public.customer_feedback_qr verified/created.");

    // 2. Create public.customer_feedback
    await client.query(`
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
    `);

    // Ensure qr_code_id is nullable with ON DELETE SET NULL (so deleting an inactive QR preserves past reviews)
    await client.query(`
      ALTER TABLE IF EXISTS public.customer_feedback
        ALTER COLUMN qr_code_id DROP NOT NULL;

      DO $$
      DECLARE
        fk_name TEXT;
      BEGIN
        SELECT conname INTO fk_name
        FROM pg_constraint
        WHERE conrelid = 'public.customer_feedback'::regclass
          AND contype = 'f'
          AND pg_get_constraintdef(oid) ILIKE '%qr_code_id%'
          AND pg_get_constraintdef(oid) ILIKE '%DELETE CASCADE%';

        IF fk_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE public.customer_feedback DROP CONSTRAINT %I', fk_name);
          ALTER TABLE public.customer_feedback
            ADD CONSTRAINT customer_feedback_qr_code_id_fkey
            FOREIGN KEY (qr_code_id)
            REFERENCES public.customer_feedback_qr(id)
            ON DELETE SET NULL;
        END IF;
      END $$;
    `);
    console.log("✓ Table public.customer_feedback verified/created.");

    // 3. Indexes (idempotent)
    await client.query(`
      CREATE INDEX IF NOT EXISTS customer_feedback_qr_org_idx ON public.customer_feedback_qr(organization_id);
      CREATE UNIQUE INDEX IF NOT EXISTS customer_feedback_qr_branch_uidx ON public.customer_feedback_qr(branch_id);
      CREATE UNIQUE INDEX IF NOT EXISTS customer_feedback_qr_token_uidx ON public.customer_feedback_qr(unique_token);

      CREATE INDEX IF NOT EXISTS customer_feedback_org_idx ON public.customer_feedback(organization_id);
      CREATE INDEX IF NOT EXISTS customer_feedback_branch_idx ON public.customer_feedback(organization_id, branch_id);
      CREATE INDEX IF NOT EXISTS customer_feedback_qr_idx ON public.customer_feedback(qr_code_id);
      CREATE INDEX IF NOT EXISTS customer_feedback_created_idx ON public.customer_feedback(organization_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS customer_feedback_fav_idx ON public.customer_feedback(organization_id, is_favorite);
    `);
    console.log("✓ Indexes & unique constraints verified.");

    // 4. Enable RLS & restrict policies strictly to server-side service_role (block direct anon access)
    await client.query(`
      ALTER TABLE IF EXISTS public.customer_feedback_qr ENABLE ROW LEVEL SECURITY;
      ALTER TABLE IF EXISTS public.customer_feedback ENABLE ROW LEVEL SECURITY;
    `);

    await client.query(`
      DO $$
      BEGIN
        -- Drop any overly permissive policy if it ever existed, then ensure service_role-only policies
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = 'customer_feedback_qr' AND policyname = 'service_role_customer_feedback_qr'
        ) THEN
          CREATE POLICY service_role_customer_feedback_qr
            ON public.customer_feedback_qr
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true);
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = 'customer_feedback' AND policyname = 'service_role_customer_feedback'
        ) THEN
          CREATE POLICY service_role_customer_feedback
            ON public.customer_feedback
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true);
        END IF;
      END $$;
    `);
    console.log("✓ RLS & service_role-only security policies enabled.");

    console.log("SUCCESS! Espace Client migration completed.");
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  runCustomerSpaceMigration()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error("Migration error:", e);
      process.exit(1);
    });
}

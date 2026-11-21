import { Client } from "pg";

export async function runRevenueSharingMigration() {
  console.log("Starting Supabase migration for Dynamic Revenue Sharing...");

  const client = new Client({
    host: "aws-0-us-east-1.pooler.supabase.com",
    port: 6543,
    user: "postgres.ldpravbrnpwwdurlqdyq",
    password: "SysAdmin2026Y",
    database: "postgres",
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  await client.connect();
  console.log("Connected to Supabase PostgreSQL.");

  try {
    // 1. Create revenue_sharing_configs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.revenue_sharing_configs (
        id TEXT PRIMARY KEY,
        technozi_pct NUMERIC(5, 2) NOT NULL DEFAULT 60,
        developer_pct NUMERIC(5, 2) NOT NULL DEFAULT 40,
        director_email TEXT,
        director_name TEXT,
        developer_email TEXT,
        developer_name TEXT,
        effective_from BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        updated_by_user_id TEXT,
        updated_by_name TEXT
      );
    `);
    console.log("✓ Table public.revenue_sharing_configs verified/created.");

    // 2. Create revenue_sharing_proposals table
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.revenue_sharing_proposals (
        id TEXT PRIMARY KEY,
        previous_technozi_pct NUMERIC(5, 2) NOT NULL,
        previous_developer_pct NUMERIC(5, 2) NOT NULL,
        proposed_technozi_pct NUMERIC(5, 2) NOT NULL,
        proposed_developer_pct NUMERIC(5, 2) NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        proposed_by_user_id TEXT NOT NULL,
        proposed_by_name TEXT NOT NULL,
        proposed_by_email TEXT NOT NULL,
        target_email TEXT NOT NULL,
        target_name TEXT,
        validation_token TEXT NOT NULL UNIQUE,
        note TEXT,
        validated_by_user_id TEXT,
        validated_by_name TEXT,
        validated_by_email TEXT,
        validated_at BIGINT,
        rejection_reason TEXT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS rev_proposals_status_idx ON public.revenue_sharing_proposals(status);
      CREATE INDEX IF NOT EXISTS rev_proposals_token_idx ON public.revenue_sharing_proposals(validation_token);
    `);
    console.log("✓ Table public.revenue_sharing_proposals & indexes verified/created.");

    // 3. Add immutable revenue snapshot columns to subscription_renewals
    await client.query(`
      ALTER TABLE public.subscription_renewals
      ADD COLUMN IF NOT EXISTS revenue_technozi_pct NUMERIC(5, 2),
      ADD COLUMN IF NOT EXISTS revenue_developer_pct NUMERIC(5, 2),
      ADD COLUMN IF NOT EXISTS revenue_technozi_amount NUMERIC(12, 2),
      ADD COLUMN IF NOT EXISTS revenue_developer_amount NUMERIC(12, 2),
      ADD COLUMN IF NOT EXISTS revenue_calculated_at BIGINT;
    `);
    console.log("✓ Snapshot columns verified/added on public.subscription_renewals.");

    // 4. Enable RLS & policies matching existing platform tables
    await client.query(`
      ALTER TABLE IF EXISTS public.revenue_sharing_configs ENABLE ROW LEVEL SECURITY;
      ALTER TABLE IF EXISTS public.revenue_sharing_proposals ENABLE ROW LEVEL SECURITY;
    `);
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = 'revenue_sharing_configs' AND policyname = 'service_role_revenue_sharing_configs'
        ) THEN
          CREATE POLICY service_role_revenue_sharing_configs ON public.revenue_sharing_configs FOR ALL USING (true) WITH CHECK (true);
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = 'revenue_sharing_proposals' AND policyname = 'service_role_revenue_sharing_proposals'
        ) THEN
          CREATE POLICY service_role_revenue_sharing_proposals ON public.revenue_sharing_proposals FOR ALL USING (true) WITH CHECK (true);
        END IF;
      END $$;
    `);
    console.log("✓ RLS policies configured.");

    // 5. Seed initial default 60/40 configuration if absent
    const now = Date.now();
    await client.query(
      `
      INSERT INTO public.revenue_sharing_configs (
        id, technozi_pct, developer_pct, director_email, director_name,
        developer_email, developer_name, effective_from, updated_at,
        updated_by_user_id, updated_by_name
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (id) DO NOTHING;
      `,
      [
        "default",
        60,
        40,
        null,
        "Directeur Général TECHNOZI",
        "pitonrodjy@gmail.com",
        "Rodjy Piton (Développeur)",
        now,
        now,
        null,
        "Système RKonekte",
      ]
    );
    console.log("✓ Initial 60/40 revenue sharing config ensured.");

    // 6. Notify PostgREST to reload schema cache
    await client.query(`NOTIFY pgrst, 'reload schema';`);
    console.log("✓ PostgREST schema cache reload requested.");
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  runRevenueSharingMigration()
    .then(() => {
      console.log("Revenue sharing Supabase migration completed successfully.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Revenue sharing Supabase migration failed:", err);
      process.exit(1);
    });
}

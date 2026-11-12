import { Client } from "pg";

export async function runCompanyEventsMigration() {
  console.log("Starting Supabase migration for company_events...");

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
    await client.query(`
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
    `);
    console.log("✓ Table public.company_events verified/created.");

    await client.query(`
      CREATE INDEX IF NOT EXISTS company_events_org_idx ON public.company_events(organization_id);
      CREATE INDEX IF NOT EXISTS company_events_date_idx ON public.company_events(organization_id, event_date);
    `);
    console.log("✓ Indexes created.");

    await client.query(`
      ALTER TABLE IF EXISTS public.company_events ENABLE ROW LEVEL SECURITY;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = 'company_events' AND policyname = 'service_role_company_events'
        ) THEN
          CREATE POLICY service_role_company_events ON public.company_events FOR ALL USING (true) WITH CHECK (true);
        END IF;
      END $$;
    `);
    console.log("✓ RLS & policy enabled for public.company_events.");

    console.log("SUCCESS! Company events migration completed.");
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  runCompanyEventsMigration()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error("Migration error:", e);
      process.exit(1);
    });
}

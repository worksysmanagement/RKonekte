import { Client } from "pg";

export async function runUserActivityMigration() {
  console.log("Starting Supabase migration for user activity tracking (last_login_at, last_seen_at)...");

  const connectionString = process.env.DATABASE_URL;
  const client = connectionString
    ? new Client({
        connectionString,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 15000,
      })
    : new Client({
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
    await client.query(`
      ALTER TABLE public.users
      ADD COLUMN IF NOT EXISTS last_login_at BIGINT,
      ADD COLUMN IF NOT EXISTS last_seen_at BIGINT;
    `);
    console.log("✓ Columns last_login_at & last_seen_at verified/added on public.users.");

    await client.query(`
      CREATE INDEX IF NOT EXISTS users_last_login_idx ON public.users(last_login_at);
      CREATE INDEX IF NOT EXISTS users_last_seen_idx ON public.users(last_seen_at);
      CREATE INDEX IF NOT EXISTS audit_org_action_idx ON public.audit_logs(organization_id, action, created_at);
    `);
    console.log("✓ User activity indexes created.");

    console.log("SUCCESS! User activity migration completed.");
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  runUserActivityMigration()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error("Migration error:", e);
      process.exit(1);
    });
}

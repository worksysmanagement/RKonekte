import { Client } from "pg";

export async function runRemoveBranchCodeMigration() {
  console.log("Starting migration: remove branch code & switch default matricule format to FULLNAME_SEQ...");

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
    // 1. Drop code column from public.branches
    await client.query(`
      ALTER TABLE IF EXISTS public.branches
      DROP COLUMN IF EXISTS code;
    `);
    console.log("✓ Dropped column 'code' from public.branches.");

    // 2. Update default matricule_format on public.organizations
    await client.query(`
      ALTER TABLE IF EXISTS public.organizations
      ALTER COLUMN matricule_format SET DEFAULT 'FULLNAME_SEQ';
    `);
    console.log("✓ Set default matricule_format to 'FULLNAME_SEQ' on public.organizations.");

    // 3. Migrate existing organizations away from branch-based matricule formats
    const res1 = await client.query(`
      UPDATE public.organizations
      SET matricule_format = 'FULLNAME_SEQ'
      WHERE matricule_format IS NULL
         OR matricule_format IN ('INITIALS_BRANCH_SEQ', 'FULLNAME_BRANCH_SEQ');
    `);
    const res2 = await client.query(`
      UPDATE public.organizations
      SET matricule_format = 'TRIGRAM_SEQ'
      WHERE matricule_format = 'TRIGRAM_BRANCH_SEQ';
    `);
    console.log(
      `✓ Migrated organizations matricule_format (${(res1.rowCount ?? 0) + (res2.rowCount ?? 0)} updated).`
    );

    console.log("SUCCESS! Branch code removal migration completed.");
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  runRemoveBranchCodeMigration()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error("Migration error:", e);
      process.exit(1);
    });
}

import { getDb } from "../src/lib/db/client";
import { users } from "../src/db/schema";
import { sql } from "drizzle-orm";
import { Client } from "pg";

export async function migrateLocalSqliteRoles() {
  console.log("--> Migrating roles in local.sqlite...");
  const db = getDb();

  // Inspect before
  const beforeUsers = await db.select({ id: users.id, name: users.name, role: users.role }).from(users);
  console.log("Current users in local.sqlite:", beforeUsers);

  // Map leadership / admin roles to ORGANIZATION_ADMIN
  await db.run(sql`
    UPDATE users 
    SET role = 'ORGANIZATION_ADMIN'
    WHERE role IN ('ADMINISTRATEUR', 'ADMIN', 'DIRECTION', 'PDG', 'BRANCH_MANAGER', 'FINANCIAL_MANAGER', 'RH')
  `);

  // Map staff / operational roles to EMPLOYEE
  await db.run(sql`
    UPDATE users 
    SET role = 'EMPLOYEE'
    WHERE role IN ('COLLABORATEUR', 'CASHIER', 'CAISSIER', 'SECRETARY', 'SECRETAIRE')
  `);

  const afterUsers = await db.select({ id: users.id, name: users.name, role: users.role }).from(users);
  console.log("✓ Updated users in local.sqlite:", afterUsers);
}

export async function migrateSupabaseRoles() {
  console.log("--> Migrating roles in Supabase PostgreSQL...");
  const client = new Client({
    host: "aws-0-us-east-1.pooler.supabase.com",
    port: 6543,
    user: "postgres.ldpravbrnpwwdurlqdyq",
    password: "SysAdmin2026Y",
    database: "postgres",
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  try {
    await client.connect();
    console.log("Connected to Supabase PostgreSQL.");

    const beforeRes = await client.query(`SELECT id, name, email, role FROM public.users ORDER BY role;`);
    console.log("Current users in Supabase:", beforeRes.rows);

    // Update leadership roles to ORGANIZATION_ADMIN
    const adminRes = await client.query(`
      UPDATE public.users 
      SET role = 'ORGANIZATION_ADMIN'
      WHERE role IN ('ADMINISTRATEUR', 'ADMIN', 'DIRECTION', 'PDG', 'BRANCH_MANAGER', 'FINANCIAL_MANAGER', 'RH');
    `);
    console.log(`Updated ${adminRes.rowCount} users to ORGANIZATION_ADMIN.`);

    // Update staff roles to EMPLOYEE
    const empRes = await client.query(`
      UPDATE public.users 
      SET role = 'EMPLOYEE'
      WHERE role IN ('COLLABORATEUR', 'CASHIER', 'CAISSIER', 'SECRETARY', 'SECRETAIRE');
    `);
    console.log(`Updated ${empRes.rowCount} users to EMPLOYEE.`);

    const afterRes = await client.query(`SELECT id, name, email, role FROM public.users ORDER BY role;`);
    console.log("✓ Updated users in Supabase:", afterRes.rows);

    await client.query(`NOTIFY pgrst, 'reload schema';`);
  } catch (err) {
    console.warn("Supabase migration notice (network / offline):", (err as any).message);
  } finally {
    try {
      await client.end();
    } catch (_) {}
  }
}

async function main() {
  await migrateLocalSqliteRoles();
  await migrateSupabaseRoles();
  console.log("Role migration finished.");
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

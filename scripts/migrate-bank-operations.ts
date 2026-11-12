import { Client } from "pg";

export async function runBankOperationsMigration() {
  console.log("Starting Supabase migration for bank_accounts & bank_transactions...");

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
    // 1. Create bank_accounts table
    await client.query(`
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
    `);
    console.log("✓ Table public.bank_accounts verified/created.");

    // 2. Create bank_transactions table
    await client.query(`
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
      ALTER TABLE public.bank_transactions ADD COLUMN IF NOT EXISTS delegate_name TEXT;
      ALTER TABLE public.bank_accounts ADD COLUMN IF NOT EXISTS initial_balance_date TEXT;
    `);
    console.log("✓ Table public.bank_transactions verified/created.");

    // 3. Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS bank_accounts_org_idx ON public.bank_accounts(organization_id);
      CREATE INDEX IF NOT EXISTS bank_accounts_branch_idx ON public.bank_accounts(branch_id);
      CREATE INDEX IF NOT EXISTS bank_accounts_active_idx ON public.bank_accounts(is_active);

      CREATE INDEX IF NOT EXISTS bank_tx_org_idx ON public.bank_transactions(organization_id);
      CREATE INDEX IF NOT EXISTS bank_tx_account_idx ON public.bank_transactions(bank_account_id);
      CREATE INDEX IF NOT EXISTS bank_tx_type_idx ON public.bank_transactions(type);
      CREATE INDEX IF NOT EXISTS bank_tx_date_idx ON public.bank_transactions(date);
      CREATE INDEX IF NOT EXISTS bank_tx_branch_idx ON public.bank_transactions(branch_id);
    `);
    console.log("✓ Indexes created.");

    // 4. Enable RLS
    await client.query(`
      ALTER TABLE IF EXISTS public.bank_accounts ENABLE ROW LEVEL SECURITY;
      ALTER TABLE IF EXISTS public.bank_transactions ENABLE ROW LEVEL SECURITY;
    `);
    console.log("✓ Row Level Security enabled.");

    // 5. Create policies for service role and authenticated users
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = 'bank_accounts' AND policyname = 'service_role_bank_accounts'
        ) THEN
          CREATE POLICY service_role_bank_accounts ON public.bank_accounts FOR ALL USING (true) WITH CHECK (true);
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = 'bank_transactions' AND policyname = 'service_role_bank_transactions'
        ) THEN
          CREATE POLICY service_role_bank_transactions ON public.bank_transactions FOR ALL USING (true) WITH CHECK (true);
        END IF;
      END $$;
    `);
    console.log("✓ Policies created.");

    // 6. Check if e-biznis org has default accounts
    const orgCheck = await client.query(`SELECT id FROM public.organizations LIMIT 1;`);
    if (orgCheck.rows.length > 0) {
      const orgId = orgCheck.rows[0].id;
      const countCheck = await client.query(
        `SELECT COUNT(*) FROM public.bank_accounts WHERE organization_id = $1;`,
        [orgId]
      );
      if (parseInt(countCheck.rows[0].count, 10) === 0) {
        const now = Date.now();
        await client.query(`
          INSERT INTO public.bank_accounts (
            id, organization_id, bank_name, account_name, account_number, currency, initial_balance, current_balance, branch_name, is_active, created_at, updated_at
          ) VALUES 
          ('acc-sogebank-htg-01', '${orgId}', 'Sogebank', 'Compte Principal Opérations Courantes', '102-1021-884920', 'HTG', 250000.00, 250000.00, 'Toutes les succursales (National / Siège)', true, ${now}, ${now}),
          ('acc-unibank-usd-02', '${orgId}', 'Unibank', 'Compte Trésorerie Commerciale USD', '201-9988-441122', 'USD', 15000.00, 15000.00, 'Toutes les succursales (National / Siège)', true, ${now}, ${now}),
          ('acc-bnc-htg-03', '${orgId}', 'Banque Nationale de Crédit (BNC)', 'Compte Recettes et Encaissements', '300-4455-778899', 'HTG', 120000.00, 120000.00, 'Siège Principal', true, ${now}, ${now});
        `);
        console.log("✓ Seeded 3 active default bank accounts for organization", orgId);
      } else {
        console.log("Accounts already present:", countCheck.rows[0].count);
      }
    }

    console.log("SUCCESS! Migration completed.");
  } finally {
    await client.end();
  }
}

runBankOperationsMigration()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Migration error:", e);
    process.exit(1);
  });

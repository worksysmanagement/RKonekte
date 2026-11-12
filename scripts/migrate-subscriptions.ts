import { Client } from "pg";
import {
  DEFAULT_AUTO_MESSAGE_BODY,
  DEFAULT_PAYMENT_ACCOUNTS,
  DEFAULT_SUBSCRIPTION_SETTINGS,
  DAY_MS,
  parsePaymentAccounts,
} from "../src/lib/utils/subscription";

export async function runSubscriptionsMigration() {
  console.log("Starting Supabase migration for subscriptions & billing...");

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
    // 1. Add subscription tracking columns to organizations
    await client.query(`
      ALTER TABLE public.organizations
      ADD COLUMN IF NOT EXISTS activated_at BIGINT,
      ADD COLUMN IF NOT EXISTS last_renewed_at BIGINT,
      ADD COLUMN IF NOT EXISTS subscription_expires_at BIGINT,
      ADD COLUMN IF NOT EXISTS service_stopped BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS service_stopped_at BIGINT,
      ADD COLUMN IF NOT EXISTS last_reminder_type TEXT,
      ADD COLUMN IF NOT EXISTS last_reminder_cycle_exp BIGINT;
    `);
    console.log("✓ Columns added to public.organizations.");

    // 2. Create platform_subscription_settings table
    await client.query(`
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
    `);
    console.log("✓ Table public.platform_subscription_settings verified/created.");

    // 3. Create subscription_renewals table
    await client.query(`
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
    `);
    await client.query(`
      ALTER TABLE public.subscription_renewals
      ADD COLUMN IF NOT EXISTS payer_company_name TEXT,
      ADD COLUMN IF NOT EXISTS proof_data_url TEXT,
      ADD COLUMN IF NOT EXISTS proof_file_name TEXT;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS sub_renewals_org_idx ON public.subscription_renewals(organization_id);
      CREATE INDEX IF NOT EXISTS sub_renewals_status_idx ON public.subscription_renewals(organization_id, status);
    `);
    console.log("✓ Table public.subscription_renewals & indexes verified/created.");

    // 4. Enable RLS & open service_role policies (matching existing platform tables)
    await client.query(`
      ALTER TABLE IF EXISTS public.platform_subscription_settings ENABLE ROW LEVEL SECURITY;
      ALTER TABLE IF EXISTS public.subscription_renewals ENABLE ROW LEVEL SECURITY;
    `);
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = 'platform_subscription_settings' AND policyname = 'service_role_platform_subscription_settings'
        ) THEN
          CREATE POLICY service_role_platform_subscription_settings ON public.platform_subscription_settings FOR ALL USING (true) WITH CHECK (true);
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = 'subscription_renewals' AND policyname = 'service_role_subscription_renewals'
        ) THEN
          CREATE POLICY service_role_subscription_renewals ON public.subscription_renewals FOR ALL USING (true) WITH CHECK (true);
        END IF;
      END $$;
    `);
    console.log("✓ RLS & policies enabled.");

    // 5. Seed default platform subscription settings if absent
    const now = Date.now();
    await client.query(
      `
        INSERT INTO public.platform_subscription_settings (
          id, trial_months, currency, price_monthly, price_quarterly, price_semiannual, price_annual,
          discount_quarterly_pct, discount_semiannual_pct, discount_annual_pct,
          payment_accounts, auto_message_title, auto_message_body, super_admin_alert_email, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (id) DO NOTHING
      `,
      [
        "default",
        DEFAULT_SUBSCRIPTION_SETTINGS.trialMonths,
        DEFAULT_SUBSCRIPTION_SETTINGS.currency,
        DEFAULT_SUBSCRIPTION_SETTINGS.priceMonthly,
        DEFAULT_SUBSCRIPTION_SETTINGS.priceQuarterly,
        DEFAULT_SUBSCRIPTION_SETTINGS.priceSemiannual,
        DEFAULT_SUBSCRIPTION_SETTINGS.priceAnnual,
        DEFAULT_SUBSCRIPTION_SETTINGS.discountQuarterlyPct,
        DEFAULT_SUBSCRIPTION_SETTINGS.discountSemiannualPct,
        DEFAULT_SUBSCRIPTION_SETTINGS.discountAnnualPct,
        JSON.stringify(DEFAULT_SUBSCRIPTION_SETTINGS.paymentAccounts),
        DEFAULT_SUBSCRIPTION_SETTINGS.autoMessageTitle,
        DEFAULT_SUBSCRIPTION_SETTINGS.autoMessageBody,
        DEFAULT_SUBSCRIPTION_SETTINGS.superAdminAlertEmail,
        now,
      ]
    );
    console.log("✓ Default subscription settings seeded.");

    // 5b. Migrate default payment accounts to remove NatCash, include MonCash/Unibank/Sogebank & attach default logos
    const existingSettingsRes = await client.query(
      `SELECT payment_accounts, auto_message_body FROM public.platform_subscription_settings WHERE id = 'default' LIMIT 1;`
    );
    if (existingSettingsRes.rows.length > 0) {
      const currentAccounts = parsePaymentAccounts(existingSettingsRes.rows[0].payment_accounts);
      const hasNatcash = currentAccounts.some(
        (a) => a.id === "natcash" || a.label.toLowerCase().includes("natcash")
      );
      const hasUnibank = currentAccounts.some(
        (a) => a.id === "unibank" || a.label.toLowerCase().includes("unibank")
      );
      const hasSogebank = currentAccounts.some(
        (a) => a.id === "sogebank" || a.label.toLowerCase().includes("sogebank")
      );
      const missingKnownLogo = currentAccounts.some((a) => {
        const key = `${a.id} ${a.label}`.toLowerCase();
        return (
          !a.logoUrl &&
          (key.includes("moncash") || key.includes("unibank") || key.includes("sogebank"))
        );
      });

      if (hasNatcash || !hasUnibank || !hasSogebank || missingKnownLogo) {
        const filtered = currentAccounts
          .filter(
            (a) =>
              a.id !== "natcash" &&
              !a.label.toLowerCase().includes("natcash") &&
              !(a.id === "bank" && a.enabled === false)
          )
          .map((a) => {
            if (a.logoUrl) return a;
            const key = `${a.id} ${a.label}`.toLowerCase();
            if (key.includes("moncash")) return { ...a, logoUrl: "/payment-logos/moncash.png" };
            if (key.includes("unibank")) return { ...a, logoUrl: "/payment-logos/unibank.png" };
            if (key.includes("sogebank")) return { ...a, logoUrl: "/payment-logos/sogebank.png" };
            return a;
          });
        const byId = new Map(filtered.map((a) => [a.id, a]));
        for (const defAcc of DEFAULT_PAYMENT_ACCOUNTS) {
          if (!byId.has(defAcc.id)) {
            byId.set(defAcc.id, defAcc);
          }
        }
        const mergedAccounts = Array.from(byId.values());
        await client.query(
          `UPDATE public.platform_subscription_settings SET payment_accounts = $1, auto_message_body = $2, updated_at = $3 WHERE id = 'default';`,
          [
            JSON.stringify(mergedAccounts),
            existingSettingsRes.rows[0].auto_message_body?.includes("ci-dessous")
              ? DEFAULT_AUTO_MESSAGE_BODY
              : existingSettingsRes.rows[0].auto_message_body,
            now,
          ]
        );
        console.log("✓ Payment accounts & logos updated (MonCash, Unibank & Sogebank).");
      }
    }

    // 6. Initialize existing active organizations as expired + service stopped so the SuperAdmin & user can test the display immediately (idempotent: only applies where subscription_expires_at is still NULL)
    const yesterday = now - 2 * DAY_MS;
    const res = await client.query(
      `
        UPDATE public.organizations
        SET
          activated_at = COALESCE(activated_at, created_at),
          subscription_expires_at = $1,
          service_stopped = true,
          service_stopped_at = $2,
          updated_at = $2
        WHERE status = 'ACTIVE'
          AND subscription_expires_at IS NULL
        RETURNING id, name;
      `,
      [yesterday, now]
    );
    console.log(`✓ Marked ${res.rowCount || 0} existing active organizations as expired & stopped for immediate verification/testing.`);
    for (const r of res.rows) {
      console.log(`   - ${r.name} (${r.id})`);
    }
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  runSubscriptionsMigration()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error("Migration error:", e);
      process.exit(1);
    });
}

import { getDb } from "@/lib/db/client";
import {
  organizations,
  platformSubscriptionSettings,
  subscriptionRenewals,
  users,
} from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { supabaseDb } from "@/lib/supabase/db";
import {
  addCalendarMonths,
  buildSubscriptionPlans,
  calculateRenewalWindow,
  computeDiscountedPrice,
  computeSubscriptionState,
  DEFAULT_SUBSCRIPTION_SETTINGS,
  formatFrDate,
  formatMoney,
  getCalendarDaysUntilExpiration,
  getPlanForDuration,
  isSubscriptionAccessBlocked,
  parsePaymentAccounts,
  PaymentAccountConfig,
  PlatformSubscriptionSettingsData,
  SubscriptionRenewalItem,
} from "@/lib/utils/subscription";
import {
  generateSubscriptionDecisionEmail,
  generateSubscriptionReminderEmail,
  generateSubscriptionWelcomeEmail,
  generateSuperAdminPaymentSubmittedEmail,
  resolveAppOrigin,
  sendEmail,
} from "@/lib/notifications/email";

function mapSqliteSettings(row: any): PlatformSubscriptionSettingsData {
  if (!row) return { ...DEFAULT_SUBSCRIPTION_SETTINGS };
  return {
    id: row.id || "default",
    trialMonths: Number(row.trialMonths ?? 1),
    currency: row.currency || "USD",
    priceMonthly: Number(row.priceMonthly ?? 50),
    priceQuarterly: Number(row.priceQuarterly ?? 135),
    priceSemiannual: Number(row.priceSemiannual ?? 255),
    priceAnnual: Number(row.priceAnnual ?? 510),
    discountQuarterlyPct: Number(row.discountQuarterlyPct ?? 10),
    discountSemiannualPct: Number(row.discountSemiannualPct ?? 15),
    discountAnnualPct: Number(row.discountAnnualPct ?? 15),
    paymentAccounts: parsePaymentAccounts(row.paymentAccounts),
    autoMessageTitle:
      row.autoMessageTitle || DEFAULT_SUBSCRIPTION_SETTINGS.autoMessageTitle,
    autoMessageBody:
      row.autoMessageBody || DEFAULT_SUBSCRIPTION_SETTINGS.autoMessageBody,
    superAdminAlertEmail:
      row.superAdminAlertEmail || DEFAULT_SUBSCRIPTION_SETTINGS.superAdminAlertEmail,
    updatedAt: Number(row.updatedAt || 0),
  };
}

function mapSqliteRenewal(row: any): SubscriptionRenewalItem {
  return {
    id: row.id,
    organizationId: row.organizationId,
    durationMonths: Number(row.durationMonths),
    amountExpected: Number(row.amountExpected ?? 0),
    currency: row.currency || "USD",
    paymentMethod: row.paymentMethod,
    paymentReference: row.paymentReference ?? null,
    payerCompanyName: row.payerCompanyName ?? null,
    payerNote: row.payerNote ?? null,
    proofDataUrl: row.proofDataUrl ?? null,
    proofFileName: row.proofFileName ?? null,
    status: row.status,
    periodStart: row.periodStart != null ? Number(row.periodStart) : null,
    periodEnd: row.periodEnd != null ? Number(row.periodEnd) : null,
    submittedByUserId: row.submittedByUserId ?? null,
    submittedByName: row.submittedByName ?? null,
    submittedByEmail: row.submittedByEmail ?? null,
    reviewedByUserId: row.reviewedByUserId ?? null,
    reviewedByName: row.reviewedByName ?? null,
    reviewedAt: row.reviewedAt != null ? Number(row.reviewedAt) : null,
    rejectionReason: row.rejectionReason ?? null,
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  };
}

export async function getPlatformSubscriptionSettings(
  dbInstance?: any
): Promise<PlatformSubscriptionSettingsData> {
  if (!dbInstance) {
    return await supabaseDb.subscriptions.getSettings();
  }
  const db = dbInstance || getDb();
  const [row] = await db
    .select()
    .from(platformSubscriptionSettings)
    .where(eq(platformSubscriptionSettings.id, "default"))
    .limit(1);

  return mapSqliteSettings(row);
}

export async function updatePlatformSubscriptionSettings(
  input: {
    trialMonths?: number;
    currency?: string;
    priceMonthly?: number;
    priceQuarterly?: number;
    priceSemiannual?: number;
    priceAnnual?: number;
    discountQuarterlyPct?: number;
    discountSemiannualPct?: number;
    discountAnnualPct?: number;
    paymentAccounts?: PaymentAccountConfig[];
    autoMessageTitle?: string;
    autoMessageBody?: string;
    superAdminAlertEmail?: string;
  },
  dbInstance?: any
): Promise<PlatformSubscriptionSettingsData> {
  const current = await getPlatformSubscriptionSettings(dbInstance);

  const trialMonths = Math.max(1, Math.min(12, Math.floor(Number(input.trialMonths ?? current.trialMonths) || 1)));
  const currency = (input.currency ?? current.currency ?? "USD").trim().toUpperCase() || "USD";
  const priceMonthly = Math.max(1, Number(input.priceMonthly ?? current.priceMonthly) || 50);

  const discountQuarterlyPct = Math.min(
    90,
    Math.max(0, Number(input.discountQuarterlyPct ?? current.discountQuarterlyPct))
  );
  const discountSemiannualPct = Math.min(
    90,
    Math.max(0, Number(input.discountSemiannualPct ?? current.discountSemiannualPct))
  );
  const discountAnnualPct = Math.min(
    90,
    Math.max(0, Number(input.discountAnnualPct ?? current.discountAnnualPct))
  );

  const priceQuarterly =
    input.priceQuarterly !== undefined
      ? Math.max(1, Number(input.priceQuarterly) || computeDiscountedPrice(priceMonthly, 3, discountQuarterlyPct))
      : current.priceQuarterly;
  const priceSemiannual =
    input.priceSemiannual !== undefined
      ? Math.max(1, Number(input.priceSemiannual) || computeDiscountedPrice(priceMonthly, 6, discountSemiannualPct))
      : current.priceSemiannual;
  const priceAnnual =
    input.priceAnnual !== undefined
      ? Math.max(1, Number(input.priceAnnual) || computeDiscountedPrice(priceMonthly, 12, discountAnnualPct))
      : current.priceAnnual;

  const paymentAccounts = input.paymentAccounts
    ? parsePaymentAccounts(input.paymentAccounts)
    : current.paymentAccounts;

  const autoMessageTitle =
    (input.autoMessageTitle ?? current.autoMessageTitle).trim() ||
    DEFAULT_SUBSCRIPTION_SETTINGS.autoMessageTitle;
  const autoMessageBody =
    (input.autoMessageBody ?? current.autoMessageBody).trim() ||
    DEFAULT_SUBSCRIPTION_SETTINGS.autoMessageBody;
  const superAdminAlertEmail =
    (input.superAdminAlertEmail ?? current.superAdminAlertEmail ?? "").trim();

  if (!dbInstance) {
    return await supabaseDb.subscriptions.upsertSettings({
      trialMonths,
      currency,
      priceMonthly,
      priceQuarterly,
      priceSemiannual,
      priceAnnual,
      discountQuarterlyPct,
      discountSemiannualPct,
      discountAnnualPct,
      paymentAccounts,
      autoMessageTitle,
      autoMessageBody,
      superAdminAlertEmail,
    });
  }

  const db = dbInstance || getDb();
  const now = Date.now();
  const payload = {
    id: "default",
    trialMonths,
    currency,
    priceMonthly,
    priceQuarterly,
    priceSemiannual,
    priceAnnual,
    discountQuarterlyPct,
    discountSemiannualPct,
    discountAnnualPct,
    paymentAccounts: JSON.stringify(paymentAccounts),
    autoMessageTitle,
    autoMessageBody,
    superAdminAlertEmail,
    updatedAt: now,
  };

  const [existing] = await db
    .select()
    .from(platformSubscriptionSettings)
    .where(eq(platformSubscriptionSettings.id, "default"))
    .limit(1);

  if (existing) {
    await db
      .update(platformSubscriptionSettings)
      .set(payload)
      .where(eq(platformSubscriptionSettings.id, "default"));
  } else {
    await db.insert(platformSubscriptionSettings).values(payload);
  }

  return await getPlatformSubscriptionSettings(db);
}

async function getOrgAndAdminInternal(orgId: string, dbInstance?: any) {
  if (!dbInstance) {
    const org = await supabaseDb.organizations.getById(orgId);
    const admin = org ? await supabaseDb.subscriptions.getOrgAdminUser(orgId) : null;
    return { org, admin };
  }
  const db = dbInstance || getDb();
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const [admin] = org
    ? await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(and(eq(users.organizationId, orgId), eq(users.role, "ORGANIZATION_ADMIN")))
        .limit(1)
    : [];

  return { org: org || null, admin: admin || null };
}

export async function listOrganizationRenewalHistory(
  orgId: string,
  dbInstance?: any
): Promise<SubscriptionRenewalItem[]> {
  if (!dbInstance) {
    return await supabaseDb.subscriptions.listRenewalsForOrg(orgId);
  }
  const db = dbInstance || getDb();
  const rows = await db
    .select()
    .from(subscriptionRenewals)
    .where(eq(subscriptionRenewals.organizationId, orgId))
    .orderBy(desc(subscriptionRenewals.createdAt));

  return rows.map(mapSqliteRenewal);
}

export async function getOrganizationSubscriptionOverview(
  orgId: string,
  dbInstance?: any,
  nowMs: number = Date.now()
) {
  const [{ org }, settings, history] = await Promise.all([
    getOrgAndAdminInternal(orgId, dbInstance),
    getPlatformSubscriptionSettings(dbInstance),
    listOrganizationRenewalHistory(orgId, dbInstance),
  ]);

  if (!org) {
    throw new Error("Organisation introuvable");
  }

  const state = computeSubscriptionState(org, nowMs);
  const plans = buildSubscriptionPlans(settings);
  const pendingRenewal = history.find((h) => h.status === "PENDING") || null;
  const lastRejectedRenewal =
    !pendingRenewal ? history.find((h) => h.status === "REJECTED") || null : null;

  return {
    organization: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      email: org.email,
      status: org.status,
      createdAt: org.createdAt,
      activatedAt: org.activatedAt ?? null,
      lastRenewedAt: org.lastRenewedAt ?? null,
      subscriptionExpiresAt: org.subscriptionExpiresAt ?? null,
      serviceStopped: Boolean(org.serviceStopped),
      serviceStoppedAt: org.serviceStoppedAt ?? null,
    },
    state,
    settings,
    plans,
    paymentAccounts: settings.paymentAccounts.filter((a) => a.enabled),
    pendingRenewal,
    lastRejectedRenewal,
    history,
  };
}

export async function submitSubscriptionPaymentReference(
  params: {
    organizationId: string;
    durationMonths: number;
    paymentMethod: string;
    paymentReference?: string | null;
    payerCompanyName?: string | null;
    payerNote?: string | null;
    proofDataUrl?: string | null;
    proofFileName?: string | null;
    userId?: string | null;
    userName?: string | null;
    userEmail?: string | null;
    replacePending?: boolean;
    origin?: string;
  },
  dbInstance?: any
): Promise<SubscriptionRenewalItem> {
  const cleanRef = (params.paymentReference || "").trim();
  const cleanMethod = (params.paymentMethod || "").trim();
  const cleanCompanyName = params.payerCompanyName?.trim() || null;
  const cleanProofUrl = params.proofDataUrl?.trim() || null;
  const cleanProofName = params.proofFileName?.trim() || null;
  const durationMonths = Math.max(1, Math.floor(Number(params.durationMonths) || 1));

  if (!cleanMethod) {
    throw new Error("Veuillez sélectionner un mode de paiement.");
  }

  if (cleanProofUrl) {
    const isAllowedFormat =
      cleanProofUrl.startsWith("data:image/") ||
      cleanProofUrl.startsWith("data:application/pdf");
    if (!isAllowedFormat) {
      throw new Error(
        "Format de preuve non pris en charge. Veuillez importer une image (JPG, PNG, WEBP) ou un fichier PDF."
      );
    }
    if (cleanProofUrl.length > 7_500_000) {
      throw new Error("La preuve de paiement ne doit pas dépasser 5 Mo.");
    }
  }

  if (!cleanProofUrl && cleanRef.length < 3) {
    throw new Error(
      "Veuillez importer votre preuve de paiement (ou saisir une référence valide)."
    );
  }

  const [{ org }, settings, history] = await Promise.all([
    getOrgAndAdminInternal(params.organizationId, dbInstance),
    getPlatformSubscriptionSettings(dbInstance),
    listOrganizationRenewalHistory(params.organizationId, dbInstance),
  ]);

  if (!org) {
    throw new Error("Organisation introuvable.");
  }

  const existingPending = history.find((h) => h.status === "PENDING");
  if (existingPending && !params.replacePending) {
    const labelPending =
      existingPending.paymentReference || existingPending.proofFileName || "en cours";
    throw new Error(
      `Une demande (${labelPending}) est déjà en attente de vérification. Annulez-la d'abord si vous souhaitez la remplacer.`
    );
  }

  const plan = getPlanForDuration(durationMonths, settings);
  const now = Date.now();
  const renewalId = `ren-${crypto.randomUUID()}`;

  let created: SubscriptionRenewalItem;
  if (!dbInstance) {
    if (existingPending && params.replacePending) {
      await supabaseDb.subscriptions.deletePendingRenewal(
        existingPending.id,
        params.organizationId
      );
    }
    created = await supabaseDb.subscriptions.createRenewalRow({
      id: renewalId,
      organizationId: params.organizationId,
      durationMonths,
      amountExpected: plan.price,
      currency: plan.currency,
      paymentMethod: cleanMethod,
      paymentReference: cleanRef || null,
      payerCompanyName: cleanCompanyName,
      payerNote: params.payerNote?.trim() || null,
      proofDataUrl: cleanProofUrl,
      proofFileName: cleanProofName,
      status: "PENDING",
      submittedByUserId: params.userId || null,
      submittedByName: params.userName || null,
      submittedByEmail: params.userEmail || null,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    const db = dbInstance || getDb();
    if (existingPending && params.replacePending) {
      await db
        .delete(subscriptionRenewals)
        .where(
          and(
            eq(subscriptionRenewals.id, existingPending.id),
            eq(subscriptionRenewals.organizationId, params.organizationId),
            eq(subscriptionRenewals.status, "PENDING")
          )
        );
    }
    const row = {
      id: renewalId,
      organizationId: params.organizationId,
      durationMonths,
      amountExpected: plan.price,
      currency: plan.currency,
      paymentMethod: cleanMethod,
      paymentReference: cleanRef || null,
      payerCompanyName: cleanCompanyName,
      payerNote: params.payerNote?.trim() || null,
      proofDataUrl: cleanProofUrl,
      proofFileName: cleanProofName,
      status: "PENDING" as const,
      periodStart: null,
      periodEnd: null,
      submittedByUserId: params.userId || null,
      submittedByName: submittedByNameFix(params.userName),
      submittedByEmail: params.userEmail || null,
      reviewedByUserId: null,
      reviewedByName: null,
      reviewedAt: null,
      rejectionReason: null,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(subscriptionRenewals).values(row);
    created = mapSqliteRenewal(row);
  }

  // Send alert email to SuperAdmin (non-blocking)
  const alertEmail =
    settings.superAdminAlertEmail?.trim() || process.env.SMTP_USER?.trim() || "";
  if (alertEmail && !dbInstance) {
    try {
      const origin = resolveAppOrigin(undefined, params.origin);
      const { subject, html, text } = generateSuperAdminPaymentSubmittedEmail({
        companyName: org.name,
        payerCompanyName: cleanCompanyName,
        submittedByName: params.userName || "Administrateur",
        submittedByEmail: params.userEmail || org.email || "—",
        durationMonths,
        amountLabel: formatMoney(plan.price, plan.currency),
        paymentMethod: cleanMethod,
        paymentReference: cleanRef || null,
        proofFileName: cleanProofName,
        hasProof: Boolean(cleanProofUrl),
        payerNote: params.payerNote?.trim() || null,
        superAdminUrl: `${origin}/super-admin/organizations`,
      });
      await sendEmail({ to: alertEmail, subject, html, text });
    } catch (err) {
      console.error("Failed to send SuperAdmin payment alert email:", err);
    }
  }

  return created;
}

// small internal sanitizer helper kept next to usage
const submittedByNameFix = (v?: string | null) => (v ? v.trim() : null);

export async function cancelPendingSubscriptionReference(
  organizationId: string,
  dbInstance?: any
): Promise<void> {
  const history = await listOrganizationRenewalHistory(organizationId, dbInstance);
  const pending = history.find((h) => h.status === "PENDING");
  if (!pending) return;

  if (!dbInstance) {
    await supabaseDb.subscriptions.deletePendingRenewal(pending.id, organizationId);
    return;
  }

  const db = dbInstance || getDb();
  await db
    .delete(subscriptionRenewals)
    .where(
      and(
        eq(subscriptionRenewals.id, pending.id),
        eq(subscriptionRenewals.organizationId, organizationId),
        eq(subscriptionRenewals.status, "PENDING")
      )
    );
}

export async function approveSubscriptionRenewal(
  params: {
    organizationId: string;
    renewalId?: string | null;
    durationMonths: number;
    paymentMethod?: string;
    paymentReference?: string | null;
    customExpiresAt?: number | null;
    reviewerId?: string | null;
    reviewerName?: string | null;
    origin?: string;
  },
  dbInstance?: any,
  nowMs: number = Date.now()
) {
  const [{ org, admin }, settings] = await Promise.all([
    getOrgAndAdminInternal(params.organizationId, dbInstance),
    getPlatformSubscriptionSettings(dbInstance),
  ]);

  if (!org) {
    throw new Error("Organisation introuvable.");
  }

  const durationMonths = Math.max(1, Math.floor(Number(params.durationMonths) || 1));
  const plan = getPlanForDuration(durationMonths, settings);
  const calculated = calculateRenewalWindow(
    org.subscriptionExpiresAt,
    nowMs,
    durationMonths
  );
  const periodStart = calculated.periodStart;
  const periodEnd =
    params.customExpiresAt && params.customExpiresAt > nowMs
      ? params.customExpiresAt
      : calculated.periodEnd;

  let targetRenewal: SubscriptionRenewalItem | null = null;
  if (params.renewalId) {
    if (!dbInstance) {
      targetRenewal = await supabaseDb.subscriptions.getRenewalById(params.renewalId);
    } else {
      const db = dbInstance || getDb();
      const [row] = await db
        .select()
        .from(subscriptionRenewals)
        .where(
          and(
            eq(subscriptionRenewals.id, params.renewalId),
            eq(subscriptionRenewals.organizationId, params.organizationId)
          )
        )
        .limit(1);
      targetRenewal = row ? mapSqliteRenewal(row) : null;
    }
  }

  const effectiveMethod =
    params.paymentMethod?.trim() ||
    targetRenewal?.paymentMethod ||
    "Validation manuelle SuperAdmin";
  const effectiveRef =
    params.paymentReference !== undefined
      ? params.paymentReference?.trim() || null
      : targetRenewal?.paymentReference || null;

  let savedRenewal: SubscriptionRenewalItem;
  if (targetRenewal) {
    if (!dbInstance) {
      savedRenewal = await supabaseDb.subscriptions.updateRenewalRow(
        targetRenewal.id,
        params.organizationId,
        {
          durationMonths,
          amountExpected: plan.price,
          currency: plan.currency,
          paymentMethod: effectiveMethod,
          paymentReference: effectiveRef,
          status: "APPROVED",
          periodStart,
          periodEnd,
          reviewedByUserId: params.reviewerId || null,
          reviewedByName: params.reviewerName || "Super Administrateur",
          reviewedAt: nowMs,
          rejectionReason: null,
          updatedAt: nowMs,
        }
      );
    } else {
      const db = dbInstance || getDb();
      await db
        .update(subscriptionRenewals)
        .set({
          durationMonths,
          amountExpected: plan.price,
          currency: plan.currency,
          paymentMethod: effectiveMethod,
          paymentReference: effectiveRef,
          status: "APPROVED",
          periodStart,
          periodEnd,
          reviewedByUserId: params.reviewerId || null,
          reviewedByName: params.reviewerName || "Super Administrateur",
          reviewedAt: nowMs,
          rejectionReason: null,
          updatedAt: nowMs,
        })
        .where(eq(subscriptionRenewals.id, targetRenewal.id));

      const [row] = await db
        .select()
        .from(subscriptionRenewals)
        .where(eq(subscriptionRenewals.id, targetRenewal.id))
        .limit(1);
      savedRenewal = mapSqliteRenewal(row);
    }
  } else {
    const newId = `ren-${crypto.randomUUID()}`;
    if (!dbInstance) {
      savedRenewal = await supabaseDb.subscriptions.createRenewalRow({
        id: newId,
        organizationId: params.organizationId,
        durationMonths,
        amountExpected: plan.price,
        currency: plan.currency,
        paymentMethod: effectiveMethod,
        paymentReference: effectiveRef,
        payerNote: null,
        status: "APPROVED",
        periodStart,
        periodEnd,
        submittedByUserId: params.reviewerId || null,
        submittedByName: params.reviewerName || "Super Administrateur",
        submittedByEmail: null,
        reviewedByUserId: params.reviewerId || null,
        reviewedByName: params.reviewerName || "Super Administrateur",
        reviewedAt: nowMs,
        rejectionReason: null,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    } else {
      const db = dbInstance || getDb();
      const row = {
        id: newId,
        organizationId: params.organizationId,
        durationMonths,
        amountExpected: plan.price,
        currency: plan.currency,
        paymentMethod: effectiveMethod,
        paymentReference: effectiveRef,
        payerCompanyName: null,
        payerNote: null,
        proofDataUrl: null,
        proofFileName: null,
        status: "APPROVED" as const,
        periodStart,
        periodEnd,
        submittedByUserId: params.reviewerId || null,
        submittedByName: params.reviewerName || "Super Administrateur",
        submittedByEmail: null,
        reviewedByUserId: params.reviewerId || null,
        reviewedByName: params.reviewerName || "Super Administrateur",
        reviewedAt: nowMs,
        rejectionReason: null,
        createdAt: nowMs,
        updatedAt: nowMs,
      };
      await db.insert(subscriptionRenewals).values(row);
      savedRenewal = mapSqliteRenewal(row);
    }
  }

  // Update organization dates & lift service stop
  if (!dbInstance) {
    await supabaseDb.subscriptions.updateOrgSubscriptionFields(params.organizationId, {
      status: "ACTIVE",
      activatedAt: org.activatedAt ?? org.createdAt ?? nowMs,
      lastRenewedAt: nowMs,
      subscriptionExpiresAt: periodEnd,
      serviceStopped: false,
      serviceStoppedAt: null,
      lastReminderType: null,
      lastReminderCycleExp: null,
    });
  } else {
    const db = dbInstance || getDb();
    await db
      .update(organizations)
      .set({
        status: "ACTIVE",
        activatedAt: org.activatedAt ?? org.createdAt ?? nowMs,
        lastRenewedAt: nowMs,
        subscriptionExpiresAt: periodEnd,
        serviceStopped: false,
        serviceStoppedAt: null,
        lastReminderType: null,
        lastReminderCycleExp: null,
        updatedAt: nowMs,
      })
      .where(eq(organizations.id, params.organizationId));
  }

  // Email confirmation to client admin (non-blocking)
  const recipient = admin?.email || org.email;
  if (recipient && !dbInstance) {
    try {
      const origin = resolveAppOrigin(undefined, params.origin);
      const { subject, html, text } = generateSubscriptionDecisionEmail({
        decision: "APPROVED",
        recipientName: admin?.name || "Responsable",
        companyName: org.name,
        email: recipient,
        durationMonths,
        paymentMethod: effectiveMethod,
        paymentReference: effectiveRef,
        newExpiresAtLabel: formatFrDate(periodEnd),
        actionUrl: `${origin}/login`,
      });
      await sendEmail({ to: recipient, subject, html, text });
    } catch (err) {
      console.error("Failed to send renewal approval email:", err);
    }
  }

  return {
    renewal: savedRenewal,
    lastRenewedAt: nowMs,
    subscriptionExpiresAt: periodEnd,
    periodStart,
    periodEnd,
  };
}

export async function rejectSubscriptionRenewal(
  params: {
    organizationId: string;
    renewalId: string;
    rejectionReason: string;
    reviewerId?: string | null;
    reviewerName?: string | null;
    origin?: string;
  },
  dbInstance?: any,
  nowMs: number = Date.now()
): Promise<SubscriptionRenewalItem> {
  const reason = (params.rejectionReason || "").trim() || "Référence introuvable ou montant incorrect.";
  const [{ org, admin }, settings] = await Promise.all([
    getOrgAndAdminInternal(params.organizationId, dbInstance),
    getPlatformSubscriptionSettings(dbInstance),
  ]);

  if (!org) {
    throw new Error("Organisation introuvable.");
  }

  let updated: SubscriptionRenewalItem;
  if (!dbInstance) {
    updated = await supabaseDb.subscriptions.updateRenewalRow(
      params.renewalId,
      params.organizationId,
      {
        status: "REJECTED",
        rejectionReason: reason,
        reviewedByUserId: params.reviewerId || null,
        reviewedByName: params.reviewerName || "Super Administrateur",
        reviewedAt: nowMs,
        updatedAt: nowMs,
      }
    );
  } else {
    const db = dbInstance || getDb();
    await db
      .update(subscriptionRenewals)
      .set({
        status: "REJECTED",
        rejectionReason: reason,
        reviewedByUserId: params.reviewerId || null,
        reviewedByName: params.reviewerName || "Super Administrateur",
        reviewedAt: nowMs,
        updatedAt: nowMs,
      })
      .where(
        and(
          eq(subscriptionRenewals.id, params.renewalId),
          eq(subscriptionRenewals.organizationId, params.organizationId)
        )
      );

    const [row] = await db
      .select()
      .from(subscriptionRenewals)
      .where(eq(subscriptionRenewals.id, params.renewalId))
      .limit(1);
    updated = mapSqliteRenewal(row);
  }

  const recipient = updated.submittedByEmail || admin?.email || org.email;
  if (recipient && !dbInstance) {
    try {
      const origin = resolveAppOrigin(undefined, params.origin);
      const { subject, html, text } = generateSubscriptionDecisionEmail({
        decision: "REJECTED",
        recipientName: admin?.name || updated.submittedByName || "Responsable",
        companyName: org.name,
        email: recipient,
        durationMonths: updated.durationMonths,
        paymentMethod: updated.paymentMethod,
        paymentReference: updated.paymentReference,
        rejectionReason: reason,
        paymentAccounts: settings.paymentAccounts,
        actionUrl: `${origin}/login`,
      });
      await sendEmail({ to: recipient, subject, html, text });
    } catch (err) {
      console.error("Failed to send renewal rejection email:", err);
    }
  }

  return updated;
}

export async function stopOrganizationService(
  organizationId: string,
  dbInstance?: any,
  nowMs: number = Date.now()
) {
  if (!dbInstance) {
    return await supabaseDb.subscriptions.updateOrgSubscriptionFields(organizationId, {
      serviceStopped: true,
      serviceStoppedAt: nowMs,
    });
  }
  const db = dbInstance || getDb();
  await db
    .update(organizations)
    .set({
      serviceStopped: true,
      serviceStoppedAt: nowMs,
      updatedAt: nowMs,
    })
    .where(eq(organizations.id, organizationId));
}

export async function resumeOrganizationService(
  organizationId: string,
  dbInstance?: any,
  nowMs: number = Date.now()
) {
  const { org } = await getOrgAndAdminInternal(organizationId, dbInstance);
  if (!org) {
    throw new Error("Organisation introuvable.");
  }
  if (
    org.subscriptionExpiresAt &&
    getCalendarDaysUntilExpiration(org.subscriptionExpiresAt, nowMs) < 0
  ) {
    throw new Error(
      "L'abonnement de cette entreprise est expiré. Veuillez valider un renouvellement (avec une nouvelle date d'expiration future) pour réactiver l'accès."
    );
  }

  if (!dbInstance) {
    return await supabaseDb.subscriptions.updateOrgSubscriptionFields(organizationId, {
      status: "ACTIVE",
      serviceStopped: false,
      serviceStoppedAt: null,
    });
  }
  const db = dbInstance || getDb();
  await db
    .update(organizations)
    .set({
      status: "ACTIVE",
      serviceStopped: false,
      serviceStoppedAt: null,
      updatedAt: nowMs,
    })
    .where(eq(organizations.id, organizationId));
}

/**
 * Passive deduplicated reminder dispatcher triggered when org activity runs in /admin.
 * Sends at J-7 (daysRemaining in 2..7) and a final J-1/J-0 reminder (daysRemaining in 0..1),
 * at most once per reminder tier per subscription expiration cycle.
 */
export async function maybeSendSubscriptionReminders(
  organizationId: string,
  origin?: string,
  dbInstance?: any,
  nowMs: number = Date.now()
): Promise<{ sentType: "J7" | "J1" | null }> {
  try {
    const [{ org, admin }, settings] = await Promise.all([
      getOrgAndAdminInternal(organizationId, dbInstance),
      getPlatformSubscriptionSettings(dbInstance),
    ]);

    if (!org || org.status !== "ACTIVE" || org.serviceStopped || !org.subscriptionExpiresAt) {
      return { sentType: null };
    }

    const state = computeSubscriptionState(org, nowMs);
    if (state.daysRemaining === null || state.daysRemaining > 7 || state.daysRemaining < 0) {
      return { sentType: null };
    }

    const targetType: "J7" | "J1" = state.daysRemaining <= 1 ? "J1" : "J7";
    const cycleExp = org.subscriptionExpiresAt;

    if (
      org.lastReminderCycleExp === cycleExp &&
      (org.lastReminderType === targetType ||
        (targetType === "J7" && org.lastReminderType === "J1"))
    ) {
      return { sentType: null };
    }

    // Mark cycle reminder first to avoid duplicate concurrent dispatches
    if (!dbInstance) {
      await supabaseDb.subscriptions.updateOrgSubscriptionFields(organizationId, {
        lastReminderType: targetType,
        lastReminderCycleExp: cycleExp,
      });
    } else {
      const db = dbInstance || getDb();
      await db
        .update(organizations)
        .set({
          lastReminderType: targetType,
          lastReminderCycleExp: cycleExp,
          updatedAt: nowMs,
        })
        .where(eq(organizations.id, organizationId));
    }

    const recipient = admin?.email || org.email;
    if (!recipient) return { sentType: null };

    const appOrigin = resolveAppOrigin(undefined, origin);
    const { subject, html, text } = generateSubscriptionReminderEmail({
      recipientName: admin?.name || "Responsable",
      companyName: org.name,
      email: recipient,
      daysRemaining: state.daysRemaining,
      expiresAtLabel: formatFrDate(cycleExp),
      autoMessageTitle: settings.autoMessageTitle,
      autoMessageBody: settings.autoMessageBody,
      plans: buildSubscriptionPlans(settings),
      paymentAccounts: settings.paymentAccounts,
      subscriptionUrl: `${appOrigin}/login`,
    });

    await sendEmail({ to: recipient, subject, html, text });
    return { sentType: targetType };
  } catch (err) {
    console.error("maybeSendSubscriptionReminders error:", err);
    return { sentType: null };
  }
}

export async function sendSubscriptionActivationWelcomeEmail(params: {
  organizationId: string;
  recipientEmail: string;
  recipientName?: string;
  companyName: string;
  expiresAt: number;
  origin?: string;
  dbInstance?: any;
}): Promise<void> {
  try {
    const settings = await getPlatformSubscriptionSettings(params.dbInstance);
    const appOrigin = resolveAppOrigin(undefined, params.origin);
    const { subject, html, text } = generateSubscriptionWelcomeEmail({
      recipientName: params.recipientName,
      companyName: params.companyName,
      email: params.recipientEmail,
      trialMonths: settings.trialMonths,
      expiresAtLabel: formatFrDate(params.expiresAt),
      plans: buildSubscriptionPlans(settings),
      paymentAccounts: settings.paymentAccounts,
      autoMessageBody: settings.autoMessageBody,
      subscriptionUrl: `${appOrigin}/login`,
    });

    await sendEmail({
      to: params.recipientEmail,
      subject,
      html,
      text,
    });
  } catch (err) {
    console.error("sendSubscriptionActivationWelcomeEmail error:", err);
  }
}

// Re-export pure util for convenience
export { addCalendarMonths };

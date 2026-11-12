export type SubscriptionDurationMonths = 1 | 3 | 6 | 12;

export interface PaymentAccountConfig {
  id: string;
  label: string;
  accountName: string;
  accountNumber: string;
  instructions: string;
  logoUrl?: string | null;
  enabled: boolean;
}

export interface PlatformSubscriptionSettingsData {
  id: string;
  trialMonths: number;
  currency: string;
  priceMonthly: number;
  priceQuarterly: number;
  priceSemiannual: number;
  priceAnnual: number;
  discountQuarterlyPct: number;
  discountSemiannualPct: number;
  discountAnnualPct: number;
  paymentAccounts: PaymentAccountConfig[];
  autoMessageTitle: string;
  autoMessageBody: string;
  superAdminAlertEmail: string;
  updatedAt: number;
}

export interface SubscriptionPlanOption {
  durationMonths: SubscriptionDurationMonths;
  label: string;
  shortLabel: string;
  price: number;
  baseTotal: number;
  discountPct: number;
  savings: number;
  pricePerMonth: number;
  currency: string;
}

export interface SubscriptionRenewalItem {
  id: string;
  organizationId: string;
  durationMonths: number;
  amountExpected: number;
  currency: string;
  paymentMethod: string;
  paymentReference: string | null;
  payerCompanyName?: string | null;
  payerNote: string | null;
  proofDataUrl?: string | null;
  proofFileName?: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  periodStart: number | null;
  periodEnd: number | null;
  submittedByUserId: string | null;
  submittedByName: string | null;
  submittedByEmail: string | null;
  reviewedByUserId: string | null;
  reviewedByName: string | null;
  reviewedAt: number | null;
  rejectionReason: string | null;
  createdAt: number;
  updatedAt: number;
}

export type SubscriptionPhase =
  | "PENDING_ACTIVATION"
  | "SERVICE_STOPPED"
  | "EXPIRED"
  | "EXPIRING_SOON"
  | "ACTIVE";

export interface SubscriptionStateSummary {
  phase: SubscriptionPhase;
  activatedAt: number | null;
  lastRenewedAt: number | null;
  subscriptionExpiresAt: number | null;
  serviceStopped: boolean;
  serviceStoppedAt: number | null;
  daysRemaining: number | null;
  isExpired: boolean;
  isAccessBlocked: boolean;
  shouldShowCountdownBanner: boolean;
  countdownLabel: string;
}

export const DAY_MS = 24 * 60 * 60 * 1000;
const HAITI_TIMEZONE = "America/Port-au-Prince";

export const DEFAULT_PAYMENT_ACCOUNTS: PaymentAccountConfig[] = [
  {
    id: "moncash",
    label: "MonCash",
    accountName: "RKonekte",
    accountNumber: "À configurer dans le SuperAdmin",
    instructions: "Effectuez le transfert MonCash puis importez votre preuve de paiement.",
    logoUrl: "/payment-logos/moncash.png",
    enabled: true,
  },
  {
    id: "unibank",
    label: "Unibank",
    accountName: "RKonekte",
    accountNumber: "À configurer dans le SuperAdmin",
    instructions: "Effectuez le dépôt ou virement sur notre compte Unibank puis importez la preuve.",
    logoUrl: "/payment-logos/unibank.png",
    enabled: true,
  },
  {
    id: "sogebank",
    label: "Sogebank",
    accountName: "RKonekte",
    accountNumber: "À configurer dans le SuperAdmin",
    instructions: "Effectuez le dépôt ou virement sur notre compte Sogebank puis importez la preuve.",
    logoUrl: "/payment-logos/sogebank.png",
    enabled: true,
  },
];

export const DEFAULT_AUTO_MESSAGE_TITLE =
  "Renouvellement de votre abonnement RKonekte";

export const DEFAULT_AUTO_MESSAGE_BODY =
  "Votre premier mois d'utilisation est offert à compter de l'activation de votre compte. Pour conserver ou réactiver votre accès sans interruption, veuillez choisir la durée souhaitée, effectuer le règlement sur l'un des comptes disponibles, puis importer votre preuve de paiement pour validation manuelle.";

export const DEFAULT_SUBSCRIPTION_SETTINGS: PlatformSubscriptionSettingsData = {
  id: "default",
  trialMonths: 1,
  currency: "USD",
  priceMonthly: 50,
  priceQuarterly: 135, // 3 * 50 - 10%
  priceSemiannual: 255, // 6 * 50 - 15%
  priceAnnual: 510, // 12 * 50 - 15%
  discountQuarterlyPct: 10,
  discountSemiannualPct: 15,
  discountAnnualPct: 15,
  paymentAccounts: DEFAULT_PAYMENT_ACCOUNTS,
  autoMessageTitle: DEFAULT_AUTO_MESSAGE_TITLE,
  autoMessageBody: DEFAULT_AUTO_MESSAGE_BODY,
  superAdminAlertEmail: "rkonekte509@gmail.com",
  updatedAt: 0,
};

function getYmdInTimezone(timestampMs: number, timeZone = HAITI_TIMEZONE): {
  year: number;
  month: number;
  day: number;
} {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(timestampMs));

    const year = Number(parts.find((p) => p.type === "year")?.value);
    const month = Number(parts.find((p) => p.type === "month")?.value);
    const day = Number(parts.find((p) => p.type === "day")?.value);
    if (year && month && day) {
      return { year, month, day };
    }
  } catch (_) {}

  const d = new Date(timestampMs);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

/**
 * Adds N calendar months while clamping end-of-month dates cleanly
 * (e.g. Jan 31 + 1 month -> Feb 28/29 instead of overflowing into March).
 */
export function addCalendarMonths(timestampMs: number, months: number): number {
  const safeMonths = Math.max(1, Math.floor(Number(months) || 1));
  const { year, month, day } = getYmdInTimezone(timestampMs);
  const targetTotalMonths = year * 12 + (month - 1) + safeMonths;
  const targetYear = Math.floor(targetTotalMonths / 12);
  const targetMonthIndex = targetTotalMonths % 12; // 0-11

  const maxDayInTargetMonth = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, maxDayInTargetMonth);

  // Compute day delta cleanly so exact calendar day count stays aligned in Haiti timezone
  const currentMiddayUtc = Date.UTC(year, month - 1, day, 12, 0, 0);
  const targetMiddayUtc = Date.UTC(targetYear, targetMonthIndex, clampedDay, 12, 0, 0);
  const diffDays = Math.round((targetMiddayUtc - currentMiddayUtc) / DAY_MS);

  return timestampMs + diffDays * DAY_MS;
}

/**
 * Calculates renewal window:
 * - Paid in advance (expires May 10, approved May 5) -> starts from May 10 (no lost days)
 * - Paid after expiry (expired May 10, approved May 15) -> starts from May 15
 */
export function calculateRenewalWindow(
  currentExpiresAt: number | null | undefined,
  nowMs: number,
  durationMonths: number
): { periodStart: number; periodEnd: number } {
  const periodStart =
    currentExpiresAt && currentExpiresAt > nowMs ? currentExpiresAt : nowMs;
  const periodEnd = addCalendarMonths(periodStart, durationMonths);
  return { periodStart, periodEnd };
}

/**
 * Whole calendar days remaining until expiresAt in America/Port-au-Prince.
 * Positive = expires in N days, 0 = expires today, negative = expired N days ago.
 */
export function getCalendarDaysUntilExpiration(
  expiresAt: number,
  nowMs: number = Date.now()
): number {
  const nowYmd = getYmdInTimezone(nowMs);
  const expYmd = getYmdInTimezone(expiresAt);

  const nowDayUtc = Date.UTC(nowYmd.year, nowYmd.month - 1, nowYmd.day);
  const expDayUtc = Date.UTC(expYmd.year, expYmd.month - 1, expYmd.day);
  return Math.round((expDayUtc - nowDayUtc) / DAY_MS);
}

export function computeDiscountedPrice(
  monthlyPrice: number,
  durationMonths: number,
  discountPct: number
): number {
  const base = Math.max(0, Number(monthlyPrice) || 0) * durationMonths;
  const pct = Math.min(100, Math.max(0, Number(discountPct) || 0));
  return Math.round(base * (1 - pct / 100) * 100) / 100;
}

export function parsePaymentAccounts(raw: unknown): PaymentAccountConfig[] {
  if (Array.isArray(raw)) {
    return raw.map((item, idx) => ({
      id: String(item?.id || `acc-${idx + 1}`),
      label: String(item?.label || "Compte"),
      accountName: String(item?.accountName || ""),
      accountNumber: String(item?.accountNumber || ""),
      instructions: String(item?.instructions || ""),
      logoUrl:
        typeof item?.logoUrl === "string" && item.logoUrl.trim()
          ? item.logoUrl.trim()
          : null,
      enabled: item?.enabled !== false,
    }));
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsePaymentAccounts(parsed);
      }
    } catch (_) {}
  }
  return DEFAULT_PAYMENT_ACCOUNTS;
}

export function buildSubscriptionPlans(
  settings: PlatformSubscriptionSettingsData = DEFAULT_SUBSCRIPTION_SETTINGS
): SubscriptionPlanOption[] {
  const currency = settings.currency || "USD";
  const monthly = Number(settings.priceMonthly) || 50;

  const entries: Array<{
    durationMonths: SubscriptionDurationMonths;
    label: string;
    shortLabel: string;
    price: number;
    discountPct: number;
  }> = [
    {
      durationMonths: 1,
      label: "1 mois",
      shortLabel: "1 mois",
      price: monthly,
      discountPct: 0,
    },
    {
      durationMonths: 3,
      label: "3 mois",
      shortLabel: "3 mois",
      price: Number(settings.priceQuarterly) || computeDiscountedPrice(monthly, 3, settings.discountQuarterlyPct),
      discountPct: Number(settings.discountQuarterlyPct ?? 10),
    },
    {
      durationMonths: 6,
      label: "6 mois",
      shortLabel: "6 mois",
      price: Number(settings.priceSemiannual) || computeDiscountedPrice(monthly, 6, settings.discountSemiannualPct),
      discountPct: Number(settings.discountSemiannualPct ?? 15),
    },
    {
      durationMonths: 12,
      label: "12 mois (1 an)",
      shortLabel: "1 an",
      price: Number(settings.priceAnnual) || computeDiscountedPrice(monthly, 12, settings.discountAnnualPct),
      discountPct: Number(settings.discountAnnualPct ?? 15),
    },
  ];

  return entries.map((e) => {
    const baseTotal = Math.round(monthly * e.durationMonths * 100) / 100;
    const savings = Math.max(0, Math.round((baseTotal - e.price) * 100) / 100);
    const derivedDiscountPct =
      baseTotal > 0 && savings > 0
        ? Math.round(((baseTotal - e.price) / baseTotal) * 1000) / 10
        : e.discountPct;

    return {
      durationMonths: e.durationMonths,
      label: e.label,
      shortLabel: e.shortLabel,
      price: e.price,
      baseTotal,
      discountPct: derivedDiscountPct,
      savings,
      pricePerMonth: Math.round((e.price / e.durationMonths) * 100) / 100,
      currency,
    };
  });
}

export function getPlanForDuration(
  durationMonths: number,
  settings: PlatformSubscriptionSettingsData = DEFAULT_SUBSCRIPTION_SETTINGS
): SubscriptionPlanOption {
  const plans = buildSubscriptionPlans(settings);
  const found = plans.find((p) => p.durationMonths === durationMonths);
  if (found) return found;

  const monthly = Number(settings.priceMonthly) || 50;
  const months = Math.max(1, Math.floor(durationMonths));
  const price = Math.round(monthly * months * 100) / 100;
  return {
    durationMonths: (months === 3 || months === 6 || months === 12 ? months : 1) as SubscriptionDurationMonths,
    label: months === 12 ? "12 mois (1 an)" : `${months} mois`,
    shortLabel: `${months} mois`,
    price,
    baseTotal: price,
    discountPct: 0,
    savings: 0,
    pricePerMonth: monthly,
    currency: settings.currency || "USD",
  };
}

export function computeSubscriptionState(
  org: {
    status: string;
    activatedAt?: number | null;
    lastRenewedAt?: number | null;
    subscriptionExpiresAt?: number | null;
    serviceStopped?: boolean | null;
    serviceStoppedAt?: number | null;
    createdAt: number;
  },
  nowMs: number = Date.now()
): SubscriptionStateSummary {
  const activatedAt = org.activatedAt ?? null;
  const lastRenewedAt = org.lastRenewedAt ?? null;
  const subscriptionExpiresAt = org.subscriptionExpiresAt ?? null;
  const serviceStopped = Boolean(org.serviceStopped);
  const serviceStoppedAt = org.serviceStoppedAt ?? null;

  if (serviceStopped) {
    const daysRemaining = subscriptionExpiresAt
      ? getCalendarDaysUntilExpiration(subscriptionExpiresAt, nowMs)
      : null;
    return {
      phase: "SERVICE_STOPPED",
      activatedAt,
      lastRenewedAt,
      subscriptionExpiresAt,
      serviceStopped: true,
      serviceStoppedAt,
      daysRemaining,
      isExpired: daysRemaining !== null ? daysRemaining < 0 : true,
      isAccessBlocked: true,
      shouldShowCountdownBanner: false,
      countdownLabel: "Service arrêté",
    };
  }

  if (org.status !== "ACTIVE" && !subscriptionExpiresAt) {
    return {
      phase: "PENDING_ACTIVATION",
      activatedAt,
      lastRenewedAt,
      subscriptionExpiresAt: null,
      serviceStopped: false,
      serviceStoppedAt: null,
      daysRemaining: null,
      isExpired: false,
      isAccessBlocked: true,
      shouldShowCountdownBanner: false,
      countdownLabel: "En attente d'activation",
    };
  }

  if (!subscriptionExpiresAt) {
    return {
      phase: "ACTIVE",
      activatedAt: activatedAt ?? org.createdAt,
      lastRenewedAt,
      subscriptionExpiresAt: null,
      serviceStopped: false,
      serviceStoppedAt: null,
      daysRemaining: null,
      isExpired: false,
      isAccessBlocked: org.status !== "ACTIVE",
      shouldShowCountdownBanner: false,
      countdownLabel: "Actif",
    };
  }

  const daysRemaining = getCalendarDaysUntilExpiration(subscriptionExpiresAt, nowMs);

  if (daysRemaining < 0) {
    const overdueDays = Math.abs(daysRemaining);
    return {
      phase: "EXPIRED",
      activatedAt,
      lastRenewedAt,
      subscriptionExpiresAt,
      serviceStopped: false,
      serviceStoppedAt: null,
      daysRemaining,
      isExpired: true,
      isAccessBlocked: true,
      shouldShowCountdownBanner: false,
      countdownLabel: `Expiré depuis ${overdueDays} jour${overdueDays > 1 ? "s" : ""}`,
    };
  }

  if (daysRemaining <= 7) {
    return {
      phase: "EXPIRING_SOON",
      activatedAt,
      lastRenewedAt,
      subscriptionExpiresAt,
      serviceStopped: false,
      serviceStoppedAt: null,
      daysRemaining,
      isExpired: false,
      isAccessBlocked: org.status !== "ACTIVE",
      shouldShowCountdownBanner: true,
      countdownLabel:
        daysRemaining === 0
          ? "Expire aujourd'hui"
          : `Expire dans ${daysRemaining} jour${daysRemaining > 1 ? "s" : ""}`,
    };
  }

  return {
    phase: "ACTIVE",
    activatedAt,
    lastRenewedAt,
    subscriptionExpiresAt,
    serviceStopped: false,
    serviceStoppedAt: null,
    daysRemaining,
    isExpired: false,
    isAccessBlocked: org.status !== "ACTIVE",
    shouldShowCountdownBanner: false,
    countdownLabel: `${daysRemaining} jours restants`,
  };
}

/**
 * Returns true if tenant access must be blocked due to a manual service cutoff
 * OR an expired subscription (daysRemaining < 0). Reactivation by SuperAdmin
 * with a valid future expiration date is required to lift the block.
 */
export function isSubscriptionAccessBlocked(
  org:
    | {
        status?: string | null;
        activatedAt?: number | null;
        lastRenewedAt?: number | null;
        subscriptionExpiresAt?: number | null;
        serviceStopped?: boolean | null;
        serviceStoppedAt?: number | null;
        createdAt?: number;
      }
    | null
    | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!org) return true;
  if (org.serviceStopped) return true;
  if (!org.subscriptionExpiresAt) return false;
  return getCalendarDaysUntilExpiration(org.subscriptionExpiresAt, nowMs) < 0;
}

export function formatFrDate(timestampMs?: number | null): string {
  if (!timestampMs) return "—";
  try {
    return new Date(timestampMs).toLocaleDateString("fr-FR", {
      timeZone: HAITI_TIMEZONE,
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch (_) {
    return new Date(timestampMs).toLocaleDateString("fr-FR");
  }
}

export function formatMoney(amount: number, currency = "USD"): string {
  const num = Number(amount) || 0;
  const formatted = Number.isInteger(num) ? `${num}` : num.toFixed(2);
  return `${formatted} ${currency}`;
}

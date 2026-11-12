import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createTestDb } from "../src/lib/db/client";
import { runMigrations } from "../scripts/migrate";
import { organizations, users } from "../src/db/schema";
import {
  addCalendarMonths,
  buildSubscriptionPlans,
  calculateRenewalWindow,
  computeDiscountedPrice,
  computeSubscriptionState,
  DAY_MS,
  DEFAULT_SUBSCRIPTION_SETTINGS,
  getCalendarDaysUntilExpiration,
  isSubscriptionAccessBlocked,
} from "../src/lib/utils/subscription";
import {
  approveSubscriptionRenewal,
  cancelPendingSubscriptionReference,
  getOrganizationSubscriptionOverview,
  getPlatformSubscriptionSettings,
  listOrganizationRenewalHistory,
  rejectSubscriptionRenewal,
  resumeOrganizationService,
  stopOrganizationService,
  submitSubscriptionPaymentReference,
  updatePlatformSubscriptionSettings,
} from "../src/lib/services/subscriptions";
import {
  createOrganizationWithAdmin,
  listActiveOrganizations,
  listAllOrganizationsForSuperAdmin,
  listPendingOnboardingRequests,
} from "../src/lib/services/organizations";

describe("Subscription & Billing System", () => {
  let db: any;

  beforeEach(async () => {
    db = createTestDb(":memory:");
    await runMigrations(db);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Pure Date, Pricing & Countdown Calculations", () => {
    it("calculates default pricing for 1, 3 (-10%), 6 (-15%), and 12 (-15%) months", () => {
      const plans = buildSubscriptionPlans(DEFAULT_SUBSCRIPTION_SETTINGS);
      expect(plans).toHaveLength(4);

      expect(plans[0]).toMatchObject({
        durationMonths: 1,
        price: 50,
        discountPct: 0,
        savings: 0,
      });
      expect(plans[1]).toMatchObject({
        durationMonths: 3,
        price: 135,
        baseTotal: 150,
        discountPct: 10,
        savings: 15,
      });
      expect(plans[2]).toMatchObject({
        durationMonths: 6,
        price: 255,
        baseTotal: 300,
        discountPct: 15,
        savings: 45,
      });
      expect(plans[3]).toMatchObject({
        durationMonths: 12,
        price: 510,
        baseTotal: 600,
        discountPct: 15,
        savings: 90,
      });

      expect(computeDiscountedPrice(50, 3, 10)).toBe(135);
      expect(computeDiscountedPrice(50, 6, 15)).toBe(255);
      expect(computeDiscountedPrice(50, 12, 15)).toBe(510);
    });

    it("clamps end-of-month calendar dates cleanly (e.g. Jan 31 + 1 month -> Feb 28/29)", () => {
      const jan31NonLeap = Date.UTC(2026, 0, 31, 15, 0, 0);
      const febNonLeap = new Date(addCalendarMonths(jan31NonLeap, 1));
      expect(febNonLeap.getUTCFullYear()).toBe(2026);
      expect(febNonLeap.getUTCMonth()).toBe(1);
      expect(febNonLeap.getUTCDate()).toBe(28);

      const jan31Leap = Date.UTC(2028, 0, 31, 15, 0, 0);
      const febLeap = new Date(addCalendarMonths(jan31Leap, 1));
      expect(febLeap.getUTCFullYear()).toBe(2028);
      expect(febLeap.getUTCMonth()).toBe(1);
      expect(febLeap.getUTCDate()).toBe(29);
    });

    it("preserves remaining days on advance payments (May 5 payment for May 10 expiry starts May 10)", () => {
      const may10 = Date.UTC(2026, 4, 10, 14, 0, 0);
      const may5 = Date.UTC(2026, 4, 5, 14, 0, 0);
      const may15 = Date.UTC(2026, 4, 15, 14, 0, 0);

      // Advance payment: May 5 -> starts May 10 -> expires Jun 10
      const advanceWindow = calculateRenewalWindow(may10, may5, 1);
      expect(advanceWindow.periodStart).toBe(may10);
      expect(new Date(advanceWindow.periodEnd).getUTCMonth()).toBe(5);
      expect(new Date(advanceWindow.periodEnd).getUTCDate()).toBe(10);

      // Late payment: May 15 -> starts May 15 -> expires Jun 15
      const lateWindow = calculateRenewalWindow(may10, may15, 1);
      expect(lateWindow.periodStart).toBe(may15);
      expect(new Date(lateWindow.periodEnd).getUTCMonth()).toBe(5);
      expect(new Date(lateWindow.periodEnd).getUTCDate()).toBe(15);
    });

    it("triggers J-7 decrementing countdown (J-7..J-0) and marks expired without auto-stopping", () => {
      const baseNow = Date.UTC(2026, 4, 10, 14, 0, 0);

      // 8 days before expiry -> no banner yet
      const state8 = computeSubscriptionState(
        {
          status: "ACTIVE",
          createdAt: baseNow - 30 * DAY_MS,
          activatedAt: baseNow - 22 * DAY_MS,
          subscriptionExpiresAt: baseNow + 8 * DAY_MS,
          serviceStopped: false,
        },
        baseNow
      );
      expect(state8.phase).toBe("ACTIVE");
      expect(state8.daysRemaining).toBe(8);
      expect(state8.shouldShowCountdownBanner).toBe(false);

      // J-7 down to J-0
      for (let d = 7; d >= 0; d--) {
        const stateD = computeSubscriptionState(
          {
            status: "ACTIVE",
            createdAt: baseNow - 30 * DAY_MS,
            activatedAt: baseNow - 23 * DAY_MS,
            subscriptionExpiresAt: baseNow + d * DAY_MS,
            serviceStopped: false,
          },
          baseNow
        );
        expect(stateD.phase).toBe("EXPIRING_SOON");
        expect(stateD.daysRemaining).toBe(d);
        expect(stateD.shouldShowCountdownBanner).toBe(true);
        expect(stateD.isAccessBlocked).toBe(false);
        expect(stateD.serviceStopped).toBe(false);
      }

      // Expired 2 days ago -> EXPIRED & immediately blocks access without banner inside /admin
      const stateExpired = computeSubscriptionState(
        {
          status: "ACTIVE",
          createdAt: baseNow - 40 * DAY_MS,
          activatedAt: baseNow - 32 * DAY_MS,
          subscriptionExpiresAt: baseNow - 2 * DAY_MS,
          serviceStopped: false,
        },
        baseNow
      );
      expect(stateExpired.phase).toBe("EXPIRED");
      expect(stateExpired.isExpired).toBe(true);
      expect(stateExpired.isAccessBlocked).toBe(true);
      expect(stateExpired.shouldShowCountdownBanner).toBe(false);
      expect(stateExpired.serviceStopped).toBe(false);
      expect(stateExpired.daysRemaining).toBe(-2);
      expect(getCalendarDaysUntilExpiration(baseNow - 2 * DAY_MS, baseNow)).toBe(-2);
      expect(
        isSubscriptionAccessBlocked(
          {
            status: "ACTIVE",
            subscriptionExpiresAt: baseNow - 2 * DAY_MS,
            serviceStopped: false,
          },
          baseNow
        )
      ).toBe(true);
      expect(
        isSubscriptionAccessBlocked(
          {
            status: "ACTIVE",
            subscriptionExpiresAt: baseNow + 2 * DAY_MS,
            serviceStopped: false,
          },
          baseNow
        )
      ).toBe(false);
      expect(
        isSubscriptionAccessBlocked(
          {
            status: "ACTIVE",
            subscriptionExpiresAt: baseNow + 2 * DAY_MS,
            serviceStopped: true,
          },
          baseNow
        )
      ).toBe(true);
    });
  });

  describe("Subscription Settings, Payment Reference Workflow & Manual Service Cutoff", () => {
    it("defaults to MonCash, Unibank, and Sogebank without NatCash and persists account logos", async () => {
      const initial = await getPlatformSubscriptionSettings(db);
      expect(initial.priceMonthly).toBe(50);
      expect(initial.priceQuarterly).toBe(135);
      expect(initial.paymentAccounts.map((a) => a.id)).toEqual([
        "moncash",
        "unibank",
        "sogebank",
      ]);
      expect(initial.paymentAccounts.map((a) => a.logoUrl)).toEqual([
        "/payment-logos/moncash.png",
        "/payment-logos/unibank.png",
        "/payment-logos/sogebank.png",
      ]);
      expect(
        initial.paymentAccounts.some((a) => a.label.toLowerCase().includes("natcash"))
      ).toBe(false);

      const updated = await updatePlatformSubscriptionSettings(
        {
          priceMonthly: 60,
          discountQuarterlyPct: 10,
          priceQuarterly: 162,
          paymentAccounts: [
            {
              id: "moncash",
              label: "MonCash",
              accountName: "RKonekte Haiti",
              accountNumber: "+509 3700-1234",
              instructions: "Notez votre société.",
              logoUrl: "/payment-logos/moncash.png",
              enabled: true,
            },
            {
              id: "unibank",
              label: "Unibank",
              accountName: "RKonekte SA",
              accountNumber: "100-200-3004",
              instructions: "Dépôt Unibank.",
              logoUrl: "/payment-logos/unibank.png",
              enabled: true,
            },
          ],
          autoMessageTitle: "Paiement mensuel RKonekte",
          autoMessageBody: "Merci de régler sur l'un des comptes ci-dessous.",
        },
        db
      );

      expect(updated.priceMonthly).toBe(60);
      expect(updated.priceQuarterly).toBe(162);
      expect(updated.paymentAccounts).toHaveLength(2);
      expect(updated.paymentAccounts[0].accountNumber).toBe("+509 3700-1234");
      expect(updated.paymentAccounts[0].logoUrl).toBe("/payment-logos/moncash.png");
      expect(updated.paymentAccounts[1].logoUrl).toBe("/payment-logos/unibank.png");
      expect(updated.autoMessageTitle).toBe("Paiement mensuel RKonekte");
    });

    it("accepts uploaded payment proof with optional company name and rejects empty submissions", async () => {
      const { organization, adminUser } = await createOrganizationWithAdmin(
        {
          name: "Entreprise Preuve",
          slug: "entreprise-preuve",
          email: "preuve@alpha.ht",
          adminName: "Marc Preuve",
          adminEmail: "marc@preuve.ht",
          adminPassword: "Password@123!",
        },
        db
      );

      // Missing both proof and reference -> reject
      await expect(
        submitSubscriptionPaymentReference(
          {
            organizationId: organization.id,
            durationMonths: 1,
            paymentMethod: "Unibank",
            paymentReference: "",
            proofDataUrl: null,
          },
          db
        )
      ).rejects.toThrow();

      // Unsupported proof MIME -> reject
      await expect(
        submitSubscriptionPaymentReference(
          {
            organizationId: organization.id,
            durationMonths: 1,
            paymentMethod: "Unibank",
            proofDataUrl: "data:text/plain;base64,SGVsbG8=",
            proofFileName: "malware.txt",
          },
          db
        )
      ).rejects.toThrow();

      // Valid PNG proof + optional company name without typed reference -> accept
      const proofOnly = await submitSubscriptionPaymentReference(
        {
          organizationId: organization.id,
          durationMonths: 6,
          paymentMethod: "Sogebank",
          payerCompanyName: "Société Exemple HA",
          proofDataUrl: "data:image/png;base64,iVBORw0KGgo=",
          proofFileName: "bordereau-sogebank.png",
          userId: adminUser.id,
          userName: adminUser.name,
          userEmail: adminUser.email,
        },
        db
      );

      expect(proofOnly.status).toBe("PENDING");
      expect(proofOnly.paymentMethod).toBe("Sogebank");
      expect(proofOnly.paymentReference).toBeNull();
      expect(proofOnly.payerCompanyName).toBe("Société Exemple HA");
      expect(proofOnly.proofDataUrl).toBe("data:image/png;base64,iVBORw0KGgo=");
      expect(proofOnly.proofFileName).toBe("bordereau-sogebank.png");

      const overview = await getOrganizationSubscriptionOverview(organization.id, db);
      expect(overview.pendingRenewal?.proofFileName).toBe("bordereau-sogebank.png");
      expect(overview.pendingRenewal?.payerCompanyName).toBe("Société Exemple HA");
    });

    it("supports full payment reference lifecycle: submit, replace, cancel, approve (advance & expired), reject, and history", async () => {
      const { organization, adminUser } = await createOrganizationWithAdmin(
        {
          name: "Entreprise Alpha",
          slug: "entreprise-alpha",
          email: "contact@alpha.ht",
          adminName: "Jean Alpha",
          adminEmail: "jean@alpha.ht",
          adminPassword: "Password@123!",
        },
        db
      );

      expect(organization.activatedAt).toBeTruthy();
      expect(organization.subscriptionExpiresAt).toBeTruthy();
      const firstTrialExp = organization.subscriptionExpiresAt!;

      // Reject invalid short reference
      await expect(
        submitSubscriptionPaymentReference(
          {
            organizationId: organization.id,
            durationMonths: 3,
            paymentMethod: "MonCash",
            paymentReference: "AB",
          },
          db
        )
      ).rejects.toThrow();

      // Submit valid reference for 3 months (-10% -> 135 USD)
      const submitted = await submitSubscriptionPaymentReference(
        {
          organizationId: organization.id,
          durationMonths: 3,
          paymentMethod: "MonCash",
          paymentReference: "MC-100200",
          payerNote: "Payé ce matin",
          userId: adminUser.id,
          userName: adminUser.name,
          userEmail: adminUser.email,
        },
        db
      );
      expect(submitted.status).toBe("PENDING");
      expect(submitted.amountExpected).toBe(135);
      expect(submitted.paymentReference).toBe("MC-100200");

      // Prevent duplicate pending unless replacePending is true
      await expect(
        submitSubscriptionPaymentReference(
          {
            organizationId: organization.id,
            durationMonths: 6,
            paymentMethod: "Unibank",
            paymentReference: "UB-999999",
          },
          db
        )
      ).rejects.toThrow();

      const replaced = await submitSubscriptionPaymentReference(
        {
          organizationId: organization.id,
          durationMonths: 6,
          paymentMethod: "Unibank",
          paymentReference: "UB-999999",
          replacePending: true,
          userId: adminUser.id,
          userName: adminUser.name,
          userEmail: adminUser.email,
        },
        db
      );
      expect(replaced.amountExpected).toBe(255);
      expect(replaced.paymentReference).toBe("UB-999999");

      // SuperAdmin rejects wrong reference
      const rejected = await rejectSubscriptionRenewal(
        {
          organizationId: organization.id,
          renewalId: replaced.id,
          rejectionReason: "Numéro Unibank introuvable",
        },
        db
      );
      expect(rejected.status).toBe("REJECTED");
      expect(rejected.rejectionReason).toBe("Numéro Unibank introuvable");

      // Organization submits another reference in advance (5 days before expiry) and cancels it, then resubmits
      const pending2 = await submitSubscriptionPaymentReference(
        {
          organizationId: organization.id,
          durationMonths: 3,
          paymentMethod: "MonCash",
          paymentReference: "MC-RETRY-1",
          userId: adminUser.id,
        },
        db
      );
      await cancelPendingSubscriptionReference(organization.id, db);
      let history = await listOrganizationRenewalHistory(organization.id, db);
      expect(history).toHaveLength(1); // Only the REJECTED one remains

      const pending3 = await submitSubscriptionPaymentReference(
        {
          organizationId: organization.id,
          durationMonths: 3,
          paymentMethod: "MonCash",
          paymentReference: "MC-FINAL-333",
          userId: adminUser.id,
        },
        db
      );

      // Approve 5 days BEFORE firstTrialExp -> must start at firstTrialExp (no lost days!)
      const fiveDaysBefore = firstTrialExp - 5 * DAY_MS;
      const approved = await approveSubscriptionRenewal(
        {
          organizationId: organization.id,
          renewalId: pending3.id,
          durationMonths: 3,
          reviewerName: "SuperAdmin",
        },
        db,
        fiveDaysBefore
      );

      expect(approved.periodStart).toBe(firstTrialExp);
      expect(approved.subscriptionExpiresAt).toBe(addCalendarMonths(firstTrialExp, 3));

      const overview = await getOrganizationSubscriptionOverview(organization.id, db, fiveDaysBefore);
      expect(overview.organization.lastRenewedAt).toBe(fiveDaysBefore);
      expect(overview.organization.subscriptionExpiresAt).toBe(approved.subscriptionExpiresAt);
      expect(overview.history).toHaveLength(2); // REJECTED + APPROVED
    });

    it("manually stops & resumes service without corrupting status=DISABLED or onboarding queue", async () => {
      const { organization } = await createOrganizationWithAdmin(
        {
          name: "Entreprise Beta",
          slug: "entreprise-beta",
          email: "beta@ht.com",
          adminName: "Admin Beta",
          adminEmail: "admin@beta.ht",
          adminPassword: "Password@123!",
        },
        db
      );

      // Simulate stopped org
      await stopOrganizationService(organization.id, db);

      // Excluded from public active org selector
      const publicActive = await listActiveOrganizations(db);
      expect(publicActive.some((o: any) => o.id === organization.id)).toBe(false);

      // Must NOT leak into pending onboarding requests!
      const pendingOnboarding = await listPendingOnboardingRequests(db);
      expect(pendingOnboarding.some((o: any) => o.id === organization.id)).toBe(false);

      // Visible in SuperAdmin organizations list with serviceStopped = true
      const allOrgs = await listAllOrganizationsForSuperAdmin(db);
      const beta = allOrgs.find((o: any) => o.id === organization.id);
      expect(beta.status).toBe("ACTIVE");
      expect(beta.subscriptionState.serviceStopped).toBe(true);
      expect(beta.subscriptionState.phase).toBe("SERVICE_STOPPED");

      // Expired subscription blocks public active listing AND blocks manual resume without renewal
      const now = Date.now();
      const eqHelper = (await import("drizzle-orm")).eq;
      await db
        .update(organizations)
        .set({ subscriptionExpiresAt: now - 3 * DAY_MS, serviceStopped: false })
        .where(eqHelper(organizations.id, organization.id));

      const publicExpired = await listActiveOrganizations(db);
      expect(publicExpired.some((o: any) => o.id === organization.id)).toBe(false);

      await db
        .update(organizations)
        .set({ serviceStopped: true })
        .where(eqHelper(organizations.id, organization.id));

      await expect(resumeOrganizationService(organization.id, db, now)).rejects.toThrow(
        /expiré/i
      );

      // Approving a renewal automatically resumes service & restarts expired window from now
      const renewed = await approveSubscriptionRenewal(
        {
          organizationId: organization.id,
          durationMonths: 1,
          paymentMethod: "MonCash",
          paymentReference: "MC-UNBLOCK",
        },
        db,
        now
      );

      expect(renewed.periodStart).toBe(now);
      const afterOverview = await getOrganizationSubscriptionOverview(organization.id, db, now);
      expect(afterOverview.organization.serviceStopped).toBe(false);
      expect(afterOverview.state.phase).toBe("ACTIVE");
      expect(afterOverview.state.isAccessBlocked).toBe(false);

      const publicAfterRenewal = await listActiveOrganizations(db);
      expect(publicAfterRenewal.some((o: any) => o.id === organization.id)).toBe(true);

      // Manual stop and manual resume work while subscription is valid
      await stopOrganizationService(organization.id, db, now);
      await resumeOrganizationService(organization.id, db, now + 1000);
      const resumedOverview = await getOrganizationSubscriptionOverview(
        organization.id,
        db,
        now + 1000
      );
      expect(resumedOverview.organization.serviceStopped).toBe(false);
      expect(resumedOverview.organization.status).toBe("ACTIVE");
    });
  });
});

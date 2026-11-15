import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createTestDb } from "../src/lib/db/client";
import { runMigrations } from "../scripts/migrate";
import {
  organizations,
  users,
  subscriptionRenewals,
  revenueSharingConfigs,
  revenueSharingProposals,
  auditLogs,
} from "../src/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "../src/lib/auth/password";
import * as sessionLib from "../src/lib/auth/session";
import * as emailNotifications from "../src/lib/notifications/email";
import * as revenueSharingService from "../src/lib/services/revenue-sharing";
import {
  getActiveRevenueSharingConfig,
  updateRevenueSharingParties,
  calculateRevenueSplit,
  createRevenueSharingProposal,
  validateRevenueSharingProposal,
  cancelRevenueSharingProposal,
  snapshotRevenueForRenewal,
  getRevenueSharingMetrics,
  listRevenueSharingProposals,
} from "../src/lib/services/revenue-sharing";
import { GET as getRevenueSharingRoute, POST as postRevenueSharingRoute } from "../src/app/api/super-admin/revenue-sharing/route";
import { POST as postValidateRoute } from "../src/app/api/super-admin/revenue-sharing/validate/route";

describe("Dynamic Revenue Sharing System (TECHNOZI & Développeur)", () => {
  let db: any;
  let sentEmails: Array<{ to: string; subject: string; html: string; text?: string }> = [];

  const devUserId = "usr-dev-rodjy";
  const devEmail = "pitonrodjy@gmail.com";
  const dgUserId = "usr-dg-technozi";
  const dgEmail = "dg@technozi-ht.com";

  beforeAll(async () => {
    db = createTestDb(":memory:");
    await runMigrations(db);
  });

  beforeEach(async () => {
    // Truncate tables
    await db.delete(revenueSharingProposals);
    await db.delete(revenueSharingConfigs);
    await db.delete(subscriptionRenewals);
    await db.delete(auditLogs);
    await db.delete(users);
    await db.delete(organizations);

    sentEmails = [];
    vi.spyOn(emailNotifications, "sendEmail").mockImplementation(async (opts) => {
      sentEmails.push({
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      });
      return { success: true, id: `mock-email-${Date.now()}` };
    });

    const pwdHash = await hashPassword("SecurePass123!");

    // Seed SuperAdmins: Developer and DG
    await db.insert(users).values([
      {
        id: devUserId,
        name: "Rodjy Piton",
        email: devEmail,
        passwordHash: pwdHash,
        role: "SUPER_ADMIN",
        status: "ACTIVE",
        organizationId: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: dgUserId,
        name: "Directeur Général Technozi",
        email: dgEmail,
        passwordHash: pwdHash,
        role: "SUPER_ADMIN",
        status: "ACTIVE",
        organizationId: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);

    // Seed an active customer organization
    await db.insert(organizations).values({
      id: "org-client-1",
      name: "Acme Logistics",
      slug: "acme-logistics",
      email: "contact@acme.com",
      status: "ACTIVE",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Initial Configuration & Mathematical Split", () => {
    it("initializes with default 60% TECHNOZI / 40% Développeur", async () => {
      const config = await getActiveRevenueSharingConfig(db);
      expect(config.technoziPct).toBe(60);
      expect(config.developerPct).toBe(40);
    });

    it("calculates accurate splits for 510 USD at 60/40 and 70/30 without rounding gaps", () => {
      // 510 USD at 60/40
      const split6040 = calculateRevenueSplit(510, { technoziPct: 60, developerPct: 40 });
      expect(split6040.technoziAmount).toBe(306);
      expect(split6040.developerAmount).toBe(204);
      expect(split6040.technoziAmount + split6040.developerAmount).toBe(510);

      // 510 USD at 70/30 (User example!)
      const split7030 = calculateRevenueSplit(510, { technoziPct: 70, developerPct: 30 });
      expect(split7030.technoziAmount).toBe(357);
      expect(split7030.developerAmount).toBe(153);
      expect(split7030.technoziAmount + split7030.developerAmount).toBe(510);

      // 135 USD at 55/45
      const split5545 = calculateRevenueSplit(135, { technoziPct: 55, developerPct: 45 });
      expect(split5545.technoziAmount).toBe(74.25);
      expect(split5545.developerAmount).toBe(60.75);
      expect(split5545.technoziAmount + split5545.developerAmount).toBe(135);
    });
  });

  describe("2. Strict 100% Rule & Proposal Submission", () => {
    it("rejects proposals where sum is less than 100%", async () => {
      await expect(
        createRevenueSharingProposal(
          {
            proposedTechnoziPct: 60,
            proposedDeveloperPct: 35, // Sum = 95%
            targetEmail: dgEmail,
          },
          { id: devUserId, name: "Rodjy Piton", email: devEmail },
          db
        )
      ).rejects.toThrow("100 %");
    });

    it("rejects proposals where sum is greater than 100%", async () => {
      await expect(
        createRevenueSharingProposal(
          {
            proposedTechnoziPct: 70,
            proposedDeveloperPct: 35, // Sum = 105%
            targetEmail: dgEmail,
          },
          { id: devUserId, name: "Rodjy Piton", email: devEmail },
          db
        )
      ).rejects.toThrow("100 %");
    });

    it("rejects proposals where percentages are negative", async () => {
      await expect(
        createRevenueSharingProposal(
          {
            proposedTechnoziPct: 110,
            proposedDeveloperPct: -10,
            targetEmail: dgEmail,
          },
          { id: devUserId, name: "Rodjy Piton", email: devEmail },
          db
        )
      ).rejects.toThrow("négatifs");
    });

    it("rejects proposing identical percentages to the active config", async () => {
      await expect(
        createRevenueSharingProposal(
          {
            proposedTechnoziPct: 60,
            proposedDeveloperPct: 40,
            targetEmail: dgEmail,
          },
          { id: devUserId, name: "Rodjy Piton", email: devEmail },
          db
        )
      ).rejects.toThrow("identique");
    });

    it("creates proposal and sends email with direct access link to the target party", async () => {
      const proposal = await createRevenueSharingProposal(
        {
          proposedTechnoziPct: 70,
          proposedDeveloperPct: 30,
          targetEmail: dgEmail,
          note: "Ajustement convenu pour l'année 2026",
          originUrl: "https://app.rkonekte.com",
        },
        { id: devUserId, name: "Rodjy Piton", email: devEmail },
        db
      );

      expect(proposal.id).toBeDefined();
      expect(proposal.status).toBe("PENDING");
      expect(proposal.proposedTechnoziPct).toBe(70);
      expect(proposal.proposedDeveloperPct).toBe(30);

      // Verify email was sent to DG
      expect(sentEmails.length).toBe(1);
      expect(sentEmails[0].to).toBe(dgEmail);
      expect(sentEmails[0].subject).toContain("70%");
      expect(sentEmails[0].html).toContain("Accéder et Valider");
      expect(sentEmails[0].html).toContain(proposal.id);
    });
  });

  describe("3. Cross-Validation & Consensus Guard", () => {
    it("STRICTLY PREVENTS proposer from validating their own proposal", async () => {
      const proposal = await createRevenueSharingProposal(
        {
          proposedTechnoziPct: 70,
          proposedDeveloperPct: 30,
          targetEmail: dgEmail,
        },
        { id: devUserId, name: "Rodjy Piton", email: devEmail },
        db
      );

      // Proposer tries to validate
      await expect(
        validateRevenueSharingProposal(
          { proposalId: proposal.id, action: "APPROVE" },
          { id: devUserId, name: "Rodjy Piton", email: devEmail },
          db
        )
      ).rejects.toThrow("votre propre proposition");

      // Verify active config is STILL 60/40
      const active = await getActiveRevenueSharingConfig(db);
      expect(active.technoziPct).toBe(60);
      expect(active.developerPct).toBe(40);
    });

    it("activates the new split when validated by the other party (DG) and notifies both", async () => {
      const proposal = await createRevenueSharingProposal(
        {
          proposedTechnoziPct: 70,
          proposedDeveloperPct: 30,
          targetEmail: dgEmail,
        },
        { id: devUserId, name: "Rodjy Piton", email: devEmail },
        db
      );

      // Reset email buffer
      sentEmails = [];

      // Validated by DG
      const approved = await validateRevenueSharingProposal(
        { proposalId: proposal.id, action: "APPROVE" },
        { id: dgUserId, name: "Directeur Général Technozi", email: dgEmail },
        db
      );

      expect(approved.status).toBe("APPROVED");
      expect(approved.validatedByUserId).toBe(dgUserId);

      // Verify active config is now 70/30!
      const active = await getActiveRevenueSharingConfig(db);
      expect(active.technoziPct).toBe(70);
      expect(active.developerPct).toBe(30);

      // Verify confirmation email was sent
      expect(sentEmails.length).toBeGreaterThanOrEqual(1);
      expect(sentEmails.some((m) => m.to === devEmail)).toBe(true);
    });

    it("allows the other party to reject the proposal with a reason", async () => {
      const proposal = await createRevenueSharingProposal(
        {
          proposedTechnoziPct: 80,
          proposedDeveloperPct: 20,
          targetEmail: dgEmail,
        },
        { id: devUserId, name: "Rodjy Piton", email: devEmail },
        db
      );

      const rejected = await validateRevenueSharingProposal(
        {
          proposalId: proposal.id,
          action: "REJECT",
          rejectionReason: "Pourcentage proposé non aligné avec nos projections actuelles.",
        },
        { id: dgUserId, name: "Directeur Général Technozi", email: dgEmail },
        db
      );

      expect(rejected.status).toBe("REJECTED");
      expect(rejected.rejectionReason).toContain("non aligné");

      // Verify active config stayed 60/40!
      const active = await getActiveRevenueSharingConfig(db);
      expect(active.technoziPct).toBe(60);
      expect(active.developerPct).toBe(40);
    });

    it("allows the proposer to cancel their own pending proposal", async () => {
      const proposal = await createRevenueSharingProposal(
        {
          proposedTechnoziPct: 55,
          proposedDeveloperPct: 45,
          targetEmail: dgEmail,
        },
        { id: devUserId, name: "Rodjy Piton", email: devEmail },
        db
      );

      await cancelRevenueSharingProposal(proposal.id, devUserId, db);
      const list = await listRevenueSharingProposals(db);
      const target = list.find((p) => p.id === proposal.id);
      expect(target?.status).toBe("CANCELLED");
    });
  });

  describe("4. Non-Retroactivity & Snapshot Protection", () => {
    it("preserves original commissions on past transactions even after percentages change", async () => {
      const now = Date.now();

      // 1. Transaction 1 confirmed at 60/40 for 510 USD
      const ren1Id = "ren-past-1";
      await db.insert(subscriptionRenewals).values({
        id: ren1Id,
        organizationId: "org-client-1",
        durationMonths: 12,
        amountExpected: 510,
        currency: "USD",
        paymentMethod: "MonCash",
        status: "APPROVED",
        createdAt: now - 100000,
        updatedAt: now - 100000,
      });

      // Snapshot at 60/40
      await snapshotRevenueForRenewal(ren1Id, 510, db);

      // Verify renewal 1 has 306 (Technozi) / 204 (Developer)
      const [r1Before] = await db.select().from(subscriptionRenewals).where(eq(subscriptionRenewals.id, ren1Id));
      expect(r1Before.revenueTechnoziPct).toBe(60);
      expect(r1Before.revenueDeveloperPct).toBe(40);
      expect(r1Before.revenueTechnoziAmount).toBe(306);
      expect(r1Before.revenueDeveloperAmount).toBe(204);

      // 2. Change active configuration to 70/30 via bilateral proposal
      const proposal = await createRevenueSharingProposal(
        { proposedTechnoziPct: 70, proposedDeveloperPct: 30, targetEmail: dgEmail },
        { id: devUserId, name: "Rodjy Piton", email: devEmail },
        db
      );
      await validateRevenueSharingProposal(
        { proposalId: proposal.id, action: "APPROVE" },
        { id: dgUserId, name: "Directeur Général Technozi", email: dgEmail },
        db
      );

      // 3. Check past transaction again: MUST STILL BE 306 / 204!
      const [r1After] = await db.select().from(subscriptionRenewals).where(eq(subscriptionRenewals.id, ren1Id));
      expect(r1After.revenueTechnoziPct).toBe(60);
      expect(r1After.revenueDeveloperPct).toBe(40);
      expect(r1After.revenueTechnoziAmount).toBe(306);
      expect(r1After.revenueDeveloperAmount).toBe(204);

      // 4. New Transaction 2 confirmed after the change (70/30) for 510 USD
      const ren2Id = "ren-future-2";
      await db.insert(subscriptionRenewals).values({
        id: ren2Id,
        organizationId: "org-client-1",
        durationMonths: 12,
        amountExpected: 510,
        currency: "USD",
        paymentMethod: "Unibank",
        status: "APPROVED",
        createdAt: now,
        updatedAt: now,
      });

      await snapshotRevenueForRenewal(ren2Id, 510, db);

      // Verify renewal 2 has 357 (Technozi) / 153 (Developer)!
      const [r2] = await db.select().from(subscriptionRenewals).where(eq(subscriptionRenewals.id, ren2Id));
      expect(r2.revenueTechnoziPct).toBe(70);
      expect(r2.revenueDeveloperPct).toBe(30);
      expect(r2.revenueTechnoziAmount).toBe(357);
      expect(r2.revenueDeveloperAmount).toBe(153);

      // 5. Total Metrics calculation
      const metrics = await getRevenueSharingMetrics(db);
      expect(metrics.totalApprovedRevenue).toBe(1020);
      expect(metrics.totalTechnoziAmount).toBe(306 + 357); // 663 USD
      expect(metrics.totalDeveloperAmount).toBe(204 + 153); // 357 USD
      expect(metrics.approvedTransactionsCount).toBe(2);
    });
  });

  describe("5. API Routes Integration", () => {
    beforeEach(() => {
      vi.spyOn(sessionLib, "getSession").mockResolvedValue({
        id: devUserId,
        email: devEmail,
        name: "Rodjy Piton",
        role: "SUPER_ADMIN",
        organizationId: null,
      } as any);
    });

    it("GET /api/super-admin/revenue-sharing returns current config and metrics", async () => {
      const res = await getRevenueSharingRoute();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.config.technoziPct).toBe(60);
      expect(json.config.developerPct).toBe(40);
      expect(json.metrics).toBeDefined();
    });

    it("POST /api/super-admin/revenue-sharing creates a proposal", async () => {
      vi.spyOn(revenueSharingService, "createRevenueSharingProposal").mockResolvedValue({
        id: "mock-prop-test",
        previousTechnoziPct: 60,
        previousDeveloperPct: 40,
        proposedTechnoziPct: 65,
        proposedDeveloperPct: 35,
        status: "PENDING",
        proposedByUserId: devUserId,
        proposedByName: "Rodjy Piton",
        proposedByEmail: devEmail,
        targetEmail: dgEmail,
        targetName: null,
        validationToken: "mock-token",
        note: "Ajustement intermédiaire",
        validatedByUserId: null,
        validatedByName: null,
        validatedByEmail: null,
        validatedAt: null,
        rejectionReason: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const req = new NextRequest("http://localhost:3000/api/super-admin/revenue-sharing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposedTechnoziPct: 65,
          proposedDeveloperPct: 35,
          targetEmail: dgEmail,
          note: "Ajustement intermédiaire",
        }),
      });

      const res = await postRevenueSharingRoute(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.proposal.proposedTechnoziPct).toBe(65);
    });

    it("POST /api/super-admin/revenue-sharing/validate rejects when caller is the proposer", async () => {
      vi.spyOn(revenueSharingService, "validateRevenueSharingProposal").mockRejectedValue(
        new Error(
          "Action non autorisée : vous ne pouvez pas valider votre propre proposition. La validation doit impérativement être effectuée par l'autre partie (Directeur ou Développeur)."
        )
      );

      const req = new NextRequest("http://localhost:3000/api/super-admin/revenue-sharing/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposalId: "revprop-sample",
          action: "APPROVE",
        }),
      });

      const res = await postValidateRoute(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("votre propre proposition");
    });
  });
});

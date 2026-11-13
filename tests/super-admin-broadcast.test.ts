import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createTestDb } from "../src/lib/db/client";
import { runMigrations } from "../scripts/migrate";
import { organizations, users } from "../src/db/schema";
import { hashPassword } from "../src/lib/auth/password";
import * as sessionLib from "../src/lib/auth/session";
import * as emailNotifications from "../src/lib/notifications/email";
import * as organizationsService from "../src/lib/services/organizations";
import { POST as broadcastRoutePost } from "../src/app/api/super-admin/broadcast/route";
import { generateSuperAdminBroadcastEmail } from "../src/lib/notifications/email";

describe("SuperAdmin Broadcast & Company Emailing System", () => {
  let db: any;
  let sentEmails: Array<{ to: string; subject: string; html: string; text?: string }> = [];

  beforeEach(async () => {
    db = createTestDb(":memory:");
    await runMigrations(db);

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

    vi.spyOn(organizationsService, "listAllOrganizationsForSuperAdmin").mockResolvedValue([
      {
        id: "org-alpha",
        name: "Alpha Corp",
        slug: "alpha-corp",
        email: "contact@alpha.com",
        adminEmail: "alice@alpha.com",
        adminName: "Alice Admin",
        status: "ACTIVE",
      } as any,
      {
        id: "org-beta",
        name: "Beta Logistics",
        slug: "beta-logistics",
        email: "info@beta.com",
        adminEmail: "bob@beta.com",
        adminName: "Bob Admin",
        status: "ACTIVE",
      } as any,
      {
        id: "org-gamma",
        name: "Gamma Services",
        slug: "gamma-services",
        email: "direction@gamma.com",
        adminEmail: "direction@gamma.com", // Same as company email to test dedup
        adminName: "Charlie Admin",
        status: "ACTIVE",
      } as any,
    ]);

    const pwdHash = await hashPassword("SecurePass123!");

    // Seed organizations
    await db.insert(organizations).values([
      {
        id: "org-alpha",
        name: "Alpha Corp",
        slug: "alpha-corp",
        email: "contact@alpha.com",
        status: "ACTIVE",
        serviceStopped: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: "org-beta",
        name: "Beta Logistics",
        slug: "beta-logistics",
        email: "info@beta.com",
        status: "ACTIVE",
        serviceStopped: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: "org-gamma",
        name: "Gamma Services",
        slug: "gamma-services",
        email: "direction@gamma.com",
        status: "ACTIVE",
        serviceStopped: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);

    // Seed users including admins and super admin
    await db.insert(users).values([
      {
        id: "super-admin-user",
        name: "Super Boss",
        email: "superadmin@rkonekte.com",
        passwordHash: pwdHash,
        role: "SUPER_ADMIN",
        organizationId: "org-alpha",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: "admin-alpha",
        name: "Alice Admin",
        email: "alice@alpha.com",
        passwordHash: pwdHash,
        role: "ORGANIZATION_ADMIN",
        organizationId: "org-alpha",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: "admin-beta",
        name: "Bob Admin",
        email: "bob@beta.com",
        passwordHash: pwdHash,
        role: "ORGANIZATION_ADMIN",
        organizationId: "org-beta",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: "admin-gamma",
        name: "Charlie Admin",
        email: "direction@gamma.com", // Same as company email to test dedup
        passwordHash: pwdHash,
        role: "ORGANIZATION_ADMIN",
        organizationId: "org-gamma",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("generates a clean transactional broadcast email template with proper branding and optional CTA", () => {
    const withCta = generateSuperAdminBroadcastEmail({
      recipientName: "Alice & Bob",
      companyName: "Alpha Corp",
      subject: "Mise à jour majeure RKonekte",
      titleHeader: "Nouvelles fonctionnalités",
      message: "Bonjour à tous,\n\nVoici le premier paragraphe.\n\nVoici le second paragraphe avec des détails.",
      ctaLabel: "Ouvrir mon tableau de bord",
      ctaUrl: "https://app.rkonekte.com/login",
    });

    expect(withCta.subject).toBe("Mise à jour majeure RKonekte");
    expect(withCta.html).toContain("RKonekte");
    expect(withCta.html).not.toContain("Octacore");
    expect(withCta.html).toContain("Alice &amp; Bob");
    expect(withCta.html).toContain("Alpha Corp");
    expect(withCta.html).toContain("Nouvelles fonctionnalités");
    expect(withCta.html).toContain("premier paragraphe");
    expect(withCta.html).toContain("second paragraphe");
    expect(withCta.html).toContain("Ouvrir mon tableau de bord");
    expect(withCta.html).toContain("https://app.rkonekte.com/login");
    expect(withCta.text).toContain("COMMUNICATION OFFICIELLE RKONEKTE");

    const withoutCta = generateSuperAdminBroadcastEmail({
      companyName: "Beta Logistics",
      subject: "Notification simple",
      message: "Message direct sans bouton.",
    });

    expect(withoutCta.html).not.toContain("Si le bouton ne répond pas");
    expect(withoutCta.html).toContain("Message direct sans bouton.");
  });

  it("blocks non-SUPER_ADMIN callers with 403 status", async () => {
    vi.spyOn(sessionLib, "getSession").mockResolvedValue({
      id: "admin-alpha",
      email: "alice@alpha.com",
      name: "Alice Admin",
      role: "ORGANIZATION_ADMIN",
      organizationId: "org-alpha",
    } as any);

    const req = new NextRequest("http://localhost:3000/api/super-admin/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target: "ALL",
        subject: "Test non autorisé",
        message: "Ceci doit être bloqué",
      }),
    });

    const res = await broadcastRoutePost(req);
    expect(res.status).toBe(403);
    expect(sentEmails.length).toBe(0);
  });

  it("validates required fields and selected targets strictly", async () => {
    vi.spyOn(sessionLib, "getSession").mockResolvedValue({
      id: "super-admin-user",
      email: "superadmin@rkonekte.com",
      name: "Super Boss",
      role: "SUPER_ADMIN",
      organizationId: "org-alpha",
    } as any);

    // Missing subject
    const reqNoSub = new NextRequest("http://localhost:3000/api/super-admin/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: "ALL", subject: "", message: "Hello" }),
    });
    const resNoSub = await broadcastRoutePost(reqNoSub);
    expect(resNoSub.status).toBe(400);

    // Missing message
    const reqNoMsg = new NextRequest("http://localhost:3000/api/super-admin/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: "ALL", subject: "Sujet", message: "" }),
    });
    const resNoMsg = await broadcastRoutePost(reqNoMsg);
    expect(resNoMsg.status).toBe(400);

    // Target SELECTED but empty list
    const reqEmptySel = new NextRequest("http://localhost:3000/api/super-admin/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target: "SELECTED",
        selectedOrganizationIds: [],
        subject: "Sujet",
        message: "Contenu",
      }),
    });
    const resEmptySel = await broadcastRoutePost(reqEmptySel);
    expect(resEmptySel.status).toBe(400);
  });

  it("broadcasts automatically to ALL companies in the system with deduplication", async () => {
    vi.spyOn(sessionLib, "getSession").mockResolvedValue({
      id: "super-admin-user",
      email: "superadmin@rkonekte.com",
      name: "Super Boss",
      role: "SUPER_ADMIN",
      organizationId: "org-alpha",
    } as any);

    const req = new NextRequest("http://localhost:3000/api/super-admin/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target: "ALL",
        recipientTarget: "BOTH",
        subject: "Message général à toutes les entreprises",
        titleHeader: "Information globale",
        message: "Chers partenaires,\n\nVoici une mise à jour générale.",
      }),
    });

    const res = await broadcastRoutePost(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.totalOrganizations).toBe(3);
    // Alpha: alice@alpha.com, contact@alpha.com (2)
    // Beta: bob@beta.com, info@beta.com (2)
    // Gamma: direction@gamma.com (deduplicated -> 1)
    // Total recipients = 5
    expect(json.totalRecipients).toBe(5);
    expect(json.totalSent).toBe(5);
    expect(json.totalFailed).toBe(0);

    const sentTo = sentEmails.map((e) => e.to);
    expect(sentTo).toContain("alice@alpha.com");
    expect(sentTo).toContain("contact@alpha.com");
    expect(sentTo).toContain("bob@beta.com");
    expect(sentTo).toContain("info@beta.com");
    expect(sentTo).toContain("direction@gamma.com");
  });

  it("targets ONLY designated/selected organizations when target is SELECTED", async () => {
    vi.spyOn(sessionLib, "getSession").mockResolvedValue({
      id: "super-admin-user",
      email: "superadmin@rkonekte.com",
      name: "Super Boss",
      role: "SUPER_ADMIN",
      organizationId: "org-alpha",
    } as any);

    const req = new NextRequest("http://localhost:3000/api/super-admin/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target: "SELECTED",
        selectedOrganizationIds: ["org-beta"],
        recipientTarget: "ADMIN_ONLY",
        subject: "Message spécifique pour Beta",
        message: "Bonjour Beta, ceci est réservé à votre entreprise.",
        ctaLabel: "Ouvrir",
        ctaUrl: "https://app.rkonekte.com/login",
      }),
    });

    const res = await broadcastRoutePost(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.totalOrganizations).toBe(1);
    expect(json.totalRecipients).toBe(1);
    expect(json.totalSent).toBe(1);

    expect(sentEmails.length).toBe(1);
    expect(sentEmails[0].to).toBe("bob@beta.com");
    expect(sentEmails[0].subject).toBe("Message spécifique pour Beta");
    expect(sentEmails[0].html).toContain("Beta Logistics");
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb } from "../src/lib/db/client";
import { runMigrations } from "../scripts/migrate";
import { organizations, branches, employees } from "../src/db/schema";
import {
  createCompanyEvent,
  listEventsForUser,
  deleteCompanyEvent,
  EventUserContext,
} from "../src/lib/services/events";

describe("Company Events & Targeted Email Dispatch Service", () => {
  let db: any;
  const orgId = "org-events-test";
  const otherOrgId = "org-events-other";

  const adminUser: EventUserContext = {
    userId: "usr-admin-1",
    role: "ORGANIZATION_ADMIN",
    name: "Directeur Admin",
    email: "admin@ebiznis.local",
  };

  const empAliceUser: EventUserContext = {
    userId: "usr-emp-alice",
    role: "EMPLOYEE",
    name: "Alice Jean",
    email: "alice@example.com",
    employeeId: "emp-alice",
    employeeNumber: "E-BIZNIS-001",
    branchId: "br-siege",
    branchName: "Siège Principal",
    department: "Finance",
  };

  const empBobUser: EventUserContext = {
    userId: "usr-emp-bob",
    role: "CASHIER",
    name: "Bob Pierre",
    email: "bob@example.com",
    employeeId: "emp-bob",
    employeeNumber: "E-BIZNIS-002",
    branchId: "br-jeremie",
    branchName: "Ebiznis Jeremie",
    department: "Caisse",
  };

  const empClaireUser: EventUserContext = {
    userId: "usr-emp-claire",
    role: "EMPLOYEE",
    name: "Claire Louis",
    email: "claire@example.com",
    employeeId: "emp-claire",
    employeeNumber: "E-BIZNIS-003",
    branchId: "br-jeremie",
    branchName: "Ebiznis Jeremie",
    department: "Logistique",
  };

  beforeEach(async () => {
    db = createTestDb(":memory:");
    await runMigrations(db);
    const now = Date.now();

    await db.insert(organizations).values([
      {
        id: orgId,
        name: "e-biznis",
        slug: "e-biznis",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: otherOrgId,
        name: "Autre Entreprise",
        slug: "autre",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      },
    ]);

    await db.insert(branches).values([
      {
        id: "br-siege",
        organizationId: orgId,
        name: "Siège Principal",
        city: "Port-au-Prince",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "br-jeremie",
        organizationId: orgId,
        name: "Ebiznis Jeremie",
        city: "Jérémie",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      },
    ]);

    await db.insert(employees).values([
      {
        id: "emp-alice",
        organizationId: orgId,
        branchId: "br-siege",
        employeeNumber: "E-BIZNIS-001",
        firstName: "Alice",
        lastName: "Jean",
        department: "Finance",
        position: "Comptable",
        phone: "+509 3700-0001",
        email: "alice@example.com",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "emp-bob",
        organizationId: orgId,
        branchId: "br-jeremie",
        employeeNumber: "E-BIZNIS-002",
        firstName: "Bob",
        lastName: "Pierre",
        department: "Caisse",
        position: "Caissier",
        phone: "+509 3700-0002",
        email: "bob@example.com",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "emp-claire",
        organizationId: orgId,
        branchId: "br-jeremie",
        employeeNumber: "E-BIZNIS-003",
        firstName: "Claire",
        lastName: "Louis",
        department: "Logistique",
        position: "Superviseure",
        phone: "+509 3700-0003",
        email: "claire@example.com",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "emp-no-email",
        organizationId: orgId,
        branchId: "br-siege",
        employeeNumber: "E-BIZNIS-004",
        firstName: "David",
        lastName: "Moise",
        department: "Sécurité",
        position: "Agent",
        phone: "+509 3700-0004",
        email: null,
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "emp-inactive",
        organizationId: orgId,
        branchId: "br-siege",
        employeeNumber: "E-BIZNIS-005",
        firstName: "Ex",
        lastName: "Employe",
        department: "Finance",
        position: "Ancien",
        phone: "+509 3700-0005",
        email: "inactive@example.com",
        status: "INACTIVE",
        createdAt: now,
        updatedAt: now,
      },
    ]);
  });

  it("ALL_EMPLOYEES sends email to every active employee with an email and is visible to all employees", async () => {
    const emailSpy = vi.fn(async () => ({ success: true, id: "msg-1" }));

    const { event, emailStats } = await createCompanyEvent(
      orgId,
      {
        title: "Assemblée Générale Annuelle",
        date: "2026-11-20",
        startTime: "10:00",
        endTime: "12:00",
        type: "MEETING",
        location: "Salle Principale",
        audienceType: "ALL_EMPLOYEES",
        notifyImmediate: true,
      },
      adminUser,
      { dbInstance: db, emailSender: emailSpy }
    );

    expect(emailStats.totalTargeted).toBe(4); // Alice, Bob, Claire, David (excludes INACTIVE)
    expect(emailStats.withEmail).toBe(3); // Alice, Bob, Claire
    expect(emailStats.sent).toBe(3);
    expect(emailStats.skippedNoEmail).toBe(1); // David

    const recipients = emailSpy.mock.calls.map((c: any) => c[0].to).sort();
    expect(recipients).toEqual([
      "alice@example.com",
      "bob@example.com",
      "claire@example.com",
    ]);
    expect(event.emailsSentCount).toBe(3);

    // Visible to both branches
    const aliceEvents = await listEventsForUser(orgId, empAliceUser, db);
    const bobEvents = await listEventsForUser(orgId, empBobUser, db);
    expect(aliceEvents.map((e) => e.id)).toContain(event.id);
    expect(bobEvents.map((e) => e.id)).toContain(event.id);

    // Never visible to another organization
    const otherOrgEvents = await listEventsForUser(otherOrgId, empAliceUser, db);
    expect(otherOrgEvents).toHaveLength(0);
  });

  it("BRANCH sends email only to all active employees of the selected branch and restricts visibility to that branch", async () => {
    const emailSpy = vi.fn(async () => ({ success: true, id: "msg-branch" }));

    const { event, emailStats } = await createCompanyEvent(
      orgId,
      {
        title: "Réunion Succursale Jérémie",
        date: "2026-11-25",
        type: "MEETING",
        audienceType: "BRANCH",
        audienceBranchId: "br-jeremie",
        notifyImmediate: true,
      },
      adminUser,
      { dbInstance: db, emailSender: emailSpy }
    );

    expect(event.audienceBranchId).toBe("br-jeremie");
    expect(event.audienceTargetName).toBe("Ebiznis Jeremie");
    expect(emailStats.totalTargeted).toBe(2); // Bob & Claire
    expect(emailStats.sent).toBe(2);

    const recipients = emailSpy.mock.calls.map((c: any) => c[0].to).sort();
    expect(recipients).toEqual(["bob@example.com", "claire@example.com"]);

    // Bob & Claire (Jérémie) see it; Alice (Siège) does NOT see it; Admin sees all
    const aliceEvents = await listEventsForUser(orgId, empAliceUser, db);
    const bobEvents = await listEventsForUser(orgId, empBobUser, db);
    const claireEvents = await listEventsForUser(orgId, empClaireUser, db);
    const adminEvents = await listEventsForUser(orgId, adminUser, db);

    expect(aliceEvents.map((e) => e.id)).not.toContain(event.id);
    expect(bobEvents.map((e) => e.id)).toContain(event.id);
    expect(claireEvents.map((e) => e.id)).toContain(event.id);
    expect(adminEvents.map((e) => e.id)).toContain(event.id);
  });

  it("CUSTOM sends email strictly to chosen employees from the system list and restricts visibility strictly to them", async () => {
    const emailSpy = vi.fn(async () => ({ success: true, id: "msg-custom" }));

    const { event, emailStats } = await createCompanyEvent(
      orgId,
      {
        title: "Comité Restreint Direction & Audit",
        date: "2026-12-02",
        type: "WORKSHOP",
        audienceType: "CUSTOM",
        targetEmployeeIds: ["emp-alice", "emp-claire"],
        notifyImmediate: true,
      },
      adminUser,
      { dbInstance: db, emailSender: emailSpy }
    );

    expect(emailStats.totalTargeted).toBe(2);
    expect(emailStats.sent).toBe(2);
    expect(event.targetEmployeeIds).toEqual(["emp-alice", "emp-claire"]);
    expect(event.audienceTargetName).toBe("Alice Jean, Claire Louis");

    const recipients = emailSpy.mock.calls.map((c: any) => c[0].to).sort();
    expect(recipients).toEqual(["alice@example.com", "claire@example.com"]);

    // Alice and Claire see it; Bob (in Jeremie too, but not selected) does NOT see it
    const aliceEvents = await listEventsForUser(orgId, empAliceUser, db);
    const bobEvents = await listEventsForUser(orgId, empBobUser, db);
    const claireEvents = await listEventsForUser(orgId, empClaireUser, db);

    expect(aliceEvents.map((e) => e.id)).toContain(event.id);
    expect(claireEvents.map((e) => e.id)).toContain(event.id);
    expect(bobEvents.map((e) => e.id)).not.toContain(event.id);
  });

  it("prevents employees from creating official broadcast events and keeps personal events private", async () => {
    const emailSpy = vi.fn(async () => ({ success: true, id: "msg-never" }));

    // Employee attempts to post official event — service forces isPersonal = true & sends 0 emails
    const { event, emailStats } = await createCompanyEvent(
      orgId,
      {
        title: "Rendez-vous médecin",
        date: "2026-11-18",
        type: "ANNOUNCEMENT",
        audienceType: "ALL_EMPLOYEES",
        notifyImmediate: true,
        isPersonal: false,
      },
      empAliceUser,
      { dbInstance: db, emailSender: emailSpy }
    );

    expect(event.isPersonal).toBe(true);
    expect(event.type).toBe("PERSONAL");
    expect(emailStats.sent).toBe(0);
    expect(emailSpy).not.toHaveBeenCalled();

    // Only Alice sees her personal event (not even Admin sees employee private events)
    const aliceEvents = await listEventsForUser(orgId, empAliceUser, db);
    const bobEvents = await listEventsForUser(orgId, empBobUser, db);
    const adminEvents = await listEventsForUser(orgId, adminUser, db);

    expect(aliceEvents.map((e) => e.id)).toContain(event.id);
    expect(bobEvents.map((e) => e.id)).not.toContain(event.id);
    expect(adminEvents.map((e) => e.id)).not.toContain(event.id);

    // Bob cannot delete Alice's personal event
    const forbiddenDel = await deleteCompanyEvent(orgId, event.id, empBobUser, db);
    expect(forbiddenDel.deleted).toBe(false);

    // Alice can delete her own personal event
    const allowedDel = await deleteCompanyEvent(orgId, event.id, empAliceUser, db);
    expect(allowedDel.deleted).toBe(true);
  });
});

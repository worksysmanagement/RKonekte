import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createTestDb } from "../src/lib/db/client";
import { runMigrations } from "../scripts/migrate";
import {
  auditLogs,
  branches,
  employees,
  leaveRequests,
  organizations,
  subscriptionRenewals,
  users,
} from "../src/db/schema";
import { hashPassword } from "../src/lib/auth/password";
import {
  getSuperAdminOrganizationDetails,
  getSuperAdminOverview,
} from "../src/lib/services/super-admin-overview";
import {
  ONLINE_WINDOW_MS,
  recordUserHeartbeat,
  recordUserLoginActivity,
} from "../src/lib/services/user-activity";
import { DAY_MS } from "../src/lib/utils/subscription";
import * as sessionLib from "../src/lib/auth/session";
import { GET as statsRouteGet } from "../src/app/api/super-admin/stats/route";
import { GET as orgOverviewRouteGet } from "../src/app/api/super-admin/organizations/[id]/overview/route";

describe("SuperAdmin Complete Overview, Activity Tracking, J-7 & Period Filtering", () => {
  let db: any;
  let samplePasswordHash = "";

  // Reference instant: 2026-11-11 12:00 Haiti time (UTC-5 -> 17:00 UTC)
  const NOW = Date.UTC(2026, 10, 11, 17, 0, 0);
  const OCT_10 = Date.UTC(2026, 9, 10, 17, 0, 0);
  const NOV_05 = Date.UTC(2026, 10, 5, 17, 0, 0);
  const YEAR_2025 = Date.UTC(2025, 5, 15, 17, 0, 0);

  beforeEach(async () => {
    db = createTestDb(":memory:");
    await runMigrations(db);
    if (!samplePasswordHash) {
      samplePasswordHash = await hashPassword("Rkonekte#2026");
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("tracks organizations without password, real logins, online 5-min window, users & employees per org, and J-7 expirations", async () => {
    // 0. Platform SUPER_ADMIN (must be excluded from tenant user counts)
    await db.insert(users).values({
      id: "usr-super-admin",
      organizationId: null,
      branchId: null,
      name: "Rodjy Piton",
      email: "pitonrodjy@gmail.com",
      passwordHash: samplePasswordHash,
      role: "SUPER_ADMIN",
      status: "ACTIVE",
      createdAt: YEAR_2025,
      updatedAt: YEAR_2025,
    });

    // 1. Org A: Active, expiring in J-5, has 1 connected admin + 1 invited user without password + 2 employees
    await db.insert(organizations).values({
      id: "org-a",
      name: "e-biznis",
      slug: "e-biznis",
      email: "contact@ebiznis.ht",
      phone: "+509 3700-1111",
      status: "ACTIVE",
      activatedAt: NOW - 25 * DAY_MS,
      subscriptionExpiresAt: NOW + 5 * DAY_MS, // J-5
      serviceStopped: false,
      createdAt: NOW - 25 * DAY_MS,
      updatedAt: NOW - 25 * DAY_MS,
    });

    await db.insert(branches).values({
      id: "br-a1",
      organizationId: "org-a",
      name: "Delmas 33",
      city: "Port-au-Prince",
      status: "ACTIVE",
      createdAt: NOW - 20 * DAY_MS,
      updatedAt: NOW - 20 * DAY_MS,
    });

    await db.insert(users).values([
      {
        id: "usr-a-admin",
        organizationId: "org-a",
        branchId: null,
        name: "Alice Admin",
        email: "alice@ebiznis.ht",
        passwordHash: samplePasswordHash,
        role: "ORGANIZATION_ADMIN",
        status: "ACTIVE",
        createdAt: NOW - 25 * DAY_MS,
        updatedAt: NOW - 25 * DAY_MS,
      },
      {
        id: "usr-a-invited",
        organizationId: "org-a",
        branchId: "br-a1",
        name: "Bob Secretaire",
        email: "bob@ebiznis.ht",
        passwordHash: "NO_PASSWORD_SET",
        role: "SECRETARY",
        status: "ACTIVE",
        createdAt: NOW - 2 * DAY_MS,
        updatedAt: NOW - 2 * DAY_MS,
      },
    ]);

    await db.insert(employees).values([
      {
        id: "emp-a1",
        organizationId: "org-a",
        branchId: "br-a1",
        employeeNumber: "EMP-001",
        firstName: "Bob",
        lastName: "Secretaire",
        department: "Admin",
        position: "Secrétaire",
        phone: "+509 3700-0001",
        email: "bob@ebiznis.ht",
        status: "ACTIVE",
        createdAt: NOW - 2 * DAY_MS,
        updatedAt: NOW - 2 * DAY_MS,
      },
      {
        id: "emp-a2",
        organizationId: "org-a",
        branchId: "br-a1",
        employeeNumber: "EMP-002",
        firstName: "Claire",
        lastName: "Jean",
        department: "Ventes",
        position: "Caissière",
        phone: "+509 3700-0002",
        email: "claire@ebiznis.ht",
        status: "INACTIVE",
        createdAt: NOW - 1 * DAY_MS,
        updatedAt: NOW - 1 * DAY_MS,
      },
    ]);

    // 2. Org B: Submitted without password yet (NO_PASSWORD_SET)
    await db.insert(organizations).values({
      id: "org-b",
      name: "Jeff Int",
      slug: "jeff-int",
      email: "despeinesjeff13@gmail.com",
      status: "DISABLED",
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.insert(users).values({
      id: "usr-b-admin",
      organizationId: "org-b",
      branchId: null,
      name: "Jeff Despeines",
      email: "despeinesjeff13@gmail.com",
      passwordHash: "NO_PASSWORD_SET",
      role: "ORGANIZATION_ADMIN",
      status: "DISABLED",
      createdAt: NOW,
      updatedAt: NOW,
    });

    // 3. Org C: Active with password configured, J-0 urgent expiry, 0 logins so far
    await db.insert(organizations).values({
      id: "org-c",
      name: "Konekte Express",
      slug: "konekte-express",
      email: "ceo@konekte.ht",
      status: "ACTIVE",
      activatedAt: NOW - 30 * DAY_MS,
      subscriptionExpiresAt: NOW + 1 * 3600_000, // Same day (J-0)
      serviceStopped: false,
      createdAt: NOW - 30 * DAY_MS,
      updatedAt: NOW - 30 * DAY_MS,
    });
    await db.insert(users).values({
      id: "usr-c-admin",
      organizationId: "org-c",
      branchId: null,
      name: "Marc Express",
      email: "ceo@konekte.ht",
      passwordHash: samplePasswordHash,
      role: "ORGANIZATION_ADMIN",
      status: "ACTIVE",
      createdAt: NOW - 30 * DAY_MS,
      updatedAt: NOW - 30 * DAY_MS,
    });

    // 4. Org D: Active with comfortable J-8 expiry (must NOT be in J-7 alerts)
    await db.insert(organizations).values({
      id: "org-d",
      name: "Soley Tech",
      slug: "soley-tech",
      email: "info@soley.ht",
      status: "ACTIVE",
      activatedAt: NOW - 22 * DAY_MS,
      subscriptionExpiresAt: NOW + 8 * DAY_MS, // J-8 -> ACTIVE phase, outside J-7
      serviceStopped: false,
      createdAt: NOW - 22 * DAY_MS,
      updatedAt: NOW - 22 * DAY_MS,
    });
    await db.insert(users).values({
      id: "usr-d-admin",
      organizationId: "org-d",
      branchId: null,
      name: "Soley Admin",
      email: "info@soley.ht",
      passwordHash: samplePasswordHash,
      role: "ORGANIZATION_ADMIN",
      status: "ACTIVE",
      createdAt: NOW - 22 * DAY_MS,
      updatedAt: NOW - 22 * DAY_MS,
    });

    // 5. Org E: Expired yesterday (must be in expiredOrStoppedOrgs, NOT expiringSoonOrgs)
    await db.insert(organizations).values({
      id: "org-e",
      name: "Expiray Corp",
      slug: "expiray-corp",
      email: "admin@expiray.ht",
      status: "ACTIVE",
      activatedAt: NOW - 31 * DAY_MS,
      subscriptionExpiresAt: NOW - 1 * DAY_MS,
      serviceStopped: false,
      createdAt: NOW - 31 * DAY_MS,
      updatedAt: NOW - 31 * DAY_MS,
    });
    await db.insert(users).values({
      id: "usr-e-admin",
      organizationId: "org-e",
      branchId: null,
      name: "Expiray Admin",
      email: "admin@expiray.ht",
      passwordHash: samplePasswordHash,
      role: "ORGANIZATION_ADMIN",
      status: "ACTIVE",
      createdAt: NOW - 31 * DAY_MS,
      updatedAt: NOW - 31 * DAY_MS,
    });

    // Simulate real login for Org A admin AND SUPER_ADMIN
    await recordUserLoginActivity({
      userId: "usr-a-admin",
      organizationId: "org-a",
      role: "ORGANIZATION_ADMIN",
      email: "alice@ebiznis.ht",
      nowMs: NOW - 2 * 60_000, // 2 min ago -> online now
      dbInstance: db,
    });
    await recordUserLoginActivity({
      userId: "usr-super-admin",
      organizationId: null,
      role: "SUPER_ADMIN",
      email: "pitonrodjy@gmail.com",
      nowMs: NOW - 60_000,
      dbInstance: db,
    });

    const overview = await getSuperAdminOverview({ period: "all" }, db, NOW);

    // Without password orgs: only Org B (admin has NO_PASSWORD_SET)
    expect(overview.kpis.withoutPasswordOrgsAllCount).toBe(1);
    expect(overview.lists.withoutPasswordOrgsAll.map((o) => o.id)).toEqual(["org-b"]);
    // Tenant accounts without password: usr-a-invited + usr-b-admin = 2
    expect(overview.kpis.usersWithoutPasswordAllCount).toBe(2);

    // Connected orgs & live presence (SuperAdmin excluded!)
    expect(overview.kpis.connectedOrgsAllCount).toBe(1);
    expect(overview.kpis.connectedUsersAllCount).toBe(1);
    expect(overview.kpis.onlineOrgsNowCount).toBe(1);
    expect(overview.kpis.onlineUsersNowCount).toBe(1);
    // Org C, Org D, and Org E have password set but never logged in -> 3
    expect(overview.kpis.neverLoggedInWithPasswordOrgsCount).toBe(3);

    // Totals users & employees
    expect(overview.kpis.totalUsersAll).toBe(6); // 2 in org-a, 1 each in org-b, org-c, org-d, org-e
    expect(overview.kpis.totalEmployeesAll).toBe(2);
    expect(overview.kpis.activeEmployeesAll).toBe(1);

    // J-7 Expiring soon: Org C (J-0) first, then Org A (J-5). Org D (J-8) & Org E (expired) excluded.
    expect(overview.kpis.expiringSoonOrgsCount).toBe(2);
    expect(overview.lists.expiringSoonOrgs.map((o) => [o.id, o.badgeJLabel])).toEqual([
      ["org-c", "J-0"],
      ["org-a", "J-5"],
    ]);
    expect(overview.kpis.expiredOrStoppedOrgsCount).toBe(1);
    expect(overview.lists.expiredOrStoppedOrgs.map((o) => o.id)).toEqual(["org-e"]);

    // Verify 6 minutes later without heartbeat: user goes offline while staying connected ever
    const sixMinutesLater = NOW - 2 * 60_000 + ONLINE_WINDOW_MS + 60_000;
    const overviewAfterTimeout = await getSuperAdminOverview(
      { period: "all" },
      db,
      sixMinutesLater
    );
    expect(overviewAfterTimeout.kpis.onlineUsersNowCount).toBe(0);
    expect(overviewAfterTimeout.kpis.onlineOrgsNowCount).toBe(0);
    expect(overviewAfterTimeout.kpis.connectedUsersAllCount).toBe(1);

    // Heartbeat restores live online indicator
    await recordUserHeartbeat({
      userId: "usr-a-admin",
      nowMs: sixMinutesLater - 10_000,
      dbInstance: db,
    });
    const overviewAfterHeartbeat = await getSuperAdminOverview(
      { period: "all" },
      db,
      sixMinutesLater
    );
    expect(overviewAfterHeartbeat.kpis.onlineUsersNowCount).toBe(1);
    expect(overviewAfterHeartbeat.kpis.onlineOrgsNowCount).toBe(1);

    // Per-organization Eye modal details + zero secret leakage
    const orgADetails = await getSuperAdminOrganizationDetails("org-a", db, sixMinutesLater);
    expect(orgADetails).not.toBeNull();
    expect(orgADetails?.organization.userCount).toBe(2);
    expect(orgADetails?.organization.employeeCount).toBe(2);
    expect(orgADetails?.organization.noPasswordUserCount).toBe(1);
    expect(orgADetails?.branches).toHaveLength(1);
    expect(orgADetails?.users).toHaveLength(2);
    expect(orgADetails?.employees).toHaveLength(2);

    const bobEmp = orgADetails?.employees.find((e) => e.employeeNumber === "EMP-001");
    expect(bobEmp?.hasUserAccount).toBe(true);
    expect(bobEmp?.hasPassword).toBe(false);
    expect(bobEmp?.branchName).toBe("Delmas 33 (Port-au-Prince)");

    const claraEmp = orgADetails?.employees.find((e) => e.employeeNumber === "EMP-002");
    expect(claraEmp?.hasUserAccount).toBe(false);

    // Must never leak passwordHash fields or stored hashes
    const serializedAll = JSON.stringify({ overview, orgADetails });
    expect(serializedAll).not.toContain("passwordHash");
    expect(serializedAll).not.toContain("password_hash");
    expect(serializedAll).not.toContain("pbkdf2");
    expect(serializedAll).not.toContain(samplePasswordHash);
  });

  it("filters dashboard accurately by day, month, and year including multi-month USER_LOGIN history", async () => {
    // Org 1 (2025): no password
    await db.insert(organizations).values({
      id: "org-2025",
      name: "Ancienne Entreprise",
      slug: "ancienne",
      status: "DISABLED",
      createdAt: YEAR_2025,
      updatedAt: YEAR_2025,
    });
    await db.insert(users).values({
      id: "usr-2025",
      organizationId: "org-2025",
      name: "Old Admin",
      email: "old@test.ht",
      passwordHash: "NO_PASSWORD_SET",
      role: "ORGANIZATION_ADMIN",
      status: "DISABLED",
      createdAt: YEAR_2025,
      updatedAt: YEAR_2025,
    });

    // Org 2 (Oct 2026): active with password, logged in on Oct 10 AND again on Nov 11!
    await db.insert(organizations).values({
      id: "org-oct",
      name: "Octobre Co",
      slug: "octobre-co",
      status: "ACTIVE",
      activatedAt: OCT_10,
      subscriptionExpiresAt: NOW + 3 * DAY_MS, // expires 2026-11-14 (month = 2026-11)
      serviceStopped: false,
      createdAt: OCT_10,
      updatedAt: OCT_10,
    });
    await db.insert(users).values({
      id: "usr-oct",
      organizationId: "org-oct",
      name: "Oct Admin",
      email: "oct@test.ht",
      passwordHash: samplePasswordHash,
      role: "ORGANIZATION_ADMIN",
      status: "ACTIVE",
      createdAt: OCT_10,
      updatedAt: OCT_10,
    });
    await db.insert(employees).values({
      id: "emp-oct",
      organizationId: "org-oct",
      employeeNumber: "OCT-001",
      firstName: "Jean",
      lastName: "Oct",
      department: "Ops",
      position: "Agent",
      phone: "+509 1111-1111",
      status: "ACTIVE",
      createdAt: OCT_10,
      updatedAt: OCT_10,
    });
    await db.insert(leaveRequests).values({
      id: "req-oct",
      organizationId: "org-oct",
      requestNumber: "CONG-2026-0001",
      firstName: "Jean",
      lastName: "Oct",
      employeeNumber: "OCT-001",
      department: "Ops",
      position: "Agent",
      leaveType: "ANNUAL",
      startDate: "2026-10-12",
      endDate: "2026-10-14",
      requestedDays: 3,
      contactPhone: "+509 1111-1111",
      status: "APPROVED",
      employeeAccessTokenHash: "tok-oct",
      submittedAt: OCT_10,
      createdAt: OCT_10,
      updatedAt: OCT_10,
    });

    // Org 3 (Nov 05, 2026): no password yet + Org 4 (Nov 11, 2026): no password yet
    await db.insert(organizations).values([
      {
        id: "org-nov5",
        name: "Nov5 Co",
        slug: "nov5-co",
        status: "DISABLED",
        createdAt: NOV_05,
        updatedAt: NOV_05,
      },
      {
        id: "org-nov11",
        name: "Nov11 Co",
        slug: "nov11-co",
        status: "DISABLED",
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
    await db.insert(users).values([
      {
        id: "usr-nov5",
        organizationId: "org-nov5",
        name: "Nov5 Admin",
        email: "nov5@test.ht",
        passwordHash: "NO_PASSWORD_SET",
        role: "ORGANIZATION_ADMIN",
        status: "DISABLED",
        createdAt: NOV_05,
        updatedAt: NOV_05,
      },
      {
        id: "usr-nov11",
        organizationId: "org-nov11",
        name: "Nov11 Admin",
        email: "nov11@test.ht",
        passwordHash: "NO_PASSWORD_SET",
        role: "ORGANIZATION_ADMIN",
        status: "DISABLED",
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);

    // Logins for usr-oct across Oct 10 AND Nov 11 (lastLoginAt becomes Nov 11, audit_logs preserves Oct 10)
    await recordUserLoginActivity({
      userId: "usr-oct",
      organizationId: "org-oct",
      role: "ORGANIZATION_ADMIN",
      email: "oct@test.ht",
      nowMs: OCT_10,
      dbInstance: db,
    });
    await recordUserLoginActivity({
      userId: "usr-oct",
      organizationId: "org-oct",
      role: "ORGANIZATION_ADMIN",
      email: "oct@test.ht",
      nowMs: NOW,
      dbInstance: db,
    });

    // 1. Filter by DAY (2026-11-11): 1 org created without password, 1 connected org (Octobre Co logged in today)
    const dayView = await getSuperAdminOverview(
      { period: "day", date: "2026-11-11" },
      db,
      NOW
    );
    expect(dayView.kpis.totalOrganizations).toBe(1);
    expect(dayView.kpis.withoutPasswordOrgsCount).toBe(1);
    expect(dayView.kpis.withoutPasswordOrgsAllCount).toBe(3);
    expect(dayView.kpis.connectedOrgsCount).toBe(1);
    expect(dayView.kpis.connectedUsersCount).toBe(1);
    expect(dayView.kpis.totalRequests).toBe(0);

    // 2. Filter by MONTH (2026-10): Octobre Co logged in on Oct 10 even though lastLoginAt is now Nov 11!
    const octView = await getSuperAdminOverview(
      { period: "month", month: "2026-10" },
      db,
      NOW
    );
    expect(octView.kpis.totalOrganizations).toBe(1);
    expect(octView.kpis.withoutPasswordOrgsCount).toBe(0);
    expect(octView.kpis.connectedOrgsCount).toBe(1);
    expect(octView.kpis.totalRequests).toBe(1);
    expect(octView.kpis.approvedRequests).toBe(1);
    expect(octView.kpis.usersInPeriodCount).toBe(1);
    expect(octView.kpis.employeesInPeriodCount).toBe(1);

    // 3. Filter by MONTH (2026-11): 2 new orgs without password (Nov5 & Nov11), 1 connected org (Nov 11 login), 1 expiring in Nov
    const novView = await getSuperAdminOverview(
      { period: "month", month: "2026-11" },
      db,
      NOW
    );
    expect(novView.kpis.totalOrganizations).toBe(2);
    expect(novView.kpis.withoutPasswordOrgsCount).toBe(2);
    expect(novView.kpis.connectedOrgsCount).toBe(1);
    expect(novView.kpis.expiringSoonInPeriodCount).toBe(1);

    // 4. Filter by YEAR (2025): only org-2025 without password
    const year2025View = await getSuperAdminOverview(
      { period: "year", year: "2025" },
      db,
      NOW
    );
    expect(year2025View.kpis.totalOrganizations).toBe(1);
    expect(year2025View.kpis.withoutPasswordOrgsCount).toBe(1);
    expect(year2025View.kpis.connectedOrgsCount).toBe(0);
    expect(year2025View.kpis.totalRequests).toBe(0);

    // 5. Filter by ALL: 4 orgs total, 3 without password, 1 connected
    const allView = await getSuperAdminOverview({ period: "all" }, db, NOW);
    expect(allView.kpis.totalOrganizations).toBe(4);
    expect(allView.kpis.withoutPasswordOrgsCount).toBe(3);
    expect(allView.kpis.connectedOrgsCount).toBe(1);
    expect(allView.kpis.totalRequests).toBe(1);
  });

  it("blocks non-SUPER_ADMIN callers with 403 on stats and org overview API routes", async () => {
    vi.spyOn(sessionLib, "getSession").mockResolvedValue({
      id: "usr-tenant-admin",
      email: "tenant@ebiznis.ht",
      name: "Tenant Admin",
      role: "ORGANIZATION_ADMIN",
      organizationId: "org-a",
      branchId: null,
    });

    const statsRes = await statsRouteGet(
      new NextRequest("http://localhost:3000/api/super-admin/stats?period=day")
    );
    expect(statsRes.status).toBe(403);

    const detailRes = await orgOverviewRouteGet(
      new NextRequest("http://localhost:3000/api/super-admin/organizations/org-a/overview"),
      { params: Promise.resolve({ id: "org-a" }) }
    );
    expect(detailRes.status).toBe(403);
  });
});

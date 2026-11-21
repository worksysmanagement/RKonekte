import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "../src/lib/db/client";
import { runMigrations } from "../scripts/migrate";
import { organizations, users } from "../src/db/schema";
import { hashPassword } from "../src/lib/auth/password";
import { getUserById, updateUserRole } from "../src/lib/services/users";
import { getDefaultSystemRoles, matchOrgRole } from "../src/lib/services/roles";
import { updateUserRoleSchema } from "../src/lib/validation/schemas";

describe("User System Role Update Test Suite", () => {
  let db: any;

  beforeEach(async () => {
    db = createTestDb(":memory:");
    await runMigrations(db);

    const now = Date.now();
    await db.insert(organizations).values([
      {
        id: "org-alpha",
        name: "Alpha Corp",
        slug: "alpha",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "org-beta",
        name: "Beta Corp",
        slug: "beta",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const pwd = await hashPassword("Secret123!");
    await db.insert(users).values([
      {
        id: "usr-alpha-pdg",
        organizationId: "org-alpha",
        name: "PDG Alpha",
        email: "pdg@alpha.local",
        passwordHash: pwd,
        role: "ORGANIZATION_ADMIN",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "usr-alpha-cashier",
        organizationId: "org-alpha",
        name: "Caissier Alpha",
        email: "cashier@alpha.local",
        passwordHash: pwd,
        role: "CASHIER",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "usr-beta-admin",
        organizationId: "org-beta",
        name: "Admin Beta",
        email: "admin@beta.local",
        passwordHash: pwd,
        role: "ORGANIZATION_ADMIN",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "usr-super",
        organizationId: "org-alpha",
        name: "Platform Super",
        email: "super@rkonekte.local",
        passwordHash: pwd,
        role: "SUPER_ADMIN",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      },
    ]);
  });

  it("Updates only the system role of a user within the same organization", async () => {
    const updated = await updateUserRole("org-alpha", "usr-alpha-cashier", "FINANCIAL_MANAGER", db);
    expect(updated.role).toBe("FINANCIAL_MANAGER");
    expect(updated.name).toBe("Caissier Alpha");
    expect(updated.email).toBe("cashier@alpha.local");
    expect(updated.status).toBe("ACTIVE");

    const stored = await getUserById("usr-alpha-cashier", db);
    expect(stored?.role).toBe("FINANCIAL_MANAGER");
    expect(stored?.name).toBe("Caissier Alpha");
    expect(stored?.email).toBe("cashier@alpha.local");
  });

  it("CRITICAL: Prevents cross-tenant role modification", async () => {
    await expect(
      updateUserRole("org-beta", "usr-alpha-cashier", "ADMINISTRATEUR", db)
    ).rejects.toThrow("Utilisateur introuvable dans cette entreprise");

    const unchanged = await getUserById("usr-alpha-cashier", db);
    expect(unchanged?.role).toBe("CASHIER");
  });

  it("Rejects assigning SUPER_ADMIN or modifying a SUPER_ADMIN account", async () => {
    await expect(
      updateUserRole("org-alpha", "usr-alpha-cashier", "SUPER_ADMIN", db)
    ).rejects.toThrow("Attribution du rôle Super Administrateur interdite");

    await expect(
      updateUserRole("org-alpha", "usr-super", "EMPLOYEE", db)
    ).rejects.toThrow("Impossible de modifier le rôle d'un Super Administrateur");
  });

  it("Prevents demoting the last active ORGANIZATION_ADMIN but allows demotion when another active PDG exists", async () => {
    await expect(
      updateUserRole("org-alpha", "usr-alpha-pdg", "EMPLOYEE", db)
    ).rejects.toThrow("Impossible de rétrograder le seul PDG / Propriétaire actif");

    // Promote second user to ORGANIZATION_ADMIN first
    await updateUserRole("org-alpha", "usr-alpha-cashier", "ORGANIZATION_ADMIN", db);

    // Now the original PDG can be changed to EMPLOYEE
    const demoted = await updateUserRole("org-alpha", "usr-alpha-pdg", "EMPLOYEE", db);
    expect(demoted.role).toBe("EMPLOYEE");
  });

  it("Validates updateUserRoleSchema strictly allows only { role }", () => {
    expect(updateUserRoleSchema.safeParse({ role: "EMPLOYEE" }).success).toBe(true);
    expect(updateUserRoleSchema.safeParse({ role: "ORGANIZATION_ADMIN" }).success).toBe(true);
    expect(updateUserRoleSchema.safeParse({ role: "FINANCIAL_MANAGER" }).success).toBe(false);
    expect(updateUserRoleSchema.safeParse({ role: "  " }).success).toBe(false);
    expect(
      updateUserRoleSchema.safeParse({
        role: "EMPLOYEE",
        name: "Hacked Name",
      }).success
    ).toBe(false);
    expect(
      updateUserRoleSchema.safeParse({
        role: "EMPLOYEE",
        email: "other@evil.com",
      }).success
    ).toBe(false);
  });

  it("Matches system roles including RH and ADMINISTRATEUR as well as custom roles", () => {
    const roles = getDefaultSystemRoles("org-alpha");
    expect(matchOrgRole(roles, "ADMINISTRATEUR")?.id).toBe("role-admin");
    expect(matchOrgRole(roles, "RH")?.id).toBe("role-rh");
    expect(matchOrgRole(roles, "CASHIER")?.id).toBe("role-cashier");
    expect(matchOrgRole(roles, "EMPLOYEE")?.id).toBe("role-employee");
  });
});

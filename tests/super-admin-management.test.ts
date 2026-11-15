import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createTestDb } from "../src/lib/db/client";
import { runMigrations } from "../scripts/migrate";
import { users } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword } from "../src/lib/auth/password";
import * as sessionLib from "../src/lib/auth/session";
import * as superAdminService from "../src/lib/services/super-admins";
import {
  listSuperAdmins,
  createSuperAdmin,
  updateSuperAdminStatus,
  resetSuperAdminPassword,
  deleteSuperAdmin,
} from "../src/lib/services/super-admins";
import { GET as getAdminsRoute, POST as postAdminRoute } from "../src/app/api/super-admin/admins/route";
import { PATCH as patchAdminRoute, DELETE as deleteAdminRoute } from "../src/app/api/super-admin/admins/[id]/route";

describe("SuperAdmin Management System", () => {
  let db: any;
  let pwdHash: string;
  const admin1Id = "sa-user-1";
  const admin2Id = "sa-user-2";

  beforeAll(async () => {
    db = createTestDb(":memory:");
    await runMigrations(db);
    pwdHash = await hashPassword("MasterPass123!");
  });

  beforeEach(async () => {
    // Clean and reseed users table
    await db.delete(users);

    await db.insert(users).values([
      {
        id: admin1Id,
        name: "Principal SuperAdmin",
        email: "superadmin1@rkonekte.com",
        passwordHash: pwdHash,
        role: "SUPER_ADMIN",
        status: "ACTIVE",
        organizationId: null,
        createdAt: Date.now() - 10000,
        updatedAt: Date.now() - 10000,
      },
      {
        id: admin2Id,
        name: "Secondary SuperAdmin",
        email: "superadmin2@rkonekte.com",
        passwordHash: pwdHash,
        role: "SUPER_ADMIN",
        status: "ACTIVE",
        organizationId: null,
        createdAt: Date.now() - 5000,
        updatedAt: Date.now() - 5000,
      },
      {
        id: "regular-user",
        name: "Standard Client Admin",
        email: "client@example.com",
        passwordHash: pwdHash,
        role: "ORGANIZATION_ADMIN",
        status: "ACTIVE",
        organizationId: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Service Layer: listSuperAdmins", () => {
    it("returns only users with SUPER_ADMIN role", async () => {
      const list = await listSuperAdmins(db);
      expect(list.length).toBe(2);
      expect(list.every((u) => u.role === "SUPER_ADMIN")).toBe(true);
      expect(list.some((u) => u.email === "client@example.com")).toBe(false);
    });
  });

  describe("Service Layer: createSuperAdmin", () => {
    it("successfully creates a new SuperAdmin account", async () => {
      const created = await createSuperAdmin(
        {
          name: "Jean Dupont",
          email: "jean.dupont@rkonekte.com",
          password: "SecurePassword2026!",
        },
        db
      );

      expect(created.id).toBeDefined();
      expect(created.name).toBe("Jean Dupont");
      expect(created.email).toBe("jean.dupont@rkonekte.com");
      expect(created.role).toBe("SUPER_ADMIN");
      expect(created.status).toBe("ACTIVE");

      const list = await listSuperAdmins(db);
      expect(list.length).toBe(3);
    });

    it("rejects creation if name is too short", async () => {
      await expect(
        createSuperAdmin(
          {
            name: "J",
            email: "j@rkonekte.com",
            password: "SecurePassword2026!",
          },
          db
        )
      ).rejects.toThrow("nom complet");
    });

    it("rejects creation if email is invalid", async () => {
      await expect(
        createSuperAdmin(
          {
            name: "Jean Dupont",
            email: "invalid-email-string",
            password: "SecurePassword2026!",
          },
          db
        )
      ).rejects.toThrow("invalide");
    });

    it("rejects creation if password is shorter than 8 characters", async () => {
      await expect(
        createSuperAdmin(
          {
            name: "Jean Dupont",
            email: "jean@rkonekte.com",
            password: "123",
          },
          db
        )
      ).rejects.toThrow("au moins 8 caractères");
    });

    it("rejects duplicate email addresses", async () => {
      await expect(
        createSuperAdmin(
          {
            name: "Duplicate User",
            email: "superadmin1@rkonekte.com",
            password: "SecurePassword2026!",
          },
          db
        )
      ).rejects.toThrow("déjà utilisée");
    });
  });

  describe("Service Layer: updateSuperAdminStatus", () => {
    it("disables a secondary superadmin when caller is different", async () => {
      await updateSuperAdminStatus(admin2Id, "DISABLED", admin1Id, db);
      const list = await listSuperAdmins(db);
      const admin2 = list.find((a) => a.id === admin2Id);
      expect(admin2?.status).toBe("DISABLED");
    });

    it("re-enables a disabled superadmin", async () => {
      await updateSuperAdminStatus(admin2Id, "DISABLED", admin1Id, db);
      await updateSuperAdminStatus(admin2Id, "ACTIVE", admin1Id, db);
      const list = await listSuperAdmins(db);
      const admin2 = list.find((a) => a.id === admin2Id);
      expect(admin2?.status).toBe("ACTIVE");
    });

    it("prevents a superadmin from disabling their own account", async () => {
      await expect(
        updateSuperAdminStatus(admin1Id, "DISABLED", admin1Id, db)
      ).rejects.toThrow("votre propre compte");
    });

    it("prevents disabling the last active superadmin", async () => {
      // First disable admin2
      await updateSuperAdminStatus(admin2Id, "DISABLED", admin1Id, db);

      // Now admin1 is the ONLY active superadmin; if caller attempts to disable admin1
      await expect(
        updateSuperAdminStatus(admin1Id, "DISABLED", "some-other-id", db)
      ).rejects.toThrow("seul Super Administrateur actif");
    });
  });

  describe("Service Layer: resetSuperAdminPassword", () => {
    it("successfully resets a superadmin's password and hashes it", async () => {
      await resetSuperAdminPassword(admin2Id, "NewSecretKey999!", db);
      const [userRow] = await db.select().from(users).where(eq(users.id, admin2Id));
      expect(userRow).toBeDefined();

      const matches = await verifyPassword("NewSecretKey999!", userRow.passwordHash);
      expect(matches).toBe(true);
    });

    it("rejects password shorter than 8 characters", async () => {
      await expect(
        resetSuperAdminPassword(admin2Id, "short", db)
      ).rejects.toThrow("au moins 8 caractères");
    });
  });

  describe("Service Layer: deleteSuperAdmin", () => {
    it("successfully deletes a superadmin when another active superadmin remains", async () => {
      await deleteSuperAdmin(admin2Id, admin1Id, db);
      const list = await listSuperAdmins(db);
      expect(list.length).toBe(1);
      expect(list[0].id).toBe(admin1Id);
    });

    it("prevents a superadmin from deleting their own account", async () => {
      await expect(
        deleteSuperAdmin(admin1Id, admin1Id, db)
      ).rejects.toThrow("votre propre compte");
    });

    it("prevents deleting when no other active superadmin exists", async () => {
      await updateSuperAdminStatus(admin2Id, "DISABLED", admin1Id, db);
      await expect(
        deleteSuperAdmin(admin1Id, "other-caller", db)
      ).rejects.toThrow("aucun autre Super Administrateur actif");
    });
  });

  describe("API Routes: /api/super-admin/admins", () => {
    it("rejects requests if caller is not SUPER_ADMIN", async () => {
      vi.spyOn(sessionLib, "getSession").mockResolvedValue({
        id: "client-admin",
        role: "ORGANIZATION_ADMIN",
        organizationId: "org-1",
      } as any);

      const res = await getAdminsRoute();
      expect(res.status).toBe(403);
    });

    it("allows SUPER_ADMIN to list superadmins via GET", async () => {
      vi.spyOn(sessionLib, "getSession").mockResolvedValue({
        id: admin1Id,
        email: "superadmin1@rkonekte.com",
        role: "SUPER_ADMIN",
        organizationId: null,
      } as any);

      vi.spyOn(superAdminService, "listSuperAdmins").mockResolvedValue([
        {
          id: admin1Id,
          name: "Principal SuperAdmin",
          email: "superadmin1@rkonekte.com",
          role: "SUPER_ADMIN",
          status: "ACTIVE",
          lastLoginAt: null,
          lastSeenAt: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]);

      const res = await getAdminsRoute();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.admins)).toBe(true);
      expect(data.admins.length).toBe(1);
    });

    it("allows SUPER_ADMIN to create new superadmin via POST", async () => {
      vi.spyOn(sessionLib, "getSession").mockResolvedValue({
        id: admin1Id,
        email: "superadmin1@rkonekte.com",
        role: "SUPER_ADMIN",
        organizationId: null,
      } as any);

      vi.spyOn(superAdminService, "createSuperAdmin").mockResolvedValue({
        id: "new-sa-id",
        name: "Direct API Admin",
        email: "direct.api@rkonekte.com",
        role: "SUPER_ADMIN",
        status: "ACTIVE",
        lastLoginAt: null,
        lastSeenAt: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const req = new NextRequest("http://localhost:3000/api/super-admin/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Direct API Admin",
          email: "direct.api@rkonekte.com",
          password: "VerySecurePassword123!",
        }),
      });

      const res = await postAdminRoute(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.admin.email).toBe("direct.api@rkonekte.com");
    });
  });

  describe("API Routes: /api/super-admin/admins/[id]", () => {
    beforeEach(() => {
      vi.spyOn(sessionLib, "getSession").mockResolvedValue({
        id: admin1Id,
        email: "superadmin1@rkonekte.com",
        role: "SUPER_ADMIN",
        organizationId: null,
      } as any);
    });

    it("PATCH updates superadmin status", async () => {
      vi.spyOn(superAdminService, "updateSuperAdminStatus").mockResolvedValue();

      const req = new NextRequest(`http://localhost:3000/api/super-admin/admins/${admin2Id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "DISABLED" }),
      });

      const res = await patchAdminRoute(req, { params: Promise.resolve({ id: admin2Id }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(superAdminService.updateSuperAdminStatus).toHaveBeenCalledWith(admin2Id, "DISABLED", admin1Id);
    });

    it("PATCH resets superadmin password", async () => {
      vi.spyOn(superAdminService, "resetSuperAdminPassword").mockResolvedValue();

      const req = new NextRequest(`http://localhost:3000/api/super-admin/admins/${admin2Id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "BrandNewPassword2026!" }),
      });

      const res = await patchAdminRoute(req, { params: Promise.resolve({ id: admin2Id }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(superAdminService.resetSuperAdminPassword).toHaveBeenCalledWith(admin2Id, "BrandNewPassword2026!");
    });

    it("DELETE removes another superadmin", async () => {
      vi.spyOn(superAdminService, "deleteSuperAdmin").mockResolvedValue();

      const req = new NextRequest(`http://localhost:3000/api/super-admin/admins/${admin2Id}`, {
        method: "DELETE",
      });

      const res = await deleteAdminRoute(req, { params: Promise.resolve({ id: admin2Id }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(superAdminService.deleteSuperAdmin).toHaveBeenCalledWith(admin2Id, admin1Id);
    });

    it("DELETE rejects self-deletion with 400", async () => {
      vi.spyOn(superAdminService, "deleteSuperAdmin").mockRejectedValue(
        new Error("Vous ne pouvez pas supprimer votre propre compte Super Administrateur actuellement connecté.")
      );

      const req = new NextRequest(`http://localhost:3000/api/super-admin/admins/${admin1Id}`, {
        method: "DELETE",
      });

      const res = await deleteAdminRoute(req, { params: Promise.resolve({ id: admin1Id }) });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("votre propre compte");
    });
  });
});

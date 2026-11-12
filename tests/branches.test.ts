import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createTestDb } from "../src/lib/db/client";
import { runMigrations } from "../scripts/migrate";
import { organizations } from "../src/db/schema";
import { listBranches, createBranch, deleteBranch } from "../src/lib/services/branches";
import { supabaseDb } from "../src/lib/supabase/db";

describe("Branches Service (Succursales)", () => {
  let db: any;
  const freshOrgId = "org-fresh-no-branches";
  const otherOrgId = "org-other-with-branches";

  beforeEach(async () => {
    db = createTestDb(":memory:");
    await runMigrations(db);
    const now = Date.now();

    await db.insert(organizations).values([
      {
        id: freshOrgId,
        name: "Jeff Int",
        slug: "jeff-int",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: otherOrgId,
        name: "Autre Entreprise",
        slug: "autre-entreprise",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      },
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns an empty list for a newly created organization (never auto-creates Siège Principal or falls back to default seeds)", async () => {
    const result = await listBranches(freshOrgId, db);
    expect(result).toEqual([]);
  });

  it("does not auto-create Siège Principal via Supabase when Supabase returns 0 branches", async () => {
    const listSpy = vi.spyOn(supabaseDb.branches, "list").mockResolvedValue([]);
    const createSpy = vi.spyOn(supabaseDb.branches, "create");

    const result = await listBranches(freshOrgId);

    expect(listSpy).toHaveBeenCalledWith(freshOrgId);
    expect(createSpy).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it("returns only explicitly created branches for each organization and stays empty after deleting the last branch", async () => {
    await createBranch(
      otherOrgId,
      {
        name: "Succursale Pétion-Ville",
        city: "Pétion-Ville",
        address: "Rue Rigaud",
        phone: "+509 2811-1234",
      },
      db
    );

    const otherList = await listBranches(otherOrgId, db);
    expect(otherList).toHaveLength(1);
    expect(otherList[0].name).toBe("Succursale Pétion-Ville");

    // Newly created org must remain completely empty
    const freshList = await listBranches(freshOrgId, db);
    expect(freshList).toEqual([]);

    // Deleting the only branch returns to empty [] without re-creating a default branch
    await deleteBranch(otherOrgId, otherList[0].id, db);
    const afterDelete = await listBranches(otherOrgId, db);
    expect(afterDelete).toEqual([]);
  });
});

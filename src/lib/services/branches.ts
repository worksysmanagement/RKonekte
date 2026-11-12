import { getDb } from "@/lib/db/client";
import { branches, Branch, InsertBranch } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { supabaseDb } from "@/lib/supabase/db";

export async function listBranches(
  organizationId: string,
  dbInstance?: any
): Promise<Branch[]> {
  try {
    if (!dbInstance) {
      const remoteList = await supabaseDb.branches.list(organizationId);
      return remoteList || [];
    }
  } catch (_) {}

  // Fallback to local SQLite / Drizzle
  try {
    const db = dbInstance || getDb();
    const rows = await db
      .select()
      .from(branches)
      .where(eq(branches.organizationId, organizationId));

    return rows || [];
  } catch (_) {}

  return [];
}

export async function getBranchById(
  organizationId: string,
  id: string,
  dbInstance?: any
): Promise<Branch | null> {
  try {
    if (!dbInstance) {
      return await supabaseDb.branches.getById(id, organizationId);
    }
  } catch (_) {}

  const db = dbInstance || getDb();
  const [b] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.id, id), eq(branches.organizationId, organizationId)))
    .limit(1);

  return b || null;
}

export async function createBranch(
  organizationId: string,
  input: {
    name: string;
    city: string;
    address?: string | null;
    managerName?: string | null;
    phone?: string | null;
    status?: "ACTIVE" | "INACTIVE";
  },
  dbInstance?: any
): Promise<Branch> {
  const now = Date.now();
  const branchId = `br-${now}-${Math.random().toString(36).slice(-4)}`;

  try {
    if (!dbInstance) {
      return await supabaseDb.branches.create(organizationId, {
        id: branchId,
        organizationId,
        name: input.name,
        city: input.city,
        address: input.address || null,
        managerName: input.managerName || null,
        phone: input.phone || null,
        status: input.status || "ACTIVE",
        createdAt: now,
        updatedAt: now,
      });
    }
  } catch (_) {}

  const db = dbInstance || getDb();
  const newRecord: InsertBranch = {
    id: branchId,
    organizationId,
    name: input.name,
    city: input.city,
    address: input.address || null,
    managerName: input.managerName || null,
    phone: input.phone || null,
    status: input.status || "ACTIVE",
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(branches).values(newRecord);
  return newRecord as Branch;
}

export async function updateBranch(
  organizationId: string,
  id: string,
  input: {
    name?: string;
    city?: string;
    address?: string | null;
    managerName?: string | null;
    phone?: string | null;
    status?: "ACTIVE" | "INACTIVE";
  },
  dbInstance?: any
): Promise<Branch> {
  const now = Date.now();

  try {
    if (!dbInstance) {
      return await supabaseDb.branches.update(id, organizationId, {
        name: input.name,
        city: input.city,
        address: input.address,
        managerName: input.managerName,
        phone: input.phone,
        status: input.status,
      });
    }
  } catch (_) {}

  const db = dbInstance || getDb();
  const updateData: Partial<InsertBranch> = {
    updatedAt: now,
  };

  if (input.name !== undefined) updateData.name = input.name;
  if (input.city !== undefined) updateData.city = input.city;
  if (input.address !== undefined) updateData.address = input.address;
  if (input.managerName !== undefined) updateData.managerName = input.managerName;
  if (input.phone !== undefined) updateData.phone = input.phone;
  if (input.status !== undefined) updateData.status = input.status;

  await db
    .update(branches)
    .set(updateData)
    .where(and(eq(branches.id, id), eq(branches.organizationId, organizationId)));

  const [updated] = await db
    .select()
    .from(branches)
    .where(eq(branches.id, id))
    .limit(1);

  return updated;
}

export async function deleteBranch(
  organizationId: string,
  id: string,
  dbInstance?: any
): Promise<void> {
  try {
    if (!dbInstance) {
      await supabaseDb.branches.delete(id, organizationId);
      return;
    }
  } catch (_) {}

  const db = dbInstance || getDb();
  await db
    .delete(branches)
    .where(and(eq(branches.id, id), eq(branches.organizationId, organizationId)));
}

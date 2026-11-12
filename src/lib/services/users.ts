import { getDb } from "@/lib/db/client";
import { users, User, InsertUser } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { CreateOrgUserInput } from "@/lib/validation/schemas";
import { hashPassword } from "@/lib/auth/password";
import { supabaseDb } from "@/lib/supabase/db";

export async function listOrgUsers(
  organizationId: string,
  dbInstance?: any
): Promise<Omit<User, "passwordHash">[]> {
  if (!dbInstance) {
    return await supabaseDb.users.listByOrg(organizationId);
  }
  const db = dbInstance || getDb();
  return await db
    .select({
      id: users.id,
      organizationId: users.organizationId,
      branchId: users.branchId,
      name: users.name,
      email: users.email,
      role: users.role,
      status: users.status,
      lastLoginAt: users.lastLoginAt,
      lastSeenAt: users.lastSeenAt,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.organizationId, organizationId))
    .orderBy(desc(users.createdAt));
}

export async function createOrgUser(
  organizationId: string,
  input: CreateOrgUserInput,
  dbInstance?: any
): Promise<Omit<User, "passwordHash">> {
  if (!dbInstance) {
    return await supabaseDb.users.createOrgUser(organizationId, input);
  }
  const db = dbInstance || getDb();

  // Check unique email
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, input.email.toLowerCase()))
    .limit(1);

  if (existing) {
    throw new Error("Cette adresse email est déjà utilisée");
  }

  const now = Date.now();
  const newId = `usr-${crypto.randomUUID()}`;
  const passwordHash = await hashPassword(input.password);

  const insertData: InsertUser = {
    id: newId,
    organizationId,
    branchId: input.branchId || null,
    name: input.name,
    email: input.email.toLowerCase(),
    passwordHash,
    role: input.role,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(users).values(insertData);

  const [created] = await db
    .select({
      id: users.id,
      organizationId: users.organizationId,
      branchId: users.branchId,
      name: users.name,
      email: users.email,
      role: users.role,
      status: users.status,
      lastLoginAt: users.lastLoginAt,
      lastSeenAt: users.lastSeenAt,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.id, newId))
    .limit(1);

  return created;
}

export async function getUserByEmail(email: string, dbInstance?: any): Promise<User | null> {
  if (!dbInstance) {
    return await supabaseDb.users.getByEmail(email);
  }
  const db = dbInstance || getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim())).limit(1);
  return user || null;
}

export async function getUserById(id: string, dbInstance?: any): Promise<User | null> {
  if (!dbInstance) {
    return await supabaseDb.users.getById(id);
  }
  const db = dbInstance || getDb();
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user || null;
}

export async function updateUserStatus(id: string, status: "ACTIVE" | "DISABLED", dbInstance?: any): Promise<void> {
  if (!dbInstance) {
    return await supabaseDb.users.updateStatus(id, status);
  }
  const db = dbInstance || getDb();
  await db.update(users).set({ status, updatedAt: Date.now() }).where(eq(users.id, id));
}

export async function updateUserRole(
  organizationId: string,
  userId: string,
  role: string,
  dbInstance?: any
): Promise<Omit<User, "passwordHash">> {
  const cleanRole = role.trim();
  if (!cleanRole) {
    throw new Error("Le rôle système est obligatoire");
  }
  if (cleanRole === "SUPER_ADMIN") {
    throw new Error("Attribution du rôle Super Administrateur interdite");
  }

  if (!dbInstance) {
    return await supabaseDb.users.updateRole(organizationId, userId, cleanRole);
  }

  const db = dbInstance;
  const [target] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.organizationId, organizationId)))
    .limit(1);

  if (!target) {
    throw new Error("Utilisateur introuvable dans cette entreprise");
  }
  if (target.role === "SUPER_ADMIN") {
    throw new Error("Impossible de modifier le rôle d'un Super Administrateur");
  }

  if (target.role === "ORGANIZATION_ADMIN" && cleanRole !== "ORGANIZATION_ADMIN") {
    const admins = await db
      .select({ id: users.id, status: users.status })
      .from(users)
      .where(
        and(
          eq(users.organizationId, organizationId),
          eq(users.role, "ORGANIZATION_ADMIN")
        )
      );

    const remainingActiveAdmins = admins.filter(
      (a: { id: string; status: string }) => a.id !== userId && a.status === "ACTIVE"
    );
    if (remainingActiveAdmins.length === 0) {
      throw new Error(
        "Impossible de rétrograder le seul PDG / Propriétaire actif de l'entreprise. Désignez d'abord un autre PDG / Propriétaire."
      );
    }
  }

  const now = Date.now();
  await db
    .update(users)
    .set({ role: cleanRole, updatedAt: now })
    .where(and(eq(users.id, userId), eq(users.organizationId, organizationId)));

  const [updated] = await db
    .select({
      id: users.id,
      organizationId: users.organizationId,
      branchId: users.branchId,
      name: users.name,
      email: users.email,
      role: users.role,
      status: users.status,
      lastLoginAt: users.lastLoginAt,
      lastSeenAt: users.lastSeenAt,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.organizationId, organizationId)))
    .limit(1);

  return updated;
}

import { getDb } from "@/lib/db/client";
import { users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { hashPassword } from "@/lib/auth/password";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export interface SuperAdminUserItem {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "ACTIVE" | "DISABLED";
  lastLoginAt: number | null;
  lastSeenAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface CreateSuperAdminInput {
  name: string;
  email: string;
  password: string;
}

function hasSupabaseCredentials(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY;
  return Boolean(url && key);
}

export async function listSuperAdmins(dbInstance?: any): Promise<SuperAdminUserItem[]> {
  // 1. If explicit dbInstance or no Supabase credentials, use local SQLite/Drizzle
  if (dbInstance || !hasSupabaseCredentials()) {
    const db = dbInstance || getDb();
    const rows = await db
      .select({
        id: users.id,
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
      .where(eq(users.role, "SUPER_ADMIN"))
      .orderBy(desc(users.createdAt));

    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      status: (r.status as "ACTIVE" | "DISABLED") || "ACTIVE",
      lastLoginAt: r.lastLoginAt ? Number(r.lastLoginAt) : null,
      lastSeenAt: r.lastSeenAt ? Number(r.lastSeenAt) : null,
      createdAt: Number(r.createdAt || Date.now()),
      updatedAt: Number(r.updatedAt || Date.now()),
    }));
  }

  // 2. Production Supabase path
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("users")
      .select("id, name, email, role, status, last_login_at, last_seen_at, created_at, updated_at")
      .eq("role", "SUPER_ADMIN")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return (data || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      status: (r.status as "ACTIVE" | "DISABLED") || "ACTIVE",
      lastLoginAt: r.last_login_at ? Number(r.last_login_at) : null,
      lastSeenAt: r.last_seen_at ? Number(r.last_seen_at) : null,
      createdAt: Number(r.created_at || Date.now()),
      updatedAt: Number(r.updated_at || Date.now()),
    }));
  } catch (err) {
    // Fallback to SQLite if Supabase fails
    const db = getDb();
    const rows = await db
      .select({
        id: users.id,
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
      .where(eq(users.role, "SUPER_ADMIN"))
      .orderBy(desc(users.createdAt));

    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      status: (r.status as "ACTIVE" | "DISABLED") || "ACTIVE",
      lastLoginAt: r.lastLoginAt ? Number(r.lastLoginAt) : null,
      lastSeenAt: r.lastSeenAt ? Number(r.lastSeenAt) : null,
      createdAt: Number(r.createdAt || Date.now()),
      updatedAt: Number(r.updatedAt || Date.now()),
    }));
  }
}

export async function createSuperAdmin(
  input: CreateSuperAdminInput,
  dbInstance?: any
): Promise<SuperAdminUserItem> {
  const cleanName = input.name?.trim();
  const cleanEmail = input.email?.trim().toLowerCase();
  const cleanPassword = input.password?.trim();

  if (!cleanName || cleanName.length < 2) {
    throw new Error("Le nom complet du super-administrateur est requis (au moins 2 caractères).");
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!cleanEmail || !emailRegex.test(cleanEmail)) {
    throw new Error("L'adresse e-mail fournie est invalide.");
  }

  if (!cleanPassword || cleanPassword.length < 8) {
    throw new Error("Le mot de passe doit comporter au moins 8 caractères.");
  }

  const now = Date.now();
  const newId = `usr-${crypto.randomUUID()}`;
  const passwordHash = await hashPassword(cleanPassword);

  // 1. If explicit dbInstance or no Supabase
  if (dbInstance || !hasSupabaseCredentials()) {
    const db = dbInstance || getDb();

    // Check unique email
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, cleanEmail))
      .limit(1);

    if (existing) {
      throw new Error("Cette adresse e-mail est déjà utilisée par un autre compte.");
    }

    await db.insert(users).values({
      id: newId,
      organizationId: null,
      branchId: null,
      name: cleanName,
      email: cleanEmail,
      passwordHash,
      role: "SUPER_ADMIN",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    return {
      id: newId,
      name: cleanName,
      email: cleanEmail,
      role: "SUPER_ADMIN",
      status: "ACTIVE",
      lastLoginAt: null,
      lastSeenAt: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  // 2. Production Supabase path
  try {
    const supabase = getSupabaseAdminClient();

    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("email", cleanEmail)
      .maybeSingle();

    if (existing) {
      throw new Error("Cette adresse e-mail est déjà utilisée par un autre compte.");
    }

    const payload = {
      id: newId,
      organization_id: null,
      name: cleanName,
      email: cleanEmail,
      password_hash: passwordHash,
      role: "SUPER_ADMIN",
      status: "ACTIVE",
      created_at: now,
      updated_at: now,
    };

    const { error } = await supabase.from("users").insert(payload);
    if (error) {
      throw new Error(`Erreur lors de la création du compte SuperAdmin: ${error.message}`);
    }

    // Mirror to local SQLite if available for local cache consistency
    try {
      const db = getDb();
      await db.insert(users).values({
        id: newId,
        organizationId: null,
        branchId: null,
        name: cleanName,
        email: cleanEmail,
        passwordHash,
        role: "SUPER_ADMIN",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      });
    } catch (_) {}

    return {
      id: newId,
      name: cleanName,
      email: cleanEmail,
      role: "SUPER_ADMIN",
      status: "ACTIVE",
      lastLoginAt: null,
      lastSeenAt: null,
      createdAt: now,
      updatedAt: now,
    };
  } catch (err: any) {
    if (err.message?.includes("déjà utilisée")) {
      throw err;
    }
    // Fallback to SQLite
    const db = getDb();
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, cleanEmail))
      .limit(1);

    if (existing) {
      throw new Error("Cette adresse e-mail est déjà utilisée par un autre compte.");
    }

    await db.insert(users).values({
      id: newId,
      organizationId: null,
      branchId: null,
      name: cleanName,
      email: cleanEmail,
      passwordHash,
      role: "SUPER_ADMIN",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    return {
      id: newId,
      name: cleanName,
      email: cleanEmail,
      role: "SUPER_ADMIN",
      status: "ACTIVE",
      lastLoginAt: null,
      lastSeenAt: null,
      createdAt: now,
      updatedAt: now,
    };
  }
}

export async function updateSuperAdminStatus(
  targetId: string,
  newStatus: "ACTIVE" | "DISABLED",
  currentUserId: string,
  dbInstance?: any
): Promise<void> {
  if (targetId === currentUserId) {
    throw new Error("Vous ne pouvez pas modifier le statut de votre propre compte Super Administrateur.");
  }

  const allAdmins = await listSuperAdmins(dbInstance);
  const target = allAdmins.find((a) => a.id === targetId);
  if (!target) {
    throw new Error("Compte Super Administrateur introuvable.");
  }

  if (newStatus === "DISABLED") {
    const activeAdmins = allAdmins.filter((a) => a.status === "ACTIVE" && a.id !== targetId);
    if (activeAdmins.length === 0) {
      throw new Error("Impossible de désactiver le seul Super Administrateur actif restant.");
    }
  }

  const now = Date.now();

  if (dbInstance || !hasSupabaseCredentials()) {
    const db = dbInstance || getDb();
    await db.update(users).set({ status: newStatus, updatedAt: now }).where(eq(users.id, targetId));
    return;
  }

  try {
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase
      .from("users")
      .update({ status: newStatus, updated_at: now })
      .eq("id", targetId);
    if (error) throw error;
  } catch (_) {
    const db = getDb();
    await db.update(users).set({ status: newStatus, updatedAt: now }).where(eq(users.id, targetId));
  }
}

export async function resetSuperAdminPassword(
  targetId: string,
  newPassword: string,
  dbInstance?: any
): Promise<void> {
  const cleanPassword = newPassword?.trim();
  if (!cleanPassword || cleanPassword.length < 8) {
    throw new Error("Le nouveau mot de passe doit comporter au moins 8 caractères.");
  }

  const passwordHash = await hashPassword(cleanPassword);
  const now = Date.now();

  if (dbInstance || !hasSupabaseCredentials()) {
    const db = dbInstance || getDb();
    await db.update(users).set({ passwordHash, updatedAt: now }).where(eq(users.id, targetId));
    return;
  }

  try {
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase
      .from("users")
      .update({ password_hash: passwordHash, updated_at: now })
      .eq("id", targetId);
    if (error) throw error;
  } catch (_) {
    const db = getDb();
    await db.update(users).set({ passwordHash, updatedAt: now }).where(eq(users.id, targetId));
  }
}

export async function deleteSuperAdmin(
  targetId: string,
  currentUserId: string,
  dbInstance?: any
): Promise<void> {
  if (targetId === currentUserId) {
    throw new Error("Vous ne pouvez pas supprimer votre propre compte Super Administrateur actuellement connecté.");
  }

  const allAdmins = await listSuperAdmins(dbInstance);
  const target = allAdmins.find((a) => a.id === targetId);
  if (!target) {
    throw new Error("Compte Super Administrateur introuvable.");
  }

  if (allAdmins.length <= 1) {
    throw new Error("Impossible de supprimer le seul Super Administrateur de la plateforme.");
  }

  const remainingActive = allAdmins.filter((a) => a.id !== targetId && a.status === "ACTIVE");
  if (remainingActive.length === 0) {
    throw new Error("Impossible de supprimer ce compte : aucun autre Super Administrateur actif ne subsisterait.");
  }

  if (dbInstance || !hasSupabaseCredentials()) {
    const db = dbInstance || getDb();
    await db.delete(users).where(eq(users.id, targetId));
    return;
  }

  try {
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase.from("users").delete().eq("id", targetId);
    if (error) throw error;
  } catch (_) {
    const db = getDb();
    await db.delete(users).where(eq(users.id, targetId));
  }
}

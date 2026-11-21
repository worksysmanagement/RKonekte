import { getSession, SessionUser } from "./session";
import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { mapOrg, mapUser } from "@/lib/supabase/db";
import { getDb } from "@/lib/db/client";
import { organizations, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isSubscriptionAccessBlocked } from "@/lib/utils/subscription";

export class AuthError extends Error {
  statusCode: number;
  code?: string;
  constructor(message: string, statusCode = 401, code?: string) {
    super(message);
    this.name = "AuthError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Ensures user is authenticated.
 */
export async function requireAuth(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) {
    throw new AuthError("Authentification requise", 401);
  }
  return session;
}

/**
 * Ensures user is SUPER_ADMIN.
 */
export async function requireSuperAdmin(): Promise<SessionUser> {
  const session = await requireAuth();
  if (session.role !== "SUPER_ADMIN") {
    throw new AuthError("Accès réservé au Super Administrateur", 403);
  }
  return session;
}

/**
 * Ensures user belongs to an organization (ORGANIZATION_ADMIN or EMPLOYEE).
 * Returns the session and the verified organizationId.
 * NEVER trust an organizationId passed in request payload!
 */
export async function requireTenantUser(): Promise<{
  user: SessionUser;
  organizationId: string;
  branchId?: string | null;
}> {
  const session = await requireAuth();
  if (session.role === "SUPER_ADMIN" || !session.organizationId) {
    throw new AuthError("Accès réservé aux utilisateurs d'entreprise", 403);
  }

  // Enforce immediate live block if SuperAdmin stopped service or account/org is not ACTIVE
  try {
    let org: any = null;
    let liveUser: any = null;
    let dbVerified = false;

    try {
      const supabase = getSupabaseAdminClient();
      const { data: orgData, error: orgErr } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", session.organizationId)
        .maybeSingle();

      const { data: uById, error: uIdErr } = await supabase
        .from("users")
        .select("id, status, password_hash, role, branch_id")
        .eq("id", session.id)
        .maybeSingle();

      let uData = uById;
      let uErr = uIdErr;
      if (!uData && !uErr && session.email) {
        const { data: uByEmail, error: uEmailErr } = await supabase
          .from("users")
          .select("id, status, password_hash, role, branch_id")
          .ilike("email", session.email.toLowerCase().trim())
          .maybeSingle();
        uData = uByEmail;
        uErr = uEmailErr;
      }

      if (!orgErr && !uErr) {
        dbVerified = true;
        org = orgData ? mapOrg(orgData) : null;
        liveUser = uData ? mapUser(uData) : null;
      }
    } catch (_) {
      try {
        const db = getDb();
        const [dbOrg] = await db
          .select()
          .from(organizations)
          .where(eq(organizations.id, session.organizationId))
          .limit(1);
        const [dbUser] = await db
          .select()
          .from(users)
          .where(eq(users.id, session.id))
          .limit(1);
        dbVerified = true;
        org = dbOrg || null;
        liveUser = dbUser || null;
      } catch (__) {}
    }

    if (
      liveUser &&
      (liveUser.status !== "ACTIVE" || liveUser.passwordHash === "NO_PASSWORD_SET")
    ) {
      throw new AuthError(
        "Votre compte utilisateur n'est pas actif ou le mot de passe n'a pas été configuré.",
        403,
        "ACCOUNT_INACTIVE"
      );
    }

    if (dbVerified && (!org || org.status !== "ACTIVE")) {
      throw new AuthError(
        "L'organisation associée à ce compte n'est pas active.",
        403,
        "ACCOUNT_INACTIVE"
      );
    }

    if (org && isSubscriptionAccessBlocked(org)) {
      throw new AuthError(
        "L'abonnement de votre entreprise a expiré ou le service est arrêté.",
        403,
        "SERVICE_STOPPED"
      );
    }
  } catch (err) {
    if (err instanceof AuthError) throw err;
  }

  return {
    user: session,
    organizationId: session.organizationId,
    branchId: session.branchId || null,
  };
}

/**
 * Ensures user is ORGANIZATION_ADMIN of their organization.
 */
export async function requireOrgAdmin(): Promise<{
  user: SessionUser;
  organizationId: string;
  branchId?: string | null;
}> {
  const tenantContext = await requireTenantUser();
  if (tenantContext.user.role !== "ORGANIZATION_ADMIN") {
    throw new AuthError("Action réservée à l'administrateur de l'entreprise", 403);
  }
  return tenantContext;
}

/**
 * Ensures user is authorized to approve or reject requests.
 * Only ORGANIZATION_ADMIN can approve or reject (employees cannot).
 */
export async function requireRequestApprover(): Promise<{
  user: SessionUser;
  organizationId: string;
  branchId?: string | null;
}> {
  const tenantContext = await requireTenantUser();
  if (tenantContext.user.role !== "ORGANIZATION_ADMIN") {
    throw new AuthError("Action non autorisée : seuls les administrateurs de l'entreprise peuvent valider ou rejeter les demandes.", 403);
  }

  return tenantContext;
}

/**
 * Wrapper for API route handlers to catch AuthError and return proper JSON response.
 */
export function handleApiError(err: unknown) {
  if (err instanceof AuthError) {
    const res = NextResponse.json(
      { error: err.message, ...(err.code ? { code: err.code } : {}) },
      { status: err.statusCode }
    );
    if (err.code === "SERVICE_STOPPED" || err.code === "ACCOUNT_INACTIVE") {
      res.cookies.set("lm_session", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });
    }
    return res;
  }
  console.error("Unhandled API error:", err);
  return NextResponse.json(
    { error: "Une erreur inattendue est survenue" },
    { status: 500 }
  );
}

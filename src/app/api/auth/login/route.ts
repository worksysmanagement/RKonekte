import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { users, organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyPassword } from "@/lib/auth/password";
import {
  clearSessionCookie,
  clearStoppedNoticeCookie,
  setSessionCookie,
  setStoppedNoticeCookie,
  StoppedNoticePayload,
} from "@/lib/auth/session";
import { loginSchema } from "@/lib/validation/schemas";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { buildStoppedClientContext } from "@/lib/services/stopped-context";
import { recordUserLoginActivity } from "@/lib/services/user-activity";
import {
  computeSubscriptionState,
  isSubscriptionAccessBlocked,
} from "@/lib/utils/subscription";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
    const rateLimit = checkRateLimit(`login:${ip}`, 10, 60);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Trop de tentatives. Veuillez patienter une minute." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const parseResult = loginSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Données de connexion invalides", details: parseResult.error.format() },
        { status: 400 }
      );
    }

    const { email, password } = parseResult.data;
    const normalizedEmail = email.toLowerCase().trim();

    // 1. Find user by email (or alias for superadmin)
    const emailVariations = [normalizedEmail];
    if (normalizedEmail.startsWith("superadmin@")) {
      emailVariations.push("superadmin@platform.local", "superadmin@plateform.local", "superadmin@plateforme.local");
    }

    let user: any = null;
    try {
      const supabase = (await import("@/lib/supabase/server")).getSupabaseAdminClient();
      const { data: dbUsers } = await supabase.from("users").select("*");
      if (dbUsers && dbUsers.length > 0) {
        const found = dbUsers.find(
          (u) => emailVariations.includes(u.email.toLowerCase()) && u.status === "ACTIVE"
        );
        if (found) {
          const { mapUser } = await import("@/lib/supabase/db");
          user = mapUser(found);
        }
      }
    } catch (_) {}

    // Fallback if not found in Supabase
    if (!user) {
      const db = getDb();
      const allUsers = await db.select().from(users);
      user = allUsers.find(
        (u) => emailVariations.includes(u.email.toLowerCase()) && u.status === "ACTIVE"
      );
    }

    if (!user) {
      return NextResponse.json(
        { error: "Identifiants invalides ou compte introuvable" },
        { status: 401 }
      );
    }

    // 2. Verify password hash BEFORE exposing any organization subscription status
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { error: "Identifiants invalides" },
        { status: 401 }
      );
    }

    // 3. If organization user, load organization and verify activation / service status
    let organizationName: string | undefined;
    let organizationSlug: string | undefined;

    if (user.organizationId) {
      let org: any = null;
      try {
        const supabase = (await import("@/lib/supabase/server")).getSupabaseAdminClient();
        const { data: orgData } = await supabase
          .from("organizations")
          .select("*")
          .eq("id", user.organizationId)
          .maybeSingle();
        if (orgData) {
          const { mapOrg } = await import("@/lib/supabase/db");
          org = mapOrg(orgData);
        }
      } catch (_) {}

      if (!org) {
        const db = getDb();
        const [dbOrg] = await db
          .select()
          .from(organizations)
          .where(eq(organizations.id, user.organizationId))
          .limit(1);
        org = dbOrg;
      }

      if (!org) {
        return NextResponse.json(
          { error: "L'organisation associée à ce compte est introuvable" },
          { status: 403 }
        );
      }

      if (org.status !== "ACTIVE") {
        return NextResponse.json(
          { error: "L'organisation associée à ce compte est désactivée" },
          { status: 403 }
        );
      }

      if (isSubscriptionAccessBlocked(org)) {
        await clearSessionCookie();
        const isOrgAdmin = user.role === "ORGANIZATION_ADMIN";
        const subState = computeSubscriptionState(org);
        const noticePayload: StoppedNoticePayload = {
          purpose: "SERVICE_STOPPED_NOTICE",
          organizationId: org.id,
          organizationName: org.name,
          userId: user.id,
          userName: user.name,
          userEmail: user.email,
          isAdmin: isOrgAdmin,
        };
        await setStoppedNoticeCookie(noticePayload);

        const defaultEmployeeMessage =
          subState.isExpired && !org.serviceStopped
            ? "L'abonnement de votre entreprise a expiré. Veuillez contacter votre administrateur pour la réactivation."
            : "Veuillez contacter votre administrateur pour cet arrêt de service.";

        let stoppedContext: any;
        try {
          stoppedContext = await buildStoppedClientContext(noticePayload);
        } catch (_) {
          stoppedContext = isOrgAdmin
            ? {
                resumed: false,
                serviceStopped: true,
                isAdmin: true,
                organizationName: org.name,
                state: subState,
              }
            : {
                resumed: false,
                serviceStopped: true,
                isAdmin: false,
                organizationName: org.name,
                message: defaultEmployeeMessage,
              };
        }

        return NextResponse.json(
          {
            error: isOrgAdmin
              ? "Votre abonnement a expiré et l'accès est suspendu jusqu'à la réactivation."
              : defaultEmployeeMessage,
            code: isOrgAdmin ? "SERVICE_STOPPED_ADMIN" : "SERVICE_STOPPED_EMPLOYEE",
            isAdmin: isOrgAdmin,
            stoppedContext,
          },
          { status: 403 }
        );
      }

      organizationName = org.name;
      organizationSlug = org.slug;
    }

    await clearStoppedNoticeCookie();

    let branchName: string | undefined;
    if (user.branchId && user.organizationId) {
      try {
        const supabase = (await import("@/lib/supabase/server")).getSupabaseAdminClient();
        const { data: bData } = await supabase
          .from("branches")
          .select("name")
          .eq("id", user.branchId)
          .maybeSingle();
        if (bData) branchName = bData.name;
      } catch (_) {}
    }

    // 4. Record real login activity & set session cookie
    await recordUserLoginActivity({
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role,
      email: user.email,
      source: "LOGIN",
    });

    await setSessionCookie({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      organizationName,
      organizationSlug,
      branchId: user.branchId || null,
      branchName,
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
        organizationName,
        branchId: user.branchId || null,
        branchName,
      },
    });
  } catch (err: any) {
    console.error("Login API error:", err);
    return NextResponse.json(
      { error: `Erreur de connexion: ${err?.message || "Veuillez réessayer"}` },
      { status: 500 }
    );
  }
}

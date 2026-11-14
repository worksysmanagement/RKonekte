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
    let anyUserWithEmail: any = null;

    try {
      const supabase = (await import("@/lib/supabase/server")).getSupabaseAdminClient();
      const { data: dbUsers, error: sbErr } = await supabase.from("users").select("*");
      if (sbErr) {
        console.error("Supabase select users error:", sbErr);
      }
      if (dbUsers && dbUsers.length > 0) {
        const found = dbUsers.find(
          (u) => emailVariations.includes((u.email || "").toLowerCase().trim())
        );
        if (found) {
          const { mapUser } = await import("@/lib/supabase/db");
          anyUserWithEmail = mapUser(found);
          if (found.status === "ACTIVE") {
            user = anyUserWithEmail;
          }
        }
      }

      // If not found in list, try direct search by email
      if (!anyUserWithEmail) {
        for (const candidateEmail of emailVariations) {
          const { data: directUsers } = await supabase
            .from("users")
            .select("*")
            .ilike("email", candidateEmail)
            .limit(1);
          if (directUsers && directUsers.length > 0) {
            const { mapUser } = await import("@/lib/supabase/db");
            anyUserWithEmail = mapUser(directUsers[0]);
            if (directUsers[0].status === "ACTIVE") {
              user = anyUserWithEmail;
            }
            break;
          }
        }
      }
    } catch (sbErr) {
      console.error("Supabase login lookup error:", sbErr);
    }

    // Fallback SQLite (local dev only)
    if (!anyUserWithEmail) {
      try {
        const db = getDb();
        if (db) {
          const allUsers = await db.select().from(users);
          const found = allUsers.find(
            (u) => emailVariations.includes((u.email || "").toLowerCase().trim())
          );
          if (found) {
            anyUserWithEmail = found;
            if (found.status === "ACTIVE") {
              user = found;
            }
          }
        }
      } catch (sqliteErr) {
        console.warn("SQLite fallback unavailable:", sqliteErr);
      }
    }

    // 1. Si le compte n'existe pas dans la base de données
    if (!anyUserWithEmail) {
      return NextResponse.json(
        { error: "Ce compte n'existe pas." },
        { status: 401 }
      );
    }

    // 2. Si le mot de passe n'est pas correct
    const isValid = await verifyPassword(password, anyUserWithEmail.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { error: "L'adresse e-mail ou le mot de passe n'est pas correct." },
        { status: 401 }
      );
    }

    // 3. Si le compte existe et le mot de passe est correct, mais le compte n'est pas actif
    if (!user || anyUserWithEmail.status !== "ACTIVE") {
      return NextResponse.json(
        {
          error:
            "Votre compte n'est pas encore activé. Veuillez vérifier vos e-mails pour finaliser votre inscription.",
        },
        { status: 403 }
      );
    }

    // 4. If organization user, load organization and verify activation / service status
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
        try {
          const db = getDb();
          const [dbOrg] = await db
            .select()
            .from(organizations)
            .where(eq(organizations.id, user.organizationId))
            .limit(1);
          org = dbOrg;
        } catch (_) {}
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
      { error: "Une erreur est survenue lors de la connexion. Veuillez réessayer." },
      { status: 500 }
    );
  }
}

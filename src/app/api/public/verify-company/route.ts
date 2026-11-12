import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { auditLogs, organizations, users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { hashPassword } from "@/lib/auth/password";
import { clearStoppedNoticeCookie, setSessionCookie } from "@/lib/auth/session";
import { resolveAppOrigin } from "@/lib/notifications/email";
import { recordUserLoginActivity } from "@/lib/services/user-activity";
import {
  addCalendarMonths,
  getPlatformSubscriptionSettings,
  sendSubscriptionActivationWelcomeEmail,
} from "@/lib/services/subscriptions";

/**
 * GET: Verifies if the token is valid and returns registration info for the set-password form.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { error: "Jeton de validation manquant ou invalide." },
        { status: 400 }
      );
    }

    let matchedLog: any = null;
    let matchedMetadata: any = null;

    // 1. Try Supabase first
    try {
      const supabase = (await import("@/lib/supabase/server")).getSupabaseAdminClient();
      const { data: supaLogs } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("action", "SUBMITTED")
        .order("created_at", { ascending: false });

      for (const log of (supaLogs || [])) {
        try {
          if (log.metadata) {
            const meta = typeof log.metadata === "string" ? JSON.parse(log.metadata) : log.metadata;
            if (meta.verificationToken === token) {
              matchedLog = log;
              matchedMetadata = meta;
              break;
            }
          }
        } catch (_) {}
      }
    } catch (_) {}

    // 2. Fallback to local db if not found
    if (!matchedLog) {
      const db = getDb();
      const logs = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.action, "SUBMITTED"))
        .orderBy(desc(auditLogs.createdAt));

      for (const log of logs) {
        try {
          if (log.metadata) {
            const meta = typeof log.metadata === "string" ? JSON.parse(log.metadata) : log.metadata;
            if (meta.verificationToken === token) {
              matchedLog = log;
              matchedMetadata = meta;
              break;
            }
          }
        } catch (_) {}
      }
    }

    if (!matchedLog || !matchedMetadata) {
      return NextResponse.json(
        { error: "Ce lien de validation est expiré ou n'existe pas." },
        { status: 404 }
      );
    }

    if (matchedMetadata.isRevoked) {
      return NextResponse.json(
        {
          error: "Ce lien d'activation a été révoqué suite à une nouvelle demande. Veuillez utiliser le lien présent dans le dernier e-mail reçu.",
          isRevoked: true,
        },
        { status: 410 }
      );
    }

    return NextResponse.json({
      valid: true,
      alreadyActivated: Boolean(matchedMetadata.passwordSet),
      companyName: matchedMetadata.companyName,
      companyEmail: matchedMetadata.companyEmail,
      applicantName: matchedMetadata.applicantName,
      applicantRole: matchedMetadata.applicantRole,
    });
  } catch (err: any) {
    console.error("Verify company GET error:", err);
    return NextResponse.json(
      { error: "Erreur lors de la vérification du lien." },
      { status: 500 }
    );
  }
}

/**
 * POST: Sets the company administrator password, activates both user and organization,
 * establishes session cookie, and provides full access to the company space.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, password } = body;

    if (!token) {
      return NextResponse.json(
        { error: "Jeton d'activation manquant." },
        { status: 400 }
      );
    }

    const { validateStrongPassword } = await import("@/lib/validation/password");
    const val = validateStrongPassword(password || "");
    if (!val.isValid) {
      return NextResponse.json(
        { error: `Mot de passe invalide : ${val.errors.join(", ")}` },
        { status: 400 }
      );
    }

    let matchedLog: any = null;
    let matchedMetadata: any = null;
    let sourceIsSupabase = false;

    // 1. Try Supabase first
    try {
      const supabase = (await import("@/lib/supabase/server")).getSupabaseAdminClient();
      const { data: supaLogs } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("action", "SUBMITTED")
        .order("created_at", { ascending: false });

      for (const log of (supaLogs || [])) {
        try {
          if (log.metadata) {
            const meta = typeof log.metadata === "string" ? JSON.parse(log.metadata) : log.metadata;
            if (meta.verificationToken === token) {
              matchedLog = log;
              matchedMetadata = meta;
              sourceIsSupabase = true;
              break;
            }
          }
        } catch (_) {}
      }
    } catch (_) {}

    // 2. Fallback to local db if not found
    if (!matchedLog) {
      const db = getDb();
      const logs = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.action, "SUBMITTED"))
        .orderBy(desc(auditLogs.createdAt));

      for (const log of logs) {
        try {
          if (log.metadata) {
            const meta = typeof log.metadata === "string" ? JSON.parse(log.metadata) : log.metadata;
            if (meta.verificationToken === token) {
              matchedLog = log;
              matchedMetadata = meta;
              break;
            }
          }
        } catch (_) {}
      }
    }

    if (!matchedLog || !matchedMetadata) {
      return NextResponse.json(
        { error: "Lien d'activation introuvable ou expiré." },
        { status: 404 }
      );
    }

    if (matchedMetadata.isRevoked) {
      return NextResponse.json(
        { error: "Ce lien d'activation a été révoqué suite à une nouvelle demande. Veuillez utiliser le dernier lien reçu par e-mail." },
        { status: 410 }
      );
    }

    if (matchedMetadata.passwordSet) {
      return NextResponse.json(
        { error: "Ce compte a déjà été activé. Vous pouvez vous connecter directement sur la page de connexion." },
        { status: 400 }
      );
    }

    const orgId = matchedLog.organization_id || matchedLog.organizationId;
    if (!orgId) {
      return NextResponse.json(
        { error: "Organisation introuvable pour ce lien d'activation." },
        { status: 404 }
      );
    }

    const now = Date.now();
    const passwordHash = await hashPassword(password);

    let trialMonths = 1;
    try {
      const subSettings = await getPlatformSubscriptionSettings();
      trialMonths = Math.max(1, subSettings.trialMonths || 1);
    } catch (_) {}
    const initialExpiresAt = addCalendarMonths(now, trialMonths);

    let activatedUser: any = null;
    let activatedOrg: any = null;

    if (sourceIsSupabase) {
      const supabase = (await import("@/lib/supabase/server")).getSupabaseAdminClient();

      // 0. Load existing org & admin user first so we know exact IDs and can roll back cleanly on failure
      const { data: existingOrg, error: existingOrgErr } = await supabase
        .from("organizations")
        .select("id, name, slug, status, activated_at, subscription_expires_at, service_stopped, service_stopped_at")
        .eq("id", orgId)
        .maybeSingle();

      if (existingOrgErr || !existingOrg) {
        console.error("Failed to load organization before activation:", existingOrgErr);
        return NextResponse.json(
          { error: "Impossible de retrouver l'entreprise à activer dans la base de données." },
          { status: 500 }
        );
      }

      const { data: adminCandidates, error: adminFetchErr } = await supabase
        .from("users")
        .select("*")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: true });

      if (adminFetchErr) {
        console.error("Failed to load organization admin before activation:", adminFetchErr);
        return NextResponse.json(
          { error: "Impossible de charger le compte administrateur à activer." },
          { status: 500 }
        );
      }

      const targetAdmin =
        (adminCandidates || []).find((u: any) => u.role === "ORGANIZATION_ADMIN") ||
        (matchedMetadata.companyEmail
          ? (adminCandidates || []).find(
              (u: any) =>
                typeof u.email === "string" &&
                u.email.toLowerCase() === String(matchedMetadata.companyEmail).toLowerCase()
            )
          : null) ||
        (adminCandidates || [])[0] ||
        null;

      if (!targetAdmin) {
        return NextResponse.json(
          { error: "Compte administrateur introuvable pour cette entreprise." },
          { status: 404 }
        );
      }

      // 1. Activate organization & start 1st free month from exact activation timestamp
      const { data: orgData, error: orgUpdateErr } = await supabase
        .from("organizations")
        .update({
          status: "ACTIVE",
          activated_at: now,
          subscription_expires_at: initialExpiresAt,
          service_stopped: false,
          service_stopped_at: null,
          updated_at: now,
        })
        .eq("id", orgId)
        .select()
        .maybeSingle();

      if (orgUpdateErr || !orgData) {
        console.error("Supabase organizations update error during activation:", orgUpdateErr);
        return NextResponse.json(
          { error: "Échec de l'activation de l'entreprise en base de données. Veuillez réessayer." },
          { status: 500 }
        );
      }

      activatedOrg = orgData;

      // 2. Activate target admin user & persist hashed password
      const { data: userData, error: userUpdateErr } = await supabase
        .from("users")
        .update({
          password_hash: passwordHash,
          status: "ACTIVE",
          role: "ORGANIZATION_ADMIN",
          updated_at: now,
        })
        .eq("id", targetAdmin.id)
        .select()
        .maybeSingle();

      if (userUpdateErr || !userData) {
        console.error("Supabase users update error during activation:", userUpdateErr);
        await supabase
          .from("organizations")
          .update({
            status: existingOrg.status,
            activated_at: existingOrg.activated_at,
            subscription_expires_at: existingOrg.subscription_expires_at,
            service_stopped: existingOrg.service_stopped,
            service_stopped_at: existingOrg.service_stopped_at,
            updated_at: now,
          })
          .eq("id", orgId);

        return NextResponse.json(
          { error: "Échec de l'enregistrement du mot de passe. Aucune session n'a été créée, veuillez réessayer." },
          { status: 500 }
        );
      }

      activatedUser = userData;

      // 3. Update audit log metadata
      const nextMetadata = {
        ...matchedMetadata,
        emailVerified: true,
        passwordSet: true,
        activatedAt: now,
      };

      const { error: auditUpdateErr } = await supabase
        .from("audit_logs")
        .update({
          metadata: JSON.stringify(nextMetadata),
          new_status: "ACTIVE",
        })
        .eq("id", matchedLog.id);

      if (auditUpdateErr) {
        console.error("Supabase audit_logs update error during activation:", auditUpdateErr);
        await supabase
          .from("users")
          .update({
            password_hash: targetAdmin.password_hash,
            status: targetAdmin.status,
            role: targetAdmin.role,
            updated_at: now,
          })
          .eq("id", targetAdmin.id);
        await supabase
          .from("organizations")
          .update({
            status: existingOrg.status,
            activated_at: existingOrg.activated_at,
            subscription_expires_at: existingOrg.subscription_expires_at,
            service_stopped: existingOrg.service_stopped,
            service_stopped_at: existingOrg.service_stopped_at,
            updated_at: now,
          })
          .eq("id", orgId);

        return NextResponse.json(
          { error: "Échec de finalisation du journal d'activation. Veuillez réessayer." },
          { status: 500 }
        );
      }

      matchedMetadata = nextMetadata;

      // 4. Insert activation audit trail (best effort after core state is saved)
      const { error: auditInsertErr } = await supabase.from("audit_logs").insert({
        id: `audit-act-${now}`,
        organization_id: orgId,
        user_id: userData.id,
        action: "ACTIVATED_BY_OWNER",
        old_status: "DISABLED",
        new_status: "ACTIVE",
        metadata: JSON.stringify({ activatedAt: now }),
        created_at: now,
      });
      if (auditInsertErr) {
        console.warn("Activation log insert warning:", auditInsertErr);
      }

      // Mirror to local SQLite if available (non-blocking)
      try {
        const db = getDb();
        await db
          .update(organizations)
          .set({
            status: "ACTIVE",
            activatedAt: now,
            subscriptionExpiresAt: initialExpiresAt,
            serviceStopped: false,
            serviceStoppedAt: null,
            updatedAt: now,
          })
          .where(eq(organizations.id, orgId));

        await db
          .update(users)
          .set({
            passwordHash,
            status: "ACTIVE",
            role: "ORGANIZATION_ADMIN",
            updatedAt: now,
          })
          .where(eq(users.id, userData.id));

        await db
          .update(auditLogs)
          .set({
            metadata: JSON.stringify(matchedMetadata),
            newStatus: "ACTIVE",
          })
          .where(eq(auditLogs.id, matchedLog.id));
      } catch (_) {}
    } else {
      // Local SQLite / standalone mode: MUST persist org & user synchronously before issuing cookie
      const db = getDb();
      const [localOrg] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);

      if (!localOrg) {
        return NextResponse.json(
          { error: "Entreprise introuvable dans la base locale." },
          { status: 404 }
        );
      }

      const localUsers = await db
        .select()
        .from(users)
        .where(eq(users.organizationId, orgId));
      const targetLocalUser =
        localUsers.find((u) => u.role === "ORGANIZATION_ADMIN") || localUsers[0];

      if (!targetLocalUser) {
        return NextResponse.json(
          { error: "Administrateur introuvable pour cette entreprise." },
          { status: 404 }
        );
      }

      await db
        .update(organizations)
        .set({
          status: "ACTIVE",
          activatedAt: now,
          subscriptionExpiresAt: initialExpiresAt,
          serviceStopped: false,
          serviceStoppedAt: null,
          updatedAt: now,
        })
        .where(eq(organizations.id, orgId));

      await db
        .update(users)
        .set({
          passwordHash,
          status: "ACTIVE",
          role: "ORGANIZATION_ADMIN",
          updatedAt: now,
        })
        .where(eq(users.id, targetLocalUser.id));

      matchedMetadata = {
        ...matchedMetadata,
        emailVerified: true,
        passwordSet: true,
        activatedAt: now,
      };

      await db
        .update(auditLogs)
        .set({
          metadata: JSON.stringify(matchedMetadata),
          newStatus: "ACTIVE",
        })
        .where(eq(auditLogs.id, matchedLog.id));

      const [updatedLocalOrg] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);
      const [updatedLocalUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, targetLocalUser.id))
        .limit(1);

      if (!updatedLocalOrg || updatedLocalOrg.status !== "ACTIVE" || !updatedLocalUser || updatedLocalUser.status !== "ACTIVE") {
        return NextResponse.json(
          { error: "Impossible de finaliser l'activation en base locale." },
          { status: 500 }
        );
      }

      activatedOrg = updatedLocalOrg;
      activatedUser = updatedLocalUser;
    }

    const orgName = activatedOrg.name || matchedMetadata.companyName;
    const orgSlug = activatedOrg.slug || matchedMetadata.companyName.toLowerCase().replace(/[^a-z0-9]/g, "-");
    const userName = activatedUser.name || matchedMetadata.applicantName;
    const userEmail = activatedUser.email || matchedMetadata.companyEmail;
    const userId = activatedUser.id;

    // Automatically establish session cookie ONLY after database activation succeeded
    await recordUserLoginActivity({
      userId,
      organizationId: orgId,
      role: "ORGANIZATION_ADMIN",
      email: userEmail,
      nowMs: now,
      source: "ACTIVATION",
      ...(sourceIsSupabase ? {} : { dbInstance: getDb() }),
    });

    try {
      await clearStoppedNoticeCookie();
      await setSessionCookie({
        id: userId,
        name: userName,
        email: userEmail,
        role: "ORGANIZATION_ADMIN",
        organizationId: orgId,
        organizationName: orgName,
        organizationSlug: orgSlug,
      });
    } catch (sessionErr) {
      console.error("Failed to set session cookie on activation:", sessionErr);
    }

    // Send subscription welcome email detailing the 1st free month + plans + payment accounts
    const origin = resolveAppOrigin(req.headers);
    if (userEmail) {
      await sendSubscriptionActivationWelcomeEmail({
        organizationId: orgId,
        recipientEmail: userEmail,
        recipientName: userName,
        companyName: orgName,
        expiresAt: initialExpiresAt,
        origin,
      });
    }

    return NextResponse.json({
      success: true,
      message: "Votre compte a été activé avec succès !",
      redirectUrl: "/admin/dashboard",
      companyName: orgName,
      userEmail,
    });
  } catch (err: any) {
    console.error("Verify company POST error:", err);
    return NextResponse.json(
      { error: `Erreur lors de la configuration du mot de passe: ${err?.message || "Veuillez réessayer"}` },
      { status: 500 }
    );
  }
}

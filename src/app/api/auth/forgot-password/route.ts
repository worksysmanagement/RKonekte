import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import {
  sendEmail,
  resolveAppOrigin,
  generatePasswordResetEmail,
} from "@/lib/notifications/email";
import { getDb } from "@/lib/db/client";
import { users, organizations, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { checkRateLimit } from "@/lib/security/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
    const rateLimit = checkRateLimit(`forgot_pw:${ip}`, 5, 300);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Trop de demandes de réinitialisation. Veuillez patienter 5 minutes." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const email = (body.email || "").toString().trim().toLowerCase();

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "Veuillez fournir une adresse e-mail valide." },
        { status: 400 }
      );
    }

    const origin = resolveAppOrigin(req.headers);
    const now = Date.now();

    let matchedUser: any = null;
    let matchedOrg: any = null;
    let isSupabase = false;

    // 1. Search in Supabase
    try {
      const supabase = getSupabaseAdminClient();
      const { data: supaUser } = await supabase
        .from("users")
        .select("*")
        .ilike("email", email)
        .maybeSingle();

      if (supaUser) {
        matchedUser = supaUser;
        isSupabase = true;

        if (supaUser.organization_id) {
          const { data: supaOrg } = await supabase
            .from("organizations")
            .select("*")
            .eq("id", supaUser.organization_id)
            .maybeSingle();
          matchedOrg = supaOrg;
        }
      }
    } catch (e) {
      console.warn("Supabase lookup in forgot-password failed, trying SQLite fallback:", e);
    }

    // 2. Fallback to local SQLite if not found
    if (!matchedUser) {
      try {
        const db = getDb();
        const [localUser] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (localUser) {
          matchedUser = {
            id: localUser.id,
            email: localUser.email,
            name: localUser.name,
            role: localUser.role,
            status: localUser.status,
            organization_id: localUser.organizationId,
            password_hash: localUser.passwordHash,
          };

          if (localUser.organizationId) {
            const [localOrg] = await db
              .select()
              .from(organizations)
              .where(eq(organizations.id, localUser.organizationId))
              .limit(1);
            matchedOrg = localOrg;
          }
        }
      } catch (_) {}
    }

    // Security practice: always return a friendly success message even if email not found
    if (!matchedUser) {
      return NextResponse.json({
        success: true,
        message:
          "Si cette adresse e-mail correspond à un compte inscrit, vous recevrez un lien de réinitialisation sous peu.",
      });
    }

    // Case A: The user was created during registration but has never set a password yet
    if (matchedUser.password_hash === "NO_PASSWORD_SET") {
      const newToken = crypto.randomUUID();
      const orgId = matchedUser.organization_id || "org-unknown";

      // Save/update audit token
      try {
        if (isSupabase) {
          const supabase = getSupabaseAdminClient();
          await supabase.from("audit_logs").insert({
            id: `audit-setpass-${now}`,
            organization_id: orgId,
            user_id: matchedUser.id,
            action: "SUBMITTED",
            old_status: "DISABLED",
            new_status: "DISABLED",
            metadata: JSON.stringify({
              verificationToken: newToken,
              tokenCreatedAt: now,
              isRevoked: false,
              passwordSet: false,
              companyName: matchedOrg?.name || "Votre entreprise",
              companyEmail: matchedUser.email,
              applicantName: matchedUser.name,
              reason: "forgot_password_redirect_to_activation",
            }),
            created_at: now,
          });
        }
      } catch (err) {
        console.error("Failed to store activation token:", err);
      }

      const activationLink = `${origin}/verify-company?token=${newToken}`;
      const {
        subject: emailSubject,
        html: emailHtml,
        text: emailPlainText,
      } = generatePasswordResetEmail({
        recipientName: matchedUser.name,
        email: matchedUser.email,
        companyName: matchedOrg?.name,
        actionUrl: activationLink,
        isInitialSetup: true,
      });

      await sendEmail({
        to: matchedUser.email,
        subject: emailSubject,
        html: emailHtml,
        text: emailPlainText,
      });

      return NextResponse.json({
        success: true,
        message:
          "Un lien pour configurer votre mot de passe a été envoyé à votre adresse e-mail.",
      });
    }

    // Case B: The user has an existing password -> Standard password reset
    const resetToken = crypto.randomUUID();
    const expiresAt = now + 60 * 60 * 1000; // 1 hour validity
    const orgId = matchedUser.organization_id || "org-unknown";

    try {
      if (isSupabase) {
        const supabase = getSupabaseAdminClient();
        await supabase.from("audit_logs").insert({
          id: `audit-reset-${now}`,
          organization_id: orgId,
          user_id: matchedUser.id,
          action: "PASSWORD_RESET_REQUESTED",
          old_status: matchedUser.status || "ACTIVE",
          new_status: matchedUser.status || "ACTIVE",
          metadata: JSON.stringify({
            resetToken,
            userId: matchedUser.id,
            email: matchedUser.email,
            userName: matchedUser.name,
            expiresAt,
            isUsed: false,
            isRevoked: false,
            createdAt: now,
          }),
          created_at: now,
        });
      }
    } catch (auditErr) {
      console.error("Failed to store reset audit log in Supabase:", auditErr);
    }

    // Mirror to local SQLite if available
    try {
      const db = getDb();
      await db.insert(auditLogs).values({
        id: `audit-reset-${now}`,
        organizationId: orgId,
        userId: matchedUser.id,
        action: "PASSWORD_RESET_REQUESTED" as any,
        oldStatus: matchedUser.status || "ACTIVE",
        newStatus: matchedUser.status || "ACTIVE",
        metadata: JSON.stringify({
          resetToken,
          userId: matchedUser.id,
          email: matchedUser.email,
          userName: matchedUser.name,
          expiresAt,
          isUsed: false,
          isRevoked: false,
          createdAt: now,
        }),
        createdAt: now,
      });
    } catch (_) {}

    const resetLink = `${origin}/reset-password?token=${resetToken}`;
    const {
      subject: emailSubject,
      html: emailHtml,
      text: emailPlainText,
    } = generatePasswordResetEmail({
      recipientName: matchedUser.name,
      email: matchedUser.email,
      companyName: matchedOrg?.name,
      actionUrl: resetLink,
      isInitialSetup: false,
      expiresInLabel: "1 heure",
    });

    await sendEmail({
      to: matchedUser.email,
      subject: emailSubject,
      html: emailHtml,
      text: emailPlainText,
    });

    return NextResponse.json({
      success: true,
      message:
        "Si cette adresse e-mail correspond à un compte inscrit, vous recevrez un lien de réinitialisation sous peu.",
    });
  } catch (err: any) {
    console.error("Forgot password route error:", err);
    return NextResponse.json(
      { error: "Une erreur est survenue lors de la demande. Veuillez réessayer." },
      { status: 500 }
    );
  }
}

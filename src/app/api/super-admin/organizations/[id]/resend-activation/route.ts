import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin, handleApiError } from "@/lib/auth/guard";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import {
  sendEmail,
  resolveAppOrigin,
  generateCompanyActivationEmail,
} from "@/lib/notifications/email";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin();
    const { id: orgId } = await context.params;

    const supabase = getSupabaseAdminClient();

    // 1. Fetch organization
    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", orgId)
      .maybeSingle();

    if (orgErr || !org) {
      return NextResponse.json(
        { error: "Organisation introuvable." },
        { status: 404 }
      );
    }

    // 2. Fetch admin user
    const { data: user, error: userErr } = await supabase
      .from("users")
      .select("*")
      .eq("organization_id", orgId)
      .eq("role", "ORGANIZATION_ADMIN")
      .maybeSingle();

    if (userErr || !user) {
      return NextResponse.json(
        { error: "Administrateur introuvable pour cette entreprise." },
        { status: 404 }
      );
    }

    // If already active with a real password, no need to resend initial activation
    if (org.status === "ACTIVE" && user.password_hash !== "NO_PASSWORD_SET") {
      return NextResponse.json(
        { error: "Cette entreprise est déjà active avec un mot de passe configuré." },
        { status: 400 }
      );
    }

    // 3. Find and revoke previous submission audit logs
    const { data: auditLogs } = await supabase
      .from("audit_logs")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });

    let latestMeta: any = {};
    let targetLogId: string | null = null;

    for (const log of (auditLogs || [])) {
      if (log.metadata) {
        try {
          const meta = typeof log.metadata === "string" ? JSON.parse(log.metadata) : log.metadata;
          if (meta.verificationToken) {
            targetLogId = log.id;
            latestMeta = meta;
            break;
          }
        } catch (_) {}
      }
    }

    const now = Date.now();
    const newToken = crypto.randomUUID();

    // Invalidate old token and set new token in metadata
    const updatedMeta = {
      ...latestMeta,
      previousTokensRevokedAt: now,
      oldTokenRevoked: latestMeta.verificationToken || null,
      verificationToken: newToken,
      tokenCreatedAt: now,
      isRevoked: false,
      passwordSet: false,
    };

    if (targetLogId) {
      const { error: updateAuditErr } = await supabase
        .from("audit_logs")
        .update({
          metadata: JSON.stringify(updatedMeta),
        })
        .eq("id", targetLogId);

      if (updateAuditErr) {
        return NextResponse.json(
          { error: `Impossible de mettre à jour le jeton d'activation : ${updateAuditErr.message}` },
          { status: 500 }
        );
      }
    } else {
      const { error: createAuditErr } = await supabase.from("audit_logs").insert({
        id: `audit-sub-${now}`,
        organization_id: orgId,
        user_id: user.id,
        action: "SUBMITTED",
        old_status: org.status,
        new_status: "PENDING_VERIFICATION",
        metadata: JSON.stringify({
          companyName: org.name,
          companyEmail: user.email,
          applicantName: user.name,
          ...updatedMeta,
        }),
        created_at: now,
      });

      if (createAuditErr) {
        return NextResponse.json(
          { error: `Impossible d'enregistrer le nouveau jeton d'activation : ${createAuditErr.message}` },
          { status: 500 }
        );
      }
    }

    // Insert an audit log record for the resend action
    await supabase.from("audit_logs").insert({
      id: `audit-resend-${now}`,
      organization_id: orgId,
      user_id: null,
      action: "RESEND_ACTIVATION_EMAIL",
      old_status: org.status,
      new_status: org.status,
      metadata: JSON.stringify({
        revokedOldToken: true,
        sentAt: now,
      }),
      created_at: now,
    });

    // 4. Send activation email via configured sender
    const origin = resolveAppOrigin(req.headers);
    const verificationLink = `${origin}/verify-company?token=${newToken}`;

    const {
      subject: emailSubject,
      html: emailHtml,
      text: emailPlainText,
    } = generateCompanyActivationEmail({
      recipientName: user.name,
      companyName: org.name,
      email: user.email,
      activationUrl: verificationLink,
      isResend: true,
    });

    await sendEmail({
      to: user.email,
      subject: emailSubject,
      html: emailHtml,
      text: emailPlainText,
    });

    return NextResponse.json({
      success: true,
      message: `Un nouveau lien a été envoyé à ${user.email}. L'ancien lien a été révoqué.`,
      companyName: org.name,
      email: user.email,
    });
  } catch (err: any) {
    return handleApiError(err);
  }
}

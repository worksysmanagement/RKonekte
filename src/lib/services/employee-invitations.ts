import { getSupabaseAdminClient } from "@/lib/supabase/server";
import {
  sendEmail,
  resolveAppOrigin,
  generateEmployeeInvitationEmail,
} from "@/lib/notifications/email";
import { hashToken } from "@/lib/security/tokens";

export interface SendEmployeeInvitationParams {
  organizationId: string;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    employeeNumber: string;
    branchId?: string | null;
    branch?: string;
    department?: string | null;
    position?: string | null;
    phone: string;
    email: string;
  };
  role?: string;
  origin?: string;
}

export async function sendEmployeeInvitation({
  organizationId,
  employee,
  role,
  origin,
}: SendEmployeeInvitationParams): Promise<{
  success: boolean;
  inviteLink: string;
  token: string;
  emailSent: boolean;
  error?: string;
}> {
  const supabase = getSupabaseAdminClient();
  const now = Date.now();
  const token = crypto.randomUUID();

  const baseUrl = resolveAppOrigin(undefined, origin);
  const inviteLink = `${baseUrl}/reset-password?token=${token}`;

  try {
    // 1. Fetch organization details
    const { data: org } = await supabase
      .from("organizations")
      .select("name, slug")
      .eq("id", organizationId)
      .maybeSingle();

    const companyName = org?.name || "Votre entreprise";

    // 2. Fetch branch name if branchId is present
    let branchName = employee.branch || "Siège";
    if (employee.branchId) {
      const { data: br } = await supabase
        .from("branches")
        .select("name")
        .eq("id", employee.branchId)
        .maybeSingle();
      if (br?.name) {
        branchName = br.name;
      }
    }

    const normalizedEmail = employee.email.toLowerCase().trim();

    // 3. Ensure user account exists in `users`
    let userId: string;
    const { data: existingUser } = await supabase
      .from("users")
      .select("id, password_hash")
      .ilike("email", normalizedEmail)
      .maybeSingle();

    const userRole = role || "EMPLOYEE";

    if (existingUser) {
      userId = existingUser.id;
      // If user had no organization or no branch, link them
      const updateData: Record<string, any> = {
        organization_id: organizationId,
        branch_id: employee.branchId || null,
        name: `${employee.firstName} ${employee.lastName}`.trim(),
        updated_at: now,
      };
      if (role) {
        updateData.role = role;
      }
      await supabase
        .from("users")
        .update(updateData)
        .eq("id", userId);
    } else {
      userId = `usr-${crypto.randomUUID()}`;
      await supabase.from("users").insert({
        id: userId,
        organization_id: organizationId,
        branch_id: employee.branchId || null,
        name: `${employee.firstName} ${employee.lastName}`.trim(),
        email: normalizedEmail,
        password_hash: "NO_PASSWORD_SET",
        role: userRole,
        status: "ACTIVE",
        created_at: now,
        updated_at: now,
      });
    }

    // 4. Revoke previous active invitation tokens for this email to prevent reuse
    try {
      const { data: oldLogs } = await supabase
        .from("audit_logs")
        .select("id, metadata")
        .eq("organization_id", organizationId)
        .eq("action", "PASSWORD_RESET_REQUESTED");

      for (const log of oldLogs || []) {
        if (log.metadata) {
          try {
            const meta = typeof log.metadata === "string" ? JSON.parse(log.metadata) : log.metadata;
            if (meta.email?.toLowerCase() === normalizedEmail && !meta.isUsed) {
              meta.isRevoked = true;
              await supabase
                .from("audit_logs")
                .update({ metadata: JSON.stringify(meta) })
                .eq("id", log.id);
            }
          } catch (_) {}
        }
      }
    } catch (e) {
      console.warn("Could not revoke old tokens:", e);
    }

    // 5. Store new invitation token hash in audit_logs with 7 days expiration (Never plain text!)
    const expiresAt = now + 7 * 24 * 60 * 60 * 1000; // 7 days secure expiration
    const tokenHash = await hashToken(token);
    await supabase.from("audit_logs").insert({
      id: `audit-invite-${now}-${crypto.randomUUID().slice(0, 8)}`,
      organization_id: organizationId,
      user_id: userId,
      action: "PASSWORD_RESET_REQUESTED",
      old_status: "INVITED",
      new_status: "PENDING_ACTIVATION",
      metadata: JSON.stringify({
        resetTokenHash: tokenHash,
        userId: userId,
        email: normalizedEmail,
        userName: `${employee.firstName} ${employee.lastName}`.trim(),
        employeeId: employee.id,
        employeeNumber: employee.employeeNumber,
        companyName,
        isUsed: false,
        isRevoked: false,
        tokenCreatedAt: now,
        expiresAt,
        type: "EMPLOYEE_INVITATION",
      }),
      created_at: now,
    });

    // 6. Build the transactional RKonekte invitation email (clean HTML + matching plain-text)
    const {
      subject: emailSubject,
      html: emailHtml,
      text: emailPlainText,
    } = generateEmployeeInvitationEmail({
      firstName: employee.firstName,
      lastName: employee.lastName,
      employeeNumber: employee.employeeNumber,
      companyName,
      email: normalizedEmail,
      inviteUrl: inviteLink,
    });

    // 7. Dispatch email via configured sender (Resend / SMTP without forcing hardcoded From override)
    const emailResult = await sendEmail({
      to: normalizedEmail,
      subject: emailSubject,
      html: emailHtml,
      text: emailPlainText,
    });

    return {
      success: true,
      inviteLink,
      token,
      emailSent: emailResult.success,
    };
  } catch (err: any) {
    console.error("sendEmployeeInvitation error:", err);
    return {
      success: false,
      inviteLink,
      token,
      emailSent: false,
      error: err?.message || "Erreur lors de la génération de l'invitation.",
    };
  }
}

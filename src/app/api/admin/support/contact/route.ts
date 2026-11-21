import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireTenantUser, handleApiError } from "@/lib/auth/guard";
import { sendEmail } from "@/lib/notifications/email";

function formatUserRole(role?: string): string {
  switch (role?.toUpperCase()) {
    case "SUPER_ADMIN":
      return "Super Administrateur";
    case "ORGANIZATION_ADMIN":
      return "Administrateur";
    case "EMPLOYEE":
    case "COLLABORATEUR":
    case "CASHIER":
    case "SECRETARY":
      return "Employé / Collaborateur";
    default:
      return role || "Utilisateur";
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function POST(req: NextRequest) {
  try {
    const authSession = await requireAuth();
    const session =
      authSession.role !== "SUPER_ADMIN"
        ? (await requireTenantUser()).user
        : authSession;
    const body = await req.json();
    const { category, moduleName, subject, message } = body;

    if (!subject?.trim() || !message?.trim()) {
      return NextResponse.json(
        { error: "Veuillez renseigner le sujet et le message de votre demande." },
        { status: 400 }
      );
    }

    const orgName = session.organizationName || "Entreprise sans nom";
    const senderName = session.name || "Utilisateur";
    const senderEmail = session.email || "Non renseigné";
    const userRole = session.role || "Utilisateur";
    const targetEmail = "rkonekte509@gmail.com";

    const cleanCategory = category?.trim() || "Assistance Générale";
    const cleanModule = moduleName?.trim() || "Général";
    const nowStr = new Date().toLocaleString("fr-FR", {
      dateStyle: "full",
      timeStyle: "medium",
    });

    const emailSubject = `[Support] ${subject.trim()} — ${orgName}`;

    const safeOrgName = escapeHtml(orgName);
    const safeSenderName = escapeHtml(senderName);
    const safeSenderEmail = escapeHtml(senderEmail);
    const safeRole = escapeHtml(formatUserRole(userRole));
    const safeCategory = escapeHtml(cleanCategory);
    const safeModule = escapeHtml(cleanModule);
    const safeNowStr = escapeHtml(nowStr);
    const safeSubject = escapeHtml(subject.trim());
    const safeMessage = escapeHtml(message.trim());

    const htmlContent = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #FFFFFF; color: #111827; margin: 0; padding: 24px; font-size: 14px; line-height: 1.5;">
    <div style="max-width: 600px; margin: 0 auto;">
      <h2 style="font-size: 18px; font-weight: 700; color: #111827; margin: 0 0 16px 0; padding-bottom: 8px; border-bottom: 1px solid #E5E7EB;">
        Demande de support
      </h2>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 18px; font-size: 13px;">
        <tr>
          <td style="padding: 4px 0; width: 140px; color: #6B7280; font-weight: 500;">Entreprise :</td>
          <td style="padding: 4px 0; color: #111827; font-weight: 600;">${safeOrgName}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #6B7280; font-weight: 500;">Expéditeur :</td>
          <td style="padding: 4px 0; color: #111827; font-weight: 600;">${safeSenderName} &lt;${safeSenderEmail}&gt;</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #6B7280; font-weight: 500;">Rôle :</td>
          <td style="padding: 4px 0; color: #111827; font-weight: 600;">${safeRole}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #6B7280; font-weight: 500;">Catégorie :</td>
          <td style="padding: 4px 0; color: #111827; font-weight: 600;">${safeCategory}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #6B7280; font-weight: 500;">Onglet concerné :</td>
          <td style="padding: 4px 0; color: #111827; font-weight: 600;">${safeModule}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #6B7280; font-weight: 500;">Date :</td>
          <td style="padding: 4px 0; color: #111827; font-weight: 600;">${safeNowStr}</td>
        </tr>
      </table>

      <hr style="border: 0; border-top: 1px solid #E5E7EB; margin: 18px 0;" />

      <div style="font-size: 14px; font-weight: 700; color: #111827; margin-bottom: 8px;">
        Objet : ${safeSubject}
      </div>

      <div style="font-size: 14px; line-height: 1.6; color: #111827; white-space: pre-wrap; margin-bottom: 24px;">${safeMessage}</div>

      <hr style="border: 0; border-top: 1px solid #E5E7EB; margin: 18px 0;" />

      <div style="font-size: 12px; color: #6B7280;">
        Répondre directement à cet e-mail pour contacter ${safeSenderName} (${safeSenderEmail}).
      </div>
    </div>
  </body>
</html>`;

    // Send the email to rkonekte509@gmail.com
    const result = await sendEmail({
      to: targetEmail,
      subject: emailSubject,
      html: htmlContent,
      replyTo: senderEmail && senderEmail !== "Non renseigné" ? senderEmail : undefined,
      text: `Demande de support\n\nEntreprise : ${orgName}\nExpéditeur : ${senderName} (${senderEmail})\nRôle : ${formatUserRole(userRole)}\nCatégorie : ${cleanCategory}\nOnglet : ${cleanModule}\nDate : ${nowStr}\n\nObjet : ${subject.trim()}\n\n${message.trim()}`,
    });

    if (!result.success) {
      console.error("[SUPPORT CONTACT ERROR]", result.error);
      return NextResponse.json(
        {
          error:
            "Une erreur est survenue lors de l'envoi de votre message. Veuillez réessayer ou contacter directement rkonekte509@gmail.com.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message:
        "Votre message a été transmis avec succès à l'équipe support RKonekte (rkonekte509@gmail.com).",
    });
  } catch (err) {
    return handleApiError(err);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin, handleApiError } from "@/lib/auth/guard";
import { listAllOrganizationsForSuperAdmin } from "@/lib/services/organizations";
import {
  generateSuperAdminBroadcastEmail,
  sendEmail,
} from "@/lib/notifications/email";

export async function POST(req: NextRequest) {
  try {
    await requireSuperAdmin();
    const body = await req.json();

    const target: "ALL" | "SELECTED" = body.target === "SELECTED" ? "SELECTED" : "ALL";
    const selectedOrganizationIds: string[] = Array.isArray(body.selectedOrganizationIds)
      ? body.selectedOrganizationIds
      : [];
    const recipientTarget: "ADMIN_ONLY" | "COMPANY_ONLY" | "BOTH" =
      body.recipientTarget === "ADMIN_ONLY" || body.recipientTarget === "COMPANY_ONLY"
        ? body.recipientTarget
        : "BOTH";

    const subject: string = typeof body.subject === "string" ? body.subject.trim() : "";
    const titleHeader: string = typeof body.titleHeader === "string" ? body.titleHeader.trim() : "";
    const message: string = typeof body.message === "string" ? body.message.trim() : "";
    const ctaLabel: string = typeof body.ctaLabel === "string" ? body.ctaLabel.trim() : "";
    const ctaUrl: string = typeof body.ctaUrl === "string" ? body.ctaUrl.trim() : "";

    if (!subject) {
      return NextResponse.json(
        { error: "L'objet de l'e-mail est obligatoire." },
        { status: 400 }
      );
    }

    if (!message) {
      return NextResponse.json(
        { error: "Le corps du message est obligatoire." },
        { status: 400 }
      );
    }

    if (target === "SELECTED" && selectedOrganizationIds.length === 0) {
      return NextResponse.json(
        { error: "Veuillez sélectionner au moins une entreprise destinataire." },
        { status: 400 }
      );
    }

    const allOrgs = await listAllOrganizationsForSuperAdmin();
    const targetOrgs = target === "ALL"
      ? allOrgs
      : allOrgs.filter((o) => selectedOrganizationIds.includes(o.id));

    if (targetOrgs.length === 0) {
      return NextResponse.json(
        { error: "Aucune entreprise correspondante trouvée." },
        { status: 404 }
      );
    }

    interface RecipientInfo {
      email: string;
      name: string;
      companyName: string;
      companyId: string;
      recipientType: "ADMIN" | "COMPANY";
    }

    const recipients: RecipientInfo[] = [];
    const seenPerOrg = new Set<string>();

    for (const org of targetOrgs) {
      const candidates: { email?: string | null; name: string; type: "ADMIN" | "COMPANY" }[] = [];

      if (recipientTarget === "ADMIN_ONLY" || recipientTarget === "BOTH") {
        if (org.adminEmail?.trim()) {
          candidates.push({
            email: org.adminEmail.trim().toLowerCase(),
            name: org.adminName || "Administrateur",
            type: "ADMIN",
          });
        }
      }

      if (recipientTarget === "COMPANY_ONLY" || recipientTarget === "BOTH") {
        if (org.email?.trim()) {
          candidates.push({
            email: org.email.trim().toLowerCase(),
            name: org.name || "Responsable",
            type: "COMPANY",
          });
        }
      }

      for (const cand of candidates) {
        if (!cand.email) continue;
        const dedupKey = `${org.id}:${cand.email}`;
        if (!seenPerOrg.has(dedupKey)) {
          seenPerOrg.add(dedupKey);
          recipients.push({
            email: cand.email,
            name: cand.name,
            companyName: org.name,
            companyId: org.id,
            recipientType: cand.type,
          });
        }
      }
    }

    if (recipients.length === 0) {
      return NextResponse.json(
        { error: "Aucune adresse e-mail valide trouvée pour les entreprises ciblées." },
        { status: 400 }
      );
    }

    const results: {
      email: string;
      companyName: string;
      recipientType: string;
      success: boolean;
      error?: string;
    }[] = [];

    for (const r of recipients) {
      const emailContent = generateSuperAdminBroadcastEmail({
        recipientName: r.name,
        companyName: r.companyName,
        subject,
        titleHeader: titleHeader || undefined,
        message,
        ctaLabel: ctaLabel || undefined,
        ctaUrl: ctaUrl || undefined,
      });

      const res = await sendEmail({
        to: r.email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      });

      results.push({
        email: r.email,
        companyName: r.companyName,
        recipientType: r.recipientType,
        success: res.success,
        error: res.error,
      });
    }

    const totalSent = results.filter((r) => r.success).length;
    const totalFailed = results.filter((r) => !r.success).length;

    return NextResponse.json({
      success: true,
      totalOrganizations: targetOrgs.length,
      totalRecipients: recipients.length,
      totalSent,
      totalFailed,
      results,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { handleApiError, requireSuperAdmin } from "@/lib/auth/guard";
import { resolveAppOrigin } from "@/lib/notifications/email";
import {
  approveSubscriptionRenewal,
  getOrganizationSubscriptionOverview,
  rejectSubscriptionRenewal,
  resumeOrganizationService,
  stopOrganizationService,
} from "@/lib/services/subscriptions";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin();
    const { id } = await params;
    const overview = await getOrganizationSubscriptionOverview(id);
    return NextResponse.json(overview);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireSuperAdmin();
    const { id } = await params;
    const body = await req.json();
    const origin = resolveAppOrigin(req.headers);
    const action = String(body.action || "");

    if (action === "APPROVE_RENEWAL") {
      const result = await approveSubscriptionRenewal({
        organizationId: id,
        renewalId: body.renewalId || null,
        durationMonths: Number(body.durationMonths || 1),
        paymentMethod: body.paymentMethod ? String(body.paymentMethod) : undefined,
        paymentReference:
          body.paymentReference !== undefined ? String(body.paymentReference || "") : undefined,
        customExpiresAt: body.customExpiresAt ? Number(body.customExpiresAt) : null,
        reviewerId: admin.id,
        reviewerName: admin.name,
        origin,
      });
      const overview = await getOrganizationSubscriptionOverview(id);
      return NextResponse.json({
        success: true,
        message: "Renouvellement validé avec succès.",
        result,
        overview,
      });
    }

    if (action === "REJECT_RENEWAL") {
      if (!body.renewalId) {
        return NextResponse.json(
          { error: "Identifiant de la soumission manquant." },
          { status: 400 }
        );
      }
      const rejected = await rejectSubscriptionRenewal({
        organizationId: id,
        renewalId: String(body.renewalId),
        rejectionReason: String(body.rejectionReason || ""),
        reviewerId: admin.id,
        reviewerName: admin.name,
        origin,
      });
      const overview = await getOrganizationSubscriptionOverview(id);
      return NextResponse.json({
        success: true,
        message: "Référence refusée.",
        rejected,
        overview,
      });
    }

    if (action === "STOP_SERVICE") {
      await stopOrganizationService(id);
      const overview = await getOrganizationSubscriptionOverview(id);
      return NextResponse.json({
        success: true,
        message: "Service arrêté pour cette entreprise. Ses utilisateurs vont être déconnectés.",
        overview,
      });
    }

    if (action === "RESUME_SERVICE") {
      await resumeOrganizationService(id);
      const overview = await getOrganizationSubscriptionOverview(id);
      return NextResponse.json({
        success: true,
        message: "Service réactivé pour cette entreprise.",
        overview,
      });
    }

    return NextResponse.json({ error: "Action non reconnue." }, { status: 400 });
  } catch (err: any) {
    if (err?.name === "AuthError") {
      return handleApiError(err);
    }
    return NextResponse.json(
      { error: err?.message || "Erreur lors du traitement de l'abonnement." },
      { status: 400 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import {
  handleApiError,
  requireOrgAdmin,
  requireTenantUser,
} from "@/lib/auth/guard";
import { resolveAppOrigin } from "@/lib/notifications/email";
import {
  cancelPendingSubscriptionReference,
  getOrganizationSubscriptionOverview,
  maybeSendSubscriptionReminders,
  submitSubscriptionPaymentReference,
} from "@/lib/services/subscriptions";

export async function GET(req: NextRequest) {
  try {
    const { user, organizationId } = await requireTenantUser();
    if (user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        {
          canManageSubscription: false,
          error: "Gestion des abonnements réservée à l'interface Super-Administration.",
          message: "Gestion des abonnements réservée à l'interface Super-Administration.",
        },
        { status: 403 }
      );
    }

    const overview = await getOrganizationSubscriptionOverview(organizationId);
    const origin = resolveAppOrigin(req.headers);
    maybeSendSubscriptionReminders(organizationId, origin).catch(() => {});

    return NextResponse.json({
      canManageSubscription: true,
      ...overview,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, organizationId } = await requireOrgAdmin();
    if (user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Gestion des abonnements réservée à l'interface Super-Administration." },
        { status: 403 }
      );
    }
    const body = await req.json();
    const origin = resolveAppOrigin(req.headers);

    const renewal = await submitSubscriptionPaymentReference({
      organizationId,
      durationMonths: Number(body.durationMonths || 1),
      paymentMethod: String(body.paymentMethod || ""),
      paymentReference: body.paymentReference ? String(body.paymentReference) : null,
      payerCompanyName: body.payerCompanyName ? String(body.payerCompanyName) : null,
      payerNote: body.payerNote ? String(body.payerNote) : null,
      proofDataUrl: body.proofDataUrl ? String(body.proofDataUrl) : null,
      proofFileName: body.proofFileName ? String(body.proofFileName) : null,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      replacePending: Boolean(body.replacePending),
      origin,
    });

    const overview = await getOrganizationSubscriptionOverview(organizationId);
    return NextResponse.json({
      success: true,
      message: "Votre preuve de paiement a été transmise pour vérification.",
      renewal,
      overview,
    });
  } catch (err: any) {
    if (err?.name === "AuthError") {
      return handleApiError(err);
    }
    return NextResponse.json(
      { error: err?.message || "Impossible d'envoyer la référence." },
      { status: 400 }
    );
  }
}

export async function DELETE() {
  try {
    const { user, organizationId } = await requireOrgAdmin();
    if (user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Gestion des abonnements réservée à l'interface Super-Administration." },
        { status: 403 }
      );
    }
    await cancelPendingSubscriptionReference(organizationId);
    const overview = await getOrganizationSubscriptionOverview(organizationId);
    return NextResponse.json({
      success: true,
      message: "La soumission en attente a été annulée.",
      overview,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

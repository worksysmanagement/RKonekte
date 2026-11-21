import { NextRequest, NextResponse } from "next/server";
import { requireTenantUser, handleApiError, AuthError } from "@/lib/auth/guard";
import {
  resendRecipientNotification,
  isUserAdminRole,
} from "@/lib/services/administrative-exchanges";
import { resolveAppOrigin } from "@/lib/notifications/email";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, organizationId } = await requireTenantUser();

    if (!isUserAdminRole(user.role)) {
      return NextResponse.json(
        { error: "Ce module est exclusivement réservé aux administrateurs de l'entreprise." },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const recipientId = body.recipientId;

    if (!recipientId) {
      return NextResponse.json(
        { error: "L'identifiant du destinataire est obligatoire." },
        { status: 400 }
      );
    }

    const appOrigin = resolveAppOrigin(req.headers);
    const result = await resendRecipientNotification({
      documentId: id,
      recipientId,
      senderUserId: user.id,
      organizationId,
      companyName: user.name || "RKonekte",
      appOrigin,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Impossible de renvoyer la notification e-mail." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Notification par e-mail renvoyée avec succès.",
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return handleApiError(error);
    }
    return NextResponse.json(
      { error: error?.message || "Erreur lors du renvoi de la notification." },
      { status: 400 }
    );
  }
}

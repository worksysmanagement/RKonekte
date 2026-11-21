import { NextResponse } from "next/server";
import { requireTenantUser, handleApiError, AuthError } from "@/lib/auth/guard";
import { listEligibleAdminRecipients, isUserAdminRole } from "@/lib/services/administrative-exchanges";

export async function GET() {
  try {
    const { user, organizationId } = await requireTenantUser();

    if (!isUserAdminRole(user.role)) {
      return NextResponse.json(
        { error: "Ce module est exclusivement réservé aux administrateurs de l'entreprise." },
        { status: 403 }
      );
    }

    const admins = await listEligibleAdminRecipients(organizationId, user.id);
    return NextResponse.json({ admins });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return handleApiError(error);
    }
    return NextResponse.json(
      { error: error?.message || "Erreur lors de la récupération des administrateurs éligibles." },
      { status: 400 }
    );
  }
}

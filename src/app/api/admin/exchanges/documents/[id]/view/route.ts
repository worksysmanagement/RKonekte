import { NextRequest, NextResponse } from "next/server";
import { requireTenantUser, handleApiError, AuthError } from "@/lib/auth/guard";
import {
  markDocumentAsViewed,
  isUserAdminRole,
} from "@/lib/services/administrative-exchanges";

export async function POST(
  _req: NextRequest,
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
    const result = await markDocumentAsViewed(id, user.id, organizationId);

    return NextResponse.json(result);
  } catch (error: any) {
    if (error instanceof AuthError) {
      return handleApiError(error);
    }
    return NextResponse.json(
      { error: error?.message || "Erreur lors de la mise à jour du statut." },
      { status: 400 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireTenantUser, handleApiError, AuthError } from "@/lib/auth/guard";
import {
  listSentDocuments,
  isUserAdminRole,
} from "@/lib/services/administrative-exchanges";

export async function GET(req: NextRequest) {
  try {
    const { user, organizationId } = await requireTenantUser();

    if (!isUserAdminRole(user.role)) {
      return NextResponse.json(
        { error: "Ce module est exclusivement réservé aux administrateurs de l'entreprise." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || undefined;

    const documents = await listSentDocuments(organizationId, user.id, {
      search,
    });

    return NextResponse.json({ documents });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return handleApiError(error);
    }
    return NextResponse.json(
      { error: error?.message || "Erreur lors de la récupération des documents transmis." },
      { status: 400 }
    );
  }
}

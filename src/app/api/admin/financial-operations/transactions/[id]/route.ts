import { NextRequest, NextResponse } from "next/server";
import { requireTenantUser, handleApiError } from "@/lib/auth/guard";
import { deleteBankTransaction } from "@/lib/services/bank-operations";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { organizationId, user } = await requireTenantUser();
    const { id } = await params;

    const isRestricted =
      user.role === "EMPLOYEE" ||
      user.role === "COLLABORATEUR" ||
      user.role === "CASHIER" ||
      user.role === "CAISSIER";

    if (isRestricted) {
      return NextResponse.json({ error: "Action non autorisée. Module réservé à l'administration." }, { status: 403 });
    }

    const success = await deleteBankTransaction(organizationId, id);
    if (!success) {
      return NextResponse.json({ error: "Transaction introuvable." }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: "Transaction supprimée avec succès et solde du compte rétabli.",
    });
  } catch (err) {
    return handleApiError(err);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireTenantUser, handleApiError } from "@/lib/auth/guard";
import { deleteSalaryAdjustment } from "@/lib/services/salary-adjustments";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { organizationId, user } = await requireTenantUser();
    const { id } = await params;

    const isEmployee =
      user.role === "EMPLOYEE" ||
      user.role === "COLLABORATEUR" ||
      user.role === "CASHIER" ||
      user.role === "CAISSIER";

    if (isEmployee) {
      return NextResponse.json(
        { error: "Action interdite : les employés ne peuvent pas supprimer une révision salariale." },
        { status: 403 }
      );
    }

    const cleanId = decodeURIComponent(id).trim();
    const success = await deleteSalaryAdjustment(organizationId, cleanId);
    if (!success) {
      return NextResponse.json(
        { error: `Révision salariale ${cleanId} introuvable.` },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, message: `Révision ${cleanId} supprimée.` },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (err) {
    return handleApiError(err);
  }
}

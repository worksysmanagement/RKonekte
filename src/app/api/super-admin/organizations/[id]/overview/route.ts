import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin, handleApiError } from "@/lib/auth/guard";
import { getSuperAdminOrganizationDetails } from "@/lib/services/super-admin-overview";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin();
    const { id } = await context.params;
    const details = await getSuperAdminOrganizationDetails(id);
    if (!details) {
      return NextResponse.json(
        { error: "Entreprise introuvable." },
        { status: 404 }
      );
    }
    return NextResponse.json(details);
  } catch (err) {
    return handleApiError(err);
  }
}

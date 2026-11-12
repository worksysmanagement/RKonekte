import { NextRequest, NextResponse } from "next/server";
import { requireTenantUser, handleApiError } from "@/lib/auth/guard";
import { getBankSummaryStats } from "@/lib/services/bank-operations";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const { organizationId, user } = await requireTenantUser();

    const isRestricted =
      user.role === "EMPLOYEE" ||
      user.role === "COLLABORATEUR" ||
      user.role === "CASHIER" ||
      user.role === "CAISSIER";

    if (isRestricted) {
      return NextResponse.json(
        { error: "Accès non autorisé. Module réservé à l'administration." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const branchId = searchParams.get("branchId") || undefined;

    const stats = await getBankSummaryStats(organizationId, branchId);
    return NextResponse.json(
      { success: true, stats },
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

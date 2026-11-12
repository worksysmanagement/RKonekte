import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin, handleApiError } from "@/lib/auth/guard";
import { getSuperAdminOverview } from "@/lib/services/super-admin-overview";

export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin();
    const { searchParams } = new URL(req.url);
    const stats = await getSuperAdminOverview({
      period: searchParams.get("period"),
      date: searchParams.get("date"),
      month: searchParams.get("month"),
      year: searchParams.get("year"),
    });
    return NextResponse.json({ stats });
  } catch (err) {
    return handleApiError(err);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/auth/guard";
import { requireCustomerSpacePermission } from "@/lib/services/customer-feedback-auth";
import { listCustomerFeedback } from "@/lib/services/customer-feedback";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { organizationId, permission } = await requireCustomerSpacePermission("view");

    const url = new URL(req.url);
    const yearParam = url.searchParams.get("year");
    const monthParam = url.searchParams.get("month");
    const branchIdParam = url.searchParams.get("branchId");
    const favoritesParam = url.searchParams.get("favoritesOnly");
    const searchParam = url.searchParams.get("search");

    const parsedYear = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : null;
    const parsedMonth =
      monthParam && /^(1[0-2]|[1-9])$/.test(monthParam) ? Number(monthParam) : null;

    const result = await listCustomerFeedback(organizationId, {
      year: parsedYear,
      month: parsedMonth,
      branchId: branchIdParam && branchIdParam !== "ALL" ? branchIdParam : null,
      favoritesOnly: favoritesParam === "true" || favoritesParam === "1",
      search: searchParam || null,
    });

    return NextResponse.json({
      ...result,
      permission,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

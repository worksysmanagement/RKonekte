import { NextRequest, NextResponse } from "next/server";
import { requireTenantUser, requireAuth, handleApiError } from "@/lib/auth/guard";
import { listLeaveRequests, createLeaveRequest } from "@/lib/services/leave-requests";
import { getTenantDashboardMetrics } from "@/lib/services/audit";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    let organizationId: string;
    let user: any;
    try {
      const tenant = await requireTenantUser();
      organizationId = tenant.organizationId;
      user = tenant.user;
    } catch (authErr) {
      const session = await requireAuth();
      if (session.role === "SUPER_ADMIN") {
        user = session;
        const orgIdParam = req.nextUrl.searchParams.get("organizationId");
        if (orgIdParam) {
          organizationId = orgIdParam;
        } else {
          const supabase = getSupabaseAdminClient();
          const { data: orgData } = await supabase
            .from("organizations")
            .select("id")
            .eq("status", "ACTIVE")
            .limit(1)
            .maybeSingle();
          organizationId = orgData?.id || session.organizationId || "";
        }
      } else {
        throw authErr;
      }
    }

    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("mode");

    // Quick metrics endpoint for dashboard
    if (mode === "metrics") {
      const metrics = await getTenantDashboardMetrics(organizationId);
      return NextResponse.json({ metrics });
    }

    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const status = (searchParams.get("status") as any) || "ALL";
    const search = searchParams.get("search") || undefined;
    const requestedEmpNum = searchParams.get("employeeNumber") || undefined;
    const requestedEmail = searchParams.get("contactEmail") || undefined;

    const isEmployee =
      user.role === "EMPLOYEE" ||
      user.role === "COLLABORATEUR" ||
      user.role === "CASHIER" ||
      user.role === "CAISSIER" ||
      user.role?.toLowerCase().includes("employ") ||
      user.role?.toLowerCase().includes("collab") ||
      user.role?.toLowerCase().includes("caissier") ||
      user.role?.toLowerCase().includes("cashier");

    const isMine = status === "MY_REQUESTS" || searchParams.get("mine") === "true";
    const effectiveStatus = status === "MY_REQUESTS" ? "ALL" : status;
    const effectiveEmail = isMine
      ? (requestedEmail || user.email)
      : isEmployee
      ? (user.email || requestedEmail)
      : requestedEmail;

    const result = await listLeaveRequests(organizationId, {
      page,
      limit,
      status: effectiveStatus,
      search,
      employeeNumber: isEmployee ? (requestedEmpNum || undefined) : requestedEmpNum,
      contactEmail: effectiveEmail,
    });

    return NextResponse.json({
      ...result,
      requests: result.items,
      items: result.items,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { organizationId, user } = await requireTenantUser();
    const body = await req.json();

    const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
    const userAgent = req.headers.get("user-agent") || "";

    const result = await createLeaveRequest(
      {
        ...body,
        organizationId,
        contactEmail: body.contactEmail || user.email,
      },
      { ip, userAgent }
    );

    return NextResponse.json({
      success: true,
      leaveRequest: result.leaveRequest,
      accessToken: result.rawAccessToken,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

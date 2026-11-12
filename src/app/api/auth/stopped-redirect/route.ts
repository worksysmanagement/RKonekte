import { NextRequest, NextResponse } from "next/server";
import {
  clearSessionCookie,
  clearStoppedNoticeCookie,
  getSession,
  setStoppedNoticeCookie,
} from "@/lib/auth/session";
import { getOrganizationById } from "@/lib/services/organizations";
import { getUserById } from "@/lib/services/users";
import { resolveAppOrigin } from "@/lib/notifications/email";
import { isSubscriptionAccessBlocked } from "@/lib/utils/subscription";

export async function GET(req: NextRequest) {
  const origin = resolveAppOrigin(req.headers);
  const reason = req.nextUrl.searchParams.get("reason");
  const session = await getSession();

  if (reason === "inactive") {
    await clearStoppedNoticeCookie();
    await clearSessionCookie();
    return NextResponse.redirect(`${origin}/login?inactive=1`);
  }

  let isStoppedService = false;

  if (session && session.organizationId && session.role !== "SUPER_ADMIN") {
    try {
      const [org, liveUser] = await Promise.all([
        getOrganizationById(session.organizationId),
        getUserById(session.id).catch(() => null),
      ]);
      const effectiveRole = liveUser?.role || session.role;
      const isAdmin = effectiveRole === "ORGANIZATION_ADMIN";

      if (org && org.status === "ACTIVE" && isSubscriptionAccessBlocked(org)) {
        isStoppedService = true;
        await setStoppedNoticeCookie({
          purpose: "SERVICE_STOPPED_NOTICE",
          organizationId: org.id,
          organizationName: org.name,
          userId: session.id,
          userName: session.name,
          userEmail: session.email,
          isAdmin,
        });
      }
    } catch (_) {}
  }

  await clearSessionCookie();
  if (!isStoppedService) {
    await clearStoppedNoticeCookie();
    return NextResponse.redirect(`${origin}/login?inactive=1`);
  }
  return NextResponse.redirect(`${origin}/login?stopped=1`);
}

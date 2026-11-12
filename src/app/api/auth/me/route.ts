import { NextRequest, NextResponse } from "next/server";
import {
  clearSessionCookie,
  clearStoppedNoticeCookie,
  getSession,
  setSessionCookie,
  setStoppedNoticeCookie,
  StoppedNoticePayload,
} from "@/lib/auth/session";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { mapOrg } from "@/lib/supabase/db";
import { getDb } from "@/lib/db/client";
import { users, branches, organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  computeSubscriptionState,
  isSubscriptionAccessBlocked,
} from "@/lib/utils/subscription";
import { maybeSendSubscriptionReminders } from "@/lib/services/subscriptions";
import { buildStoppedClientContext } from "@/lib/services/stopped-context";
import { resolveAppOrigin } from "@/lib/notifications/email";
import { recordUserHeartbeat } from "@/lib/services/user-activity";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ authenticated: false, user: null });
  }

  let branchId = session.branchId || null;
  let branchName = session.branchName;
  let role = session.role;
  let org: any = null;
  let dbUserRecord: any = null;
  let dbReachable = false;
  let usedLocalFallback = false;

  // Dynamically resolve role, status, branchId, branchName and organization live state from DB
  try {
    const supabase = getSupabaseAdminClient();
    let dbUser: any = null;
    const { data: uData, error: uIdErr } = await supabase
      .from("users")
      .select("role, branch_id, status, password_hash")
      .eq("id", session.id)
      .maybeSingle();

    let userErr = uIdErr;
    if (uData) {
      dbUser = uData;
    } else if (!uIdErr && session.email) {
      const { data: uByEmail, error: uEmailErr } = await supabase
        .from("users")
        .select("role, branch_id, status, password_hash")
        .ilike("email", session.email.toLowerCase().trim())
        .maybeSingle();
      dbUser = uByEmail;
      userErr = uEmailErr;
    }

    if (dbUser) {
      dbUserRecord = dbUser;
      if (dbUser.role) role = dbUser.role;
      if (dbUser.branch_id !== undefined && dbUser.branch_id) branchId = dbUser.branch_id;
    }

    if (session.email && role !== "SUPER_ADMIN") {
      const { data: empData } = await supabase
        .from("employees")
        .select("branch_id, role")
        .ilike("email", session.email.toLowerCase().trim())
        .maybeSingle();
      if (empData) {
        if (empData.branch_id) branchId = empData.branch_id;
        if (empData.role && !dbUser?.role) role = empData.role;
      }
    }

    if (branchId) {
      const { data: bData } = await supabase
        .from("branches")
        .select("name")
        .eq("id", branchId)
        .maybeSingle();
      if (bData?.name) {
        branchName = bData.name;
      }
    } else {
      branchName = undefined;
    }

    let orgErr: any = null;
    if (session.organizationId && role !== "SUPER_ADMIN") {
      const { data: orgData, error: oErr } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", session.organizationId)
        .maybeSingle();
      orgErr = oErr;
      if (orgData) {
        org = mapOrg(orgData);
      }
    }

    if (!userErr && !orgErr) {
      dbReachable = true;
    }
  } catch (_) {
    usedLocalFallback = true;
    try {
      const db = getDb();
      const [u] = await db.select().from(users).where(eq(users.id, session.id)).limit(1);
      if (u) {
        dbUserRecord = u;
        if (u.role) role = u.role;
        branchId = u.branchId || null;
        if (branchId) {
          const [b] = await db.select().from(branches).where(eq(branches.id, branchId)).limit(1);
          if (b) branchName = b.name;
        }
      }
      if (session.organizationId && role !== "SUPER_ADMIN") {
        const [dbOrg] = await db
          .select()
          .from(organizations)
          .where(eq(organizations.id, session.organizationId))
          .limit(1);
        org = dbOrg || null;
      }
      dbReachable = true;
    } catch (_) {}
  }

  // Immediate disconnect if user account or organization is disabled / not yet activated
  const isUserInactive =
    role !== "SUPER_ADMIN" &&
    Boolean(dbUserRecord) &&
    (dbUserRecord.status !== "ACTIVE" ||
      dbUserRecord.password_hash === "NO_PASSWORD_SET" ||
      dbUserRecord.passwordHash === "NO_PASSWORD_SET");
  const isOrgInactive =
    role !== "SUPER_ADMIN" &&
    dbReachable &&
    Boolean(session.organizationId) &&
    (!org || org.status !== "ACTIVE");

  if (isUserInactive || isOrgInactive) {
    await clearSessionCookie();
    await clearStoppedNoticeCookie();
    return NextResponse.json({
      authenticated: false,
      serviceStopped: false,
      accountInactive: true,
      user: null,
    });
  }

  // Immediate disconnect if organization service was stopped by SuperAdmin OR subscription is expired
  if (
    session.organizationId &&
    role !== "SUPER_ADMIN" &&
    org &&
    isSubscriptionAccessBlocked(org)
  ) {
    await clearSessionCookie();
    const isAdmin = role === "ORGANIZATION_ADMIN";
    const noticePayload: StoppedNoticePayload = {
      purpose: "SERVICE_STOPPED_NOTICE",
      organizationId: org.id,
      organizationName: org.name,
      userId: session.id,
      userName: session.name,
      userEmail: session.email,
      isAdmin,
    };
    await setStoppedNoticeCookie(noticePayload);

    let stoppedContext: any = null;
    try {
      stoppedContext = await buildStoppedClientContext(noticePayload);
    } catch (_) {}

    return NextResponse.json({
      authenticated: false,
      serviceStopped: true,
      isAdmin,
      user: null,
      stoppedContext,
    });
  }

  const enrichedUser = {
    ...session,
    role,
    branchId,
    branchName,
  };

  if (role !== session.role || branchId !== session.branchId) {
    try {
      await setSessionCookie(enrichedUser);
    } catch (_) {}
  }

  let subscriptionSummary: any = null;
  if (session.organizationId && role === "ORGANIZATION_ADMIN" && org) {
    subscriptionSummary = computeSubscriptionState(org);
    if (
      subscriptionSummary.isExpired ||
      subscriptionSummary.serviceStopped ||
      subscriptionSummary.isAccessBlocked
    ) {
      await clearSessionCookie();
      return NextResponse.json({
        authenticated: false,
        serviceStopped: true,
        isAdmin: true,
        user: null,
      });
    }
    if (
      subscriptionSummary.daysRemaining !== null &&
      subscriptionSummary.daysRemaining <= 7 &&
      subscriptionSummary.daysRemaining >= 0
    ) {
      const origin = resolveAppOrigin(req.headers);
      maybeSendSubscriptionReminders(session.organizationId, origin).catch(() => {});
    }
  }

  await recordUserHeartbeat({
    userId: session.id,
    ...(usedLocalFallback ? { dbInstance: getDb() } : {}),
  });

  return NextResponse.json({
    authenticated: true,
    serviceStopped: false,
    user: enrichedUser,
    subscriptionSummary,
  });
}

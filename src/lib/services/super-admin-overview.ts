import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import {
  auditLogs,
  branches,
  employees,
  leaveRequests,
  organizations,
  subscriptionRenewals,
  users,
} from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import {
  computeSubscriptionState,
  SubscriptionStateSummary,
} from "@/lib/utils/subscription";
import {
  isTimestampInPeriod,
  PeriodFilter,
  resolvePeriodFilter,
} from "@/lib/utils/period-filter";
import { isUserOnlineNow } from "@/lib/services/user-activity";

export interface OverviewOrgInput {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  phone: string | null;
  status: string;
  activatedAt: number | null;
  lastRenewedAt: number | null;
  subscriptionExpiresAt: number | null;
  serviceStopped: boolean;
  serviceStoppedAt: number | null;
  createdAt: number;
}

export interface OverviewUserInput {
  id: string;
  organizationId: string | null;
  branchId: string | null;
  name: string;
  email: string;
  role: string;
  status: string;
  hasPassword: boolean;
  lastLoginAt: number | null;
  lastSeenAt: number | null;
  createdAt: number;
}

export interface OverviewEmployeeInput {
  id: string;
  organizationId: string;
  branchId: string | null;
  status: string;
  createdAt: number;
}

export interface OverviewLeaveRequestInput {
  id: string;
  organizationId: string;
  requestNumber: string;
  status: string;
  submittedAt: number;
}

export interface OverviewLoginEventInput {
  id: string;
  organizationId: string;
  userId: string | null;
  createdAt: number;
}

export interface OverviewPendingRenewalInput {
  id: string;
  organizationId: string;
  durationMonths: number;
  amountExpected: number;
  currency: string;
  paymentMethod: string;
  paymentReference: string | null;
  createdAt: number;
}

export interface SuperAdminOverviewOrgRow {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  phone: string | null;
  status: "ACTIVE" | "DISABLED" | string;
  createdAt: number;
  activatedAt: number | null;
  lastRenewedAt: number | null;
  subscriptionExpiresAt: number | null;
  serviceStopped: boolean;
  adminName: string;
  adminEmail: string | null;
  hasAdminPassword: boolean;
  passwordStatus: "CONFIGURED" | "NO_PASSWORD_SET";
  userCount: number;
  activeUserCount: number;
  connectedUserCount: number;
  connectedInPeriodUserCount: number;
  onlineUserCount: number;
  noPasswordUserCount: number;
  usersCreatedInPeriod: number;
  employeeCount: number;
  activeEmployeeCount: number;
  employeesCreatedInPeriod: number;
  requestCount: number;
  approvedRequestCount: number;
  lastLoginAt: number | null;
  lastSeenAt: number | null;
  isOnlineNow: boolean;
  hasConnectedEver: boolean;
  hasConnectedInPeriod: boolean;
  matchesPeriodActivity: boolean;
  subscriptionState: SubscriptionStateSummary;
  badgeJLabel: string | null;
  pendingRenewal: OverviewPendingRenewalInput | null;
}

export interface SuperAdminRecentRequestRow {
  id: string;
  requestNumber: string;
  status: string;
  submittedAt: number;
  organizationId: string;
  organizationName: string;
}

export interface SuperAdminOverviewKpis {
  totalOrganizations: number;
  activeOrganizations: number;
  disabledOrganizations: number;
  totalOrganizationsAll: number;
  activeOrganizationsAll: number;
  disabledOrganizationsAll: number;

  withoutPasswordOrgsCount: number;
  withoutPasswordOrgsAllCount: number;
  usersWithoutPasswordCount: number;
  usersWithoutPasswordAllCount: number;

  connectedOrgsCount: number;
  connectedOrgsAllCount: number;
  connectedUsersCount: number;
  connectedUsersAllCount: number;
  onlineOrgsNowCount: number;
  onlineUsersNowCount: number;
  neverLoggedInWithPasswordOrgsCount: number;

  totalUsersAll: number;
  activeUsersAll: number;
  usersInPeriodCount: number;
  totalEmployeesAll: number;
  activeEmployeesAll: number;
  employeesInPeriodCount: number;

  expiringSoonOrgsCount: number;
  expiringSoonInPeriodCount: number;
  expiredOrStoppedOrgsCount: number;
  pendingRenewalsCount: number;

  totalRequests: number;
  approvedRequests: number;
  pendingRequests: number;
  rejectedRequests: number;
  totalRequestsAll: number;
}

export interface SuperAdminOverviewResult {
  // Backward-compatible top-level counters
  totalOrganizations: number;
  activeOrganizations: number;
  disabledOrganizations: number;
  approvedRequests: number;
  totalRequests: number;
  recentRequests: SuperAdminRecentRequestRow[];

  // Enriched dashboard structure
  filter: PeriodFilter;
  generatedAt: number;
  kpis: SuperAdminOverviewKpis;
  organizations: SuperAdminOverviewOrgRow[];
  lists: {
    organizationsInPeriod: SuperAdminOverviewOrgRow[];
    withoutPasswordOrgs: SuperAdminOverviewOrgRow[];
    withoutPasswordOrgsAll: SuperAdminOverviewOrgRow[];
    connectedOrgs: SuperAdminOverviewOrgRow[];
    connectedOrgsAll: SuperAdminOverviewOrgRow[];
    onlineOrgsNow: SuperAdminOverviewOrgRow[];
    expiringSoonOrgs: SuperAdminOverviewOrgRow[];
    expiredOrStoppedOrgs: SuperAdminOverviewOrgRow[];
    recentRequests: SuperAdminRecentRequestRow[];
  };
}

export function computeSuperAdminOverviewData(params: {
  organizations: OverviewOrgInput[];
  users: OverviewUserInput[];
  employees: OverviewEmployeeInput[];
  leaveRequests: OverviewLeaveRequestInput[];
  loginEvents: OverviewLoginEventInput[];
  pendingRenewals: OverviewPendingRenewalInput[];
  filter?: PeriodFilter;
  nowMs?: number;
}): SuperAdminOverviewResult {
  const nowMs = params.nowMs ?? Date.now();
  const filter = params.filter ?? resolvePeriodFilter({ period: "all" }, nowMs);

  // Exclude platform SUPER_ADMIN accounts from tenant metrics
  const tenantUsers = params.users.filter(
    (u) => u.role !== "SUPER_ADMIN" && Boolean(u.organizationId)
  );

  // Index users, employees, requests, login events, renewals by organizationId
  const usersByOrg = new Map<string, OverviewUserInput[]>();
  for (const u of tenantUsers) {
    if (!u.organizationId) continue;
    const arr = usersByOrg.get(u.organizationId) || [];
    arr.push(u);
    usersByOrg.set(u.organizationId, arr);
  }

  const employeesByOrg = new Map<string, OverviewEmployeeInput[]>();
  for (const emp of params.employees) {
    const arr = employeesByOrg.get(emp.organizationId) || [];
    arr.push(emp);
    employeesByOrg.set(emp.organizationId, arr);
  }

  const requestsByOrg = new Map<string, OverviewLeaveRequestInput[]>();
  for (const req of params.leaveRequests) {
    const arr = requestsByOrg.get(req.organizationId) || [];
    arr.push(req);
    requestsByOrg.set(req.organizationId, arr);
  }

  const loginEventsByOrg = new Map<string, OverviewLoginEventInput[]>();
  for (const ev of params.loginEvents) {
    const arr = loginEventsByOrg.get(ev.organizationId) || [];
    arr.push(ev);
    loginEventsByOrg.set(ev.organizationId, arr);
  }

  const pendingRenewalByOrg = new Map<string, OverviewPendingRenewalInput>();
  for (const ren of params.pendingRenewals) {
    const existing = pendingRenewalByOrg.get(ren.organizationId);
    if (!existing || ren.createdAt > existing.createdAt) {
      pendingRenewalByOrg.set(ren.organizationId, ren);
    }
  }

  const orgNameById = new Map<string, string>();
  for (const o of params.organizations) {
    orgNameById.set(o.id, o.name);
  }

  // Distinct user IDs that logged in during period (from USER_LOGIN events + user.lastLoginAt)
  const loggedInUsersInPeriodGlobal = new Set<string>();
  const loggedInUsersAllGlobal = new Set<string>();

  const orgRows: SuperAdminOverviewOrgRow[] = params.organizations.map((org) => {
    const orgUsers = usersByOrg.get(org.id) || [];
    const orgEmployees = employeesByOrg.get(org.id) || [];
    const orgRequestsAll = requestsByOrg.get(org.id) || [];
    const orgLoginEvents = loginEventsByOrg.get(org.id) || [];

    // Primary admin selection (prefer ORGANIZATION_ADMIN, fallback first user)
    const adminCandidates = orgUsers.filter((u) => u.role === "ORGANIZATION_ADMIN");
    const primaryAdmin = adminCandidates[0] || orgUsers[0] || null;

    // An organization has its admin password set when at least one ORGANIZATION_ADMIN (or primary user) has a configured password
    const hasAdminPassword =
      adminCandidates.length > 0
        ? adminCandidates.some((u) => u.hasPassword)
        : orgUsers.length > 0
        ? orgUsers.some((u) => u.hasPassword)
        : false;

    const orgLoginEventsByUser = new Map<string, number[]>();
    let maxLoginFromEvents: number | null = null;
    for (const ev of orgLoginEvents) {
      if (maxLoginFromEvents === null || ev.createdAt > maxLoginFromEvents) {
        maxLoginFromEvents = ev.createdAt;
      }
      if (ev.userId) {
        const list = orgLoginEventsByUser.get(ev.userId) || [];
        list.push(ev.createdAt);
        orgLoginEventsByUser.set(ev.userId, list);
      }
    }

    let maxLastLoginAt: number | null = maxLoginFromEvents;
    let maxLastSeenAt: number | null = null;
    let activeUserCount = 0;
    let connectedUserCount = 0;
    let connectedInPeriodUserCount = 0;
    let onlineUserCount = 0;
    let noPasswordUserCount = 0;
    let usersCreatedInPeriod = 0;

    for (const u of orgUsers) {
      if (u.status === "ACTIVE") activeUserCount++;
      if (!u.hasPassword) noPasswordUserCount++;
      if (isTimestampInPeriod(u.createdAt, filter)) usersCreatedInPeriod++;

      const userEventTimestamps = orgLoginEventsByUser.get(u.id) || [];
      const userEffectiveLastLogin =
        u.lastLoginAt ??
        (userEventTimestamps.length > 0 ? Math.max(...userEventTimestamps) : null);

      if (userEffectiveLastLogin != null) {
        connectedUserCount++;
        loggedInUsersAllGlobal.add(u.id);
        if (maxLastLoginAt === null || userEffectiveLastLogin > maxLastLoginAt) {
          maxLastLoginAt = userEffectiveLastLogin;
        }
      }

      const loggedInDuringPeriod =
        filter.mode === "all"
          ? userEffectiveLastLogin != null
          : isTimestampInPeriod(u.lastLoginAt, filter) ||
            userEventTimestamps.some((ts) => isTimestampInPeriod(ts, filter));

      if (loggedInDuringPeriod) {
        connectedInPeriodUserCount++;
        loggedInUsersInPeriodGlobal.add(u.id);
      }

      if (u.lastSeenAt != null) {
        if (maxLastSeenAt === null || u.lastSeenAt > maxLastSeenAt) {
          maxLastSeenAt = u.lastSeenAt;
        }
        if (isUserOnlineNow(u.lastSeenAt, nowMs)) {
          onlineUserCount++;
        }
      }
    }

    const activeEmployeeCount = orgEmployees.filter((e) => e.status === "ACTIVE").length;
    const employeesCreatedInPeriod = orgEmployees.filter((e) =>
      isTimestampInPeriod(e.createdAt, filter)
    ).length;

    const orgRequestsInPeriod = orgRequestsAll.filter((r) =>
      isTimestampInPeriod(r.submittedAt, filter)
    );
    const approvedRequestCount = orgRequestsInPeriod.filter(
      (r) => r.status === "APPROVED"
    ).length;

    const subscriptionState = computeSubscriptionState(org, nowMs);
    const badgeJLabel =
      subscriptionState.phase === "EXPIRING_SOON" &&
      subscriptionState.daysRemaining !== null &&
      subscriptionState.daysRemaining >= 0 &&
      subscriptionState.daysRemaining <= 7
        ? `J-${subscriptionState.daysRemaining}`
        : null;

    const hasConnectedEver = hasAdminPassword && (connectedUserCount > 0 || maxLoginFromEvents !== null);
    const hasConnectedInPeriod =
      hasAdminPassword &&
      (filter.mode === "all"
        ? hasConnectedEver
        : connectedInPeriodUserCount > 0 ||
          orgLoginEvents.some((ev) => isTimestampInPeriod(ev.createdAt, filter)));

    const orgCreatedInPeriod = isTimestampInPeriod(org.createdAt, filter);
    const matchesPeriodActivity =
      filter.mode === "all" ||
      orgCreatedInPeriod ||
      hasConnectedInPeriod ||
      usersCreatedInPeriod > 0 ||
      employeesCreatedInPeriod > 0 ||
      orgRequestsInPeriod.length > 0;

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      email: org.email,
      phone: org.phone,
      status: org.status,
      createdAt: org.createdAt,
      activatedAt: org.activatedAt,
      lastRenewedAt: org.lastRenewedAt,
      subscriptionExpiresAt: org.subscriptionExpiresAt,
      serviceStopped: org.serviceStopped,
      adminName: primaryAdmin?.name || "Administrateur",
      adminEmail: primaryAdmin?.email || org.email || null,
      hasAdminPassword,
      passwordStatus: hasAdminPassword ? "CONFIGURED" : "NO_PASSWORD_SET",
      userCount: orgUsers.length,
      activeUserCount,
      connectedUserCount,
      connectedInPeriodUserCount,
      onlineUserCount,
      noPasswordUserCount,
      usersCreatedInPeriod,
      employeeCount: orgEmployees.length,
      activeEmployeeCount,
      employeesCreatedInPeriod,
      requestCount: orgRequestsInPeriod.length,
      approvedRequestCount,
      lastLoginAt: maxLastLoginAt,
      lastSeenAt: maxLastSeenAt,
      isOnlineNow: onlineUserCount > 0,
      hasConnectedEver,
      hasConnectedInPeriod,
      matchesPeriodActivity,
      subscriptionState,
      badgeJLabel,
      pendingRenewal: pendingRenewalByOrg.get(org.id) || null,
    };
  });

  // Period-filtered lists & KPI counts
  const organizationsInPeriod = orgRows.filter((o) =>
    isTimestampInPeriod(o.createdAt, filter)
  );
  const withoutPasswordOrgsAll = orgRows.filter((o) => !o.hasAdminPassword);
  const withoutPasswordOrgs = organizationsInPeriod.filter(
    (o) => !o.hasAdminPassword
  );

  const connectedOrgsAll = orgRows
    .filter((o) => o.hasConnectedEver)
    .sort((a, b) => (b.lastLoginAt || 0) - (a.lastLoginAt || 0));
  const connectedOrgs = orgRows
    .filter((o) => o.hasConnectedInPeriod)
    .sort((a, b) => (b.lastLoginAt || 0) - (a.lastLoginAt || 0));

  const onlineOrgsNow = orgRows
    .filter((o) => o.isOnlineNow)
    .sort((a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0));

  const expiringSoonOrgs = orgRows
    .filter((o) => o.subscriptionState.phase === "EXPIRING_SOON")
    .sort(
      (a, b) =>
        (a.subscriptionState.daysRemaining ?? 99) -
        (b.subscriptionState.daysRemaining ?? 99)
    );

  const expiringSoonInPeriodCount =
    filter.mode === "all"
      ? expiringSoonOrgs.length
      : expiringSoonOrgs.filter((o) =>
          isTimestampInPeriod(o.subscriptionExpiresAt, filter)
        ).length;

  const expiredOrStoppedOrgs = orgRows
    .filter(
      (o) =>
        o.subscriptionState.phase === "EXPIRED" ||
        o.subscriptionState.phase === "SERVICE_STOPPED"
    )
    .sort(
      (a, b) =>
        (a.subscriptionState.daysRemaining ?? -999) -
        (b.subscriptionState.daysRemaining ?? -999)
    );

  const neverLoggedInWithPasswordOrgsCount = orgRows.filter(
    (o) => o.hasAdminPassword && !o.hasConnectedEver
  ).length;

  const usersWithoutPasswordAllCount = tenantUsers.filter((u) => !u.hasPassword).length;
  const usersWithoutPasswordCount = tenantUsers.filter(
    (u) => !u.hasPassword && isTimestampInPeriod(u.createdAt, filter)
  ).length;

  const usersInPeriodCount = tenantUsers.filter((u) =>
    isTimestampInPeriod(u.createdAt, filter)
  ).length;

  const employeesInPeriodCount = params.employees.filter((e) =>
    isTimestampInPeriod(e.createdAt, filter)
  ).length;

  const onlineUsersNowCount = tenantUsers.filter((u) =>
    isUserOnlineNow(u.lastSeenAt, nowMs)
  ).length;

  const requestsInPeriod = params.leaveRequests
    .filter((r) => isTimestampInPeriod(r.submittedAt, filter))
    .sort((a, b) => b.submittedAt - a.submittedAt);

  const recentRequests: SuperAdminRecentRequestRow[] = requestsInPeriod
    .slice(0, 20)
    .map((r) => ({
      id: r.id,
      requestNumber: r.requestNumber,
      status: r.status,
      submittedAt: r.submittedAt,
      organizationId: r.organizationId,
      organizationName: orgNameById.get(r.organizationId) || "Entreprise",
    }));

  const approvedRequestsCount = requestsInPeriod.filter(
    (r) => r.status === "APPROVED"
  ).length;
  const pendingRequestsCount = requestsInPeriod.filter(
    (r) => r.status === "PENDING"
  ).length;
  const rejectedRequestsCount = requestsInPeriod.filter(
    (r) => r.status === "REJECTED"
  ).length;

  const kpis: SuperAdminOverviewKpis = {
    totalOrganizations: organizationsInPeriod.length,
    activeOrganizations: organizationsInPeriod.filter((o) => o.status === "ACTIVE").length,
    disabledOrganizations: organizationsInPeriod.filter((o) => o.status === "DISABLED").length,
    totalOrganizationsAll: orgRows.length,
    activeOrganizationsAll: orgRows.filter((o) => o.status === "ACTIVE").length,
    disabledOrganizationsAll: orgRows.filter((o) => o.status === "DISABLED").length,

    withoutPasswordOrgsCount: withoutPasswordOrgs.length,
    withoutPasswordOrgsAllCount: withoutPasswordOrgsAll.length,
    usersWithoutPasswordCount,
    usersWithoutPasswordAllCount,

    connectedOrgsCount: connectedOrgs.length,
    connectedOrgsAllCount: connectedOrgsAll.length,
    connectedUsersCount: loggedInUsersInPeriodGlobal.size,
    connectedUsersAllCount: loggedInUsersAllGlobal.size,
    onlineOrgsNowCount: onlineOrgsNow.length,
    onlineUsersNowCount,
    neverLoggedInWithPasswordOrgsCount,

    totalUsersAll: tenantUsers.length,
    activeUsersAll: tenantUsers.filter((u) => u.status === "ACTIVE").length,
    usersInPeriodCount,
    totalEmployeesAll: params.employees.length,
    activeEmployeesAll: params.employees.filter((e) => e.status === "ACTIVE").length,
    employeesInPeriodCount,

    expiringSoonOrgsCount: expiringSoonOrgs.length,
    expiringSoonInPeriodCount,
    expiredOrStoppedOrgsCount: expiredOrStoppedOrgs.length,
    pendingRenewalsCount: pendingRenewalByOrg.size,

    totalRequests: requestsInPeriod.length,
    approvedRequests: approvedRequestsCount,
    pendingRequests: pendingRequestsCount,
    rejectedRequests: rejectedRequestsCount,
    totalRequestsAll: params.leaveRequests.length,
  };

  return {
    totalOrganizations: kpis.totalOrganizations,
    activeOrganizations: kpis.activeOrganizations,
    disabledOrganizations: kpis.disabledOrganizations,
    approvedRequests: kpis.approvedRequests,
    totalRequests: kpis.totalRequests,
    recentRequests: recentRequests.slice(0, 5),

    filter,
    generatedAt: nowMs,
    kpis,
    organizations: orgRows,
    lists: {
      organizationsInPeriod,
      withoutPasswordOrgs,
      withoutPasswordOrgsAll,
      connectedOrgs,
      connectedOrgsAll,
      onlineOrgsNow,
      expiringSoonOrgs,
      expiredOrStoppedOrgs,
      recentRequests,
    },
  };
}

/**
 * Fetches full platform data from Supabase (default) or local Drizzle DB (`dbInstance` for tests)
 * and computes the SuperAdmin overview payload.
 */
export async function getSuperAdminOverview(
  filterInput?: {
    period?: string | null;
    date?: string | null;
    month?: string | null;
    year?: string | null;
  },
  dbInstance?: any,
  nowMs: number = Date.now()
): Promise<SuperAdminOverviewResult> {
  const filter = resolvePeriodFilter(filterInput, nowMs);

  if (dbInstance) {
    const [orgRows, userRows, empRows, reqRows, loginAuditRows, pendingRenewalRows] =
      await Promise.all([
        dbInstance.select().from(organizations).orderBy(desc(organizations.createdAt)),
        dbInstance
          .select({
            id: users.id,
            organizationId: users.organizationId,
            branchId: users.branchId,
            name: users.name,
            email: users.email,
            role: users.role,
            status: users.status,
            passwordHash: users.passwordHash,
            lastLoginAt: users.lastLoginAt,
            lastSeenAt: users.lastSeenAt,
            createdAt: users.createdAt,
          })
          .from(users),
        dbInstance
          .select({
            id: employees.id,
            organizationId: employees.organizationId,
            branchId: employees.branchId,
            status: employees.status,
            createdAt: employees.createdAt,
          })
          .from(employees),
        dbInstance
          .select({
            id: leaveRequests.id,
            organizationId: leaveRequests.organizationId,
            requestNumber: leaveRequests.requestNumber,
            status: leaveRequests.status,
            submittedAt: leaveRequests.submittedAt,
          })
          .from(leaveRequests)
          .orderBy(desc(leaveRequests.submittedAt)),
        dbInstance
          .select({
            id: auditLogs.id,
            organizationId: auditLogs.organizationId,
            userId: auditLogs.userId,
            createdAt: auditLogs.createdAt,
          })
          .from(auditLogs)
          .where(eq(auditLogs.action, "USER_LOGIN" as any)),
        dbInstance
          .select({
            id: subscriptionRenewals.id,
            organizationId: subscriptionRenewals.organizationId,
            durationMonths: subscriptionRenewals.durationMonths,
            amountExpected: subscriptionRenewals.amountExpected,
            currency: subscriptionRenewals.currency,
            paymentMethod: subscriptionRenewals.paymentMethod,
            paymentReference: subscriptionRenewals.paymentReference,
            createdAt: subscriptionRenewals.createdAt,
          })
          .from(subscriptionRenewals)
          .where(eq(subscriptionRenewals.status, "PENDING")),
      ]);

    return computeSuperAdminOverviewData({
      organizations: (orgRows || []).map((o: any) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        email: o.email ?? null,
        phone: o.phone ?? null,
        status: o.status,
        activatedAt: o.activatedAt != null ? Number(o.activatedAt) : null,
        lastRenewedAt: o.lastRenewedAt != null ? Number(o.lastRenewedAt) : null,
        subscriptionExpiresAt:
          o.subscriptionExpiresAt != null ? Number(o.subscriptionExpiresAt) : null,
        serviceStopped: Boolean(o.serviceStopped),
        serviceStoppedAt:
          o.serviceStoppedAt != null ? Number(o.serviceStoppedAt) : null,
        createdAt: Number(o.createdAt),
      })),
      users: (userRows || []).map((u: any) => ({
        id: u.id,
        organizationId: u.organizationId ?? null,
        branchId: u.branchId ?? null,
        name: u.name,
        email: u.email,
        role: u.role,
        status: u.status,
        hasPassword: Boolean(u.passwordHash && u.passwordHash !== "NO_PASSWORD_SET"),
        lastLoginAt: u.lastLoginAt != null ? Number(u.lastLoginAt) : null,
        lastSeenAt: u.lastSeenAt != null ? Number(u.lastSeenAt) : null,
        createdAt: Number(u.createdAt),
      })),
      employees: (empRows || []).map((e: any) => ({
        id: e.id,
        organizationId: e.organizationId,
        branchId: e.branchId ?? null,
        status: e.status,
        createdAt: Number(e.createdAt),
      })),
      leaveRequests: (reqRows || []).map((r: any) => ({
        id: r.id,
        organizationId: r.organizationId,
        requestNumber: r.requestNumber,
        status: r.status,
        submittedAt: Number(r.submittedAt),
      })),
      loginEvents: (loginAuditRows || []).map((l: any) => ({
        id: l.id,
        organizationId: l.organizationId,
        userId: l.userId ?? null,
        createdAt: Number(l.createdAt),
      })),
      pendingRenewals: (pendingRenewalRows || []).map((ren: any) => ({
        id: ren.id,
        organizationId: ren.organizationId,
        durationMonths: Number(ren.durationMonths),
        amountExpected: Number(ren.amountExpected ?? 0),
        currency: ren.currency || "USD",
        paymentMethod: ren.paymentMethod,
        paymentReference: ren.paymentReference ?? null,
        createdAt: Number(ren.createdAt),
      })),
      filter,
      nowMs,
    });
  }

  // Production Supabase path
  const supabase = getSupabaseAdminClient();

  const [orgsRes, empsRes, reqsRes, loginsRes, renewalsRes] = await Promise.all([
    supabase
      .from("organizations")
      .select(
        "id, name, slug, email, phone, status, activated_at, last_renewed_at, subscription_expires_at, service_stopped, service_stopped_at, created_at"
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("employees")
      .select("id, organization_id, branch_id, status, created_at"),
    supabase
      .from("leave_requests")
      .select("id, organization_id, request_number, status, submitted_at")
      .order("submitted_at", { ascending: false }),
    supabase
      .from("audit_logs")
      .select("id, organization_id, user_id, created_at")
      .eq("action", "USER_LOGIN"),
    supabase
      .from("subscription_renewals")
      .select(
        "id, organization_id, duration_months, amount_expected, currency, payment_method, payment_reference, created_at"
      )
      .eq("status", "PENDING"),
  ]);

  if (orgsRes.error) {
    throw new Error(`Supabase error (organizations): ${orgsRes.error.message}`);
  }

  // Safely fetch users with activity columns (fallback if unmigrated schema cache)
  let usersRes: any = await supabase
    .from("users")
    .select(
      "id, organization_id, branch_id, name, email, role, status, password_hash, last_login_at, last_seen_at, created_at"
    );

  if (usersRes.error) {
    usersRes = await supabase
      .from("users")
      .select(
        "id, organization_id, branch_id, name, email, role, status, password_hash, created_at"
      );
  }
  if (usersRes.error) {
    usersRes = await supabase
      .from("users")
      .select("id, organization_id, name, email, role, status, password_hash, created_at");
  }
  if (usersRes.error) {
    throw new Error(`Supabase error (users): ${usersRes.error.message}`);
  }

  // Fallback for employees if branch_id missing on an older schema cache
  let empRowsData: any[] = (empsRes.data as any[]) || [];
  if (empsRes.error) {
    const empFallback = await supabase
      .from("employees")
      .select("id, organization_id, status, created_at");
    if (empFallback.error) {
      throw new Error(`Supabase error (employees): ${empFallback.error.message}`);
    }
    empRowsData = empFallback.data || [];
  }

  return computeSuperAdminOverviewData({
    organizations: (orgsRes.data || []).map((o: any) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      email: o.email ?? null,
      phone: o.phone ?? null,
      status: o.status,
      activatedAt: o.activated_at != null ? Number(o.activated_at) : null,
      lastRenewedAt: o.last_renewed_at != null ? Number(o.last_renewed_at) : null,
      subscriptionExpiresAt:
        o.subscription_expires_at != null ? Number(o.subscription_expires_at) : null,
      serviceStopped: Boolean(o.service_stopped),
      serviceStoppedAt:
        o.service_stopped_at != null ? Number(o.service_stopped_at) : null,
      createdAt: Number(o.created_at),
    })),
    users: (usersRes.data || []).map((u: any) => ({
      id: u.id,
      organizationId: u.organization_id ?? null,
      branchId: u.branch_id ?? null,
      name: u.name,
      email: u.email,
      role: u.role,
      status: u.status,
      hasPassword: Boolean(u.password_hash && u.password_hash !== "NO_PASSWORD_SET"),
      lastLoginAt: u.last_login_at != null ? Number(u.last_login_at) : null,
      lastSeenAt: u.last_seen_at != null ? Number(u.last_seen_at) : null,
      createdAt: Number(u.created_at),
    })),
    employees: empRowsData.map((e: any) => ({
      id: e.id,
      organizationId: e.organization_id,
      branchId: e.branch_id ?? null,
      status: e.status,
      createdAt: Number(e.created_at),
    })),
    leaveRequests: (reqsRes.data || []).map((r: any) => ({
      id: r.id,
      organizationId: r.organization_id,
      requestNumber: r.request_number,
      status: r.status,
      submittedAt: Number(r.submitted_at),
    })),
    loginEvents: (loginsRes.error ? [] : loginsRes.data || []).map((l: any) => ({
      id: l.id,
      organizationId: l.organization_id,
      userId: l.user_id ?? null,
      createdAt: Number(l.created_at),
    })),
    pendingRenewals: (renewalsRes.error ? [] : renewalsRes.data || []).map((ren: any) => ({
      id: ren.id,
      organizationId: ren.organization_id,
      durationMonths: Number(ren.duration_months),
      amountExpected: Number(ren.amount_expected ?? 0),
      currency: ren.currency || "USD",
      paymentMethod: ren.payment_method,
      paymentReference: ren.payment_reference ?? null,
      createdAt: Number(ren.created_at),
    })),
    filter,
    nowMs,
  });
}

export interface SuperAdminOrgDetailUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  branchId: string | null;
  branchName: string | null;
  hasPassword: boolean;
  lastLoginAt: number | null;
  lastSeenAt: number | null;
  isOnlineNow: boolean;
  createdAt: number;
}

export interface SuperAdminOrgDetailEmployee {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  department: string | null;
  position: string | null;
  phone: string;
  email: string | null;
  branchId: string | null;
  branchName: string | null;
  status: string;
  hasUserAccount: boolean;
  hasPassword: boolean;
  userRole: string | null;
  lastLoginAt: number | null;
  isOnlineNow: boolean;
  createdAt: number;
}

export interface SuperAdminOrganizationDetailsResult {
  organization: SuperAdminOverviewOrgRow;
  branches: Array<{ id: string; name: string; city: string; status: string }>;
  users: SuperAdminOrgDetailUser[];
  employees: SuperAdminOrgDetailEmployee[];
}

export async function getSuperAdminOrganizationDetails(
  organizationId: string,
  dbInstance?: any,
  nowMs: number = Date.now()
): Promise<SuperAdminOrganizationDetailsResult | null> {
  const overview = await getSuperAdminOverview({ period: "all" }, dbInstance, nowMs);
  const summaryOrg = overview.organizations.find((o) => o.id === organizationId);
  if (!summaryOrg) return null;

  let branchRows: Array<{ id: string; name: string; city: string; status: string }> = [];
  let rawUsers: OverviewUserInput[] = [];
  let rawEmployees: any[] = [];
  let loginEvents: Array<{ userId: string | null; createdAt: number }> = [];

  if (dbInstance) {
    const [bRows, uRows, eRows, lRows] = await Promise.all([
      dbInstance
        .select({
          id: branches.id,
          name: branches.name,
          city: branches.city,
          status: branches.status,
        })
        .from(branches)
        .where(eq(branches.organizationId, organizationId)),
      dbInstance
        .select({
          id: users.id,
          organizationId: users.organizationId,
          branchId: users.branchId,
          name: users.name,
          email: users.email,
          role: users.role,
          status: users.status,
          passwordHash: users.passwordHash,
          lastLoginAt: users.lastLoginAt,
          lastSeenAt: users.lastSeenAt,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.organizationId, organizationId))
        .orderBy(desc(users.createdAt)),
      dbInstance
        .select({
          id: employees.id,
          branchId: employees.branchId,
          employeeNumber: employees.employeeNumber,
          firstName: employees.firstName,
          lastName: employees.lastName,
          department: employees.department,
          position: employees.position,
          phone: employees.phone,
          email: employees.email,
          status: employees.status,
          createdAt: employees.createdAt,
        })
        .from(employees)
        .where(eq(employees.organizationId, organizationId))
        .orderBy(desc(employees.createdAt)),
      dbInstance
        .select({
          userId: auditLogs.userId,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.organizationId, organizationId),
            eq(auditLogs.action, "USER_LOGIN" as any)
          )
        ),
    ]);

    branchRows = bRows || [];
    rawUsers = (uRows || []).map((u: any) => ({
      id: u.id,
      organizationId: u.organizationId ?? null,
      branchId: u.branchId ?? null,
      name: u.name,
      email: u.email,
      role: u.role,
      status: u.status,
      hasPassword: Boolean(u.passwordHash && u.passwordHash !== "NO_PASSWORD_SET"),
      lastLoginAt: u.lastLoginAt != null ? Number(u.lastLoginAt) : null,
      lastSeenAt: u.lastSeenAt != null ? Number(u.lastSeenAt) : null,
      createdAt: Number(u.createdAt),
    }));
    rawEmployees = eRows || [];
    loginEvents = (lRows || []).map((l: any) => ({
      userId: l.userId ?? null,
      createdAt: Number(l.createdAt),
    }));
  } else {
    const supabase = getSupabaseAdminClient();
    const [bRes, eRes, lRes] = await Promise.all([
      supabase
        .from("branches")
        .select("id, name, city, status")
        .eq("organization_id", organizationId),
      supabase
        .from("employees")
        .select(
          "id, branch_id, employee_number, first_name, last_name, department, position, phone, email, status, created_at"
        )
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
      supabase
        .from("audit_logs")
        .select("user_id, created_at")
        .eq("organization_id", organizationId)
        .eq("action", "USER_LOGIN"),
    ]);

    let uRes: any = await supabase
      .from("users")
      .select(
        "id, organization_id, branch_id, name, email, role, status, password_hash, last_login_at, last_seen_at, created_at"
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    if (uRes.error) {
      uRes = await supabase
        .from("users")
        .select("id, organization_id, branch_id, name, email, role, status, password_hash, created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });
    }
    if (uRes.error) {
      uRes = await supabase
        .from("users")
        .select("id, organization_id, name, email, role, status, password_hash, created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });
    }

    branchRows = (bRes.data || []) as any[];
    rawUsers = (uRes.data || []).map((u: any) => ({
      id: u.id,
      organizationId: u.organization_id ?? null,
      branchId: u.branch_id ?? null,
      name: u.name,
      email: u.email,
      role: u.role,
      status: u.status,
      hasPassword: Boolean(u.password_hash && u.password_hash !== "NO_PASSWORD_SET"),
      lastLoginAt: u.last_login_at != null ? Number(u.last_login_at) : null,
      lastSeenAt: u.last_seen_at != null ? Number(u.last_seen_at) : null,
      createdAt: Number(u.created_at),
    }));
    rawEmployees = (eRes.data || []).map((e: any) => ({
      id: e.id,
      branchId: e.branch_id ?? null,
      employeeNumber: e.employee_number,
      firstName: e.first_name,
      lastName: e.last_name,
      department: e.department ?? null,
      position: e.position ?? null,
      phone: e.phone,
      email: e.email ?? null,
      status: e.status,
      createdAt: Number(e.created_at),
    }));
    loginEvents = (lRes.data || []).map((l: any) => ({
      userId: l.user_id ?? null,
      createdAt: Number(l.created_at),
    }));
  }

  const branchNameById = new Map<string, string>();
  for (const b of branchRows) {
    branchNameById.set(b.id, b.city ? `${b.name} (${b.city})` : b.name);
  }

  const maxLoginEventByUser = new Map<string, number>();
  for (const ev of loginEvents) {
    if (!ev.userId) continue;
    const prev = maxLoginEventByUser.get(ev.userId) || 0;
    if (ev.createdAt > prev) maxLoginEventByUser.set(ev.userId, ev.createdAt);
  }

  const detailUsers: SuperAdminOrgDetailUser[] = rawUsers
    .filter((u) => u.role !== "SUPER_ADMIN")
    .map((u) => {
      const effectiveLastLogin = u.lastLoginAt ?? maxLoginEventByUser.get(u.id) ?? null;
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        status: u.status,
        branchId: u.branchId,
        branchName: u.branchId ? branchNameById.get(u.branchId) || null : null,
        hasPassword: u.hasPassword,
        lastLoginAt: effectiveLastLogin,
        lastSeenAt: u.lastSeenAt,
        isOnlineNow: isUserOnlineNow(u.lastSeenAt, nowMs),
        createdAt: u.createdAt,
      };
    })
    .sort((a, b) => {
      if (a.isOnlineNow !== b.isOnlineNow) return a.isOnlineNow ? -1 : 1;
      if ((b.lastLoginAt || 0) !== (a.lastLoginAt || 0)) {
        return (b.lastLoginAt || 0) - (a.lastLoginAt || 0);
      }
      return b.createdAt - a.createdAt;
    });

  const userByEmail = new Map<string, SuperAdminOrgDetailUser>();
  for (const u of detailUsers) {
    userByEmail.set(u.email.toLowerCase().trim(), u);
  }

  const detailEmployees: SuperAdminOrgDetailEmployee[] = rawEmployees.map((emp) => {
    const linkedUser = emp.email
      ? userByEmail.get(String(emp.email).toLowerCase().trim()) || null
      : null;
    return {
      id: emp.id,
      employeeNumber: emp.employeeNumber,
      firstName: emp.firstName,
      lastName: emp.lastName,
      department: emp.department ?? null,
      position: emp.position ?? null,
      phone: emp.phone,
      email: emp.email ?? null,
      branchId: emp.branchId ?? null,
      branchName: emp.branchId ? branchNameById.get(emp.branchId) || null : null,
      status: emp.status,
      hasUserAccount: Boolean(linkedUser),
      hasPassword: Boolean(linkedUser?.hasPassword),
      userRole: linkedUser?.role || null,
      lastLoginAt: linkedUser?.lastLoginAt ?? null,
      isOnlineNow: Boolean(linkedUser?.isOnlineNow),
      createdAt: Number(emp.createdAt),
    };
  });

  return {
    organization: summaryOrg,
    branches: branchRows,
    users: detailUsers,
    employees: detailEmployees,
  };
}

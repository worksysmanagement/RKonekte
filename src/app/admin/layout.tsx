import { getSession, setSessionCookie } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { getUserById, getUserByEmail } from "@/lib/services/users";
import { getOrganizationById } from "@/lib/services/organizations";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { mapOrg } from "@/lib/supabase/db";
import { getDb } from "@/lib/db/client";
import { recordUserHeartbeat } from "@/lib/services/user-activity";
import {
  computeSubscriptionState,
  isSubscriptionAccessBlocked,
  SubscriptionStateSummary,
} from "@/lib/utils/subscription";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  let effectiveRole = session.role;
  let effectiveBranchId = session.branchId;
  let effectiveBranchName = session.branchName;
  let liveOrg: any = null;
  let liveUserRecord: any = null;
  let dbVerified = false;

  // Dynamically resolve live role, status, branch and organization from DB to immediately reflect changes without requiring logout
  if (session.id && session.role !== "SUPER_ADMIN") {
    try {
      const supabase = getSupabaseAdminClient();

      // 1. Fetch live user by id or email
      let liveUser: any = null;
      const { data: uData, error: uIdErr } = await supabase
        .from("users")
        .select("id, role, branch_id, email, status, password_hash")
        .eq("id", session.id)
        .maybeSingle();

      let userErr = uIdErr;
      if (uData) {
        liveUser = uData;
      } else if (!uIdErr && session.email) {
        const { data: uByEmail, error: uEmailErr } = await supabase
          .from("users")
          .select("id, role, branch_id, email, status, password_hash")
          .ilike("email", session.email.toLowerCase().trim())
          .maybeSingle();
        liveUser = uByEmail;
        userErr = uEmailErr;
      }

      if (liveUser) {
        liveUserRecord = liveUser;
        if (liveUser.role) effectiveRole = liveUser.role;
        if (liveUser.branch_id !== undefined && liveUser.branch_id) {
          effectiveBranchId = liveUser.branch_id;
        }
      }

      // 2. Also check employees table (by email) in case branch was set on employee record
      if (session.email) {
        const { data: empData } = await supabase
          .from("employees")
          .select("branch_id")
          .ilike("email", session.email.toLowerCase().trim())
          .maybeSingle();
        if (empData) {
          if (empData.branch_id) effectiveBranchId = empData.branch_id;
        }
      }

      // 3. Resolve live branch name for effectiveBranchId
      if (effectiveBranchId) {
        const { data: bData } = await supabase
          .from("branches")
          .select("name, city")
          .eq("id", effectiveBranchId)
          .maybeSingle();
        if (bData?.name) {
          effectiveBranchName = bData.name;
        }
      } else {
        effectiveBranchName = undefined;
      }

      // 4. Resolve live organization status & subscription state
      let orgErr: any = null;
      if (session.organizationId) {
        const { data: orgData, error: oErr } = await supabase
          .from("organizations")
          .select("*")
          .eq("id", session.organizationId)
          .maybeSingle();
        orgErr = oErr;
        if (orgData) {
          liveOrg = mapOrg(orgData);
        }
      }

      if (!userErr && !orgErr) {
        dbVerified = true;
      }

      // 5. Update session cookie if role, branchId or branchName changed so subsequent requests stay in sync
      if (
        effectiveRole !== session.role ||
        effectiveBranchId !== session.branchId ||
        effectiveBranchName !== session.branchName
      ) {
        try {
          await setSessionCookie({
            ...session,
            role: effectiveRole,
            branchId: effectiveBranchId,
            branchName: effectiveBranchName,
          });
        } catch (_) {}
      }
    } catch (_) {
      try {
        const localDb = getDb();
        const fallbackUser =
          (await getUserById(session.id, localDb)) ||
          (session.email ? await getUserByEmail(session.email, localDb) : null);
        if (fallbackUser) {
          liveUserRecord = fallbackUser;
          if (fallbackUser.role) effectiveRole = fallbackUser.role;
          if (fallbackUser.branchId) effectiveBranchId = fallbackUser.branchId;
        }
        if (session.organizationId) {
          liveOrg = await getOrganizationById(session.organizationId, localDb);
        }
        dbVerified = true;
      } catch (__) {}
    }
  }

  // Enforce immediate disconnect if account/organization is not active OR service is stopped/expired
  if (effectiveRole !== "SUPER_ADMIN") {
    const isUserInactive =
      Boolean(liveUserRecord) &&
      (liveUserRecord.status !== "ACTIVE" ||
        liveUserRecord.password_hash === "NO_PASSWORD_SET" ||
        liveUserRecord.passwordHash === "NO_PASSWORD_SET");
    const isOrgInactive =
      dbVerified &&
      Boolean(session.organizationId) &&
      (!liveOrg || liveOrg.status !== "ACTIVE");

    if (isUserInactive || isOrgInactive) {
      redirect("/api/auth/stopped-redirect?reason=inactive");
    }

    if (liveOrg && isSubscriptionAccessBlocked(liveOrg)) {
      redirect("/api/auth/stopped-redirect");
    }
  }

  await recordUserHeartbeat({ userId: session.id });

  let initialSubscriptionSummary: SubscriptionStateSummary | null = null;
  if (effectiveRole === "ORGANIZATION_ADMIN" && liveOrg) {
    initialSubscriptionSummary = computeSubscriptionState(liveOrg);
    if (
      initialSubscriptionSummary.isExpired ||
      initialSubscriptionSummary.serviceStopped ||
      initialSubscriptionSummary.isAccessBlocked
    ) {
      redirect("/api/auth/stopped-redirect");
    }
  }

  const orgName =
    liveOrg?.name ||
    session.organizationName ||
    (effectiveRole === "SUPER_ADMIN" ? "Super Administration" : "Mon Entreprise");

  return (
    <AdminShell
      role={effectiveRole as any}
      organizationName={orgName}
      userName={session.name}
      userEmail={session.email}
      userBranchId={effectiveBranchId}
      userBranchName={effectiveBranchName}
      initialSubscriptionSummary={initialSubscriptionSummary}
    >
      {children}
    </AdminShell>
  );
}

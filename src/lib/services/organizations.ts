import { getDb } from "@/lib/db/client";
import {
  organizations,
  users,
  leaveRequests,
  auditLogs,
  subscriptionRenewals,
  Organization,
  User,
} from "@/db/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { CreateOrganizationInput } from "@/lib/validation/schemas";
import { hashPassword } from "@/lib/auth/password";
import {
  sendEmail,
  resolveAppOrigin,
  generateCompanyApprovedEmail,
} from "@/lib/notifications/email";
import { supabaseDb } from "@/lib/supabase/db";
import {
  addCalendarMonths,
  computeSubscriptionState,
  isSubscriptionAccessBlocked,
} from "@/lib/utils/subscription";

export async function listActiveOrganizations(dbInstance?: any) {
  if (!dbInstance) {
    return await supabaseDb.organizations.listActive();
  }
  const db = dbInstance || getDb();
  const rows = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.status, "ACTIVE"), eq(organizations.serviceStopped, false)))
    .orderBy(organizations.name);

  return rows
    .filter((org: Organization) => !isSubscriptionAccessBlocked(org))
    .map((org: Organization) => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
      logoUrl: org.logoUrl,
    }));
}

export async function listAllOrganizationsForSuperAdmin(dbInstance?: any) {
  if (!dbInstance) {
    try {
      return await supabaseDb.organizations.listAllForSuperAdmin();
    } catch (e: any) {
      if (
        process.env.NODE_ENV === "test" ||
        process.env.VITEST ||
        !process.env.NEXT_PUBLIC_SUPABASE_URL ||
        !process.env.SUPABASE_SERVICE_ROLE_KEY
      ) {
        // Fall back to SQLite database
      } else {
        throw e;
      }
    }
  }
  const db = dbInstance || getDb();
  const orgs = await db.select().from(organizations).orderBy(desc(organizations.createdAt));

  // Augment with request counts and subscription details
  const results = await Promise.all(
    orgs.map(async (org: Organization) => {
      const [reqCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(leaveRequests)
        .where(eq(leaveRequests.organizationId, org.id));

      const [pendingCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(leaveRequests)
        .where(
          and(
            eq(leaveRequests.organizationId, org.id),
            eq(leaveRequests.status, "PENDING")
          )
        );

      const [admin] = await db
        .select({ email: users.email, name: users.name })
        .from(users)
        .where(and(eq(users.organizationId, org.id), eq(users.role, "ORGANIZATION_ADMIN")))
        .limit(1);

      const [pendingRenewal] = await db
        .select()
        .from(subscriptionRenewals)
        .where(
          and(
            eq(subscriptionRenewals.organizationId, org.id),
            eq(subscriptionRenewals.status, "PENDING")
          )
        )
        .orderBy(desc(subscriptionRenewals.createdAt))
        .limit(1);

      return {
        ...org,
        adminEmail: admin?.email || org.email,
        adminName: admin?.name || "Administrateur",
        requestCount: reqCount?.count || 0,
        pendingCount: pendingCount?.count || 0,
        subscriptionState: computeSubscriptionState(org),
        pendingRenewal: pendingRenewal || null,
      };
    })
  );

  return results;
}

export async function listPendingOnboardingRequests(dbInstance?: any) {
  if (!dbInstance) {
    return await supabaseDb.organizations.listPendingOnboarding();
  }
  const db = dbInstance || getDb();
  const disabledOrgs = await db
    .select()
    .from(organizations)
    .where(eq(organizations.status, "DISABLED"))
    .orderBy(desc(organizations.createdAt));

  const results = await Promise.all(
    disabledOrgs.map(async (org: any) => {
      const [admin] = await db
        .select()
        .from(users)
        .where(eq(users.organizationId, org.id))
        .limit(1);

      const [audit] = await db
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.organizationId, org.id), eq(auditLogs.action, "SUBMITTED")))
        .limit(1);

      let metadata: any = {};
      try {
        if (audit?.metadata) metadata = JSON.parse(audit.metadata);
      } catch (_) {}

      return {
        id: org.id,
        companyName: org.name,
        slug: org.slug,
        email: org.email,
        phone: org.phone,
        address: org.address,
        adminName: admin?.name || metadata.adminName || metadata.applicantName || "Responsable",
        adminEmail: admin?.email || metadata.adminEmail || metadata.companyEmail || org.email,
        applicantRole: metadata.applicantRole || "Responsable",
        employeeRange: metadata.employeeRange || metadata.estimatedEmployees || "Non spécifié",
        emailVerified: !!metadata.emailVerified,
        tempPassword: metadata.tempPassword || null,
        city: metadata.city || "Haïti",
        message: metadata.message || "",
        submittedAt: org.createdAt,
      };
    })
  );

  return results;
}

export async function approveOnboardingRequest(orgId: string, origin?: string, dbInstance?: any) {
  if (!dbInstance) {
    return await supabaseDb.organizations.approveOnboarding(orgId, origin);
  }
  const db = dbInstance || getDb();
  const now = Date.now();

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const [admin] = await db
    .select()
    .from(users)
    .where(eq(users.organizationId, orgId))
    .limit(1);

  const [audit] = await db
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.organizationId, orgId), eq(auditLogs.action, "SUBMITTED")))
    .limit(1);

  let metadata: any = {};
  try {
    if (audit?.metadata) metadata = JSON.parse(audit.metadata);
  } catch (_) {}

  // Activate organization and initialize 1st free month from activation
  await db
    .update(organizations)
    .set({
      status: "ACTIVE",
      activatedAt: now,
      subscriptionExpiresAt: addCalendarMonths(now, 1),
      serviceStopped: false,
      serviceStoppedAt: null,
      updatedAt: now,
    })
    .where(eq(organizations.id, orgId));

  // Activate organization admin users
  await db
    .update(users)
    .set({ status: "ACTIVE", updatedAt: now })
    .where(eq(users.organizationId, orgId));

  // Log approval
  await db.insert(auditLogs).values({
    id: `audit-${now}`,
    organizationId: orgId,
    userId: null,
    action: "APPROVED",
    oldStatus: "DISABLED",
    newStatus: "ACTIVE",
    metadata: JSON.stringify({ approvedBy: "SUPER_ADMIN", approvedAt: now }),
    createdAt: now,
  });

  const recipientEmail = admin?.email || org?.email || metadata.companyEmail;
  const tempPassword = metadata.tempPassword;
  const loginUrl = `${resolveAppOrigin(undefined, origin)}/login`;

  if (recipientEmail && tempPassword) {
    try {
      const { subject, html, text } = generateCompanyApprovedEmail({
        recipientName: admin?.name || "Responsable",
        companyName: org?.name || "Entreprise",
        email: recipientEmail,
        tempPassword,
        loginUrl,
      });

      await sendEmail({
        to: recipientEmail,
        subject,
        html,
        text,
      });
    } catch (e) {
      console.error("Failed to send activation email:", e);
    }
  }

  return {
    success: true,
    credentials: {
      companyName: org?.name || "Entreprise",
      email: recipientEmail,
      tempPassword: tempPassword || null,
    },
  };
}

export async function rejectOnboardingRequest(orgId: string, reason: string, dbInstance?: any) {
  if (!dbInstance) {
    return await supabaseDb.organizations.rejectOnboarding(orgId, reason);
  }
  const db = dbInstance || getDb();
  const now = Date.now();

  // Log rejection
  await db.insert(auditLogs).values({
    id: `audit-${now}`,
    organizationId: orgId,
    userId: null,
    action: "REJECTED",
    oldStatus: "DISABLED",
    newStatus: "REJECTED",
    metadata: JSON.stringify({ rejectedBy: "SUPER_ADMIN", reason, rejectedAt: now }),
    createdAt: now,
  });

  // Delete disabled organization and users
  await db.delete(users).where(eq(users.organizationId, orgId));
  await db.delete(organizations).where(eq(organizations.id, orgId));

  return { success: true };
}

export async function getSuperAdminPlatformStats(dbInstance?: any) {
  const { getSuperAdminOverview } = await import("@/lib/services/super-admin-overview");
  return await getSuperAdminOverview({ period: "all" }, dbInstance);
}

export async function createOrganizationWithAdmin(
  input: CreateOrganizationInput,
  dbInstance?: any
): Promise<{ organization: Organization; adminUser: User }> {
  if (!dbInstance) {
    return await supabaseDb.organizations.createWithAdmin(input);
  }
  const db = dbInstance || getDb();
  const now = Date.now();

  const [existingSlug] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, input.slug))
    .limit(1);

  if (existingSlug) {
    throw new Error("Une entreprise avec ce slug existe déjà");
  }

  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, input.adminEmail.toLowerCase()))
    .limit(1);

  if (existingUser) {
    throw new Error("Un utilisateur avec cette adresse email existe déjà");
  }

  const orgId = `org-${crypto.randomUUID()}`;
  const userId = `usr-${crypto.randomUUID()}`;
  const passwordHash = await hashPassword(input.adminPassword);

  await db.insert(organizations).values({
    id: orgId,
    name: input.name,
    slug: input.slug.toLowerCase(),
    logoUrl: input.logoUrl || null,
    email: input.email || null,
    phone: input.phone || null,
    address: input.address || null,
    status: "ACTIVE",
    activatedAt: now,
    subscriptionExpiresAt: addCalendarMonths(now, 1),
    serviceStopped: false,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(users).values({
    id: userId,
    organizationId: orgId,
    name: input.adminName,
    email: input.adminEmail.toLowerCase(),
    passwordHash,
    role: "ORGANIZATION_ADMIN",
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  });

  const [organization] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  const [adminUser] = await db.select().from(users).where(eq(users.id, userId));

  return { organization, adminUser };
}

export async function updateOrganizationStatus(
  id: string,
  status: "ACTIVE" | "DISABLED",
  dbInstance?: any
) {
  if (!dbInstance) {
    return await supabaseDb.organizations.updateStatus(id, status);
  }
  const db = dbInstance || getDb();
  await db
    .update(organizations)
    .set({ status, updatedAt: Date.now() })
    .where(eq(organizations.id, id));
}

export async function updateOrganizationPreferences(
  id: string,
  preferences: {
    name?: string;
    logoUrl?: string | null;
    matriculeFormat?: string;
    matriculePrefix?: string | null;
    primaryCurrency?: string;
    dateFormat?: string;
    language?: string;
  },
  dbInstance?: any
): Promise<Organization> {
  if (!dbInstance) {
    return await supabaseDb.organizations.updatePreferences(id, preferences);
  }
  const db = dbInstance || getDb();
  const updatePayload: any = { updatedAt: Date.now() };
  if (preferences.name !== undefined) updatePayload.name = preferences.name;
  if (preferences.logoUrl !== undefined) updatePayload.logoUrl = preferences.logoUrl;
  if (preferences.matriculeFormat !== undefined) updatePayload.matriculeFormat = preferences.matriculeFormat;
  if (preferences.matriculePrefix !== undefined) updatePayload.matriculePrefix = preferences.matriculePrefix;
  if (preferences.primaryCurrency !== undefined) updatePayload.primaryCurrency = preferences.primaryCurrency;
  if (preferences.dateFormat !== undefined) updatePayload.dateFormat = preferences.dateFormat;
  if (preferences.language !== undefined) updatePayload.language = preferences.language;

  await db
    .update(organizations)
    .set(updatePayload)
    .where(eq(organizations.id, id));

  const updated = await getOrganizationById(id, dbInstance);
  if (!updated) throw new Error("Organisation introuvable.");
  return updated;
}

export async function getOrganizationById(id: string, dbInstance?: any): Promise<Organization | null> {
  if (!dbInstance) {
    return await supabaseDb.organizations.getById(id);
  }
  const db = dbInstance || getDb();
  const [org] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
  return org || null;
}

export async function getOrganizationBySlug(slug: string, dbInstance?: any): Promise<Organization | null> {
  if (!dbInstance) {
    return await supabaseDb.organizations.getBySlug(slug);
  }
  const db = dbInstance || getDb();
  const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug.toLowerCase())).limit(1);
  return org || null;
}
